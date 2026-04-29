import asyncio
import json
import ollama
import chromadb
import uuid
import re
from neo4j import GraphDatabase
from sentence_transformers import SentenceTransformer
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Global queue to hold chat payloads
chat_queue: asyncio.Queue = asyncio.Queue()

# Initialize ChromaDB
chroma_client = chromadb.PersistentClient(path="./chroma_data")
collection = chroma_client.get_or_create_collection(name="knowledge_nodes")

# Initialize Embedding Model
model = SentenceTransformer('all-MiniLM-L6-v2')

# Initialize Neo4j Driver
neo4j_driver = GraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "password1234"))

# Pydantic model for the chat payload
class ChatPayload(BaseModel):
    platform: str
    conversation_id: str
    timestamp: str
    user_prompt: str
    ai_response: str

class QuestionPayload(BaseModel):
    question: str

class EditNodePayload(BaseModel):
    name: str
    summary: str

def sanitize_rel_type(rel_string: str) -> str:
    # Convert "is a foundation of" to "IS_A_FOUNDATION_OF"
    sanitized = re.sub(r'[^a-zA-Z0-9\s]', '', rel_string)
    return sanitized.strip().replace(' ', '_').upper()

# Background worker function
async def process_queue():
    print("Background worker started...")
    
    agent1_system_prompt = """You are a Knowledge Graph Extractor. Read the ChatPayload and output a JSON object with exactly two keys:
1. "nodes": an array of objects containing "label" (the topic) and "summary" (2-3 sentences).
2. "edges": an array of objects containing "from", "to", and "relationship".
Ensure the output is strictly valid JSON."""

    agent2_system_prompt = """You are Agent 2: The Graph Keeper. You receive a candidate node and its 10 most similar nodes from the existing knowledge graph.
Decide if the candidate is truly new, should be connected to an existing concept, or should be merged with an existing one.
Output exactly this JSON structure:
{
    "decision": "create" | "connect" | "merge",
    "target_node_id": "the UUID of the match (if merge/connect)",
    "enriched_summary": "updated summary combining candidate and existing info",
    "new_edges": [{"to": "target_id", "relationship": "type"}]
}"""

    while True:
        try:
            # Wait for an item to become available in the queue
            payload = await chat_queue.get()
            
            try:
                # Agent 1: Extraction
                content_to_analyze = f"User: {payload.user_prompt}\nAI: {payload.ai_response}"
                response = ollama.chat(
                    model='qwen2.5',
                    messages=[
                        {'role': 'system', 'content': agent1_system_prompt},
                        {'role': 'user', 'content': content_to_analyze}
                    ],
                    format='json'
                )
                
                graph_data = json.loads(response['message']['content'])
                candidate_nodes = graph_data.get('nodes', [])
                candidate_edges = graph_data.get('edges', [])
                
                # Map to track Agent 1 labels to final Neo4j UUIDs (case-insensitive)
                label_to_id = {}

                for candidate in candidate_nodes:
                    # Normalize label for mapping
                    c_label = candidate['label'].lower()
                    
                    # Embed candidate
                    vector = model.encode(candidate['summary']).tolist()
                    
                    # Query ChromaDB for context
                    results = collection.query(query_embeddings=[vector], n_results=10)
                    matches = []
                    if results['ids']:
                        for i in range(len(results['ids'][0])):
                            matches.append({
                                "id": results['ids'][0][i],
                                "label": results['metadatas'][0][i]['label'],
                                "summary": results['documents'][0][i]
                            })

                    # Agent 2: Deduplication and Decision
                    agent2_prompt = f"Candidate Node: {json.dumps(candidate)}\nExisting Matches: {json.dumps(matches)}"
                    a2_response = ollama.chat(
                        model='qwen2.5',
                        messages=[
                            {'role': 'system', 'content': agent2_system_prompt},
                            {'role': 'user', 'content': agent2_prompt}
                        ],
                        format='json'
                    )
                    
                    try:
                        decision_data = json.loads(a2_response['message']['content'])
                        decision = decision_data['decision']
                        target_id = decision_data.get('target_node_id')
                        enriched = decision_data.get('enriched_summary', candidate['summary'])

                        with neo4j_driver.session() as session:
                            if decision == 'create':
                                final_id = str(uuid.uuid4())
                                session.run(
                                    "CREATE (n:KnowledgeNode {id: $id, label: $label, summary: $summary})",
                                    id=final_id, label=candidate['label'], summary=candidate['summary']
                                )
                                collection.add(
                                    ids=[final_id],
                                    embeddings=[vector],
                                    documents=[candidate['summary']],
                                    metadatas=[{"label": candidate['label']}]
                                )
                                label_to_id[c_label] = final_id
                                print(f"Agent 2: Created new node '{candidate['label']}'")

                            elif decision == 'connect':
                                final_id = str(uuid.uuid4())
                                session.run(
                                    "CREATE (n:KnowledgeNode {id: $id, label: $label, summary: $summary})",
                                    id=final_id, label=candidate['label'], summary=candidate['summary']
                                )
                                session.run(
                                    "MATCH (a:KnowledgeNode {id: $aid}), (b:KnowledgeNode {id: $bid}) "
                                    "CREATE (a)-[:RELATED_TO]->(b)",
                                    aid=final_id, bid=target_id
                                )
                                collection.add(
                                    ids=[final_id],
                                    embeddings=[vector],
                                    documents=[candidate['summary']],
                                    metadatas=[{"label": candidate['label']}]
                                )
                                label_to_id[c_label] = final_id
                                print(f"Agent 2: Connected '{candidate['label']}' to existing node {target_id}")

                            elif decision == 'merge':
                                session.run(
                                    "MATCH (n:KnowledgeNode {id: $id}) SET n.summary = $summary",
                                    id=target_id, summary=enriched
                                )
                                # Re-embed and upsert in ChromaDB
                                new_vector = model.encode(enriched).tolist()
                                collection.upsert(
                                    ids=[target_id],
                                    embeddings=[new_vector],
                                    documents=[enriched],
                                    metadatas=[{"label": candidate['label']}]
                                )
                                label_to_id[c_label] = target_id
                                print(f"Agent 2: Merged candidate into existing node {target_id}")

                    except (json.JSONDecodeError, KeyError) as e:
                        print(f"Agent 2 malformed JSON or logic error: {e}")

                # Phase 4: Create relationships extracted by Agent 1
                with neo4j_driver.session() as session:
                    for edge in candidate_edges:
                        from_label = edge['from'].lower()
                        to_label = edge['to'].lower()
                        
                        from_id = label_to_id.get(from_label)
                        to_id = label_to_id.get(to_label)
                        
                        if from_id and to_id:
                            # Sanitize and use semantic relationship type
                            rel_type = sanitize_rel_type(edge['relationship'])
                            if not rel_type: rel_type = "RELATED_TO"
                            
                            # Use MERGE on the relationship itself with semantic label
                            session.run(
                                f"MATCH (a:KnowledgeNode {{id: $aid}}), (b:KnowledgeNode {{id: $bid}}) "
                                f"MERGE (a)-[r:{rel_type}]->(b) "
                                "SET r.description = $desc",
                                aid=from_id, bid=to_id, desc=edge['relationship']
                            )
                            print(f"Created/Merged relationship: {edge['from']} -[:{rel_type}]-> {edge['to']}")

                print(f"Successfully processed {len(candidate_nodes)} nodes and {len(candidate_edges)} edges")
                
            except Exception as e:
                print(f"Processing error: {e}")
            
            chat_queue.task_done()
        except asyncio.CancelledError:
            print("Background worker shutting down...")
            break
        except Exception as e:
            print(f"Error in queue processing: {e}")

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    worker_task = asyncio.create_task(process_queue())
    yield
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass
    neo4j_driver.close()

