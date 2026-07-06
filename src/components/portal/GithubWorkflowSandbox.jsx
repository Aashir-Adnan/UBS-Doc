import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { mockFetchTrackedRepos, mockGhFetch } from './mockGithubData';

/* ─────────────────────────────────────────────
   GitHub API helpers (mock wrappers)
───────────────────────────────────────────── */

async function ghFetch(path, opts = {}) {
  return mockGhFetch(path, opts);
}

function extractEmail(body = '') {
  const m = body.match(/NotifyEmail:\s*([^\s]+)/);
  return m ? m[1] : null;
}

function getBotMarker(comment) {
  const body = comment?.body || '';
  const markerMatch = body.match(/(?:^|\n)\s*(🤖|⚠️|✅)\b/m);
  if (markerMatch?.[1]) return markerMatch[1];
  if (comment?.user?.type === 'Bot') return '🤖';
  return null;
}

function extractPrUrl(comments) {
  if (!comments) return null;
  for (let i = comments.length - 1; i >= 0; i--) {
    const body = comments[i]?.body || '';
    if (body.includes('**Committed and PR opened**')) {
      const m = body.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/);
      return m ? m[0] : null;
    }
  }
  return null;
}

function getIssueStage(comments) {
  if (!comments || comments.length === 0) return 'bot';
  const hasPrComment = comments.some((c) => (c.body || '').includes('**Committed and PR opened**'));
  if (hasPrComment) return 'done';
  const last = comments[comments.length - 1];
  if (getBotMarker(last)) return 'human';
  return 'bot';
}

function getLastBotEmoji(comments) {
  if (!comments || comments.length === 0) return null;
  const last = comments[comments.length - 1];
  return getBotMarker(last);
}

function buildIssueBody({ task, context, type, priority, email }) {
  const lines = ['[Agent Call]', '', 'Task:', task, ''];
  if (context && context.length > 0) {
    lines.push('Context:');
    lines.push(context.join(', '));
    lines.push('');
  }
  if (type) { lines.push('Type:'); lines.push(type); lines.push(''); }
  if (priority) { lines.push('Priority:'); lines.push(priority); lines.push(''); }
  if (email) { lines.push('NotifyEmail:'); lines.push(email); lines.push(''); }
  return lines.join('\n');
}

/* ─────────────────────────────────────────────
   File Explorer
───────────────────────────────────────────── */

function buildTree(flat) {
  const map = {};
  const roots = [];
  for (const item of flat) map[item.path] = { ...item, children: [] };
  for (const item of flat) {
    const parts = item.path.split('/');
    if (parts.length === 1) roots.push(map[item.path]);
    else {
      const parentPath = parts.slice(0, -1).join('/');
      if (map[parentPath]) map[parentPath].children.push(map[item.path]);
    }
  }
  const sort = (arr) => {
    arr.sort((a, b) => a.type === b.type ? a.path.localeCompare(b.path) : a.type === 'tree' ? -1 : 1);
    for (const node of arr) sort(node.children);
    return arr;
  };
  return sort(roots);
}

