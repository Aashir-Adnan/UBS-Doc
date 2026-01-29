import React from 'react';
import Layout from '@theme/Layout';

export default function AboutPage() {
  return (
    <Layout
      title="About Dev"
      description="About the developer and Granjur Dev"
    >
      <main className="portal-main-wrapper">
        <section className="portal-section">
          <div className="portal-section-header">
            <h3>About the developer</h3>
            <p>Connect with Aashir across platforms.</p>
          </div>
          <div className="portal-card portal-card-hover about-card">
            <p>
              Built and maintained by <strong>Aashir Adnan</strong>. Follow or
              reach out using the links below.
            </p>
            <div className="about-links">
              <a
                href="https://www.instagram.com/ihavethisthingwithsatire/"
                target="_blank"
                rel="noreferrer"
                className="about-link"
              >
                Instagram
              </a>
              <a
                href="https://www.linkedin.com/in/aashir-adnan-69521b253/"
                target="_blank"
                rel="noreferrer"
                className="about-link"
              >
                LinkedIn
              </a>
              <a
                href="https://github.com/Aashir-Adnan"
                target="_blank"
                rel="noreferrer"
                className="about-link"
              >
                GitHub
              </a>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
