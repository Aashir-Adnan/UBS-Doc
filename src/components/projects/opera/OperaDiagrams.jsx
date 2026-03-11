import React, { useState, useEffect } from 'react';
import { solutions } from './solutionsData';
import InteractiveDiagramCard from './InteractiveDiagramCard';

export default function OperaDiagrams() {
  const [activeId, setActiveId] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [expandedSolId, setExpandedSolId] = useState(null);

  useEffect(() => {
    if (!expandedSolId) return;
    const onKey = (e) => { if (e.key === 'Escape') setExpandedSolId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedSolId]);

  const readSolutions = solutions.filter((s) => s.type === 'READ');
  const rwSolutions = solutions.filter((s) => s.type === 'READ/WRITE');
  const displayed = filter === 'ALL' ? solutions : filter === 'READ' ? readSolutions : rwSolutions;
  const expandedSol = expandedSolId ? solutions.find((s) => s.id === expandedSolId) : null;

  return (
    <div className="opera-diagrams-wrapper" style={{ marginTop: 24 }}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
      <div
        style={{
          marginBottom: 24,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          paddingBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div
            style={{
              width: 4,
              height: 40,
              background: 'linear-gradient(180deg, #00C2FF, #A78BFA)',
              borderRadius: 2,
            }}
          />
          <div>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.35)',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.15em',
                marginBottom: 4,
              }}
            >
              SECURE HYBRID SAAS INTEGRATION — OPERA PMS v1.0
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: '#f0f8ff' }}>
              Solution Architecture Diagrams
            </h2>
          </div>
        </div>
        <p style={{ margin: '0 0 0 16px', color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
          Interactive diagrams · Drag nodes, add nodes/links/annotations · Edits saved in this browser
        </p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24, alignItems: 'center' }}>
        {['ALL', 'READ', 'READ/WRITE'].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? 'rgba(0, 194, 255, 0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${filter === f ? 'rgba(0, 194, 255, 0.5)' : 'rgba(255,255,255,0.1)'}`,
              color: filter === f ? '#00C2FF' : 'rgba(255,255,255,0.5)',
              padding: '7px 18px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              letterSpacing: '0.08em',
              transition: 'all 0.2s',
            }}
          >
            {f}
          </button>
        ))}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          <span>── solid: primary flow</span>
          <span style={{ borderTop: '1.5px dashed rgba(0,194,255,0.5)', width: 24, display: 'inline-block', verticalAlign: 'middle' }} />
          <span>dashed: signal/poll</span>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(255,200,50,0.15)', border: '1px dashed rgba(255,200,50,0.4)', display: 'inline-block', verticalAlign: 'middle' }} />
          <span>on-premises zone</span>
        </div>
      </div>

      {/* READ */}
      {(filter === 'ALL' || filter === 'READ') && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
            <span style={{ fontSize: 10, color: '#00C2FF', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.15em', padding: '0 12px' }}>
              READ-ONLY SOLUTIONS (1–5)
            </span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {readSolutions.map((sol) => (
              <div key={sol.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div onClick={() => setActiveId(activeId === sol.id ? null : sol.id)} style={{ cursor: 'pointer' }}>
                  <InteractiveDiagramCard sol={sol} isActive={activeId === sol.id} />
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setExpandedSolId(sol.id); }}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'rgba(0, 194, 255, 0.1)',
                    border: '1px solid rgba(0, 194, 255, 0.4)',
                    color: '#00C2FF',
                    padding: '6px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 600,
                  }}
                >
                  View larger
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* READ/WRITE */}
      {(filter === 'ALL' || filter === 'READ/WRITE') && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
            <span style={{ fontSize: 10, color: '#F59E0B', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.15em', padding: '0 12px' }}>
              READ / WRITE SOLUTIONS (A–C)
            </span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {rwSolutions.map((sol) => (
              <div key={sol.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div onClick={() => setActiveId(activeId === sol.id ? null : sol.id)} style={{ cursor: 'pointer' }}>
                  <InteractiveDiagramCard sol={sol} isActive={activeId === sol.id} />
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setExpandedSolId(sol.id); }}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'rgba(0, 194, 255, 0.1)',
                    border: '1px solid rgba(0, 194, 255, 0.4)',
                    color: '#00C2FF',
                    padding: '6px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 600,
                  }}
                >
                  View larger
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 40,
          paddingTop: 20,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: 10,
          color: 'rgba(255,255,255,0.2)',
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        OPERA PMS Integration PRD v1.0 — Edits stored in browser (localStorage) for Badar HMS project only.
      </div>

      {/* Large-view modal */}
      {expandedSol && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Diagram large view"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            boxSizing: 'border-box',
          }}
          onClick={() => setExpandedSolId(null)}
        >
          <div
            style={{
              maxWidth: '95vw',
              maxHeight: '95vh',
              width: 1400,
              background: 'linear-gradient(135deg, #0d1b2a 0%, #0a1520 100%)',
              borderRadius: 16,
              overflow: 'auto',
              position: 'relative',
              boxShadow: '0 0 80px rgba(0,194,255,0.15), 0 24px 48px rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setExpandedSolId(null)}
              aria-label="Close"
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                zIndex: 10,
                width: 36,
                height: 36,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.08)',
                color: '#e8f4fd',
                fontSize: 18,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              ×
            </button>
            <div style={{ padding: '24px 24px 24px 24px' }}>
              <InteractiveDiagramCard sol={expandedSol} isActive />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
