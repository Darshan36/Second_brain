import { useState, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import './App.css';

function App() {
  // We now keep the FULL graph, and the DISPLAY graph separate
  const [fullGraphData, setFullGraphData] = useState({ nodes: [], links: [] });
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  
  const [selectedNode, setSelectedNode] = useState(null);
  const [isFocused, setIsFocused] = useState(false);
  
  // Chat & Edit States (unchanged)
  const [searchQuery, setSearchQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', summary: '' });

  useEffect(() => {
    fetch('http://localhost:8000/graph')
      .then(res => res.json())
      .then(data => {
        setFullGraphData(data);
        setGraphData(data); // Initially display everything
      })
      .catch(err => console.error("Error fetching brain data:", err));
  }, []);

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    setIsEditing(false);
    setEditForm({ name: node.name, summary: node.summary });
  };

  // --- NEW: FOCUS MODE LOGIC ---
  const handleFocus = () => {
    if (!selectedNode) return;

    // 1. Find all links that touch this node
    // (ForceGraph mutates strings to objects, so we check both .id and direct strings)
    const connectedLinks = fullGraphData.links.filter(l => 
      (l.source.id || l.source) === selectedNode.id || 
      (l.target.id || l.target) === selectedNode.id
    );

    // 2. Find all nodes involved in those links
    const connectedNodeIds = new Set([selectedNode.id]);
    connectedLinks.forEach(l => {
      connectedNodeIds.add(l.source.id || l.source);
      connectedNodeIds.add(l.target.id || l.target);
    });

    // 3. Filter the node array
    const connectedNodes = fullGraphData.nodes.filter(n => connectedNodeIds.has(n.id));

    // 4. Update the display!
    setGraphData({ nodes: connectedNodes, links: connectedLinks });
    setIsFocused(true);
  };

  const handleResetFocus = () => {
    setGraphData(fullGraphData);
    setIsFocused(false);
  };
  // -----------------------------

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setAiResponse('');
    setHighlightNodes(new Set());
    try {
      const res = await fetch('http://localhost:8000/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: searchQuery })
      });
      const data = await res.json();
      setAiResponse(data.answer);
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
    
    const updatedNodes = fullGraphData.nodes.filter(n => n.id !== selectedNode.id);
    const updatedLinks = fullGraphData.links.filter(l => (l.source.id || l.source) !== selectedNode.id && (l.target.id || l.target) !== selectedNode.id);
    
    setFullGraphData({ nodes: updatedNodes, links: updatedLinks });
    setGraphData({ nodes: updatedNodes, links: updatedLinks });
    setSelectedNode(null);
  };

  const handleSaveEdit = async () => {
    await fetch(`http://localhost:8000/node/${selectedNode.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm)
    });
    
    const updateNodesList = nodes => nodes.map(n => n.id === selectedNode.id ? { ...n, name: editForm.name, summary: editForm.summary } : n);
    setFullGraphData(prev => ({ nodes: updateNodesList(prev.nodes), links: prev.links }));
    setGraphData(prev => ({ nodes: updateNodesList(prev.nodes), links: prev.links }));
    setSelectedNode({ ...selectedNode, name: editForm.name, summary: editForm.summary });
    setIsEditing(false);
  };

  return (
    <div className="app-container">
      {/* Top Bar for Resetting View */}
      {isFocused && (
        <div className="top-bar">
          <button className="reset-view-btn" onClick={handleResetFocus}>
            ← Back to Full Graph
          </button>
        </div>
      )}

      <div className="graph-container">
        <ForceGraph3D
          graphData={graphData}
          nodeLabel="name"
          nodeColor={node => highlightNodes.has(node.id) ? '#ff3b30' : '#4a90e2'}
          onNodeClick={handleNodeClick}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.005}
          backgroundColor="#000000"
        />
      </div>

      {/* Command Palette */}
      <div className="command-palette">
         <form onSubmit={handleSearch} className="search-form">
          <input 
            type="text" placeholder="Ask your Second Brain..." 
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} disabled={isSearching}
          />
          <button type="submit" disabled={isSearching}>{isSearching ? 'Thinking...' : 'Ask'}</button>
        </form>
        {aiResponse && <div className="response-area"><p>{aiResponse}</p></div>}
      </div>

      {/* Side Panel */}
      {selectedNode && (
        <div className="side-panel">
          <button className="close-btn" onClick={() => setSelectedNode(null)}>✕</button>
          
          {isEditing ? (
            <div className="edit-mode">
              <input className="edit-input" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
              <textarea className="edit-textarea" value={editForm.summary} onChange={e => setEditForm({...editForm, summary: e.target.value})} rows="6" />
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
                {!isFocused && <button className="action-btn focus" onClick={handleFocus}>Focus</button>}
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
