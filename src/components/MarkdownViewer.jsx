import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import { useEffect, useRef } from "react";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter/dist/esm";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  securityLevel: "loose",
  flowchart: {
    htmlLabels: true,
    useMaxWidth: false,
    diagramPadding: 20,
    nodeSpacing: 60,
    rankSpacing: 60,
    wrappingWidth: 200,
  },
});

function MermaidDiagram({ chart }) {
  const ref = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      if (!ref.current) return;

      try {
        const id = `mermaid-${Math.random().toString(36).substring(2, 10)}`;
        const { svg } = await mermaid.render(id, chart);

        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch (error) {
        console.error("Mermaid rendering failed:", error);

        if (!cancelled && ref.current) {
          ref.current.innerHTML = `
            <pre class="mermaid-error">
              ${String(error)}
            </pre>
          `;
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  return <div ref={ref} className="mermaid-diagram" />;
}

function MarkdownViewer({ content }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          code({ inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");

            if (!inline && match?.[1] === "mermaid") {
              return (
                <MermaidDiagram chart={String(children).replace(/\n$/, "")} />
              );
            }

            if (!inline && match) {
              return (
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  {...props}
                >
                  {String(children).replace(/\n$/, "")}
                </SyntaxHighlighter>
              );
            }

            if (!inline) {
              return (
                <pre
                  className="ascii-diagram"
                  style={{
                    fontFamily: "monospace",
                    whiteSpace: "pre",
                    overflowX: "auto",
                    display: "block",
                  }}
                  {...props}
                >
                  {String(children)}
                </pre>
              );
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownViewer;
