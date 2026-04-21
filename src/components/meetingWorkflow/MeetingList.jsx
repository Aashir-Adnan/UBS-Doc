import React, { useState, useEffect } from 'react';
import { mwGet } from './api';

export default function MeetingList({ onSelectMeeting }) {
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await mwGet('/meeting/workflow/list');
      setMeetings(Array.isArray(data) ? data : data.return || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>Meetings</h3>
        <button onClick={refresh} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {meetings.length === 0 && !loading && <p>No meetings yet.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {meetings.map((m) => (
          <li
            key={m.id}
            onClick={() => onSelectMeeting(m)}
            style={{
              cursor: 'pointer',
              padding: '0.65rem 0.85rem',
              border: '1px solid var(--ifm-color-emphasis-300)',
              borderRadius: 8,
              marginBottom: '0.5rem',
            }}
          >
            <strong>{m.title}</strong>{' '}
            <span style={{ color: 'var(--ifm-color-emphasis-600)', fontSize: '0.85rem' }}>
              {m.scheduled_at}
            </span>
            <br />
            <span style={{ fontSize: '0.85rem', color: 'var(--ifm-color-emphasis-600)' }}>
              {m.status} · stage {m.current_stage}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
