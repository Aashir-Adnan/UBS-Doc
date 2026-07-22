import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  createOrganization,
  joinOrganization,
  getMyOrganization,
  updateOrganization,
  addOrgMember,
  getOrgMembers,
  addRepoToOrg,
  getOrgRepos,
} from "./tenantApi";
import { fetchUserUrdds, setActiveUrdd } from "../../../state/orgSlice";

// ── Friendly error mapper ────────────────────────────────────────────────────
function friendlyError(msg) {
  if (!msg) return "Something went wrong. Please try again.";
  if (msg.includes("already created"))
    return "You can only create one organization. Try joining an existing one instead.";
  if (msg.includes("already exists"))
    return "An organization with this name already exists. Please choose a different name.";
  if (msg.includes("Invalid organization"))
    return "The organization name or passcode is incorrect. Please check and try again.";
  if (msg.includes("hasn't signed in"))
    return "This user hasn't signed in yet. They need to sign in with Google first.";
  if (msg.includes("Only the organization"))
    return "You don't have permission to do this. Only the organization owner can perform this action.";
  return msg;
}

// ── Sub-panels ───────────────────────────────────────────────────────────────

function CreateJoinPanel({ email, orgInfo, onDone }) {
  const dispatch = useDispatch();
  const [mode, setMode] = useState(orgInfo?.owned ? "join" : "create");
  const [orgName, setOrgName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!orgName.trim()) {
      setError("Organization name is required.");
      return;
    }
    if (!passcode.trim() || passcode.trim().length < 4) {
      setError("Passcode must be at least 4 characters.");
      return;
    }

    try {
      setSubmitting(true);
      let res;
      if (mode === "create") {
        res = await createOrganization(email, orgName.trim(), passcode.trim());
        setSuccess(
          `Organization "${res.organization?.organization_name}" created.`,
        );
      } else {
        res = await joinOrganization(email, orgName.trim(), passcode.trim());
        setSuccess(`Joined "${res.organization?.organization_name}".`);
      }
      setOrgName("");
      setPasscode("");
      const urdds = await dispatch(fetchUserUrdds(email)).unwrap();
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
      <div className="tenant-admin-tabs" style={{ marginBottom: "1rem" }}>
        {!orgInfo?.owned && (
          <button
            type="button"
            className={`tenant-tab${mode === "create" ? " tenant-tab-active" : ""}`}
            onClick={() => {
              setMode("create");
              setError(null);
              setSuccess(null);
            }}
          >
            Create
          </button>
        )}
        <button
          type="button"
          className={`tenant-tab${mode === "join" ? " tenant-tab-active" : ""}`}
          onClick={() => {
            setMode("join");
            setError(null);
            setSuccess(null);
          }}
        >
          Join
        </button>
      </div>
      <form className="tenant-form" onSubmit={handleSubmit}>
        <label className="tenant-field">
          <span>Organization name</span>
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder={mode === "create" ? "My Company" : "Existing org name"}
          />
        </label>
        <label className="tenant-field">
          <span>Passcode</span>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder={
              mode === "create"
                ? "Choose a passcode (min 4 chars)"
                : "Enter org passcode"
            }
          />
        </label>
        <button type="submit" className="tenant-submit" disabled={submitting}>
          {submitting
            ? mode === "create"
              ? "Creating..."
              : "Joining..."
            : mode === "create"
              ? "Create organization"
              : "Join organization"}
        </button>
        {error && <p className="tenant-error">{error}</p>}
        {success && <p className="tenant-success">{success}</p>}
      </form>
    </div>
  );
}

function SettingsPanel({ email, orgInfo, onDone }) {
  const org = orgInfo?.owned;
  const [name, setName] = useState(org?.organization_name || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const dispatch = useDispatch();

  if (!org)
    return (
      <p className="tenant-muted">You haven't created an organization yet.</p>
    );

  const handleRename = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!name.trim()) {
      setError("Name cannot be empty.");
      return;
    }
    if (name.trim() === org.organization_name) {
      setError("Name is unchanged.");
      return;
    }
    try {
      setSubmitting(true);
      await updateOrganization(email, org.id, name.trim());
      setSuccess("Organization renamed successfully.");
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
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button type="submit" className="tenant-submit" disabled={submitting}>
        {submitting ? "Saving..." : "Save"}
      </button>
      {error && <p className="tenant-error">{error}</p>}
      {success && <p className="tenant-success">{success}</p>}
    </form>
  );
}

