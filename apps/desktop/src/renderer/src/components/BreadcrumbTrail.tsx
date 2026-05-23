import type { AppSnapshot } from "@nerve/shared";

export function BreadcrumbTrail({ breadcrumbs, compact = false }: { breadcrumbs: AppSnapshot["breadcrumbs"]; compact?: boolean }) {
  if (breadcrumbs.length === 0) {
    return null;
  }
  return (
    <div className={`breadcrumbs ${compact ? "compact" : ""}`}>
      {breadcrumbs.map((crumb) => (
        <span className={crumb.relevance} key={crumb.id}>
          {compact ? (
            <>
              <strong>{crumb.appName}</strong>
              <em>{crumb.windowTitle || "Untitled"}</em>
            </>
          ) : (
            `${crumb.appName}: "${crumb.windowTitle || "Untitled"}"`
          )}
        </span>
      ))}
    </div>
  );
}
