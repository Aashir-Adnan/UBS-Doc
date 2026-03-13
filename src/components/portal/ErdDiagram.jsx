import React, { useState, useCallback, useRef, useMemo } from 'react';

const TABLE_MIN_WIDTH = 180;

function AddColumnForm({ onSubmit, onCancel }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('VARCHAR(255)');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit({ name: name.trim(), type: type.trim() || 'VARCHAR(255)' });
      }}
      className="erd-add-column-form"
    >
      <label>
        <span>Column name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="column_name" required />
      </label>
      <label>
        <span>Type</span>
        <input type="text" value={type} onChange={(e) => setType(e.target.value)} placeholder="INT, VARCHAR(255)…" />
      </label>
      <div className="erd-modal-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit">Add</button>
      </div>
    </form>
  );
}

const TABLE_HEADER_HEIGHT = 32;
const ROW_HEIGHT = 22;
const HORZ_PAD = 12;
const GRID_GAP = 48;
const COLS_PER_ROW = 5;
const DIAGRAM_WIDTH = 2400;
const DIAGRAM_HEIGHT = 1800;

function getTableDimensions(table) {
  const colCount = (table.columns || []).length;
  const headerW = Math.max(TABLE_MIN_WIDTH, (table.name?.length || 10) * 8 + HORZ_PAD * 2);
  const colW = Math.max(
    headerW,
    ...(table.columns || []).map((c) => (c.name?.length || 0) * 7 + (c.type?.length || 0) * 6 + 40)
  );
  const w = Math.min(260, Math.max(TABLE_MIN_WIDTH, colW));
  const h = TABLE_HEADER_HEIGHT + colCount * ROW_HEIGHT;
  return { w, h };
}

function gridLayout(tables, baseCount) {
  const dims = tables.map((t) => ({ ...getTableDimensions(t), id: t.name }));
  let x = 80;
  let y = 60;
  let maxH = 0;
  const positions = {};
  tables.forEach((t, i) => {
    const id = t.name;
    const { w, h } = dims[i];
    positions[id] = { x, y, w, h };
    maxH = Math.max(maxH, h);
    x += w + GRID_GAP;
    if ((i + 1) % COLS_PER_ROW === 0) {
      x = 80;
      y += maxH + GRID_GAP;
      maxH = 0;
    }
  });
  return positions;
}

function getColumnY(table, columnName, positions) {
  const pos = positions[table];
  if (!pos) return 0;
  const tableObj = { columns: [] };
  const idx = tableObj.columns.findIndex((c) => c.name === columnName);
  return pos.y + TABLE_HEADER_HEIGHT + (idx + 0.5) * ROW_HEIGHT;
}

