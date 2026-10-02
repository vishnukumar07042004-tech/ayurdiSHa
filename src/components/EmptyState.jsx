import React from "react";
import { SearchX } from "lucide-react";
import Button from "./ui/Button.jsx";

export default function EmptyState({
  title = "No results found",
  message = "Try clearing filters or adjusting your search term.",
  actionLabel,
  onAction,
}) {
  return (
    <div className="ui-empty aym-empty-state" role="status" aria-live="polite">
      <span className="ui-icon-badge">
        <SearchX size={24} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <h3 className="ui-title">{title}</h3>
      <p className="ui-body">{message}</p>
      {onAction && actionLabel && (
        <div className="ui-btn-row">
          <Button onClick={onAction}>{actionLabel}</Button>
        </div>
      )}
    </div>
  );
}
