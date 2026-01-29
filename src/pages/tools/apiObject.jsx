import React, { useMemo, useState } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useAuth } from '../../components/portal/authStore';
import GoogleSignIn from '../../components/portal/GoogleSignIn';

function isGranjurEmail(email) {
  const e = (email || '').toLowerCase();
  return (
    e.endsWith('@granjur.com') ||
    e.endsWith('@granjur,com') ||
    e === 'dev.alikhalil@gmail.com'
  );
}

/** Converts URL path to object name: /test/api → TestApi_object */
function urlToObjectName(url) {
  if (!url || typeof url !== 'string') return '';
  const segments = url.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const pascal = segments
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join('');
  return pascal ? `${pascal}_object` : '';
}

/** Inline help icon with hover tooltip */
function FieldHelp({ text }) {
  return (
    <span
      className="api-object-help"
      title={text}
      role="img"
      aria-label="Help"
    >
      ?
    </span>
  );
}

const DEFAULT_STATE = {
  url: '/test/api',
  // config.features
  multistep: true,
  parameters: true,
  pagination: false,
  // config.communication
  encryption: false,
  // config.verification
  otp: false,
  accessToken: false,
  // requestMetaData
  requestMethod: 'POST',
  permission: '',
  pageSize: 10,
  // response
  successMessage: 'Configuration generated successfully!',
  errorMessage: 'There was an error generating the configuration.',
  // apiInfo
  preProcessFunctions: '', // comma or newline separated, or JSON array
  postProcessFunction: 'ubs_init_wrapper',
  query: '',
  // optional: fields JSON
  fieldsJson: '[]',
};

function parsePreProcessFunctions(raw) {
  if (!raw || !String(raw).trim()) return [];
  const s = String(raw).trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr : [s];
    } catch {
      return s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
    }
  }
  return s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
}

