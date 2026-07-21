export function buildSidebarTree(markdownFiles) {
  const tree = {
    folders: {},
    files: [],
  };

  Object.keys(markdownFiles).forEach((path) => {
    const relativePath = path.replace("../../docs/", "").replace(".md", "");

    const parts = relativePath.split("/");

    let current = tree;

    // Create folders
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];

      if (!current.folders[folderName]) {
        current.folders[folderName] = {
          name: folderName,
          folders: {},
          files: [],
        };
      }

      current = current.folders[folderName];
    }

    const fileName = parts[parts.length - 1];
    const content = markdownFiles[path];

    const match = content.match(/^#\s+(.+)$/m);

    const title = match ? match[1].trim() : fileName.replace(/-/g, " ");

    current.files.push({
      title,
      slug: relativePath,
    });
  });

  return tree;
}
