import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, Mic, Play, Plus, Trash2 } from "lucide-react";
import { PODCASTS, mergePodcasts, parseVideo, talkThumbnail, hostLabel } from "./podcasts.js";

const EMPTY_COPY = "Mentor conversations will appear here after the hall talks.";

const BLANK_TALK = { title: "", mentorName: "", description: "", videoUrl: "", thumbnail: "" };

async function aymOp(op, payload = {}) {
  const r = await fetch("/api/aym-store", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ op, ...payload }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status}).`);
  return data;
}

function WatchMedia({ talk }) {
  const parsed = parseVideo(talk.videoUrl);
  const poster = talkThumbnail(talk);
  if (parsed.kind === "youtube") {
    return (
      <div className="aym-podcast-frame">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${parsed.id}`}
          title={talk.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }
  if (parsed.kind === "vimeo") {
    return (
      <div className="aym-podcast-frame">
        <iframe
          src={`https://player.vimeo.com/video/${parsed.id}`}
          title={talk.title}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }
  if (parsed.kind === "mp4") {
    return (
      <div className="aym-podcast-frame">
        <video controls playsInline poster={poster || undefined} src={parsed.src}>
          Your browser cannot play this video.
        </video>
      </div>
    );
  }
  return (
    <a
      className="aym-podcast-poster"
      href={talk.videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={poster ? { backgroundImage: `url(${poster})` } : undefined}
    >
      <span className="aym-podcast-poster-veil" aria-hidden="true" />
      <span className="aym-podcast-play"><Play size={22} fill="currentColor" /></span>
      <span className="aym-podcast-watch-label">Watch · {hostLabel(talk.videoUrl)}</span>
    </a>
  );
}

function TalkCard({ talk, staff, onRemove }) {
  const parsed = parseVideo(talk.videoUrl);
  const external = parsed.kind === "link" || parsed.kind === "none";
  return (
    <article className="aym-card aym-podcast-card">
      <WatchMedia talk={talk} />
      <div className="aym-podcast-card-body">
        <div className="aym-eyebrow">{talk.mentorName || "Hall talk"}</div>
        <h3 className="aym-display">{talk.title}</h3>
        {talk.description ? <p>{talk.description}</p> : null}
        {external && talk.videoUrl ? (
          <a className="aym-btn aym-btn-primary" href={talk.videoUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} /> Watch
          </a>
        ) : null}
        {staff && (
          <button type="button" className="aym-btn aym-btn-ghost aym-podcast-remove" onClick={() => onRemove(talk.id)}>
            <Trash2 size={14} /> Remove
          </button>
        )}
      </div>
    </article>
  );
}

function AddTalkForm({ onSaved }) {
  const [f, setF] = useState(BLANK_TALK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setOk("");
    const title = f.title.trim();
    const videoUrl = f.videoUrl.trim();
    if (!title || !videoUrl) {
      setErr("Title and video URL are required.");
      return;
    }
    if (!/^https?:\/\//i.test(videoUrl)) {
      setErr("Paste a full https:// link (YouTube, Vimeo, or .mp4).");
      return;
    }
    setBusy(true);
    try {
      const r = await aymOp("podcastsSave", {
        talk: {
          title,
          mentorName: f.mentorName.trim(),
          description: f.description.trim(),
          videoUrl,
          thumbnail: f.thumbnail.trim(),
        },
      });
      setF(BLANK_TALK);
      setOk("Talk posted. Visitors can watch it on this page.");
      onSaved(Array.isArray(r.talks) ? r.talks : null);
    } catch (ex) {
      setErr(ex.message || "Could not save that talk.");
    }
    setBusy(false);
  }

  return (
    <form className="aym-card aym-podcast-staff" onSubmit={submit}>
      <div className="aym-eyebrow">Staff — add a talk</div>
      <h3 className="aym-display">Paste a recorded conversation</h3>
      <p>
        After the hall recording, paste the YouTube, Vimeo, or .mp4 link. Visitors see it immediately — no redeploy.
      </p>
      <label>
        Title
        <input className="aym-input" value={f.title} onChange={e => set("title", e.target.value)}
          placeholder="Your next step — a conversation from the hall" maxLength={160} required />
      </label>
      <label>
        Mentor
        <input className="aym-input" value={f.mentorName} onChange={e => set("mentorName", e.target.value)}
          placeholder="Mentor name" maxLength={120} />
      </label>
      <label>
        Video URL
        <input className="aym-input" value={f.videoUrl} onChange={e => set("videoUrl", e.target.value)}
          placeholder="https://www.youtube.com/watch?v=… or youtu.be/…" maxLength={600} required />
      </label>
      <label>
        Short description <span>(optional)</span>
        <textarea className="aym-input" rows={2} value={f.description} maxLength={800}
          onChange={e => set("description", e.target.value)}
          placeholder="What this round-table covers" />
      </label>
      <label>
        Thumbnail URL <span>(optional — YouTube fills this in)</span>
        <input className="aym-input" value={f.thumbnail} onChange={e => set("thumbnail", e.target.value)}
          placeholder="https://…" maxLength={600} />
      </label>
      {err && <p className="aym-podcast-err" role="alert">{err}</p>}
      {ok && <p className="aym-podcast-ok" role="status">{ok}</p>}
      <button type="submit" className="aym-btn aym-btn-primary" disabled={busy}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
        Add talk
      </button>
    </form>
  );
}

export default function PodcastView({ staff, onAsk, onBack }) {
  const [talks, setTalks] = useState(() => PODCASTS.slice());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      let r;
      if (staff) r = await aymOp("podcastsList");
      else {
        const res = await fetch("/api/aym-store?op=podcastsList", { method: "GET" });
        if (!res.ok) throw new Error(`Request failed (${res.status}).`);
        r = await res.json();
      }
      setTalks(mergePodcasts(PODCASTS, r));
    } catch {
      setTalks(PODCASTS.slice());
    }
    setLoading(false);
  }, [staff]);

  useEffect(() => { load(); }, [load]);

  async function removeTalk(id) {
    if (!window.confirm("Remove this talk from the Podcast page?")) return;
    try {
      const r = await aymOp("podcastsSave", { removeId: id });
      setTalks(mergePodcasts(PODCASTS, r));
    } catch (e) {
      window.alert(e.message || "Could not remove that talk.");
    }
  }

  const empty = !talks.length;

  return (
    <div className="aym-podcast">
      {onBack && (
        <button type="button" className="aym-pod-know-back" onClick={onBack}>
          <ArrowLeft size={16} /> Back to hall
        </button>
      )}
      <header className={`aym-podcast-hero${empty ? " aym-podcast-hero-empty" : ""}`} aria-labelledby="podcast-hero-title">
        <div className="aym-podcast-hero-bg" aria-hidden="true" />
        <div className="aym-podcast-hero-veil" aria-hidden="true" />
        <div className="aym-podcast-botanical" aria-hidden="true" />
        <div className="aym-podcast-hero-copy">
          <p className="aym-eyebrow">Podcast corner · AYURDISHA hall</p>
          <h1 id="podcast-hero-title" className="aym-display">
            {empty ? "The mics are waiting" : "Mentor conversations"}
          </h1>
          <div className="aym-podcast-hero-rule" aria-hidden="true" />
          <p>{empty ? EMPTY_COPY : "Recorded round-tables from the Meet the Mentors floor — watch them here."}</p>
          {empty && (
            <p className="aym-podcast-hero-note">
              {loading ? "Checking for posted talks…" : "This corner fills after the hall recordings are posted."}
            </p>
          )}
        </div>
      </header>

      {staff && (
        <AddTalkForm onSaved={next => {
          if (next) setTalks(mergePodcasts(PODCASTS, { talks: next }));
          else load();
        }} />
      )}

      {!empty && (
        <section className="aym-podcast-grid" aria-label="Recorded mentor talks">
          {talks.map(talk => (
            <TalkCard key={talk.id} talk={talk} staff={staff} onRemove={removeTalk} />
          ))}
        </section>
      )}

      <div className="aym-card aym-podcast-ask">
        <div className="aym-eyebrow">Round table</div>
        <h2 className="aym-display">A conversation worth recording</h2>
        <p>
          Optional zone. If your career question would help a room of students — recognition abroad,
          start-ups, public health — leave it here and we may take it to the round table.
        </p>
        <button type="button" className="aym-btn aym-btn-primary" onClick={() => onAsk({
          theme: "Brand Building & Communication",
          subtheme: "Scientific communication",
          question: "What career story would you tell a room of Ayurveda students — and what should they do in the next 90 days?",
        })}>
          <Mic size={16} /> Leave a podcast-worthy question
        </button>
      </div>
    </div>
  );
}
