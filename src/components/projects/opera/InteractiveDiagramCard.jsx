import React, { useState, useCallback, useRef, useEffect } from 'react';
import Arrow from './Arrow';
import {
  loadDiagram,
  saveDiagram,
  NODE_ICONS,
} from './solutionsData';

const SVG_WIDTH = 1050;
const DEFAULT_NODE_W = 120;
const DEFAULT_NODE_H = 48;
const MAX_HISTORY = 50;

function snapshot(nodes, arrows, annotations) {
  return {
    nodes: nodes.map((n) => ({ ...n })),
    arrows: arrows.map((a) => ({ ...a })),
    annotations: annotations.map((a) => ({ ...a })),
  };
}

function ComplexityDots({ val, max = 5, color }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: i < val ? color : 'rgba(255,255,255,0.12)',
            boxShadow: i < val ? `0 0 6px ${color}` : 'none',
            transition: 'all 0.3s',
          }}
        />
      ))}
    </div>
  );
}

function getSvgPoint(svgRef, clientX, clientY) {
  if (!svgRef?.current) return { x: 0, y: 0 };
  const svg = svgRef.current;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const t = pt.matrixTransform(svg.getScreenCTM().inverse());
  return { x: Math.round(t.x), y: Math.round(t.y) };
}

export default function InteractiveDiagramCard({ sol, isActive }) {
  const saved = loadDiagram(sol.id);
  const defaultNodes = (saved?.nodes ?? sol.nodes).map((n) => ({ ...n }));
  const defaultArrows = (saved?.arrows ?? sol.arrows).map((a, i) => ({ ...a, id: a.id || `arr-${i}` }));
  const defaultAnnotations = (saved?.annotations ?? sol.annotations).map((a, i) => ({ ...a, id: a.id || `ann-${i}` }));

  const [nodes, setNodes] = useState(defaultNodes);
  const [arrows, setArrows] = useState(defaultArrows);
  const [annotations, setAnnotations] = useState(defaultAnnotations);
  const [history, setHistory] = useState([]);
  const [mode, setMode] = useState('select');
  const [linkFrom, setLinkFrom] = useState(null);
  const [dragNodeId, setDragNodeId] = useState(null);
  const [dragStart, setDragStart] = useState({ svgX: 0, svgY: 0, nodeX: 0, nodeY: 0 });
  const [dragAnnId, setDragAnnId] = useState(null);
  const [dragAnnStart, setDragAnnStart] = useState({ svgX: 0, svgY: 0, annX: 0, annY: 0 });
  const [addNodeAt, setAddNodeAt] = useState(null);
  const [editingNode, setEditingNode] = useState(null);
  const [editingAnnId, setEditingAnnId] = useState(null);
  const [editingArrowId, setEditingArrowId] = useState(null);
  const [newNodeForm, setNewNodeForm] = useState({ icon: '🗄️', label: '', sublabel: '' });
  const [newAnnText, setNewAnnText] = useState('');
  const [newAnnAt, setNewAnnAt] = useState(null);
  const svgRef = useRef(null);

  const svgH = Math.max(320, Math.max(...nodes.map((n) => n.y + n.h), 0) + 80);

  const persist = useCallback(() => {
    saveDiagram(sol.id, {
      nodes,
      arrows,
      annotations,
    });
  }, [sol.id, nodes, arrows, annotations]);

  useEffect(() => {
    persist();
  }, [nodes, arrows, annotations, persist]);

  const pushHistory = useCallback(() => {
    setHistory((prev) => {
      const next = [...prev, snapshot(nodes, arrows, annotations)];
      return next.slice(-MAX_HISTORY);
    });
  }, [nodes, arrows, annotations]);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const rest = prev.slice(0, -1);
      const last = prev[prev.length - 1];
      setNodes(last.nodes);
      setArrows(last.arrows);
      setAnnotations(last.annotations);
      return rest;
    });
  }, []);

  const handleSvgClick = useCallback(
    (e) => {
      if (!svgRef.current) return;
      const pt = getSvgPoint(svgRef, e.clientX, e.clientY);
      if (e.target.tagName === 'svg' || e.target.getAttribute('data-diagram-bg')) {
        if (mode === 'addNode') {
          setAddNodeAt(pt);
          setNewNodeForm({ icon: '🗄️', label: 'New node', sublabel: '' });
        }
        if (mode === 'addAnnotation') {
          setNewAnnAt(pt);
          setNewAnnText('');
        }
      }
    },
    [mode]
  );

  const handleNodeMouseDown = useCallback(
    (e, nodeId) => {
      e.stopPropagation();
      if (mode === 'addLink') {
        if (!linkFrom) setLinkFrom(nodeId);
        else {
          if (linkFrom !== nodeId) {
            pushHistory();
            setArrows((prev) => [...prev, { id: `arr-${Date.now()}`, from: linkFrom, to: nodeId, label: '', style: 'solid' }]);
          }
          setLinkFrom(null);
        }
        return;
      }
      if (mode !== 'select') return;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      pushHistory();
      const pt = getSvgPoint(svgRef, e.clientX, e.clientY);
      setDragNodeId(nodeId);
      setDragStart({ svgX: pt.x, svgY: pt.y, nodeX: node.x, nodeY: node.y });
    },
    [mode, linkFrom, nodes, pushHistory]
  );

  const handleNodeDoubleClick = useCallback(
    (e, nodeId) => {
      e.stopPropagation();
      if (mode !== 'select') return;
      const node = nodes.find((n) => n.id === nodeId);
      if (node) setEditingNode({ ...node });
    },
    [mode, nodes]
  );

  useEffect(() => {
    if (!dragNodeId || !svgRef.current) return;
    const onMove = (e) => {
      const pt = getSvgPoint(svgRef, e.clientX, e.clientY);
      const dx = pt.x - dragStart.svgX;
      const dy = pt.y - dragStart.svgY;
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== dragNodeId) return n;
          return { ...n, x: Math.max(0, dragStart.nodeX + dx), y: Math.max(0, dragStart.nodeY + dy) };
        })
      );
    };
    const onUp = () => setDragNodeId(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragNodeId, dragStart.svgX, dragStart.svgY, dragStart.nodeX, dragStart.nodeY]);

  useEffect(() => {
    if (!dragAnnId || !svgRef.current) return;
    const onMove = (e) => {
      const pt = getSvgPoint(svgRef, e.clientX, e.clientY);
      const dx = pt.x - dragAnnStart.svgX;
      const dy = pt.y - dragAnnStart.svgY;
      setAnnotations((prev) =>
        prev.map((a) => {
          if (a.id !== dragAnnId) return a;
          return { ...a, x: Math.max(0, dragAnnStart.annX + dx), y: Math.max(0, dragAnnStart.annY + dy) };
        })
      );
    };
    const onUp = () => setDragAnnId(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragAnnId, dragAnnStart.svgX, dragAnnStart.svgY, dragAnnStart.annX, dragAnnStart.annY]);

  const handleAnnotationMouseDown = useCallback(
    (e, ann) => {
      e.stopPropagation();
      if (mode !== 'select') return;
      pushHistory();
      const pt = getSvgPoint(svgRef, e.clientX, e.clientY);
      setDragAnnId(ann.id);
      setDragAnnStart({ svgX: pt.x, svgY: pt.y, annX: ann.x, annY: ann.y });
    },
    [mode, pushHistory]
  );

  const handleAnnotationDoubleClick = useCallback((e, ann) => {
    e.stopPropagation();
    if (mode !== 'select') return;
    setEditingAnnId(ann.id);
  }, [mode]);

  const handleArrowDoubleClick = useCallback((e, arrowId) => {
    e.stopPropagation();
    if (mode !== 'select') return;
    setEditingArrowId(arrowId);
  }, [mode]);

  const submitNewNode = () => {
    if (!addNodeAt) return;
    pushHistory();
    const id = `node-${Date.now()}`;
    setNodes((prev) => [
      ...prev,
      {
        id,
        x: Math.max(0, addNodeAt.x - DEFAULT_NODE_W / 2),
        y: Math.max(0, addNodeAt.y - DEFAULT_NODE_H / 2),
        w: DEFAULT_NODE_W,
        h: DEFAULT_NODE_H,
        label: newNodeForm.label || 'Node',
        icon: newNodeForm.icon,
        sublabel: newNodeForm.sublabel || '',
        color: '#1a2e4a',
      },
    ]);
    setAddNodeAt(null);
  };

  const submitNewAnnotation = () => {
    if (!newAnnAt || newAnnText.trim() === '') return;
    pushHistory();
    setAnnotations((prev) => [
      ...prev,
      {
        id: `ann-${Date.now()}`,
        x: newAnnAt.x,
        y: newAnnAt.y,
        text: newAnnText.trim(),
        color: sol.color,
      },
    ]);
    setNewAnnAt(null);
    setNewAnnText('');
  };

  const resetDiagram = () => {
    setNodes(sol.nodes.map((n) => ({ ...n })));
    setArrows(sol.arrows.map((a, i) => ({ ...a, id: `arr-${i}` })));
    setAnnotations(sol.annotations.map((a) => ({ ...a, id: a.id || `ann-${Math.random().toString(36).slice(2)}` })));
    saveDiagram(sol.id, null);
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #0d1b2a 0%, #0a1520 100%)',
        border: `1.5px solid ${isActive ? sol.color : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 16,
        padding: '20px 20px 16px',
        boxShadow: isActive ? `0 0 32px ${sol.color}33, 0 8px 32px rgba(0,0,0,0.5)` : '0 4px 20px rgba(0,0,0,0.4)',
        transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
        width: '100%',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span
              style={{
                background: sol.type === 'READ/WRITE' ? '#3a1a1a' : '#0a2a3a',
                border: `1px solid ${sol.color}`,
                color: sol.color,
                fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.08em',
                padding: '2px 8px',
                borderRadius: 4,
                fontWeight: 600,
              }}
            >
              {sol.type}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.12em' }}>
              {sol.label}
            </span>
          </div>
          <h3 style={{ margin: 0, color: '#e8f4fd', fontSize: 13.5, fontFamily: "'Syne', sans-serif", fontWeight: 700, lineHeight: 1.3, maxWidth: 480 }}>
            {sol.title}
          </h3>
        </div>
        <div style={{ textAlign: 'right', minWidth: 90 }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: 'monospace', marginBottom: 4 }}>COMPLEXITY</div>
          <ComplexityDots val={sol.complexity} color={sol.color} />
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: 'monospace', marginTop: 6 }}>COST</div>
          <div style={{ color: sol.color, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{sol.cost}</div>
        </div>
      </div>

      {sol.writeWarning && (
        <div
          style={{
            background: 'rgba(255, 107, 107, 0.1)',
            border: '1px solid rgba(255, 107, 107, 0.3)',
            borderRadius: 6,
            padding: '6px 10px',
            marginBottom: 10,
            fontSize: 10,
            color: '#FF9999',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.05em',
          }}
        >
          ⚠️ SC-3 COMPLIANCE NOTE: OPERA Oracle DB remains SELECT-only. Writes target SaaS sidecar schema or OHIP API only.
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: "'JetBrains Mono', monospace" }}>Edit:</span>
        {['select', 'addNode', 'addLink', 'addAnnotation'].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            style={{
              background: mode === m ? 'rgba(0, 194, 255, 0.2)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${mode === m ? 'rgba(0, 194, 255, 0.6)' : 'rgba(255,255,255,0.12)'}`,
              color: mode === m ? '#00C2FF' : 'rgba(255,255,255,0.7)',
              padding: '4px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {m === 'select' ? 'Select / drag' : m === 'addNode' ? 'Add node' : m === 'addLink' ? 'Add link' : 'Add note'}
          </button>
        ))}
        <button
          type="button"
          onClick={undo}
          disabled={history.length === 0}
          title={history.length === 0 ? 'Nothing to undo' : 'Undo last change'}
          style={{
            background: history.length === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255, 180, 80, 0.15)',
            border: `1px solid ${history.length === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255, 180, 80, 0.4)'}`,
            color: history.length === 0 ? 'rgba(255,255,255,0.3)' : '#ffb450',
            padding: '4px 10px',
            borderRadius: 6,
            cursor: history.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          Undo
        </button>
        <button
          type="button"
          onClick={resetDiagram}
          style={{
            background: 'rgba(255,100,100,0.1)',
            border: '1px solid rgba(255,100,100,0.3)',
            color: '#ff9999',
            padding: '4px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            marginLeft: 'auto',
          }}
        >
          Reset diagram
        </button>
      </div>

      {/* Add-node modal */}
      {addNodeAt && (
        <div
          className="opera-diagram-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setAddNodeAt(null)}
        >
          <div
            style={{
              background: '#0d1b2a',
              border: '1px solid rgba(0,194,255,0.3)',
              borderRadius: 12,
              padding: 20,
              minWidth: 320,
              maxWidth: 90,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 style={{ margin: '0 0 12px', color: '#e8f4fd' }}>Add node</h4>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>Icon (click to choose):</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {NODE_ICONS.map((ico) => (
                <button
                  key={ico}
                  type="button"
                  onClick={() => setNewNodeForm((f) => ({ ...f, icon: ico }))}
                  style={{
                    fontSize: 18,
                    padding: 6,
                    border: newNodeForm.icon === ico ? `2px solid ${sol.color}` : '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 8,
                    background: newNodeForm.icon === ico ? 'rgba(0,194,255,0.15)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  {ico}
                </button>
              ))}
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Label</label>
              <input
                type="text"
                value={newNodeForm.label}
                onChange={(e) => setNewNodeForm((f) => ({ ...f, label: e.target.value }))}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: '#0a1520', color: '#e8f4fd' }}
                placeholder="Node label"
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Sublabel</label>
              <input
                type="text"
                value={newNodeForm.sublabel}
                onChange={(e) => setNewNodeForm((f) => ({ ...f, sublabel: e.target.value }))}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: '#0a1520', color: '#e8f4fd' }}
                placeholder="Optional"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setAddNodeAt(null)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={submitNewNode} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: sol.color, color: '#fff', cursor: 'pointer' }}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add-annotation modal */}
      {newAnnAt && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => { setNewAnnAt(null); setNewAnnText(''); }}
        >
          <div
            style={{ background: '#0d1b2a', border: '1px solid rgba(0,194,255,0.3)', borderRadius: 12, padding: 20, minWidth: 280 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 style={{ margin: '0 0 12px', color: '#e8f4fd' }}>Add annotation</h4>
            <input
              type="text"
              value={newAnnText}
              onChange={(e) => setNewAnnText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitNewAnnotation()}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: '#0a1520', color: '#e8f4fd', marginBottom: 12 }}
              placeholder="Annotation text"
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setNewAnnAt(null); setNewAnnText(''); }} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={submitNewAnnotation} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: sol.color, color: '#fff', cursor: 'pointer' }}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit node modal */}
      {editingNode && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setEditingNode(null)}
        >
          <div
            style={{ background: '#0d1b2a', border: '1px solid rgba(0,194,255,0.3)', borderRadius: 12, padding: 20, minWidth: 280 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 style={{ margin: '0 0 12px', color: '#e8f4fd' }}>Edit node</h4>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Icon</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {NODE_ICONS.slice(0, 24).map((ico) => (
                  <button
                    key={ico}
                    type="button"
                    onClick={() => setEditingNode((n) => ({ ...n, icon: ico }))}
                    style={{ fontSize: 18, padding: 4, border: editingNode.icon === ico ? `2px solid ${sol.color}` : '1px solid rgba(255,255,255,0.2)', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}
                  >
                    {ico}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Label</label>
              <input
                type="text"
                value={editingNode.label}
                onChange={(e) => setEditingNode((n) => ({ ...n, label: e.target.value }))}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: '#0a1520', color: '#e8f4fd' }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Sublabel</label>
              <input
                type="text"
                value={editingNode.sublabel}
                onChange={(e) => setEditingNode((n) => ({ ...n, sublabel: e.target.value }))}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: '#0a1520', color: '#e8f4fd' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setEditingNode(null)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button
                type="button"
                onClick={() => {
                  pushHistory();
                  setNodes((prev) => prev.map((n) => (n.id === editingNode.id ? { ...editingNode } : n)));
                  setEditingNode(null);
                }}
                style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: sol.color, color: '#fff', cursor: 'pointer' }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit annotation inline */}
      {editingAnnId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setEditingAnnId(null)}>
          <div style={{ background: '#0d1b2a', border: '1px solid rgba(0,194,255,0.3)', borderRadius: 12, padding: 20, minWidth: 280 }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 12px', color: '#e8f4fd' }}>Edit annotation</h4>
            <input
              type="text"
              defaultValue={annotations.find((a) => a.id === editingAnnId)?.text}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t) {
                  pushHistory();
                  setAnnotations((prev) => prev.map((a) => (a.id === editingAnnId ? { ...a, text: t } : a)));
                }
                setEditingAnnId(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: '#0a1520', color: '#e8f4fd' }}
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Edit arrow label */}
      {editingArrowId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setEditingArrowId(null)}>
          <div style={{ background: '#0d1b2a', border: '1px solid rgba(0,194,255,0.3)', borderRadius: 12, padding: 20, minWidth: 280 }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 12px', color: '#e8f4fd' }}>Edit arrow label</h4>
            <input
              type="text"
              defaultValue={arrows.find((a) => a.id === editingArrowId)?.label}
              onBlur={(e) => {
                pushHistory();
                setArrows((prev) => prev.map((a) => (a.id === editingArrowId ? { ...a, label: e.target.value } : a)));
                setEditingArrowId(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: '#0a1520', color: '#e8f4fd' }}
              placeholder="Link label"
              autoFocus
            />
          </div>
        </div>
      )}

      {/* SVG Diagram */}
      <div
        style={{
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.05)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${SVG_WIDTH} ${svgH}`}
          style={{ display: 'block', cursor: mode === 'addNode' || mode === 'addAnnotation' ? 'crosshair' : 'default' }}
          onClick={handleSvgClick}
        >
          <rect width={SVG_WIDTH} height={svgH} fill="transparent" data-diagram-bg />
          {Array.from({ length: 20 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 55} y1={0} x2={i * 55} y2={svgH} stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
          ))}
          {Array.from({ length: Math.ceil(svgH / 55) }).map((_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 55} x2={SVG_WIDTH} y2={i * 55} stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
          ))}

          {sol.boundary && (
            <g>
              <rect
                x={sol.boundary.x}
                y={sol.boundary.y}
                width={sol.boundary.w}
                height={svgH - sol.boundary.y - 20}
                rx={10}
                fill="rgba(255, 200, 50, 0.03)"
                stroke="rgba(255, 200, 50, 0.2)"
                strokeWidth="1"
                strokeDasharray="8,4"
              />
              <text x={sol.boundary.x + 10} y={sol.boundary.y + 16} fontSize="10" fill="rgba(255, 200, 50, 0.5)" fontFamily="'JetBrains Mono', monospace">
                {sol.boundary.label}
              </text>
            </g>
          )}

          {arrows.map((a) => (
            <g key={a.id} onDoubleClick={(e) => handleArrowDoubleClick(e, a.id)} style={{ cursor: 'pointer' }}>
              <Arrow id={a.id} from={a.from} to={a.to} nodes={nodes} label={a.label} style={a.style || 'solid'} />
            </g>
          ))}

          {nodes.map((node) => (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
              onDoubleClick={(e) => handleNodeDoubleClick(e, node.id)}
              style={{ cursor: mode === 'addLink' ? 'pointer' : dragNodeId === node.id ? 'grabbing' : 'grab' }}
            >
              <rect
                width={node.w}
                height={node.h}
                rx={8}
                fill={node.color}
                stroke={linkFrom === node.id ? sol.color : `${sol.color}40`}
                strokeWidth={linkFrom === node.id ? 2 : 1}
              />
              <text x={node.w / 2} y={16} textAnchor="middle" fontSize="14" fill="#fff">
                {node.icon}
              </text>
              <text x={node.w / 2} y={29} textAnchor="middle" fontSize="9.5" fill="#e0f0ff" fontFamily="'Syne', sans-serif" fontWeight="600">
                {node.label.length > 18 ? node.label.slice(0, 17) + '…' : node.label}
              </text>
              <text x={node.w / 2} y={42} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.4)" fontFamily="'JetBrains Mono', monospace">
                {node.sublabel.length > 20 ? node.sublabel.slice(0, 19) + '…' : node.sublabel}
              </text>
            </g>
          ))}

          {annotations.map((ann) => (
            <g
              key={ann.id}
              onMouseDown={(e) => handleAnnotationMouseDown(e, ann)}
              onDoubleClick={(e) => handleAnnotationDoubleClick(e, ann)}
              style={{ cursor: mode === 'select' ? (dragAnnId === ann.id ? 'grabbing' : 'grab') : 'pointer' }}
            >
              <rect
                x={ann.x - 4}
                y={ann.y - 12}
                width={Math.min(ann.text.length * 6.2, 200)}
                height={18}
                rx={4}
                fill={`${ann.color}15`}
                stroke={`${ann.color}40`}
                strokeWidth="0.8"
              />
              <text x={ann.x} y={ann.y} fontSize="9" fill={ann.color} fontFamily="'JetBrains Mono', monospace" opacity={0.9}>
                {ann.text}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
