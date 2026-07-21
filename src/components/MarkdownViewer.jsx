import ReactMarkdown from "react-markdown";

function MarkdownViewer({ content }) {
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

export default MarkdownViewer;
