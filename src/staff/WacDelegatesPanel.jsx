import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import {
  WAC_FIELDS, detectColumns, rowsFromGrid, validateDelegateRows, cleanDelegateRow, maskEmail, maskPhone,
} from "../../shared/wacId.js";
import "../styles/wac-signin.css";

const CHUNK = 500;

async function staffApi(op, payload = {}) {
  const r = await fetch("/api/aym-store", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ op, ...payload }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Request failed (${r.status}).`), { status: r.status, data });
  return data;
}

let xlsxPromise;
const loadXlsx = () => (xlsxPromise || (xlsxPromise = import("xlsx").then(m => m.default || m)));

const when = t => (t ? new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

/** Staff Insights: upload WAC's delegate list (CSV / XLSX) for "Sign in with WAC ID". */
export default function WacDelegatesPanel() {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);           // { name, grid }
  const [mapping, setMapping] = useState({});
  const [showContacts, setShowContacts] = useState(false);
  const [progress, setProgress] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const inputRef = useRef(null);

  const refresh = useCallback(async () => {
    try { setStats(await staffApi("wacDelegatesStats")); setErr(""); }
    catch (e) { setErr(e.message || "Could not load WAC delegate stats."); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function onFile(e) {
    const f = e.target.files && e.target.files[0];
    setNote(""); setErr(""); setFile(null);
    if (!f) return;
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
      if (!grid.length) { setErr("That file has no rows."); return; }
      setFile({ name: f.name, grid });
      setMapping(detectColumns(grid[0]));
    } catch {
      setErr("Could not read that file. Upload the CSV or XLSX export from WAC.");
    }
  }

  const headers = file ? (file.grid[0] || []).map((h, i) => String(h || `Column ${i + 1}`)) : [];
  const checked = useMemo(() => {
    if (!file) return null;
    const rows = rowsFromGrid(file.grid, mapping);
    return { rows, ...validateDelegateRows(rows, { pattern: stats && stats.pattern }) };
  }, [file, mapping, stats]);
  const missingRequired = WAC_FIELDS.filter(f => f.required && mapping[f.field] == null);

  async function runImport() {
    if (!checked || !checked.valid.length || busy) return;
    setBusy(true); setErr(""); setNote("");
    const batchId = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const total = checked.valid.length;
    let created = 0;
    let updated = 0;
    try {
      for (let i = 0; i < total; i += CHUNK) {
        setProgress(`Importing ${Math.min(i + CHUNK, total)} of ${total}…`);
        const r = await staffApi("wacDelegatesImport", { rows: checked.valid.slice(i, i + CHUNK), batchId, filename: file.name });
        created += r.created || 0;
        updated += r.updated || 0;
      }
      setNote(`Imported ${total} delegates (${created} new, ${updated} updated). ${checked.problems.length ? `${checked.problems.length} rows skipped.` : ""}`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await refresh();
    } catch (e) {
      setErr(`${e.message || "Import failed."} ${created + updated ? `${created + updated} rows were saved before it stopped — upload the same file again to finish (imports are safe to repeat).` : ""}`);
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  async function search(e) {
    e.preventDefault();
    if (!query.trim()) { setMatches(null); return; }
    try { setMatches((await staffApi("wacDelegatesStats", { query: query.trim() })).matches || []); }
    catch (e2) { setErr(e2.message || "Search failed."); }
  }

  async function clearUnlinked() {
    if (!stats || confirmText.trim() !== stats.clearPhrase || busy) return;
    setBusy(true); setErr(""); setNote("");
    try {
      const r = await staffApi("wacDelegatesClear", { confirm: confirmText.trim() });
      setNote(`Removed ${r.removed} delegates who had not signed in. ${r.linked} linked delegates kept.`);
      setConfirmText("");
      await refresh();
    } catch (e) { setErr(e.message || "Could not clear the list."); }
    finally { setBusy(false); }
  }

  const show = (v, mask) => (showContacts ? v : mask(v));
  const preview = checked ? checked.rows.slice(0, 5).map(cleanDelegateRow) : [];

  return (
    <div className="aym-card wac-staff">
      {err && <div className="wac-alert wac-alert--bad">{err}</div>}
      {note && <div className="wac-alert" style={{ background: "#DDEDE3", color: "#1B4332" }} role="status">{note}</div>}

      <div className="wac-staff-kpis">
        <div className="wac-staff-kpi"><b>{stats ? stats.total : "…"}</b><span>WAC delegates on file</span></div>
        <div className="wac-staff-kpi"><b>{stats ? stats.linked : "…"}</b><span>Signed in (linked)</span></div>
        <div className="wac-staff-kpi"><b>{stats && stats.lastImport ? when(stats.lastImport.at) : "—"}</b><span>Last import{stats && stats.lastImport ? ` · ${stats.lastImport.imported} rows` : ""}</span></div>
        <div className="wac-staff-kpi">
          <b style={{ fontSize: 15 }}>{!stats ? "…" : stats.off ? "Switched off" : stats.enabled ? "Live" : "Hidden"}</b>
          <span>Sign-in option · {stats ? (stats.mode === "api" ? `WAC API${stats.apiConfigured ? "" : " (not configured)"}` : "uploaded list") : ""}</span>
        </div>
      </div>

      <div className="wac-staff-row">
        <label className="aym-btn aym-btn-primary aym-btn-sm" style={{ cursor: "pointer" }}>
          <Upload size={14} aria-hidden="true" /> Choose CSV / XLSX
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={onFile} className="aym-visually-hidden" />
        </label>
        <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" onClick={refresh}><RefreshCw size={13} /> Refresh</button>
        <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" onClick={() => setShowContacts(v => !v)}>
          {showContacts ? <EyeOff size={13} /> : <Eye size={13} />}{showContacts ? "Hide contacts" : "Show contacts"}
        </button>
      </div>

      {file && checked && (
        <div style={{ marginTop: 6 }}>
          <div className="aym-eyebrow">{file.name} · {checked.rows.length} rows</div>
          <div className="wac-staff-map">
            {WAC_FIELDS.map(f => (
              <label key={f.field}>
                {f.label}{f.required ? " *" : ""}
                <select className="aym-input" value={mapping[f.field] ?? ""} onChange={e => setMapping(m => ({ ...m, [f.field]: e.target.value === "" ? undefined : Number(e.target.value) }))}>
                  <option value="">— not in file —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Registration ID</th><th>Name</th><th>Email</th><th>Mobile</th><th>Institution</th><th>Category</th><th>Country / State</th><th>Attendance</th></tr></thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td className="aym-mono">{r.wacId}</td><td>{r.name}</td><td>{show(r.email, maskEmail)}</td><td>{show(r.phone, maskPhone)}</td>
                    <td>{r.institution}</td><td>{r.category}</td><td>{[r.country, r.state].filter(Boolean).join(" / ")}</td><td>{r.attendance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 13, margin: "10px 0 0" }}>
            <span className="wac-staff-ok">{checked.valid.length} ready to import</span>
            {checked.problems.length > 0 && ` · ${checked.problems.length} will be skipped${checked.duplicates ? ` (${checked.duplicates} duplicate IDs)` : ""}`}
          </p>
          {missingRequired.length > 0 && (
            <p className="wac-staff-problems" style={{ listStyle: "none", paddingLeft: 0 }}>
              Map {missingRequired.map(f => f.label).join(" and ")} before importing.
            </p>
          )}
          {checked.problems.length > 0 && (
            <ul className="wac-staff-problems">
              {checked.problems.slice(0, 8).map(p => <li key={p.line}>Line {p.line}: {p.issue}</li>)}
              {checked.problems.length > 8 && <li>…and {checked.problems.length - 8} more</li>}
            </ul>
          )}
          <div className="wac-staff-row">
            <button type="button" className="aym-btn aym-btn-primary aym-btn-sm" disabled={busy || !checked.valid.length || missingRequired.length > 0} onClick={runImport}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {busy ? progress || "Importing…" : `Import ${checked.valid.length} delegates`}
            </button>
            <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" disabled={busy} onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }}>Cancel</button>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
            Imports update existing rows by registration ID and never change AYURDISHA profiles or who is linked.
          </p>
        </div>
      )}

      <form className="wac-staff-row" onSubmit={search} style={{ marginTop: 16 }}>
        <input className="aym-input" style={{ flex: "1 1 220px" }} placeholder="Find a delegate by WAC ID or email" value={query} onChange={e => setQuery(e.target.value)} aria-label="Find a delegate by WAC ID or email" />
        <button type="submit" className="aym-btn aym-btn-ghost aym-btn-sm"><Search size={13} /> Find</button>
      </form>
      {matches && (
        matches.length ? (
          <table>
            <thead><tr><th>Registration ID</th><th>Name</th><th>Email</th><th>Mobile</th><th>Status</th></tr></thead>
            <tbody>
              {matches.map(m => (
                <tr key={m.wacId}>
                  <td className="aym-mono">{m.wacId}</td><td>{m.name}</td><td>{showContacts ? m.email : m.maskedEmail}</td>
                  <td>{showContacts ? m.phone : m.maskedPhone}</td><td>{m.linked ? "Signed in" : "Not yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p style={{ fontSize: 13, color: "var(--muted)" }}>No delegate with that WAC ID or email.</p>
      )}

      {stats && stats.alerts && stats.alerts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="aym-eyebrow" style={{ color: "#8B2020" }}>Link alerts — blocked or needs choosing</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
            {stats.alerts.map((a, i) => (
              <li key={i}>
                {when(a.at)} · {a.wacId ? <><span className="aym-mono">{a.wacId}</span> · </> : null}{a.maskedEmail} ·{" "}
                {a.kind === "account-has-other-wac-id" ? "that email's account is linked to another WAC ID"
                  : a.kind === "email-matches-several-wac-ids" ? "verified email matches several WAC Delegate IDs — the delegate chooses on the Ask Desk, or search the email above"
                    : "WAC ID already linked to a different account"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats && stats.total > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", fontSize: 13 }}>Clear unlinked delegates</summary>
          <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
            Removes the {stats.unlinked} delegates nobody has signed in with (e.g. before uploading a corrected list). Linked delegates always stay.
            Type <b className="aym-mono">{stats.clearPhrase}</b> to confirm.
          </p>
          <div className="wac-staff-row">
            <input className="aym-input" style={{ flex: "0 1 220px" }} value={confirmText} onChange={e => setConfirmText(e.target.value)} aria-label={`Type ${stats.clearPhrase} to confirm`} />
            <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" disabled={busy || confirmText.trim() !== stats.clearPhrase} onClick={clearUnlinked}>
              <Trash2 size={13} /> Clear unlinked
            </button>
          </div>
        </details>
      )}
    </div>
  );
}
