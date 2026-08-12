import MarkdownViewer from "./MarkdownViewer";
import HtmlViewer from "./HtmlViewer";
import MermaidViewer from "./MermaidViewer";

export default function DocumentationViewer({ type, content }) {
  switch (type) {
    case "html":
      return <HtmlViewer content={content} />;

    case "mmd":
      return <MermaidViewer content={content} />;

    case "md":
    default:
      return <MarkdownViewer content={content} />;
  }
}
