import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, Pencil, RefreshCw, Search, Upload, X } from "lucide-react";
import { chunkFacultyWorkbook, parseFacultyWorkbook } from "../../shared/facultyWorkbook.js";
import "../styles/wac-signin.css";

function friendlyStatus(status) {
  if (status === 401 || status === 403) return "Your staff session has expired. Sign in to Staff Insights again.";
  if (status === 413) return "That part of the workbook was too large to send. Try again; if it keeps failing, split the workbook in two.";
  if (status === 504 || status === 502) return "The server took too long to answer. Try again in a minute.";
  return `Request failed (${status}).`;
}

async function staffApi(op, payload = {}) {
  let r;
  try {
    r = await fetch("/api/aym-store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ op, ...payload }),
    });
  } catch {
    throw Object.assign(new Error("Could not reach the server. Check your connection and try again."), { status: 0 });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || friendlyStatus(r.status)), { status: r.status, data });
  return data;
}

const range = (p, total) => `${p.from}–${p.to} of ${total}`;

/** Sum the per-part previews into one (whole-file errors come from the local parse). */
function mergePreviews(parts, local) {
  const sum = k => parts.reduce((n, p) => n + (p[k] || 0), 0);
  const counts = {};
  for (const p of parts) for (const [k, v] of Object.entries(p.counts || {})) counts[k] = (counts[k] || 0) + v;
  const first = parts[0] || {};
  const errors = [...new Set([...(local.errors || []), ...parts.flatMap(p => p.errors || [])])];
  const streamId = local.streamId || first.streamId || "";
  return {
    ...first,
    ok: !errors.length && Boolean(streamId),
    streamId,
    stream: local.stream || first.stream,
    rows: sum("rows"), counts, added: sum("added"), updated: sum("updated"),
    errors: errors.slice(0, 50),
    warnings: parts.flatMap(p => p.warnings || []).slice(0, 80),
    warningCount: sum("warningCount"),
    statusChanges: parts.flatMap(p => p.statusChanges || []).slice(0, 50),
  };
}

let xlsxPromise;
const loadXlsx = () => (xlsxPromise || (xlsxPromise = import("xlsx").then(m => m.default || m)));

