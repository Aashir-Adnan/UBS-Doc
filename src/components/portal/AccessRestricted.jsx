import React from 'react';

// The card shown to a signed-in user who has not been granted portal access.
//
// The wording matters: access is no longer a matter of which address you hold, so
// telling a contractor to "sign out and use your Granjur workspace account" sends
// them somewhere they cannot go. What they need is an admin to provision them.
//
// Shared by every /tools/* page so the message stays in one place — it used to be
// copy-pasted into all thirteen of them.
export default function AccessRestricted({ email, onSignOut }) {
  return (
    <section className="portal-hero portal-hero-center">
      <div className="portal-auth-card portal-auth-centered">
        <h2 className="card-title">Access restricted</h2>
        <p className="card-subtitle">
          Your account has not been granted access to this portal yet.
        </p>
        <p className="card-helper">
          {email ? (
            <>
              You are signed in as <strong>{email}</strong>.{' '}
            </>
          ) : null}
          Ask an admin to provision your account into a tenant, then reload this
          page.
          {onSignOut ? (
            <>
              {' '}
              <button
                type="button"
                className="portal-signout-link"
                onClick={onSignOut}
              >
                Sign out
              </button>
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}
