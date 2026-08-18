import React from 'react';
import GoogleSignIn from '@site/src/components/portal/GoogleSignIn';

// The card shown to a signed-out visitor.
//
// The old copy told everyone to "use your organization's @granjur.com account
// for full access", which stopped being true when access moved from an email
// allow-list to provisioning (see usePortalAccess.js). A contractor provisioned
// into a tenant signs in with their own address and has no Granjur account to
// switch to — telling them otherwise sends them nowhere.
//
// Shared by every /tools/* page so this stays in one place; it used to be
// copy-pasted into all thirteen, and had already drifted into three variants.
export default function PortalSignIn() {
  return (
    <section className="portal-hero portal-hero-center">
      <div className="portal-auth-card portal-auth-centered">
        <h2 className="card-title">Sign in</h2>
        <p className="card-subtitle">
          Use your Google account to access Granjur Dev tools.
        </p>
        <GoogleSignIn />
        <p className="card-helper">
          Sign in with your @granjur.com account, or with the address an admin
          granted you access on.
        </p>
      </div>
    </section>
  );
}
