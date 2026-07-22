import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import DocsSidebar from "./DocsSidebar";
import DocumentationViewer from "./DocumentationViewer";
import { generateHeadingId } from "../utils/generateHeadingId";
import {
  getDocument,
  getRepositories,
  getSidebar,
} from "../services/DocumentationService";
import "./docsLayout.css";
import "./markdown.css";
import Breadcrumb from "./Breadcrumb";

function DynamicMarkdown() {
  const { "*": slug } = useParams();

  const [content, setContent] = useState(null);
  const [headings, setHeadings] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [docType, setDocType] = useState("md");
  const [repositories, setRepositories] = useState([]);
  const [selectedRepoId, setSelectedRepoId] = useState(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const repoFromUrl = Number(searchParams.get("repo"));

  const handleRepositoryChange = async (repoId) => {
    const docs = await getSidebar(repoId);

    if (!docs.length) {
      alert("No documentation found for this repository.");

      setContent(null);
      setHeadings([]);
      setSelectedRepoId(null);
      setNotFound(false);

      navigate("/docs");
      return;
    }

    setSelectedRepoId(repoId);
    navigate(`/docs/${docs[0].slug}?repo=${repoId}`);
  };

  useEffect(() => {
    async function loadMarkdown() {
      if (!selectedRepoId || !slug) {
        setContent(null);
        setHeadings([]);
        return;
      }

      setNotFound(false);
      setContent(null);

      const document = await getDocument(selectedRepoId, slug);

      if (!document) {
        setNotFound(true);
        return;
      }

      const { type, content: fileContent } = document;

      const cleanedContent =
        type === "md"
          ? fileContent.replace(/^---[\s\S]*?---\n?/, "")
          : fileContent;

      setContent(cleanedContent);
      setDocType(type);

      let extractedHeadings = [];

      if (type === "md") {
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
        const parser = new DOMParser();
        const doc = parser.parseFromString(cleanedContent, "text/html");

        extractedHeadings = Array.from(doc.querySelectorAll("h2, h3")).map(
          (heading) => {
            const text = heading.textContent.trim();

            return {
              text,
              id: heading.id || generateHeadingId(text),
            };
          },
        );
      }

      setHeadings(extractedHeadings);
    }

    loadMarkdown();
  }, [slug, selectedRepoId]);

  useEffect(() => {
    async function loadRepositories() {
      const repos = await getRepositories();

      setRepositories(repos);

      if (repoFromUrl) {
        setSelectedRepoId(repoFromUrl);
      }
    }

    loadRepositories();
  }, [repoFromUrl]);

  if (notFound) {
    return <h1>404 - Documentation Not Found</h1>;
  }

  // ── Repository selection (empty) state ────────────────────────────────
  // Redesigned per request: a centered, card-based picker instead of the
  // old plain .docs-layout/.docs-content wrapper. Same state, same
  // handleRepositoryChange handler, same <select> options — only the
  // markup and class names changed, so none of the selection logic,
  // API calls, or navigation behavior are affected.
  if (!selectedRepoId) {
    return (
      <div className="repo-select-page">
        <div className="repo-select-card">
          <span className="repo-select-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21z" />
              <path d="M4 5.5v15.5" />
            </svg>
          </span>

          <h1 className="repo-select-title">Select a Repository</h1>

          <p className="repo-select-description">
            Choose a repository to browse its documentation.
            <br />
            Select one below to get started.
          </p>

          <div className="repo-select-field">
            <label htmlFor="repository-select">Repository</label>

            <select
              id="repository-select"
              className="repo-select-input"
              value={selectedRepoId ?? ""}
              onChange={(e) => handleRepositoryChange(Number(e.target.value))}
            >
              <option value="">Select Repository</option>

              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  }

  if (!content) {
    return <p>Loading...</p>;
  }

  return (
    <div className="docs-layout">
      {/* Repository Switcher */}
      <div className="docs-repository-switcher">
        <label htmlFor="repository-select">Repository:</label>

        <select
          id="repository-select"
          value={selectedRepoId ?? ""}
          onChange={(e) => handleRepositoryChange(Number(e.target.value))}
        >
          <option value="">Select Repository</option>

          {repositories.map((repo) => (
            <option key={repo.id} value={repo.id}>
              {repo.name}
            </option>
          ))}
        </select>
      </div>

      {/* Documentation Sidebar */}
      <div className="docs-sidebar">
        <DocsSidebar repoId={selectedRepoId} />
      </div>

      {/* Main Content */}
      <main className="docs-content">
        <Breadcrumb />

        <div className="markdown-body">
          <DocumentationViewer type={docType} content={content} />
        </div>
      </main>

      {/* TOC */}
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