const REVIEWER_KEY = "aym-faculty-reviewer";
const STATUS_FILTERS = [["", "All"], ["draft", "Draft"], ["approved", "Approved"], ["edited", "Approved with edits"], ["rejected", "Rejected"]];
const STATUS_TONE = { draft: "#8A6D1F", approved: "#1B4332", edited: "#1B4332", rejected: "#9B2C2C" };
const when = t => (t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

function download(filename, base64) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Staff Insights: the DISHA faculty Q&A bank — upload a stream workbook, validate, import, review
 * rows (approve / edit & approve / reject with notes), export the enriched workbook, test matching.
 * Approved rows become DISHA's authoritative position for matching questions; a mentor still
 * approves every reply.
 */
export default function FacultyBankPanel() {
  const [streams, setStreams] = useState([]);
  const [streamId, setStreamId] = useState("clinical-practice");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [open, setOpen] = useState("");
  const [edit, setEdit] = useState({});
  const [reviewer, setReviewer] = useState(() => { try { return localStorage.getItem(REVIEWER_KEY) || ""; } catch { return ""; } });
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState(null);
  const [mode, setMode] = useState("merge");
  const [probe, setProbe] = useState("");
  const [probeOut, setProbeOut] = useState(null);
  const [progress, setProgress] = useState(null);
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([staffApi("facultyStreams"), staffApi("facultyList", { streamId, status, query })]);
      setStreams(s.streams || []);
      setData(l);
      setErr("");
    } catch (e) { setErr(e.message || "Could not load the faculty bank."); }
  }, [streamId, status, query]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { try { localStorage.setItem(REVIEWER_KEY, reviewer); } catch { /* private mode */ } }, [reviewer]);

  async function onFile(e) {
    const f = e.target.files && e.target.files[0];
    setUpload(null); setErr(""); setNote("");
    if (!f) return;
    setBusy(true);
    let sheets;
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      sheets = {};
      for (const n of wb.SheetNames) sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: false });
    } catch {
      setErr("Could not read that file. Upload the faculty stream workbook (.xlsx).");
      setBusy(false);
      return;
    }
    try {
      const local = parseFacultyWorkbook(sheets);
      const parts = chunkFacultyWorkbook(sheets);
      const total = parts[0].total;
      const previews = [];
      for (const p of parts) {
        setProgress({ label: `Checking ${range(p, total)}…`, done: p.from - 1, total });
        previews.push(await staffApi("facultyPreview", { sheets: p.sheets, rowOffset: p.rowOffset, filename: f.name }));
      }
      const pre = mergePreviews(previews, local);
      setUpload({ name: f.name, parts, pre, streamId: pre.streamId });
    } catch (e2) {
      setErr(`Could not check the workbook: ${e2.message}`);
    } finally { setBusy(false); setProgress(null); }
  }

  async function runImport() {
    if (!upload || busy) return;
    setBusy(true); setErr(""); setNote("");
    const { parts } = upload;
    const total = parts[0].total;
    let done = 0;
    let last = null;
    try {
      for (const [i, p] of parts.entries()) {
        setProgress({ label: `Importing ${range(p, total)}…`, done: p.from - 1, total });
        last = await staffApi("facultyImport", {
          sheets: p.sheets, rowOffset: p.rowOffset, part: i + 1, parts: parts.length,
          streamId: upload.streamId, filename: upload.name, mode, reviewer,
        });
        done = p.to;
      }
      const c = last.streamCounts || last.counts;
      setNote(`Imported ${total} faculty rows into ${last.streamId}. The stream now has ${c.total} rows: ${c.approved + c.edited} approved, ${c.draft} draft, ${c.rejected} rejected.`);
      setUpload(null);
      if (inputRef.current) inputRef.current.value = "";
      setStreamId(last.streamId);
    } catch (e) {
      setErr(done
        ? `Rows 1–${done} were imported, then the import stopped: ${e.message} Upload the same workbook again to finish — re-importing is safe and keeps reviews.`
        : `Import failed: ${e.message}`);
    } finally {
      setBusy(false);
      setProgress(null);
      await load();
    }
  }

  async function review(id, nextStatus) {
    if (busy) return;
    const ed = edit[id] || {};
    setBusy(true); setErr(""); setNote("");
    try {
      const r = await staffApi("facultyReview", { id, status: nextStatus, reviewer, notes: ed.notes || "", answer: nextStatus === "edited" ? ed.answer || "" : "" });
      setNote(`${id}: ${r.entry.statusLabel}.`);
      setEdit(m => ({ ...m, [id]: undefined }));
      await load();
    } catch (e) { setErr(e.message || "Could not save the review."); }
    finally { setBusy(false); }
  }

  async function exportBook() {
    setBusy(true); setErr("");
    try {
      const r = await staffApi("facultyExport", { streamId });
      download(r.filename, r.base64);
    } catch (e) { setErr(e.message || "Export failed."); }
    finally { setBusy(false); }
  }

  async function testMatch(e) {
    e.preventDefault();
    if (!probe.trim()) return;
    try { setProbeOut((await staffApi("facultyMatchTest", { question: probe.trim(), streamId })).matches || []); }
    catch (e2) { setErr(e2.message || "Match test failed."); }
  }

  const counts = (data && data.counts) || {};
  const entries = (data && data.entries) || [];
  const pre = upload && upload.pre;
  const activeStreams = streams.filter(s => (s.counts && s.counts.total) || s.lastUpload);

  return (
    <div className="aym-card wac-staff">
      {err && <div className="wac-alert wac-alert--bad">{err}</div>}
      {note && <div className="wac-alert" style={{ background: "#DDEDE3", color: "#1B4332" }} role="status">{note}</div>}
      {progress && (
        <div role="status" aria-live="polite" style={{ margin: "8px 0", fontSize: 13 }}>
          <div>{progress.label}</div>
          <progress value={progress.done} max={progress.total || 1} style={{ width: "100%" }} />
        </div>
      )}

      <div className="wac-staff-kpis">
        <div className="wac-staff-kpi"><b>{counts.total ?? "…"}</b><span>Faculty rows</span></div>
        <div className="wac-staff-kpi"><b>{counts.total == null ? "…" : (counts.approved || 0) + (counts.edited || 0)}</b><span>Approved (authoritative)</span></div>
        <div className="wac-staff-kpi"><b>{counts.draft ?? "…"}</b><span>Draft – pending validation</span></div>
        <div className="wac-staff-kpi"><b>{counts.rejected ?? "…"}</b><span>Rejected (never used)</span></div>
      </div>

      {activeStreams.length > 0 && (
        <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse", margin: "6px 0 10px" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#667085" }}>
              <th>Stream</th><th>Rows</th><th>Approved</th><th>With edits</th><th>Draft</th><th>Rejected</th><th>Last upload</th>
            </tr>
          </thead>
          <tbody>
            {activeStreams.map(s => (
              <tr key={s.id} style={{ borderTop: "1px solid #E5E7EB" }}>
                <td>{s.name}</td>
                <td>{s.counts.total}</td>
                <td>{s.counts.approved}</td>
                <td>{s.counts.edited}</td>
                <td>{s.counts.draft}</td>
                <td>{s.counts.rejected}</td>
                <td>{s.lastUpload ? `${when(s.lastUpload.at)}${s.lastUpload.by ? ` · ${s.lastUpload.by}` : ""}${s.lastUpload.file ? ` · ${s.lastUpload.file}` : ""}` : "Bundled with the app"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="wac-staff-row" style={{ flexWrap: "wrap", gap: 8 }}>
        <label className="aym-visually-hidden" htmlFor="faculty-stream">Stream</label>
        <select id="faculty-stream" value={streamId} onChange={e => setStreamId(e.target.value)} className="aym-input" style={{ maxWidth: 280 }}>
          {(streams.length ? streams : [{ id: "clinical-practice", name: "Clinical Practice", counts: {} }]).map(s => (
            <option key={s.id} value={s.id}>{s.name}{s.counts && s.counts.total ? ` · ${s.counts.total}` : ""}</option>
          ))}
        </select>
        <label className="aym-btn aym-btn-primary aym-btn-sm" style={{ cursor: "pointer" }}>
          <Upload size={14} aria-hidden="true" /> Upload stream workbook
          <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={onFile} disabled={busy} className="aym-visually-hidden" title="The full enriched workbook is fine — it is sent in parts of 100 rows." />
        </label>
        <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" onClick={exportBook} disabled={busy}><Download size={13} /> Export workbook</button>
        <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
        <input className="aym-input" style={{ maxWidth: 200 }} placeholder="Your name (reviewer)" value={reviewer} onChange={e => setReviewer(e.target.value)} aria-label="Reviewer name" />
      </div>

      {pre && (
        <div style={{ margin: "10px 0", padding: 10, border: "1px solid #D0D5DD", borderRadius: 8 }}>
          <div className="aym-eyebrow">{upload.name} · sheet “{pre.sheet}” · {pre.rows} rows · stream {pre.stream || "?"} → {pre.streamId || "unknown"}</div>
          <div style={{ fontSize: 13, margin: "6px 0" }}>
            {pre.added} new, {pre.updated} already in the bank · {pre.counts.approved + pre.counts.edited} approved, {pre.counts.draft} draft, {pre.counts.rejected} rejected
            {pre.statusChanges.length ? ` · ${pre.statusChanges.length} status change(s)` : ""} · {pre.sources} official sources
          </div>
          {pre.errors.map(x => <div key={x} className="wac-alert wac-alert--bad" style={{ margin: "4px 0" }}>{x}</div>)}
          {pre.warningCount > 0 && (
            <details style={{ fontSize: 12.5 }}>
              <summary>{pre.warningCount} warning(s)</summary>
              <ul>{pre.warnings.map(w => <li key={w}>{w}</li>)}</ul>
            </details>
          )}
          {!pre.knownStream && (
            <div style={{ margin: "6px 0" }}>
              <label style={{ fontSize: 13 }}>Import as stream:{" "}
                <select value={upload.streamId || ""} onChange={e => setUpload(u => ({ ...u, streamId: e.target.value }))}>
                  <option value="">Choose…</option>
                  {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            </div>
          )}
          <div className="wac-staff-row" style={{ gap: 8, marginTop: 6 }}>
            <select value={mode} onChange={e => setMode(e.target.value)} aria-label="Who wins on conflicts">
              <option value="merge">Keep reviews unless the workbook sets a status</option>
              <option value="workbook-wins">Workbook review columns win (even Draft)</option>
            </select>
            <button type="button" className="aym-btn aym-btn-primary aym-btn-sm" disabled={busy || pre.errors.length > 0 || !upload.streamId} onClick={runImport}>
              Import {pre.rows} rows
            </button>
            <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" onClick={() => setUpload(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="wac-staff-row" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {STATUS_FILTERS.map(([v, label]) => (
          <button key={v || "all"} type="button" className={`aym-btn aym-btn-sm ${status === v ? "aym-btn-primary" : "aym-btn-ghost"}`} onClick={() => setStatus(v)}>
            {label}{v && counts[v] != null ? ` · ${counts[v]}` : ""}
          </button>
        ))}
        <input className="aym-input" style={{ maxWidth: 220 }} placeholder="Find ID or words" value={query} onChange={e => setQuery(e.target.value)} aria-label="Find faculty rows" />
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: "8px 0" }}>
        {entries.map(e => {
          const ed = edit[e.id] || {};
          const isOpen = open === e.id;
          return (
            <li key={e.id} style={{ borderTop: "1px solid #E5E7EB", padding: "8px 0" }}>
              <button type="button" onClick={() => setOpen(isOpen ? "" : e.id)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }} aria-expanded={isOpen}>
                <b>{e.id}</b>{" "}
                <span style={{ color: STATUS_TONE[e.status], fontSize: 12.5, fontWeight: 600 }}>{e.statusLabel}</span>
                {e.priority === "high" && <span style={{ fontSize: 12, marginLeft: 6 }}>· high priority</span>}
                {e.stale && <span style={{ fontSize: 12, marginLeft: 6, color: "#9B2C2C" }}>· review again (older than 180 days)</span>}
                <div style={{ fontSize: 14 }}>{e.question}</div>
                <div style={{ fontSize: 12, color: "#667085" }}>{e.subcategory} · {e.audience}{e.paraphrases ? ` · ${e.paraphrases} paraphrases` : ""}{e.confidence != null ? ` · confidence ${e.confidence}` : ""}{e.flags.length ? ` · ${e.flags.join(", ")}` : ""}</div>
              </button>
              {isOpen && (
                <div style={{ fontSize: 13.5, marginTop: 6 }}>
                  <div><b>Faculty draft:</b> {e.draftAnswer}</div>
                  {e.enrichedAnswer && <div style={{ marginTop: 6 }}><b>DISHA enriched answer:</b> {e.enrichedAnswer}</div>}
                  {e.approvedAnswer && e.approvedAnswer !== e.enrichedAnswer && e.approvedAnswer !== e.draftAnswer && <div style={{ marginTop: 6 }}><b>Approved text:</b> {e.approvedAnswer}</div>}
                  {e.actions.length > 0 && <ol style={{ margin: "6px 0" }}>{e.actions.map(a => <li key={a}>{a}</li>)}</ol>}
                  {e.mistake && <div><b>Mistake to avoid:</b> {e.mistake}</div>}
                  {e.verifyLocally && <div><b>Verify locally:</b> {e.verifyLocally}</div>}
                  <div style={{ marginTop: 4 }}>{[...new Set([...e.sources, ...e.citations])].map(u => <div key={u}><a href={u} target="_blank" rel="noreferrer noopener">{u}</a></div>)}</div>
                  {(e.reviewer || e.reviewerNotes) && <div style={{ marginTop: 4, color: "#475467" }}>Reviewer: {e.reviewer || "—"}{e.reviewedAt ? ` · ${when(e.reviewedAt)}` : ""}{e.reviewerNotes ? ` · ${e.reviewerNotes}` : ""}</div>}
                  <textarea className="aym-input" rows={2} style={{ width: "100%", marginTop: 8 }} placeholder="Reviewer notes (corrections, exact citations)" value={ed.notes ?? ""}
                    onChange={x => setEdit(m => ({ ...m, [e.id]: { ...ed, notes: x.target.value } }))} />
                  {ed.editing && (
                    <textarea className="aym-input" rows={6} style={{ width: "100%", marginTop: 6 }} value={ed.answer ?? (e.approvedAnswer || e.enrichedAnswer || e.draftAnswer)}
                      onChange={x => setEdit(m => ({ ...m, [e.id]: { ...ed, answer: x.target.value } }))} aria-label="Edited answer" />
                  )}
                  <div className="wac-staff-row" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {!ed.editing && <button type="button" className="aym-btn aym-btn-primary aym-btn-sm" disabled={busy || !reviewer.trim()} onClick={() => review(e.id, "approved")}><Check size={13} /> Approve</button>}
                    {!ed.editing && <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" onClick={() => setEdit(m => ({ ...m, [e.id]: { ...ed, editing: true } }))}><Pencil size={13} /> Edit answer</button>}
                    {ed.editing && <button type="button" className="aym-btn aym-btn-primary aym-btn-sm" disabled={busy || !reviewer.trim()} onClick={() => review(e.id, "edited")}><Check size={13} /> Save edit &amp; approve</button>}
                    <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" disabled={busy} onClick={() => review(e.id, "rejected")}><X size={13} /> Reject</button>
                    {e.status !== "draft" && <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" disabled={busy} onClick={() => review(e.id, "draft")}>Back to draft</button>}
                    {!reviewer.trim() && <span style={{ fontSize: 12, color: "#667085" }}>Add your name above to approve.</span>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {data && !entries.length && <li style={{ color: "#667085", padding: 8 }}>No faculty rows match.</li>}
      </ul>

      <form onSubmit={testMatch} className="wac-staff-row" style={{ gap: 6, marginTop: 6 }}>
        <input className="aym-input" placeholder="Try a student question (any language)" value={probe} onChange={e => setProbe(e.target.value)} aria-label="Test question" />
        <button type="submit" className="aym-btn aym-btn-ghost aym-btn-sm"><Search size={13} /> Test match</button>
      </form>
      {probeOut && (
        <ul style={{ fontSize: 13, margin: "6px 0" }}>
          {probeOut.length ? probeOut.map(m => (
            <li key={m.id}><b>{m.id}</b> {m.score} · {m.decision === "weak" ? "not used (below threshold)" : m.decision === "reuse" ? "used — reuse with light personalisation" : "used as FACULTY_ANSWER"} · {m.status} — {m.question}</li>
          )) : <li>No faculty row matches this question.</li>}
        </ul>
      )}
    </div>
  );
}
