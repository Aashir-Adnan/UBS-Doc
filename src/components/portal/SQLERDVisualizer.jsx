import { useState, useRef, useCallback, useMemo, useEffect } from "react";

const TABLE_HEADER_H = 38;
const ROW_H = 28;
const TABLE_W = 250;
const COL_GAP = 160;
const ROW_GAP = 42;
const PAD_X = 70;
const PAD_Y = 55;

const PALETTE = {
  bg: "#0f1117",
  panel: "#171b2a",
  card: "#1a1d27",
  cardHead: "#212640",
  border: "#303a61",
  borderSoft: "#283055",
  txt: "#d8def4",
  txtSoft: "#8f9bc3",
  accent: "#7e8eff",
  fk: "#21d4a8",
  pk: "#ffd166",
  line: "#5b6ab5",
  lineHover: "#96a2ff",
  danger: "#f07167",
};

function parseSQL(sql) {
  const tables = {};
  const relationships = [];
  const clean = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s*\(([\s\S]*?)\)\s*;/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(clean)) !== null) {
    const tableName = tableMatch[1];
    const body = tableMatch[2];
    const columns = [];
    const primaryKeys = new Set();

    const pkLine = body.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
    if (pkLine) {
      pkLine[1]
        .split(",")
        .map((k) => k.trim().replace(/[`"]/g, ""))
        .forEach((k) => primaryKeys.add(k));
    }

    const lines = body.split(/,(?![^(]*\))/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const fkMatch = trimmed.match(
        /(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+[`"]?(\w+)[`"]?\s*\(([^)]+)\)/i
      );
      if (fkMatch) {
        relationships.push({
          from: tableName,
          fromCol: fkMatch[1].trim().replace(/[`"]/g, ""),
          to: fkMatch[2],
          toCol: fkMatch[3].trim().replace(/[`"]/g, ""),
        });
        continue;
      }
      if (/^\s*PRIMARY\s+KEY/i.test(trimmed)) continue;
      if (/^\s*(UNIQUE|INDEX|KEY)\b/i.test(trimmed)) continue;

      const colMatch = trimmed.match(/^[`"]?(\w+)[`"]?\s+([A-Za-z]+(?:\s*\([^)]*\))?)(.*)/i);
      if (!colMatch) continue;
      const colName = colMatch[1];
      const rawType = colMatch[2];
      const rest = colMatch[3] || "";
      const inlineFK = rest.match(/REFERENCES\s+[`"]?(\w+)[`"]?\s*\(([^)]+)\)/i);
      if (inlineFK) {
        relationships.push({
          from: tableName,
          fromCol: colName,
          to: inlineFK[1],
          toCol: inlineFK[2].trim().replace(/[`"]/g, ""),
        });
      }
      const isPK =
        primaryKeys.has(colName) ||
        /PRIMARY\s+KEY/i.test(rest) ||
        /AUTO_INCREMENT/i.test(rest) ||
        /SERIAL/i.test(rawType);
      if (isPK) primaryKeys.add(colName);
      columns.push({
        name: colName,
        type: rawType.toUpperCase(),
        isPK,
        isFK: !!inlineFK,
        isNotNull: isPK || /NOT\s+NULL/i.test(rest),
      });
    }

    relationships.forEach((r) => {
      if (r.from !== tableName) return;
      const c = columns.find((x) => x.name === r.fromCol);
      if (c) c.isFK = true;
    });

    tables[tableName] = { name: tableName, columns, x: 0, y: 0 };
  }
  return { tables, relationships };
}

function tableHeight(table) {
  return TABLE_HEADER_H + table.columns.length * ROW_H + 6;
}

function autoLayoutOrthogonal(inputTables, relationships) {
  const names = Object.keys(inputTables);
  if (!names.length) return inputTables;
  const out = {};
  names.forEach((n) => {
    out[n] = { ...inputTables[n] };
  });

  const indegree = {};
  const next = {};
  names.forEach((n) => {
    indegree[n] = 0;
    next[n] = [];
  });
  relationships.forEach((r) => {
    if (!(r.from in out) || !(r.to in out)) return;
    next[r.from].push(r.to);
    indegree[r.to] += 1;
  });

  const layer = {};
  const queue = names.filter((n) => indegree[n] === 0);
  queue.forEach((n) => {
    layer[n] = 0;
  });
  const q = [...queue];
  while (q.length) {
    const node = q.shift();
    const nodeLayer = layer[node] ?? 0;
    next[node].forEach((child) => {
      layer[child] = Math.max(layer[child] ?? 0, nodeLayer + 1);
      indegree[child] -= 1;
      if (indegree[child] === 0) q.push(child);
    });
  }
  names.forEach((n) => {
    if (!(n in layer)) layer[n] = 0;
  });

  const byLayer = {};
  names.forEach((n) => {
    const l = layer[n];
    if (!byLayer[l]) byLayer[l] = [];
    byLayer[l].push(n);
  });
  Object.keys(byLayer).forEach((l) => {
    byLayer[l].sort((a, b) => (next[b].length - next[a].length) || a.localeCompare(b));
  });

  Object.entries(byLayer).forEach(([layerIdx, layerNames]) => {
    let y = PAD_Y;
    const x = PAD_X + Number(layerIdx) * (TABLE_W + COL_GAP);
    layerNames.forEach((name) => {
      out[name].x = x;
      out[name].y = y;
      y += tableHeight(out[name]) + ROW_GAP;
    });
  });
  return out;
}

function getColumnCenterY(table, colName) {
  const idx = table.columns.findIndex((c) => c.name === colName);
  const row = idx >= 0 ? idx : 0;
  return table.y + TABLE_HEADER_H + row * ROW_H + ROW_H / 2;
}

function buildOrthogonalPath(from, to, rel) {
  const sourceOnLeft = from.x + TABLE_W <= to.x;
  const sourceOnRight = to.x + TABLE_W <= from.x;
  const y1 = getColumnCenterY(from, rel.fromCol);
  const y2 = getColumnCenterY(to, rel.toCol);
  let x1 = from.x + TABLE_W;
  let x2 = to.x;
  if (sourceOnRight) {
    x1 = from.x;
    x2 = to.x + TABLE_W;
  } else if (!sourceOnLeft) {
    x1 = from.x + TABLE_W;
    x2 = to.x + TABLE_W;
  }
  const midX = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
}

export default function SQLERDVisualizer() {
  const [tables, setTables] = useState({});
  const [relationships, setRelationships] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 30, y: 30 });
  const [hoveredRel, setHoveredRel] = useState(null);

  const svgRef = useRef(null);
  const fileRef = useRef(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);
  const pendingRef = useRef(null);

  const tableList = useMemo(() => Object.values(tables), [tables]);
  const relPaths = useMemo(() => {
    return relationships.map((rel, idx) => {
      const from = tables[rel.from];
      const to = tables[rel.to];
      if (!from || !to) return { idx, d: null, rel };
      return { idx, rel, d: buildOrthogonalPath(from, to, rel) };
    });
  }, [relationships, tables]);

  const toSvgPoint = useCallback(
    (e) => {
      const rect = svgRef.current.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - pan.x) / zoom,
        y: (e.clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan.x, pan.y, zoom]
  );

  const flushFrame = useCallback(() => {
    rafRef.current = 0;
    const task = pendingRef.current;
    pendingRef.current = null;
    if (!task) return;
    if (task.type === "drag") {
      setTables((prev) => ({
        ...prev,
        [task.name]: {
          ...prev[task.name],
          x: task.x,
          y: task.y,
        },
      }));
    } else if (task.type === "pan") {
      setPan({ x: task.x, y: task.y });
    }
  }, []);

  const schedule = useCallback(
    (task) => {
      pendingRef.current = task;
      if (!rafRef.current) {
        rafRef.current = window.requestAnimationFrame(flushFrame);
      }
    },
    [flushFrame]
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const applySql = useCallback((sqlText) => {
    const parsed = parseSQL(sqlText);
    if (!Object.keys(parsed.tables).length) {
      setError("No CREATE TABLE statements found.");
      return;
    }
    setTables(autoLayoutOrthogonal(parsed.tables, parsed.relationships));
    setRelationships(parsed.relationships);
    setLoaded(true);
    setError("");
    setPan({ x: 32, y: 32 });
    setZoom(1);
  }, []);

  const handleFile = useCallback(
    (file) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          applySql(String(e.target?.result || ""));
        } catch (err) {
          setError("Failed to parse SQL: " + err.message);
        }
      };
      reader.readAsText(file);
    },
    [applySql]
  );

  const onMouseDownCanvas = useCallback(
    (e) => {
      if (e.target === svgRef.current || e.target.tagName === "svg" || e.target.id === "erd-dots-bg") {
        setIsPanning(true);
        panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      }
    },
    [pan.x, pan.y]
  );

  const onMouseDownTable = useCallback(
    (e, name) => {
      e.stopPropagation();
      const pt = toSvgPoint(e);
      dragOffset.current = { x: pt.x - tables[name].x, y: pt.y - tables[name].y };
      setDragging(name);
    },
    [tables, toSvgPoint]
  );

  const onMouseMove = useCallback(
    (e) => {
      if (dragging) {
        const pt = toSvgPoint(e);
        schedule({
          type: "drag",
          name: dragging,
          x: pt.x - dragOffset.current.x,
          y: pt.y - dragOffset.current.y,
        });
      } else if (isPanning) {
        schedule({
          type: "pan",
          x: e.clientX - panStart.current.x,
          y: e.clientY - panStart.current.y,
        });
      }
    },
    [dragging, isPanning, toSvgPoint, schedule]
  );

  const onMouseUp = useCallback(() => {
    setDragging(null);
    setIsPanning(false);
  }, []);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    setZoom((z) => Math.min(2.2, Math.max(0.25, z - e.deltaY * 0.001)));
  }, []);

  return (
    <div
      className="sql-erd-visualizer"
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        handleFile(e.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".sql,.txt"
        style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {!loaded ? (
        <div className="sql-erd-uploader" onClick={() => fileRef.current?.click()}>
          <div className="sql-erd-uploader-title">Upload SQL to visualize ERD</div>
          <div className="sql-erd-uploader-sub">Drag and drop or click to browse</div>
          {error ? <div className="sql-erd-error">{error}</div> : null}
        </div>
      ) : (
        <div className="sql-erd-canvas-wrap">
          <div className="sql-erd-controls">
            <button type="button" onClick={() => fileRef.current?.click()}>
              Upload
            </button>
            <button type="button" onClick={() => setZoom((z) => Math.min(2.2, z + 0.1))}>
              +
            </button>
            <button type="button" onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))}>
              -
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 32, y: 32 });
                setTables((prev) => autoLayoutOrthogonal(prev, relationships));
              }}
            >
              Fit
            </button>
            <span>{Math.round(zoom * 100)}%</span>
          </div>

          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            className="sql-erd-canvas"
            onMouseDown={onMouseDownCanvas}
            onWheel={onWheel}
            style={{ cursor: isPanning ? "grabbing" : "grab" }}
          >
            <defs>
              <pattern id="erd-dots" width="18" height="18" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" fill={PALETTE.borderSoft} opacity="0.8" />
              </pattern>
              <marker id="erd-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill={PALETTE.line} />
              </marker>
              <marker id="erd-arrow-hover" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill={PALETTE.lineHover} />
              </marker>
            </defs>
            <rect id="erd-dots-bg" width="100%" height="100%" fill="url(#erd-dots)" />
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {relPaths.map(({ idx, d, rel }) => {
                if (!d) return null;
                const hovered = hoveredRel === idx;
                return (
                  <g key={`${rel.from}-${rel.fromCol}-${idx}`}>
                    <path
                      d={d}
                      stroke="transparent"
                      strokeWidth="14"
                      fill="none"
                      onMouseEnter={() => setHoveredRel(idx)}
                      onMouseLeave={() => setHoveredRel(null)}
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke={hovered ? PALETTE.lineHover : PALETTE.line}
                      strokeWidth={hovered ? 2.1 : 1.3}
                      strokeDasharray={hovered ? "none" : "7 3"}
                      markerEnd={`url(#erd-arrow${hovered ? "-hover" : ""})`}
                      pointerEvents="none"
                    />
                  </g>
                );
              })}

              {tableList.map((table) => {
                const h = tableHeight(table);
                return (
                  <g
                    key={table.name}
                    transform={`translate(${table.x}, ${table.y})`}
                    onMouseDown={(e) => onMouseDownTable(e, table.name)}
                    style={{ cursor: dragging === table.name ? "grabbing" : "grab" }}
                  >
                    <rect width={TABLE_W} height={h} rx="9" fill={PALETTE.card} stroke={PALETTE.border} />
                    <rect width={TABLE_W} height={TABLE_HEADER_H} rx="9" fill={PALETTE.cardHead} />
                    <rect width="4" height={TABLE_HEADER_H} rx="3" fill={PALETTE.accent} />
                    <text x={TABLE_W / 2} y={TABLE_HEADER_H / 2 + 5} textAnchor="middle" fontSize="12" fontWeight="600" fill={PALETTE.txt}>
                      {table.name}
                    </text>
                    {table.columns.map((col, i) => {
                      const y = TABLE_HEADER_H + i * ROW_H;
                      return (
                        <g key={col.name}>
                          {i % 2 === 0 ? <rect y={y} width={TABLE_W} height={ROW_H} fill="rgba(255,255,255,0.02)" /> : null}
                          <text
                            x="12"
                            y={y + 18}
                            fontSize="11"
                            fill={col.isPK ? PALETTE.pk : col.isFK ? PALETTE.fk : PALETTE.txt}
                            fontWeight={col.isPK ? "600" : "400"}
                          >
                            {col.isPK ? "PK " : col.isFK ? "FK " : ""}
                            {col.name}
                          </text>
                          <text x={TABLE_W - 10} y={y + 18} textAnchor="end" fontSize="10" fill={PALETTE.txtSoft}>
                            {col.type}
                          </text>
                          <line x1="0" y1={y + ROW_H} x2={TABLE_W} y2={y + ROW_H} stroke={PALETTE.borderSoft} strokeWidth="0.7" />
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      )}
    </div>
  );
}
