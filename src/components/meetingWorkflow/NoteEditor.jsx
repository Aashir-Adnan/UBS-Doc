import React, { useState } from 'react';
import { mwPost } from './api';

/**
 * NoteEditor — shown after the report is generated.
 * Lets the user read/edit the markdown notes, preview the HTML iframe,
 * and rebuild the HTML after edits. Both are saved to the database.
 */
export default function NoteEditor({ meetingId, initialNotes, initialHtml }) {
  const [notes, setNotes] = useState(initialNotes || '');
  const [html, setHtml] = useState(initialHtml || '');
  const [view, setView] = useState('html'); // 'html' | 'notes'
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function rebuild() {
    if (!notes.trim()) return setError('Notes cannot be empty.');
    setBusy(true); setError(''); setSaved(false);
    try {
      const data = await mwPost('/meeting/workflow/updatenotes', {
        meeting_id: meetingId,
        edited_notes: notes,
        edited_by: 'human',
      });
      setHtml(data.html || html);
      setSaved(true);
      setView('html');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mw-note-editor">
      <div className="mw-note-editor-header">
        <div className="mw-tab-row">
          <button
            className={`mw-tab ${view === 'html' ? 'mw-tab--active' : ''}`}
            onClick={() => setView('html')}
            type="button"
          >
            HTML Preview
          </button>
          <button
            className={`mw-tab ${view === 'notes' ? 'mw-tab--active' : ''}`}
            onClick={() => setView('notes')}
            type="button"
          >
            Edit Notes
          </button>
        </div>
        {saved && <span className="mw-saved-badge">Saved ✓</span>}
      </div>

      {error && <div className="mw-status mw-status--error">{error}</div>}

      {view === 'html' && (
        <iframe
          srcDoc={html}
          title="Meeting Report"
          className="mw-html-iframe"
          sandbox="allow-same-origin"
        />
      )}

      {view === 'notes' && (
        <div className="mw-notes-panel">
          <p className="mw-stage-desc">
            Edit the notes below — they drive the HTML report. Click <strong>Rebuild HTML</strong> when done.
          </p>
          <textarea
            className="mw-notes-textarea"
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
            rows={20}
            spellCheck
          />
          <button
            className="mw-btn mw-btn--primary"
            onClick={rebuild}
            disabled={busy}
            type="button"
          >
            {busy ? 'Rebuilding HTML…' : 'Rebuild HTML'}
          </button>
        </div>
      )}
    </div>
  );
}