function parseFieldsJson(raw) {
  if (!raw || !String(raw).trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function buildOutput(state) {
  const objectName = urlToObjectName(state.url) || 'Api_object';
  const preProcess = parsePreProcessFunctions(state.preProcessFunctions);
  const fields = parseFieldsJson(state.fieldsJson);
  const queryVal = state.query.trim() || null;
  const postProcess = state.postProcessFunction.trim() || null;

  const obj = {
    versions: {
      versionData: [
        {
          '*': {
            steps: [
              {
                config: {
                  features: {
                    multistep: state.multistep,
                    parameters: state.parameters,
                    pagination: state.pagination,
                  },
                  communication: {
                    encryption: state.encryption,
                  },
                  verification: {
                    otp: state.otp,
                    accessToken: state.accessToken,
                  },
                },
                data: {
                  parameters: {
                    fields,
                  },
                  apiInfo: {
                    preProcessFunctions: preProcess,
                    query: queryVal,
                    postProcessFunction: postProcess,
                  },
                  requestMetaData: {
                    requestMethod: state.requestMethod || 'POST',
                    permission: state.permission.trim() || null,
                    pagination: {
                      pageSize: Number(state.pageSize) || 10,
                    },
                  },
                },
                response: {
                  successMessage: state.successMessage || '',
                  errorMessage: state.errorMessage || '',
                },
              },
            ],
          },
        },
      ],
    },
  };

  let js = JSON.stringify(obj, null, 4);
  js = js.replace(/"([^"]+)":/g, '$1:');
  // Output postProcessFunction as identifier when it looks like one (e.g. ubs_init_wrapper)
  const postVal = state.postProcessFunction.trim();
  if (postVal && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(postVal)) {
    js = js.replace(new RegExp(`"postProcessFunction":\\s*"${postVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `postProcessFunction: ${postVal}`);
  }
  return `global.${objectName} = ${js}\nmodule.exports = { ${objectName} }`;
}

function ApiObjectBuilderContent() {
  const { user, signOut } = useAuth();
  const canAccessPortal = !!user && isGranjurEmail(user?.email);
  const [state, setState] = useState(DEFAULT_STATE);
  const [activeTab, setActiveTab] = useState('form');

  const outputJs = useMemo(() => buildOutput(state), [state]);
  const objectName = urlToObjectName(state.url);

  const update = (key, value) => setState((s) => ({ ...s, [key]: value }));
  const toggle = (key) => setState((s) => ({ ...s, [key]: !s[key] }));

  const copyOutput = () => {
    navigator.clipboard.writeText(outputJs).then(
      () => alert('Copied to clipboard!'),
      () => alert('Failed to copy.')
    );
  };

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

  if (!canAccessPortal) {
    return (
      <section className="portal-hero portal-hero-center">
        <div className="portal-auth-card portal-auth-centered">
          <h2 className="card-title">Access restricted</h2>
          <p className="card-subtitle">
            This portal is limited to @granjur.com accounts.
          </p>
          <p className="card-helper">
            You are currently signed in as <strong>{user.email}</strong>. Please
            sign out and use your Granjur workspace account.
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
          <h2>API Object Builder</h2>
          <p>
            Create custom API objects with pre-configured flags and optional
            pre/post process functions. Signed in as{' '}
            <strong>{user.name || user.email}</strong>.{' '}
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
        <div className="api-object-tabs">
          <button
            type="button"
            className={`api-object-tab ${activeTab === 'form' ? 'active' : ''}`}
            onClick={() => setActiveTab('form')}
          >
            Configure
          </button>
          <button
            type="button"
            className={`api-object-tab ${activeTab === 'output' ? 'active' : ''}`}
            onClick={() => setActiveTab('output')}
          >
            Output (JS)
          </button>
        </div>

        {activeTab === 'form' && (
          <div className="portal-card api-object-form-card">
            <div className="api-object-form">
              {/* URL → Object name */}
              <div className="api-object-field">
                <label>
                  API URL path{' '}
                  <FieldHelp text="Path used for this API (e.g. /test/api). Becomes the exported object name (e.g. TestApi_object)." />
                </label>
                <input
                  type="text"
                  value={state.url}
                  onChange={(e) => update('url', e.target.value)}
                  placeholder="/test/api"
                />
                {objectName && (
                  <span className="api-object-name-hint">
                    → Object name: <code>{objectName}</code>
                  </span>
                )}
              </div>

              <h4 className="api-object-group-title">Features</h4>
              <div className="api-object-check-group">
                <label className="api-object-check">
                  <input
                    type="checkbox"
                    checked={state.multistep}
                    onChange={() => toggle('multistep')}
                  />
                  <span>multistep</span>
                  <FieldHelp text="Enable multi-step flow for this API." />
                </label>
                <label className="api-object-check">
                  <input
                    type="checkbox"
                    checked={state.parameters}
                    onChange={() => toggle('parameters')}
                  />
                  <span>parameters</span>
                  <FieldHelp text="Enable parameter handling for this API." />
                </label>
                <label className="api-object-check">
                  <input
                    type="checkbox"
                    checked={state.pagination}
                    onChange={() => toggle('pagination')}
                  />
                  <span>pagination</span>
                  <FieldHelp text="Enable pagination for responses." />
                </label>
              </div>

              <h4 className="api-object-group-title">Communication</h4>
              <div className="api-object-check-group">
                <label className="api-object-check">
                  <input
                    type="checkbox"
                    checked={state.encryption}
                    onChange={() => toggle('encryption')}
                  />
                  <span>encryption</span>
                  <FieldHelp text="Use encryption for request/response communication." />
                </label>
              </div>

              <h4 className="api-object-group-title">Verification</h4>
              <div className="api-object-check-group">
                <label className="api-object-check">
                  <input
                    type="checkbox"
                    checked={state.otp}
                    onChange={() => toggle('otp')}
                  />
                  <span>otp</span>
                  <FieldHelp text="Require OTP verification for this API." />
                </label>
                <label className="api-object-check">
                  <input
                    type="checkbox"
                    checked={state.accessToken}
                    onChange={() => toggle('accessToken')}
                  />
                  <span>accessToken</span>
                  <FieldHelp text="Require access token verification." />
                </label>
              </div>

              <h4 className="api-object-group-title">Request metadata</h4>
              <div className="api-object-field">
                <label>
                  requestMethod{' '}
                  <FieldHelp text="HTTP method for the request (e.g. POST, GET)." />
                </label>
                <select
                  value={state.requestMethod}
                  onChange={(e) => update('requestMethod', e.target.value)}
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div className="api-object-field">
                <label>
                  permission{' '}
                  <FieldHelp text="Permission key required to call this API (null for no restriction)." />
                </label>
                <input
                  type="text"
                  value={state.permission}
                  onChange={(e) => update('permission', e.target.value)}
                  placeholder="null"
                />
              </div>
              <div className="api-object-field">
                <label>
                  pageSize (pagination){' '}
                  <FieldHelp text="Default page size when pagination is enabled." />
                </label>
                <input
                  type="number"
                  min={1}
                  value={state.pageSize}
                  onChange={(e) => update('pageSize', e.target.value)}
                />
              </div>

              <h4 className="api-object-group-title">Response messages</h4>
              <div className="api-object-field">
                <label>
                  successMessage{' '}
                  <FieldHelp text="Message shown when the request succeeds." />
                </label>
                <input
                  type="text"
                  value={state.successMessage}
                  onChange={(e) => update('successMessage', e.target.value)}
                />
              </div>
              <div className="api-object-field">
                <label>
                  errorMessage{' '}
                  <FieldHelp text="Message shown when the request fails." />
                </label>
                <input
                  type="text"
                  value={state.errorMessage}
                  onChange={(e) => update('errorMessage', e.target.value)}
                />
              </div>

              <h4 className="api-object-group-title">Pre / Post process</h4>
              <div className="api-object-field">
                <label>
                  preProcessFunctions{' '}
                  <FieldHelp text="Comma- or newline-separated function names, or a JSON array. Run before the main handler." />
                </label>
                <textarea
                  value={state.preProcessFunctions}
                  onChange={(e) => update('preProcessFunctions', e.target.value)}
                  placeholder="fn1, fn2"
                  rows={3}
                />
              </div>
              <div className="api-object-field">
                <label>
                  postProcessFunction{' '}
                  <FieldHelp text="Function name to run after the main handler (e.g. ubs_init_wrapper)." />
                </label>
                <input
                  type="text"
                  value={state.postProcessFunction}
                  onChange={(e) => update('postProcessFunction', e.target.value)}
                  placeholder="ubs_init_wrapper"
                />
              </div>
              <div className="api-object-field">
                <label>
                  query{' '}
                  <FieldHelp text="Optional query identifier (null for none)." />
                </label>
                <input
                  type="text"
                  value={state.query}
                  onChange={(e) => update('query', e.target.value)}
                  placeholder="null"
                />
              </div>

              <h4 className="api-object-group-title">Parameters fields</h4>
              <div className="api-object-field">
                <label>
                  fields (JSON array){' '}
                  <FieldHelp text="JSON array of field definitions for the request parameters." />
                </label>
                <textarea
                  value={state.fieldsJson}
                  onChange={(e) => update('fieldsJson', e.target.value)}
                  placeholder="[]"
                  rows={4}
                  className="api-object-code"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'output' && (
          <div className="portal-card api-object-output-card">
            <div className="api-object-output-header">
              <span>Generated JS — copy and save as a .js file</span>
              <button
                type="button"
                className="api-object-copy-btn"
                onClick={copyOutput}
              >
                Copy
              </button>
            </div>
            <pre className="api-object-output-pre">{outputJs}</pre>
          </div>
        )}
      </section>
    </>
  );
}

export default function ApiObjectBuilderPage() {
  return (
    <Layout
      title="API Object Builder"
      description="Create custom API objects with flags and pre/post process functions"
    >
      <main className="portal-main-wrapper">
        <ApiObjectBuilderContent />
      </main>
    </Layout>
  );
}
