import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { githubRepos } from '@site/src/data/githubReposConfig';

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

function getPAT() {
  return (typeof window !== 'undefined' && window.__GIT_PAT__) || '';
}

function getUsername() {
  return (typeof window !== 'undefined' && window.__GIT_USERNAME__) || '';
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

/** Extract email from issue body NotifyEmail field */
function extractEmail(body = '') {
  const m = body.match(/NotifyEmail:\s*([^\s]+)/);
  return m ? m[1] : null;
}

/** Parse issue body to detect if bot commented and is awaiting user reply */
function needsHumanIntervention(issue, comments) {
  if (!comments || comments.length === 0) return false;
  const last = comments[comments.length - 1];
  const botNames = ['github-actions[bot]', 'claude-bot', 'agent-bot'];
  return botNames.some((b) => last.user?.login?.includes(b.replace('[bot]', ''))) ||
    last.user?.type === 'Bot';
}

/** Build issue body in agent-issue-format */
function buildIssueBody({ task, context, type, priority, email }) {
  const lines = ['[Agent Call]', '', 'Task:', task, ''];
  if (context && context.length > 0) {
    lines.push('Context:');
    lines.push(context.join(', '));
    lines.push('');
  }
  if (type) {
    lines.push('Type:');
    lines.push(type);
    lines.push('');
  }
  if (priority) {
    lines.push('Priority:');
    lines.push(priority);
    lines.push('');
  }
  if (email) {
    lines.push('NotifyEmail:');
    lines.push(email);
    lines.push('');
  }
  return lines.join('\n');
}

/* ─────────────────────────────────────────────
   File Explorer (GitHub tree API)
───────────────────────────────────────────── */

function FileExplorer({ owner, repo, onSelect, selected }) {
  const [tree, setTree] = useState(null); // flat list from API
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
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (path) => {
      onSelect((prev) => {
        if (prev.includes(path)) return prev.filter((p) => p !== path);
        return [...prev, path];
      });
    },
    [onSelect],
  );

  if (loading)
    return <div className="gh-explorer-loading">Loading repository tree…</div>;
  if (error)
    return <div className="gh-explorer-error">Could not load tree: {error}</div>;
  if (!tree) return null;

  // Build nested structure
  const roots = buildTree(tree);

  return (
    <div className="gh-explorer">
      <TreeNode
        nodes={roots}
        expanded={expanded}
        onToggle={toggle}
        onSelect={handleSelect}
        selected={selected}
        depth={0}
      />
    </div>
  );
}

