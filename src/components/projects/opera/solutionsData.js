/**
 * Opera integration solution diagrams data.
 * Used by BadarHMSView interactive diagrams (edits persisted in localStorage).
 */

export const solutions = [
  {
    id: 1,
    type: 'READ',
    label: 'Solution 1',
    title: 'Cloudflare Tunnel + Managed Cloud Replica',
    color: '#00C2FF',
    complexity: 2,
    cost: 'Low',
    nodes: [
      { id: 'opera', x: 60, y: 180, w: 130, h: 52, label: 'OPERA Oracle DB', icon: '🗄️', sublabel: 'On-Premises', color: '#1a2e4a' },
      { id: 'agent', x: 260, y: 180, w: 130, h: 52, label: 'On-Prem Agent', icon: '⚙️', sublabel: 'PII Masking + Scheduler', color: '#1a2e4a' },
      { id: 'cf', x: 460, y: 180, w: 130, h: 52, label: 'Cloudflare Tunnel', icon: '🔒', sublabel: 'Zero Trust Edge', color: '#1a3a2a' },
      { id: 'replica', x: 660, y: 180, w: 130, h: 52, label: 'Cloud Read-Replica', icon: '☁️', sublabel: 'AWS RDS / Supabase', color: '#1a2e4a' },
      { id: 'saas', x: 860, y: 180, w: 130, h: 52, label: 'SaaS App + MFA', icon: '🌐', sublabel: 'Stakeholder Access', color: '#2a1a3a' },
    ],
    arrows: [
      { from: 'opera', to: 'agent', label: 'SELECT only', style: 'solid' },
      { from: 'agent', to: 'cf', label: 'TLS 1.3 outbound', style: 'solid' },
      { from: 'cf', to: 'replica', label: 'Encrypted payload', style: 'solid' },
      { from: 'replica', to: 'saas', label: 'Read queries', style: 'solid' },
    ],
    annotations: [
      { id: 'a1', x: 260, y: 260, text: 'SC-2: PII masked here', color: '#FFB347' },
      { id: 'a2', x: 460, y: 130, text: 'TR-3: No static IP needed', color: '#00C2FF' },
      { id: 'a3', x: 660, y: 260, text: 'SA-2: Replica only', color: '#90EE90' },
    ],
    boundary: { x: 50, y: 155, w: 360, label: 'On-Premises LAN' },
  },
  {
    id: 2,
    type: 'READ',
    label: 'Solution 2',
    title: 'OXI/OHIP Business Events + AWS EventBridge',
    color: '#FF6B35',
    complexity: 3,
    cost: 'Medium',
    nodes: [
      { id: 'opera', x: 60, y: 180, w: 130, h: 52, label: 'OPERA PMS', icon: '🏨', sublabel: 'Business Event Source', color: '#1a2e4a' },
      { id: 'oxi', x: 260, y: 180, w: 130, h: 52, label: 'OXI/OHIP Listener', icon: '📡', sublabel: 'On-Prem Event Capture', color: '#1a2e4a' },
      { id: 'eb', x: 460, y: 180, w: 130, h: 52, label: 'AWS EventBridge', icon: '⚡', sublabel: 'Event Router', color: '#1a3a2a' },
      { id: 'lambda', x: 660, y: 140, w: 120, h: 48, label: 'Lambda (Upsert)', icon: 'λ', sublabel: 'DB Writer', color: '#1a3a2a' },
      { id: 'audit', x: 660, y: 220, w: 120, h: 48, label: 'Lambda (Audit)', icon: '📋', sublabel: 'Change Log', color: '#2a2a1a' },
      { id: 'rds', x: 860, y: 180, w: 130, h: 52, label: 'Cloud Read-Replica', icon: '☁️', sublabel: 'RDS Aurora', color: '#1a2e4a' },
    ],
    arrows: [
      { from: 'opera', to: 'oxi', label: 'Business Event', style: 'solid' },
      { from: 'oxi', to: 'eb', label: 'Webhook TLS 1.3', style: 'solid' },
      { from: 'eb', to: 'lambda', label: 'Route', style: 'solid' },
      { from: 'eb', to: 'audit', label: 'Route', style: 'solid' },
      { from: 'lambda', to: 'rds', label: 'Upsert', style: 'solid' },
    ],
    annotations: [
      { id: 'a1', x: 260, y: 260, text: 'TR-2: Async event trigger', color: '#FF6B35' },
      { id: 'a2', x: 460, y: 130, text: 'TR-1: Outbound only', color: '#00C2FF' },
      { id: 'a3', x: 660, y: 295, text: 'Full audit trail', color: '#90EE90' },
    ],
    boundary: { x: 50, y: 155, w: 360, label: 'On-Premises LAN' },
  },
  {
    id: 3,
    type: 'READ',
    label: 'Solution 3',
    title: 'ngrok Relay Agent + Encrypted Sync Queue',
    color: '#A78BFA',
    complexity: 2,
    cost: 'Low–Med',
    nodes: [
      { id: 'saasb', x: 60, y: 180, w: 130, h: 52, label: 'SaaS Cloud Backend', icon: '🌐', sublabel: 'Pull Signal Sender', color: '#2a1a3a' },
      { id: 'ngrok', x: 260, y: 180, w: 130, h: 52, label: 'ngrok Cloud Edge', icon: '🔄', sublabel: 'Reverse Proxy', color: '#1a3a2a' },
      { id: 'agent', x: 460, y: 180, w: 130, h: 52, label: 'On-Prem ngrok Agent', icon: '⚙️', sublabel: 'Outbound Tunnel', color: '#1a2e4a' },
      { id: 'oracle', x: 660, y: 180, w: 130, h: 52, label: 'OPERA Oracle DB', icon: '🗄️', sublabel: 'SELECT only', color: '#1a2e4a' },
      { id: 'queue', x: 460, y: 300, w: 130, h: 48, label: 'Cloud Queue', icon: '📦', sublabel: 'Redis / SQS Buffer', color: '#1a3a2a' },
      { id: 'replica2', x: 660, y: 300, w: 130, h: 48, label: 'Cloud Replica', icon: '☁️', sublabel: 'Read-Only Store', color: '#1a2e4a' },
    ],
    arrows: [
      { from: 'saasb', to: 'ngrok', label: 'Pull signal', style: 'dashed' },
      { from: 'ngrok', to: 'agent', label: 'Tunnel (outbound TCP)', style: 'solid' },
      { from: 'agent', to: 'oracle', label: 'SELECT query', style: 'solid' },
      { from: 'agent', to: 'queue', label: 'PII-masked payload', style: 'solid' },
      { from: 'queue', to: 'replica2', label: 'Reliable delivery', style: 'solid' },
    ],
    annotations: [
      { id: 'a1', x: 260, y: 130, text: 'TR-3: No port forwarding', color: '#A78BFA' },
      { id: 'a2', x: 460, y: 260, text: 'SC-2: Masked before queued', color: '#FFB347' },
      { id: 'a3', x: 660, y: 155, text: 'SC-3: Read-only creds', color: '#90EE90' },
    ],
    boundary: { x: 390, y: 155, w: 360, label: 'On-Premises LAN' },
  },
  {
    id: 4,
    type: 'READ',
    label: 'Solution 4',
    title: 'Azure Arc + Azure Relay Hybrid Connection',
    color: '#38BDF8',
    complexity: 4,
    cost: 'Med–High',
    nodes: [
      { id: 'oracle4', x: 60, y: 180, w: 130, h: 52, label: 'OPERA Oracle DB', icon: '🗄️', sublabel: 'On-Premises', color: '#1a2e4a' },
      { id: 'arc', x: 260, y: 180, w: 130, h: 52, label: 'Azure Arc Agent', icon: '🔵', sublabel: 'Arc-Enabled Listener', color: '#1a2e4a' },
      { id: 'relay', x: 460, y: 180, w: 130, h: 52, label: 'Azure Relay NS', icon: '🔗', sublabel: 'Hybrid Connection', color: '#1a3a2a' },
      { id: 'sb', x: 660, y: 180, w: 130, h: 52, label: 'Azure Service Bus', icon: '📨', sublabel: 'Message Broker', color: '#1a3a2a' },
      { id: 'sql', x: 860, y: 150, w: 120, h: 48, label: 'Azure SQL', icon: '💾', sublabel: 'Read-Replica', color: '#1a2e4a' },
      { id: 'entra', x: 860, y: 220, w: 120, h: 48, label: 'Entra ID + MFA', icon: '🛡️', sublabel: 'Zero Trust Auth', color: '#2a1a3a' },
    ],
    arrows: [
      { from: 'oracle4', to: 'arc', label: 'SELECT (read-only)', style: 'solid' },
      { from: 'arc', to: 'relay', label: 'Outbound registration', style: 'solid' },
      { from: 'relay', to: 'sb', label: 'TLS 1.3 message', style: 'solid' },
      { from: 'sb', to: 'sql', label: 'Hydrate replica', style: 'solid' },
      { from: 'entra', to: 'sql', label: 'Govern access', style: 'dashed' },
    ],
    annotations: [
      { id: 'a1', x: 260, y: 260, text: 'TR-1: Outbound registration', color: '#38BDF8' },
      { id: 'a2', x: 460, y: 130, text: 'TR-3: No inbound rules', color: '#00C2FF' },
      { id: 'a3', x: 860, y: 295, text: 'SA-1: Conditional Access', color: '#90EE90' },
    ],
    boundary: { x: 50, y: 155, w: 360, label: 'On-Premises LAN' },
  },
  {
    id: 5,
    type: 'READ',
    label: 'Solution 5',
    title: 'Temporal.io Workflow Engine + WireGuard Mesh',
    color: '#34D399',
    complexity: 4,
    cost: 'Medium',
    nodes: [
      { id: 'temporal', x: 60, y: 180, w: 130, h: 52, label: 'Temporal Cloud', icon: '⏱️', sublabel: 'Workflow Orchestrator', color: '#1a3a2a' },
      { id: 'worker', x: 300, y: 180, w: 130, h: 52, label: 'On-Prem Worker', icon: '⚙️', sublabel: 'Long-polls Temporal', color: '#1a2e4a' },
      { id: 'oracle5', x: 500, y: 180, w: 130, h: 52, label: 'OPERA Oracle DB', icon: '🗄️', sublabel: 'SELECT only', color: '#1a2e4a' },
      { id: 'wg', x: 180, y: 310, w: 240, h: 44, label: 'WireGuard Mesh VPN', icon: '🔐', sublabel: 'ChaCha20 + TLS 1.3', color: '#1a3a1a' },
      { id: 'replica5', x: 700, y: 180, w: 130, h: 52, label: 'Cloud Read-Replica', icon: '☁️', sublabel: 'Temporal Persists', color: '#1a2e4a' },
    ],
    arrows: [
      { from: 'worker', to: 'temporal', label: 'Long-poll (outbound)', style: 'solid' },
      { from: 'worker', to: 'oracle5', label: 'Assigned task → SELECT', style: 'solid' },
      { from: 'oracle5', to: 'replica5', label: 'Masked result', style: 'solid' },
    ],
    annotations: [
      { id: 'a1', x: 60, y: 130, text: 'TR-2: Workflow Signals', color: '#34D399' },
      { id: 'a2', x: 300, y: 260, text: 'TR-1: No inbound sessions', color: '#00C2FF' },
      { id: 'a3', x: 180, y: 370, text: 'SC-1: Double encryption', color: '#FFB347' },
    ],
    boundary: { x: 240, y: 155, w: 360, label: 'On-Premises LAN' },
  },
  {
    id: 'A',
    type: 'READ/WRITE',
    label: 'Solution A',
    title: 'Cloudflare Tunnel + Command Queue Pattern',
    color: '#F59E0B',
    complexity: 3,
    cost: 'Low–Med',
    nodes: [
      { id: 'user', x: 30, y: 80, w: 120, h: 48, label: 'SaaS User (MFA)', icon: '👤', sublabel: 'Write Intent', color: '#2a1a3a' },
      { id: 'cq', x: 200, y: 80, w: 130, h: 48, label: 'Command Queue', icon: '📬', sublabel: 'AWS SQS / Service Bus', color: '#1a3a2a' },
      { id: 'agenta', x: 400, y: 80, w: 130, h: 48, label: 'On-Prem Agent', icon: '⚙️', sublabel: 'Polls Queue Outbound', color: '#1a2e4a' },
      { id: 'sidecar', x: 600, y: 80, w: 130, h: 48, label: 'SaaS Sidecar DB', icon: '🗃️', sublabel: 'INSERT/UPDATE OK', color: '#1a3a2a' },
      { id: 'opera_a', x: 600, y: 185, w: 130, h: 48, label: 'OPERA Oracle DB', icon: '🗄️', sublabel: 'SELECT only — no write', color: '#3a1a1a' },
      { id: 'audit_a', x: 800, y: 80, w: 120, h: 48, label: 'Audit Log', icon: '📋', sublabel: 'Full Attribution', color: '#2a2a1a' },
    ],
    arrows: [
      { from: 'user', to: 'cq', label: 'Authenticated write', style: 'solid' },
      { from: 'agenta', to: 'cq', label: 'Poll (outbound)', style: 'dashed' },
      { from: 'agenta', to: 'sidecar', label: 'Schema-validated write', style: 'solid' },
      { from: 'agenta', to: 'opera_a', label: 'SELECT only', style: 'solid' },
      { from: 'sidecar', to: 'audit_a', label: 'Log entry', style: 'solid' },
    ],
    annotations: [
      { id: 'a1', x: 200, y: 155, text: 'SC-3: OPERA DB untouched', color: '#F59E0B' },
      { id: 'a2', x: 400, y: 155, text: 'TR-1: No inbound to LAN', color: '#00C2FF' },
      { id: 'a3', x: 600, y: 155, text: '⚠️ Write to sidecar only', color: '#FF6B6B' },
    ],
    boundary: { x: 340, y: 55, w: 250, label: 'On-Premises LAN' },
    writeWarning: true,
  },
  {
    id: 'B',
    type: 'READ/WRITE',
    label: 'Solution B',
    title: 'OHIP REST API Gateway with Scoped Write-Back',
    color: '#EC4899',
    complexity: 3,
    cost: 'Med–High',
    nodes: [
      { id: 'user_b', x: 50, y: 180, w: 130, h: 52, label: 'SaaS App (MFA)', icon: '👤', sublabel: 'OAuth 2.0 Token', color: '#2a1a3a' },
      { id: 'gw', x: 250, y: 180, w: 130, h: 52, label: 'API Gateway', icon: '🚪', sublabel: 'Kong / AWS APIGW', color: '#1a3a2a' },
      { id: 'ohip', x: 460, y: 180, w: 130, h: 52, label: 'OHIP REST API', icon: '🏛️', sublabel: 'Oracle-Managed', color: '#1a3a1a' },
      { id: 'opera_b', x: 680, y: 180, w: 130, h: 52, label: 'OPERA PMS', icon: '🏨', sublabel: 'OHIP Validates Writes', color: '#1a2e4a' },
      { id: 'log_b', x: 250, y: 300, w: 130, h: 48, label: 'Audit + Rate Limit', icon: '🛡️', sublabel: 'Gateway-Level', color: '#2a2a1a' },
    ],
    arrows: [
      { from: 'user_b', to: 'gw', label: 'Scoped OAuth token', style: 'solid' },
      { from: 'gw', to: 'ohip', label: 'Scope-enforced call', style: 'solid' },
      { from: 'ohip', to: 'opera_b', label: 'Validated write', style: 'solid' },
      { from: 'gw', to: 'log_b', label: 'Audit every call', style: 'dashed' },
    ],
    annotations: [
      { id: 'a1', x: 250, y: 260, text: 'SA-1: Scope taxonomy enforced', color: '#EC4899' },
      { id: 'a2', x: 460, y: 130, text: 'SC-3: No direct SQL writes', color: '#90EE90' },
      { id: 'a3', x: 680, y: 260, text: 'OHIP validates all mutations', color: '#FFB347' },
    ],
    boundary: { x: 400, y: 155, w: 370, label: 'Oracle-Managed / On-Prem' },
    writeWarning: true,
  },
  {
    id: 'C',
    type: 'READ/WRITE',
    label: 'Solution C',
    title: 'Event-Sourced CQRS Dual-Path Architecture',
    color: '#F87171',
    complexity: 5,
    cost: 'High',
    nodes: [
      { id: 'oracle_c', x: 30, y: 155, w: 120, h: 48, label: 'OPERA Oracle DB', icon: '🗄️', sublabel: 'Read source', color: '#1a2e4a' },
      { id: 'read_agent', x: 200, y: 155, w: 120, h: 48, label: 'On-Prem Read Agent', icon: '⚙️', sublabel: 'Pull-based sync', color: '#1a2e4a' },
      { id: 'replica_c', x: 380, y: 155, w: 120, h: 48, label: 'Cloud Replica', icon: '☁️', sublabel: 'Read target', color: '#1a2e4a' },
      { id: 'read_ui', x: 560, y: 155, w: 120, h: 48, label: 'SaaS Read UI', icon: '👁️', sublabel: 'Stakeholders', color: '#2a1a3a' },
      { id: 'write_ui', x: 560, y: 285, w: 120, h: 48, label: 'SaaS Write UI', icon: '✏️', sublabel: 'MFA-authenticated', color: '#2a1a3a' },
      { id: 'events', x: 380, y: 285, w: 120, h: 48, label: 'Event Store / Kafka', icon: '📚', sublabel: 'Immutable log', color: '#1a3a2a' },
      { id: 'cmd_proc', x: 200, y: 285, w: 120, h: 48, label: 'On-Prem Cmd Proc', icon: '⚙️', sublabel: 'Polls outbound', color: '#1a2e4a' },
      { id: 'sidecar_c', x: 30, y: 285, w: 120, h: 48, label: 'Sidecar / OHIP', icon: '🗃️', sublabel: 'Write target', color: '#1a3a2a' },
    ],
    arrows: [
      { from: 'oracle_c', to: 'read_agent', label: 'SELECT', style: 'solid' },
      { from: 'read_agent', to: 'replica_c', label: 'Sync', style: 'solid' },
      { from: 'replica_c', to: 'read_ui', label: 'Query', style: 'solid' },
      { from: 'write_ui', to: 'events', label: 'Append event', style: 'solid' },
      { from: 'cmd_proc', to: 'events', label: 'Subscribe (outbound)', style: 'dashed' },
      { from: 'cmd_proc', to: 'sidecar_c', label: 'Validated write', style: 'solid' },
    ],
    annotations: [
      { id: 'a1', x: 200, y: 120, text: 'QUERY PATH (Read)', color: '#38BDF8' },
      { id: 'a2', x: 200, y: 360, text: 'COMMAND PATH (Write)', color: '#F87171' },
      { id: 'a3', x: 380, y: 240, text: 'Append-only log — full audit', color: '#FFB347' },
    ],
    boundary: { x: 20, y: 130, w: 280, label: 'On-Premises LAN' },
    writeWarning: true,
  },
];

/** Emoji palette for nodes: databases, servers, clouds, wires, etc. */
export const NODE_ICONS = [
  '🗄️', '☁️', '⚙️', '🔒', '🌐', '📡', '⚡', '📋', '🔵', '🔗', '📨', '💾', '🛡️', '🏨', '🏛️', '⏱️', '🔐', '📦', '📚', '🗃️', '👤', '📬', '✏️', '👁️', '🔄', 'λ', '🔧', '📊', '🖥️', '🌍', '📶', '🔌', '📁', '🗂️', '📤', '📥',
];

const STORAGE_PREFIX = 'badar-hms-opera-diagram-';

export function loadDiagram(solutionId) {
  try {
    const raw = typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_PREFIX + solutionId);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (_) {}
  return null;
}

export function saveDiagram(solutionId, data) {
  try {
    if (typeof window !== 'undefined') {
      if (data == null) {
        window.localStorage.removeItem(STORAGE_PREFIX + solutionId);
      } else {
        window.localStorage.setItem(STORAGE_PREFIX + solutionId, JSON.stringify(data));
      }
    }
  } catch (_) {}
}
