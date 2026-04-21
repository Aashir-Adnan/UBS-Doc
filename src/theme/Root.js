import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useHistory, useLocation } from '@docusaurus/router';
import { AuthProvider } from '@site/src/components/portal/authStore';

const NAV_ITEMS = [
  { label: 'Home', to: '/' },
  { label: 'Documentation', to: '/docs/intro/UBS_Framework_Features' },
  { label: 'Dev Tools', to: '/tools' },
  { label: 'About', to: '/about' },
];

const DOC_NAV_ITEMS = [
  { label: 'Framework Intro', to: '/docs/intro/Node-Advantages' },
  { label: 'Backend', to: '/docs/backend/UBS-intro' },
  { label: 'Frontend', to: '/docs/frontend/UBS-intro' },
  { label: 'Database', to: '/docs/database/Lucidchart' },
  { label: 'Agents', to: '/docs/agents/agent-issue-format' },
  { label: 'Projects', to: '/docs/projects/badar-hms/Opera_Config' },
];

const TRANSITION_MS = 320;
const THEME_ANIM_MS = 700;
const WELCOME_MS = 1800;

export default function Root({ children }) {
  const history = useHistory();
  const location = useLocation();
  const [transitioning, setTransitioning] = useState(false);
  const [theme, setTheme] = useState('light');
  const [showWelcome, setShowWelcome] = useState(true);
  const [welcomeFading, setWelcomeFading] = useState(false);
  const navigateTimerRef = useRef(null);
  const fadeInTimerRef = useRef(null);
  const themeAnimTimerRef = useRef(null);
  const welcomeTimerRef = useRef(null);
  const welcomeFadeTimerRef = useRef(null);

  const handleNavigate = useCallback(
    (to) => {
      if (to === location.pathname || transitioning) return;
      setTransitioning(true);
      if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
      navigateTimerRef.current = setTimeout(() => {
        history.push(to);
      }, TRANSITION_MS);
    },
    [history, location.pathname, transitioning],
  );

  useEffect(() => {
    if (fadeInTimerRef.current) clearTimeout(fadeInTimerRef.current);
    fadeInTimerRef.current = setTimeout(() => setTransitioning(false), 30);
    return () => {
      if (fadeInTimerRef.current) clearTimeout(fadeInTimerRef.current);
    };
  }, [location.pathname]);

  useEffect(
    () => () => {
      if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
      if (fadeInTimerRef.current) clearTimeout(fadeInTimerRef.current);
      if (themeAnimTimerRef.current) clearTimeout(themeAnimTimerRef.current);
      if (welcomeTimerRef.current) clearTimeout(welcomeTimerRef.current);
      if (welcomeFadeTimerRef.current) clearTimeout(welcomeFadeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    setTheme(current);
  }, []);

  const toggleTheme = useCallback(() => {
    if (typeof document === 'undefined') return;
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.add('ubs-theme-animating');
    document.documentElement.setAttribute('data-theme', nextTheme);
    try {
      localStorage.setItem('theme', nextTheme);
    } catch {
      // noop
    }
    setTheme(nextTheme);
    if (themeAnimTimerRef.current) clearTimeout(themeAnimTimerRef.current);
    themeAnimTimerRef.current = setTimeout(() => {
      document.documentElement.classList.remove('ubs-theme-animating');
    }, THEME_ANIM_MS);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasShownWelcome = sessionStorage.getItem('ubs-welcome-shown') === '1';
    if (hasShownWelcome) {
      setShowWelcome(false);
      return;
    }
    setShowWelcome(true);
    welcomeFadeTimerRef.current = setTimeout(
      () => setWelcomeFading(true),
      Math.max(300, WELCOME_MS - 500),
    );
    welcomeTimerRef.current = setTimeout(() => {
      setShowWelcome(false);
      sessionStorage.setItem('ubs-welcome-shown', '1');
    }, WELCOME_MS);
  }, []);

  return (
    <AuthProvider>
      <div className="ubs-app-shell">
        <aside className="ubs-side-nav">
          <div className="ubs-side-nav-brand">UBS</div>
          <nav className="ubs-side-nav-links" aria-label="Primary">
            {NAV_ITEMS.map((item) => {
              const active =
                item.to === '/'
                  ? location.pathname === '/'
                  : item.label === 'Documentation'
                    ? location.pathname.startsWith('/docs')
                    : location.pathname.startsWith(item.to);
              return (
                <button
                  key={item.to}
                  type="button"
                  className={`ubs-side-nav-link${active ? ' is-active' : ''}`}
                  onClick={() => handleNavigate(item.to)}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
          {location.pathname.startsWith('/docs') && (
            <div className="ubs-doc-nav-shell">
              <p className="ubs-doc-nav-title">Documentation</p>
              <nav className="ubs-doc-nav-links" aria-label="Documentation sections">
                {DOC_NAV_ITEMS.map((item) => {
                  const active = location.pathname.startsWith(item.to);
                  return (
                    <button
                      key={item.to}
                      type="button"
                      className={`ubs-doc-nav-link${active ? ' is-active' : ''}`}
                      onClick={() => handleNavigate(item.to)}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          )}
          <button
            type="button"
            className="ubs-theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            <span className={`ubs-theme-toggle-track${theme === 'dark' ? ' is-dark' : ''}`}>
              <span className="ubs-theme-icon ubs-theme-icon--sun" aria-hidden="true">
                ☀
              </span>
              <span className="ubs-theme-icon ubs-theme-icon--moon" aria-hidden="true">
                ☾
              </span>
              <span className={`ubs-theme-thumb${theme === 'dark' ? ' is-dark' : ''}`} />
            </span>
            <span className="ubs-theme-label">
              {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            </span>
          </button>
        </aside>
        <div className={`ubs-page-stage${transitioning ? ' is-transitioning' : ''}`}>
          {children}
        </div>
        <div className={`ubs-route-fade${transitioning ? ' is-active' : ''}`} />
        {showWelcome && (
          <div
            className={`ubs-welcome-overlay${welcomeFading ? ' is-fading' : ''}`}
            style={{ position: 'fixed', inset: 0, background: '#000000' }}
          >
            <p className="ubs-welcome-text">Welcome</p>
          </div>
        )}
      </div>
    </AuthProvider>
  );
}
