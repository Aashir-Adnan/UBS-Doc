import React, { useState } from 'react';
import { mwPost } from './api';

export default function CreateMeeting({ onCreated, userEmail }) {
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [participants, setParticipants] = useState('');
  const [agenda, setAgenda] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true); setError(null); setSuccess(false);
    try {
      const sa = scheduledAt
        ? scheduledAt.length === 16
          ? scheduledAt.replace('T', ' ') + ':00'
          : scheduledAt.replace('T', ' ')
        : null;

      const parts = participants.trim()
        ? participants.trim().split('\n').map((line) => {
            const t = line.trim();
            const m = t.match(/<([^>]+)>/);
            return { display_name: m ? t.replace(/<[^>]+>/, '').trim() : t, email: m ? m[1] : null };
          })
        : [];

      await mwPost('/meeting/workflow/create', {
        title,
        scheduled_at: sa,
        participants: parts,
        created_by: userEmail || null,
        agenda: agenda.trim() || null,
      });

      setTitle(''); setScheduledAt(''); setParticipants(''); setAgenda('');
      setSuccess(true);
      onCreated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mw-create-card">
      <h3 className="mw-create-title">Schedule a Meeting</h3>
      <form onSubmit={handleSubmit} className="mw-create-form">
        <label className="mw-field-label">Title</label>
        <input
          className="mw-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Sprint Planning — Badar HMS"
          required
        />

        <label className="mw-field-label">When</label>
        <input
          className="mw-input"
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />

        <label className="mw-field-label">Agenda <span className="mw-optional">(one item per line)</span></label>
        <textarea
          className="mw-input"
          rows={3}
          value={agenda}
          onChange={(e) => setAgenda(e.target.value)}
          placeholder={'1. Review last sprint\n2. Discuss new feature X\n3. Blockers'}
        />

        <label className="mw-field-label">Participants <span className="mw-optional">(one per line)</span></label>
        <textarea
          className="mw-input"
          rows={3}
          value={participants}
          onChange={(e) => setParticipants(e.target.value)}
          placeholder={'Name <email@example.com>\nName only'}
        />

        {error && <p className="mw-field-error">{error}</p>}
        {success && <p className="mw-field-success">Meeting created.</p>}

        <button className="mw-btn mw-btn--primary" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create Meeting'}
        </button>
      </form>
    </div>
  );
}
