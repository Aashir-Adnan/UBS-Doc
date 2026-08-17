import React, { useEffect, useRef, useState } from 'react';
import { githubCallback } from '@site/src/components/portal/tenantProjects/tenantApi';

// Hosted GitHub OAuth landing page.
//
// The GitHub OAuth App's callback URL points here (this page's absolute URL is
// what ops registers as GITHUB_OAUTH_CALLBACK_URL). The backend is JSON-only and
// cannot serve an HTML landing page, so this client hosts it.
//
// On load this page:
//   1. Reads `code` and `state` from its own query string.
//   2. POSTs { code, state } to /api/portal/github/callback.
//   3. On { connection_id }, postMessages it back to the opener (the wizard) and
//      closes itself. The OAuth user token stays server-side; the browser only
//      ever sees the opaque, single-use connection_id.
//   4. On error, postMessages an error shape and tells the user they can close.
//
// The message is tagged { source: "github-connect" } and sent to
// window.location.origin; the wizard's listener guards on both.
//
// MOBILE (flutter_web_auth_2, Option B): the native app has no popup and no
// window.opener. When this page loads WITHOUT an opener we treat it as the mobile
// flow and 302 to a `ubsmobile://` deep link carrying the raw code+state (or an
// error); the app captures that URL, closes its auth session, and performs the
// /callback exchange itself. The web popup path (opener present) is unchanged.

const MESSAGE_SOURCE = 'github-connect';
const MOBILE_CALLBACK_SCHEME = 'ubsmobile';

export default function GithubCallbackPage() {
  const [status, setStatus] = useState('working'); // working | done | error
  const [message, setMessage] = useState('Finishing GitHub connection…');
  const ranRef = useRef(false);

  useEffect(() => {
    // Guard against double-invocation (React strict mode / re-render).
    if (ranRef.current) return;
    ranRef.current = true;

    const origin = window.location.origin;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const oauthError = params.get('error_description') || params.get('error');

    // No opener ⇒ we were opened by the mobile auth session, not a popup.
    const isMobile = !window.opener;

    const post = (payload) => {
      if (window.opener) {
        window.opener.postMessage({ source: MESSAGE_SOURCE, ...payload }, origin);
      }
    };

    // Hand the raw OAuth result back to the mobile app via the deep link; the
    // app performs the /callback exchange itself.
    const redirectToApp = (payload) => {
      const sp = new URLSearchParams(payload);
      setStatus('done');
      setMessage('Returning to the app…');
      window.location.replace(`${MOBILE_CALLBACK_SCHEME}://github/callback?${sp.toString()}`);
    };

    const fail = (msg) => {
      if (isMobile) {
        redirectToApp({ error: msg });
        return;
      }
      setStatus('error');
      setMessage(msg);
      post({ error: msg });
    };

    if (oauthError) {
      fail(oauthError);
      return;
    }
    if (!code || !state) {
      fail('Missing authorization code. Please retry the connection.');
      return;
    }

    // Mobile: don't exchange here — pass code+state to the app and let it call
    // /callback (the connection_id is email-bound and single-use).
    if (isMobile) {
      redirectToApp({ code, state });
      return;
    }

    (async () => {
      try {
        const res = await githubCallback(code, state);
        const connectionId = res?.connection_id;
        if (!connectionId) {
          fail('GitHub did not return a connection. Please retry.');
          return;
        }
        post({ connection_id: connectionId });
        setStatus('done');
        setMessage('GitHub connected. This window will close automatically.');
        // Give the opener a beat to receive the message before closing.
        window.setTimeout(() => window.close(), 400);
      } catch (err) {
        fail(err?.message || 'Could not complete the GitHub connection.');
      }
    })();
  }, []);

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '0.75rem',
        padding: '2rem',
        textAlign: 'center',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ fontSize: '2rem' }} aria-hidden="true">
        {status === 'done' ? '✅' : status === 'error' ? '⚠️' : '🐙'}
      </div>
      <h2 style={{ margin: 0 }}>
        {status === 'error' ? 'GitHub connection failed' : 'Connecting GitHub'}
      </h2>
      <p style={{ margin: 0, color: 'var(--ifm-color-emphasis-600)', maxWidth: 420 }}>
        {message}
      </p>
      {status === 'error' && (
        <p style={{ margin: 0, color: 'var(--ifm-color-emphasis-500)', fontSize: '0.85rem' }}>
          You can close this window and try again.
        </p>
      )}
    </main>
  );
}
