import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  createOrganization, joinOrganization, getMyOrganization,
  updateOrganization, addOrgMember, getOrgMembers,
  addRepoToOrg, getOrgRepos,
  githubAuthorize, githubOrgs, githubRepos,
} from './tenantApi';
import { fetchUserUrdds, setActiveUrdd } from '@site/src/state/orgSlice';

const GITHUB_MESSAGE_SOURCE = 'github-connect';

// ── Friendly error mapper ────────────────────────────────────────────────────
function friendlyError(msg) {
  if (!msg) return 'Something went wrong. Please try again.';
  if (isExpiredConnection(msg)) return 'Your GitHub connection expired. Please click Connect again.';
  if (msg.includes('already exists')) return 'An organization with this name already exists. Please choose a different name.';
  if (msg.includes('Invalid organization')) return 'The organization name or passcode is incorrect. Please check and try again.';
  if (msg.includes("hasn't signed in")) return "This user hasn't signed in yet. They need to sign in with Google first.";
  if (msg.includes('Only the organization')) return "You don't have permission to do this. Only the organization owner can perform this action.";
  return msg;
}

// A TTL-bound, single-use connection that the backend no longer accepts.
function isExpiredConnection(msg) {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes('expired') || m.includes('invalid connection') || m.includes('connection not found');
}

// Normalise owned into an array. `org/mine` now returns owned as an array of
// { id, organization_name, tenant_id }; tolerate the legacy single-object shape.
function ownedOrgsOf(orgInfo) {
  const owned = orgInfo?.owned;
  if (Array.isArray(owned)) return owned;
  if (owned && typeof owned === 'object') return [owned];
  return [];
}

// Build a human import summary from imported/skipped.
function importSummary(res) {
  const imported = Array.isArray(res?.imported) ? res.imported : [];
  const skipped = Array.isArray(res?.skipped) ? res.skipped : [];
  const parts = [];
  if (imported.length) parts.push(`${imported.length} imported`);
  const byReason = {};
  skipped.forEach((s) => {
    const reason = s?.reason || 'skipped';
    byReason[reason] = (byReason[reason] || 0) + 1;
  });
  Object.entries(byReason).forEach(([reason, n]) => parts.push(`${n} ${reason}`));
  if (!parts.length) return null;
  return parts.join(', ');
}

// ── Create-org wizard ────────────────────────────────────────────────────────
// The wizard lives in a single React component, so its state survives the OAuth
// popup round trip (the popup is a separate window; this component stays mounted
// and receives the connection_id via postMessage).

const STEPS = { DETAILS: 'details', CONNECT: 'connect', ORG: 'org', REPOS: 'repos' };

