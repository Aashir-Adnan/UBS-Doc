import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";

const markdownFiles = import.meta.glob("../../docs/**/*.md", {
  query: "?raw",
  import: "default",
});

function DynamicMarkdown() {
  const { "*": slug } = useParams();

  const [content, setContent] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function loadMarkdown() {
      setNotFound(false);

      const file = markdownFiles[`../../docs/${slug}.md`];

      if (!file) {
        setNotFound(true);
        return;
      }

      const markdown = await file();
      setContent(markdown);
    }

    loadMarkdown();
  }, [slug]);

  if (notFound) {
    return <h1>404 - Documentation Not Found</h1>;
  }

  if (!content) {
    return <p>Loading...</p>;
  }

  return (
    <div
      style={{
        maxWidth: "1000px",
        margin: "40px auto",
        padding: "20px",
      }}
    >
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

export default DynamicMarkdown;