export default function ErdDiagram({
  baseTables = [],
  projectTables = [],
  highlightUserFk = true,
  className = '',
  fullPage = false,
  tableMappings = {},
  onAddColumn = () => {},
  onDeleteTable = () => {},
  onMapTable = () => {},
}) {
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 });
  const [dragTable, setDragTable] = useState(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, tableX: 0, tableY: 0 });
  const [contextMenu, setContextMenu] = useState(null);
  const [mapSubmenu, setMapSubmenu] = useState(false);
  const [addColumnFor, setAddColumnFor] = useState(null);

  const allTables = useMemo(() => {
    const baseNames = new Set(baseTables.map((t) => t.name));
    const list = [
      ...baseTables.map((t) => ({ ...t, source: 'base', id: t.name })),
      ...projectTables.map((t) => ({
        ...t,
        source: 'project',
        id: baseNames.has(t.name) ? `${t.name}_project` : t.name,
      })),
    ];
    return list;
  }, [baseTables, projectTables]);

  const initialPositions = useMemo(
    () => gridLayout(allTables.map((t) => ({ ...t, name: t.id })), baseTables.length),
    [allTables, baseTables.length]
  );

  const [positions, setPositions] = useState(initialPositions);

  React.useEffect(() => {
    setPositions((prev) => {
      const next = { ...prev };
      let changed = false;
      Object.entries(initialPositions).forEach(([id, pos]) => {
        if (!(id in next)) {
          next[id] = pos;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [initialPositions]);

  const tablePositions = useMemo(() => {
    const dims = {};
    allTables.forEach((t) => {
      const { w, h } = getTableDimensions(t);
      const pos = positions[t.id] || initialPositions[t.id] || { x: 0, y: 0 };
      dims[t.id] = { ...pos, w, h, table: t };
    });
    return dims;
  }, [allTables, positions, initialPositions]);

  const nameToId = useMemo(() => {
    const m = {};
    allTables.forEach((t) => {
      m[t.name] = t.id;
    });
    return m;
  }, [allTables]);

  const relationships = useMemo(() => {
    const out = [];
    allTables.forEach((t) => {
      (t.foreignKeys || []).forEach((fk) => {
        const toId = nameToId[fk.refTable] || fk.refTable;
        out.push({
          fromTable: t.id,
          fromColumn: fk.column,
          toTable: toId,
          toColumn: fk.refColumn,
          isUserRef:
            highlightUserFk &&
            (fk.refTable?.toLowerCase() === 'users' || fk.refTable?.toLowerCase() === 'user' || fk.refColumn?.toLowerCase() === 'user_id'),
        });
      });
    });
    return out;
  }, [allTables, highlightUserFk, nameToId]);

  const getColumnRowIndex = useCallback(
    (tableId, columnName) => {
      const t = allTables.find((x) => x.id === tableId);
      if (!t || !t.columns) return 0;
      const idx = t.columns.findIndex((c) => c.name === columnName);
      return idx >= 0 ? idx : 0;
    },
    [allTables]
  );

  const linePath = useCallback(
    (rel) => {
      const from = tablePositions[rel.fromTable];
      const to = tablePositions[rel.toTable];
      if (!from || !to) return 'M 0 0';
      const fromRow = getColumnRowIndex(rel.fromTable, rel.fromColumn);
      const toRow = getColumnRowIndex(rel.toTable, rel.toColumn);
      const x1 = from.x + from.w;
      const y1 = from.y + TABLE_HEADER_HEIGHT + (fromRow + 0.5) * ROW_HEIGHT;
      const x2 = to.x;
      const y2 = to.y + TABLE_HEADER_HEIGHT + (toRow + 0.5) * ROW_HEIGHT;
      const midX = (x1 + x2) / 2;
      return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
    },
    [tablePositions, getColumnRowIndex]
  );

  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      const viewW = DIAGRAM_WIDTH / zoom;
      const viewH = DIAGRAM_HEIGHT / zoom;
      const cursorDiagramX = pan.x + (cursorX / rect.width) * viewW;
      const cursorDiagramY = pan.y + (cursorY / rect.height) * viewH;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(3, Math.max(0.2, zoom * factor));
      const newViewW = DIAGRAM_WIDTH / newZoom;
      const newViewH = DIAGRAM_HEIGHT / newZoom;
      setZoom(newZoom);
      setPan({
        x: cursorDiagramX - (cursorX / rect.width) * newViewW,
        y: cursorDiagramY - (cursorY / rect.height) * newViewH,
      });
    },
    [zoom, pan]
  );

  const handleMouseDown = useCallback(
    (e) => {
      if (e.target.closest('[data-erd-table]') || e.target.closest('[data-erd-line]')) return;
      setPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y });
    },
    [pan]
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (panning) {
        setPan({
          x: panStart.panX + (panStart.x - e.clientX),
          y: panStart.panY + (panStart.y - e.clientY),
        });
        return;
      }
      if (dragTable) {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const viewW = DIAGRAM_WIDTH / zoom;
        const viewH = DIAGRAM_HEIGHT / zoom;
        const scaleX = viewW / rect.width;
        const scaleY = viewH / rect.height;
        const dx = (e.clientX - dragStart.x) * scaleX;
        const dy = (e.clientY - dragStart.y) * scaleY;
        setPositions((prev) => ({
          ...prev,
          [dragTable]: {
            ...prev[dragTable],
            x: Math.max(0, dragStart.tableX + dx),
            y: Math.max(0, dragStart.tableY + dy),
          },
        }))
      }
    },
    [panning, panStart, dragTable, dragStart, zoom]
  );

  const handleMouseUp = useCallback(() => {
    setPanning(false);
    setDragTable(null);
  }, []);

  const handleTableHeaderMouseDown = useCallback(
    (e, tableId) => {
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;
      const pos = tablePositions[tableId];
      if (!pos) return;
      setDragTable(tableId);
      setDragStart({ x: e.clientX, y: e.clientY, tableX: pos.x, tableY: pos.y });
    },
    [tablePositions]
  );

  React.useEffect(() => {
    const onMove = (e) => handleMouseMove(e);
    const onUp = () => handleMouseUp();
    if (panning || dragTable) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
    }
  }, [panning, dragTable, handleMouseMove, handleMouseUp]);

  const viewBox = `${pan.x} ${pan.y} ${DIAGRAM_WIDTH / zoom} ${DIAGRAM_HEIGHT / zoom}`;

  const getProjectTableName = useCallback((tableId) => {
    return String(tableId).replace(/_project$/, '');
  }, []);

  const handleContextMenu = useCallback(
    (e, tableId) => {
      e.preventDefault();
      e.stopPropagation();
      const t = allTables.find((x) => x.id === tableId);
      if (!t) return;
      setContextMenu({ x: e.clientX, y: e.clientY, tableId, table: t, isProject: t.source === 'project' });
      setMapSubmenu(false);
    },
    [allTables]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setMapSubmenu(false);
    setAddColumnFor(null);
  }, []);

  React.useEffect(() => {
    if (!contextMenu) return;
    const onClick = () => closeContextMenu();
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [contextMenu, closeContextMenu]);

  const handleAddColumn = useCallback(() => {
    if (contextMenu) setAddColumnFor({ tableId: contextMenu.tableId, tableName: getProjectTableName(contextMenu.tableId) });
    closeContextMenu();
  }, [contextMenu, getProjectTableName, closeContextMenu]);

  const handleDeleteTable = useCallback(() => {
    if (contextMenu && contextMenu.isProject) onDeleteTable(getProjectTableName(contextMenu.tableId));
    closeContextMenu();
  }, [contextMenu, onDeleteTable, getProjectTableName, closeContextMenu]);

  const handleMapTo = useCallback(
    (baseTableName) => {
      if (contextMenu && contextMenu.isProject) onMapTable(getProjectTableName(contextMenu.tableId), baseTableName);
      closeContextMenu();
    },
    [contextMenu, onMapTable, getProjectTableName, closeContextMenu]
  );

  const baseNames = useMemo(() => baseTables.map((t) => t.name), [baseTables]);

  if (allTables.length === 0) {
    return (
      <div className={`erd-diagram-wrap ${className} ${fullPage ? 'erd-diagram-wrap--fullpage' : ''}`}>
        <div className="erd-diagram-empty">Parse project SQL to see the ERD.</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`erd-diagram-wrap ${className} ${fullPage ? 'erd-diagram-wrap--fullpage' : ''}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => {
        if (e.target.closest('[data-erd-table]')) return;
        e.preventDefault();
        setContextMenu(null);
      }}
      style={{ cursor: panning ? 'grabbing' : dragTable ? 'grabbing' : 'default' }}
    >
      {contextMenu && (
        <div
          className="erd-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.isProject && (
            <>
              <button type="button" className="erd-context-menu-item" onClick={handleAddColumn}>
                Add column
              </button>
              <div className="erd-context-menu-sub">
                <button
                  type="button"
                  className="erd-context-menu-item"
                  onMouseEnter={() => setMapSubmenu(true)}
                  onMouseLeave={() => setMapSubmenu(false)}
                >
                  Map table →
                </button>
                {mapSubmenu && (
                  <div className="erd-context-menu-submenu">
                    <button type="button" className="erd-context-menu-item" onClick={() => handleMapTo(null)}>
                      — New table —
                    </button>
                    {baseNames.map((b) => (
                      <button key={b} type="button" className="erd-context-menu-item" onClick={() => handleMapTo(b)}>
                        {b}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" className="erd-context-menu-item erd-context-menu-item--danger" onClick={handleDeleteTable}>
                Delete table
              </button>
            </>
          )}
          {!contextMenu.isProject && (
            <div className="erd-context-menu-item erd-context-menu-item--muted">Base table (right-click project tables to map)</div>
          )}
        </div>
      )}
      {addColumnFor && (
        <div className="erd-modal-overlay" onClick={closeContextMenu}>
          <div className="erd-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Add column to {addColumnFor.tableName}</h4>
            <AddColumnForm
              onSubmit={(col) => {
                onAddColumn(addColumnFor.tableName, col);
                setAddColumnFor(null);
              }}
              onCancel={() => setAddColumnFor(null)}
            />
          </div>
        </div>
      )}
      <div className="erd-diagram-toolbar">
        <span className="erd-diagram-hint">Drag canvas to pan · Scroll to zoom · Drag table header to move</span>
        <button type="button" className="erd-diagram-zoom-btn" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>
          +
        </button>
        <button type="button" className="erd-diagram-zoom-btn" onClick={() => setZoom((z) => Math.max(0.2, z - 0.2))}>
          −
        </button>
        <button
          type="button"
          className="erd-diagram-zoom-btn"
          onClick={() => {
            setPan({ x: 0, y: 0 });
            setZoom(0.85);
          }}
        >
          Reset
        </button>
      </div>
      <svg
        className="erd-diagram-svg"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{ cursor: panning ? 'grabbing' : 'grab' }}
      >
        <defs>
          <marker
            id="erd-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L8,3 z" fill="var(--ifm-color-primary)" opacity="0.9" />
          </marker>
        </defs>
        {/* Grid */}
        <g stroke="var(--ifm-color-emphasis-200)" strokeWidth="0.5" opacity="0.4">
          {Array.from({ length: Math.ceil(DIAGRAM_WIDTH / 80) }).map((_, i) => (
            <line key={`v${i}`} x1={i * 80} y1={0} x2={i * 80} y2={DIAGRAM_HEIGHT} />
          ))}
          {Array.from({ length: Math.ceil(DIAGRAM_HEIGHT / 80) }).map((_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 80} x2={DIAGRAM_WIDTH} y2={i * 80} />
          ))}
        </g>
        {/* Relationship lines */}
        <g>
          {relationships.map((rel, i) => {
            const from = tablePositions[rel.fromTable];
            const to = tablePositions[rel.toTable];
            if (!from || !to) return null;
            return (
              <path
                key={`${rel.fromTable}-${rel.fromColumn}-${i}`}
                data-erd-line
                d={linePath(rel)}
                fill="none"
                stroke={rel.isUserRef ? 'var(--ifm-color-primary)' : 'var(--ifm-color-emphasis-400)'}
                strokeWidth={rel.isUserRef ? 2 : 1.2}
                strokeOpacity={rel.isUserRef ? 0.9 : 0.5}
                markerEnd="url(#erd-arrow)"
              />
            );
          })}
        </g>
        {/* Table nodes */}
        {allTables.map((t) => {
          const pos = tablePositions[t.id];
          if (!pos) return null;
          const { w, h } = pos;
          const isBase = t.source === 'base';
          const pkSet = new Set(t.primaryKey || []);
          return (
            <g
              key={t.id}
              data-erd-table
              transform={`translate(${pos.x}, ${pos.y})`}
              className="erd-diagram-node"
              onContextMenu={(e) => handleContextMenu(e, t.id)}
            >
              <rect
                width={w}
                height={h}
                rx={8}
                ry={8}
                fill="var(--ifm-background-surface-color)"
                stroke={isBase ? 'var(--ifm-color-primary)' : 'var(--ifm-color-emphasis-300)'}
                strokeWidth={isBase ? 1.5 : 1}
                opacity={0.98}
              />
              <rect
                width={w}
                height={TABLE_HEADER_HEIGHT}
                rx={8}
                ry={0}
                fill={isBase ? 'var(--ifm-color-primary)' : 'var(--ifm-color-emphasis-200)'}
                opacity={isBase ? 0.25 : 0.15}
              />
              <rect
                x={0}
                y={0}
                width={w}
                height={TABLE_HEADER_HEIGHT}
                rx={8}
                ry={0}
                fill="transparent"
                onMouseDown={(ev) => handleTableHeaderMouseDown(ev, t.id)}
                style={{ cursor: 'grab' }}
              />
              <text
                x={w / 2}
                y={TABLE_HEADER_HEIGHT / 2 + 4}
                textAnchor="middle"
                fontSize={12}
                fontWeight="600"
                fill="var(--ifm-font-color-base)"
              >
                {t.name}
              </text>
              {(t.columns || []).map((col, idx) => {
                const isPk = pkSet.has(col.name);
                const fk = (t.foreignKeys || []).find((f) => f.column === col.name);
                const keyLabel = isPk ? 'PK' : fk ? 'FK' : '';
                return (
                  <g key={col.name}>
                    <line
                      x1={HORZ_PAD}
                      y1={TABLE_HEADER_HEIGHT + idx * ROW_HEIGHT}
                      x2={w - HORZ_PAD}
                      y2={TABLE_HEADER_HEIGHT + idx * ROW_HEIGHT}
                      stroke="var(--ifm-color-emphasis-200)"
                      strokeWidth="0.5"
                    />
                    <text
                      x={HORZ_PAD}
                      y={TABLE_HEADER_HEIGHT + (idx + 1) * ROW_HEIGHT - 6}
                      fontSize={10}
                      fill="var(--ifm-font-color-base)"
                      fontFamily="ui-monospace, monospace"
                    >
                      {col.name.length > 18 ? col.name.slice(0, 17) + '…' : col.name}
                    </text>
                    <text
                      x={w - HORZ_PAD - 4}
                      y={TABLE_HEADER_HEIGHT + (idx + 1) * ROW_HEIGHT - 6}
                      fontSize={9}
                      fill="var(--ifm-color-emphasis-600)"
                      fontFamily="ui-monospace, monospace"
                      textAnchor="end"
                    >
                      {keyLabel}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
