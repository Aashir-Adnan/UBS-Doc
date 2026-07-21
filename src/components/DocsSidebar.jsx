import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import SidebarItem from "./SidebarItem";
import styles from "./DocsSidebar.module.css";
import { buildSidebarTree } from "./buildSidebarTree";

const markdownFiles = import.meta.glob("../../docs/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

const tree = buildSidebarTree(markdownFiles);

function containsCurrentPage(node, pathname) {
  if (node.files.some((file) => pathname === `/docs/${file.slug}`)) {
    return true;
  }

  return Object.values(node.folders).some((folder) =>
    containsCurrentPage(folder, pathname),
  );
}

export default function DocsSidebar() {
  const location = useLocation();

  const [openFolder, setOpenFolder] = useState("");

  useEffect(() => {
    const current = Object.entries(tree.folders).find(([_, node]) =>
      containsCurrentPage(node, location.pathname),
    );

    if (current) {
      setOpenFolder(current[0]);
    }
  }, [location.pathname]);

  return (
    <aside className={styles.sidebar}>
      <h2 className={styles.title}>Documentation</h2>

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
