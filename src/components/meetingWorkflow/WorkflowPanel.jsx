import React, { useState } from 'react';
import { mwPost, mwPostForm, mwGet } from './api';

const STAGES = ['Transcribe', 'Analyze', 'Tasks', 'Approve', 'Report', 'Issue Sync'];

function parseJsonSafe(val) {
  try { return JSON.parse(val || '[]'); } catch { return []; }
}

export default function WorkflowPanel({ meeting }) {
  const [activeStage, setActiveStage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [dropdowns, setDropdowns] = useState({});
  const [error, setError] = useState(null);

  function reset() { setResult(null); setError(null); }

  async function handleTranscribe(e) {
    e.preventDefault();
    reset(); setBusy(true);
    try {
      const fd = new FormData(e.target);
      fd.append('meeting_id', meeting.id);
      const data = await mwPostForm('/meeting/workflow/transcribe', fd);
      setResult(data);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function handleAnalyze() {
    reset(); setBusy(true);
    try {
      const data = await mwPost('/meeting/workflow/analyze', { meeting_id: meeting.id });
      setResult(data);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function handleGenerateTasks() {
    reset(); setBusy(true);
    try {
      await mwPost('/meeting/workflow/tasks', { meeting_id: meeting.id });
      await refreshTasks();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function refreshTasks() {
    try {
      const data = await mwGet(`/meeting/workflow/tasks?meeting_id=${meeting.id}`);
      setTasks(data.tasks || []);
      setDropdowns(data.dropdowns || {});
    } catch (err) { setError(err.message); }
  }

  async function handleApproval(decision) {
    reset(); setBusy(true);
    try {
      await mwPost('/meeting/workflow/approve', { meeting_id: meeting.id, decision, approved_by: 'human' });
      setResult({ message: `Tasks ${decision}.` });
      await refreshTasks();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function handleReport() {
    reset(); setBusy(true);
    try {
      const data = await mwPost('/meeting/workflow/report', { meeting_id: meeting.id });
      setResult(data);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function handleIssueSync(e) {
    e.preventDefault();
    reset(); setBusy(true);
    try {
      const fd = new FormData(e.target);
      const data = await mwPost('/meeting/workflow/issuesync', {
        meeting_id: meeting.id,
        owner: fd.get('owner'),
        repo: fd.get('repo'),
        dry_run: fd.get('dry_run') === 'on',
      });
      setResult(data);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <h3>Workflow — {meeting.title}</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--ifm-color-emphasis-600)' }}>
        Stage: {meeting.current_stage} | Status: {meeting.status}
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {STAGES.map((s, i) => (
          <button key={s} onClick={() => { setActiveStage(i); reset(); }}
            style={{ fontWeight: activeStage === i ? 700 : 400 }}>
            {s}
          </button>
        ))}
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {activeStage === 0 && (
        <form onSubmit={handleTranscribe} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: 420 }}>
          <label>Audio file <input type="file" name="audio" accept="audio/*" required /></label>
          <button type="submit" disabled={busy}>{busy ? 'Transcribing…' : 'Transcribe'}</button>
          {result && <pre style={{ fontSize: '0.8rem', maxHeight: 200, overflow: 'auto' }}>{result.transcriptPreview || JSON.stringify(result, null, 2)}</pre>}
        </form>
      )}

      {activeStage === 1 && (
        <div>
          <button onClick={handleAnalyze} disabled={busy}>{busy ? 'Analyzing…' : 'Run MTA Analysis'}</button>
          {result && <pre style={{ fontSize: '0.8rem', maxHeight: 300, overflow: 'auto', marginTop: '0.5rem' }}>{JSON.stringify(result, null, 2)}</pre>}
        </div>
      )}

      {activeStage === 2 && (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <button onClick={handleGenerateTasks} disabled={busy}>{busy ? 'Generating…' : 'Generate Tasks'}</button>
            <button onClick={refreshTasks}>Refresh Tasks</button>
          </div>
          {tasks.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    {['Project','Platform','Feature','Sub Feature','Code Residence','Goal','Actions','Commands','Status'].map(h =>
                      <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--ifm-color-emphasis-300)' }}>{h}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <td style={{ padding: '0.4rem 0.6rem' }}>{t.project}</td>
                      <td style={{ padding: '0.4rem 0.6rem' }}>{t.platform}</td>
                      <td style={{ padding: '0.4rem 0.6rem' }}>{t.feature}</td>
                      <td style={{ padding: '0.4rem 0.6rem' }}>{t.sub_feature}</td>
                      <td style={{ padding: '0.4rem 0.6rem' }}>{t.code_residence}</td>
                      <td style={{ padding: '0.4rem 0.6rem' }}>{t.goal_of_task}</td>
                      <td style={{ padding: '0.4rem 0.6rem' }}>{parseJsonSafe(t.intended_actions_json).join(', ')}</td>
                      <td style={{ padding: '0.4rem 0.6rem' }}>{parseJsonSafe(t.suggested_commands_json).join(', ')}</td>
                      <td style={{ padding: '0.4rem 0.6rem' }}>{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p style={{ fontSize: '0.85rem' }}>No tasks yet. Generate them first.</p>}
        </div>
      )}

      {activeStage === 3 && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => handleApproval('approved')} disabled={busy}>Approve All</button>
          <button onClick={() => handleApproval('rejected')} disabled={busy}>Reject</button>
          {result && <span style={{ alignSelf: 'center', fontSize: '0.85rem' }}>{result.message}</span>}
        </div>
      )}

      {activeStage === 4 && (
        <div>
          <button onClick={handleReport} disabled={busy}>{busy ? 'Generating…' : 'Generate HTML Report'}</button>
          {result?.html && (
            <iframe
              srcDoc={result.html}
              title="Meeting Report"
              style={{ width: '100%', height: 500, border: '1px solid var(--ifm-color-emphasis-300)', borderRadius: 6, marginTop: '0.5rem', background: '#fff' }}
            />
          )}
        </div>
      )}

      {activeStage === 5 && (
        <form onSubmit={handleIssueSync} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: 420 }}>
          <label>GitHub Owner <input name="owner" placeholder="org-or-user" style={{ width: '100%' }} /></label>
          <label>GitHub Repo <input name="repo" placeholder="repo-name" style={{ width: '100%' }} /></label>
          <label><input type="checkbox" name="dry_run" defaultChecked /> Dry run</label>
          <button type="submit" disabled={busy}>{busy ? 'Syncing…' : 'Sync Issues to GitHub'}</button>
          {result && <pre style={{ fontSize: '0.8rem', maxHeight: 200, overflow: 'auto', marginTop: '0.5rem' }}>{JSON.stringify(result, null, 2)}</pre>}
        </form>
      )}
    </div>
  );
}
