import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import SidebarItem from "./SidebarItem";
import styles from "./DocsSidebar.module.css";
import { buildSidebarTree } from "./buildSidebarTree";
import { getSidebar } from "../services/DocumentationService";

function containsCurrentPage(node, pathname) {
  if (node.files.some((file) => pathname === `/docs/${file.slug}`)) {
    return true;
  }

  return Object.values(node.folders).some((folder) =>
    containsCurrentPage(folder, pathname),
  );
}

export default function DocsSidebar({ repoId }) {
  const location = useLocation();

  const [tree, setTree] = useState({
    folders: {},
    files: [],
  });

  const [openFolder, setOpenFolder] = useState("");

  useEffect(() => {
    async function loadSidebar() {
      if (!repoId) return;
      try {
        const docs = await getSidebar(repoId);

        setTree(buildSidebarTree(docs));
      } catch (err) {
        console.error("Failed to load sidebar", err);
      }
    }

    loadSidebar();
  }, [repoId]);

  useEffect(() => {
    const current = Object.entries(tree.folders).find(([_, node]) =>
      containsCurrentPage(node, location.pathname),
    );

    if (current) {
      setOpenFolder(current[0]);
    }
  }, [location.pathname, tree]);

  return (
    <aside className={styles.sidebar}>
      <h2 className={styles.title}>Documentation</h2>

      {/* Root files */}
      <div className={styles.links}>
        {tree.files.map((file) => (
          <Link
            key={file.slug}
            to={`/docs/${file.slug}`}
            className={
              location.pathname === `/docs/${file.slug}`
                ? `${styles.link} ${styles.active}`
                : styles.link
            }
          >
            {file.title}
          </Link>
        ))}
      </div>

      {/* Folders */}
      {Object.entries(tree.folders).map(([name, node]) => (
        <SidebarItem
          key={name}
          name={name}
          node={node}
          openFolder={openFolder}
          setOpenFolder={setOpenFolder}
        />
      ))}
    </aside>
  );
}
