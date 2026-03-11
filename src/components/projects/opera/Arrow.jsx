import React from 'react';

/**
 * Renders an arrow between two nodes. Used by InteractiveDiagramCard.
 * arrowId optional – use for unique marker when multiple arrows share from/to.
 */
export default function Arrow({ id: arrowId, from, to, nodes, label, style: arrowStyle }) {
  const markerId = arrowId ? `arrow-m-${arrowId}` : `arrow-${from}-${to}`;
  const fn = nodes.find((n) => n.id === from);
  const tn = nodes.find((n) => n.id === to);
  if (!fn || !tn) return null;

  const fx = fn.x + fn.w;
  const fy = fn.y + fn.h / 2;
  const tx = tn.x;
  const ty = tn.y + tn.h / 2;

  const isVertical = Math.abs(fx - tx) < 30;

  let d;
  if (isVertical) {
    const fby = fn.y + fn.h;
    const tty = tn.y;
    d = `M ${fn.x + fn.w / 2} ${fby} L ${fn.x + fn.w / 2} ${(fby + tty) / 2} L ${tn.x + tn.w / 2} ${(fby + tty) / 2} L ${tn.x + tn.w / 2} ${tty}`;
  } else {
    const cx = (fx + tx) / 2;
    d = `M ${fx} ${fy} C ${cx} ${fy}, ${cx} ${ty}, ${tx} ${ty}`;
  }

  const midX = isVertical ? (fn.x + fn.w / 2 + tn.x + tn.w / 2) / 2 : (fx + tx) / 2;
  const midY = isVertical ? (fn.y + fn.h + tn.y) / 2 : (fy + ty) / 2 - 12;

  return (
    <g>
      <defs>
        <marker
          id={markerId}
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L8,3 z" fill="#00C2FF" opacity="0.8" />
        </marker>
      </defs>
      <path
        d={d}
        fill="none"
        stroke="#00C2FF"
        strokeWidth="1.5"
        strokeOpacity="0.6"
        strokeDasharray={arrowStyle === 'dashed' ? '6,4' : 'none'}
        markerEnd={`url(#${markerId})`}
      />
      {label != null && label !== '' && (
        <text
          x={midX}
          y={midY}
          textAnchor="middle"
          fontSize="9"
          fill="#8BC8E8"
          fontFamily="'JetBrains Mono', monospace"
        >
          {label}
        </text>
      )}
    </g>
  );
}
