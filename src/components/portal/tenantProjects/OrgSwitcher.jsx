import React, { useState, useRef, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setActiveUrdd } from "../../../state/orgSlice";

function getLabel(u) {
  return u?.display_name || u?.org_name || u?.tenant_name || "Personal";
}

function getInitial(u) {
  const name = u?.org_name || u?.tenant_name;
  return name ? name.charAt(0).toUpperCase() : "P";
}

export default function OrgSwitcher() {
  const dispatch = useDispatch();
  const { urdds, activeUrdd, status } = useSelector((s) => s.org);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (status !== "ready" || urdds.length === 0) return null;

  const active = urdds.find((u) => u.urdd_id === activeUrdd);
  const displayName = getLabel(active);

  return (
    <div className="ubs-org-switcher" ref={ref}>
      <button
        type="button"
        className="ubs-org-switcher-btn"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="ubs-org-switcher-icon">{getInitial(active)}</span>
        <span className="ubs-org-switcher-label">{displayName}</span>
        <span className="ubs-org-switcher-chevron" aria-hidden="true">
          {open ? "\u25B4" : "\u25BE"}
        </span>
      </button>

      {open && (
        <ul className="ubs-org-switcher-menu" role="listbox">
          {urdds.map((u) => {
            const label = getLabel(u);
            const isActive = u.urdd_id === activeUrdd;
            return (
              <li key={u.urdd_id} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  className={`ubs-org-switcher-option${isActive ? " is-active" : ""}`}
                  onClick={() => {
                    dispatch(setActiveUrdd(u.urdd_id));
                    setOpen(false);
                  }}
                >
                  <span className="ubs-org-switcher-option-icon">
                    {getInitial(u)}
                  </span>
                  <span className="ubs-org-switcher-option-text">
                    <span className="ubs-org-switcher-option-name">
                      {label}
                    </span>
                  </span>
                  {isActive && (
                    <span className="ubs-org-switcher-check" aria-hidden="true">
                      &#10003;
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
