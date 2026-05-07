import React, { useState, useEffect, useCallback } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useAuth } from '@site/src/components/portal/authStore';
import GoogleSignIn from '@site/src/components/portal/GoogleSignIn';
import { isGranjurEmail } from '@site/src/utils/isGranjurEmail';
import { API_BASE_URL } from '@site/src/components/portal/config';

const BASE = `${API_BASE_URL}/api/tracked/repos`;

async function apiGet(path) {
  const r = await fetch(`${BASE}${path}?version=1`);
  if (!r.ok) throw new Error(`Request failed: ${r.status}`);
  const json = await r.json();
  return json.payload?.return ?? json.payload ?? json;
}

async function apiPost(path, body) {
  const r = await fetch(`${BASE}${path}?version=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(text || r.statusText); }
  if (!r.ok) throw new Error(data?.error || text || r.statusText);
  return data.payload?.return ?? data.payload ?? data;
}

/* ─────────────────────────────────────────────
   Add Repo Form
───────────────────────────────────────────── */

function AddRepoForm({ onAdded }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiPost('/add', { name: name.trim(), url: url.trim(), branch: branch.trim() || 'main' });
      setName(''); setUrl(''); setBranch('main');
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="gh-issue-form" onSubmit={handleSubmit} style={{ maxWidth: 560 }}>
      <h3 className="gh-panel-title" style={{ marginBottom: '1rem' }}>Add Repository</h3>
      <div className="gh-form-field">
        <label className="gh-form-label">Local name <span className="gh-form-required">*</span></label>
        <input className="gh-form-input" placeholder="e.g. My_Repo"
          value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="gh-form-field">
        <label className="gh-form-label">Clone URL <span className="gh-form-required">*</span></label>
        <input className="gh-form-input" placeholder="https://github.com/owner/repo"
          value={url} onChange={(e) => setUrl(e.target.value)} required />
      </div>
      <div className="gh-form-field">
        <label className="gh-form-label">Branch</label>
        <input className="gh-form-input" placeholder="main"
          value={branch} onChange={(e) => setBranch(e.target.value)} />
      </div>
      {error && <p className="gh-form-error">{error}</p>}
      <div className="gh-form-actions">
        <button type="submit" className="gh-submit-btn" disabled={submitting || !name.trim() || !url.trim()}>
          {submitting ? <><span className="status-spinner" /> Adding…</> : 'Add repo'}
        </button>
      </div>
    </form>
  );
}

/* ─────────────────────────────────────────────
   Repo Row
───────────────────────────────────────────── */

function RepoRow({ repo, onRemoved }) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState(null);

  const handleRemove = async () => {
    if (!window.confirm(`Remove "${repo.name}" from tracked repos?`)) return;
    setRemoving(true);
    setError(null);
    try {
      await apiPost('/remove', { id: repo.id });
      onRemoved();
    } catch (err) {
      setError(err.message);
      setRemoving(false);
    }
  };

  const ghUrl = repo.url.replace(/\.git$/, '');

  return (
    <div className="gh-issue-row" style={{ alignItems: 'center' }}>
      <div className="gh-issue-row-header" style={{ cursor: 'default', display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
        <span className="gh-repo-card-icon" style={{ fontSize: '1.1rem' }}>📦</span>
        <div style={{ flex: 1 }}>
          <strong style={{ display: 'block' }}>{repo.name}</strong>
          <a href={ghUrl} target="_blank" rel="noopener noreferrer" className="gh-repo-handle">
            {ghUrl} ↗
          </a>
          <span style={{ marginLeft: '0.75rem', color: 'var(--ifm-color-emphasis-600)', fontSize: '0.8rem' }}>
            branch: {repo.branch}
          </span>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--ifm-color-emphasis-500)' }}>
          added {new Date(repo.created_at).toLocaleDateString()}
        </span>
        {error && <span className="gh-form-error" style={{ margin: 0 }}>{error}</span>}
        <button
          type="button"
          className="gh-submit-btn"
          style={{ background: 'var(--ifm-color-danger)', minWidth: 80 }}
          onClick={handleRemove}
          disabled={removing}
        >
          {removing ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Repos Manager
───────────────────────────────────────────── */

function ReposManager() {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet('/list');
      setRepos(data.repos || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePull = async () => {
    setPulling(true);
    setPullMsg(null);
    try {
      await apiPost('/pull', {});
      setPullMsg('Pull started — repos are being updated in the background.');
    } catch (err) {
      setPullMsg(`Pull failed: ${err.message}`);
    } finally {
      setPulling(false);
    }
  };

  return (
    <div>
      {/* Header actions */}
      <div className="gh-panel-header" style={{ marginBottom: '1.5rem' }}>
        <h3 className="gh-panel-title">Tracked Repositories ({repos.length})</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {pullMsg && <span style={{ fontSize: '0.85rem', color: 'var(--ifm-color-emphasis-700)' }}>{pullMsg}</span>}
          <button type="button" className="gh-refresh-btn" onClick={load} title="Refresh list">↻</button>
          <button
            type="button"
            className="gh-submit-btn"
            style={{ fontSize: '0.85rem', padding: '0.35rem 0.9rem' }}
            onClick={handlePull}
            disabled={pulling}
          >
            {pulling ? <><span className="status-spinner" /> Pulling…</> : '⬇ Pull all repos'}
          </button>
        </div>
      </div>

      {/* Repo list */}
      {loading && <div className="gh-status-loading">Loading…</div>}
      {error && <div className="gh-explorer-error">{error}</div>}
      {!loading && !error && repos.length === 0 && (
        <div className="gh-status-empty">No tracked repositories yet.</div>
      )}
      <div className="gh-issues-list" style={{ marginBottom: '2rem' }}>
        {repos.map((r) => (
          <RepoRow key={r.id} repo={r} onRemoved={load} />
        ))}
      </div>

      {/* Add form */}
      <hr style={{ margin: '2rem 0', opacity: 0.2 }} />
      <AddRepoForm onAdded={load} />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Page
───────────────────────────────────────────── */

function ReposContent() {
  const { user, signOut } = useAuth();
  const canAccess = !!user && isGranjurEmail(user?.email);

  if (!user) {
    return (
      <section className="portal-hero portal-hero-center">
        <div className="portal-auth-card portal-auth-centered">
          <h2 className="card-title">Sign in</h2>
          <p className="card-subtitle">Use your Google account to access Granjur Dev tools.</p>
          <GoogleSignIn />
          <p className="card-helper">Use your organization&apos;s @granjur.com account for full access.</p>
        </div>
      </section>
    );
  }

  if (!canAccess) {
    return (
      <section className="portal-hero portal-hero-center">
        <div className="portal-auth-card portal-auth-centered">
          <h2 className="card-title">Access restricted</h2>
          <p className="card-subtitle">This portal is limited to @granjur.com accounts.</p>
          <p className="card-helper">
            Signed in as <strong>{user.email}</strong>.{' '}
            <button type="button" className="portal-signout-link" onClick={signOut}>Sign out</button>
          </p>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="portal-breadcrumb">
        <Link to="/tools">← Back to Dev Tools</Link>
      </div>
      <section className="portal-hero">
        <div className="portal-hero-text">
          <h2>Tracked Repositories</h2>
          <p>
            Manage which GitHub repositories are cloned locally and monitored for agent issues.
            Signed in as <strong>{user.name || user.email}</strong>.{' '}
            <button type="button" className="portal-signout-link" onClick={signOut}>Sign out</button>
          </p>
        </div>
      </section>
      <section className="portal-section">
        <ReposManager />
      </section>
    </>
  );
}

export default function ReposPage() {
  return (
    <Layout title="Tracked Repositories" description="Manage repos cloned and monitored by CSAAS">
      <main className="portal-main-wrapper">
        <ReposContent />
      </main>
    </Layout>
  );
}
