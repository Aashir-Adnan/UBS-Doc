import React, { useState, useCallback, useEffect } from 'react';
import { mwGet, mwPost } from './api';
import NoteEditor from './NoteEditor';
import LiveTranscribeStage from './LiveTranscribeStage';

const STAGES = [
  { id: 0, label: 'Pre-Meeting', icon: '📋' },
  { id: 1, label: 'Transcribe',  icon: '🎙️' },
  { id: 2, label: 'Analyze',     icon: '🔍' },
  { id: 3, label: 'Tasks',       icon: '📝' },
  { id: 4, label: 'Approve',     icon: '✅' },
  { id: 5, label: 'Report',      icon: '📄' },
  { id: 6, label: 'Issue Sync',  icon: '🐙' },
];

function parseJsonSafe(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return [String(val)]; }
}

function StageNav({ active, completed, onSelect }) {
  return (
    <nav className="mw-stage-nav">
      {STAGES.map((s) => (
        <button
          key={s.id}
          className={[
            'mw-stage-btn',
            active === s.id ? 'mw-stage-btn--active' : '',
            completed > s.id ? 'mw-stage-btn--done' : '',
          ].join(' ')}
          onClick={() => onSelect(s.id)}
          type="button"
        >
          <span className="mw-stage-icon">{s.icon}</span>
          <span className="mw-stage-label">{s.label}</span>
          {completed > s.id && <span className="mw-stage-check">✓</span>}
        </button>
      ))}
    </nav>
  );
}

function StatusBar({ message, type }) {
  if (!message) return null;
  return <div className={`mw-status mw-status--${type || 'info'}`}>{message}</div>;
}

