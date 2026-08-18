import { Link, useLocation } from "react-router-dom";
import { Home, ChevronRight } from "lucide-react";

const formatName = (name) =>
  decodeURIComponent(name)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const Breadcrumb = () => {
  const location = useLocation();

  const pathnames = location.pathname
    .split("/")
    .filter(Boolean)
    .filter((item) => item !== "docs");

  return (
    <nav className="breadcrumb">
      <Link to="/" className="breadcrumb-home">
        <Home size={16} />
      </Link>

      {pathnames.map((value, index) => {
        const to = "/" + pathnames.slice(0, index + 1).join("/");
        const isLast = index === pathnames.length - 1;

        return (
          <span key={to} className="breadcrumb-item">
            <ChevronRight size={14} className="breadcrumb-separator" />

            <span className={isLast ? "breadcrumb-current" : "breadcrumb-text"}>
              {formatName(value)}
            </span>
          </span>
        );
      })}
    </nav>
  );
};

export default Breadcrumb;
