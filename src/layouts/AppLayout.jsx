import { Outlet } from "react-router-dom";
import AppSidebar from "../components/AppSidebar";
import styles from "./AppLayout.module.css";

export default function AppLayout() {
  return (
    <div className={styles.layout}>
      <AppSidebar />

      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
