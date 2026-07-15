import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { createOrganization, joinOrganization, getMyOrganization } from './tenantApi';
import { fetchUserUrdds, setActiveUrdd } from '@site/src/state/orgSlice';

export default function OrganizationManager({ email, onOrgChanged }) {
  const dispatch = useDispatch();
  const [orgInfo, setOrgInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('create');
  const [orgName, setOrgName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!orgName.trim()) {
      setError('Organization name is required.');
      return;
    }
    if (!passcode.trim() || passcode.trim().length < 4) {
      setError('Passcode must be at least 4 characters.');
      return;
    }

    try {
      setSubmitting(true);
      let res;
      if (mode === 'create') {
        res = await createOrganization(email, orgName.trim(), passcode.trim());
        setSuccess(`Organization "${res.organization?.organization_name}" created successfully.`);
      } else {
        res = await joinOrganization(email, orgName.trim(), passcode.trim());
        setSuccess(`Joined organization "${res.organization?.organization_name}" successfully.`);
      }
      setOrgName('');
      setPasscode('');
      await loadOrg();

      // Refresh URDDs in Redux and switch to the new org's URDD
      const urddsResult = await dispatch(fetchUserUrdds(email)).unwrap();
      if (res.urdd_id) {
        dispatch(setActiveUrdd(res.urdd_id));
      }

      if (typeof onOrgChanged === 'function') onOrgChanged();
    } catch (err) {
      const msg = err.message || 'Something went wrong. Please try again.';
      // Map common backend errors to friendly messages
      if (msg.includes('already created')) {
        setError('You can only create one organization. Try joining an existing one instead.');
      } else if (msg.includes('already exists')) {
        setError('An organization with this name already exists. Please choose a different name.');
      } else if (msg.includes('Invalid organization')) {
        setError('The organization name or passcode is incorrect. Please check and try again.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p className="tenant-muted">Loading organization info...</p>;

  return (
    <div>
      {orgInfo?.owned && (
        <div className="tenant-info-box" style={{ marginBottom: '1rem' }}>
          <strong>Your organization:</strong> {orgInfo.owned.organization_name}
        </div>
      )}
      {orgInfo?.tenant && orgInfo.tenant.id !== orgInfo?.owned?.id && (
        <div className="tenant-info-box" style={{ marginBottom: '1rem' }}>
          <strong>Member of:</strong> {orgInfo.tenant.organization_name}
        </div>
      )}

      {orgInfo?.owned ? (
        <p className="tenant-muted">
          You already created an organization. You can still join other organizations.
        </p>
      ) : null}

      <div className="tenant-admin-tabs" style={{ marginBottom: '1rem' }}>
        {!orgInfo?.owned && (
          <button
            type="button"
            className={`tenant-tab${mode === 'create' ? ' tenant-tab-active' : ''}`}
            onClick={() => { setMode('create'); setError(null); setSuccess(null); }}
          >
            Create organization
          </button>
        )}
        <button
          type="button"
          className={`tenant-tab${mode === 'join' ? ' tenant-tab-active' : ''}`}
          onClick={() => { setMode('join'); setError(null); setSuccess(null); }}
        >
          Join organization
        </button>
      </div>

      <form className="tenant-form" onSubmit={handleSubmit}>
        <label className="tenant-field">
          <span>Organization name</span>
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder={mode === 'create' ? 'My Company' : 'Existing org name'}
          />
        </label>

        <label className="tenant-field">
          <span>Passcode</span>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder={mode === 'create' ? 'Choose a passcode (min 4 chars)' : 'Enter org passcode'}
          />
        </label>

        <button type="submit" className="tenant-submit" disabled={submitting}>
          {submitting
            ? (mode === 'create' ? 'Creating...' : 'Joining...')
            : (mode === 'create' ? 'Create organization' : 'Join organization')}
        </button>

        {error && <p className="tenant-error">{error}</p>}
        {success && <p className="tenant-success">{success}</p>}
      </form>
    </div>
  );
}
