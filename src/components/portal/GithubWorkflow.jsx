import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { githubRepos } from '@site/src/data/githubReposConfig';

/* ─────────────────────────────────────────────
   GitHub API helpers
───────────────────────────────────────────── */

function getPAT() {
  return (typeof window !== 'undefined' && window.__GIT_PAT__) || '';
}

function authHeaders() {
  const pat = getPAT();
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(pat ? { Authorization: `Bearer ${pat}` } : {}),
  };
}

async function ghFetch(path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `GitHub API error ${res.status}`);
  }
  return res.json();
}

function extractEmail(body = '') {
  const m = body.match(/NotifyEmail:\s*([^\s]+)/);
  return m ? m[1] : null;
}

/**
 * Stage logic:
 * - No comments → "Awaiting Bot Response"
 * - Last comment starts with 🤖 or ⚠️ → "Awaiting Human Response"
 * - Last comment starts with anything else → "Awaiting Bot Response"
 */
function getIssueStage(comments) {
  if (!comments || comments.length === 0) return 'bot';
  const last = comments[comments.length - 1];
  const firstChar = (last.body || '').trimStart()[0];
  if (firstChar === '🤖' || firstChar === '⚠️') return 'human';
  return 'bot';
}

function getLastBotEmoji(comments) {
  if (!comments || comments.length === 0) return null;
  const last = comments[comments.length - 1];
  const firstChar = (last.body || '').trimStart()[0];
  if (firstChar === '🤖') return '🤖';
  if (firstChar === '⚠️') return '⚠️';
  return null;
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
          <div className={`gh-explorer-wrap${showExplorer ? ' gh-explorer-wrap--open' : ''}`}>
            {showExplorer && <FileExplorer owner={repo.owner} repo={repo.repo} onSelect={setContext} selected={context} />}
          </div>
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
  const [action, setAction] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const emoji = getLastBotEmoji(comments);
  const isWarning = emoji === '⚠️';

  const actions = isWarning
    ? [{ value: '!continue', label: '!continue' }]
    : [
        { value: '!commit', label: '!commit' },
        { value: '!discuss', label: '!discuss' },
      ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!action) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = info.trim() ? `${action}\n\n${info.trim()}` : action;
      await ghFetch(`/repos/${repo.owner}/${repo.repo}/issues/${issue.number}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      setAction(''); setInfo('');
      onReplied();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="gh-reply-box" onSubmit={handleSubmit}>
      <div className="gh-reply-actions">
        {actions.map((a) => (
          <button key={a.value} type="button"
            className={`gh-reply-action-btn${action === a.value ? ' active' : ''}`}
            onClick={() => setAction(a.value)}>
            {a.label}
          </button>
        ))}
      </div>
      {action && (
        <textarea className="gh-reply-info" rows={2} placeholder="Additional information (optional)"
          value={info} onChange={(e) => setInfo(e.target.value)} />
      )}
      {error && <p className="gh-form-error" style={{ margin: 0 }}>{error}</p>}
      <button type="submit" className="gh-submit-btn gh-submit-btn--sm" disabled={submitting || !action}>
        {submitting ? <><span className="status-spinner" /> Sending…</> : 'Send reply'}
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

  const stage = getIssueStage(comments);
  const awaitingHuman = stage === 'human';
  const myIssue = extractEmail(issue.body || '')?.toLowerCase() === (currentUserEmail || '').toLowerCase();

  return (
    <div className={`gh-issue-row${awaitingHuman ? ' gh-issue-row--alert' : ''}${open ? ' gh-issue-row--open' : ''}`}>
      {/* Header */}
      <button type="button" className="gh-issue-row-header" onClick={() => setOpen((v) => !v)}>
        <span className={`gh-status-light${awaitingHuman ? ' gh-status-light--alert' : ' gh-status-light--ok'}`} />
        <span className="gh-status-number">#{issue.number}</span>
        <span className="gh-status-title">{issue.title.replace(/^\[Agent Call\]\s*/, '')}</span>
        <div className="gh-status-meta">
          {myIssue && <span className="gh-status-badge gh-status-badge--mine">mine</span>}
          <span className={`gh-stage-badge gh-stage-badge--${stage}`}>
            {awaitingHuman ? 'Awaiting Human Response' : 'Awaiting Bot Response'}
          </span>
          {comments.length > 0 && <span className="gh-status-comments">💬 {comments.length}</span>}
          <span className={`gh-chevron${open ? ' open' : ''}`}>▸</span>
        </div>
      </button>

      {/* Expanded body */}
      <div className={`gh-issue-detail${open ? ' gh-issue-detail--open' : ''}`}>
        <div className="gh-issue-detail-inner">
          <pre className="gh-issue-body-pre">{issue.body}</pre>

          {/* Comments */}
          {comments.length > 0 && (
            <div className="gh-comments-section">
              <button type="button" className="gh-comments-toggle" onClick={() => setCommentsOpen((v) => !v)}>
                <span className={`gh-advanced-arrow${commentsOpen ? ' open' : ''}`}>▸</span>
                {commentsOpen ? 'Hide' : 'Show'} {comments.length} comment{comments.length !== 1 ? 's' : ''}
              </button>
              <div className={`gh-comments-list${commentsOpen ? ' gh-comments-list--open' : ''}`}>
                <div className="gh-comments-list-inner">
                  {comments.map((c) => {
                    const firstChar = (c.body || '').trimStart()[0];
                    const isBot = firstChar === '🤖' || firstChar === '⚠️';
                    const isCommentOpen = !!openComments[c.id];
                    const preview = (c.body || '').replace(/\s+/g, ' ').trim();
                    return (
                      <div key={c.id} className={`gh-comment${isBot ? ' gh-comment--bot' : ''}`}>
                        <button
                          type="button"
                          className="gh-comment-toggle"
                          onClick={() =>
                            setOpenComments((prev) => ({
                              ...prev,
                              [c.id]: !prev[c.id],
                            }))
                          }
                        >
                          <span className="gh-comment-author">{isBot ? firstChar : '👤'} {c.user?.login}</span>
                          <span className="gh-comment-time">{new Date(c.created_at).toLocaleString()}</span>
                          <span className={`gh-comment-chevron${isCommentOpen ? ' open' : ''}`}>▸</span>
                        </button>
                        {isCommentOpen ? (
                          <p className="gh-comment-body">{c.body}</p>
                        ) : (
                          <p className="gh-comment-preview">
                            {preview || '(empty comment)'}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Reply box — only when awaiting human */}
          {awaitingHuman && (
            <ReplyBox repo={repo} issue={issue} comments={comments} onReplied={onRefresh} />
          )}

          <a href={issue.html_url} target="_blank" rel="noopener noreferrer" className="gh-status-open-link">
            Open on GitHub ↗
          </a>
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
      const data = await ghFetch(`/repos/${repo.owner}/${repo.repo}/issues?state=open&per_page=50`);
      const agentIssues = data.filter((i) => i.title?.startsWith('[Agent Call]') || i.body?.includes('[Agent Call]'));
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
          url: issue.html_url,
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

function PRsPanel({ repo }) {
  const [prs, setPrs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    ghFetch(`/repos/${repo.owner}/${repo.repo}/pulls?state=open&per_page=30`)
      .then(setPrs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [repo]);

  if (loading) return <div className="gh-status-loading">Loading pull requests…</div>;
  if (error) return <div className="gh-explorer-error">Could not load PRs: {error}</div>;
  if (prs.length === 0) return <div className="gh-status-empty">No open pull requests.</div>;

  return (
    <div className="gh-pr-list">
      {prs.map((pr) => (
        <a key={pr.number} href={pr.html_url} target="_blank" rel="noopener noreferrer" className="gh-pr-row">
          <span className="gh-pr-icon">⎇</span>
          <div className="gh-pr-info">
            <span className="gh-pr-title">{pr.title}</span>
            <span className="gh-pr-meta">#{pr.number} · {pr.user?.login} · {pr.head?.ref} → {pr.base?.ref}</span>
          </div>
          <span className="gh-pr-arrow">↗</span>
        </a>
      ))}
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

  // Wiggle when new notifications arrive
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
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className="gh-notif-link">{n.issueTitle}</a>
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

  // Wiggle every 60s when notifications present, and on new arrivals
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
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className="gh-notif-link">{n.issueTitle}</a>
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
  const [refreshTick, setRefreshTick] = useState(0);
  const [entering, setEntering] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 20);
    return () => clearTimeout(t);
  }, []);

  // Auto-poll
  useEffect(() => {
    const id = setInterval(() => setRefreshTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const handleIssueCreated = () => { setTab('issues'); setRefreshTick((t) => t + 1); };

  return (
    <div className={`gh-workspace${entering ? ' gh-workspace--entering' : ''}`}>
      {/* Workspace header */}
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
            {WORKSPACE_TABS.map((t) => (
              <button key={t.id} type="button"
                className={`gh-view-tab${tab === t.id ? ' gh-view-tab--active' : ''}`}
                onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sidebar + content layout */}
      <div className="gh-workspace-body">
        {/* Sidebar: file explorer always visible */}
        <aside className="gh-sidebar">
          <div className="gh-sidebar-title">Files</div>
          <div className="gh-sidebar-explorer">
            <FileExplorer owner={repo.owner} repo={repo.repo} onSelect={() => {}} selected={[]} />
          </div>
        </aside>

        {/* Main content */}
        <main className="gh-workspace-main">
          {tab === 'issues' && (
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
          {tab === 'prs' && (
            <>
              <div className="gh-panel-header">
                <h3 className="gh-panel-title">Open Pull Requests</h3>
              </div>
              <PRsPanel repo={repo} />
            </>
          )}
          {tab === 'create' && (
            <>
              <div className="gh-panel-header">
                <h3 className="gh-panel-title">New Agent Issue</h3>
              </div>
              <IssueForm repo={repo} onCreated={handleIssueCreated} userEmail={user?.email || ''} />
            </>
          )}
        </main>
      </div>

      {/* Floating toast */}
      <NotificationToast notifications={notifications} onDismiss={onDismiss} onDismissAll={onDismissAll} />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Repo Selector
───────────────────────────────────────────── */

function RepoSelector({ onSelect }) {
  const [search, setSearch] = useState('');
  const filtered = githubRepos.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.owner.toLowerCase().includes(search.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="gh-selector">
      <div className="gh-selector-search-wrap">
        <span className="gh-selector-search-icon">🔍</span>
        <input className="gh-selector-search" placeholder="Search repositories…"
          value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      </div>
      <div className="gh-repo-grid">
        {filtered.map((r) => (
          <button key={r.slug} type="button" className="gh-repo-card" onClick={() => onSelect(r)}>
            <div className="gh-repo-card-icon">📦</div>
            <div className="gh-repo-card-body">
              <strong className="gh-repo-card-name">{r.name}</strong>
              <span className="gh-repo-handle">{r.owner}/{r.repo}</span>
              {r.description && <span className="gh-repo-desc">{r.description}</span>}
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="gh-status-empty">No repositories match "{search}"</p>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Root
───────────────────────────────────────────── */

export default function GithubWorkflow({ user }) {
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
