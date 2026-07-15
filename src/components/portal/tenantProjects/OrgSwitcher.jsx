import React, { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setActiveUrdd } from '@site/src/state/orgSlice';

export default function OrgSwitcher() {
  const dispatch = useDispatch();
  const { urdds, activeUrdd, status } = useSelector((s) => s.org);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (status !== 'ready' || urdds.length === 0) return null;

  const active = urdds.find((u) => u.urdd_id === activeUrdd);
  const displayName = active?.org_name || 'Personal';

  return (
    <div className="ubs-org-switcher" ref={ref}>
      <button
        type="button"
        className="ubs-org-switcher-btn"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="ubs-org-switcher-icon">
          {active?.org_name ? active.org_name.charAt(0).toUpperCase() : 'P'}
        </span>
        <span className="ubs-org-switcher-label">{displayName}</span>
        <span className="ubs-org-switcher-chevron" aria-hidden="true">
          {open ? '\u25B4' : '\u25BE'}
        </span>
      </button>

      {open && (
        <ul className="ubs-org-switcher-menu" role="listbox">
          {urdds.map((u) => {
            const label = u.org_name || 'Personal';
            const isActive = u.urdd_id === activeUrdd;
            return (
              <li key={u.urdd_id} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  className={`ubs-org-switcher-option${isActive ? ' is-active' : ''}`}
                  onClick={() => {
                    dispatch(setActiveUrdd(u.urdd_id));
                    setOpen(false);
                  }}
                >
                  <span className="ubs-org-switcher-option-icon">
                    {u.org_name ? u.org_name.charAt(0).toUpperCase() : 'P'}
                  </span>
                  <span className="ubs-org-switcher-option-text">
                    <span className="ubs-org-switcher-option-name">{label}</span>
                    {u.tenant_name && u.tenant_name !== label && (
                      <span className="ubs-org-switcher-option-sub">{u.tenant_name}</span>
                    )}
                  </span>
                  {isActive && <span className="ubs-org-switcher-check" aria-hidden="true">&#10003;</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
