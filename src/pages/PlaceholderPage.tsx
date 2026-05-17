import { useLocation } from "react-router-dom";

interface PlaceholderPageProps { title?: string; }

export default function PlaceholderPage({ title }: PlaceholderPageProps) {
  const location = useLocation();
  const pathParts = location.pathname.split("/").filter(Boolean);
  const pageName = title || pathParts[pathParts.length - 1] || "الصفحة";

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>{pageName}</h5>
        <hr />
        <div className="legacy-alert legacy-alert-success">
          هذه الصفحة قيد التطوير وستكون متاحة قريباً.
        </div>
      </div>
    </article>
  );
}
