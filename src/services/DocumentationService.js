const documentationFiles = import.meta.glob("../../docs/**/*.{md,html}", {
  query: "?raw",
  import: "default",
});

export async function getDocument(slug) {
  const mdFile = documentationFiles[`../../docs/${slug}.md`];
  const htmlFile = documentationFiles[`../../docs/${slug}.html`];

  const file = mdFile || htmlFile;

  if (!file) {
    return null;
  }

  const type = mdFile ? "md" : "html";

  const content = await file();

  return {
    type,
    content,
  };
}
