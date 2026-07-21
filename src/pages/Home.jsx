import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import styles from "./index.module.css";
import DocsSidebar from "../components/DocsSidebar";

export default function Home() {
  const siteConfig = {
    title: "UBS Documentation",
  };

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!sections.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle(styles.isVisible, entry.isIntersecting);
        });
      },
      {
        root: null,
        threshold: 0.35,
        rootMargin: "0px 0px -10% 0px",
      },
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <main className={styles.pitchMain}>
        <section className={styles.hero}>
          <div className={styles.heroGlow} />
          <p className={styles.kicker}>Framework for high-growth teams</p>
          <h1 className={styles.heroTitle}>{siteConfig.title}</h1>
          <p className={styles.heroSubtitle}>
            Launch production-ready platforms faster with a framework engineered
            for scale, security, and delivery velocity.
          </p>
          <div className={styles.ctaRow}>
            <Link className={styles.ctaPrimary} to="/docs/backend/UBS-intro">
              Explore Documentation
            </Link>

            <Link className={styles.ctaGhost} to="/tools">
              Open Dev Tools
            </Link>
          </div>
        </section>

        <section className={styles.scrollShell}>
          <DocsSidebar />
          <div className={styles.storyRail}>
            <article
              className={`${styles.storyCard} ${styles.isVisible}`}
              data-reveal
            >
              <h2>Built to Win Enterprise Trust</h2>
              <p>
                UBS provides strict structure for architecture, integrations,
                and delivery. Teams get predictable outcomes and
                compliance-ready patterns from day one.
              </p>
            </article>

            <article className={styles.storyCard} data-reveal>
              <h2>Accelerate Every Release</h2>
              <p>
                From API patterns to automation workflows, UBS standardizes
                critical workflows so new teams ship features faster with lower
                operational risk.
              </p>
            </article>

            <article className={styles.storyCard} data-reveal>
              <h2>Scale Without Rewrites</h2>
              <p>
                Modular conventions and production-focused decisions keep
                systems maintainable as customer count, product surface, and
                team size grow.
              </p>
            </article>

            <article className={styles.storyCard} data-reveal>
              <h2>One Framework, Full Delivery System</h2>
              <p>
                Documentation, developer tooling, and implementation standards
                are integrated so companies can pitch, build, and operate from
                one coherent platform.
              </p>
            </article>
          </div>
        </section>
      </main>
    </>
  );
}
