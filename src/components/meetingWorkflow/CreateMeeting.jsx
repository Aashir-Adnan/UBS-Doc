import React, { useState, useEffect, useRef } from 'react';
import { mwPost } from './api';
import { API_BASE_URL } from '@site/src/components/portal/config';

const REPOS_BASE = `${API_BASE_URL}/api/tracked`;

async function fetchRepos() {
  const r = await fetch(`${REPOS_BASE}/repos/list?version=1`);
  if (!r.ok) throw new Error(`Repos fetch failed: ${r.status}`);
  const json = await r.json();
  const data = json.payload?.return ?? json.payload ?? json;
  return data.repos || [];
}

async function fetchAllFeatures() {
  const r = await fetch(`${REPOS_BASE}/repos/features/list?version=1`);
  if (!r.ok) throw new Error(`Features fetch failed: ${r.status}`);
  const json = await r.json();
  const data = json.payload?.return ?? json.payload ?? json;
  return data.features || [];
}

async function addFeatureApi(repoId, name) {
  const r = await fetch(`${REPOS_BASE}/repos/features/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_id: repoId, feature_name: name, status: 'in-progress' }),
  });
  if (!r.ok) throw new Error(`Add feature failed: ${r.status}`);
  const json = await r.json();
  return json.payload?.return ?? json.payload ?? json;
}

// ─── SearchSelect tile ────────────────────────────────────────────────────────
// Generic combobox: search input → filtered dropdown → selected chips with ×

function SearchSelect({ title, items, selectedIds, onToggle, getLabel, getId, placeholder, emptyText }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const filtered = query.trim().length > 0
    ? items.filter((item) =>
        getLabel(item).toLowerCase().includes(query.toLowerCase()) &&
        !selectedIds.includes(getId(item))
      )
    : [];

  const selectedItems = items.filter((item) => selectedIds.includes(getId(item)));

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleInputChange(e) {
    setQuery(e.target.value);
    setOpen(true);
  }

  function handleSelect(item) {
    onToggle(getId(item));
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="ss-tile">
      <div className="ss-tile-title">{title}</div>

      {/* Selected chips */}
      {selectedItems.length > 0 && (
        <div className="ss-chips">
          {selectedItems.map((item) => (
            <span key={getId(item)} className="ss-chip">
              <span className="ss-chip-label">{getLabel(item)}</span>
              <button
                type="button"
                className="ss-chip-remove"
                onClick={() => onToggle(getId(item))}
                aria-label={`Remove ${getLabel(item)}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input + dropdown */}
      <div className="ss-combobox" ref={containerRef}>
        <div className="ss-input-wrap">
          <span className="ss-search-icon">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </span>
          <input
            className="ss-input"
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={handleInputChange}
            onFocus={() => query.trim() && setOpen(true)}
            autoComplete="off"
          />
          {query && (
            <button type="button" className="ss-clear" onClick={() => { setQuery(''); setOpen(false); }}>
              ×
            </button>
          )}
        </div>

        {open && query.trim().length > 0 && (
          <div className="ss-dropdown">
            {filtered.length === 0 ? (
              <div className="ss-dropdown-empty">{emptyText || 'No matches'}</div>
            ) : (
              filtered.map((item) => (
                <button
                  key={getId(item)}
                  type="button"
                  className="ss-dropdown-item"
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(item); }}
                >
                  {getLabel(item)}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selectedItems.length === 0 && items.length === 0 && (
        <p className="ss-hint">{emptyText}</p>
      )}
    </div>
  );
}

// ─── Scope Picker ─────────────────────────────────────────────────────────────

function ScopePicker({ selectedRepoIds, onRepoToggle, selectedFeatureIds, onFeatureToggle }) {
  const [repos, setRepos] = useState([]);
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([fetchRepos(), fetchAllFeatures()])
      .then(([r, f]) => { setRepos(r); setFeatures(f); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="mw-scope-loading">Loading…</div>;
  if (error) return <div className="mw-field-error">{error}</div>;

  const visibleFeatures = selectedRepoIds.length > 0
    ? features.filter((f) => selectedRepoIds.includes(f.repo_id))
    : features;

  return (
    <div className="ss-grid">
      <SearchSelect
        title="Repositories"
        items={repos}
        selectedIds={selectedRepoIds}
        onToggle={onRepoToggle}
        getLabel={(r) => r.name}
        getId={(r) => r.id}
        placeholder="Search repositories…"
        emptyText="No repositories found"
      />
      <SearchSelect
        title="Features"
        items={visibleFeatures}
        selectedIds={selectedFeatureIds}
        onToggle={onFeatureToggle}
        getLabel={(f) => f.feature_name}
        getId={(f) => f.id}
        placeholder={selectedRepoIds.length === 0 ? 'Select a repo first…' : 'Search features…'}
        emptyText={selectedRepoIds.length === 0 ? 'Select a repository to see features' : 'No matching features'}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CreateMeeting({ onCreated, userEmail }) {
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [participants, setParticipants] = useState('');
  const [agenda, setAgenda] = useState('');
  const [selectedRepoIds, setSelectedRepoIds] = useState([]);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const toggleRepo = (id) => setSelectedRepoIds((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  );

  const toggleFeature = (id) => setSelectedFeatureIds((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  );

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
        scope_repo_ids: selectedRepoIds,
        scope_feature_ids: selectedFeatureIds,
      });

      setTitle(''); setScheduledAt(''); setParticipants(''); setAgenda('');
      setSelectedRepoIds([]); setSelectedFeatureIds([]);
      setSuccess(true);
      onCreated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const scopeSummary = [
    selectedRepoIds.length ? `${selectedRepoIds.length} repo${selectedRepoIds.length > 1 ? 's' : ''}` : null,
    selectedFeatureIds.length ? `${selectedFeatureIds.length} feature${selectedFeatureIds.length > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(', ');

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

        <label className="mw-field-label">
          Scope
          <span className="mw-optional"> — repos &amp; features for this meeting</span>
          {scopeSummary ? <span className="mw-scope-summary"> ({scopeSummary})</span> : null}
        </label>
        <ScopePicker
          selectedRepoIds={selectedRepoIds}
          onRepoToggle={toggleRepo}
          selectedFeatureIds={selectedFeatureIds}
          onFeatureToggle={toggleFeature}
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