function CreateOrgWizard({ email, onDone }) {
  const dispatch = useDispatch();

  const [step, setStep] = useState(STEPS.DETAILS);
  const [orgName, setOrgName] = useState('');
  const [passcode, setPasscode] = useState('');

  const [connectionId, setConnectionId] = useState(null);
  const [connecting, setConnecting] = useState(false);

  const [orgs, setOrgs] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [githubOrg, setGithubOrg] = useState(null);

  const [repos, setRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const popupRef = useRef(null);

  // Listen for the connection_id posted back by the hosted callback page.
  useEffect(() => {
    const handler = (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== GITHUB_MESSAGE_SOURCE) return;
      setConnecting(false);
      if (data.error) {
        setError(friendlyError(data.error));
        return;
      }
      if (data.connection_id) {
        setError(null);
        setConnectionId(data.connection_id);
        setStep(STEPS.ORG);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const resetGithub = () => {
    setConnectionId(null);
    setOrgs([]);
    setGithubOrg(null);
    setRepos([]);
    setSelected(new Set());
  };

  // Step 1 → 2
  const handleDetailsNext = (e) => {
    e.preventDefault();
    setError(null);
    if (!orgName.trim()) { setError('Organization name is required.'); return; }
    if (passcode.trim().length < 4) { setError('Passcode must be at least 4 characters.'); return; }
    setStep(STEPS.CONNECT);
  };

  // Step 2 — open the GitHub authorize URL as a popup.
  const handleConnect = async () => {
    setError(null);
    resetGithub();
    try {
      setConnecting(true);
      const res = await githubAuthorize(email);
      const url = res?.url;
      if (!url) { setConnecting(false); setError('Could not start GitHub authorization.'); return; }
      const w = 720, h = 780;
      const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
      popupRef.current = window.open(
        url, 'github-connect',
        `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no`,
      );
      if (!popupRef.current) {
        setConnecting(false);
        setError('The popup was blocked. Please allow popups and try again.');
      }
    } catch (err) {
      setConnecting(false);
      setError(friendlyError(err.message));
    }
  };

  // Load orgs when entering the org step.
  useEffect(() => {
    if (step !== STEPS.ORG || !connectionId) return;
    let cancelled = false;
    (async () => {
      setError(null);
      setOrgsLoading(true);
      try {
        const res = await githubOrgs(connectionId, email);
        if (!cancelled) setOrgs(Array.isArray(res?.orgs) ? res.orgs : []);
      } catch (err) {
        if (!cancelled) setError(friendlyError(err.message));
      } finally {
        if (!cancelled) setOrgsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [step, connectionId, email]);

  const handlePickOrg = (login) => {
    setGithubOrg(login);
    setRepos([]);
    setSelected(new Set());
    setStep(STEPS.REPOS);
  };

  // Load repos when entering the repos step.
  useEffect(() => {
    if (step !== STEPS.REPOS || !connectionId || !githubOrg) return;
    let cancelled = false;
    (async () => {
      setError(null);
      setReposLoading(true);
      try {
        const res = await githubRepos(connectionId, email, githubOrg);
        if (!cancelled) setRepos(Array.isArray(res?.repos) ? res.repos : []);
      } catch (err) {
        if (!cancelled) setError(friendlyError(err.message));
      } finally {
        if (!cancelled) setReposLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [step, connectionId, githubOrg, email]);

  const toggleRepo = (fullName) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName); else next.add(fullName);
      return next;
    });
  };

  // Final submit — with or without GitHub.
  const submit = async (withGithub) => {
    setError(null);
    setSuccess(null);
    try {
      setSubmitting(true);
      const opts = withGithub
        ? { connection_id: connectionId, github_org: githubOrg, selected: Array.from(selected) }
        : undefined;
      const res = await createOrganization(email, orgName.trim(), passcode.trim(), opts);

      let msg = `Organization "${res.organization?.organization_name || orgName.trim()}" created.`;
      if (withGithub) {
        const summary = importSummary(res);
        if (summary) msg += ` ${summary}.`;
        if (res.import_error) msg += ` Repo import failed: ${res.import_error}`;
      }
      setSuccess(msg);

      // Refresh the org slice so the new org's URDD appears in OrgSwitcher, then
      // select it — no manual page reload needed.
      await dispatch(fetchUserUrdds(email)).unwrap();
      if (res.urdd_id) dispatch(setActiveUrdd(res.urdd_id));
      if (onDone) onDone();
    } catch (err) {
      const m = err?.message;
      setError(friendlyError(m));
      // A dead connection can only be recovered by reconnecting.
      if (withGithub && isExpiredConnection(m)) {
        resetGithub();
        setStep(STEPS.CONNECT);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tenant-wizard">
      <ol className="tenant-wizard-steps" aria-hidden="true">
        {[
          { k: STEPS.DETAILS, label: 'Details' },
          { k: STEPS.CONNECT, label: 'Connect GitHub' },
          { k: STEPS.ORG, label: 'Pick org' },
          { k: STEPS.REPOS, label: 'Pick repos' },
        ].map((s, i) => (
          <li key={s.k} className={`tenant-wizard-step${step === s.k ? ' is-active' : ''}`}>
            <span className="tenant-wizard-step-num">{i + 1}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>

      {/* Step 1 — details */}
      {step === STEPS.DETAILS && (
        <form className="tenant-form" onSubmit={handleDetailsNext}>
          <label className="tenant-field">
            <span>Organization name</span>
            <input type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)}
              placeholder="My Company" />
          </label>
          <label className="tenant-field">
            <span>Passcode</span>
            <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)}
              placeholder="Choose a passcode (min 4 chars)" />
          </label>
          <button type="submit" className="tenant-submit">Next</button>
          {error && <p className="tenant-error">{error}</p>}
        </form>
      )}

      {/* Step 2 — connect GitHub (optional) */}
      {step === STEPS.CONNECT && (
        <div className="tenant-form">
          <p className="tenant-muted">
            Connect a GitHub organization to import its repositories, or create the
            organization without GitHub — you can add repositories later.
          </p>
          <div className="tenant-wizard-nav">
            <button type="button" className="tenant-submit" disabled={connecting} onClick={handleConnect}>
              {connecting ? 'Waiting for GitHub…' : 'Connect GitHub'}
            </button>
            <button type="button" className="tenant-ghost-btn" disabled={submitting}
              onClick={() => submit(false)}>
              {submitting ? 'Creating…' : 'Create without GitHub'}
            </button>
            <button type="button" className="tenant-ghost-btn" onClick={() => { setError(null); setStep(STEPS.DETAILS); }}>
              Back
            </button>
          </div>
          {error && <p className="tenant-error">{error}</p>}
        </div>
      )}

      {/* Step 3 — pick org */}
      {step === STEPS.ORG && (
        <div className="tenant-form">
          {orgsLoading ? (
            <p className="tenant-muted">Loading your GitHub organizations…</p>
          ) : orgs.length === 0 ? (
            <p className="tenant-muted">No organizations found for this GitHub account.</p>
          ) : (
            <div className="tenant-members-list">
              {orgs.map((o) => (
                <button key={o.login} type="button" className="tenant-org-choice"
                  onClick={() => handlePickOrg(o.login)}>
                  {o.avatar_url
                    ? <img src={o.avatar_url} alt="" className="tenant-member-img" />
                    : <span className="tenant-member-initial">{o.login.charAt(0).toUpperCase()}</span>}
                  <span className="tenant-member-name">{o.login}</span>
                </button>
              ))}
            </div>
          )}
          <div className="tenant-wizard-nav">
            <button type="button" className="tenant-ghost-btn"
              onClick={() => { setError(null); setStep(STEPS.CONNECT); }}>
              Back
            </button>
          </div>
          {error && <p className="tenant-error">{error}</p>}
        </div>
      )}

      {/* Step 4 — pick repos */}
      {step === STEPS.REPOS && (
        <div className="tenant-form">
          <p className="tenant-muted">
            Select repositories to import from <strong>{githubOrg}</strong>.
          </p>
          {reposLoading ? (
            <p className="tenant-muted">Loading repositories…</p>
          ) : repos.length === 0 ? (
            <p className="tenant-muted">No repositories found in this organization.</p>
          ) : (
            <div className="tenant-checkbox-list">
              {repos.map((r) => (
                <label key={r.full_name} className="tenant-checkbox-row">
                  <input type="checkbox" checked={selected.has(r.full_name)}
                    onChange={() => toggleRepo(r.full_name)} />
                  <span>
                    <span className="tenant-member-name">{r.full_name}</span>
                    {r.private && <span className="tenant-repo-badge tenant-repo-badge-private">private</span>}
                    {r.archived && <span className="tenant-repo-badge tenant-repo-badge-archived">archived</span>}
                    {r.default_branch && <span className="tenant-repo-badge">{r.default_branch}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="tenant-wizard-nav">
            <button type="button" className="tenant-submit" disabled={submitting}
              onClick={() => submit(true)}>
              {submitting
                ? 'Creating…'
                : selected.size > 0
                  ? `Create & import ${selected.size} repo${selected.size === 1 ? '' : 's'}`
                  : 'Create organization'}
            </button>
            <button type="button" className="tenant-ghost-btn"
              onClick={() => { setError(null); setStep(STEPS.ORG); }}>
              Back
            </button>
          </div>
          {error && <p className="tenant-error">{error}</p>}
        </div>
      )}

      {success && <p className="tenant-success">{success}</p>}
    </div>
  );
}

// ── Sub-panels ───────────────────────────────────────────────────────────────

function CreateJoinPanel({ email, onDone }) {
  const dispatch = useDispatch();
  const [mode, setMode] = useState('create');
  const [orgName, setOrgName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleJoin = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!orgName.trim()) { setError('Organization name is required.'); return; }
    if (!passcode.trim() || passcode.trim().length < 4) { setError('Passcode must be at least 4 characters.'); return; }

    try {
      setSubmitting(true);
      const res = await joinOrganization(email, orgName.trim(), passcode.trim());
      setSuccess(`Joined "${res.organization?.organization_name}".`);
      setOrgName('');
      setPasscode('');
      await dispatch(fetchUserUrdds(email)).unwrap();
      if (res.urdd_id) dispatch(setActiveUrdd(res.urdd_id));
      if (onDone) onDone();
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="tenant-admin-tabs" style={{ marginBottom: '1rem' }}>
        <button type="button" className={`tenant-tab${mode === 'create' ? ' tenant-tab-active' : ''}`}
          onClick={() => { setMode('create'); setError(null); setSuccess(null); }}>
          Create
        </button>
        <button type="button" className={`tenant-tab${mode === 'join' ? ' tenant-tab-active' : ''}`}
          onClick={() => { setMode('join'); setError(null); setSuccess(null); }}>
          Join
        </button>
      </div>

      {mode === 'create' ? (
        <CreateOrgWizard email={email} onDone={onDone} />
      ) : (
        <form className="tenant-form" onSubmit={handleJoin}>
          <label className="tenant-field">
            <span>Organization name</span>
            <input type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)}
              placeholder="Existing org name" />
          </label>
          <label className="tenant-field">
            <span>Passcode</span>
            <input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter org passcode" />
          </label>
          <button type="submit" className="tenant-submit" disabled={submitting}>
            {submitting ? 'Joining...' : 'Join organization'}
          </button>
          {error && <p className="tenant-error">{error}</p>}
          {success && <p className="tenant-success">{success}</p>}
        </form>
      )}
    </div>
  );
}

function SettingsPanel({ email, org, onDone }) {
  const [name, setName] = useState(org?.organization_name || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const dispatch = useDispatch();

  useEffect(() => { setName(org?.organization_name || ''); }, [org?.id]);

  if (!org) return <p className="tenant-muted">You haven't created an organization yet.</p>;

  const handleRename = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!name.trim()) { setError('Name cannot be empty.'); return; }
    if (name.trim() === org.organization_name) { setError('Name is unchanged.'); return; }
    try {
      setSubmitting(true);
      await updateOrganization(email, org.id, name.trim());
      setSuccess('Organization renamed successfully.');
      dispatch(fetchUserUrdds(email));
      if (onDone) onDone();
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="tenant-form" onSubmit={handleRename}>
      <label className="tenant-field">
        <span>Organization name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button type="submit" className="tenant-submit" disabled={submitting}>
        {submitting ? 'Saving...' : 'Save'}
      </button>
      {error && <p className="tenant-error">{error}</p>}
      {success && <p className="tenant-success">{success}</p>}
    </form>
  );
}

function MembersPanel({ email, org }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const loadMembers = async () => {
    if (!org) return;
    try {
      setLoading(true);
      const res = await getOrgMembers(email, org.id);
      setMembers(Array.isArray(res?.members) ? res.members : []);
    } catch {
      // Silently fail — user may not have permissions
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMembers(); }, [org?.id]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!memberEmail.trim()) { setError('Enter the member\'s email address.'); return; }
    try {
      setAdding(true);
      const res = await addOrgMember(email, org.id, memberEmail.trim());
      if (res.already_member) {
        setSuccess(`${memberEmail.trim()} is already a member of this organization.`);
      } else {
        setSuccess(`${memberEmail.trim()} has been added to the organization.`);
      }
      setMemberEmail('');
      await loadMembers();
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setAdding(false);
    }
  };

  if (!org) return <p className="tenant-muted">You haven't created an organization. Only organization owners can manage members.</p>;

  return (
    <div>
      <form className="tenant-form" onSubmit={handleAdd} style={{ marginBottom: '1.5rem' }}>
        <label className="tenant-field">
          <span>Add member by email</span>
          <input type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)}
            placeholder="user@example.com" />
        </label>
        <button type="submit" className="tenant-submit" disabled={adding}>
          {adding ? 'Adding...' : 'Add member'}
        </button>
        {error && <p className="tenant-error">{error}</p>}
        {success && <p className="tenant-success">{success}</p>}
      </form>

      <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Current members</h4>
      {loading ? (
        <p className="tenant-muted">Loading members...</p>
      ) : members.length === 0 ? (
        <p className="tenant-muted">No members found.</p>
      ) : (
        <div className="tenant-members-list">
          {members.map((m) => (
            <div key={m.urdd_id} className="tenant-member-row">
              <div className="tenant-member-avatar">
                {m.photo_url
                  ? <img src={m.photo_url} alt="" className="tenant-member-img" />
                  : <span className="tenant-member-initial">{(m.name || m.email || '?').charAt(0).toUpperCase()}</span>}
              </div>
              <div className="tenant-member-info">
                <span className="tenant-member-name">{m.name || m.email}</span>
                <span className="tenant-member-email">{m.email}</span>
              </div>
              <span className={`tenant-member-badge tenant-member-badge-${m.org_role}`}>
                {m.org_role}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PermissionsPanel() {
  const { urdds } = useSelector((s) => s.org);

  if (!urdds.length) return <p className="tenant-muted">No roles assigned yet.</p>;

  return (
    <div className="tenant-permissions-list">
      {urdds.map((u) => (
        <div key={u.urdd_id} className="tenant-perm-card">
          <div className="tenant-perm-header">
            <strong>{u.display_name || u.org_name || u.tenant_name || 'Personal'}</strong>
            <span className="tenant-muted" style={{ fontSize: '0.75rem' }}>URDD #{u.urdd_id}</span>
          </div>
          {u.permissions && u.permissions.length > 0 ? (
            <div className="tenant-perm-tags">
              {u.permissions.map((p) => (
                <span key={p.permission_name} className="tenant-perm-tag">
                  {p.permission_name}
                  {p.included_id && <span className="tenant-perm-scope"> (scoped)</span>}
                </span>
              ))}
            </div>
          ) : (
            <p className="tenant-muted" style={{ margin: '0.3rem 0 0', fontSize: '0.78rem' }}>No permissions assigned</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ReposPanel({ email, org }) {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const loadRepos = async () => {
    if (!org) return;
    try {
      setLoading(true);
      const res = await getOrgRepos(email, org.id);
      setRepos(Array.isArray(res?.all) ? res.all : []);
    } catch {
      setError('Could not load repositories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRepos(); }, [org?.id]);

  const handleAdd = async (repoId) => {
    setError(null);
    setSuccess(null);
    try {
      setAdding(repoId);
      const res = await addRepoToOrg(email, org.id, repoId);
      setSuccess(`"${res.repo_name}" added to organization.`);
      await loadRepos();
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setAdding(null);
    }
  };

  if (!org) return <p className="tenant-muted">You haven't created an organization. Only organization owners can manage repositories.</p>;

  return (
    <div>
      {error && <p className="tenant-error">{error}</p>}
      {success && <p className="tenant-success">{success}</p>}

      {loading ? (
        <p className="tenant-muted">Loading repositories...</p>
      ) : repos.length === 0 ? (
        <p className="tenant-muted">No tracked repositories found.</p>
      ) : (
        <div className="tenant-members-list">
          {repos.map((r) => (
            <div key={r.id} className="tenant-member-row">
              <div className="tenant-member-info">
                <span className="tenant-member-name">{r.name}</span>
                <span className="tenant-member-email">{r.url}</span>
              </div>
              {r.in_org ? (
                <span className="tenant-member-badge tenant-member-badge-owner">in org</span>
              ) : (
                <button type="button" className="tenant-submit"
                  style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem', margin: 0 }}
                  disabled={adding === r.id}
                  onClick={() => handleAdd(r.id)}>
                  {adding === r.id ? 'Adding...' : 'Add'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

const TABS = [
  { key: 'org', label: 'Create / Join' },
  { key: 'settings', label: 'Settings' },
  { key: 'members', label: 'Members' },
  { key: 'repos', label: 'Repositories' },
  { key: 'permissions', label: 'My Permissions' },
];

export default function OrganizationManager({ email, onOrgChanged }) {
  const [orgInfo, setOrgInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('org');
  const [selectedOrgId, setSelectedOrgId] = useState(null);

  const loadOrg = async () => {
    if (!email) return;
    try {
      setLoading(true);
      const res = await getMyOrganization(email);
      setOrgInfo(res);
    } catch {
      // No org info yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOrg(); }, [email]);

  const ownedOrgs = ownedOrgsOf(orgInfo);

  // Keep a valid selected org for the owner-only panels.
  useEffect(() => {
    if (!ownedOrgs.length) { setSelectedOrgId(null); return; }
    if (!ownedOrgs.some((o) => o.id === selectedOrgId)) {
      setSelectedOrgId(ownedOrgs[0].id);
    }
  }, [orgInfo]);

  const selectedOrg = ownedOrgs.find((o) => o.id === selectedOrgId) || ownedOrgs[0] || null;
  const ownerPanel = tab === 'settings' || tab === 'members' || tab === 'repos';

  if (loading) return <p className="tenant-muted">Loading organization info...</p>;

  return (
    <div>
      {ownedOrgs.length > 0 && (
        <div className="tenant-info-box" style={{ marginBottom: '1rem' }}>
          <strong>Your organization{ownedOrgs.length > 1 ? 's' : ''}:</strong>{' '}
          {ownedOrgs.map((o) => o.organization_name).join(', ')}
        </div>
      )}

      <div className="tenant-admin-tabs" style={{ marginBottom: '1rem' }}>
        {TABS.map((t) => (
          <button key={t.key} type="button"
            className={`tenant-tab${tab === t.key ? ' tenant-tab-active' : ''}`}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Owner panels act on one org at a time — let the owner pick which. */}
      {ownerPanel && ownedOrgs.length > 1 && (
        <label className="tenant-field" style={{ maxWidth: 320, marginBottom: '1rem' }}>
          <span>Organization</span>
          <select value={selectedOrgId ?? ''} onChange={(e) => setSelectedOrgId(Number(e.target.value))}>
            {ownedOrgs.map((o) => (
              <option key={o.id} value={o.id}>{o.organization_name}</option>
            ))}
          </select>
        </label>
      )}

      <div className="portal-card">
        {tab === 'org' && <CreateJoinPanel email={email} onDone={() => { loadOrg(); if (onOrgChanged) onOrgChanged(); }} />}
        {tab === 'settings' && <SettingsPanel email={email} org={selectedOrg} onDone={loadOrg} />}
        {tab === 'members' && <MembersPanel email={email} org={selectedOrg} />}
        {tab === 'repos' && <ReposPanel email={email} org={selectedOrg} />}
        {tab === 'permissions' && <PermissionsPanel />}
      </div>
    </div>
  );
}
