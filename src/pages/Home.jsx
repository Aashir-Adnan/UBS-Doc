import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "./index.module.css";

const PILLARS = [
  {
    title: "Built to Win Enterprise Trust",
    description:
      "UBS provides strict structure for architecture, integrations, and delivery. Teams get predictable outcomes and compliance-ready patterns from day one.",
  },
  {
    title: "Accelerate Every Release",
    description:
      "From API patterns to automation workflows, UBS standardizes critical workflows so new teams ship features faster with lower operational risk.",
  },
  {
    title: "Scale Without Rewrites",
    description:
      "Modular conventions and production-focused decisions keep systems maintainable as customer count, product surface, and team size grow.",
  },
  {
    title: "One Framework, Full Delivery System",
    description:
      "Documentation, developer tooling, and implementation standards are integrated so companies can pitch, build, and operate from one coherent platform.",
  },
];

export default function Home() {
  const siteConfig = {
    title: "UBS Documentation",
  };
  const navigate = useNavigate();

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
            <button
              className={styles.ctaPrimary}
              onClick={() => navigate("/docs")}
            >
              Explore Documentation
            </button>

            <Link className={styles.ctaGhost} to="/tools">
              Open Dev Tools
            </Link>
          </div>
        </section>

        <section className={styles.scrollShell}>
          <p className={styles.pillarsEyebrow}>Why teams choose UBS</p>

          <div className={styles.storyRail}>
            {PILLARS.map((pillar, index) => (
              <article
                key={pillar.title}
                className={`${styles.storyCard} ${
                  index === 0 ? styles.isVisible : ""
                }`}
                data-reveal
              >
                <span className={styles.storyBadge}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2>{pillar.title}</h2>
                <p>{pillar.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
