import { useEffect, useState } from "react";

const API_TIMEOUT_MS = 45000;

/** sessionStorage key: the draft id the AI desk should open first. */
export const AI_FOCUS_KEY = "aym-ai-focus";

/** Same contract as the app's `api()` helper: POST /api/aym-store with the staff cookie. */
export async function aiApi(op, payload = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  try {
    const r = await fetch("/api/aym-store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ op, ...payload }),
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(data.error || (r.status >= 500 ? "The server is having trouble right now. Try again in a moment." : `Request failed (${r.status}).`));
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Request timed out. Check your connection and try again.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

let indexCache = null;
const listeners = new Set();

/** Light map `{ "q:<id>" | "c:<clusterId>": { status, risk } }` for "AI draft ready" chips. */
export function useAiDraftIndex(enabled = true) {
  const [index, setIndex] = useState(indexCache ? indexCache.index : {});
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const update = v => { if (alive) setIndex(v); };
    listeners.add(update);
    if (!indexCache || Date.now() - indexCache.at > 30000) {
      aiApi("aiIndex")
        .then(r => {
          indexCache = { at: Date.now(), index: r.index || {} };
          listeners.forEach(fn => fn(indexCache.index));
        })
        .catch(() => { indexCache = { at: Date.now(), index: {} }; });
    }
    return () => { alive = false; listeners.delete(update); };
  }, [enabled]);
  return index;
}

export function invalidateAiDraftIndex() {
  indexCache = null;
}
