import React, { useEffect, useState } from "react";
import { ArrowRightLeft, HeartHandshake, Lightbulb } from "lucide-react";
import "./styles/triage.css";

let rulesPromise = null;
const loadRules = () => (rulesPromise ||= import("../shared/triageRules.js").catch(err => { rulesPromise = null; throw err; }));

/**
 * Gentle, non-blocking nudge under the Ask Desk question box (rules only, runs in the browser).
 * The server re-checks every question; this never stops a student from sending.
 */
export default function AskTriageHint({ theme, subtheme, question, context, onMove }) {
  const [hint, setHint] = useState(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      loadRules()
        .then(({ askDeskHint }) => { if (live) setHint(askDeskHint({ question, context, theme, subtheme })); })
        .catch(() => { if (live) setHint(null); });
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [question, context, theme, subtheme]);

  if (!hint) return null;
  if (hint.kind === "care") {
    return (
      <div className="trg-hint trg-hint--care" role="status" aria-live="polite">
        <HeartHandshake size={18} aria-hidden="true" />
        <p>
          If you are going through a hard time, please don't wait for a mentor's reply — talk to someone now.
          {" "}<b>Tele-MANAS</b> is free and confidential, 24×7: call <b>14416</b> or <b>1-800-891-4416</b>. In an emergency, call <b>112</b>.
          {" "}You can still send your question; a person on the desk reads every one.
        </p>
      </div>
    );
  }
  let body = null;
  if (hint.kind === "wrong-area") {
    body = (
      <>
        This looks like a question about <em>{hint.code} · {hint.theme} → {hint.subtheme}</em>. Move it there so the right mentor sees it?
        <br />
        <button type="button" className="trg-hint-btn" onClick={() => onMove && onMove(hint.theme, hint.subtheme)}>
          <ArrowRightLeft size={12} aria-hidden="true" /> Move it
        </button>
      </>
    );
  } else if (hint.kind === "unfocused") {
    body = <>Add a bit more detail so a mentor can answer well: your stage, the options you are weighing, and the decision you need to make. For example: <em>“{hint.example}”</em></>;
  } else if (hint.kind === "off-topic") {
    body = <>This desk answers Ayurveda and AYUSH career questions — PG, practice, research, jobs, start-ups and working abroad. You can still send this, but a mentor may only be able to point you elsewhere. For example: <em>“{hint.example}”</em></>;
  } else if (hint.kind === "medical") {
    body = <>Mentors here guide careers and can't advise on treatment, medicines or doses — please see a registered physician for that. If this is a career question, say what you want to do professionally.</>;
  } else if (hint.kind === "scope") {
    body = <>The desk may not be able to help with this kind of request. Career questions — PG, practice, research, jobs, working abroad — get the best answers.</>;
  }
  if (!body) return null;
  return (
    <div className="trg-hint" role="status" aria-live="polite">
      <Lightbulb size={16} aria-hidden="true" />
      <p>{body}</p>
    </div>
  );
}
