import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import styles from "./DocsSidebar.module.css";

function formatName(name) {
  return name.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function containsCurrentPage(node, pathname) {
  if (node.files.some((file) => pathname === `/docs/${file.slug}`)) {
    return true;
  }

  return Object.values(node.folders).some((folder) =>
    containsCurrentPage(folder, pathname),
  );
}

export default function SidebarItem({
  name,
  node,
  level = 0,
  openFolder,
  setOpenFolder,
}) {
  const location = useLocation();

  const isTopLevel = level === 0;

  const [childOpen, setChildOpen] = useState(false);

  const open = isTopLevel ? openFolder === name : childOpen;

  useEffect(() => {
    if (!isTopLevel) {
      setChildOpen(containsCurrentPage(node, location.pathname));
    }
  }, [location.pathname, node, isTopLevel]);

  const handleClick = () => {
    if (isTopLevel) {
      setOpenFolder(open ? "" : name);
    } else {
      setChildOpen(!childOpen);
    }
  };

  return (
    <div>
      <div
        className={styles.sectionHeader}
        style={{ paddingLeft: `${level * 18}px` }}
        onClick={handleClick}
      >
        <span className={styles.arrow}>{open ? "▼" : "▶"}</span>

        <span>{formatName(name)}</span>
      </div>

      {open && (
        <>
          <div className={styles.links}>
            {node.files.map((file) => (
              <Link
                key={file.slug}
                to={`/docs/${file.slug}`}
                className={
                  location.pathname === `/docs/${file.slug}`
                    ? `${styles.link} ${styles.active}`
                    : styles.link
                }
                style={{
                  paddingLeft: `${(level + 1) * 18}px`,
                }}
              >
                {file.title}
              </Link>
            ))}
          </div>

          {Object.entries(node.folders).map(([folderName, folder]) => (
            <SidebarItem
              key={folderName}
              name={folderName}
              node={folder}
              level={level + 1}
              openFolder={openFolder}
              setOpenFolder={setOpenFolder}
            />
          ))}
        </>
      )}
    </div>
  );
}
