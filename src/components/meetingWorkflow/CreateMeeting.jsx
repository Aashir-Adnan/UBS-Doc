import React, { useState, useEffect, useRef, useCallback } from 'react';
import { mwPost } from './api';
import { listTenantRepos } from './tenantRepos';
import { API_BASE_URL } from '@site/src/components/portal/config';

const REPOS_BASE = `${API_BASE_URL}/api/tracked`;
const USERS_BASE = `${API_BASE_URL}/api/portal/users`;

async function fetchAllFeatures() {
  const r = await fetch(`${REPOS_BASE}/repos/features/list?version=1`);
  if (!r.ok) throw new Error(`Features fetch failed: ${r.status}`);
  const json = await r.json();
  const data = json.payload?.return ?? json.payload ?? json;
  return data.features || [];
}

async function fetchPortalUsers() {
  const r = await fetch(`${USERS_BASE}/list?version=1`);
  if (!r.ok) throw new Error(`Users fetch failed: ${r.status}`);
  const json = await r.json();
  const data = json.payload?.return ?? json.payload ?? json;
  return data.users || [];
}

// ─── Digital clock picker ────────────────────────────────────────────────────
// date: 'YYYY-MM-DD', hours: '00'-'23', minutes: '00'-'59'

function DigitalClock({ date, hours, minutes, onDateChange, onHoursChange, onMinutesChange }) {
  const hourRef = useRef(null);
  const minRef = useRef(null);

  function onHourKey(e) {
    const cur = parseInt(hours || '0', 10);
    if (e.key === 'ArrowUp') onHoursChange(String(Math.min(23, cur + 1)).padStart(2, '0'));
    else if (e.key === 'ArrowDown') onHoursChange(String(Math.max(0, cur - 1)).padStart(2, '0'));
  }
  function onMinKey(e) {
    const cur = parseInt(minutes || '0', 10);
    if (e.key === 'ArrowUp') onMinutesChange(String(Math.min(59, cur + 1)).padStart(2, '0'));
    else if (e.key === 'ArrowDown') onMinutesChange(String(Math.max(0, cur - 1)).padStart(2, '0'));
  }

  return (
    <div className="mw-clock">
      <input
        type="date"
        className="mw-clock-date"
        value={date}
        onChange={(e) => onDateChange(e.target.value)}
      />
      <div className="mw-clock-time">
        <input
          ref={hourRef}
          className="mw-clock-seg"
          type="number"
          min="0" max="23"
          value={hours}
          placeholder="HH"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 2);
            onHoursChange(v);
            if (v.length === 2) minRef.current?.focus();
          }}
          onKeyDown={onHourKey}
          onBlur={() => onHoursChange(hours.padStart(2, '0'))}
        />
        <span className="mw-clock-colon">:</span>
        <input
          ref={minRef}
          className="mw-clock-seg"
          type="number"
          min="0" max="59"
          value={minutes}
          placeholder="MM"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 2);
            onMinutesChange(v);
          }}
          onKeyDown={onMinKey}
          onBlur={() => onMinutesChange(minutes.padStart(2, '0'))}
        />
      </div>
    </div>
  );
}

// ─── Participants picker ─────────────────────────────────────────────────────

