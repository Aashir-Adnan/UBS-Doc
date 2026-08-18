import { useMemo } from "react";
import { generateHeadingId } from "../utils/generateHeadingId";

export default function HtmlViewer({ content }) {
  const processedHtml = useMemo(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");

    // h2 aur h3 headings ko automatic id de do
    doc.querySelectorAll("h2, h3").forEach((heading) => {
      if (!heading.id) {
        heading.id = generateHeadingId(heading.textContent);
      }
    });

    return doc.body.innerHTML;
  }, [content]);

  return (
    <div
      className="html-viewer"
      dangerouslySetInnerHTML={{
        __html: processedHtml,
      }}
    />
  );
}
