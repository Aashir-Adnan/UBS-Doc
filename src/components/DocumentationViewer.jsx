import MarkdownViewer from "./MarkdownViewer";
import HtmlViewer from "./HtmlViewer";

export default function DocumentationViewer({ type, content }) {
  switch (type) {
    case "html":
      return <HtmlViewer content={content} />;

    case "md":
    default:
      return <MarkdownViewer content={content} />;
  }
}
