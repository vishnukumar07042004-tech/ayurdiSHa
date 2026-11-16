import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { setPageMeta, META_DESCRIPTION } from "../siteMeta.js";
import { PROMISE_SHORT } from "../../shared/productConfig.js";

/**
 * Public answer bank — approved / published composites only.
 * Uses the same public clusters slice as the theme stage (no PII).
 */
export default function AnswerBankPage() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPageMeta({
      title: "Answer bank · AYURDISHA",
      description: META_DESCRIPTION,
      path: "/answers",
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        let list = [];
        const getRes = await fetch("/api/aym-store?op=publicClusters", { method: "GET" });
        if (getRes.ok) {
          const data = await getRes.json().catch(() => ({}));
          list = Array.isArray(data.value) ? data.value : Array.isArray(data.clusters) ? data.clusters : [];
        } else {
          const res = await fetch("/api/aym-store", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ op: "get", key: "aym:clusters" }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Could not load the answer bank.");
          list = Array.isArray(data.value) ? data.value : Array.isArray(data.clusters) ? data.clusters : [];
        }
        const published = list.filter((c) => {
          const st = String(c.status || "").toLowerCase();
          return st.includes("publish") || st === "answered" || st === "on the stage" || c.published === true;
        });
        if (!cancelled) setItems(published);
      } catch (e) {
        if (!cancelled) setErr(e.message || "Could not load the answer bank.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="aym-legal" id="main">
      <nav className="aym-crumbs" aria-label="Breadcrumb">
        <ol>
          <li><Link to="/">Home</Link></li>
          <li aria-current="page">Answer bank</li>
        </ol>
      </nav>
      <p className="aym-eyebrow">AYURDISHA · Meet the Mentors · WAC 2026</p>
      <h1 className="aym-display">Answer bank</h1>
      <p className="ui-body">{PROMISE_SHORT}</p>
      <p className="ui-body">
        Only desk-approved composites appear here. Nothing is auto-published. Items without
        publication consent or with unresolved safety flags stay off this page.
      </p>
      {loading && <p className="ui-body">Loading published answers…</p>}
      {err && <p className="ui-body" role="alert">{err}</p>}
      {!loading && !err && items.length === 0 && (
        <p className="ui-body">
          No published composites yet. When the desk posts them, they will appear here and on the{" "}
          <Link to="/#board">open theme stage</Link>.
        </p>
      )}
      <ul className="ui-faq-list" style={{ marginTop: 24 }}>
        {items.map((c) => (
          <li key={c.id || c.theme + c.subtheme} className="ui-faq-item" style={{ listStyle: "none", marginBottom: 16 }}>
            <div className="aym-eyebrow">{c.track || c.theme}{c.subtheme ? ` · ${c.subtheme}` : ""}</div>
            <h2 className="ui-faq-q" style={{ fontSize: 18 }}>{c.representative || c.composite?.slice?.(0, 120) || "Published composite"}</h2>
            {c.answer || c.mergedAnswer || c.composite ? (
              <p className="ui-faq-a">{String(c.answer || c.mergedAnswer || c.composite).slice(0, 1200)}</p>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="ui-form-footnote" style={{ marginTop: 32 }}>
        Looking for your own ticket? <Link to="/#track">Track my answer</Link>.
      </p>
    </main>
  );
}
