import { useState, useEffect } from "react";
import styles from "./ThemeToggle.module.css";

export default function ThemeToggle() {
  const [dark, setDark] = useState(localStorage.getItem("theme") === "dark");

  useEffect(() => {
    if (dark) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  return (
    <button className={styles.toggle} onClick={() => setDark(!dark)}>
      <div className={`${styles.thumb} ${dark ? styles.active : ""}`}>
        {dark ? "🌙" : "☀️"}
      </div>

      <span>Dark Mode</span>
    </button>
  );
}