# Initialize the FastAPI app
app = FastAPI(title="Second Brain Pipeline", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://chatgpt.com", 
        "https://claude.ai", 
        "http://localhost:5173",
        "chrome-extension://*" 
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/save-chat")
async def save_chat(payload: ChatPayload):
    await chat_queue.put(payload)
    return {"status": "success", "message": "Chat payload queued"}

@app.post("/ask")
async def ask_brain(payload: QuestionPayload):
    # 1. Embed the user's question into a vector
    question_vector = model.encode(payload.question).tolist()
    
    # 2. Search ChromaDB for the 5 most semantically relevant memories
    results = collection.query(query_embeddings=[question_vector], n_results=5)
    
    if not results['ids'] or not results['ids'][0]:
        return {"answer": "Your brain doesn't have any memories about that yet.", "sources": []}
        
    matched_ids = results['ids'][0]
    context_summaries = []
    
    # 3. Pull the rich text summaries AND the graph connections out of Neo4j using those IDs
    with neo4j_driver.session() as session:
        for node_id in matched_ids:
            record = session.run("""
                MATCH (n:KnowledgeNode {id: $id}) 
                OPTIONAL MATCH (n)-[r]-(m:KnowledgeNode) 
                RETURN n.label AS label, n.summary AS summary, collect(type(r) + ' ' + m.label) AS connections
            """, id=node_id).single()
            
            if record:
                # 1. Add the main text
                concept_text = f"Title: {record['label']}\nDetails: {record['summary']}"
                
                # 2. Add the graph connections as readable text for the LLM
                if record["connections"] and record["connections"][0] is not None:
                    valid_conns = [c for c in record["connections"] if c]
                    if valid_conns:
                        concept_text += f"\nGraph Connections: This concept is connected to -> {', '.join(valid_conns)}"
                        
                context_summaries.append(concept_text)
                
    context_text = "\n\n---\n\n".join(context_summaries)
    
    # 4. Agent 3 Synthesis (The RAG Prompt)
    agent3_prompt = f"""
    You are my Second Brain. Answer my question based strictly on the context of my past memories provided below. 
    If the context does not contain the answer, say "I don't have enough context in my memories to answer that."
    
    MY MEMORIES:
    {context_text}
    
    MY QUESTION: 
    {payload.question}
    """
    
    print("🧠 Agent 3 is synthesizing an answer...")
    
    # Send it to Ollama
    response = ollama.chat(model='qwen2.5', messages=[
        {'role': 'system', 'content': 'You are a highly analytical, precise personal knowledge assistant.'},
        {'role': 'user', 'content': agent3_prompt}
    ])
    
    return {
        "answer": response['message']['content'],
        "sources": matched_ids # We send the IDs back so the frontend can highlight them later!
    }

# --- Graph Curation Endpoints ---

@app.put("/node/{node_id}")
async def edit_node(node_id: str, payload: EditNodePayload):
    # 1. Update Neo4j
    with neo4j_driver.session() as session:
        session.run("""
            MATCH (n:KnowledgeNode {id: $id}) 
            SET n.label = $name, n.summary = $summary
        """, id=node_id, name=payload.name, summary=payload.summary)
    
    # 2. Update ChromaDB Vector
    new_vector = model.encode(payload.summary).tolist()
    collection.upsert(
        ids=[node_id], 
        embeddings=[new_vector], 
        metadatas=[{"label": payload.name}]
    )
    return {"status": "success", "message": "Node updated successfully."}


@app.delete("/node/{node_id}")
async def delete_node(node_id: str):
    # 1. Delete from Neo4j (DETACH deletes the node AND all its edges)
    with neo4j_driver.session() as session:
        session.run("MATCH (n:KnowledgeNode {id: $id}) DETACH DELETE n", id=node_id)
        
    # 2. Delete from ChromaDB
    try:
        collection.delete(ids=[node_id])
    except Exception as e:
        print(f"ChromaDB deletion skipped: {e}")
        
    return {"status": "success", "message": "Node deleted forever."}

@app.get("/graph")
async def get_graph():
    # Format the data for react-force-graph:
    # { "nodes": [{ "id": "...", "name": "..." }], "links": [{ "source": "id1", "target": "id2" }] }
    
    graph_data = {"nodes": [], "links": []}
    added_nodes = set()

    with neo4j_driver.session() as session:
        # Fetch up to 150 connected nodes to keep the 3D render smooth
        result = session.run("""
            MATCH (n:KnowledgeNode)-[r]->(m:KnowledgeNode) 
            RETURN n, r, m 
            LIMIT 150
        """)
        
        for record in result:
            n = record["n"]
            m = record["m"]
            r = record["r"]
            
            # Add Source Node
            if n["id"] not in added_nodes:
                graph_data["nodes"].append({
                    "id": n["id"],
                    "name": n["label"],
                    "summary": n.get("summary", "")
                })
                added_nodes.add(n["id"])
                
            # Add Target Node
            if m["id"] not in added_nodes:
                graph_data["nodes"].append({
                    "id": m["id"],
                    "name": m["label"],
                    "summary": m.get("summary", "")
                })
                added_nodes.add(m["id"])
                
            # Add Edge (Link)
            graph_data["links"].append({
                "source": n["id"],
                "target": m["id"],
                "label": r.type
            })
            
    return graph_data
