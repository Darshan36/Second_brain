import { useState, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import './App.css';

function App() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  
  // Chat State
  const [searchQuery, setSearchQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [highlightNodes, setHighlightNodes] = useState(new Set());

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', summary: '' });

  useEffect(() => {
    fetch('http://localhost:8000/graph')
      .then(res => res.json())
      .then(data => setGraphData(data))
      .catch(err => console.error("Error fetching brain data:", err));
  }, []);

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    setIsEditing(false); // Reset edit state when clicking a new node
    setEditForm({ name: node.name, summary: node.summary });
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setAiResponse('');
    setHighlightNodes(new Set()); // Clear previous highlights
    setSelectedNode(null); // Close side panel if open

    try {
      const res = await fetch('http://localhost:8000/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: searchQuery })
      });
      const data = await res.json();
      
      setAiResponse(data.answer);
      // Highlight the nodes Agent 3 used as sources!
      setHighlightNodes(new Set(data.sources));
    } catch (err) {
      console.error(err);
      setAiResponse("Lost connection to the backend brain.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Permanently delete this memory?")) return;
    
    await fetch(`http://localhost:8000/node/${selectedNode.id}`, { method: 'DELETE' });
    
    // Instantly remove it from the 3D graph without refreshing the page
    setGraphData(prev => ({
      nodes: prev.nodes.filter(n => n.id !== selectedNode.id),
      links: prev.links.filter(l => l.source.id !== selectedNode.id && l.target.id !== selectedNode.id)
    }));
    setSelectedNode(null);
  };

  const handleSaveEdit = async () => {
    await fetch(`http://localhost:8000/node/${selectedNode.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm)
    });
    
    // Instantly update the 3D graph text
    setGraphData(prev => ({
      nodes: prev.nodes.map(n => n.id === selectedNode.id ? { ...n, name: editForm.name, summary: editForm.summary } : n),
      links: prev.links
    }));
    setSelectedNode({ ...selectedNode, name: editForm.name, summary: editForm.summary });
    setIsEditing(false);
  };

  return (
    <div className="app-container">
      <div className="graph-container">
        <ForceGraph3D
          graphData={graphData}
          nodeLabel="name"
          // If a node is in the highlight set, paint it bright red. Otherwise, use its default color.
          nodeColor={node => highlightNodes.has(node.id) ? '#ff3b30' : '#4a90e2'}
          onNodeClick={handleNodeClick}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.005}
          backgroundColor="#000000"
        />
      </div>

      {/* Floating Chat Interface */}
      <div className="command-palette">
        <form onSubmit={handleSearch} className="search-form">
          <input 
            type="text" 
            placeholder="Ask your Second Brain..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isSearching}
          />
          <button type="submit" disabled={isSearching}>
            {isSearching ? 'Thinking...' : 'Ask'}
          </button>
        </form>

        {aiResponse && (
          <div className="response-area">
            <p>{aiResponse}</p>
          </div>
        )}
      </div>

      {/* Side Panel with Curation Controls */}
      {selectedNode && (
        <div className="side-panel">
          <button className="close-btn" onClick={() => setSelectedNode(null)}>✕</button>
          
          {isEditing ? (
            <div className="edit-mode">
              <input 
                className="edit-input" 
                value={editForm.name} 
                onChange={e => setEditForm({...editForm, name: e.target.value})} 
              />
              <textarea 
                className="edit-textarea" 
                value={editForm.summary} 
                onChange={e => setEditForm({...editForm, summary: e.target.value})}
                rows="6"
              />
              <div className="panel-actions">
                <button className="action-btn save" onClick={handleSaveEdit}>Save</button>
                <button className="action-btn cancel" onClick={() => setIsEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <h2>{selectedNode.name}</h2>
              <div className="divider"></div>
              <p>{selectedNode.summary}</p>
              <div className="panel-actions mt-4">
                <button className="action-btn edit" onClick={() => setIsEditing(true)}>Edit</button>
                <button className="action-btn delete" onClick={handleDelete}>Delete</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
