import chromadb
from neo4j import GraphDatabase
import ollama
import re

# 1. Connect to the Brain (Use your actual Neo4j password!)
neo4j_driver = GraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "password"))
chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_or_create_collection(name="second_brain")

def wake_up_synthesizer():
    print("🌙 Agent 4: Nightly Synthesizer waking up...")
    
    with neo4j_driver.session() as session:
        # Grab all nodes in the graph
        result = session.run("MATCH (n:Node) RETURN n.id AS id, n.label AS label, n.summary AS summary")
        nodes = [record for record in result]
        
        new_edges = 0
        
        for node in nodes:
            # Ask ChromaDB for the 3 closest semantic neighbors
            results = collection.query(
                query_texts=[node["summary"]],
                n_results=4  # 1 is itself, plus 3 neighbors
            )
            
            if not results['ids'] or not results['ids'][0]:
                continue
                
            neighbors = results['ids'][0]
            
            for neighbor_id in neighbors:
                if neighbor_id == node["id"]:
                    continue # Skip itself
                    
                # Check if Neo4j already has an edge between these two
                edge_check = session.run("""
                    MATCH (n:Node {id: $id1})-[r]-(m:Node {id: $id2}) 
                    RETURN r
                """, id1=node["id"], id2=neighbor_id).single()
                
                if edge_check is None: # No connection exists!
                    neighbor = session.run("MATCH (n:Node {id: $id}) RETURN n.label AS label, n.summary AS summary", id=neighbor_id).single()
                    if not neighbor: continue
                    
                    # Agent 4 Interrogation Prompt
                    prompt = f"""
                    Evaluate if Concept A and Concept B are meaningfully connected.
                    
                    Concept A: {node['label']} - {node['summary']}
                    Concept B: {neighbor['label']} - {neighbor['summary']}
                    
                    If they are connected, respond with a single, uppercase word representing the relationship (e.g., RELATES_TO, PART_OF, DEPENDS_ON). 
                    If they are NOT connected, respond with exactly: NONE.
                    """
                    
                    # Send to Qwen2.5
                    res = ollama.chat(model='qwen2.5', messages=[
                        {'role': 'system', 'content': 'You are a strict data classification AI. Output only a single uppercase word. No punctuation. No explanation.'},
                        {'role': 'user', 'content': prompt}
                    ])
                    
                    label = res['message']['content'].strip().upper()
                    label = re.sub(r'[^A-Z_]', '', label) # Clean up any rogue punctuation
                    
                    # If the AI found a connection, draw the line!
                    if label and label != "NONE" and len(label) > 2:
                        print(f"🔗 Hidden connection found! [{node['label']}] -[{label}]-> [{neighbor['label']}]")
                        
                        session.run(f"""
                            MATCH (n:Node {{id: $id1}}), (m:Node {{id: $id2}})
                            MERGE (n)-[r:{label}]->(m)
                        """, id1=node["id"], id2=neighbor_id)
                        
                        new_edges += 1
                        
    print(f"🌅 Synthesizer finished. Drew {new_edges} new connections in your graph.")

if __name__ == "__main__":
    wake_up_synthesizer()
