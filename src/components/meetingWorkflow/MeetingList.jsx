import React, { useState, useEffect } from 'react';
import { mwGet } from './api';

const STATUS_LABEL = {
  pending: 'Pending',
  transcribed: 'Transcribed',
  analyzed: 'Analyzed',
  tasks_generated: 'Tasks',
  approved: 'Approved',
  rejected: 'Rejected',
  report_ready: 'Report Ready',
  completed: 'Completed',
};

const STAGE_LABELS = ['Pre-Meeting', 'Transcribe', 'Analyze', 'Tasks', 'Report'];

export default function MeetingList({ actingUrdd, onSelectMeeting, selectedId, onCreateClick }) {
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  async function refresh() {
    setLoading(true); setError(null);
    try {
      const data = await mwGet(`/meeting/workflow/list?actionPerformerURDD=${actingUrdd}`);
      const list = data.meetings || (Array.isArray(data) ? data : data.return || []);
      setMeetings(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const filtered = search.trim()
    ? meetings.filter((m) => m.title.toLowerCase().includes(search.toLowerCase()))
    : meetings;

  return (
    <div className="mw-meetings-page">
      <div className="mw-meetings-toolbar">
        <div className="mw-meetings-search-wrap">
          <svg className="mw-meetings-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          <input
            className="mw-meetings-search"
            placeholder="Search meetings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="mw-btn mw-btn--ghost mw-btn--sm" onClick={refresh} disabled={loading} type="button">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <p className="mw-field-error" style={{ marginBottom: '1rem' }}>{error}</p>}

      {filtered.length === 0 && !loading && (
        <div className="mw-meetings-empty">
          <p>{search ? 'No meetings match your search.' : 'No meetings yet.'}</p>
          {!search && onCreateClick && (
            <button type="button" className="mw-btn mw-btn--primary" onClick={onCreateClick}>
              Schedule your first meeting
            </button>
          )}
        </div>
      )}

      <div className="mw-meetings-grid">
        {filtered.map((m) => {
          const stage = m.current_stage ?? 0;
          const stageLabel = STAGE_LABELS[stage] || `Stage ${stage}`;
          return (
            <button
              key={m.meeting_id}
              type="button"
              className={`mw-meeting-card${selectedId === m.meeting_id ? ' mw-meeting-card--selected' : ''}`}
              onClick={() => onSelectMeeting(m)}
            >
              <div className="mw-meeting-card-top">
                <strong className="mw-meeting-card-title">{m.title}</strong>
                <span className={`mw-meeting-status mw-meeting-status--${m.status || 'pending'}`}>
                  {STATUS_LABEL[m.status] || m.status || 'pending'}
                </span>
                {m.parent_meeting_id && (
                  <span className="mw-chip mw-chip--followup" title="Follow-up meeting">↳ Follow-up</span>
                )}
              </div>
              {m.scheduled_at && (
                <p className="mw-meeting-card-date">
                  {new Date(m.scheduled_at).toLocaleString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              )}
              <div className="mw-meeting-card-progress">
                {STAGE_LABELS.map((label, i) => (
                  <div
                    key={i}
                    className={`mw-stage-pip${i < stage ? ' mw-stage-pip--done' : i === stage ? ' mw-stage-pip--active' : ''}`}
                    title={label}
                  />
                ))}
                <span className="mw-meeting-card-stage">{stageLabel}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
