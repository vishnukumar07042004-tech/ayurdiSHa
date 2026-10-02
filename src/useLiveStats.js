import { useEffect, useRef, useState } from "react";

const POLL_MS = 60 * 1000;
const TICK_MS = 20 * 1000;

async function fetchPublicStats(signal) {
  const r = await fetch("/api/aym-store", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "publicStats" }),
    signal,
  });
  if (!r.ok) throw new Error(`publicStats ${r.status}`);
  const body = await r.json();
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    registeredStudents: num(body.registeredStudents),
    questionsAsked: num(body.questionsAsked),
    questionsAnswered: num(body.questionsAnswered),
    updatedAt: num(body.updatedAt),
  };
}

export function formatUpdated(updatedAt, now = Date.now()) {
  if (!updatedAt) return "";
  const mins = Math.floor(Math.max(0, now - updatedAt) / 60000);
  if (mins < 1) return "Updated just now";
  if (mins < 60) return `Updated ${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `Updated ${hrs} hr${hrs === 1 ? "" : "s"} ago`;
}

/**
 * Public aggregate counts (registered students, questions asked/answered).
 * Polls every minute while the tab is visible; keeps the last good numbers on failure.
 */
export default function useLiveStats() {
  const [state, setState] = useState({ status: "loading", data: null });
  const [now, setNow] = useState(() => Date.now());
  const lastFetch = useRef(0);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    let ctrl = null;

    const load = async () => {
      if (ctrl) ctrl.abort();
      ctrl = new AbortController();
      lastFetch.current = Date.now();
      try {
        const data = await fetchPublicStats(ctrl.signal);
        if (!alive) return;
        const empty = data.registeredStudents == null && data.questionsAsked == null;
        setState((prev) => (empty
          ? { status: prev.data ? "ok" : "error", data: prev.data }
          : { status: "ok", data }));
      } catch (err) {
        if (!alive || (err && err.name === "AbortError")) return;
        setState((prev) => ({ status: prev.data ? "ok" : "error", data: prev.data }));
      }
    };

    const schedule = () => {
      clearInterval(timer);
      timer = setInterval(() => {
        if (document.visibilityState === "visible") load();
      }, POLL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        clearInterval(timer);
        return;
      }
      if (Date.now() - lastFetch.current >= POLL_MS) load();
      setNow(Date.now());
      schedule();
    };

    load();
    schedule();
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      if (ctrl) ctrl.abort();
      clearInterval(timer);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { ...state, now };
}
