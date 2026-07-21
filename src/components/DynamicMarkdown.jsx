import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DocsSidebar from "./DocsSidebar";
import DocumentationViewer from "./DocumentationViewer";
import { generateHeadingId } from "../utils/generateHeadingId";
import { getDocument } from "../services/DocumentationService";
import "./docsLayout.css";
import "./markdown.css";
import Breadcrumb from "./Breadcrumb";

function DynamicMarkdown() {
  const { "*": slug } = useParams();

  const [content, setContent] = useState(null);
  const [headings, setHeadings] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [docType, setDocType] = useState("md");

  useEffect(() => {
    async function loadMarkdown() {
      setNotFound(false);

      // const document = await getDocument(slug);
      const document = await getDocument(9, slug);

      if (!document) {
        setNotFound(true);
        return;
      }

      const { type, content: fileContent } = document;

      // Remove frontmatter (Markdown only)
      const cleanedContent =
        type === "md"
          ? fileContent.replace(/^---[\s\S]*?---\n?/, "")
          : fileContent;

      setContent(cleanedContent);
      setDocType(type);

      let extractedHeadings = [];

      if (type === "md") {
        // Markdown headings
        extractedHeadings = cleanedContent
          .split("\n")
          .filter((line) => line.startsWith("## ") || line.startsWith("### "))
          .map((line) => {
            const text = line.replace(/^#+\s/, "");

            return {
              text,
              id: generateHeadingId(text),
            };
          });
      } else {
        // HTML headings
        const parser = new DOMParser();
        const doc = parser.parseFromString(cleanedContent, "text/html");

        extractedHeadings = Array.from(doc.querySelectorAll("h2, h3")).map(
          (heading) => {
            const text = heading.textContent.trim();

            let id = heading.id;

            if (!id) {
              id = generateHeadingId(text);
            }

            return {
              text,
              id,
            };
          },
        );
      }

      setHeadings(extractedHeadings);
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
    <div className="docs-layout">
      <div className="docs-sidebar">
        <DocsSidebar />
      </div>

      <main className="docs-content">
        <Breadcrumb />
        <div className="markdown-body">
          <DocumentationViewer type={docType} content={content} />
        </div>
      </main>

      <aside className="docs-toc">
        <h3>Table of Contents</h3>

        {headings.map((heading) => (
          <div key={heading.id}>
            <a href={`#${heading.id}`}>{heading.text}</a>
          </div>
        ))}
      </aside>
    </div>
  );
}

export default DynamicMarkdown;
