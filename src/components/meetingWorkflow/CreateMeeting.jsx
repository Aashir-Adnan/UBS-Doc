import React, { useState } from 'react';
import { mwPost } from './api';

export default function CreateMeeting({ onCreated }) {
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [participants, setParticipants] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const sa = scheduledAt.length === 16 ? scheduledAt.replace('T', ' ') + ':00' : scheduledAt.replace('T', ' ');
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
        participants: JSON.stringify(parts),
      });
      setTitle('');
      setScheduledAt('');
      setParticipants('');
      if (onCreated) onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: 420 }}>
      <h3>Schedule a Meeting</h3>
      <label>Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required style={{ width: '100%' }} />
      </label>
      <label>When
        <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} required style={{ width: '100%' }} />
      </label>
      <label>Participants (one per line)
        <textarea rows={3} value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="Name <email optional>" style={{ width: '100%' }} />
      </label>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create meeting'}</button>
    </form>
  );
}
