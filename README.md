# 🧠 Second Brain: AI-Powered Knowledge Graph

A personal knowledge management system that extracts insights from your conversations using AI (Ollama/Qwen2.5), stores them in a **Neo4j Graph Database**, and provides semantic search via **ChromaDB**.

## 🚀 Features
- **Agent 1 (Extractor):** Automatically pulls nodes and relationships from your chat history.
- **Agent 2 (Graph Keeper):** Deduplicates and merges new info into existing concepts.
- **Agent 3 (Synthesis):** Answers questions based strictly on your personal knowledge graph (RAG).
- **Agent 4 (Synthesizer):** A nightly worker that finds hidden semantic connections between concepts.
- **3D Visualization:** Explore your memories in an interactive 3D force-directed graph.
- **Chrome Extension:** Capture insights directly from ChatGPT or Claude.

## 🛠️ Tech Stack
- **Backend:** FastAPI, Neo4j, ChromaDB, Ollama (Qwen2.5)
- **Frontend:** React, Vite, TailwindCSS (for UI), React Force Graph (for 3D)
- **Extension:** Manifest V3 (Javascript)

## 📥 Setup Instructions

### 1. Prerequisites
- [Neo4j Desktop](https://neo4j.com/download/) installed and running.
- [Ollama](https://ollama.com/) installed with the `qwen2.5` model (`ollama pull qwen2.5`).
- [Node.js](https://nodejs.org/) and [Python 3.10+](https://www.python.org/) installed.

### 2. Backend Setup
1. Open a terminal in the root folder.
2. Create and activate a virtual environment:
   ```powershell
   python -m venv venv
   .\venv\Scripts\activate
   ```
3. Install dependencies (ensure `chromadb`, `neo4j`, `fastapi`, `uvicorn`, `ollama` are installed).
4. Update Neo4j credentials in `main.py` and `agent4.py` if different from `password1234`.

### 3. Frontend Setup
1. Navigate to the UI folder:
   ```bash
   cd second-brain-ui
   npm install
   ```

### 4. Chrome Extension
1. Open Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `second-brain-extension` folder in this repo.

## ⚡ Running the Project
Simply run the included batch file to start everything at once:
```powershell
.\start_brain.bat
```
This will:
1. Start the FastAPI server.
2. Launch the React dashboard.
3. Open your browser to `http://localhost:5173`.

## 🤖 Nightly Synthesis
To run the Agent 4 synthesizer manually and find hidden connections:
```powershell
.\venv\Scripts\python.exe agent4.py
```

## 📝 License
MIT
