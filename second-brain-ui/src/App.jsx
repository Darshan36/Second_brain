import { useState, useEffect, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import Draggable from 'react-draggable';
import './App.css';

function App() {
  const nodeRef = useRef(null);
  const [fullGraphData, setFullGraphData] = useState({ nodes: [], links: [] });
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  
  // HUD State
  const [brainStats, setBrainStats] = useState({ 
    total_memories: 0, 
    total_connections: 0, 
    top_concept: 'Loading...', 
    top_degree: 0 
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', summary: '' });

  const fetchStats = () => {
    fetch('http://localhost:8000/stats')
      .then(res => res.json())
      .then(data => setBrainStats(data))
      .catch(err => console.error("Error fetching stats:", err));
  };

  useEffect(() => {
    fetch('http://localhost:8000/graph')
      .then(res => res.json())
      .then(data => {
        setFullGraphData(data);
        setGraphData(data);
      })
      .catch(err => console.error("Error fetching brain data:", err));
      
    fetchStats();
  }, []);

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    setIsEditing(false);
    setEditForm({ name: node.name, summary: node.summary });
  };

  const handleFocus = () => {
    if (!selectedNode) return;
    const connectedLinks = fullGraphData.links.filter(l => 
      (l.source.id || l.source) === selectedNode.id || 
      (l.target.id || l.target) === selectedNode.id
    );
    const connectedNodeIds = new Set([selectedNode.id]);
    connectedLinks.forEach(l => {
      connectedNodeIds.add(l.source.id || l.source);
      connectedNodeIds.add(l.target.id || l.target);
    });
    const connectedNodes = fullGraphData.nodes.filter(n => connectedNodeIds.has(n.id));
    setGraphData({ nodes: connectedNodes, links: connectedLinks });
    setIsFocused(true);
  };

  const handleResetFocus = () => {
    setGraphData(fullGraphData);
    setIsFocused(false);
  };

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
    fetchStats();
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
    fetchStats();
  };

  const handleExport = async () => {
    try {
      const res = await fetch('http://localhost:8000/export');
      const data = await res.json();
      alert(`✅ ${data.message}`);
    } catch (err) {
      console.error(err);
      alert("❌ Export failed. Check terminal for errors.");
    }
  };

  return (
    <div className="app-container">
      <div className="top-bar">
        {isFocused && (
          <button className="reset-view-btn" onClick={handleResetFocus}>← Back to Full Graph</button>
        )}
        <button className="export-btn" onClick={handleExport}>📥 Export to Markdown</button>
      </div>

      <div className="stats-hud">
        <h3>System Telemetry</h3>
        <div className="stat-row">
          <span className="stat-label">Total Memories</span>
          <span className="stat-value">{brainStats.total_memories}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Neural Pathways</span>
          <span className="stat-value">{brainStats.total_connections}</span>
        </div>
        <div className="stat-divider"></div>
        <div className="stat-row">
          <span className="stat-label">Core Concept</span>
          <span className="stat-value highlight">{brainStats.top_concept} ({brainStats.top_degree})</span>
        </div>
      </div>

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

      <Draggable handle=".chat-handle" nodeRef={nodeRef}>
        <div ref={nodeRef} className={`command-palette ${isChatCollapsed ? 'collapsed' : ''}`}>
          <div className="chat-handle">
            <span className="drag-icon">⠿</span>
            <span className="chat-title">Second Brain AI</span>
            <button className="collapse-btn-small" onClick={() => setIsChatCollapsed(!isChatCollapsed)}>
              {isChatCollapsed ? '▲' : '▼'}
            </button>
          </div>
          
          {!isChatCollapsed && (
            <>
              <form onSubmit={handleSearch} className="search-form">
                <input 
                  type="text" placeholder="Ask your Second Brain..." 
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} disabled={isSearching}
                />
                <button type="submit" disabled={isSearching}>{isSearching ? 'Thinking...' : 'Ask'}</button>
              </form>
              {aiResponse && <div className="response-area"><p>{aiResponse}</p></div>}
            </>
          )}
        </div>
      </Draggable>

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