// ─── Stage 0: Pre-Meeting Notes ───────────────────────────────────────────────
function PreMeetingStage({ meeting, onDone }) {
  const [busy, setBusy] = useState(false);
  const [md, setMd] = useState(meeting.pre_meeting_notes || '');
  const [html, setHtml] = useState(meeting.pre_meeting_html || '');
  const [keyTopics, setKeyTopics] = useState([]);
  const [openItems, setOpenItems] = useState([]);
  const [view, setView] = useState('md'); // 'md' | 'html'
  const [error, setError] = useState('');

  const hasContent = !!(md || html);

  async function run() {
    setBusy(true); setError('');
    try {
      const data = await mwPost('/meeting/workflow/premeeting', { meeting_id: meeting.meeting_id });
      setMd(data.preMeetingNotes || '');
      setHtml(data.preMeetingHtml || '');
      setKeyTopics(data.keyTopics || []);
      setOpenItems(data.openItems || []);
      setView(data.preMeetingHtml ? 'html' : 'md');
      onDone?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mw-stage-content">
      <h3 className="mw-stage-title">Pre-Meeting Notes</h3>
      <p className="mw-stage-desc">
        Claude queries the database for the selected repositories and features, searches the codebase for relevant code paths, then generates a brief telling participants what has already been built and where.
      </p>

      {meeting.agenda && (
        <div className="mw-preexisting">
          <p className="mw-label">Agenda:</p>
          <pre className="mw-pre">{meeting.agenda}</pre>
        </div>
      )}

      <StatusBar message={error} type="error" />

      <button className="mw-btn mw-btn--primary" onClick={run} disabled={busy} type="button">
        {busy ? 'Generating…' : hasContent ? 'Regenerate Notes' : 'Generate Pre-Meeting Notes'}
      </button>

      {hasContent && (
        <div className="mw-note-editor" style={{ marginTop: '1.25rem' }}>
          {/* Tab bar */}
          <div className="mw-note-editor-header">
            <div className="mw-tab-row">
              <button
                className={`mw-tab${view === 'html' ? ' mw-tab--active' : ''}`}
                onClick={() => setView('html')}
                type="button"
                disabled={!html}
                title={html ? 'HTML preview' : 'HTML not yet generated'}
              >
                HTML Preview
              </button>
              <button
                className={`mw-tab${view === 'md' ? ' mw-tab--active' : ''}`}
                onClick={() => setView('md')}
                type="button"
              >
                Markdown
              </button>
            </div>
          </div>

          {view === 'html' && html && (
            <iframe
              srcDoc={html}
              title="Pre-Meeting Notes"
              className="mw-html-iframe"
              sandbox="allow-same-origin"
            />
          )}

          {view === 'md' && (
            <div className="mw-notes-panel">
              <pre className="mw-pre" style={{ maxHeight: '60vh', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{md}</pre>
            </div>
          )}

          {/* Key topics + open items as side metadata */}
          {(keyTopics.length > 0 || openItems.length > 0) && (
            <div className="mw-premeeting-meta">
              {keyTopics.length > 0 && (
                <div>
                  <p className="mw-label">Key topics:</p>
                  <ul className="mw-list">{keyTopics.map((t, i) => <li key={i}>{t}</li>)}</ul>
                </div>
              )}
              {openItems.length > 0 && (
                <div>
                  <p className="mw-label">Open items from previous meetings:</p>
                  <ul className="mw-list">{openItems.map((t, i) => <li key={i}>{t}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stage 1: Transcribe (live) ──────────────────────────────────────────────
// Delegated to LiveTranscribeStage component

// ─── Stage 2: Analyze ────────────────────────────────────────────────────────
function AnalyzeStage({ meeting, onDone }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true); setError(''); setResult(null);
    try {
      const data = await mwPost('/meeting/workflow/analyze', { meeting_id: meeting.meeting_id });
      setResult(data.analysis || data);
      onDone?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mw-stage-content">
      <h3 className="mw-stage-title">MTA Analysis</h3>
      <p className="mw-stage-desc">
        Claude analyzes the transcript to extract projects, platforms, features, decisions, and action items.
      </p>
      <StatusBar message={error} type="error" />
      {result && (
        <div className="mw-result">
          <p className="mw-summary">{result.summary}</p>
          {result.projectsDiscussed?.length > 0 && (
            <div className="mw-chips-row">
              <span className="mw-chips-label">Projects:</span>
              {result.projectsDiscussed.map((p, i) => <span key={i} className="mw-chip mw-chip--project">{p}</span>)}
            </div>
          )}
          {result.platformsDiscussed?.length > 0 && (
            <div className="mw-chips-row">
              <span className="mw-chips-label">Platforms:</span>
              {result.platformsDiscussed.map((p, i) => <span key={i} className="mw-chip mw-chip--platform">{p}</span>)}
            </div>
          )}
          {result.decisionsMade?.length > 0 && (
            <>
              <p className="mw-label">Decisions:</p>
              <ul className="mw-list">{result.decisionsMade.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </>
          )}
          {result.codeReferences?.length > 0 && (
            <>
              <p className="mw-label">Code references:</p>
              <ul className="mw-list">{result.codeReferences.map((r, i) => <li key={i}><code className="mw-code">{r}</code></li>)}</ul>
            </>
          )}
        </div>
      )}
      <button className="mw-btn mw-btn--primary" onClick={run} disabled={busy} type="button">
        {busy ? 'Analyzing…' : 'Run MTA Analysis'}
      </button>
    </div>
  );
}

// ─── Stage 3: Tasks ──────────────────────────────────────────────────────────
function TasksStage({ meeting, onDone }) {
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState('');

  async function generate() {
    setBusy(true); setError('');
    try {
      const data = await mwPost('/meeting/workflow/tasks', { meeting_id: meeting.meeting_id });
      setTasks(data.tasks || []);
      onDone?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function refresh() {
    setBusy(true); setError('');
    try {
      const data = await mwGet(`/meeting/workflow/tasks?meeting_id=${meeting.meeting_id}`);
      setTasks(data.tasks || []);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mw-stage-content">
      <h3 className="mw-stage-title">Generate Tasks</h3>
      <p className="mw-stage-desc">
        Claude converts the analysis into discrete, actionable development tasks with exact code locations sourced from the codebase.
      </p>
      <StatusBar message={error} type="error" />
      <div className="mw-btn-row">
        <button className="mw-btn mw-btn--primary" onClick={generate} disabled={busy} type="button">
          {busy ? 'Generating…' : 'Generate Tasks'}
        </button>
        <button className="mw-btn mw-btn--ghost" onClick={refresh} disabled={busy} type="button">
          Refresh
        </button>
      </div>
      {tasks !== null && (
        <div className="mw-table-wrap">
          {tasks.length === 0 ? (
            <p className="mw-empty">No tasks yet.</p>
          ) : (
            <table className="mw-table">
              <thead>
                <tr>
                  <th>#</th><th>Project</th><th>Platform</th><th>Feature</th>
                  <th>Code Location</th><th>Goal</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, i) => (
                  <tr key={t.task_id || i}>
                    <td>{i + 1}</td>
                    <td><span className="mw-chip mw-chip--project">{t.project || '—'}</span></td>
                    <td><span className="mw-chip mw-chip--platform">{t.platform || '—'}</span></td>
                    <td>{t.feature}{t.sub_feature ? <><br /><small>{t.sub_feature}</small></> : null}</td>
                    <td><code className="mw-code">{t.code_residence || '—'}</code></td>
                    <td>{t.goal_of_task}</td>
                    <td><span className={`mw-status-badge mw-status-badge--${t.status}`}>{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stage 4: Approve ────────────────────────────────────────────────────────
function ApproveStage({ meeting, onDone }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState('');

  // Load tasks on mount so user can review before approving
  useEffect(() => {
    mwGet(`/meeting/workflow/tasks?meeting_id=${meeting.meeting_id}`)
      .then((data) => setTasks(data.tasks || []))
      .catch(() => {});
  }, [meeting.meeting_id]);

  async function decide(decision) {
    setBusy(true); setError('');
    try {
      const data = await mwPost('/meeting/workflow/approve', {
        meeting_id: meeting.meeting_id,
        decision,
        approved_by: 'human',
      });
      setResult({ decision, count: data.tasks?.length || 0 });
      onDone?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mw-stage-content">
      <h3 className="mw-stage-title">Approve Tasks</h3>
      <p className="mw-stage-desc">
        Review the generated tasks and approve or reject them. Approved tasks will be included in the report and synced to GitHub.
      </p>
      <StatusBar message={error} type="error" />
      {tasks !== null && tasks.length > 0 && (
        <div className="mw-table-wrap">
          <table className="mw-table">
            <thead>
              <tr>
                <th>#</th><th>Project</th><th>Platform</th><th>Goal</th><th>Code Location</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t, i) => (
                <tr key={t.task_id || i}>
                  <td>{i + 1}</td>
                  <td><span className="mw-chip mw-chip--project">{t.project || '—'}</span></td>
                  <td><span className="mw-chip mw-chip--platform">{t.platform || '—'}</span></td>
                  <td>{t.goal_of_task}</td>
                  <td><code className="mw-code">{t.code_residence || '—'}</code></td>
                  <td><span className={`mw-status-badge mw-status-badge--${t.status}`}>{t.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result ? (
        <div className="mw-result">
          <p className="mw-label">
            Decision: <strong className={result.decision === 'approved' ? 'mw-green' : 'mw-red'}>
              {result.decision}
            </strong> — {result.count} task(s) updated.
          </p>
        </div>
      ) : (
        <div className="mw-btn-row">
          <button className="mw-btn mw-btn--success" onClick={() => decide('approved')} disabled={busy} type="button">
            {busy ? 'Saving…' : 'Approve All'}
          </button>
          <button className="mw-btn mw-btn--danger" onClick={() => decide('rejected')} disabled={busy} type="button">
            Reject All
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Stage 5: Report ─────────────────────────────────────────────────────────
function ReportStage({ meeting, onDone }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  // Load existing notes/HTML on mount if report was already generated
  useEffect(() => {
    mwGet(`/meeting/workflow/notes?meeting_id=${meeting.meeting_id}`)
      .then((data) => {
        if (data?.latestHtml || data?.notes?.raw_notes) {
          setReport({
            notes: data.notes?.edited_notes || data.notes?.raw_notes || '',
            html: data.latestHtml || '',
          });
        }
      })
      .catch(() => {});
  }, [meeting.meeting_id]);

  async function generate() {
    setBusy(true); setError(''); setReport(null);
    try {
      const data = await mwPost('/meeting/workflow/report', { meeting_id: meeting.meeting_id });
      setReport(data);
      onDone?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mw-stage-content">
      <h3 className="mw-stage-title">Generate Report</h3>
      <p className="mw-stage-desc">
        Claude fetches relevant code from the codebase, generates concise notes, and builds a beautified HTML report.
        Review and edit notes below, then rebuild the HTML.
      </p>
      <StatusBar message={error} type="error" />
      <button className="mw-btn mw-btn--primary" onClick={generate} disabled={busy} type="button">
        {busy ? 'Generating Report…' : report ? 'Regenerate HTML Report' : 'Generate HTML Report'}
      </button>
      {report && (
        <div className="mw-report-area">
          <NoteEditor
            meetingId={meeting.meeting_id}
            initialNotes={report.notes}
            initialHtml={report.html}
          />
        </div>
      )}
    </div>
  );
}

// ─── Stage 6: Issue Sync ─────────────────────────────────────────────────────
function IssueSyncStage({ meeting }) {
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function sync() {
    if (!owner || !repo) return setError('Owner and repo are required.');
    setBusy(true); setError(''); setResult(null);
    try {
      const data = await mwPost('/meeting/workflow/issuesync', {
        meeting_id: meeting.meeting_id,
        owner,
        repo,
        dry_run: dryRun,
      });
      setResult(data);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mw-stage-content">
      <h3 className="mw-stage-title">GitHub Issue Sync</h3>
      <p className="mw-stage-desc">
        Creates a GitHub issue for each approved task. Use dry run to preview without creating.
      </p>
      <StatusBar message={error} type="error" />
      <div className="mw-form-row">
        <input className="mw-input" placeholder="GitHub owner (org or user)" value={owner} onChange={(e) => setOwner(e.target.value)} />
        <input className="mw-input" placeholder="Repository name" value={repo} onChange={(e) => setRepo(e.target.value)} />
      </div>
      <label className="mw-checkbox-label">
        <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
        Dry run (preview only)
      </label>
      <button className="mw-btn mw-btn--primary" onClick={sync} disabled={busy} type="button">
        {busy ? 'Syncing…' : dryRun ? 'Preview Issues' : 'Create GitHub Issues'}
      </button>
      {result && (
        <div className="mw-result">
          <p className="mw-label">{result.results?.length || 0} task(s) processed{result.dry_run ? ' (dry run)' : ''}:</p>
          <ul className="mw-list">
            {(result.results || []).map((r, i) => (
              <li key={i}>
                {r.error
                  ? <span className="mw-red">Task {r.task_id}: {r.error}</span>
                  : r.dry_run
                    ? <span><strong>{r.payload?.title}</strong> — preview only</span>
                    : <a href={r.issue_url} target="_blank" rel="noreferrer">#{r.issue_number} — {r.goal}</a>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export default function WorkflowPanel({ meeting, onStageComplete }) {
  const [activeStage, setActiveStage] = useState(meeting?.current_stage ?? 0);
  // Track the latest stage completion count locally so StageNav stays accurate
  // even before the parent re-fetches the meeting list
  const [completedStage, setCompletedStage] = useState(meeting?.current_stage ?? 0);

  // Sync when parent passes a fresher meeting object (e.g. after list refresh)
  useEffect(() => {
    setCompletedStage(meeting?.current_stage ?? 0);
  }, [meeting?.current_stage]);

  const handleDone = useCallback(() => {
    setCompletedStage((s) => s + 1);
    onStageComplete?.();
  }, [onStageComplete]);

  if (!meeting) return null;

  const stageComponents = {
    0: <PreMeetingStage  meeting={meeting} onDone={handleDone} />,
    1: <LiveTranscribeStage meeting={meeting} onDone={handleDone} />,
    2: <AnalyzeStage     meeting={meeting} onDone={handleDone} />,
    3: <TasksStage       meeting={meeting} onDone={handleDone} />,
    4: <ApproveStage     meeting={meeting} onDone={handleDone} />,
    5: <ReportStage      meeting={meeting} onDone={handleDone} />,
    6: <IssueSyncStage   meeting={meeting} onDone={handleDone} />,
  };

  return (
    <div className="mw-panel">
      <div className="mw-panel-header">
        <div>
          <h2 className="mw-panel-title">{meeting.title}</h2>
          {meeting.scheduled_at && (
            <p className="mw-panel-meta">{new Date(meeting.scheduled_at).toLocaleString()}</p>
          )}
          {meeting.agenda && (
            <p className="mw-panel-meta mw-panel-agenda">Agenda: {meeting.agenda.split('\n')[0]}{meeting.agenda.includes('\n') ? '…' : ''}</p>
          )}
        </div>
        <span className={`mw-meeting-status mw-meeting-status--${meeting.status || 'pending'}`}>
          {meeting.status || 'pending'}
        </span>
      </div>
      <StageNav active={activeStage} completed={completedStage} onSelect={setActiveStage} />
      <div className="mw-stage-body">
        {stageComponents[activeStage] || null}
      </div>
    </div>
  );
}
