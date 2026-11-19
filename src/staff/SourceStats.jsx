import React, { useEffect, useMemo, useState } from "react";
import { summarizeSources } from "../../shared/source.js";
import { fetchVisitSources } from "../askLink.js";

const cell = { padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 13 };
const num = { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" };

/** Staff Insights: visits / registrations / questions per QR or poster source. */
export default function SourceStats({ subs, delegates }) {
  const [visits, setVisits] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchVisitSources()
      .then(v => { if (!cancelled) setVisits(v); })
      .catch(e => { if (!cancelled) setErr(e.message || "Could not load visit counts."); });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(
    () => summarizeSources({ visits: visits || {}, delegates, questions: subs }),
    [visits, delegates, subs],
  );

  return (
    <div className="aym-card" style={{ padding: 18, overflowX: "auto" }}>
      {err && <p style={{ margin: "0 0 10px", fontSize: 13, color: "#8B2020" }}>{err}</p>}
      {!rows.length ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>
          {visits || err ? "No tagged visits yet. Share ayushmarg.vercel.app/ask?src=qr to start counting." : "Loading sources…"}
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
          <thead>
            <tr className="aym-eyebrow">
              <th style={{ ...cell, textAlign: "left" }}>Source</th>
              <th style={num}>Visits today</th>
              <th style={num}>Visits</th>
              <th style={num}>Registrations</th>
              <th style={num}>Questions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.source}>
                <td className="aym-mono" style={{ ...cell, color: "var(--forest)", fontWeight: 700 }}>{r.source}</td>
                <td className="aym-mono" style={num}>{r.visitsToday}</td>
                <td className="aym-mono" style={num}>{r.visits}</td>
                <td className="aym-mono" style={num}>{r.registrations}</td>
                <td className="aym-mono" style={num}>{r.questions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
