import { NavLink } from "react-router-dom";
import styles from "./AppSidebar.module.css";
import ThemeToggle from "./ThemeToggle";

export default function AppSidebar() {
  return (
    <aside className={styles.sidebar}>
      {/* Top Section */}
      <div>
        <div className={styles.logo}>UBS</div>

        <nav className={styles.nav}>
          <NavLink
            to="/"
            className={({ isActive }) =>
              isActive ? styles.active : styles.link
            }
          >
            Home
          </NavLink>

          <NavLink
            to="/docs/backend/UBS-intro"
            className={({ isActive }) =>
              isActive ? styles.active : styles.link
            }
          >
            Documentation
          </NavLink>

          <NavLink
            to="/tools"
            className={({ isActive }) =>
              isActive ? styles.active : styles.link
            }
          >
            Dev Tools
          </NavLink>

          <NavLink
            to="/about"
            className={({ isActive }) =>
              isActive ? styles.active : styles.link
            }
          >
            About
          </NavLink>
        </nav>
      </div>

      {/* Bottom Section */}
      <div className={styles.bottom}>
        <ThemeToggle />
      </div>
    </aside>
  );
}
