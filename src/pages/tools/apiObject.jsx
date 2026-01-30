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

const FIELDS_JSON_EXAMPLE = `[
  {
    "name": "actionPerformerURDD",
    "required": false,
    "source": "req.body"
  }
]`;

const DEFAULT_STATE = {
  url: '/test/api',
  // config.features
  multistep: true,
  parameters: true,
  pagination: false,
  // config.communication
  encryption: false,
  encryptionAccessToken: false,
  encryptionPlatformEncryption: true, // at least one must be true when encryption is on
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
  // apiInfo — write full function definitions; names are extracted and referenced in config
  preProcessDefinitions: '',
  postProcessDefinition: '',
  query: '',
  // optional: fields JSON
  fieldsJson: '[]',
};

/** Extract function names from definition code (async function name( or function name() in order. */
function extractFunctionNames(code) {
  if (!code || !String(code).trim()) return [];
  const regex = /(?:async\s+)?function\s+(\w+)\s*\(/g;
  const names = [];
  let m;
  while ((m = regex.exec(code)) !== null) names.push(m[1]);
  return names;
}

/** Extract single function name from definition code. */
function extractSingleFunctionName(code) {
  const names = extractFunctionNames(code);
  return names.length > 0 ? names[0] : null;
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
  const preDefs = (state.preProcessDefinitions || '').trim();
  const postDef = (state.postProcessDefinition || '').trim();
  const preNames = extractFunctionNames(preDefs);
  const postName = extractSingleFunctionName(postDef);
  const fields = parseFieldsJson(state.fieldsJson);
  const queryVal = state.query.trim() || null;

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
                    encryption: state.encryption
                      ? {
                          accessToken: state.encryptionAccessToken,
                          platformEncryption: state.encryptionPlatformEncryption,
                        }
                      : false,
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
                    preProcessFunctions: preNames.length > 0 ? preNames : [],
                    query: queryVal,
                    postProcessFunction: postName,
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
  // Output preProcessFunctions as array of identifiers when we have definitions
  if (preNames.length > 0) {
    const arrLiteral = '[' + preNames.join(', ') + ']';
    js = js.replace(
      /preProcessFunctions:\s*\[[^\]]*\]/,
      `preProcessFunctions: ${arrLiteral}`
    );
  }
  // Output postProcessFunction as identifier when we have a definition
  if (postName) {
    js = js.replace(
      new RegExp(`postProcessFunction:\\s*"${postName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
      `postProcessFunction: ${postName}`
    );
  }

  const definitionsBlock = [preDefs, postDef].filter(Boolean).join('\n\n');
  const configPart = `global.${objectName} = ${js}\nmodule.exports = { ${objectName} }`;
  return definitionsBlock
    ? `${definitionsBlock}\n\n${configPart}`
    : configPart;
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
                  <FieldHelp text="When true, sets an encryption object with accessToken and platformEncryption (at least one must be true)." />
                </label>
                {state.encryption && (
                  <>
                    <label className="api-object-check api-object-check-indent">
                      <input
                        type="checkbox"
                        checked={state.encryptionAccessToken}
                        onChange={() => toggle('encryptionAccessToken')}
                      />
                      <span>accessToken</span>
                    </label>
                    <label className="api-object-check api-object-check-indent">
                      <input
                        type="checkbox"
                        checked={state.encryptionPlatformEncryption}
                        onChange={() => toggle('encryptionPlatformEncryption')}
                      />
                      <span>platformEncryption</span>
                    </label>
                    {!state.encryptionAccessToken && !state.encryptionPlatformEncryption && (
                      <span className="api-object-warn">At least one of accessToken or platformEncryption should be true.</span>
                    )}
                  </>
                )}
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
                  Pre-process function definitions{' '}
                  <FieldHelp text="Write one or more full function definitions (e.g. async function func1(req, decryptedPayload) { }). The return of this function is added to decryptedPayload under the key of the function name." />
                </label>
                <textarea
                  value={state.preProcessDefinitions}
                  onChange={(e) => update('preProcessDefinitions', e.target.value)}
                  placeholder={'async function func1(req, decryptedPayload) {\n  // ...\n}\nasync function func2(req, decryptedPayload) {\n  // ...\n}'}
                  rows={6}
                  className="api-object-code"
                  spellCheck={false}
                />
                {state.preProcessDefinitions.trim() && (
                  <span className="api-object-name-hint">
                    → Referenced as: [{extractFunctionNames(state.preProcessDefinitions).join(', ')}]
                  </span>
                )}
              </div>
              <div className="api-object-field">
                <label>
                  Post-process function definition{' '}
                  <FieldHelp text="Write a single full function definition. The return of this function is assigned to response." />
                </label>
                <textarea
                  value={state.postProcessDefinition}
                  onChange={(e) => update('postProcessDefinition', e.target.value)}
                  placeholder={'async function ubs_init_wrapper(req, decryptedPayload) {\n  // ...\n}'}
                  rows={4}
                  className="api-object-code"
                  spellCheck={false}
                />
                {state.postProcessDefinition.trim() && extractSingleFunctionName(state.postProcessDefinition) && (
                  <span className="api-object-name-hint">
                    → Referenced as: {extractSingleFunctionName(state.postProcessDefinition)}
                  </span>
                )}
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
                  <FieldHelp text="JSON array of field definitions. Each field: name, validations (array), required (bool), source (e.g. req.body)." />
                </label>
                <textarea
                  value={state.fieldsJson}
                  onChange={(e) => update('fieldsJson', e.target.value)}
                  placeholder={FIELDS_JSON_EXAMPLE}
                  rows={6}
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
