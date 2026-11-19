import React from "react";
import { Sparkles } from "lucide-react";
import { DISHA_DRAFTS } from "../content/glossary.js";
import "../styles/ai-review.css";

const LABEL = {
  pending: "DISHA draft ready",
  blocked: "DISHA: mentor only",
  "to-mentor": "DISHA: sent to mentor",
  rejected: "DISHA draft rejected",
  quotaDeferred: "DISHA: waiting for AI / quota",
  aiPending: "DISHA: waiting for AI",
  awaiting_ai: "DISHA: waiting for AI / quota",
};

/** Small chip for briefing-board rows and curation cards. Renders nothing without a draft. */
export default function AiDraftBadge({ entry, onOpen }) {
  if (!entry || !LABEL[entry.status]) return null;
  const limited = entry.status === "pending" && entry.mode === "mentor-assist";
  const queued = entry.status === "quotaDeferred" || entry.status === "aiPending" || entry.status === "awaiting_ai";
  const tone = limited ? "limited" : queued ? "warn" : entry.status === "pending" ? (entry.risk === "high" ? "warn" : "ready") : "muted";
  const text = limited ? "DISHA: limited sources" : LABEL[entry.status];
  const body = (
    <>
      <Sparkles size={11} aria-hidden="true" />
      <span>{text}</span>
    </>
  );
  if (!onOpen) return <span className={`air-badge air-badge--${tone}`}>{body}</span>;
  return (
    <button
      type="button"
      className={`air-badge air-badge--${tone} air-badge--btn`}
      onClick={e => { e.stopPropagation(); onOpen(); }}
      title={`Open in ${DISHA_DRAFTS}`}
    >
      {body}
    </button>
  );
}
