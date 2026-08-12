import { useEffect, useRef } from "react";
import mermaid from "mermaid";

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
  sequence: {
    useMaxWidth: true,
  },
});

export default function MermaidViewer({ content }) {
  const containerRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function renderDiagram() {
      if (!containerRef.current || !content?.trim()) return;

      try {
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, content);

        if (isMounted && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (error) {
        console.error("Mermaid rendering error:", error);

        if (containerRef.current) {
          containerRef.current.innerHTML = `
            <pre class="mermaid-error">
              Unable to render Mermaid diagram.
            </pre>
          `;
        }
      }
    }

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [content]);

  return <div ref={containerRef} className="mermaid-diagram" />;
}
