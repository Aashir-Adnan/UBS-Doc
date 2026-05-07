import React, { useState, useEffect } from 'react';
import { mwGet } from './api';

const STATUS_CLASS = {
  pending: 'mw-meeting-status--pending',
  transcribed: 'mw-meeting-status--transcribed',
  analyzed: 'mw-meeting-status--analyzed',
  tasks_generated: 'mw-meeting-status--tasks_generated',
  approved: 'mw-meeting-status--approved',
  rejected: 'mw-meeting-status--rejected',
  report_ready: 'mw-meeting-status--report_ready',
  completed: 'mw-meeting-status--completed',
};

export default function MeetingList({ onSelectMeeting, selectedId }) {
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true); setError(null);
    try {
      const data = await mwGet('/meeting/workflow/list');
      const list = data.meetings || (Array.isArray(data) ? data : data.return || []);
      setMeetings(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  return (
    <div className="mw-list-card">
      <div className="mw-list-header">
        <h3 className="mw-list-title">Meetings</h3>
        <button className="mw-btn mw-btn--ghost" onClick={refresh} disabled={loading} type="button">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {error && <p className="mw-field-error">{error}</p>}
      {meetings.length === 0 && !loading && (
        <p className="mw-empty">No meetings yet. Create one to get started.</p>
      )}
      <ul className="mw-meeting-list">
        {meetings.map((m) => (
          <li
            key={m.meeting_id}
            className={`mw-meeting-item ${selectedId === m.meeting_id ? 'mw-meeting-item--selected' : ''}`}
            onClick={() => onSelectMeeting(m)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onSelectMeeting(m)}
          >
            <div className="mw-meeting-item-top">
              <strong className="mw-meeting-item-title">{m.title}</strong>
              <span className={`mw-meeting-status ${STATUS_CLASS[m.status] || ''}`}>
                {m.status || 'pending'}
              </span>
            </div>
            {m.scheduled_at && (
              <p className="mw-meeting-item-date">
                {new Date(m.scheduled_at).toLocaleString()}
              </p>
            )}
            <p className="mw-meeting-item-meta">Stage {m.current_stage ?? 0} of 6</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
