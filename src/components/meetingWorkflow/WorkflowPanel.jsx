import React, { useState, useCallback, useEffect, useRef } from 'react';
import { mwGet, mwPost, mwPostForm } from './api';
import NoteEditor from './NoteEditor';
import LiveTranscribeStage from './LiveTranscribeStage';

// Stages: removed Approve (merged into Tasks) and Issue Sync
const STAGES = [
  { id: 0, label: 'Pre-Meeting', icon: '📋' },
  { id: 1, label: 'Transcribe',  icon: '🎙️' },
  { id: 2, label: 'Analyze',     icon: '🔍' },
  { id: 3, label: 'Tasks',       icon: '📝' },
  { id: 4, label: 'Report',      icon: '📄' },
];

const PLATFORM_OPTIONS = ['node', 'react', 'react-native', 'flutter', 'python', 'other'];
const STATUS_OPTIONS   = ['pending', 'approved', 'rejected'];

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

// ─── Inline editable cell ─────────────────────────────────────────────────────
function EditableCell({ value, field, taskId, meetingId, options, onSaved, multiline }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || '');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setVal(value || ''); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function save() {
    if (val === (value || '')) { setEditing(false); return; }
    setBusy(true);
    try {
      const data = await mwPost('/meeting/workflow/tasks/update', {
        task_id: taskId,
        meeting_id: meetingId,
        [field]: val,
      });
      onSaved?.(data.task);
    } catch (_) {}
    finally { setBusy(false); setEditing(false); }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !multiline) save();
    if (e.key === 'Escape') { setVal(value || ''); setEditing(false); }
  }

  if (!editing) {
    return (
      <span
        className="mw-editable-cell"
        onClick={() => setEditing(true)}
        title="Click to edit"
      >
        {value || <span className="mw-editable-placeholder">—</span>}
      </span>
    );
  }

  if (options) {
    return (
      <select
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        disabled={busy}
        className="mw-inline-select"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  return (
    <input
      ref={inputRef}
      className="mw-inline-input"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={save}
      onKeyDown={onKeyDown}
      disabled={busy}
    />
  );
}

// ─── Context Files Panel ─────────────────────────────────────────────────────
// Allows uploading reference files that Claude uses as extra context.

function ContextFilesPanel({ meetingId }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    mwGet(`/meeting/workflow/context-files?meeting_id=${meetingId}`)
      .then((d) => setFiles(d.files || []))
      .catch(() => {});
  }, [meetingId]);

  async function handleFiles(fileList) {
    if (!fileList?.length) return;
    setUploading(true); setError('');
    try {
      const form = new FormData();
      form.append('meeting_id', meetingId);
      for (const f of fileList) form.append('files', f);
      const data = await mwPostForm('/meeting/workflow/context-files', form);
      const uploaded = data.uploaded || [];
      // Refresh list
      const fresh = await mwGet(`/meeting/workflow/context-files?meeting_id=${meetingId}`);
      setFiles(fresh.files || []);
    } catch (e) { setError(e.message); }
    finally { setUploading(false); }
  }

  async function removeFile(fileId) {
    try {
      await mwPost('/meeting/workflow/context-files/delete', { file_id: fileId, meeting_id: meetingId });
      setFiles((prev) => prev.filter((f) => f.file_id !== fileId));
    } catch (e) { setError(e.message); }
  }

  function onDrop(e) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="mw-context-files">
      <p className="mw-label" style={{ marginBottom: '0.5rem' }}>
        Context Files <span className="mw-optional">(uploaded text is injected into Claude prompts)</span>
      </p>
      <div
        className="mw-dropzone"
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        {uploading ? 'Uploading…' : 'Drop files here or click to browse'}
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {error && <p className="mw-field-error" style={{ marginTop: '0.25rem' }}>{error}</p>}
      {files.length > 0 && (
        <ul className="mw-context-file-list">
          {files.map((f) => (
            <li key={f.file_id} className="mw-context-file-item">
              <span className="mw-context-file-name" title={f.filename}>{f.filename}</span>
              <span className="mw-context-file-meta">
                {f.file_size ? `${(f.file_size / 1024).toFixed(1)} KB` : ''}
                {f.has_text ? ' · text ✓' : ' · binary'}
              </span>
              <button
                className="mw-btn mw-btn--danger mw-btn--sm"
                onClick={() => removeFile(f.file_id)}
                type="button"
                title="Remove"
              >✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Stage 0: Pre-Meeting Notes ───────────────────────────────────────────────
function PreMeetingStage({ meeting, detail, onDone }) {
  const [busy, setBusy] = useState(false);
  const [md, setMd] = useState(detail?.meeting?.pre_meeting_notes || meeting.pre_meeting_notes || '');
  const [html, setHtml] = useState(detail?.meeting?.pre_meeting_html || meeting.pre_meeting_html || '');
  const [keyTopics, setKeyTopics] = useState([]);
  const [openItems, setOpenItems] = useState([]);
  const [view, setView] = useState('md');
  const [error, setError] = useState('');

  useEffect(() => { if (html) setView('html'); }, [html]);

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
      <ContextFilesPanel meetingId={meeting.meeting_id} />
      <StatusBar message={error} type="error" />
      <button className="mw-btn mw-btn--primary" onClick={run} disabled={busy} type="button" style={{ marginTop: '0.75rem' }}>
        {busy ? 'Generating…' : hasContent ? 'Regenerate Notes' : 'Generate Pre-Meeting Notes'}
      </button>
      {hasContent && (
        <div className="mw-note-editor" style={{ marginTop: '1.25rem' }}>
          <div className="mw-note-editor-header">
            <div className="mw-tab-row">
              <button className={`mw-tab${view === 'html' ? ' mw-tab--active' : ''}`} onClick={() => setView('html')} type="button" disabled={!html}>HTML Preview</button>
              <button className={`mw-tab${view === 'md' ? ' mw-tab--active' : ''}`} onClick={() => setView('md')} type="button">Markdown</button>
            </div>
          </div>
          {view === 'html' && html && (
            <iframe srcDoc={html} title="Pre-Meeting Notes" className="mw-html-iframe" sandbox="allow-same-origin" />
          )}
          {view === 'md' && (
            <div className="mw-notes-panel">
              <pre className="mw-pre" style={{ maxHeight: '60vh', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{md}</pre>
            </div>
          )}
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
function AnalyzeStage({ meeting, detail, onDone }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(detail?.meeting?.analysis_json || null);
  const [error, setError] = useState('');

  // Clarify Q&A state
  const [clarifyBusy, setClarifyBusy] = useState(false);
  const [questions, setQuestions] = useState(null); // [{id, question}]
  const [answers, setAnswers] = useState({});       // {id: answer string}
  const [reviseBusy, setReviseBusy] = useState(false);

  async function run() {
    setBusy(true); setError(''); setResult(null); setQuestions(null);
    try {
      const data = await mwPost('/meeting/workflow/analyze', { meeting_id: meeting.meeting_id });
      setResult(data.analysis || data);
      onDone?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function runClarify() {
    setClarifyBusy(true); setError('');
    try {
      const data = await mwPost('/meeting/workflow/clarify', { meeting_id: meeting.meeting_id });
      setQuestions(data.questions || []);
      setAnswers({});
    } catch (e) { setError(e.message); }
    finally { setClarifyBusy(false); }
  }

  async function runRevise() {
    const answered = (questions || []).map((q) => ({
      question: q.question,
      answer: answers[q.id] || '',
    }));
    setReviseBusy(true); setError('');
    try {
      const data = await mwPost('/meeting/workflow/clarify/revise', {
        meeting_id: meeting.meeting_id,
        answered_questions: answered,
      });
      setResult(data.analysis);
      setQuestions(null);
      setAnswers({});
    } catch (e) { setError(e.message); }
    finally { setReviseBusy(false); }
  }

  const allAnswered = questions?.length > 0 && questions.every((q) => (answers[q.id] || '').trim());

  return (
    <div className="mw-stage-content">
      <h3 className="mw-stage-title">MTA Analysis</h3>
      <p className="mw-stage-desc">
        Claude analyzes the transcript to extract projects, platforms, features, decisions, and action items.
      </p>
      {!meeting.transcript && !detail?.meeting?.transcript && (
        <StatusBar message="No transcript yet — complete the Transcribe step first." type="info" />
      )}
      <StatusBar message={error} type="error" />

      <div className="mw-btn-row">
        <button className="mw-btn mw-btn--primary" onClick={run} disabled={busy || clarifyBusy || reviseBusy} type="button">
          {busy ? 'Analyzing…' : result ? 'Re-run Analysis' : 'Run MTA Analysis'}
        </button>
        {result && (
          <button className="mw-btn mw-btn--ghost" onClick={runClarify} disabled={busy || clarifyBusy || reviseBusy} type="button">
            {clarifyBusy ? 'Generating questions…' : 'Prompt Claude for Clarity'}
          </button>
        )}
      </div>

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
          {result.actionItems?.length > 0 && (
            <>
              <p className="mw-label">Action items:</p>
              <ul className="mw-list">{result.actionItems.map((a, i) => <li key={i}>{a}</li>)}</ul>
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

      {/* Clarification Q&A panel */}
      {questions && (
        <div className="mw-clarify-panel">
          <p className="mw-label" style={{ marginBottom: '0.75rem' }}>
            Answer these questions, then revise the analysis:
          </p>
          {questions.map((q) => (
            <div key={q.id} className="mw-clarify-qa">
              <p className="mw-clarify-question">{q.id}. {q.question}</p>
              <textarea
                className="mw-input mw-clarify-answer"
                rows={2}
                placeholder="Your answer…"
                value={answers[q.id] || ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
              />
            </div>
          ))}
          <div className="mw-btn-row" style={{ marginTop: '0.75rem' }}>
            <button
              className="mw-btn mw-btn--primary"
              onClick={runRevise}
              disabled={reviseBusy || !allAnswered}
              type="button"
            >
              {reviseBusy ? 'Revising…' : 'Revise Analysis'}
            </button>
            <button className="mw-btn mw-btn--ghost" onClick={() => setQuestions(null)} type="button">
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stage 3: Tasks + Approve (consolidated) ─────────────────────────────────
const EMPTY_NEW_TASK = { project: '', platform: '', feature: '', sub_feature: '', code_residence: '', goal_of_task: '' };

function TasksStage({ meeting, detail, onDone }) {
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState(detail?.tasks || null);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTask, setNewTask] = useState(EMPTY_NEW_TASK);
  const [addBusy, setAddBusy] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveResult, setApproveResult] = useState(null);

  // Load tasks from DB on mount
  useEffect(() => {
    if (tasks !== null) return;
    mwGet(`/meeting/workflow/tasks?meeting_id=${meeting.meeting_id}`)
      .then((data) => setTasks(data.tasks || []))
      .catch(() => setTasks([]));
  }, [meeting.meeting_id]);

  // Reflect pre-existing approval state
  useEffect(() => {
    if (!tasks?.length) return;
    const statuses = [...new Set(tasks.map((t) => t.status))];
    if (statuses.length === 1 && (statuses[0] === 'approved' || statuses[0] === 'rejected')) {
      setApproveResult({ decision: statuses[0], count: tasks.length, issueResults: [] });
    }
  }, [tasks]);

  async function generate() {
    setBusy(true); setError('');
    try {
      const data = await mwPost('/meeting/workflow/tasks', { meeting_id: meeting.meeting_id });
      setTasks(data.tasks || []);
      setApproveResult(null);
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

  async function addTask() {
    if (!newTask.goal_of_task.trim()) return;
    setAddBusy(true); setError('');
    try {
      const data = await mwPost('/meeting/workflow/tasks/add', { meeting_id: meeting.meeting_id, ...newTask });
      setTasks((prev) => [...(prev || []), data.task]);
      setNewTask(EMPTY_NEW_TASK);
      setShowAddForm(false);
    } catch (e) { setError(e.message); }
    finally { setAddBusy(false); }
  }

  async function deleteTask(taskId) {
    setDeletingId(taskId); setError('');
    try {
      await mwPost('/meeting/workflow/tasks/delete', { task_id: taskId, meeting_id: meeting.meeting_id });
      setTasks((prev) => prev.filter((t) => t.task_id !== taskId));
    } catch (e) { setError(e.message); }
    finally { setDeletingId(null); }
  }

  function handleTaskSaved(updatedTask) {
    setTasks((prev) => prev.map((t) => t.task_id === updatedTask.task_id ? updatedTask : t));
  }

  async function decide(decision) {
    setApproveBusy(true); setError('');
    try {
      const data = await mwPost('/meeting/workflow/approve', {
        meeting_id: meeting.meeting_id,
        decision,
        approved_by: 'human',
      });
      setApproveResult({ decision, count: data.tasks?.length || 0, issueResults: data.issueResults || [] });
      setTasks(data.tasks || tasks);
      onDone?.();
    } catch (e) { setError(e.message); }
    finally { setApproveBusy(false); }
  }

  function updateNew(field, val) {
    setNewTask((prev) => ({ ...prev, [field]: val }));
  }

  return (
    <div className="mw-stage-content">
      <h3 className="mw-stage-title">Tasks &amp; Approval</h3>
      <p className="mw-stage-desc">
        Claude converts the analysis into discrete development tasks. Review, edit, add or remove tasks, then approve to automatically create GitHub issues.
      </p>
      <StatusBar message={error} type="error" />

      <div className="mw-btn-row">
        <button className="mw-btn mw-btn--primary" onClick={generate} disabled={busy || approveBusy} type="button">
          {busy ? 'Generating…' : tasks?.length ? 'Regenerate Tasks' : 'Generate Tasks'}
        </button>
        <button className="mw-btn mw-btn--ghost" onClick={refresh} disabled={busy || approveBusy} type="button">
          Refresh
        </button>
        <button className="mw-btn mw-btn--ghost" onClick={() => setShowAddForm((v) => !v)} type="button">
          {showAddForm ? 'Cancel' : '+ Add Task'}
        </button>
      </div>

      {showAddForm && (
        <div className="mw-add-task-form">
          <div className="mw-form-row">
            <input className="mw-input" placeholder="Project" value={newTask.project} onChange={(e) => updateNew('project', e.target.value)} />
            <input className="mw-input" placeholder="Platform (node/react/…)" value={newTask.platform} onChange={(e) => updateNew('platform', e.target.value)} />
            <input className="mw-input" placeholder="Feature" value={newTask.feature} onChange={(e) => updateNew('feature', e.target.value)} />
          </div>
          <div className="mw-form-row">
            <input className="mw-input" placeholder="Sub-feature" value={newTask.sub_feature} onChange={(e) => updateNew('sub_feature', e.target.value)} />
            <input className="mw-input" placeholder="Code location (file/module)" value={newTask.code_residence} onChange={(e) => updateNew('code_residence', e.target.value)} />
          </div>
          <input
            className="mw-input"
            placeholder="Goal of task (required)"
            value={newTask.goal_of_task}
            onChange={(e) => updateNew('goal_of_task', e.target.value)}
            style={{ width: '100%' }}
          />
          <button
            className="mw-btn mw-btn--success"
            onClick={addTask}
            disabled={addBusy || !newTask.goal_of_task.trim()}
            type="button"
            style={{ marginTop: '0.5rem' }}
          >
            {addBusy ? 'Adding…' : 'Add Task'}
          </button>
        </div>
      )}

      {tasks !== null && (
        <div className="mw-table-wrap">
          {tasks.length === 0 ? (
            <p className="mw-empty">No tasks yet. Generate tasks or add one manually.</p>
          ) : (
            <table className="mw-table">
              <thead>
                <tr>
                  <th>#</th><th>Project</th><th>Platform</th><th>Feature</th>
                  <th>Code Location</th><th>Goal</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, i) => (
                  <tr key={t.task_id || i}>
                    <td>{i + 1}</td>
                    <td>
                      <EditableCell value={t.project} field="project" taskId={t.task_id} meetingId={meeting.meeting_id} onSaved={handleTaskSaved} />
                    </td>
                    <td>
                      <EditableCell value={t.platform} field="platform" taskId={t.task_id} meetingId={meeting.meeting_id} options={PLATFORM_OPTIONS} onSaved={handleTaskSaved} />
                    </td>
                    <td>
                      <EditableCell value={t.feature} field="feature" taskId={t.task_id} meetingId={meeting.meeting_id} onSaved={handleTaskSaved} />
                      {t.sub_feature && (
                        <><br /><small><EditableCell value={t.sub_feature} field="sub_feature" taskId={t.task_id} meetingId={meeting.meeting_id} onSaved={handleTaskSaved} /></small></>
                      )}
                    </td>
                    <td>
                      <code className="mw-code">
                        <EditableCell value={t.code_residence} field="code_residence" taskId={t.task_id} meetingId={meeting.meeting_id} onSaved={handleTaskSaved} />
                      </code>
                    </td>
                    <td>
                      <EditableCell value={t.goal_of_task} field="goal_of_task" taskId={t.task_id} meetingId={meeting.meeting_id} onSaved={handleTaskSaved} />
                    </td>
                    <td>
                      <EditableCell value={t.status} field="status" taskId={t.task_id} meetingId={meeting.meeting_id} options={STATUS_OPTIONS} onSaved={handleTaskSaved} />
                    </td>
                    <td>
                      <button
                        className="mw-btn mw-btn--danger mw-btn--sm"
                        onClick={() => deleteTask(t.task_id)}
                        disabled={deletingId === t.task_id}
                        type="button"
                        title="Delete task"
                      >
                        {deletingId === t.task_id ? '…' : '✕'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Approve / Reject section */}
      {tasks?.length > 0 && (
        <div className="mw-approve-section">
          <h4 className="mw-approve-title">Approve Tasks</h4>
          <p className="mw-stage-desc" style={{ marginBottom: '0.75rem' }}>
            Approved tasks will automatically have GitHub issues created (if GITHUB_PAT is configured).
          </p>
          {approveResult ? (
            <div className="mw-result">
              <p className="mw-label">
                Decision: <strong className={approveResult.decision === 'approved' ? 'mw-green' : 'mw-red'}>
                  {approveResult.decision}
                </strong> — {approveResult.count} task(s) updated.
              </p>
              {approveResult.issueResults?.length > 0 && (
                <>
                  <p className="mw-label" style={{ marginTop: '0.5rem' }}>GitHub issues created:</p>
                  <ul className="mw-list">
                    {approveResult.issueResults.map((r, i) => (
                      <li key={i}>
                        {r.error
                          ? <span className="mw-red">Task {r.task_id}: {r.error}</span>
                          : r.skipped
                          ? <span className="mw-orange" title={`${Math.round((r.match_ratio || 0) * 100)}% keyword overlap`}>
                              Task {r.task_id}: skipped — duplicate of&nbsp;
                              <a href={r.duplicate_url} target="_blank" rel="noreferrer">#{r.duplicate_of}</a>
                            </span>
                          : <a href={r.issue_url} target="_blank" rel="noreferrer">#{r.issue_number} — Task {r.task_id}</a>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <button className="mw-btn mw-btn--ghost" onClick={() => setApproveResult(null)} type="button" style={{ marginTop: '0.5rem' }}>
                Change Decision
              </button>
            </div>
          ) : (
            <div className="mw-btn-row">
              <button className="mw-btn mw-btn--success" onClick={() => decide('approved')} disabled={approveBusy || busy} type="button">
                {approveBusy ? 'Saving…' : 'Approve All'}
              </button>
              <button className="mw-btn mw-btn--danger" onClick={() => decide('rejected')} disabled={approveBusy || busy} type="button">
                Reject All
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stage 4: Report ─────────────────────────────────────────────────────────
function ReportStage({ meeting, detail, onDone }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (detail?.latestHtml || detail?.notes?.raw_notes) {
      setReport({
        notes: detail.notes?.edited_notes || detail.notes?.raw_notes || '',
        html: detail.latestHtml || '',
      });
      return;
    }
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
        Claude generates concise notes and fills the fixed HTML report template — including the full transcript. Review and edit notes below, then rebuild the HTML.
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

// ─── Main Panel ───────────────────────────────────────────────────────────────
export default function WorkflowPanel({ meeting, onStageComplete }) {
  const [activeStage, setActiveStage] = useState(meeting?.current_stage ?? 0);
  const [completedStage, setCompletedStage] = useState(meeting?.current_stage ?? 0);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setCompletedStage(meeting?.current_stage ?? 0);
  }, [meeting?.current_stage]);

  useEffect(() => {
    if (!meeting?.meeting_id) return;
    setDetail(null);
    setDetailLoading(true);
    mwGet(`/meeting/workflow/meeting?meeting_id=${meeting.meeting_id}`)
      .then((data) => setDetail(data))
      .catch(() => setDetail({}))
      .finally(() => setDetailLoading(false));
  }, [meeting?.meeting_id]);

  const handleDone = useCallback(() => {
    setCompletedStage((s) => s + 1);
    onStageComplete?.();
    if (meeting?.meeting_id) {
      mwGet(`/meeting/workflow/meeting?meeting_id=${meeting.meeting_id}`)
        .then((data) => setDetail(data))
        .catch(() => {});
    }
  }, [onStageComplete, meeting?.meeting_id]);

  if (!meeting) return null;

  const stageComponents = {
    0: <PreMeetingStage  meeting={meeting} detail={detail} onDone={handleDone} />,
    1: <LiveTranscribeStage meeting={meeting} detail={detail} onDone={handleDone} />,
    2: <AnalyzeStage     meeting={meeting} detail={detail} onDone={handleDone} />,
    3: <TasksStage       meeting={meeting} detail={detail} onDone={handleDone} />,
    4: <ReportStage      meeting={meeting} detail={detail} onDone={handleDone} />,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {detailLoading && <span className="mw-loading-hint">Loading…</span>}
          <span className={`mw-meeting-status mw-meeting-status--${meeting.status || 'pending'}`}>
            {meeting.status || 'pending'}
          </span>
        </div>
      </div>
      <StageNav active={activeStage} completed={completedStage} onSelect={setActiveStage} />
      <div className="mw-stage-body">
        {stageComponents[activeStage] || null}
      </div>
    </div>
  );
}
