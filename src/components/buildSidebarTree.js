export function buildSidebarTree(docs = []) {
  const tree = {
    folders: {},
    files: [],
  };

  docs.forEach((doc) => {
    const parts = doc.slug.split("/");

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

    current.files.push({
      title: doc.title,
      slug: doc.slug,
    });
  });

  return tree;
}
