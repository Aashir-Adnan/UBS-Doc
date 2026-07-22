import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import { useAuth } from "@site/src/components/portal/authStore";
import PortalSignIn from "@site/src/components/portal/PortalSignIn";
import { usePortalAccess } from "@site/src/components/portal/usePortalAccess";
import AccessRestricted from "@site/src/components/portal/AccessRestricted";
import GithubWorkflow from "@site/src/components/portal/GithubWorkflow";

function GithubContent() {
  const { user, signOut, loading } = useAuth();
  const { allowed: canAccess, loading: accessLoading } = usePortalAccess();

if (loading || accessLoading) {
  return (
    <section className="portal-hero portal-hero-center">
      <p>Loading...</p>
    </section>
  );
}
  }

  if (!user) {
    return <PortalSignIn />;
  }

  if (!canAccess) {
    return (
      <AccessRestricted email={user.email} onSignOut={signOut} />
    );
  }

  return (
    <>
      <div className="portal-breadcrumb">
        <Link to="/tools">← Back to Dev Tools</Link>
      </div>

      <section className="portal-hero">
        <div className="portal-hero-text">
          <h2>GitHub Development Workflow</h2>
          <p>
            Browse repositories and dispatch agent tasks as GitHub issues.
            Signed in as <strong>{user.name || user.email}</strong>.{" "}
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
        <GithubWorkflow user={user} />
      </section>
    </>
  );
}

export default function GithubPage() {
  return (
    <>
      <main className="portal-main-wrapper">
        <GithubContent />
      </main>
    </>
  );
}
