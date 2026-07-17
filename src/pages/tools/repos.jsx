import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@site/src/components/portal/authStore";
import GoogleSignIn from "@site/src/components/portal/GoogleSignIn";
import { isGranjurEmail } from "@site/src/utils/isGranjurEmail";
import { API_BASE_URL } from "@site/src/components/portal/config";
import { useActingUrdd } from "@site/src/components/portal/tenantProjects/useActingUrdd";

const BASE = `${API_BASE_URL}/api/tracked/repos`;

async function apiGet(path, params = {}) {
  const qs = new URLSearchParams({ version: "1", ...params }).toString();
  const r = await fetch(`${BASE}${path}?${qs}`);
  if (!r.ok) throw new Error(`Request failed: ${r.status}`);
  const json = await r.json();
  return json.payload?.return ?? json.payload ?? json;
}

async function apiPost(path, body) {
  const r = await fetch(`${BASE}${path}?version=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(text || r.statusText);
  }
  if (!r.ok) throw new Error(data?.error || text || r.statusText);
  return data.payload?.return ?? data.payload ?? data;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function parseJson(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    return JSON.parse(val);
  } catch {
    return [];
  }
}

const STATUS_LABELS = {
  "in-progress": "In Progress",
  functional: "Functional",
  down: "Down",
};
const STATUS_COLORS = {
  "in-progress": "var(--ifm-color-warning)",
  functional: "var(--ifm-color-success)",
  down: "var(--ifm-color-danger)",
};

function StatusBadge({ status }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.15rem 0.55rem",
        borderRadius: 4,
        fontSize: "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.03em",
        background: (STATUS_COLORS[status] ?? "#888") + "22",
        color: STATUS_COLORS[status] ?? "#888",
        border: `1px solid ${STATUS_COLORS[status] ?? "#888"}55`,
      }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function TagList({ items, color = "var(--ifm-color-primary)" }) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0)
    return (
      <span
        style={{ color: "var(--ifm-color-emphasis-400)", fontSize: "0.8rem" }}
      >
        —
      </span>
    );
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "0.3rem" }}>
      {list.map((t) => (
        <span
          key={t}
          style={{
            padding: "0.1rem 0.45rem",
            borderRadius: 3,
            fontSize: "0.75rem",
            background: color + "18",
            color,
            border: `1px solid ${color}44`,
          }}
        >
          {t}
        </span>
      ))}
    </span>
  );
}

// ─── Tag input ───────────────────────────────────────────────────────────────

function TagInput({ value, onChange, placeholder }) {
  const [input, setInput] = useState("");
  const tags = Array.isArray(value) ? value : [];
  const add = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput("");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <input
          className="gh-form-input"
          style={{ flex: 1 }}
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          className="gh-submit-btn"
          style={{ padding: "0.3rem 0.7rem", fontSize: "0.85rem" }}
          onClick={add}
        >
          +
        </button>
      </div>
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
          {tags.map((t) => (
            <span
              key={t}
              onClick={() => onChange(tags.filter((x) => x !== t))}
              title="Click to remove"
              style={{
                padding: "0.15rem 0.5rem",
                borderRadius: 3,
                fontSize: "0.75rem",
                cursor: "pointer",
                background: "var(--ifm-color-primary-lightest,#e8f4fd)",
                color: "var(--ifm-color-primary)",
                border: "1px solid var(--ifm-color-primary-light)",
              }}
            >
              {t} &times;
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Feature Form ────────────────────────────────────────────────────────────

const EMPTY_FEATURE = {
  feature_name: "",
  platforms: [],
  framework_features: [],
  status: "in-progress",
  file_paths: [],
  notes: "",
};

function FeatureForm({ repoId, initial, onSaved, onCancel }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(
    isEdit
      ? {
          feature_name: initial.feature_name || "",
          platforms: parseJson(initial.platforms),
          framework_features: parseJson(initial.framework_features),
          status: initial.status || "in-progress",
          file_paths: parseJson(initial.file_paths),
          notes: initial.notes || "",
        }
      : { ...EMPTY_FEATURE },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.feature_name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (isEdit)
        await apiPost("/features/update", { id: initial.id, ...form });
      else await apiPost("/features/add", { repo_id: repoId, ...form });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "var(--ifm-background-surface-color)",
        border: "1px solid var(--ifm-color-emphasis-300)",
        borderRadius: 6,
        padding: "1rem",
        marginTop: "0.75rem",
      }}
    >
      <h4 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem" }}>
        {isEdit ? "Edit Feature" : "Add Feature"}
      </h4>
      <div className="gh-form-field">
        <label className="gh-form-label">
          Feature name <span className="gh-form-required">*</span>
        </label>
        <input
          className="gh-form-input"
          placeholder="e.g. User Authentication"
          value={form.feature_name}
          onChange={(e) => set("feature_name", e.target.value)}
          required
        />
      </div>
      <div className="gh-form-field">
        <label className="gh-form-label">Platforms</label>
        <TagInput
          value={form.platforms}
          onChange={(v) => set("platforms", v)}
          placeholder="e.g. Node, React — press Enter"
        />
      </div>
      <div className="gh-form-field">
        <label className="gh-form-label">Framework features shipped</label>
        <TagInput
          value={form.framework_features}
          onChange={(v) => set("framework_features", v)}
          placeholder="e.g. Auth, RBAC — press Enter"
        />
      </div>
      <div className="gh-form-field">
        <label className="gh-form-label">Status</label>
        <select
          className="gh-form-input"
          value={form.status}
          onChange={(e) => set("status", e.target.value)}
        >
          <option value="in-progress">In Progress</option>
          <option value="functional">Functional</option>
          <option value="down">Down</option>
        </select>
      </div>
      <div className="gh-form-field">
        <label className="gh-form-label">File paths</label>
        <TagInput
          value={form.file_paths}
          onChange={(v) => set("file_paths", v)}
          placeholder="e.g. src/auth/login.js — press Enter"
        />
      </div>
      <div className="gh-form-field">
        <label className="gh-form-label">Notes</label>
        <textarea
          className="gh-form-input"
          rows={2}
          placeholder="Optional notes..."
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          style={{ resize: "vertical" }}
        />
      </div>
      {error && <p className="gh-form-error">{error}</p>}
      <div className="gh-form-actions" style={{ gap: "0.5rem" }}>
        <button
          type="submit"
          className="gh-submit-btn"
          disabled={saving || !form.feature_name.trim()}
        >
          {saving ? (
            <>
              <span className="status-spinner" /> Saving…
            </>
          ) : isEdit ? (
            "Save changes"
          ) : (
            "Add feature"
          )}
        </button>
        <button
          type="button"
          className="gh-submit-btn"
          style={{ background: "var(--ifm-color-emphasis-400)" }}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Sliding tab bar (reusable) ───────────────────────────────────────────────

function SlidingTabs({ tabs, active, onChange, size = "md" }) {
  const refs = useRef({});
  const [ind, setInd] = useState(null);

  useEffect(() => {
    const el = refs.current[active];
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [active]);

  return (
    <div className={`slide-tabs slide-tabs--${size}`}>
      {ind && (
        <div
          className="slide-tab-indicator"
          style={{ left: ind.left, width: ind.width }}
        />
      )}
      {tabs.map((t) => (
        <button
          key={t.id ?? t}
          ref={(el) => {
            refs.current[t.id ?? t] = el;
          }}
          type="button"
          className={`slide-tab${active === (t.id ?? t) ? " is-active" : ""}`}
          onClick={() => onChange(t.id ?? t)}
        >
          {t.label ?? t}
        </button>
      ))}
    </div>
  );
}

// ─── Feature Row ─────────────────────────────────────────────────────────────

const FEATURE_TABS = [
  { id: "details", label: "Details" },
  { id: "platforms", label: "Platforms" },
  { id: "projects", label: "Projects" },
];

function FeatureRow({ feature, repoUrl, repoBranch, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  const handleRemove = async () => {
    if (!window.confirm(`Remove feature "${feature.feature_name}"?`)) return;
    setRemoving(true);
    try {
      await apiPost("/features/remove", { id: feature.id });
      onChanged();
    } catch (err) {
      alert(err.message);
      setRemoving(false);
    }
  };

  if (editing) {
    return (
      <FeatureForm
        initial={feature}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const filePaths = parseJson(feature.file_paths);
  const platforms = parseJson(feature.platforms);
  const fwFeatures = parseJson(feature.framework_features);
  const ghBase = repoUrl ? repoUrl.replace(/\.git$/, "") : null;

  return (
    <div className="feat-row">
      {/* ── Header ── */}
      <button
        type="button"
        className="feat-row-header"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`gh-chevron${expanded ? " open" : ""}`}>▸</span>
        <strong className="feat-row-name">{feature.feature_name}</strong>
        <StatusBadge status={feature.status} />
        <div className="feat-row-actions">
          <button
            type="button"
            className="gh-submit-btn feat-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="gh-submit-btn feat-action-btn feat-action-btn--danger"
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            disabled={removing}
          >
            {removing ? "…" : "Remove"}
          </button>
        </div>
      </button>

      {/* ── Expandable body (CSS grid trick — no layout shift) ── */}
      <div className={`feat-row-body${expanded ? " is-open" : ""}`}>
        <div className="feat-row-body-inner">
          <SlidingTabs
            tabs={FEATURE_TABS}
            active={activeTab}
            onChange={setActiveTab}
            size="sm"
          />

          <div className="feat-tab-content">
            {activeTab === "details" && (
              <div className="feat-detail-grid">
                <div>
                  <span className="feat-label">Framework features:</span>
                  {fwFeatures.length > 0 ? (
                    <TagList
                      items={fwFeatures}
                      color="var(--ifm-color-secondary,#7c4dff)"
                    />
                  ) : (
                    <span className="feat-empty">—</span>
                  )}
                </div>
                {feature.notes && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span className="feat-label">Notes:</span>
                    <span style={{ fontStyle: "italic" }}>{feature.notes}</span>
                  </div>
                )}
                {filePaths.length > 0 && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span className="feat-label">Code locations:</span>
                    <div className="feat-paths">
                      {filePaths.map((p) => (
                        <a
                          key={p}
                          href={
                            ghBase
                              ? `${ghBase}/blob/${repoBranch || "main"}/${p}`
                              : "#"
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="feat-path-link"
                          title={`Open on GitHub: ${p}`}
                        >
                          📄 {p} ↗
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {filePaths.length === 0 &&
                  fwFeatures.length === 0 &&
                  !feature.notes && (
                    <span className="feat-empty">No details recorded yet.</span>
                  )}
              </div>
            )}

            {activeTab === "platforms" && (
              <div className="feat-detail-grid">
                <div>
                  <span className="feat-label">Platforms:</span>
                  {platforms.length > 0 ? (
                    <TagList items={platforms} color="var(--ifm-color-info)" />
                  ) : (
                    <span className="feat-empty">None listed.</span>
                  )}
                </div>
              </div>
            )}

            {activeTab === "projects" && (
              <div className="feat-detail-grid">
                <div>
                  <span className="feat-label">Repository:</span>
                  {ghBase ? (
                    <a
                      href={ghBase}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="feat-path-link"
                    >
                      {ghBase} ↗
                    </a>
                  ) : (
                    <span className="feat-empty">No URL available.</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Features Panel ───────────────────────────────────────────────────────────

function FeaturesPanel({ repo, active }) {
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet("/features/list", { repo_id: repo.id });
      setFeatures(data.features || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [repo.id]);

  // Only load when first expanded — avoids API calls for every collapsed row
  useEffect(() => {
    if (active && !loadedOnce.current) {
      loadedOnce.current = true;
      load();
    }
  }, [active, load]);

  return (
    <div className="feat-panel">
      <div className="feat-panel-header">
        <span className="feat-panel-title">Features ({features.length})</span>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button
            type="button"
            className="gh-refresh-btn"
            style={{ fontSize: "0.85rem" }}
            onClick={load}
            title="Refresh"
          >
            ↻
          </button>
          <button
            type="button"
            className="gh-submit-btn"
            style={{ padding: "0.2rem 0.7rem", fontSize: "0.8rem" }}
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? "Cancel" : "+ Add feature"}
          </button>
        </div>
      </div>

      {adding && (
        <FeatureForm
          repoId={repo.id}
          onSaved={() => {
            setAdding(false);
            load();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {loading && (
        <div className="gh-status-loading" style={{ fontSize: "0.85rem" }}>
          Loading features…
        </div>
      )}
      {error && (
        <div className="gh-explorer-error" style={{ fontSize: "0.85rem" }}>
          {error}
        </div>
      )}
      {!loading && !error && features.length === 0 && !adding && (
        <div
          style={{
            color: "var(--ifm-color-emphasis-500)",
            fontSize: "0.85rem",
            fontStyle: "italic",
          }}
        >
          No features tracked yet.
        </div>
      )}

      {features.map((f) => (
        <FeatureRow
          key={f.id}
          feature={f}
          repoUrl={repo.url}
          repoBranch={repo.branch}
          onChanged={load}
        />
      ))}
    </div>
  );
}

// ─── Framework Flags ──────────────────────────────────────────────────────────

function FrameworkFlags({ repo, onChange }) {
  const [saving, setSaving] = useState(false);
  const [node, setNode] = useState(!!repo.uses_framework_node);
  const [react, setReact] = useState(!!repo.uses_framework_react);

  const save = async (newNode, newReact) => {
    setSaving(true);
    try {
      await apiPost("/flags/update", {
        id: repo.id,
        uses_framework_node: newNode,
        uses_framework_react: newReact,
      });
      onChange();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (flag) => {
    if (flag === "node") {
      const v = !node;
      setNode(v);
      save(v, react);
    } else {
      const v = !react;
      setReact(v);
      save(node, v);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "0.5rem",
        flexWrap: "wrap",
        marginTop: "0.3rem",
      }}
    >
      {[
        ["node", node, "Framework Node"],
        ["react", react, "Framework React"],
      ].map(([flag, active, label]) => (
        <button
          key={flag}
          type="button"
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation();
            toggle(flag);
          }}
          style={{
            fontSize: "0.72rem",
            padding: "0.15rem 0.55rem",
            borderRadius: 4,
            fontWeight: 600,
            cursor: "pointer",
            border: "1px solid",
            borderColor: active
              ? "var(--ifm-color-primary)"
              : "var(--ifm-color-emphasis-300)",
            background: active ? "var(--ifm-color-primary)" : "transparent",
            color: active ? "#fff" : "var(--ifm-color-emphasis-600)",
          }}
        >
          {active ? "✓ " : ""}
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Repo Row ─────────────────────────────────────────────────────────────────

function RepoRow({ repo, onRemoved, onFlagsChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState(null);

  const handleRemove = async () => {
    if (!window.confirm(`Remove "${repo.name}" from tracked repos?`)) return;
    setRemoving(true);
    setError(null);
    try {
      await apiPost("/remove", { id: repo.id });
      onRemoved();
    } catch (err) {
      setError(err.message);
      setRemoving(false);
    }
  };

  const ghUrl = repo.url.replace(/\.git$/, "");

  return (
    <div className="repo-row">
      {/* ── Repo header ── */}
      <button
        type="button"
        className="repo-row-header"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`gh-chevron${expanded ? " open" : ""}`}>▸</span>
        <span style={{ fontSize: "1.1rem" }}>📦</span>
        <div className="repo-row-meta">
          <strong className="repo-row-name">{repo.name}</strong>
          <div className="repo-row-sub">
            <a
              href={ghUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="gh-repo-handle"
              onClick={(e) => e.stopPropagation()}
            >
              {ghUrl} ↗
            </a>
            <span
              style={{
                color: "var(--ifm-color-emphasis-600)",
                fontSize: "0.8rem",
              }}
            >
              branch: {repo.branch}
            </span>
          </div>
          <FrameworkFlags repo={repo} onChange={onFlagsChanged} />
        </div>
        <div className="repo-row-right">
          <span className="repo-row-date">
            added {new Date(repo.created_at).toLocaleDateString()}
          </span>
          {error && (
            <span className="gh-form-error" style={{ margin: 0 }}>
              {error}
            </span>
          )}
          <button
            type="button"
            className="gh-submit-btn feat-action-btn feat-action-btn--danger"
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            disabled={removing}
          >
            {removing ? "Removing…" : "Remove"}
          </button>
        </div>
      </button>

      {/* ── Expandable features panel (grid trick) ── */}
      <div className={`repo-expand-body${expanded ? " is-open" : ""}`}>
        <div className="repo-expand-inner">
          <FeaturesPanel repo={repo} active={expanded} />
        </div>
      </div>
    </div>
  );
}

// ─── Add Repo Form ────────────────────────────────────────────────────────────

function AddRepoForm({ onAdded }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // Reuse the shared identity hook. When resolved, stamp the new repo to the
  // creator's tenant; when pending (urdd null) omit it → legacy global add (§5).
  const { urdd: actingUrdd } = useActingUrdd();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        url: url.trim(),
        branch: branch.trim() || "main",
      };
      if (actingUrdd != null) body.actionPerformerURDD = actingUrdd;
      await apiPost("/add", body);
      setName("");
      setUrl("");
      setBranch("main");
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className="gh-issue-form"
      onSubmit={handleSubmit}
      style={{ maxWidth: 560 }}
    >
      <h3 className="gh-panel-title" style={{ marginBottom: "1rem" }}>
        Add Repository
      </h3>
      <div className="gh-form-field">
        <label className="gh-form-label">
          Local name <span className="gh-form-required">*</span>
        </label>
        <input
          className="gh-form-input"
          placeholder="e.g. My_Repo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="gh-form-field">
        <label className="gh-form-label">
          Clone URL <span className="gh-form-required">*</span>
        </label>
        <input
          className="gh-form-input"
          placeholder="https://github.com/owner/repo"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
      </div>
      <div className="gh-form-field">
        <label className="gh-form-label">Branch</label>
        <input
          className="gh-form-input"
          placeholder="main"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
        />
      </div>
      {error && <p className="gh-form-error">{error}</p>}
      <div className="gh-form-actions">
        <button
          type="submit"
          className="gh-submit-btn"
          disabled={submitting || !name.trim() || !url.trim()}
        >
          {submitting ? (
            <>
              <span className="status-spinner" /> Adding…
            </>
          ) : (
            "Add repo"
          )}
        </button>
      </div>
    </form>
  );
}

// ─── Repositories Tab ─────────────────────────────────────────────────────────

function ReposTab() {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet("/list");
      setRepos(data.repos || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handlePull = async () => {
    setPulling(true);
    setPullMsg(null);
    try {
      await apiPost("/pull", {});
      setPullMsg("Pull started — repos are being updated in the background.");
    } catch (err) {
      setPullMsg(`Pull failed: ${err.message}`);
    } finally {
      setPulling(false);
    }
  };

  return (
    <div>
      <div className="gh-panel-header" style={{ marginBottom: "1.5rem" }}>
        <h3 className="gh-panel-title">
          Tracked Repositories ({repos.length})
        </h3>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {pullMsg && (
            <span
              style={{
                fontSize: "0.85rem",
                color: "var(--ifm-color-emphasis-700)",
              }}
            >
              {pullMsg}
            </span>
          )}
          <button
            type="button"
            className="gh-refresh-btn"
            onClick={load}
            title="Refresh list"
          >
            ↻
          </button>
          <button
            type="button"
            className="gh-submit-btn"
            style={{ fontSize: "0.85rem", padding: "0.35rem 0.9rem" }}
            onClick={handlePull}
            disabled={pulling}
          >
            {pulling ? (
              <>
                <span className="status-spinner" /> Pulling…
              </>
            ) : (
              "⬇ Pull all repos"
            )}
          </button>
        </div>
      </div>
      {loading && <div className="gh-status-loading">Loading…</div>}
      {error && <div className="gh-explorer-error">{error}</div>}
      {!loading && !error && repos.length === 0 && (
        <div className="gh-status-empty">No tracked repositories yet.</div>
      )}
      <div className="gh-issues-list" style={{ marginBottom: "2rem" }}>
        {repos.map((r) => (
          <RepoRow key={r.id} repo={r} onRemoved={load} onFlagsChanged={load} />
        ))}
      </div>
      <hr style={{ margin: "2rem 0", opacity: 0.2 }} />
      <AddRepoForm onAdded={load} />
    </div>
  );
}

// ─── Feature Summary (cross-repo) ────────────────────────────────────────────

function FeatureRepoChip({ entry }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.75rem",
        padding: "0.6rem 0.75rem",
        borderRadius: 5,
        background: "var(--ifm-background-color)",
        border: "1px solid var(--ifm-color-emphasis-200)",
        marginBottom: "0.4rem",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
            marginBottom: "0.25rem",
          }}
        >
          <strong style={{ fontSize: "0.85rem" }}>{entry.repo_name}</strong>
          <StatusBadge status={entry.status} />
          {entry.uses_framework_node === 1 && (
            <span
              style={{
                fontSize: "0.68rem",
                padding: "0.1rem 0.4rem",
                borderRadius: 3,
                background: "#1a73e822",
                color: "#1a73e8",
                border: "1px solid #1a73e844",
              }}
            >
              FW Node
            </span>
          )}
          {entry.uses_framework_react === 1 && (
            <span
              style={{
                fontSize: "0.68rem",
                padding: "0.1rem 0.4rem",
                borderRadius: 3,
                background: "#61dafb22",
                color: "#0092a8",
                border: "1px solid #61dafb66",
              }}
            >
              FW React
            </span>
          )}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.25rem 1rem",
            fontSize: "0.78rem",
          }}
        >
          {parseJson(entry.platforms).length > 0 && (
            <div>
              <span
                style={{
                  color: "var(--ifm-color-emphasis-500)",
                  marginRight: "0.3rem",
                }}
              >
                Platforms:
              </span>
              <TagList
                items={parseJson(entry.platforms)}
                color="var(--ifm-color-info)"
              />
            </div>
          )}
          {parseJson(entry.file_paths).length > 0 && (
            <div style={{ gridColumn: "1 / -1" }}>
              <span
                style={{
                  color: "var(--ifm-color-emphasis-500)",
                  marginRight: "0.3rem",
                }}
              >
                Paths:
              </span>
              <TagList
                items={parseJson(entry.file_paths)}
                color="var(--ifm-color-emphasis-700)"
              />
            </div>
          )}
          {entry.notes && (
            <div
              style={{
                gridColumn: "1 / -1",
                color: "var(--ifm-color-emphasis-500)",
                fontStyle: "italic",
              }}
            >
              {entry.notes}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FeatureSummaryRow({ item }) {
  const [expanded, setExpanded] = useState(false);
  const count = item.repos.length;
  const allStatuses = item.repos.map((r) => r.status);
  const overallStatus = allStatuses.includes("down")
    ? "down"
    : allStatuses.includes("in-progress")
      ? "in-progress"
      : "functional";
  const allPlatforms = [
    ...new Set(item.repos.flatMap((r) => parseJson(r.platforms))),
  ];
  const allFwFeatures = [
    ...new Set(item.repos.flatMap((r) => parseJson(r.framework_features))),
  ];

  return (
    <div className="repo-row">
      <button
        type="button"
        className="repo-row-header"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`gh-chevron${expanded ? " open" : ""}`}>▸</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              flexWrap: "wrap",
              marginBottom: "0.25rem",
            }}
          >
            <strong style={{ fontSize: "0.9rem" }}>{item.feature_name}</strong>
            <StatusBadge status={overallStatus} />
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--ifm-color-emphasis-500)",
              }}
            >
              {count} {count === 1 ? "repo" : "repos"}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.4rem 1.2rem",
              fontSize: "0.8rem",
            }}
          >
            {allPlatforms.length > 0 && (
              <div>
                <span
                  style={{
                    color: "var(--ifm-color-emphasis-500)",
                    marginRight: "0.3rem",
                  }}
                >
                  Platforms:
                </span>
                <TagList items={allPlatforms} color="var(--ifm-color-info)" />
              </div>
            )}
            {allFwFeatures.length > 0 && (
              <div>
                <span
                  style={{
                    color: "var(--ifm-color-emphasis-500)",
                    marginRight: "0.3rem",
                  }}
                >
                  FW features:
                </span>
                <TagList
                  items={allFwFeatures}
                  color="var(--ifm-color-secondary,#7c4dff)"
                />
              </div>
            )}
          </div>
        </div>
      </button>

      <div className={`repo-expand-body${expanded ? " is-open" : ""}`}>
        <div className="repo-expand-inner repo-expand-inner--inset">
          <p className="feat-expand-count">
            Implemented in {count} {count === 1 ? "repository" : "repositories"}
            :
          </p>
          {item.repos.map((entry) => (
            <FeatureRepoChip key={entry.feature_id} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FeaturesTab() {
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet("/features/summary");
      setFeatures(data.features || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = search.trim()
    ? features.filter((f) =>
        f.feature_name.toLowerCase().includes(search.toLowerCase()),
      )
    : features;

  const totalImplementations = features.reduce((s, f) => s + f.repos.length, 0);
  const implementedInAll = features.filter((f) => f.repos.length > 1).length;

  return (
    <div>
      <div className="gh-panel-header" style={{ marginBottom: "1rem" }}>
        <div>
          <h3 className="gh-panel-title" style={{ marginBottom: "0.25rem" }}>
            Feature Registry ({features.length} features)
          </h3>
          <span
            style={{
              fontSize: "0.82rem",
              color: "var(--ifm-color-emphasis-600)",
            }}
          >
            {totalImplementations} total implementations · {implementedInAll}{" "}
            features shared across multiple repos
          </span>
        </div>
        <button
          type="button"
          className="gh-refresh-btn"
          onClick={load}
          title="Refresh"
        >
          ↻
        </button>
      </div>
      <div style={{ marginBottom: "1rem" }}>
        <input
          className="gh-form-input"
          placeholder="Search features…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 340 }}
        />
      </div>
      {loading && <div className="gh-status-loading">Loading features…</div>}
      {error && <div className="gh-explorer-error">{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="gh-status-empty">
          {search
            ? "No features match your search."
            : "No features tracked yet. Add features via the Repositories tab."}
        </div>
      )}
      <div className="gh-issues-list">
        {filtered.map((item) => (
          <FeatureSummaryRow key={item.feature_name} item={item} />
        ))}
      </div>
    </div>
  );
}

// ─── Top-level tab manager ────────────────────────────────────────────────────

const TABS = [
  { id: "repos", label: "Repositories" },
  { id: "features", label: "Features" },
];

function ReposManager() {
  const [tab, setTab] = useState("repos");

  return (
    <div>
      <SlidingTabs tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ marginTop: "1.5rem" }}>
        {tab === "repos" && <ReposTab />}
        {tab === "features" && <FeaturesTab />}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ReposContent() {
  const { user, signOut, loading } = useAuth();
  const canAccess = !!user && isGranjurEmail(user?.email);

  if (loading) {
    return (
      <section className="portal-hero portal-hero-center">
        <p>Loading...</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="portal-hero portal-hero-center">
        <div className="portal-auth-card portal-auth-centered">
          <h2 className="card-title">Sign in</h2>
          <p className="card-subtitle">
            Use your Google account to access Granjur Dev tools.
          </p>
          <GoogleSignIn />
          <p className="card-helper">
            Use your organization&apos;s @granjur.com account for full access.
          </p>
        </div>
      </section>
    );
  }

  if (!canAccess) {
    return (
      <section className="portal-hero portal-hero-center">
        <div className="portal-auth-card portal-auth-centered">
          <h2 className="card-title">Access restricted</h2>
          <p className="card-subtitle">
            This portal is limited to @granjur.com accounts.
          </p>
          <p className="card-helper">
            Signed in as <strong>{user.email}</strong>.{" "}
            <button
              type="button"
              className="portal-signout-link"
              onClick={signOut}
            >
              Sign out
            </button>
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
            Manage repositories, track their features, and see which Framework
            modules are in use. Signed in as{" "}
            <strong>{user.name || user.email}</strong>.{" "}
            <button
              type="button"
              className="portal-signout-link"
              onClick={signOut}
            >
              Sign out
            </button>
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
    <>
      <main className="portal-main-wrapper">
        <ReposContent />
      </main>
    </>
  );
}