function MembersPanel({ email, orgInfo }) {
  const org = orgInfo?.owned;
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
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

  useEffect(() => {
    loadMembers();
  }, [org?.id]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!memberEmail.trim()) {
      setError("Enter the member's email address.");
      return;
    }
    try {
      setAdding(true);
      const res = await addOrgMember(email, org.id, memberEmail.trim());
      if (res.already_member) {
        setSuccess(
          `${memberEmail.trim()} is already a member of this organization.`,
        );
      } else {
        setSuccess(`${memberEmail.trim()} has been added to the organization.`);
      }
      setMemberEmail("");
      await loadMembers();
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setAdding(false);
    }
  };

  if (!org)
    return (
      <p className="tenant-muted">
        You haven't created an organization. Only organization owners can manage
        members.
      </p>
    );

  return (
    <div>
      <form
        className="tenant-form"
        onSubmit={handleAdd}
        style={{ marginBottom: "1.5rem" }}
      >
        <label className="tenant-field">
          <span>Add member by email</span>
          <input
            type="email"
            value={memberEmail}
            onChange={(e) => setMemberEmail(e.target.value)}
            placeholder="user@example.com"
          />
        </label>
        <button type="submit" className="tenant-submit" disabled={adding}>
          {adding ? "Adding..." : "Add member"}
        </button>
        {error && <p className="tenant-error">{error}</p>}
        {success && <p className="tenant-success">{success}</p>}
      </form>

      <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
        Current members
      </h4>
      {loading ? (
        <p className="tenant-muted">Loading members...</p>
      ) : members.length === 0 ? (
        <p className="tenant-muted">No members found.</p>
      ) : (
        <div className="tenant-members-list">
          {members.map((m) => (
            <div key={m.urdd_id} className="tenant-member-row">
              <div className="tenant-member-avatar">
                {m.photo_url ? (
                  <img src={m.photo_url} alt="" className="tenant-member-img" />
                ) : (
                  <span className="tenant-member-initial">
                    {(m.name || m.email || "?").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="tenant-member-info">
                <span className="tenant-member-name">{m.name || m.email}</span>
                <span className="tenant-member-email">{m.email}</span>
              </div>
              <span
                className={`tenant-member-badge tenant-member-badge-${m.org_role}`}
              >
                {m.org_role}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PermissionsPanel({ email }) {
  const { urdds } = useSelector((s) => s.org);

  if (!urdds.length)
    return <p className="tenant-muted">No roles assigned yet.</p>;

  return (
    <div className="tenant-permissions-list">
      {urdds.map((u) => (
        <div key={u.urdd_id} className="tenant-perm-card">
          <div className="tenant-perm-header">
            <strong>
              {u.display_name || u.org_name || u.tenant_name || "Personal"}
            </strong>
            <span className="tenant-muted" style={{ fontSize: "0.75rem" }}>
              URDD #{u.urdd_id}
            </span>
          </div>
          {u.permissions && u.permissions.length > 0 ? (
            <div className="tenant-perm-tags">
              {u.permissions.map((p) => (
                <span key={p.permission_name} className="tenant-perm-tag">
                  {p.permission_name}
                  {p.included_id && (
                    <span className="tenant-perm-scope"> (scoped)</span>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p
              className="tenant-muted"
              style={{ margin: "0.3rem 0 0", fontSize: "0.78rem" }}
            >
              No permissions assigned
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function ReposPanel({ email, orgInfo }) {
  const org = orgInfo?.owned;
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
      setError("Could not load repositories.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepos();
  }, [org?.id]);

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

  if (!org)
    return (
      <p className="tenant-muted">
        You haven't created an organization. Only organization owners can manage
        repositories.
      </p>
    );

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
                <span className="tenant-member-badge tenant-member-badge-owner">
                  in org
                </span>
              ) : (
                <button
                  type="button"
                  className="tenant-submit"
                  style={{
                    padding: "0.3rem 0.8rem",
                    fontSize: "0.75rem",
                    margin: 0,
                  }}
                  disabled={adding === r.id}
                  onClick={() => handleAdd(r.id)}
                >
                  {adding === r.id ? "Adding..." : "Add"}
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
  { key: "org", label: "Create / Join" },
  { key: "settings", label: "Settings" },
  { key: "members", label: "Members" },
  { key: "repos", label: "Repositories" },
  { key: "permissions", label: "My Permissions" },
];

export default function OrganizationManager({ email, onOrgChanged }) {
  const [orgInfo, setOrgInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("org");

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

  useEffect(() => {
    loadOrg();
  }, [email]);

  if (loading)
    return <p className="tenant-muted">Loading organization info...</p>;

  return (
    <div>
      {orgInfo?.owned && (
        <div className="tenant-info-box" style={{ marginBottom: "1rem" }}>
          <strong>Your organization:</strong> {orgInfo.owned.organization_name}
        </div>
      )}

      <div className="tenant-admin-tabs" style={{ marginBottom: "1rem" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tenant-tab${tab === t.key ? " tenant-tab-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="portal-card">
        {tab === "org" && (
          <CreateJoinPanel
            email={email}
            orgInfo={orgInfo}
            onDone={() => {
              loadOrg();
              if (onOrgChanged) onOrgChanged();
            }}
          />
        )}
        {tab === "settings" && (
          <SettingsPanel email={email} orgInfo={orgInfo} onDone={loadOrg} />
        )}
        {tab === "members" && <MembersPanel email={email} orgInfo={orgInfo} />}
        {tab === "repos" && <ReposPanel email={email} orgInfo={orgInfo} />}
        {tab === "permissions" && <PermissionsPanel email={email} />}
      </div>
    </div>
  );
}
