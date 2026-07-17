import React from "react";
import { Link } from "react-router-dom";
import GithubWorkflowSandbox from "@site/src/components/portal/GithubWorkflowSandbox";

const SANDBOX_USER = {
  uid: "sandbox-001",
  email: "intern@granjur.com",
  name: "Sandbox User",
  photoURL: null,
};

function SandboxContent() {
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
            Signed in as <strong>{SANDBOX_USER.name}</strong>.{" "}
            <span style={{ opacity: 0.5, fontSize: "0.82rem" }}>
              (sandbox mode — no real API calls)
            </span>
          </p>
        </div>
      </section>

      <section className="portal-section">
        <GithubWorkflowSandbox user={SANDBOX_USER} />
      </section>
    </>
  );
}

export default function GithubSandboxPage() {
  return (
    <>
      <main className="portal-main-wrapper">
        <SandboxContent />
      </main>
    </>
  );
}