function TreeNode({ nodes, expanded, onToggle, onSelect, selected, depth }) {
  return (
    <ul className="gh-tree-list" style={{ paddingLeft: depth === 0 ? 0 : '1.1rem' }}>
      {nodes.map((node) => {
        const isDir = node.type === 'tree';
        const isOpen = expanded.has(node.path);
        const isSelected = selected.includes(node.path);
        const name = node.path.split('/').pop();
        return (
          <li key={node.path} className="gh-tree-item">
            <button
              type="button"
              className={`gh-tree-row${isSelected ? ' gh-tree-row--selected' : ''}`}
              onClick={() => isDir ? onToggle(node.path) : onSelect(node.path)}
            >
              <span className="gh-tree-icon">{isDir ? (isOpen ? '📂' : '📁') : '📄'}</span>
              <span className="gh-tree-name">{name}</span>
              {!isDir && isSelected && <span className="gh-tree-check">✓</span>}
            </button>
            {isDir && isOpen && node.children.length > 0 && (
              <TreeNode nodes={node.children} expanded={expanded} onToggle={onToggle}
                onSelect={onSelect} selected={selected} depth={depth + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FileExplorer({ owner, repo, onSelect, selected }) {
  const [tree, setTree] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    ghFetch(`/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`)
      .then((data) => setTree(data.tree || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [owner, repo]);

  const toggle = useCallback((path) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }, []);

  const handleSelect = useCallback((path) => {
    onSelect((prev) => prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]);
  }, [onSelect]);

  if (loading) return <div className="gh-explorer-loading">Loading tree…</div>;
  if (error) return <div className="gh-explorer-error">Error: {error}</div>;
  if (!tree) return null;

  return (
    <div className="gh-explorer">
      <TreeNode nodes={buildTree(tree)} expanded={expanded} onToggle={toggle}
        onSelect={handleSelect} selected={selected} depth={0} />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Issue Form
───────────────────────────────────────────── */

const TYPES = ['', 'Code Writer', 'Code Reviewer', 'Code Suggester'];
const PRIORITIES = ['', 'Immediate', 'High', 'Normal', 'Low', 'Minimal'];

function IssueForm({ repo, onCreated, userEmail }) {
  const [title, setTitle] = useState('');
  const [task, setTask] = useState('');
  const [context, setContext] = useState([]);
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showExplorer, setShowExplorer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !task.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = buildIssueBody({ task: task.trim(), context, type: type || undefined, priority: priority || undefined, email: userEmail });
      await ghFetch(`/repos/${repo.owner}/${repo.repo}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `[Agent Call] ${title.trim()}`, body }),
      });
      setTitle(''); setTask(''); setContext([]); setType(''); setPriority('Normal');
      setShowAdvanced(false); setShowExplorer(false);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="gh-issue-form" onSubmit={handleSubmit}>
      <div className="gh-form-field">
        <label className="gh-form-label">Brief title <span className="gh-form-required">*</span></label>
        <div className="gh-title-prefix-wrap">
          <span className="gh-title-prefix">[Agent Call]</span>
          <input className="gh-form-input gh-title-input" placeholder="e.g. Add structured error logging"
            value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
        </div>
      </div>

      <div className="gh-form-field">
        <label className="gh-form-label">Task description <span className="gh-form-required">*</span></label>
        <textarea className="gh-form-textarea"
          placeholder="Describe exactly what should be done. Be specific about expected behaviour, files to touch, and edge cases."
          value={task} onChange={(e) => setTask(e.target.value)} required rows={5} />
      </div>

      <div className="gh-advanced-toggle-row">
        <button type="button" className="gh-advanced-toggle" onClick={() => setShowAdvanced((v) => !v)}>
          <span className={`gh-advanced-arrow${showAdvanced ? ' open' : ''}`}>▸</span>
          Optional fields <span className="gh-optional-badge">optional</span>
        </button>
      </div>

      <div className={`gh-advanced-panel${showAdvanced ? ' gh-advanced-panel--open' : ''}`}>
        <div className="gh-advanced-panel-inner">
          <div className="gh-form-field">
            <label className="gh-form-label">Context paths <span className="gh-optional-badge gh-optional-badge--inline">optional</span></label>
            <p className="gh-context-warning">
              <span>⚠️</span> Context is entirely optional — the agent works without it. Only add paths if directly relevant; a wrong path can mislead the agent.
            </p>
            <button type="button" className={`gh-explorer-toggle${showExplorer ? ' gh-explorer-toggle--open' : ''}`}
              onClick={() => setShowExplorer((v) => !v)}>
              <span className={`gh-advanced-arrow${showExplorer ? ' open' : ''}`}>▸</span>
              {showExplorer ? 'Hide file explorer' : 'Browse repository files'}
            </button>
            {showExplorer && (
              <div className="gh-explorer-inline">
                <FileExplorer owner={repo.owner} repo={repo.repo} onSelect={setContext} selected={context} />
              </div>
            )}
            {context.length > 0 && (
              <div className="gh-context-chips">
                {context.map((p) => (
                  <span key={p} className="gh-context-chip">
                    {p}
                    <button type="button" className="gh-chip-remove" onClick={() => setContext((prev) => prev.filter((x) => x !== p))}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="gh-form-row--cols">
            <div className="gh-form-field">
              <label className="gh-form-label">Type</label>
              <select className="gh-form-select" value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => <option key={t} value={t}>{t || '— not specified —'}</option>)}
              </select>
            </div>
            <div className="gh-form-field">
              <label className="gh-form-label">Priority</label>
              <select className="gh-form-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p || '— not specified —'}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="gh-form-error">{error}</p>}

      <div className="gh-form-actions">
        <button type="submit" className="gh-submit-btn" disabled={submitting || !title.trim() || !task.trim()}>
          {submitting ? <><span className="status-spinner" /> Creating…</> : 'Create issue'}
        </button>
        <span className="gh-form-hint">Filed under <strong>{repo.owner}/{repo.repo}</strong></span>
      </div>
    </form>
  );
}

/* ─────────────────────────────────────────────
   Comment Reply Box
───────────────────────────────────────────── */

function ReplyBox({ repo, issue, comments, onReplied }) {
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const emoji = getLastBotEmoji(comments);
  const isWarning = emoji === '⚠️';
  const action = isWarning ? '!continue' : '!discuss';
  const placeholder = isWarning
    ? 'Reduce the Context paths and describe what to narrow down.'
    : 'Describe what to change or refine — the agent will update the PR.';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = info.trim() ? `${action}\n\n${info.trim()}` : action;
      await ghFetch(`/repos/${repo.owner}/${repo.repo}/issues/${issue.number}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      setInfo('');
      onReplied();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="gh-reply-box" onSubmit={handleSubmit}>
      <p className="gh-reply-label">
        {isWarning
          ? 'Context too large — reduce paths, then continue:'
          : 'Request a change or refinement:'}
      </p>
      <textarea className="gh-reply-info" rows={3} placeholder={placeholder}
        value={info} onChange={(e) => setInfo(e.target.value)} />
      {error && <p className="gh-form-error" style={{ margin: 0 }}>{error}</p>}
      <button type="submit" className="gh-submit-btn gh-submit-btn--sm" disabled={submitting}>
        {submitting ? <><span className="status-spinner" /> Sending…</> : `Send ${action}`}
      </button>
    </form>
  );
}

/* ─────────────────────────────────────────────
   Issue Row
───────────────────────────────────────────── */

function IssueRow({ issue, comments, repo, currentUserEmail, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [openComments, setOpenComments] = useState({});

  const stage = issue.state === 'closed' ? 'done' : getIssueStage(comments);
  const isDone = stage === 'done';
  const awaitingHuman = stage === 'human';
  const myIssue = extractEmail(issue.body || '')?.toLowerCase() === (currentUserEmail || '').toLowerCase();
  const prUrl = isDone ? extractPrUrl(comments) : null;

  const stageLabel = isDone ? 'PR Ready' : awaitingHuman ? 'Awaiting Your Response' : 'Awaiting Bot Response';
  const rowClass = [
    'gh-issue-row',
    isDone ? ' gh-issue-row--done' : '',
    awaitingHuman ? ' gh-issue-row--alert' : '',
    open ? ' gh-issue-row--open' : '',
  ].join('');

  const lightClass = `gh-status-light${isDone ? ' gh-status-light--done' : awaitingHuman ? ' gh-status-light--alert' : ' gh-status-light--ok'}`;

  return (
    <div className={rowClass}>
      <button type="button" className="gh-issue-row-header" onClick={() => setOpen((v) => !v)}>
        <span className={lightClass} />
        <span className="gh-status-number">#{issue.number}</span>
        <span className="gh-status-title">{issue.title.replace(/^\[Agent Call\]\s*/, '')}</span>
        <div className="gh-status-meta">
          {myIssue && <span className="gh-status-badge gh-status-badge--mine">mine</span>}
          <span className={`gh-stage-badge gh-stage-badge--${stage}`}>{stageLabel}</span>
          {prUrl && (
            <a href={prUrl} target="_blank" rel="noopener noreferrer"
              className="gh-pr-badge" onClick={(e) => e.stopPropagation()}>
              ⎇ View PR ↗
            </a>
          )}
          {comments.length > 0 && <span className="gh-status-comments">💬 {comments.length}</span>}
          <span className={`gh-chevron${open ? ' open' : ''}`}>▸</span>
        </div>
      </button>

      <div className={`gh-issue-detail${open ? ' gh-issue-detail--open' : ''}`}>
        <div className="gh-issue-detail-inner">
          {isDone && prUrl && (
            <div className="gh-pr-ready-banner">
              <span>✅ PR is ready.</span>
              <a href={prUrl} target="_blank" rel="noopener noreferrer">Review &amp; merge ↗</a>
              <span className="gh-pr-refine-hint">Need changes? Reply below with <code>!discuss</code> — the agent will update the same PR.</span>
            </div>
          )}

          <pre className="gh-issue-body-pre">{issue.body}</pre>

          {comments.length > 0 && (
            <div className="gh-comments-section">
              <button type="button" className="gh-comments-toggle" onClick={() => setCommentsOpen((v) => !v)}>
                <span className={`gh-advanced-arrow${commentsOpen ? ' open' : ''}`}>▸</span>
                {commentsOpen ? 'Hide' : 'Show'} {comments.length} comment{comments.length !== 1 ? 's' : ''}
              </button>
              <div className={`gh-comments-list${commentsOpen ? ' gh-comments-list--open' : ''}`}>
                <div className="gh-comments-list-inner">
                  {comments.map((c) => {
                    const botMarker = getBotMarker(c);
                    const isBot = !!botMarker;
                    const isCommentOpen = !!openComments[c.id];
                    const preview = (c.body || '').replace(/\s+/g, ' ').trim();
                    return (
                      <div key={c.id} className={`gh-comment${isBot ? ' gh-comment--bot' : ''}`}>
                        <button
                          type="button"
                          className="gh-comment-toggle"
                          onClick={() => setOpenComments((prev) => ({ ...prev, [c.id]: !prev[c.id] }))}
                        >
                          <span className="gh-comment-author">{isBot ? botMarker : '👤'} {c.user?.login}</span>
                          <span className="gh-comment-time">{new Date(c.created_at).toLocaleString()}</span>
                          <span className={`gh-comment-chevron${isCommentOpen ? ' open' : ''}`}>▸</span>
                        </button>
                        {isCommentOpen ? (
                          <p className="gh-comment-body">{c.body}</p>
                        ) : (
                          <p className="gh-comment-preview">{preview || '(empty comment)'}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {(awaitingHuman || isDone) && (
            <ReplyBox repo={repo} issue={issue} comments={comments} onReplied={onRefresh} />
          )}

          <span className="gh-status-open-link" style={{ opacity: 0.4, cursor: 'default' }}>
            Open on GitHub ↗ (sandbox — links disabled)
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Issues Panel
───────────────────────────────────────────── */

function IssuesPanel({ repo, currentUserEmail, onNewNotification, refreshTick, onRefresh }) {
  const [issues, setIssues] = useState([]);
  const [commentMap, setCommentMap] = useState({});
  const [loading, setLoading] = useState(false);
  const prevCommentCounts = useRef({});

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    try {
      const [openData, closedData] = await Promise.all([
        ghFetch(`/repos/${repo.owner}/${repo.repo}/issues?state=open&per_page=50`),
        ghFetch(`/repos/${repo.owner}/${repo.repo}/issues?state=closed&per_page=50`),
      ]);
      const data = [...openData, ...closedData];
      const agentIssues = data.filter((i) => !i.pull_request && (i.title?.startsWith('[Agent Call]') || i.body?.includes('[Agent Call]')));
      setIssues(agentIssues);
      const entries = await Promise.all(
        agentIssues.slice(0, 20).map(async (issue) => {
          try {
            const comments = await ghFetch(`/repos/${repo.owner}/${repo.repo}/issues/${issue.number}/comments`);
            return [issue.number, comments];
          } catch { return [issue.number, []]; }
        })
      );
      setCommentMap(Object.fromEntries(entries));
    } catch { /* silent */ } finally { setLoading(false); }
  }, [repo]);

  useEffect(() => { fetchIssues(); }, [fetchIssues, refreshTick]);

  useEffect(() => {
    for (const [numStr, comments] of Object.entries(commentMap)) {
      const num = Number(numStr);
      const issue = issues.find((i) => i.number === num);
      if (!issue) continue;
      const email = extractEmail(issue.body || '');
      if (!email || email.toLowerCase() !== (currentUserEmail || '').toLowerCase()) continue;
      const prev = prevCommentCounts.current[num] ?? comments.length;
      if (comments.length > prev) {
        const last = comments[comments.length - 1];
        onNewNotification({
          id: `${num}-${comments.length}`,
          issueNumber: num,
          issueTitle: issue.title,
          commenter: last.user?.login,
          preview: last.body?.slice(0, 120),
          url: '#',
          repoLabel: `${repo.owner}/${repo.repo}`,
          ts: Date.now(),
        });
      }
      prevCommentCounts.current[num] = comments.length;
    }
  }, [commentMap, issues, currentUserEmail, onNewNotification]);

  if (loading && issues.length === 0) return <div className="gh-status-loading">Loading issues…</div>;
  if (issues.length === 0) return <div className="gh-status-empty">No open agent issues in this repository.</div>;

  return (
    <div className="gh-issues-list">
      {issues.map((issue) => (
        <IssueRow key={issue.number} issue={issue} comments={commentMap[issue.number] || []}
          repo={repo} currentUserEmail={currentUserEmail} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Pull Requests Panel
───────────────────────────────────────────── */

function PRFileList({ owner, repo, prNumber }) {
  const [files, setFiles] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=50`)
      .then(setFiles)
      .catch((e) => setError(e.message));
  }, [owner, repo, prNumber]);

  if (error) return <p className="gh-pr-files-error">Could not load files: {error}</p>;
  if (!files) return <p className="gh-pr-files-loading">Loading changed files…</p>;
  if (files.length === 0) return <p className="gh-pr-files-empty">No changed files.</p>;

  return (
    <ul className="gh-pr-files-list">
      {files.map((f) => (
        <li key={f.filename} className={`gh-pr-file gh-pr-file--${f.status}`}>
          <span className="gh-pr-file-status">{f.status}</span>
          <span className="gh-pr-file-name">{f.filename}</span>
          <span className="gh-pr-file-stats">
            {f.additions > 0 && <span className="gh-pr-adds">+{f.additions}</span>}
            {f.deletions > 0 && <span className="gh-pr-dels">−{f.deletions}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

const PING_MARKER = 'Sent via the UBS Dev Portal';

function PingConfirmModal({ pr, onConfirm, onCancel }) {
  return (
    <div className="gh-modal-overlay" onClick={onCancel}>
      <div className="gh-modal" onClick={(e) => e.stopPropagation()}>
        <p className="gh-modal-title">Ping to merge?</p>
        <div className="gh-modal-body">
          <p className="gh-modal-pr-title">{pr.title}</p>
          <p className="gh-modal-pr-meta">
            #{pr.number} · {pr.user?.login} · {pr.head?.ref} → {pr.base?.ref}
          </p>
          <p className="gh-modal-description">
            This will post a comment on the PR asking the author to review and merge it.
          </p>
        </div>
        <div className="gh-modal-actions">
          <button type="button" className="gh-modal-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="gh-modal-confirm" onClick={onConfirm}>Send ping</button>
        </div>
      </div>
    </div>
  );
}

function PRRow({ pr, owner, repo, user }) {
  const [open, setOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pingStatus, setPingStatus] = useState(null);
  const [pingError, setPingError] = useState(null);
  const [pings, setPings] = useState(null);
  const [pingsOpen, setPingsOpen] = useState(false);
  const [deletingIds, setDeletingIds] = useState(new Set());

  const createdAt = new Date(pr.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const isDraft = pr.draft;
  const isMergeable = pr.mergeable === true;

  const loadPings = useCallback(async () => {
    try {
      const comments = await ghFetch(`/repos/${owner}/${repo}/issues/${pr.number}/comments`);
      setPings(comments.filter((c) => (c.body || '').includes(PING_MARKER)));
    } catch { setPings([]); }
  }, [owner, repo, pr.number]);

  useEffect(() => {
    if (open) loadPings();
  }, [open, loadPings]);

  const refreshPings = () => { setPings(null); loadPings(); };

  const handlePingConfirmed = async () => {
    setShowConfirm(false);
    setPingStatus('sending');
    setPingError(null);
    try {
      const sender = user?.name || user?.email || 'A team member';
      const body = `👋 **Merge request** from ${sender}\n\nThis PR is ready for review and merge. Please take a look when you get a chance.\n\n> _${PING_MARKER}_`;
      await ghFetch(`/repos/${owner}/${repo}/issues/${pr.number}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      setPingStatus('sent');
      refreshPings();
    } catch (err) {
      setPingStatus('error');
      setPingError(err.message);
    }
  };

  const handleDeletePing = async (commentId) => {
    setDeletingIds((prev) => new Set(prev).add(commentId));
    try {
      await ghFetch(`/repos/${owner}/${repo}/issues/comments/${commentId}`, { method: 'DELETE' });
      setPings((prev) => (prev || []).filter((c) => c.id !== commentId));
      if (pingStatus === 'sent') setPingStatus(null);
    } catch { /* silent */ } finally {
      setDeletingIds((prev) => { const s = new Set(prev); s.delete(commentId); return s; });
    }
  };

  return (
    <>
      {showConfirm && (
        <PingConfirmModal
          pr={pr}
          onConfirm={handlePingConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      <div className={`gh-pr-card${open ? ' gh-pr-card--open' : ''}${isDraft ? ' gh-pr-card--draft' : ''}`}>
        <button type="button" className="gh-pr-card-header" onClick={() => setOpen((v) => !v)}>
          <span className="gh-pr-icon">⎇</span>
          <div className="gh-pr-info">
            <span className="gh-pr-title">
              {isDraft && <span className="gh-pr-draft-tag">Draft</span>}
              {pr.title}
            </span>
            <span className="gh-pr-meta">
              #{pr.number} · {pr.user?.login} · {pr.head?.ref} → {pr.base?.ref} · {createdAt}
              {pr.comments > 0 && ` · 💬 ${pr.comments}`}
            </span>
          </div>
          <div className="gh-pr-card-actions" onClick={(e) => e.stopPropagation()}>
            {pingStatus === 'sent' ? (
              <span className="gh-ping-sent">Pinged ✓</span>
            ) : (
              <button
                type="button"
                className="gh-ping-btn"
                disabled={pingStatus === 'sending'}
                onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
                title="Post a comment on this PR asking the owner to merge it"
              >
                {pingStatus === 'sending' ? 'Pinging…' : 'Ping to merge'}
              </button>
            )}
            <span className="gh-pr-open-link" title="Links disabled in sandbox">↗</span>
          </div>
          <span className={`gh-chevron${open ? ' open' : ''}`}>▸</span>
        </button>

        {pingStatus === 'error' && (
          <p className="gh-ping-error">Failed to ping: {pingError}</p>
        )}

        {open && (
          <div className="gh-pr-card-body">
            {isMergeable && (
              <div className="gh-pr-mergeable-banner">✅ No merge conflicts — ready to merge.</div>
            )}
            {pr.mergeable === false && (
              <div className="gh-pr-conflict-banner">⚠️ This branch has conflicts with the base branch.</div>
            )}

            {pr.body ? (
              <div className="gh-pr-description">
                <p className="gh-pr-section-label">Description</p>
                <pre className="gh-pr-body-pre">{pr.body}</pre>
              </div>
            ) : (
              <p className="gh-pr-no-body">No description provided.</p>
            )}

            <div className="gh-pr-files-section">
              <p className="gh-pr-section-label">Changed files</p>
              <PRFileList owner={owner} repo={repo} prNumber={pr.number} />
            </div>

            <div className="gh-pr-pings-section">
              <button type="button" className="gh-comments-toggle" onClick={() => setPingsOpen((v) => !v)}>
                <span className={`gh-advanced-arrow${pingsOpen ? ' open' : ''}`}>▸</span>
                {pingsOpen ? 'Hide' : 'Show'} pings
                {pings !== null && pings.length > 0 && ` (${pings.length})`}
              </button>
              {pingsOpen && (
                <div className="gh-pings-list">
                  {pings === null && <p className="gh-pings-loading">Loading…</p>}
                  {pings !== null && pings.length === 0 && (
                    <p className="gh-pings-empty">No pings sent yet.</p>
                  )}
                  {pings !== null && pings.map((c) => (
                    <div key={c.id} className="gh-ping-item">
                      <div className="gh-ping-item-info">
                        <span className="gh-ping-item-author">{c.user?.login}</span>
                        <span className="gh-ping-item-time">{new Date(c.created_at).toLocaleString()}</span>
                      </div>
                      <button
                        type="button"
                        className="gh-ping-delete-btn"
                        disabled={deletingIds.has(c.id)}
                        onClick={() => handleDeletePing(c.id)}
                        title="Delete this ping"
                      >
                        {deletingIds.has(c.id) ? '…' : '✕'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function PRsPanel({ repo, user }) {
  const [prs, setPrs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stateFilter, setStateFilter] = useState('open');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    ghFetch(`/repos/${repo.owner}/${repo.repo}/pulls?state=${stateFilter}&per_page=30`)
      .then(setPrs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [repo, stateFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="gh-prs-panel">
      <div className="gh-prs-filter-row">
        {['open', 'closed', 'all'].map((s) => (
          <button key={s} type="button"
            className={`gh-prs-filter-btn${stateFilter === s ? ' gh-prs-filter-btn--active' : ''}`}
            onClick={() => setStateFilter(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <button type="button" className="gh-refresh-btn" onClick={load} title="Refresh">↻</button>
      </div>

      {loading && <div className="gh-status-loading">Loading pull requests…</div>}
      {error && <div className="gh-explorer-error">Could not load PRs: {error}</div>}
      {!loading && !error && prs.length === 0 && (
        <div className="gh-status-empty">No {stateFilter === 'all' ? '' : stateFilter + ' '}pull requests.</div>
      )}
      {!loading && !error && prs.length > 0 && (
        <div className="gh-pr-list">
          {prs.map((pr) => (
            <PRRow key={pr.number} pr={pr} owner={repo.owner} repo={repo.repo} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Notification Bell (top-bar)
───────────────────────────────────────────── */

function NotificationBell({ notifications, onDismiss, onDismissAll }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const [wiggle, setWiggle] = useState(false);
  const count = notifications.length;
  const prevCount = useRef(count);

  useEffect(() => {
    if (count > prevCount.current) {
      setWiggle(true);
      setTimeout(() => setWiggle(false), 800);
    }
    prevCount.current = count;
  }, [count]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="gh-notif-bell-wrap" ref={ref}>
      <button type="button" className={`gh-notif-bell${wiggle ? ' gh-notif-bell--wiggle' : ''}`}
        onClick={() => setOpen((v) => !v)} aria-label={`${count} notifications`}>
        🔔
        {count > 0 && <span className="gh-notif-count">{count}</span>}
      </button>

      <div className={`gh-notif-dropdown${open ? ' gh-notif-dropdown--open' : ''}`}>
        <div className="gh-notif-dropdown-header">
          <span>Notifications</span>
          {count > 0 && <button type="button" className="gh-notif-clear-all" onClick={onDismissAll}>Clear all</button>}
        </div>
        {count === 0 ? (
          <p className="gh-notif-empty">No new notifications</p>
        ) : (
          <ul className="gh-notif-list">
            {notifications.map((n) => (
              <li key={n.id} className="gh-notif-item">
                <div className="gh-notif-item-top">
                  <span className="gh-notif-link">{n.issueTitle}</span>
                  <button type="button" className="gh-notif-dismiss" onClick={() => onDismiss(n.id)}>×</button>
                </div>
                <p className="gh-notif-meta"><strong>{n.commenter}</strong> commented · {n.repoLabel}#{n.issueNumber}</p>
                {n.preview && <p className="gh-notif-preview">"{n.preview}"</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Floating Notification Toast (bottom-right)
───────────────────────────────────────────── */

function NotificationToast({ notifications, onDismiss, onDismissAll }) {
  const [open, setOpen] = useState(false);
  const [wiggle, setWiggle] = useState(false);
  const count = notifications.length;
  const prevCount = useRef(count);

  useEffect(() => {
    if (count > prevCount.current) {
      setWiggle(true);
      setTimeout(() => setWiggle(false), 800);
    }
    prevCount.current = count;
  }, [count]);

  useEffect(() => {
    if (count === 0) return;
    const id = setInterval(() => {
      setWiggle(true);
      setTimeout(() => setWiggle(false), 800);
    }, 60_000);
    return () => clearInterval(id);
  }, [count]);

  if (count === 0 && !open) return null;

  return (
    <div className="gh-toast-wrap">
      <div className={`gh-toast-panel${open ? ' gh-toast-panel--open' : ''}`}>
        <div className="gh-notif-dropdown-header">
          <span>Notifications</span>
          {count > 0 && <button type="button" className="gh-notif-clear-all" onClick={onDismissAll}>Clear all</button>}
        </div>
        {count === 0 ? (
          <p className="gh-notif-empty">No new notifications</p>
        ) : (
          <ul className="gh-notif-list">
            {notifications.map((n) => (
              <li key={n.id} className="gh-notif-item">
                <div className="gh-notif-item-top">
                  <span className="gh-notif-link">{n.issueTitle}</span>
                  <button type="button" className="gh-notif-dismiss" onClick={() => onDismiss(n.id)}>×</button>
                </div>
                <p className="gh-notif-meta"><strong>{n.commenter}</strong> · {n.repoLabel}#{n.issueNumber}</p>
                {n.preview && <p className="gh-notif-preview">"{n.preview}"</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className={`gh-toast-btn${wiggle ? ' gh-notif-bell--wiggle' : ''}`}
        onClick={() => setOpen((v) => !v)}>
        🔔 {count > 0 && <span className="gh-notif-count gh-notif-count--toast">{count}</span>}
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Repo Workspace (sidebar layout)
───────────────────────────────────────────── */

const WORKSPACE_TABS = [
  { id: 'issues', label: 'Issues' },
  { id: 'prs', label: 'Pull Requests' },
  { id: 'create', label: '+ New Issue' },
];

function RepoWorkspace({ repo, user, notifications, onNewNotification, onBack, onDismiss, onDismissAll }) {
  const [tab, setTab] = useState('issues');
  const [displayTab, setDisplayTab] = useState('issues');
  const [tabFading, setTabFading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [entering, setEntering] = useState(true);
  const tabSwapTimerRef = useRef(null);
  const ghTabRefs = useRef({});
  const [ghTabIndicator, setGhTabIndicator] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 20);
    return () => clearTimeout(t);
  }, []);

  useEffect(
    () => () => {
      if (tabSwapTimerRef.current) clearTimeout(tabSwapTimerRef.current);
    },
    [],
  );

  // Auto-poll
  useEffect(() => {
    const id = setInterval(() => setRefreshTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = ghTabRefs.current[tab];
    if (el) setGhTabIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab]);

  const handleTabChange = useCallback(
    (nextTab) => {
      if (nextTab === tab) return;
      setTab(nextTab);
      setTabFading(true);
      if (tabSwapTimerRef.current) clearTimeout(tabSwapTimerRef.current);
      tabSwapTimerRef.current = setTimeout(() => {
        setDisplayTab(nextTab);
        setTabFading(false);
      }, 280);
    },
    [tab],
  );

  const handleIssueCreated = () => {
    handleTabChange('issues');
    setRefreshTick((t) => t + 1);
  };

  return (
    <div className={`gh-workspace${entering ? ' gh-workspace--entering' : ''}`}>
      <div className="gh-workspace-header">
        <div className="gh-workspace-header-left">
          <button type="button" className="gh-back-btn" onClick={onBack}>← Repos</button>
          <span className="gh-workspace-repo-label">
            <span className="gh-workspace-repo-icon">📦</span>
            {repo.owner}/{repo.repo}
          </span>
        </div>
        <div className="gh-workspace-header-right">
          <NotificationBell notifications={notifications} onDismiss={onDismiss} onDismissAll={onDismissAll} />
          <div className="gh-view-tabs">
            {ghTabIndicator && <div className="gh-view-tab-indicator" style={{ left: ghTabIndicator.left, width: ghTabIndicator.width }} />}
            {WORKSPACE_TABS.map((t) => (
              <button key={t.id} type="button"
                ref={(el) => { ghTabRefs.current[t.id] = el; }}
                className={`gh-view-tab${tab === t.id ? ' gh-view-tab--active' : ''}`}
                onClick={() => handleTabChange(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="gh-workspace-body">
        <aside className="gh-sidebar">
          <div className="gh-sidebar-title">Files</div>
          <div className="gh-sidebar-explorer">
            <FileExplorer owner={repo.owner} repo={repo.repo} onSelect={() => {}} selected={[]} />
          </div>
        </aside>

        <main className="gh-workspace-main">
          <div className={`gh-tab-panel${tabFading ? ' gh-tab-panel--fading' : ''}`}>
            {displayTab === 'issues' && (
              <>
                <div className="gh-panel-header">
                  <h3 className="gh-panel-title">Open Agent Issues</h3>
                  <button type="button" className="gh-refresh-btn" onClick={() => setRefreshTick((t) => t + 1)} title="Refresh">↻</button>
                </div>
                <IssuesPanel repo={repo} currentUserEmail={user?.email || ''}
                  onNewNotification={onNewNotification} refreshTick={refreshTick}
                  onRefresh={() => setRefreshTick((t) => t + 1)} />
              </>
            )}
            {displayTab === 'prs' && (
              <>
                <div className="gh-panel-header">
                  <h3 className="gh-panel-title">Pull Requests</h3>
                </div>
                <PRsPanel repo={repo} user={user} />
              </>
            )}
            {displayTab === 'create' && (
              <>
                <div className="gh-panel-header">
                  <h3 className="gh-panel-title">New Agent Issue</h3>
                </div>
                <IssueForm repo={repo} onCreated={handleIssueCreated} userEmail={user?.email || ''} />
              </>
            )}
          </div>
        </main>
      </div>

      <NotificationToast notifications={notifications} onDismiss={onDismiss} onDismissAll={onDismissAll} />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Repo Selector
───────────────────────────────────────────── */

function RepoSelector({ onSelect }) {
  const [search, setSearch] = useState('');
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    mockFetchTrackedRepos()
      .then(setRepos)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = repos.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.owner.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="gh-selector">
      <div className="gh-selector-search-wrap">
        <span className="gh-selector-search-icon">🔍</span>
        <input className="gh-selector-search" placeholder="Search repositories…"
          value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      </div>
      {loading && <div className="gh-status-loading">Loading repositories…</div>}
      {error && <div className="gh-explorer-error">Could not load repos: {error}</div>}
      <div className="gh-repo-grid">
        {filtered.map((r) => (
          <button key={r.slug} type="button" className="gh-repo-card" onClick={() => onSelect(r)}>
            <div className="gh-repo-card-face">
              <div className="gh-repo-card-icon">📦</div>
              <div className="gh-repo-card-body">
                <strong className="gh-repo-card-name">{r.name}</strong>
                <span className="gh-repo-handle">{r.owner}/{r.repo}</span>
              </div>
            </div>
            <div className="gh-repo-card-desc-layer">
              <span className="gh-repo-desc">{r.owner}/{r.repo}</span>
            </div>
          </button>
        ))}
        {!loading && filtered.length === 0 && repos.length > 0 && (
          <p className="gh-status-empty">No repositories match "{search}"</p>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Root
───────────────────────────────────────────── */

export default function GithubWorkflowSandbox({ user }) {
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((n) => {
    setNotifications((prev) => prev.find((x) => x.id === n.id) ? prev : [n, ...prev]);
  }, []);
  const dismissNotification = useCallback((id) => setNotifications((prev) => prev.filter((n) => n.id !== id)), []);
  const dismissAll = useCallback(() => setNotifications([]), []);

  if (!selectedRepo) {
    return <RepoSelector onSelect={setSelectedRepo} />;
  }

  return (
    <RepoWorkspace
      repo={selectedRepo}
      user={user}
      notifications={notifications}
      onNewNotification={addNotification}
      onBack={() => setSelectedRepo(null)}
      onDismiss={dismissNotification}
      onDismissAll={dismissAll}
    />
  );
}
