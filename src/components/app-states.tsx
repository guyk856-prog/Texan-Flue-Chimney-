import Link from "next/link";
export function LoadingState() {
  return (
    <section
      role="status"
      aria-label="Loading records"
      className="loading-state"
    >
      <span className="sr-only">Loading records…</span>
      <div className="skeleton skeleton-title" />
      <div className="grid">
        {[0, 1, 2].map((i) => (
          <div className="panel" key={i}>
            <div className="skeleton" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line" />
          </div>
        ))}
      </div>
      <div className="panel">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton-line" />
        ))}
      </div>
    </section>
  );
}
export function EmptyState({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <section className="panel empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
      <Link className="empty-action" href={href}>
        {action}
      </Link>
    </section>
  );
}