function buildTree(flat) {
  const map = {};
  const roots = [];
  for (const item of flat) {
    map[item.path] = { ...item, children: [] };
  }
  for (const item of flat) {
    const parts = item.path.split('/');
    if (parts.length === 1) {
      roots.push(map[item.path]);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      if (map[parentPath]) {
        map[parentPath].children.push(map[item.path]);
      }
    }
  }
  // Sort: trees (dirs) first, then blobs
  const sort = (arr) => {
    arr.sort((a, b) => {
      if (a.type === b.type) return a.path.localeCompare(b.path);
      return a.type === 'tree' ? -1 : 1;
    });
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
              className={`gh-tree-row ${isSelected ? 'gh-tree-row--selected' : ''}`}
              onClick={() => (isDir ? onToggle(node.path) : onSelect(node.path))}
            >
              <span className="gh-tree-icon">
                {isDir ? (isOpen ? '📂' : '📁') : '📄'}
              </span>
              <span className="gh-tree-name">{name}</span>
              {!isDir && isSelected && (
                <span className="gh-tree-check">✓</span>
              )}
            </button>
            {isDir && isOpen && node.children.length > 0 && (
              <TreeNode
                nodes={node.children}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
                selected={selected}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
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
  const [context, setContext] = useState([]); // selected paths
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
      const body = buildIssueBody({
        task: task.trim(),
        context,
        type: type || undefined,
        priority: priority || undefined,
        email: userEmail,
      });
      await ghFetch(`/repos/${repo.owner}/${repo.repo}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `[Agent Call] ${title.trim()}`,
          body,
        }),
      });
      setTitle('');
      setTask('');
      setContext([]);
      setType('');
      setPriority('Normal');
      setShowAdvanced(false);
      setShowExplorer(false);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="gh-issue-form" onSubmit={handleSubmit}>
      {/* Title */}
      <div className="gh-form-row">
        <div className="gh-form-field">
          <label className="gh-form-label">
            Brief title
            <span className="gh-form-required">*</span>
          </label>
          <div className="gh-title-prefix-wrap">
            <span className="gh-title-prefix">[Agent Call]</span>
            <input
              className="gh-form-input gh-title-input"
              placeholder="e.g. Add structured error logging"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={120}
            />
          </div>
        </div>
      </div>

      {/* Task */}
      <div className="gh-form-row">
        <div className="gh-form-field">
          <label className="gh-form-label">
            Task description
            <span className="gh-form-required">*</span>
          </label>
          <textarea
            className="gh-form-textarea"
            placeholder="Describe exactly what should be done. Be specific about expected behaviour, files to touch, and edge cases."
            value={task}
            onChange={(e) => setTask(e.target.value)}
            required
            rows={5}
          />
        </div>
      </div>

      {/* Advanced / optional fields */}
      <div className="gh-advanced-toggle-row">
        <button
          type="button"
          className="gh-advanced-toggle"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          <span className="gh-advanced-arrow">{showAdvanced ? '▾' : '▸'}</span>
          Optional fields
          <span className="gh-optional-badge">optional</span>
        </button>
      </div>

      {showAdvanced && (
        <div className="gh-advanced-panel">
          {/* Context */}
          <div className="gh-form-field">
            <label className="gh-form-label">
              Context paths
              <span className="gh-optional-badge gh-optional-badge--inline">optional</span>
            </label>
            <p className="gh-context-warning">
              <span className="gh-warn-icon">⚠️</span>
              Context is entirely optional — the agent works without it. Only add
              paths if they are directly relevant; a wrong path can mislead the agent.
            </p>

            <button
              type="button"
              className={`gh-explorer-toggle ${showExplorer ? 'gh-explorer-toggle--open' : ''}`}
              onClick={() => setShowExplorer((v) => !v)}
            >
              {showExplorer ? '▾ Hide file explorer' : '▸ Browse repository files'}
            </button>

            {showExplorer && (
              <div className="gh-explorer-wrap">
                <FileExplorer
                  owner={repo.owner}
                  repo={repo.repo}
                  onSelect={setContext}
                  selected={context}
                />
              </div>
            )}

            {context.length > 0 && (
              <div className="gh-context-chips">
                {context.map((p) => (
                  <span key={p} className="gh-context-chip">
                    {p}
                    <button
                      type="button"
                      className="gh-chip-remove"
                      onClick={() =>
                        setContext((prev) => prev.filter((x) => x !== p))
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Type + Priority */}
          <div className="gh-form-row gh-form-row--cols">
            <div className="gh-form-field">
              <label className="gh-form-label">Type</label>
              <select
                className="gh-form-select"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t || '— not specified —'}
                  </option>
                ))}
              </select>
            </div>
            <div className="gh-form-field">
              <label className="gh-form-label">Priority</label>
              <select
                className="gh-form-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p || '— not specified —'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {error && <p className="gh-form-error">{error}</p>}

      <div className="gh-form-actions">
        <button
          type="submit"
          className="gh-submit-btn"
          disabled={submitting || !title.trim() || !task.trim()}
        >
          {submitting ? (
            <>
              <span className="status-spinner" />
              Creating issue…
            </>
          ) : (
            'Create issue'
          )}
        </button>
        <span className="gh-form-hint">
          Issue will be filed under <strong>{repo.owner}/{repo.repo}</strong>
        </span>
      </div>
    </form>
  );
}

/* ─────────────────────────────────────────────
   Issue Status Panel
───────────────────────────────────────────── */

function IssueStatusPanel({ repo, currentUserEmail, onNewNotification, refreshTick }) {
  const [issues, setIssues] = useState([]);
  const [commentMap, setCommentMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ghFetch(
        `/repos/${repo.owner}/${repo.repo}/issues?state=open&per_page=50`,
      );
      // Only show issues that have our email watermark OR show all agent issues
      const agentIssues = data.filter(
        (i) =>
          i.title?.startsWith('[Agent Call]') ||
          i.body?.includes('[Agent Call]'),
      );
      setIssues(agentIssues);

      // Fetch comments for each issue (capped for perf)
      const entries = await Promise.all(
        agentIssues.slice(0, 20).map(async (issue) => {
          try {
            const comments = await ghFetch(
              `/repos/${repo.owner}/${repo.repo}/issues/${issue.number}/comments`,
            );
            return [issue.number, comments];
          } catch {
            return [issue.number, []];
          }
        }),
      );
      setCommentMap(Object.fromEntries(entries));
    } catch {
      // silently fail on poll
    } finally {
      setLoading(false);
    }
  }, [repo]);

  // Previous comment counts for notification diffing
  const prevCommentCounts = useRef({});

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues, refreshTick]);

  // Notification diffing — runs whenever commentMap updates
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

  if (loading && issues.length === 0) {
    return <div className="gh-status-loading">Loading issues…</div>;
  }

  if (issues.length === 0) {
    return (
      <div className="gh-status-empty">
        No open agent issues in this repository.
      </div>
    );
  }

  return (
    <div className="gh-status-list">
      {issues.map((issue) => {
        const comments = commentMap[issue.number] || [];
        const awaitingHuman = needsHumanIntervention(issue, comments);
        const myIssue =
          extractEmail(issue.body || '')?.toLowerCase() ===
          (currentUserEmail || '').toLowerCase();
        const isOpen = expanded === issue.number;

        return (
          <div
            key={issue.number}
            className={`gh-status-row ${awaitingHuman ? 'gh-status-row--alert' : ''}`}
          >
            <button
              type="button"
              className="gh-status-row-header"
              onClick={() => setExpanded(isOpen ? null : issue.number)}
            >
              {/* Blink indicator */}
              <span
                className={`gh-status-light ${
                  awaitingHuman
                    ? 'gh-status-light--alert'
                    : 'gh-status-light--ok'
                }`}
                title={awaitingHuman ? 'Awaiting your response' : 'Running'}
              />

              <span className="gh-status-number">#{issue.number}</span>
              <span className="gh-status-title">{issue.title}</span>

              <div className="gh-status-meta">
                {myIssue && (
                  <span className="gh-status-badge gh-status-badge--mine">
                    mine
                  </span>
                )}
                {awaitingHuman && (
                  <span className="gh-status-badge gh-status-badge--alert">
                    needs reply
                  </span>
                )}
                <span className="gh-status-comments">
                  💬 {comments.length}
                </span>
                <span className="gh-status-chevron">
                  {isOpen ? '▾' : '▸'}
                </span>
              </div>
            </button>

            {isOpen && (
              <div className="gh-status-detail">
                <div className="gh-status-body">
                  <pre className="gh-issue-body-pre">{issue.body}</pre>
                </div>
                {comments.length > 0 && (
                  <div className="gh-status-comments-list">
                    <p className="gh-status-comments-title">Comments</p>
                    {comments.map((c) => (
                      <div
                        key={c.id}
                        className={`gh-comment ${
                          c.user?.type === 'Bot' ? 'gh-comment--bot' : ''
                        }`}
                      >
                        <span className="gh-comment-author">
                          {c.user?.type === 'Bot' ? '🤖 ' : '👤 '}
                          {c.user?.login}
                        </span>
                        <p className="gh-comment-body">{c.body}</p>
                      </div>
                    ))}
                  </div>
                )}
                <a
                  href={issue.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gh-status-open-link"
                >
                  Open on GitHub ↗
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Notification Bell
───────────────────────────────────────────── */

function NotificationBell({ notifications, onDismiss, onDismissAll }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const count = notifications.length;

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="gh-notif-bell-wrap" ref={ref}>
      <button
        type="button"
        className="gh-notif-bell"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${count} notification${count !== 1 ? 's' : ''}`}
      >
        🔔
        {count > 0 && <span className="gh-notif-count">{count}</span>}
      </button>

      {open && (
        <div className="gh-notif-dropdown">
          <div className="gh-notif-dropdown-header">
            <span>Notifications</span>
            {count > 0 && (
              <button
                type="button"
                className="gh-notif-clear-all"
                onClick={onDismissAll}
              >
                Clear all
              </button>
            )}
          </div>
          {count === 0 ? (
            <p className="gh-notif-empty">No new notifications</p>
          ) : (
            <ul className="gh-notif-list">
              {notifications.map((n) => (
                <li key={n.id} className="gh-notif-item">
                  <div className="gh-notif-item-top">
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="gh-notif-link"
                    >
                      {n.issueTitle}
                    </a>
                    <button
                      type="button"
                      className="gh-notif-dismiss"
                      onClick={() => onDismiss(n.id)}
                    >
                      ×
                    </button>
                  </div>
                  <p className="gh-notif-meta">
                    <strong>{n.commenter}</strong> commented on{' '}
                    {n.repoLabel}#{n.issueNumber}
                  </p>
                  {n.preview && (
                    <p className="gh-notif-preview">&ldquo;{n.preview}&rdquo;</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main GithubWorkflow component
───────────────────────────────────────────── */

const POLL_INTERVAL = 60_000; // 60 s

export default function GithubWorkflow({ user }) {
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [view, setView] = useState('status'); // 'status' | 'create'
  const [notifications, setNotifications] = useState([]);
  const [refreshTick, setRefreshTick] = useState(0);

  // Auto-poll
  useEffect(() => {
    if (!selectedRepo) return;
    const id = setInterval(
      () => setRefreshTick((t) => t + 1),
      POLL_INTERVAL,
    );
    return () => clearInterval(id);
  }, [selectedRepo]);

  const addNotification = useCallback((n) => {
    setNotifications((prev) => {
      if (prev.find((x) => x.id === n.id)) return prev;
      return [n, ...prev];
    });
  }, []);

  const dismissNotification = useCallback(
    (id) => setNotifications((prev) => prev.filter((n) => n.id !== id)),
    [],
  );

  const dismissAll = useCallback(() => setNotifications([]), []);

  const handleIssueCreated = () => {
    setView('status');
    setRefreshTick((t) => t + 1);
  };

  /* ── Repo selector ── */
  if (!selectedRepo) {
    return (
      <div className="gh-workflow-root">
        <div className="gh-repo-grid">
          {githubRepos.map((r) => (
            <button
              key={r.slug}
              type="button"
              className="gh-repo-card"
              onClick={() => setSelectedRepo(r)}
            >
              <span className="gh-repo-icon">📦</span>
              <div className="gh-repo-info">
                <strong>{r.name}</strong>
                <span className="gh-repo-handle">
                  {r.owner}/{r.repo}
                </span>
                {r.description && (
                  <span className="gh-repo-desc">{r.description}</span>
                )}
              </div>
              <span className="gh-repo-arrow">→</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ── Repo workspace ── */
  return (
    <div className="gh-workflow-root">
      {/* Header row */}
      <div className="gh-workspace-header">
        <div className="gh-workspace-header-left">
          <button
            type="button"
            className="gh-back-btn"
            onClick={() => {
              setSelectedRepo(null);
              setView('status');
            }}
          >
            ← Repositories
          </button>
          <span className="gh-workspace-repo-label">
            <span className="gh-workspace-repo-icon">📦</span>
            {selectedRepo.owner}/{selectedRepo.repo}
          </span>
        </div>

        <div className="gh-workspace-header-right">
          <NotificationBell
            notifications={notifications}
            onDismiss={dismissNotification}
            onDismissAll={dismissAll}
          />
          <div className="gh-view-tabs">
            <button
              type="button"
              className={`gh-view-tab ${view === 'status' ? 'gh-view-tab--active' : ''}`}
              onClick={() => setView('status')}
            >
              Issue Status
            </button>
            <button
              type="button"
              className={`gh-view-tab ${view === 'create' ? 'gh-view-tab--active' : ''}`}
              onClick={() => setView('create')}
            >
              + New Issue
            </button>
          </div>
        </div>
      </div>

      {/* Views */}
      {view === 'create' ? (
        <div className="portal-card gh-issue-form-card">
          <IssueForm
            repo={selectedRepo}
            onCreated={handleIssueCreated}
            userEmail={user?.email || ''}
          />
        </div>
      ) : (
        <div className="portal-card gh-status-card">
          <div className="gh-status-card-header">
            <h3 className="gh-status-card-title">Open Agent Issues</h3>
            <button
              type="button"
              className="gh-refresh-btn"
              onClick={() => setRefreshTick((t) => t + 1)}
              title="Refresh"
            >
              ↻
            </button>
          </div>
          <IssueStatusPanel
            repo={selectedRepo}
            currentUserEmail={user?.email || ''}
            onNewNotification={addNotification}
            refreshTick={refreshTick}
          />
        </div>
      )}
    </div>
  );
}