function ParticipantsPicker({ selectedEmails, onToggle, currentUserEmail }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchPortalUsers()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = search.trim()
    ? users.filter((u) =>
        (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  if (loading) return <div className="mw-scope-loading">Loading users…</div>;

  return (
    <div className="mw-participants-picker">
      <input
        className="mw-input"
        placeholder="Search people…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: '0.5rem' }}
      />
      <div className="mw-participants-list">
        {filtered.map((u) => {
          const selected = selectedEmails.includes(u.email);
          const isSelf = u.email === currentUserEmail;
          return (
            <button
              key={u.email}
              type="button"
              className={`mw-participant-tile${selected ? ' mw-participant-tile--selected' : ''}`}
              onClick={() => !isSelf && onToggle(u)}
              disabled={isSelf}
              title={isSelf ? 'You are always included' : u.email}
            >
              {u.photo_url
                ? <img src={u.photo_url} className="mw-participant-avatar" alt="" />
                : <span className="mw-participant-initials">{(u.name || u.email)[0].toUpperCase()}</span>
              }
              <span className="mw-participant-name">{u.name || u.email}</span>
              {isSelf && <span className="mw-participant-you">you</span>}
              {selected && !isSelf && <span className="mw-participant-check">✓</span>}
            </button>
          );
        })}
        {filtered.length === 0 && <p className="mw-empty">No users found.</p>}
      </div>
    </div>
  );
}

// ─── Scope picker — always-visible two-column list ──────────────────────────

function CheckList({ items, selectedIds, onToggle, getLabel, getId, getSubLabel, search }) {
  const filtered = search.trim()
    ? items.filter((item) => getLabel(item).toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div className="mw-checklist">
      {filtered.map((item) => {
        const id = getId(item);
        const selected = selectedIds.includes(id);
        return (
          <button
            key={id}
            type="button"
            className={`mw-checklist-item${selected ? ' mw-checklist-item--selected' : ''}`}
            onClick={() => onToggle(id)}
          >
            <span className={`mw-checklist-box${selected ? ' mw-checklist-box--checked' : ''}`}>
              {selected && '✓'}
            </span>
            <span className="mw-checklist-label">
              {getLabel(item)}
              {getSubLabel && <small className="mw-checklist-sub">{getSubLabel(item)}</small>}
            </span>
          </button>
        );
      })}
      {filtered.length === 0 && <p className="mw-empty" style={{ padding: '0.5rem 0' }}>No matches.</p>}
    </div>
  );
}

function ScopePicker({ actingUrdd, selectedRepoIds, onRepoToggle, selectedFeatureIds, onFeatureToggle }) {
  const [repos, setRepos] = useState([]);
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [repoSearch, setRepoSearch] = useState('');
  const [featSearch, setFeatSearch] = useState('');

  useEffect(() => {
    // Tenant-scoped repo list — the user can only pick repos in their tenant.
    Promise.all([listTenantRepos(actingUrdd), fetchAllFeatures()])
      .then(([r, f]) => { setRepos(r); setFeatures(f); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [actingUrdd]);

  if (loading) return <div className="mw-scope-loading">Loading…</div>;
  if (error) return <div className="mw-field-error">{error}</div>;

  const scopedFeatures = selectedRepoIds.length > 0
    ? features.filter((f) => selectedRepoIds.includes(f.repo_id))
    : features;

  // Split manual vs framework features
  const manualFeatures = scopedFeatures.filter((f) => f.source !== 'project-status');
  const psFeatures = scopedFeatures.filter((f) => f.source === 'project-status');

  // Group framework features by category for display
  const psByCategory = psFeatures.reduce((acc, f) => {
    const cat = f.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(f);
    return acc;
  }, {});

  const displayFeatures = [
    ...manualFeatures,
    ...psFeatures,
  ];

  return (
    <div className="mw-scope-picker">
      <div className="mw-scope-col">
        <p className="mw-scope-col-title">
          Repositories
          {selectedRepoIds.length > 0 && <span className="mw-scope-badge">{selectedRepoIds.length}</span>}
        </p>
        <input
          className="mw-input mw-input--sm"
          placeholder="Filter…"
          value={repoSearch}
          onChange={(e) => setRepoSearch(e.target.value)}
        />
        <CheckList
          items={repos}
          selectedIds={selectedRepoIds}
          onToggle={onRepoToggle}
          getLabel={(r) => r.name}
          getId={(r) => r.id}
          getSubLabel={(r) => r.branch || 'main'}
          search={repoSearch}
        />
      </div>

      <div className="mw-scope-col">
        <p className="mw-scope-col-title">
          Features
          {selectedFeatureIds.length > 0 && <span className="mw-scope-badge">{selectedFeatureIds.length}</span>}
          {selectedRepoIds.length === 0 && <small className="mw-scope-hint"> (all repos)</small>}
        </p>
        <input
          className="mw-input mw-input--sm"
          placeholder="Filter…"
          value={featSearch}
          onChange={(e) => setFeatSearch(e.target.value)}
        />

        {/* Manual features */}
        {manualFeatures.length > 0 && (
          <CheckList
            items={manualFeatures}
            selectedIds={selectedFeatureIds}
            onToggle={onFeatureToggle}
            getLabel={(f) => f.feature_name}
            getId={(f) => f.id}
            getSubLabel={(f) => f.repo_name}
            search={featSearch}
          />
        )}

        {/* Framework features grouped by category */}
        {Object.entries(psByCategory).map(([cat, items]) => {
          const filteredItems = featSearch.trim()
            ? items.filter((f) => f.feature_name.toLowerCase().includes(featSearch.toLowerCase()))
            : items;
          if (!filteredItems.length) return null;
          return (
            <div key={cat}>
              <p className="mw-scope-cat-label">{cat}</p>
              <CheckList
                items={filteredItems}
                selectedIds={selectedFeatureIds}
                onToggle={onFeatureToggle}
                getLabel={(f) => f.feature_name}
                getId={(f) => f.id}
                getSubLabel={(f) => f.status === 'functional' ? 'done' : 'in progress'}
                search=""
              />
            </div>
          );
        })}

        {displayFeatures.length === 0 && (
          <p className="mw-empty" style={{ padding: '0.5rem 0' }}>
            {selectedRepoIds.length === 0 ? 'Select a repo to filter features.' : 'No features for selected repos.'}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CreateMeeting({ actingUrdd, onCreated, onCancel, userEmail }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [hours, setHours] = useState('09');
  const [minutes, setMinutes] = useState('00');
  const [agenda, setAgenda] = useState('');
  const [selectedRepoIds, setSelectedRepoIds] = useState([]);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState([]);
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [done, setDone] = useState(false);

  // Auto-include current user as participant
  useEffect(() => {
    if (userEmail && !selectedParticipants.some((p) => p.email === userEmail)) {
      setSelectedParticipants([{ email: userEmail, display_name: null }]);
    }
  }, [userEmail]);

  const toggleRepo = useCallback((id) => setSelectedRepoIds((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  ), []);

  const toggleFeature = useCallback((id) => setSelectedFeatureIds((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  ), []);

  const toggleParticipant = useCallback((user) => {
    setSelectedParticipants((prev) => {
      const exists = prev.some((p) => p.email === user.email);
      return exists
        ? prev.filter((p) => p.email !== user.email)
        : [...prev, { email: user.email, display_name: user.name || null }];
    });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      let scheduled_at = null;
      if (date) {
        const h = hours.padStart(2, '0');
        const m = minutes.padStart(2, '0');
        scheduled_at = `${date} ${h}:${m}:00`;
      }

      const res = await mwPost('/meeting/workflow/create', {
        actionPerformerURDD: actingUrdd,
        title,
        scheduled_at,
        participants: selectedParticipants,
        created_by: userEmail || null,
        agenda: agenda.trim() || null,
        scope_repo_ids: selectedRepoIds,
        scope_feature_ids: selectedFeatureIds,
      });

      // The returned scope_repo_ids are the SURVIVING set after tenant filtering;
      // if fewer came back, some repos were cross-tenant and were dropped.
      const survived = Array.isArray(res?.scope_repo_ids) ? res.scope_repo_ids : null;
      if (survived && survived.length < selectedRepoIds.length) {
        const dropped = selectedRepoIds.length - survived.length;
        setNotice(
          `Meeting created, but ${dropped} repo(s) were outside your tenant and ` +
          `were not attached.`,
        );
        // Meeting already exists — mark done so the form can't re-submit it.
        setDone(true);
        setBusy(false);
        return;
      }

      onCreated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mw-create-layout">
      {/* ── Left: form fields ── */}
      <div className="mw-create-left">
        <form onSubmit={handleSubmit} className="mw-create-form">
          <label className="mw-field-label">Title</label>
          <input
            className="mw-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Sprint Planning — HMS"
            required
          />

          <label className="mw-field-label">When <span className="mw-optional">(optional)</span></label>
          <DigitalClock
            date={date}
            hours={hours}
            minutes={minutes}
            onDateChange={setDate}
            onHoursChange={setHours}
            onMinutesChange={setMinutes}
          />

          <label className="mw-field-label">Agenda <span className="mw-optional">(one item per line)</span></label>
          <textarea
            className="mw-input"
            rows={4}
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            placeholder={'1. Review last sprint\n2. Discuss new feature X\n3. Blockers'}
          />

          <label className="mw-field-label">Participants</label>
          <ParticipantsPicker
            selectedEmails={selectedParticipants.map((p) => p.email)}
            onToggle={toggleParticipant}
            currentUserEmail={userEmail}
          />

          {error && <p className="mw-field-error">{error}</p>}
          {notice && <p className="tenant-success">{notice}</p>}

          <div className="mw-btn-row" style={{ marginTop: '0.5rem' }}>
            {done ? (
              <button className="mw-btn mw-btn--primary" type="button" onClick={() => onCreated?.()}>
                Go to meetings
              </button>
            ) : (
              <>
                <button className="mw-btn mw-btn--primary" type="submit" disabled={busy}>
                  {busy ? 'Creating…' : 'Create Meeting'}
                </button>
                {onCancel && (
                  <button className="mw-btn mw-btn--ghost" type="button" onClick={onCancel}>
                    Cancel
                  </button>
                )}
              </>
            )}
          </div>
        </form>
      </div>

      {/* ── Right: scope picker ── */}
      <div className="mw-create-right">
        <p className="mw-scope-col-title" style={{ marginBottom: '0.75rem' }}>
          Scope
          <small className="mw-scope-hint"> — repos &amp; features for this meeting</small>
        </p>
        <ScopePicker
          actingUrdd={actingUrdd}
          selectedRepoIds={selectedRepoIds}
          onRepoToggle={toggleRepo}
          selectedFeatureIds={selectedFeatureIds}
          onFeatureToggle={toggleFeature}
        />
      </div>
    </div>
  );
}
