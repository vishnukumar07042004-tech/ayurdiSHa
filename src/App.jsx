import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense, useId } from "react";
import { useLocation, useNavigate, Routes, Route, Navigate, Link } from "react-router-dom";
import { getAllPrograms } from "./data/programs.js";
import {
  Send, Search, Layers, FileSpreadsheet, BookOpen, Download, Upload,
  Check, X, ChevronRight, ChevronLeft, Loader2, RefreshCw, Lock, Unlock, Trash2,
  Merge, Scissors, AlertCircle, Ticket, Users, Eye, EyeOff,
  Leaf, Mic, Compass, Map, ArrowRight, UserPlus, Mail,
  ShieldCheck, BadgeCheck, LogOut, Sparkles, PenLine, Printer,
  Calendar, MessageCircle, HeartHandshake, HelpCircle, GraduationCap, Award,
  ArrowLeft, ExternalLink, ChevronDown, MoreVertical, Newspaper, Copy, CopyCheck,
} from "lucide-react";
import { getPodByCode, KNOWLEDGE_TABS, getSectionForTab, POD_KNOWLEDGE } from "./podKnowledge.js";
import { setPageMeta, personJsonLd, breadcrumbJsonLd, faqJsonLd } from "./siteMeta.js";
import { getMentorByParam, mentorPublicPath, mentorsWithNames, MENTORS } from "./mentors.js";
import { MentorAnswerLetter, trackStatusOf } from "./TrackAnswer.jsx";
import FirstVisitGuide, {
  FIRST_VISIT_GUIDES,
  firstVisitIdFromHref,
  hasSeenFirstVisit,
  markFirstVisitSeen,
} from "./components/FirstVisitGuide.jsx";
import {
  hasSeenWelcome,
  welcomeShownThisSession,
} from "./welcomeStorage.js";
import AppHeader from "./AppHeader.jsx";
import SiteFooter from "./SiteFooter.jsx";
import PageSkeleton from "./PageSkeleton.jsx";
import { AboutPage, PrivacyPage, TermsPage, DisclaimerPage } from "./LegalPages.jsx";
import NotFound from "./NotFound.jsx";

import AboutPageNew from "./pages/AboutPage.jsx";
import WelcomePage from "./pages/WelcomePage.jsx";
import HomePage from "./pages/HomePage.jsx";
import MentorsPage from "./pages/MentorsPage.jsx";
import MentorDetailPage from "./pages/MentorDetailPage.jsx";
import ProgramsPage from "./pages/ProgramsPage.jsx";
import ProgramDetailPage from "./pages/ProgramDetailPage.jsx";
import EventsPage from "./pages/EventsPage.jsx";
import EventDetailPage from "./pages/EventDetailPage.jsx";
import ResourcesPage from "./pages/ResourcesPage.jsx";
import ResourceDetailPage from "./pages/ResourceDetailPage.jsx";
import ContactPage from "./pages/ContactPage.jsx";
import { PrivacyRoute, TermsRoute, DisclaimerRoute } from "./pages/LegalPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import StaffWorkspace from "./StaffWorkspace.jsx";


const MentorsDirectory = lazy(() => import("./MentorsDirectory.jsx"));
const MentorProfile = lazy(() => import("./MentorProfile.jsx"));
const PodcastView = lazy(() => import("./PodcastView.jsx"));

let xlsxPromise;
function loadXlsx() {
  if (!xlsxPromise) {
    xlsxPromise = import("xlsx").then(m => m.default || m);
  }
  return xlsxPromise;
}

/* ------------------------------------------------------------------ */
/* Palette — forest hall, cream floor, oak pods                        */
/* ------------------------------------------------------------------ */

const C = {
  maroon: "#1B4332",
  maroonDeep: "#0F2A1F",
  gold: "#C4A484",
  goldSoft: "#E8D5B7",
  cream: "#F5EBE0",
  tan: "#EDE4D4",
  ink: "#1A2E24",
  muted: "#5C6B62",
  line: "#D9CBB8",
  green: "#2D6A4F",
  white: "#FFFEFB",
  forest: "#1B4332",
  oak: "#C4A484",
};

/* ------------------------------------------------------------------ */
/* Domain data — 10 AYURDISHA themes                                   */
/* ------------------------------------------------------------------ */

const TRACKS = [
  { code: "T01", name: "Clinical Practice & Integrative Care", subs: ["Choosing a clinical specialty", "Hospital employment", "Setting up private practice", "Panchakarma & therapy services", "Integrative referrals", "Records & clinical quality"] },
  { code: "T02", name: "Academics, Teaching & Higher Education", subs: ["Choosing a PG branch", "PhD pathway", "Faculty recruitment & eligibility", "Teaching skills", "Curriculum & assessment", "Academic leadership"] },
  { code: "T03", name: "Research, Evidence & Publication", subs: ["Framing a research question", "Study design", "Ethics & approvals", "Biostatistics", "Grants & funding", "Thesis & publication"] },
  { code: "T04", name: "Entrepreneurship & Start-ups", subs: ["Validating the idea", "Business model", "Product & prototype", "Incubation support", "Funding & finance", "Team & intellectual property"] },
  { code: "T05", name: "Manufacturing, Quality & GMP", subs: ["R&D and formulation", "Production & scale-up", "QA / QC and testing", "GMP and licensing", "Regulatory affairs", "Pharmacovigilance"] },
  { code: "T06", name: "Brand Building & Communication", subs: ["Positioning a practice or product", "Digital presence", "Scientific communication", "Advertising & claims compliance", "Community education"] },
  { code: "T07", name: "Export & Global Trade", subs: ["Getting started in export", "Documentation & shipping terms", "Certification and quality marks", "Market entry & partners", "Pricing & distribution"] },
  { code: "T08", name: "Practice Abroad & Practitioner Mobility", subs: ["Country-wise recognition", "Licensing & registration", "Visa and employment routes", "Bridging qualifications", "Wellness centre roles abroad"] },
  { code: "T09", name: "Medical Value Travel & Wellness", subs: ["How the MVT ecosystem works", "Accreditation and standards", "Designing packages", "Handling international patients", "Careers in wellness resorts"] },
  { code: "T10", name: "Policy, Public Health & Global Agencies", subs: ["Government service routes", "National AYUSH Mission delivery", "Research councils", "Public health projects", "International organisations", "Policy research & advocacy"] },
];
const NOT_SURE = "Not sure — help me classify";

const ASK_PROMPTS = [
  { label: "What should I do after BAMS?", theme: "Academics, Teaching & Higher Education", sub: "Choosing a PG branch", text: "What should I do after BAMS — PG, clinical practice, research, or something else — and how do I choose?" },
  { label: "PG / MD branch", theme: "Academics, Teaching & Higher Education", sub: "Choosing a PG branch", text: "How should I choose a PG / MD branch after BAMS, and when should I start preparing?" },
  { label: "Start a clinic", theme: "Clinical Practice & Integrative Care", sub: "Setting up private practice", text: "What licences and first steps do I need to start a small Ayurveda clinic after internship?" },
  { label: "Hospital vs practice", theme: "Clinical Practice & Integrative Care", sub: "Hospital employment", text: "Is it better to work in a hospital first after BAMS, or go into private practice straight away?" },
  { label: "Research after BAMS", theme: "Research, Evidence & Publication", sub: "Framing a research question", text: "How do I begin a research career after BAMS if I am not yet in MD?" },
  { label: "AYUSH / public health", theme: "Policy, Public Health & Global Agencies", sub: "Government service routes", text: "What is the route to a government AYUSH medical officer post after BAMS?" },
];

const AFTER_BAMS = [
  { id: "pg", label: "PG / MD", themes: ["Academics, Teaching & Higher Education"] },
  { id: "clinic", label: "Clinical practice", themes: ["Clinical Practice & Integrative Care"] },
  { id: "research", label: "Research", themes: ["Research, Evidence & Publication"] },
  { id: "public", label: "Public health", themes: ["Policy, Public Health & Global Agencies"] },
  { id: "startup", label: "Start-ups", themes: ["Entrepreneurship & Start-ups", "Brand Building & Communication"] },
  { id: "industry", label: "Industry & trade", themes: ["Manufacturing, Quality & GMP", "Export & Global Trade"] },
  { id: "global", label: "Practice abroad", themes: ["Practice Abroad & Practitioner Mobility", "Medical Value Travel & Wellness"] },
];

const HALL_PODS = [
  { id: "A", name: "Practice", themes: ["Clinical Practice & Integrative Care"] },
  { id: "B", name: "PG & teaching", themes: ["Academics, Teaching & Higher Education"] },
  { id: "C", name: "Research", themes: ["Research, Evidence & Publication"] },
  { id: "D", name: "Public health", themes: ["Policy, Public Health & Global Agencies"] },
];

const EXCHANGE_PATHS = [
  { title: "PG / MD after BAMS", blurb: "Choose a branch, time the entrance, and plan the next three years.", theme: "Academics, Teaching & Higher Education", sub: "Choosing a PG branch", prompt: "How should I choose a PG / MD branch after BAMS, and when should I start preparing?" },
  { title: "Clinical practice", blurb: "Clinic, hospital, Panchakarma — licences and first patients.", theme: "Clinical Practice & Integrative Care", sub: "Setting up private practice", prompt: "What licences and first steps do I need to start a small Ayurveda clinic after internship?" },
  { title: "Research & evidence", blurb: "Thesis, journals, and a research career without waiting for MD.", theme: "Research, Evidence & Publication", sub: "Framing a research question", prompt: "How do I begin a research career after BAMS if I am not yet in MD?" },
  { title: "Public health & AYUSH", blurb: "Medical officer posts, NAM, and policy work.", theme: "Policy, Public Health & Global Agencies", sub: "Government service routes", prompt: "What is the route to a government AYUSH medical officer post after BAMS?" },
  { title: "Start-ups & brands", blurb: "Test an idea, find a scheme, stay inside the claims rules.", theme: "Entrepreneurship & Start-ups", sub: "Validating the idea", prompt: "How do I test whether my Ayurvedic product idea has a real market before spending money after BAMS?" },
  { title: "Practice abroad", blurb: "Recognition, licences, and wellness vs clinical work.", theme: "Practice Abroad & Practitioner Mobility", sub: "Country-wise recognition", prompt: "Can a BAMS graduate practise legally abroad, and what licence is required?" },
];

const STAGES = ["BAMS student (1st–2nd prof)", "BAMS student (3rd–final prof)", "Intern", "MD / MS postgraduate", "PhD scholar", "Graduate (up to 5 years)", "Practitioner", "Faculty", "Other"];

const STATES = ["Andaman & Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chandigarh","Chhattisgarh","Dadra & Nagar Haveli and Daman & Diu","Delhi","Goa","Gujarat","Haryana","Himachal Pradesh","Jammu & Kashmir","Jharkhand","Karnataka","Kerala","Ladakh","Lakshadweep","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Outside India"];

const CORE_DAYS = ["11 December 2026", "12 December 2026", "13 December 2026"];

const STOP = new Set("what which where when why how can could should would will the and for with from into about this that have want need must does doing dont not are was were you your our their its any some more most much many very just also than then them they there here who whom whose out off per via such only same other another each both few own too all how's ayurveda ayurvedic bams student students career mentor please kindly sir madam".split(/\s+/));

/* ------------------------------------------------------------------ */
/* Storage layer                                                       */
/* Local preview: questions are saved on disk (ayurmarg-preview/data/  */
/* store.json) via /api/aym-store. Anyone can SUBMIT. Listing stats    */
/* and the full question log requires the staff PIN (HttpOnly cookie). */
/* Fallback: localStorage if the API is not running.                   */
/* Live site: swap this for Firestore + firestore.rules in this folder.*/
/* ------------------------------------------------------------------ */

const K_Q = "aym:q:";
const K_CLUSTERS = "aym:clusters";
const K_CONFIG = "aym:config";
const LS_PREFIX = "aym-store:";
const APP_TAB_IDS = ["intro", "hall", "mentors", "register", "ask", "pods", "exchange", "track", "board", "staff", "curate", "insights", "pack", "podcast"];

function tabFromHash(hash) {
  const raw = hash !== undefined && hash !== null
    ? hash
    : (typeof location !== "undefined" ? location.hash : "");
  const h = String(raw || "").replace(/^#/, "").toLowerCase();
  return APP_TAB_IDS.includes(h) ? h : null;
}

/** `/` and `/#intro` are the cinematic landing; other hashes & staff paths are in-app tabs. */
function tabFromUrl(pathname, hash) {
  const p = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (p === "/staff" || p === "/staff/login" || p === "/staff/workspace") return "staff";
  if (p === "/staff/curation" || p === "/staff/curate") return "curate";
  if (p === "/staff/theme-stage" || p === "/staff/board") return "board";
  if (p === "/staff/insights") return "insights";
  if (p === "/staff/mentor-pack" || p === "/staff/pack") return "pack";
  if (p === "/track-answer") return "track";

  if (parseMentorPath(pathname).onMentors) return "mentors";
  const h = tabFromHash(hash);
  if (h && h !== "intro") return h;
  return "intro";
}

const LEGAL_PATHS = {
  "/about": "about",
  "/privacy": "privacy",
  "/terms": "terms",
  "/disclaimer": "disclaimer",
};

const STAFF_PATHS = {
  "/staff": "staff",
  "/staff/login": "staff",
  "/staff/curation": "curate",
  "/staff/theme-stage": "board",
  "/staff/insights": "insights",
  "/staff/mentor-pack": "pack",
};

function parseMentorPath(pathname) {
  const p = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (p === "/mentors") return { onMentors: true, mentorId: null };
  const m = p.match(/^\/mentors\/([^/]+)$/);
  if (m) return { onMentors: true, mentorId: decodeURIComponent(m[1]) };
  return { onMentors: false, mentorId: null };
}

function parseAppPath(pathname) {
  const p = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (p === "/welcome") return { kind: "welcome" };
  if (LEGAL_PATHS[p]) return { kind: "legal", page: LEGAL_PATHS[p] };
  if (STAFF_PATHS[p]) return { kind: "staff", tab: STAFF_PATHS[p] };
  if (p === "/track-answer") return { kind: "app" };
  const mentors = parseMentorPath(p);
  if (mentors.onMentors) return { kind: "mentors", mentorId: mentors.mentorId };
  if (p === "/") return { kind: "app" };
  return { kind: "404" };
}


const hasClaudeStore = () => typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function anonIdFromEmail(email) {
  const h = await sha256Hex((email || "").trim().toLowerCase() || "anon");
  return "U-" + h.slice(0, 10).toUpperCase();
}

const otpDigits = s => String(s || "").replace(/\D/g, "").slice(0, 6);

const CLUSTER_SAVE_DEBOUNCE_MS = 1500;
const API_TIMEOUT_MS = 45000;

async function api(op, payload = {}) {
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
      const err = new Error(data.error || `Request failed (${r.status}).`);
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error("Request timed out. Check your connection and try again.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

let apiAvailable = null;
async function hasApi() {
  if (apiAvailable != null) return apiAvailable;
  try {
    const r = await api("ping");
    apiAvailable = Boolean(r && r.ok);
  } catch { apiAvailable = false; }
  return apiAvailable;
}

const lsStore = {
  get(key) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  set(key, val) {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); return true; }
    catch (e) { console.error("storage.set", e); return false; }
  },
  del(key) {
    try { localStorage.removeItem(LS_PREFIX + key); return true; } catch { return false; }
  },
  list(prefix) {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LS_PREFIX + prefix)) out.push(k.slice(LS_PREFIX.length));
      }
    } catch { /* private mode */ }
    return out;
  },
};

const store = {
  async get(key) {
    if (hasClaudeStore()) {
      try {
        const r = await window.storage.get(key, true);
        return r ? JSON.parse(r.value) : null;
      } catch { return null; }
    }
    if (await hasApi()) {
      try {
        const r = await api("get", { key });
        return r.value ?? null;
      } catch { return null; }
    }
    return lsStore.get(key);
  },
  async set(key, val) {
    if (hasClaudeStore()) {
      try { await window.storage.set(key, JSON.stringify(val), true); return true; }
      catch (e) { console.error("storage.set", e); return false; }
    }
    if (await hasApi()) {
      try { await api("set", { key, val }); return true; }
      catch (e) { console.error("storage.set", e); return false; }
    }
    return lsStore.set(key, val);
  },
  async del(key) {
    if (hasClaudeStore()) {
      try { await window.storage.delete(key, true); return true; } catch { return false; }
    }
    if (await hasApi()) {
      try { await api("del", { key }); return true; } catch { return false; }
    }
    return lsStore.del(key);
  },
  async list(prefix) {
    if (hasClaudeStore()) {
      try { const r = await window.storage.list(prefix, true); return (r && r.keys) || []; } catch { return []; }
    }
    if (await hasApi()) {
      try {
        const r = await api("list", { prefix });
        return r.keys || [];
      } catch { return []; }
    }
    return lsStore.list(prefix);
  },
};

async function staffLogin(pin) {
  if (!(await hasApi())) {
    throw new Error("Staff sign-in needs the preview server.");
  }
  await api("login", { pin });
  return true;
}

async function staffLogout() {
  if (await hasApi()) {
    try { await api("logout"); } catch { /* ignore */ }
  }
}

async function staffWhoami() {
  if (await hasApi()) {
    try { return await api("whoami"); } catch { return { staff: false, hasPin: true }; }
  }
  return { staff: false, hasPin: true };
}

async function loadAllSubmissions(onProgress) {
  if (!(await hasApi())) return [];
  const keys = await store.list(K_Q);
  const out = [];
  for (let i = 0; i < keys.length; i += 8) {
    const chunk = keys.slice(i, i + 8);
    const got = await Promise.all(chunk.map(k => store.get(k)));
    got.forEach(g => { if (g && g.id) out.push(g); });
    if (onProgress) onProgress(out.length, keys.length);
  }
  out.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return out;
}

function publishedClusters(clusters) {
  return (Array.isArray(clusters) ? clusters : [])
    .filter(c => c.status === "Published" && c.answer)
    .map(c => ({
      id: c.id, theme: c.theme, subtheme: c.subtheme, status: c.status,
      composite: c.composite, representative: c.representative,
      answer: c.answer, actions: c.actions, mistake: c.mistake,
      resources: c.resources, mentorName: c.mentorName,
      memberIds: c.memberIds || [],
    }));
}

function clusterOwnsQuestion(c, s) {
  const ids = (c.memberIds || []).map(x => String(x || "").trim()).filter(Boolean);
  if (!ids.length || !s) return false;
  const id = String(s.id || "").trim();
  const ticket = String(s.ticket || "").trim();
  return (id && ids.includes(id)) || (ticket && ids.includes(ticket));
}

function pickStoredAnswer(rec) {
  if (!rec || typeof rec !== "object") return "";
  return String(rec.individualAnswer || rec.answer || rec.mentorAnswer || rec.mergedAnswer || "").trim();
}

function clusterAnswerText(c) {
  if (!c || typeof c !== "object") return "";
  return String(c.answer || c.mergedAnswer || c.mentorAnswer || "").trim();
}

function clusterStatusFor(s, clusters) {
  const c = (clusters || []).find(x => clusterOwnsQuestion(x, s));
  if (!c) return null;
  const ready = Boolean(clusterAnswerText(c));
  return {
    id: c.id,
    memberIds: c.memberIds || [],
    status: c.status,
    kind: c.kind || ((c.memberIds || []).length >= 2 ? "merged" : "unique"),
    answer: ready ? clusterAnswerText(c) : "",
    composite: ready ? (c.composite || "") : "",
    representative: ready ? (c.representative || "") : "",
    actions: ready ? (c.actions || []) : [],
    mistake: ready ? (c.mistake || "") : "",
    resources: ready ? (c.resources || []) : [],
    mentorName: ready ? (c.mentorName || "") : "",
  };
}

function ownLookupRecord(s, clusters) {
  return {
    id: s.id, ticket: s.ticket, question: s.question,
    theme: s.theme, subtheme: s.subtheme, createdAt: s.createdAt,
    consentPublish: s.consentPublish || "",
    individualAnswer: pickStoredAnswer(s),
    individualMentor: s.individualMentor || s.mentorName || "",
    individualAt: s.individualAt || 0,
    individualActions: s.individualActions || [],
    individualMistake: s.individualMistake || "",
    individualResources: s.individualResources || [],
    cluster: clusterStatusFor(s, clusters),
  };
}

async function lookupSubmissions(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  if (await hasApi()) {
    try {
      const r = await api("lookup", { query: needle });
      return r.hits || [];
    } catch { return []; }
  }
  const [all, cl] = await Promise.all([loadAllSubmissions(), store.get(K_CLUSTERS)]);
  const clusters = Array.isArray(cl) ? cl : [];
  return all
    .filter(s => s.ticket.toLowerCase() === needle || (s.email || "").toLowerCase() === needle)
    .map(s => ownLookupRecord(s, clusters));
}

/* ------------------------------------------------------------------ */
/* Delegate session — token + cached profile in localStorage           */
/* ------------------------------------------------------------------ */

const LS_SESSION = "aym-delegate-session";
const SEX_OPTIONS = ["Female", "Male", "Other"];

function loadLocalSession() {
  try { return JSON.parse(localStorage.getItem(LS_SESSION) || "null"); }
  catch { return null; }
}

function saveLocalSession(s) {
  try {
    if (s) localStorage.setItem(LS_SESSION, JSON.stringify(s));
    else localStorage.removeItem(LS_SESSION);
  } catch { /* private mode */ }
}

/* ------------------------------------------------------------------ */
/* Text + clustering                                                   */
/* ------------------------------------------------------------------ */

const rid = (n = 5) => Math.random().toString(36).slice(2, 2 + n).toUpperCase();
const ticketId = () => "AYM-Q-" + Date.now().toString(36).toUpperCase().slice(-5) + rid(3);
const clusterId = () => "AYM-C-" + rid(4);

function normalizeText(text) {
  return String(text || "")
    .normalize("NFD").replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
}

function stemWord(w) {
  if (w.length <= 4) return w;
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("tion") && w.length > 6) return w.slice(0, -4);
  if (w.endsWith("ment") && w.length > 6) return w.slice(0, -4);
  if (w.endsWith("ed") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("s") && w.length > 4 && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function tokens(text, context) {
  return new Set(
    normalizeText(`${text || ""} ${context || ""}`)
      .split(/\s+/)
      .map(stemWord)
      .filter(w => w.length > 2 && !STOP.has(w))
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  a.forEach(x => { if (b.has(x)) hit++; });
  return hit / (a.size + b.size - hit);
}

/** Sorted-token bigrams — catches phrase overlap Jaccard alone misses. */
function bigrams(tokenSet) {
  const arr = [...tokenSet].sort();
  const bg = new Set();
  for (let i = 0; i < arr.length - 1; i++) bg.add(`${arr[i]} ${arr[i + 1]}`);
  return bg;
}

/**
 * Weighted similarity for auto-merge. All Ask Desk submissions enter the merge pool.
 *
 * Mental checks:
 * - "How to prepare for NEET PG?" vs "NEET PG preparation tips" → high (~0.5+), merge
 * - "Ayurveda diet for diabetes" vs "Career after BAMS" → low (~0.05), stay singletons
 * - "Clinical internship Kerala" vs "Clinical internship Karnataka" → moderate; strict pass keeps separate
 * - "Panchakarma training duration" vs "Panchakarma therapy steps" → partial; merges only above threshold
 */
function questionSimilarity(a, b, dfMap) {
  const jac = jaccard(a._t, b._t);
  if (!jac) return 0;

  const bgA = bigrams(a._t);
  const bgB = bigrams(b._t);
  let bgHit = 0;
  bgA.forEach(x => { if (bgB.has(x)) bgHit++; });
  const bgJac = bgA.size && bgB.size ? bgHit / (bgA.size + bgB.size - bgHit) : 0;

  let weightedHit = 0;
  let weightedUnion = 0;
  const union = new Set([...a._t, ...b._t]);
  union.forEach(t => {
    const w = (dfMap.get(t) || 1) <= 2 ? 1.5 : 1;
    weightedUnion += w;
    if (a._t.has(t) && b._t.has(t)) weightedHit += w;
  });
  const weightedJac = weightedUnion ? weightedHit / weightedUnion : 0;

  return 0.55 * weightedJac + 0.35 * jac + 0.10 * bgJac;
}

function bucketSimilarity(a, b, dfMap) {
  let best = 0;
  a.forEach(x => b.forEach(y => {
    const v = questionSimilarity(x, y, dfMap);
    if (v > best) best = v;
  }));
  return best;
}

function isDemoRecord(s) {
  const email = String(s && s.email || "").trim().toLowerCase();
  const name = String(s && s.name || "").trim();
  if (/@example\.(com|in|org)$/i.test(email)) return true;
  if (/^(demo\d*|finish\.agent|teststudent)@/i.test(email)) return true;
  if (/^demo student/i.test(name)) return true;
  if (/^(finish agent|test student)$/i.test(name)) return true;
  return false;
}

/**
 * Groups by theme (optionally theme+subtheme), then two-pass clustering:
 * 1) Strict pass — only join when weighted similarity ≥ threshold (default 0.42).
 * 2) Pack pass — small buckets (<6) may combine if similarity ≥ packThresh (never below 0.28).
 * Singletons stay singletons when nothing clears the strict bar — avoids wrong forced merges.
 * Composite wording defaults to the longest member question (staff can edit on Curation desk).
 */
function buildClusters(subs, threshold, useSub, prev = []) {
  const groups = new Map();
  (subs || []).forEach(s => {
    const key = useSub ? `${s.theme}\u0000${s.subtheme}` : s.theme;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...s, _t: tokens(s.question, s.context) });
  });

  const out = [];
  groups.forEach((items, key) => {
    const dfMap = new Map();
    items.forEach(s => s._t.forEach(t => dfMap.set(t, (dfMap.get(t) || 0) + 1)));

    items.sort((a, b) => b._t.size - a._t.size);
    const buckets = [];

    // Pass 1 — strict auto-merge
    items.forEach(s => {
      let best = null;
      let score = 0;
      buckets.forEach(b => {
        const v = bucketSimilarity(b, [s], dfMap);
        if (v > score) { score = v; best = b; }
      });
      if (best && score >= threshold) best.push(s);
      else buckets.push([s]);
    });

    // Pass 2 — pack undersized buckets (still above a floor; no forced singleton absorption)
    const packThresh = Math.max(0.28, threshold * 0.78);
    let changed = true;
    while (changed) {
      changed = false;
      buckets.sort((a, b) => a.length - b.length);
      for (let i = 0; i < buckets.length; i++) {
        if (buckets[i].length >= 6) continue;
        let bestJ = -1;
        let bestScore = 0;
        for (let j = i + 1; j < buckets.length; j++) {
          const v = bucketSimilarity(buckets[i], buckets[j], dfMap);
          if (v >= packThresh && v > bestScore) { bestScore = v; bestJ = j; }
        }
        if (bestJ >= 0) {
          buckets[bestJ] = buckets[bestJ].concat(buckets[i]);
          buckets.splice(i, 1);
          changed = true;
          break;
        }
      }
    }

    const [theme, subtheme] = key.split("\u0000");
    buckets.forEach(members => {
      const rep = members.reduce((a, c) => (c.question.length > a.question.length ? c : a), members[0]);
      const carried = prev.find(p => p.memberIds && p.memberIds.includes(rep.id));
      out.push({
        id: carried ? carried.id : clusterId(),
        theme,
        subtheme: subtheme || "",
        kind: members.length >= 2 ? "merged" : "unique",
        memberIds: members.map(m => m.id),
        representative: rep.question,
        variants: members.filter(m => m.id !== rep.id).slice(0, 6).map(m => m.question),
        composite: carried ? carried.composite : "",
        mentor: carried ? carried.mentor : "",
        answer: carried ? carried.answer : "",
        actions: carried ? carried.actions : ["", "", ""],
        mistake: carried ? carried.mistake : "",
        resources: carried ? carried.resources : ["", ""],
        mentorName: carried ? carried.mentorName : "",
        status: carried ? carried.status : "New",
      });
    });
  });

  out.sort((a, b) => (b.memberIds.length - a.memberIds.length) || a.theme.localeCompare(b.theme));
  return out;
}

/* ------------------------------------------------------------------ */
/* Excel round-trip                                                    */
/* ------------------------------------------------------------------ */

const BRIEF_COLS = [
  "Cluster_ID", "Theme", "Subtheme", "Students_In_Cluster", "Composite_Question",
  "Representative_Wording", "Ticket_ID", "Question_ID", "WAC_Reg_No", "Name", "Email",
  "Original_Question", "MERGED_ANSWER", "INDIVIDUAL_ANSWER",
  "ACTION_1", "ACTION_2", "ACTION_3", "COMMON_MISTAKE",
  "RESOURCE_1", "RESOURCE_2", "MENTOR_NAME_DESIGNATION", "Assigned_Mentor",
];

function downloadBlob(data, filename, mime) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportMentorWorkbook(clusters, subs, label) {
  const XLSX = await loadXlsx();
  const byId = Object.fromEntries((subs || []).map(s => [s.id, s]));
  const rows = [BRIEF_COLS];
  clusters.forEach(c => {
    const members = (c.memberIds || []).map(id => byId[id]).filter(Boolean);
    const base = [
      c.id, c.theme, c.subtheme, c.memberIds.length,
      c.composite || c.representative, c.representative,
    ];
    const mergedTail = [
      c.answer || "",
      "",
      c.actions[0] || "", c.actions[1] || "", c.actions[2] || "",
      c.mistake || "", c.resources[0] || "", c.resources[1] || "",
      c.mentorName || "", c.mentor || "",
    ];
    if (!members.length) {
      rows.push([...base, "", "", "", "", "", "", ...mergedTail]);
      return;
    }
    members.forEach(m => rows.push([
      ...base,
      m.ticket, m.id, m.regNo || m.delegateNo || "", m.name || "", m.email || "",
      m.question, ...mergedTail.slice(0, 1), m.individualAnswer || "", ...mergedTail.slice(1),
    ]));
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 34 }, { wch: 26 }, { wch: 9 }, { wch: 60 }, { wch: 55 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 22 }, { wch: 28 }, { wch: 60 },
    { wch: 70 }, { wch: 70 }, { wch: 34 }, { wch: 34 }, { wch: 34 }, { wch: 34 },
    { wch: 34 }, { wch: 34 }, { wch: 30 }, { wch: 22 },
  ];
  ws["!freeze"] = { xSplit: 1, ySplit: 1 };

  const notes = XLSX.utils.aoa_to_sheet([
    ["AYURDISHA — Mentor answer sheet"],
    ["11th World Ayurveda Congress & Arogya Expo 2026, Bhubaneswar"],
    [""],
    ["1.", "One row per student in each merged group. Cluster columns repeat; each row shows that student's original question."],
    ["2.", "Fill MERGED_ANSWER once per group (same wording on every row in the group is fine). It becomes the hall answer on Track my answer."],
    ["3.", "Fill INDIVIDUAL_ANSWER on a row only when that mentee needs a personal note in addition to the hall answer."],
    ["4.", "Also fill ACTION_1–3, COMMON_MISTAKE, RESOURCE_1–2, MENTOR_NAME_DESIGNATION for the merged answer."],
    ["5.", "Do not edit Cluster_ID or Ticket_ID — they match answers back to students."],
    ["6.", "Return the file to the curation desk. Uploaded answers appear on Track my answer by ticket."],
    [""],
    ["Generated", new Date().toLocaleString("en-IN")],
    ["Selection", label],
    ["Clusters in this file", String(clusters.length)],
    ["Students represented", String(clusters.reduce((n, c) => n + c.memberIds.length, 0))],
  ]);
  notes["!cols"] = [{ wch: 22 }, { wch: 105 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "MENTOR_BRIEF");
  XLSX.utils.book_append_sheet(wb, notes, "HOW_TO_FILL");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(buf, `AYURDISHA_Mentor_Brief_${label.replace(/[^A-Za-z0-9]+/g, "_")}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function exportMentorDoc(clusters, label) {
  const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = clusters.map((c, i) => `
    <p style="margin:18pt 0 2pt"><b style="color:#5C1A2B">${i + 1}. ${esc(c.theme)} &mdash; ${esc(c.subtheme)}</b>
    <span style="color:#7A6A5C"> [${esc(c.id)} &middot; ${c.memberIds.length} students]</span></p>
    <p style="margin:0 0 6pt;font-size:12pt"><b>${esc(c.composite || c.representative)}</b></p>
    ${c.variants.length ? `<p style="margin:0 0 6pt;color:#7A6A5C;font-size:10pt">Also asked as: ${c.variants.map(v => esc(v)).join(" &nbsp;|&nbsp; ")}</p>` : ""}
    <p style="margin:0">Answer: ${"_".repeat(110)}</p>
    <p style="margin:0">Three actions: 1. ${"_".repeat(80)} 2. ${"_".repeat(80)} 3. ${"_".repeat(80)}</p>
    <p style="margin:0">One common mistake: ${"_".repeat(88)}</p>
    <p style="margin:0 0 6pt">Official resources: ${"_".repeat(92)}</p>`).join("");

  const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">
  <style>body{font-family:Calibri,sans-serif;font-size:11pt;color:#2E2620}h1,h2{font-family:Cambria,serif;color:#5C1A2B}</style></head>
  <body><h1>AYURDISHA mentor brief</h1>
  <h2 style="font-size:12pt;font-weight:normal">${esc(label)} &middot; ${clusters.length} merged questions &middot; ${clusters.reduce((n, c) => n + c.memberIds.length, 0)} students represented</h2>
  <p style="color:#7A6A5C">11th World Ayurveda Congress &amp; Arogya Expo 2026, Bhubaneswar. No patient-specific advice; no promises of jobs, admission, visa or funding.</p>
  ${body}</body></html>`;
  downloadBlob(html, `AYURDISHA_Mentor_Brief_${label.replace(/[^A-Za-z0-9]+/g, "_")}.doc`, "application/msword");
}

async function exportSubmissionRegister(subs, clusters) {
  const XLSX = await loadXlsx();
  const map = {};
  clusters.forEach(c => c.memberIds.forEach(id => { map[id] = c; }));
  const rows = [[
    "Ticket_ID", "Submitted", "Name", "Email", "Mobile", "State_UT", "Institution", "Programme_Stage",
    "WAC_Registered", "Registration_No", "In_Person", "Available_Days", "Theme", "Subtheme",
    "Question", "Context", "Ninety_Day_Outcome", "Anonymous_Publication_Consent", "Follow_Up_Consent",
    "Cluster_ID", "Cluster_Size", "Answer_Status",
  ]];
  subs.forEach(s => {
    const c = map[s.id];
    rows.push([
      s.ticket, new Date(s.createdAt).toLocaleString("en-IN"), s.name, s.email, s.mobile || "",
      s.state, s.institution, s.stage, s.registered, s.regNo || "", s.inPerson, (s.days || []).join("; "),
      s.theme, s.subtheme, s.question, s.context || "", s.outcome || "",
      s.consentPublish, s.consentFollow, c ? c.id : "Not clustered", c ? c.memberIds.length : "",
      c ? c.status : "Awaiting clustering",
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = rows[0].map((_, i) => ({ wch: [14, 18, 20, 26, 14, 18, 30, 24, 14, 16, 12, 30, 34, 26, 70, 46, 40, 16, 14, 12, 11, 18][i] || 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SUBMISSIONS");
  downloadBlob(XLSX.write(wb, { bookType: "xlsx", type: "array" }), "AYURDISHA_Submission_Register.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function wacColKey(h) {
  const s = String(h || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (/^(name|fullname|studentname|student|sname)$/.test(s)) return "name";
  if (/email|mailid|e-?mail/.test(s) || s === "mail") return "email";
  if (/institut|college|university|organisation|organization/.test(s)) return "institute";
  if (/delegat|regno|registration|regn|ayurdisha|wac/.test(s) || s === "no" || s === "number") return "regNo";
  if (/select|shortlist|status|chosen|inperson/.test(s)) return "selected";
  return null;
}

function parseSelectedCell(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return true;
  if (/^(no|n|0|false|not selected|waitlist|rejected)$/.test(s)) return false;
  return true;
}

async function parseWacWorkbook(file) {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!grid.length) throw new Error("The file has no rows.");
  let headIdx = 0;
  let map = {};
  for (let i = 0; i < Math.min(grid.length, 8); i++) {
    const trial = {};
    (grid[i] || []).forEach((h, c) => {
      const k = wacColKey(h);
      if (k && trial[k] == null) trial[k] = c;
    });
    if (trial.name != null || trial.email != null || trial.regNo != null) {
      headIdx = i;
      map = trial;
      break;
    }
  }
  if (map.name == null && map.email == null && map.regNo == null) {
    throw new Error("Could not find Name, Email, or WAC registration number columns.");
  }
  const get = (r, k) => {
    const i = map[k];
    return i == null ? "" : String(r[i] ?? "").trim();
  };
  const hasSelected = map.selected != null;
  const rows = grid.slice(headIdx + 1)
    .map(r => ({
      name: get(r, "name"),
      email: get(r, "email"),
      institute: get(r, "institute"),
      regNo: get(r, "regNo"),
      selected: hasSelected ? parseSelectedCell(get(r, "selected")) : true,
    }))
    .filter(r => r.name || r.email || r.regNo);
  if (!rows.length) throw new Error("No student rows under that header.");
  return rows;
}

async function exportWacResults(rows, filename) {
  const XLSX = await loadXlsx();
  const body = (rows || []).map(r => [
    r.name || "", r.email || "", r.institute || "", r.regNo || "",
    r.selected === false ? "No" : "Yes",
  ]);
  const aoa = [["Name", "Email", "Institute", "WAC_Reg_No", "Selected"], ...body];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 28 }, { wch: 32 }, { wch: 36 }, { wch: 14 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SELECTED");
  const name = (filename || "AYURDISHA_WAC_Bhubaneswar_selected.xlsx").replace(/[^\w.\-]+/g, "_");
  const out = name.toLowerCase().endsWith(".xlsx") ? name : `${name}.xlsx`;
  downloadBlob(XLSX.write(wb, { bookType: "xlsx", type: "array" }), out,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

async function readAnswerWorkbook(file) {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames.find(n => n.toUpperCase().includes("MENTOR")) || wb.SheetNames[0];
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
  if (!grid.length) throw new Error("The file has no rows.");
  const head = grid[0].map(h => String(h).trim());
  const at = name => head.indexOf(name);
  const get = (r, name) => { const i = at(name); return i < 0 ? "" : String(r[i] ?? "").trim(); };
  const extras = r => ({
    actions: [get(r, "ACTION_1"), get(r, "ACTION_2"), get(r, "ACTION_3")],
    mistake: get(r, "COMMON_MISTAKE"),
    resources: [get(r, "RESOURCE_1"), get(r, "RESOURCE_2")],
    mentorName: get(r, "MENTOR_NAME_DESIGNATION"),
  });
  const mergedAnswer = r => get(r, "MERGED_ANSWER") || get(r, "ANSWER");

  if (at("Ticket_ID") >= 0 && at("Cluster_ID") < 0) {
    return grid.slice(1).filter(r => get(r, "Ticket_ID")).map(r => ({
      kind: "individual",
      ticket: get(r, "Ticket_ID"),
      id: get(r, "Question_ID"),
      answer: get(r, "ANSWER") || get(r, "INDIVIDUAL_ANSWER"),
      ...extras(r),
    }));
  }
  if (at("Cluster_ID") < 0) {
    throw new Error("Use a sheet exported from the mentor pack (Cluster_ID or Ticket_ID column).");
  }

  const clusterMap = new Map();
  const individuals = [];
  grid.slice(1).forEach(r => {
    const cid = get(r, "Cluster_ID");
    if (!cid) return;
    const ticket = get(r, "Ticket_ID");
    const indAns = get(r, "INDIVIDUAL_ANSWER");
    if (ticket && indAns) {
      individuals.push({
        kind: "individual",
        ticket,
        id: get(r, "Question_ID"),
        answer: indAns,
        ...extras(r),
      });
    }
    const mAns = mergedAnswer(r);
    if (!clusterMap.has(cid)) {
      clusterMap.set(cid, {
        kind: "cluster",
        id: cid,
        answer: "",
        composite: get(r, "Composite_Question"),
        actions: ["", "", ""],
        mistake: "",
        resources: ["", ""],
        mentorName: "",
      });
    }
    const c = clusterMap.get(cid);
    if (mAns && !c.answer) c.answer = mAns;
    if (!c.composite) c.composite = get(r, "Composite_Question");
    extras(r).actions.forEach((a, i) => { if (a && !c.actions[i]) c.actions[i] = a; });
    if (!c.mistake) c.mistake = extras(r).mistake;
    extras(r).resources.forEach((res, i) => { if (res && !c.resources[i]) c.resources[i] = res; });
    if (!c.mentorName) c.mentorName = extras(r).mentorName;
  });

  return [...clusterMap.values(), ...individuals];
}

async function exportIndividualWorkbook(subs) {
  const XLSX = await loadXlsx();
  const rows = [[
    "Ticket_ID", "Question_ID", "WAC_Reg_No", "Name", "Email", "Institution",
    "Theme", "Subtheme", "Question", "Context", "ANSWER",
    "ACTION_1", "ACTION_2", "ACTION_3", "COMMON_MISTAKE",
    "RESOURCE_1", "RESOURCE_2", "MENTOR_NAME_DESIGNATION",
  ]];
  subs.forEach(s => rows.push([
    s.ticket, s.id, s.regNo || s.delegateNo || "", s.name || "", s.email || "",
    s.institution || "", s.theme, s.subtheme, s.question, s.context || "",
    s.individualAnswer || "", "", "", "", "", "", "", "",
  ]));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = rows[0].map((_, i) => ({ wch: [14, 14, 12, 20, 26, 28, 28, 22, 60, 36, 70, 28, 28, 28, 28, 28, 28, 28][i] || 18 }));
  const notes = XLSX.utils.aoa_to_sheet([
    ["AYURDISHA — Individual (did not merge) answer sheet"],
    ["One row per student. Use for personal mentor replies outside a merged hall answer."],
    ["Fill ANSWER and the capitalised columns. Do not change Ticket_ID."],
    ["Imported answers appear immediately on Track my answer for that ticket."],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "INDIVIDUAL_BRIEF");
  XLSX.utils.book_append_sheet(wb, notes, "HOW_TO_FILL");
  downloadBlob(XLSX.write(wb, { bookType: "xlsx", type: "array" }),
    "AYURDISHA_Individual_Answers.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

/* ------------------------------------------------------------------ */
/* Small UI pieces                                                     */
/* ------------------------------------------------------------------ */

function Field({ label, hint, required, children, counter, error, htmlFor }) {
  const autoId = useId();
  const fid = htmlFor || (React.isValidElement(children) && children.props.id) || autoId;
  const hintId = hint ? `${fid}-hint` : undefined;
  const errId = error ? `${fid}-err` : undefined;
  const described = [hintId, errId].filter(Boolean).join(" ") || undefined;
  const isControl = React.isValidElement(children) && typeof children.type === "string"
    && /^(input|select|textarea)$/.test(children.type);
  const control = isControl
    ? React.cloneElement(children, {
        id: children.props.id || fid,
        "aria-invalid": error ? true : children.props["aria-invalid"],
        "aria-describedby": described || children.props["aria-describedby"],
      })
    : children;
  return (
    <div className="aym-field" style={{ marginBottom: 16 }}>
      <label htmlFor={fid} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.maroon }}>
          {label}{required && <span style={{ color: C.gold }}> *</span>}
        </span>
        {counter && <span style={{ fontSize: 11.5, color: C.muted }} className="aym-mono">{counter}</span>}
      </label>
      {control}
      {hint && <div id={hintId} style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{hint}</div>}
      {error && <div id={errId} className="aym-field-error" role="alert">{error}</div>}
    </div>
  );
}

function Chip({ tone = "tan", children }) {
  const tones = {
    tan: { bg: C.tan, fg: C.maroon },
    gold: { bg: C.goldSoft, fg: "#5A4310" },
    maroon: { bg: C.maroon, fg: "#fff" },
    green: { bg: "#DDEDE3", fg: C.green },
    grey: { bg: "#EFE9DE", fg: C.muted },
  }[tone];
  return <span className="aym-chip" style={{ background: tones.bg, color: tones.fg }}>{children}</span>;
}

function Section({ number, title, blurb, children }) {
  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", marginBottom: 4 }}>
        {number && <span className="aym-mono" style={{ fontSize: 12, color: C.gold, fontWeight: 700 }}>{number}</span>}
        <h2 className="aym-display" style={{ fontSize: 22, color: C.maroon, margin: 0, fontWeight: 700 }}>{title}</h2>
      </div>
      {blurb && <p style={{ fontSize: 13.5, color: C.muted, margin: "0 0 14px", maxWidth: 700 }}>{blurb}</p>}
      {children}
    </section>
  );
}

function Notice({ tone = "info", children }) {
  const map = { info: [C.tan, C.maroon], warn: ["#FBEEDC", "#8A5A12"], ok: ["#DDEDE3", C.green], bad: ["#F8E2E2", "#8B2020"] };
  const [bg, fg] = map[tone];
  return (
    <div className="aym-notice" style={{ background: bg, color: fg }} role={tone === "bad" || tone === "warn" ? "alert" : "status"}>
      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Intro roadmap — first thing visitors see                            */
/* ------------------------------------------------------------------ */

function IntroLeaves() {
  const leaves = useMemo(() => Array.from({ length: 10 }, (_, i) => ({
    left: (i * 5.7 + 2) % 96,
    delay: (i * 1.15) % 14,
    dur: 11 + (i % 7) * 2.2,
    size: 14 + (i % 6) * 5,
    hue: i % 3,
  })), []);
  const motes = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    left: 8 + (i * 7.4) % 84,
    delay: (i * 0.8) % 8,
    dur: 7 + (i % 5) * 1.6,
  })), []);
  return (
    <div className="aym-leaf-field aym-intro-leaves" aria-hidden="true">
      {leaves.map((l, i) => (
        <span key={i} className="aym-leaf-drift"
          style={{ left: `${l.left}%`, animationDelay: `${l.delay}s`, animationDuration: `${l.dur}s`,
            color: l.hue === 0 ? "rgba(149,213,178,.62)" : l.hue === 1 ? "rgba(196,164,132,.55)" : "rgba(245,235,224,.45)" }}>
          <svg viewBox="0 0 24 24" width={l.size} height={l.size} fill="currentColor">
            <path d="M12 2C17.5 8 18.5 15 12 22 5.5 15 6.5 8 12 2Z" />
            <path d="M12 4v16" stroke="rgba(15,42,31,.4)" strokeWidth="1" fill="none" />
          </svg>
        </span>
      ))}
      {motes.map((m, i) => (
        <i key={`m${i}`} className="aym-intro-mote"
          style={{ left: `${m.left}%`, animationDelay: `${m.delay}s`, animationDuration: `${m.dur}s` }} />
      ))}
    </div>
  );
}

const ROAD_STEPS = [
  { n: "01", title: "Verify email", body: "Register with a real email. Receive a 6-digit code to verify your identity.", Icon: UserPlus },
  { n: "02", title: "Issued WAC number", body: "The hall issues your unique 11WAC/2026/NNNN number instantly — yours for the Congress.", Icon: Ticket },
  { n: "03", title: "Ask Desk", body: "File one focused career question. A mentor reads it — not a chatbot.", Icon: Send },
  { n: "04", title: "Track my answer", body: "A written answer lands on your ticket. Follow the guidance at your own pace.", Icon: MessageCircle },
];
const ROAD_FORK = [
  { n: "05", title: "Bhubaneswar Floor", body: "Shortlisted mentees are invited for an in-person Meet the Mentors visit at WAC 2026.", Icon: Calendar, tone: "gold" },
  { n: "06", title: "Digital Mentorship", body: "Everyone else keeps using this hall online — same mentor access, anywhere you are.", Icon: Compass, tone: "leaf" },
];

function RoadStep({ step, className = "" }) {
  const Icon = step.Icon;
  return (
    <div role="listitem" className={`aym-road-step ${className}`.trim()}>
      <span className="aym-road-n aym-mono">{step.n}</span>
      <span className="aym-road-icon"><Icon size={16} /></span>
      <h3>{step.title}</h3>
      <p>{step.body}</p>
    </div>
  );
}

const LAND_FAQS = [
  {
    q: "Is this medical advice?",
    a: "No. AYURDISHA provides professional career guidance for BAMS students and practitioners. It is not for diagnosis, treatment, or patient care.",
  },
  {
    q: "Who are the mentors?",
    a: "Mentors are distinguished leaders in Ayurveda, including Vice Chancellors, heads of institutes, scientists, and veteran clinical practitioners.",
  },
  {
    q: "Can I ask multiple questions?",
    a: "The hall is designed for one high-quality, focused career question per registered delegate to ensure mentors can provide meaningful guidance.",
  },
  {
    q: "What if I already have a WAC pass?",
    a: "This digital hall is independent of your physical pass. Everyone registers here to receive a digital tracking number for the Meet the Mentors sessions.",
  },
];

function LandingPage({ onGetStarted, onRegister, onAsk, onStaff }) {
  const heroRef = useRef(null);
  const [shift, setShift] = useState({ x: 0, y: 0 });
  const mentorN = mentorsWithNames(MENTORS).length;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const el = heroRef.current;
    if (!el) return;
    let raf = 0;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * 12;
      const y = ((e.clientY - r.top) / r.height - 0.5) * 8;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setShift({ x, y }));
    };
    el.addEventListener("pointermove", onMove);
    return () => {
      el.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  const hallShift = { transform: `translate3d(${shift.x * 0.4}px, ${shift.y * 0.35}px, 0) scale(1.06)` };
  const podsShift = { transform: `translate3d(${shift.x * 0.75}px, ${shift.y * 0.55}px, 0) scale(1.08)` };

  return (
    <div className="aym-land">
      <section className="aym-land-hero" ref={heroRef} aria-labelledby="land-h1">
        <div className="aym-land-bleed" aria-hidden="true">
          <div className="aym-land-bleed-shift" style={hallShift}>
            <div className="aym-land-bleed-photo aym-land-bleed-hall" />
          </div>
          <div className="aym-land-bleed-shift" style={podsShift}>
            <div className="aym-land-bleed-photo aym-land-bleed-pods" />
          </div>
          <div className="aym-land-veil" />
        </div>
        <div className="aym-land-botanical" aria-hidden="true" />
        <div className="aym-land-hero-leaf" aria-hidden="true" />
        <IntroLeaves />

        <div className="aym-land-hero-grid">
          <div className="aym-land-hero-copy">
            <div className="aym-eyebrow aym-land-kicker">AYURDISHA · 11th World Ayurveda Congress · Bhubaneswar 2026</div>
            <h1 id="land-h1" className="aym-display">Meet the Mentors</h1>
            <p className="aym-land-lede">
              AYURDISHA is the digital Meet the Mentors hall of the World Ayurveda Congress.
              WAC delegates register, receive an issued WAC number, and sit with a mentor —
              on your phone or laptop, then on the Bhubaneswar floor.
            </p>
            <div className="aym-land-hero-actions">
              <button type="button" className="aym-land-cta" onClick={onAsk || onGetStarted}>
                Ask a question <ArrowRight size={18} aria-hidden="true" />
              </button>
              <Link to="/programs" className="aym-btn aym-btn-gold">
                Explore career paths
              </Link>
              <button type="button" className="aym-btn aym-btn-ghost" onClick={onRegister}>
                <UserPlus size={16} aria-hidden="true" /> Register
              </button>
            </div>
            <ul className="aym-land-trust">
              <li>World Ayurveda Foundation</li>
              <li>11–13 December 2026</li>
              <li>{mentorN} tentative mentors on the WAC roster</li>
            </ul>
          </div>
          <div className="aym-land-frames" aria-hidden="true">
            <figure className="aym-land-frame aym-land-frame-stage">
              <div className="aym-land-frame-img aym-land-frame-img-stage" />
              <figcaption>The stage · Meet the Mentors</figcaption>
            </figure>
            <figure className="aym-land-frame aym-land-frame-pods">
              <div className="aym-land-frame-img aym-land-frame-img-pods" />
              <figcaption>Mentor pods · WAC Bhubaneswar</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <div className="aym-land-body">
        <section className="aym-land-section" id="how-it-works" aria-labelledby="land-how-title">
          <div className="aym-land-how-split">
            <div className="aym-land-how-media" aria-hidden="true">
              <div className="aym-land-how-shot aym-land-how-shot-stage" />
              <div className="aym-land-how-shot aym-land-how-shot-pods" />
            </div>
            <div className="aym-land-section-head">
              <div className="aym-eyebrow">The Digital Hall</div>
              <h2 id="land-how-title" className="aym-display">How the path works</h2>
              <p>
                AYURDISHA is built on a clear journey: register, verify, ask, and track. 
                Whether online or in-person, your guidance remains accessible.
              </p>
            </div>
          </div>

          <p className="aym-land-path-label">Your path through the hall</p>
          <div className="aym-roadmap aym-land-roadmap" role="list" aria-label="How AYURDISHA works">
            <div className="aym-road-row">
              {ROAD_STEPS.map(step => <RoadStep key={step.n} step={step} />)}
            </div>
            <div className="aym-road-fork-join" aria-hidden="true">
              <svg viewBox="0 0 100 36" preserveAspectRatio="none">
                <path className="aym-road-draw" d="M50 0 v10 M20 36 Q50 10 80 36" fill="none" stroke="rgba(160,120,80,.7)" strokeWidth="1.2" />
              </svg>
            </div>
            <div className="aym-road-fork">
              <RoadStep step={ROAD_FORK[0]} className="aym-road-step-gold" />
              <RoadStep step={ROAD_FORK[1]} className="aym-road-step-leaf" />
            </div>
          </div>
        </section>

        <section className="aym-land-section" id="career-paths" aria-labelledby="land-tracks-title">
          <div className="aym-land-section-head">
            <div className="aym-eyebrow">Career paths</div>
            <h2 id="land-tracks-title" className="aym-display">Ten Ayurveda career tracks</h2>
            <p>Every question in the hall is tagged to one of ten national career tracks. Explore each track's roles, qualifications, and pathways.</p>
          </div>
          <div className="aym-land-tracks" role="list">
            {getAllPrograms().map(p => (
              <Link key={p.code} to={p.path} className="aym-land-track-card" role="listitem">
                <span className="aym-land-track-code">{p.code}</span>
                <span className="aym-land-track-title">{p.title}</span>
                <span className="aym-land-track-tag">{p.tagline}</span>
                <span className="aym-land-track-more">Explore track <ArrowRight size={13} aria-hidden="true" /></span>
              </Link>
            ))}
          </div>
          <div className="aym-land-end" style={{ marginTop: 20 }}>
            <Link to="/programs" className="aym-btn aym-btn-gold">All career paths <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </section>

        <section className="aym-land-section" id="who-its-for" aria-labelledby="land-who-title">
          <div className="aym-land-who-banner" role="img" aria-label="Meet the Mentors hall at WAC Bhubaneswar" />
          <div className="aym-land-section-head">
            <div className="aym-eyebrow">Who it is for</div>
            <h2 id="land-who-title" className="aym-display">Delegates, mentees, and the Congress desk</h2>
          </div>
          <div className="aym-land-who">
            <article className="aym-land-who-card">
              <div className="aym-land-who-shot aym-land-who-shot-pods" aria-hidden="true" />
              <GraduationCap size={22} />
              <h3>BAMS mentees</h3>
              <p>Students, interns, graduates, and practitioners. No Congress pass is required to use AYURDISHA online.</p>
            </article>
            <article className="aym-land-who-card">
              <div className="aym-land-who-shot aym-land-who-shot-stage" aria-hidden="true" />
              <Users size={22} />
              <h3>Mentors and staff</h3>
              <p>Curation, insights, and the mentor pack sit behind the staff PIN on the same hall.</p>
            </article>
          </div>
          <div className="aym-land-end">
            <button type="button" className="aym-land-cta aym-land-cta-forest" onClick={onRegister}>
              Register <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button type="button" className="aym-btn aym-btn-gold" onClick={onGetStarted}>
              Enter the hall
            </button>
          </div>
        </section>

        <section className="aym-land-section aym-land-section-alt" id="faq" aria-labelledby="land-faq-title">
          <div className="aym-land-section-head">
            <div className="aym-eyebrow">Questions</div>
            <h2 id="land-faq-title" className="aym-display">Before you walk in</h2>
          </div>
          <div className="aym-land-faq">
            {LAND_FAQS.map(item => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hall — walk into Meet the Mentors                                   */
/* ------------------------------------------------------------------ */

function MentorConnectScene({ compact = false }) {
  return (
    <div className={`aym-connect-scene${compact ? " aym-connect-scene-compact" : ""}`} aria-hidden="true">
      <div className="aym-connect-bleed" />
      <div className="aym-connect-botanical" />
      <div className="aym-connect-leaves">
        <span className="aym-connect-leaf aym-connect-leaf-a" />
        <span className="aym-connect-leaf aym-connect-leaf-b" />
        <span className="aym-connect-leaf aym-connect-leaf-c" />
      </div>
      <div className="aym-connect-frame aym-connect-frame-mentee">
        <div className="aym-connect-frame-inner" style={{ backgroundImage: "url(/assets/hall-pods.png)" }} />
      </div>
      <div className="aym-connect-bridge" aria-hidden="true">
        <svg viewBox="0 0 120 48" className="aym-connect-arc" preserveAspectRatio="none">
          <path d="M4 40 Q60 4 116 40" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="6 8" />
        </svg>
        <span className="aym-connect-glow" />
        <HeartHandshake size={compact ? 16 : 22} className="aym-connect-icon" />
      </div>
      <div className="aym-connect-frame aym-connect-frame-mentor">
        <div className="aym-connect-frame-inner" style={{ backgroundImage: "url(/assets/hall-stage.png)" }} />
      </div>
      {!compact && (
        <div className="aym-connect-mcg">
          <span>Meet</span><span>Connect</span><span>Grow</span>
        </div>
      )}
    </div>
  );
}

function WacResultsSection({ staff, delegates, questions, onClose }) {
  const fileRef = useRef(null);
  const wacVersionRef = useRef(1);
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [mailProg, setMailProg] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api("wacResultsGet");
      wacVersionRef.current = r.version ?? 1;
      setMeta(r);
    } catch (e) {
      setErr(e.message || "Could not load results.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = meta && Array.isArray(meta.rows) ? meta.rows : [];
  const selectedN = meta && typeof meta.count === "number"
    ? meta.count
    : rows.filter(r => r.selected !== false).length;
  const published = Boolean(meta && meta.published);

  async function saveRows(nextRows, filename) {
    setBusy("save"); setErr(""); setNote("");
    try {
      const r = await api("wacResultsSave", {
        rows: nextRows,
        filename: filename || meta?.filename,
        version: wacVersionRef.current,
      });
      wacVersionRef.current = r.version ?? wacVersionRef.current;
      setMeta(r);
      setNote(`Saved ${r.total} row${r.total === 1 ? "" : "s"} (${r.count} selected). ${r.published ? "Live download updated." : "Not published yet — public still sees “soon”."}`);
    } catch (e) {
      if (e.status === 409 && e.data?.wacVersion != null) {
        wacVersionRef.current = e.data.wacVersion;
        await load();
      }
      setErr(e.message || "Save failed.");
    }
    setBusy("");
  }

  async function onUpload(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy("upload"); setErr(""); setNote("");
    try {
      const parsed = await parseWacWorkbook(file);
      await saveRows(parsed, file.name);
    } catch (ex) {
      setErr(ex.message || "Could not read that Excel file.");
      setBusy("");
    }
  }

  function fromDelegates() {
    const next = (delegates || []).map(u => ({
      name: u.name || "", email: u.email || "", institute: u.institute || "",
      regNo: u.regNo || "", selected: true,
    })).filter(r => r.email || r.regNo);
    if (!next.length) { setErr("No registered delegates on the desk yet."); return; }
    saveRows(next, "registered-delegates.xlsx");
  }

  function fromInPerson() {
    const seen = new Set();
    const next = [];
    (questions || []).forEach(s => {
      if (String(s.inPerson || "") !== "Yes") return;
      const key = String(s.email || s.regNo || "").toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      next.push({
        name: s.name || "", email: s.email || "", institute: s.institution || "",
        regNo: s.delegateNo || s.regNo || "", selected: true,
      });
    });
    if (!next.length) { setErr("No Ask Desk submissions marked in-person yet."); return; }
    saveRows(next, "ask-desk-in-person.xlsx");
  }

  async function setPublished(want) {
    setBusy(want ? "pub" : "unpub"); setErr(""); setNote("");
    try {
      const r = await api("wacResultsPublish", { published: want, version: wacVersionRef.current });
      wacVersionRef.current = r.version ?? wacVersionRef.current;
      setMeta(r);
      setNote(want
        ? "Results are live. Visitors can download the Excel from this hall."
        : "Unpublished. The hall shows “Results will be published soon” again.");
    } catch (e) {
      if (e.status === 409 && e.data?.wacVersion != null) {
        wacVersionRef.current = e.data.wacVersion;
        await load();
      }
      setErr(e.message || "Could not update publication.");
    }
    setBusy("");
  }

  async function mailAll() {
    if (!staff) return;
    const n = selectedN;
    if (!n) { setErr("No selected students to email."); return; }
    if (!window.confirm(`Email all ${n} selected student${n === 1 ? "" : "s"} now? Sends one notice each, with a short pause so Gmail is not flooded.`)) return;
    setBusy("mail"); setErr(""); setNote("");
    setMailProg({ sent: 0, failed: 0, total: n });
    let offset = 0;
    let sent = 0;
    let failed = 0;
    let delivery = "email";
    try {
      while (true) {
        const r = await api("wacResultsMail", { offset });
        sent += r.sent || 0;
        failed += r.failed || 0;
        if (r.delivery === "console") delivery = "console";
        offset = r.nextOffset || offset;
        setMailProg({ sent, failed, total: r.total || n });
        if (!r.remaining) break;
      }
      setNote(delivery === "console"
        ? `Dev fallback (no SMTP on this machine): ${sent} logged to the server console, ${failed} failed.`
        : `Mailed ${sent} selected student${sent === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.`);
      await load();
    } catch (e) {
      setErr(e.message || "Mailing stopped.");
    }
    setBusy("");
    setMailProg(null);
  }

  return (
    <section className="aym-wac" id="wac-results">
      <div className="aym-wac-media" aria-hidden="true" />
      <div className="aym-wac-copy">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div className="aym-eyebrow" style={{ color: "var(--oak)" }}>11th World Ayurveda Congress · Bhubaneswar</div>
          {onClose && (
            <button type="button" className="aym-btn aym-btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5, color: "#F5EBE0", borderColor: "rgba(196,164,132,.45)" }}
              onClick={onClose}>
              <X size={14} /> Back to hall map
            </button>
          )}
        </div>
        <h2 className="aym-display">Results — selected students for Bhubaneswar WAC programme</h2>
        {published ? (
          <>
            <p>
              The official list is published. Download the Excel and search your name, email,
              or WAC registration number to see whether you are selected.
            </p>
            <div className="aym-wac-actions">
              <button type="button" className="aym-btn aym-btn-cream" onClick={() => exportWacResults(rows, meta.filename)}>
                <Download size={16} /> Download Excel
              </button>
              <span className="aym-wac-count">{selectedN} selected</span>
            </div>
          </>
        ) : (
          <>
            <p className="aym-wac-soon">Results will be published soon.</p>
            <p>
              When the guider releases the official list, you will be able to download an Excel
              sheet here and find yourself by name, email, institute, or WAC registration number.
            </p>
          </>
        )}

        {staff && (
          <div className="aym-wac-staff">
            <div className="aym-eyebrow">Staff — selection desk</div>
            <p>
              Upload or replace the official Excel, publish it for every visitor, or mail selected
              students. Public visitors never see these controls.
            </p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onUpload} />
            <div className="aym-wac-actions">
              <button type="button" className="aym-btn aym-btn-cream" disabled={!!busy}
                onClick={() => fileRef.current && fileRef.current.click()}>
                {busy === "upload" || busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Upload / replace Excel
              </button>
              <button type="button" className="aym-btn aym-btn-ghost" disabled={!!busy} onClick={fromDelegates}
                style={{ color: "#fff", borderColor: "rgba(245,235,224,.35)" }}>
                <Users size={14} /> From registered delegates
              </button>
              <button type="button" className="aym-btn aym-btn-ghost" disabled={!!busy} onClick={fromInPerson}
                style={{ color: "#fff", borderColor: "rgba(245,235,224,.35)" }}>
                <Calendar size={14} /> From in-person Ask Desk
              </button>
              <button type="button" className="aym-btn aym-btn-gold" disabled={!!busy || !rows.length}
                onClick={() => setPublished(!published)}>
                {busy === "pub" || busy === "unpub" ? <Loader2 size={14} className="animate-spin" /> : <Award size={14} />}
                {published ? "Unpublish" : "Publish results"}
              </button>
              <button type="button" className="aym-btn aym-btn-cream" disabled={!!busy || !selectedN}
                onClick={mailAll}>
                {busy === "mail" ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                Email all selected
              </button>
              {rows.length > 0 && (
                <button type="button" className="aym-btn aym-btn-ghost" disabled={!!busy}
                  style={{ color: "#fff", borderColor: "rgba(245,235,224,.35)" }}
                  onClick={() => exportWacResults(rows, meta.filename)}>
                  <FileSpreadsheet size={14} /> Download current list
                </button>
              )}
            </div>
            {mailProg && (
              <p className="aym-wac-mailprog">Sending… {mailProg.sent} sent, {mailProg.failed} failed, of {mailProg.total}.</p>
            )}
            {note && <p className="aym-wac-note">{note}</p>}
            {err && <p className="aym-wac-err">{err}</p>}
            {rows.length > 0 && (
              <div className="aym-wac-tablewrap">
                <table className="aym-table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Email</th><th>Institute</th><th>WAC registration number</th><th>Selected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 80).map((r, i) => (
                      <tr key={(r.regNo || r.email || r.name) + i}>
                        <td>{r.name}</td>
                        <td>{r.email}</td>
                        <td>{r.institute}</td>
                        <td className="aym-mono">{r.regNo}</td>
                        <td>{r.selected === false ? "No" : "Yes"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 80 && <p className="aym-wac-note">{rows.length - 80} more in the file — download to see every row.</p>}
              </div>
            )}
          </div>
        )}
        {!staff && err && <p className="aym-wac-err">{err}</p>}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Hall — walk into Meet the Mentors                                   */
/* ------------------------------------------------------------------ */

const HALL_BEATS = [
  {
    n: "01",
    title: "You ask",
    body: "One focused career question — PG, clinic, research, AYUSH, start-up, or practice abroad.",
    Icon: Send,
  },
  {
    n: "02",
    title: "A mentor answers",
    body: "Guidance returns to the hall: a sitting with someone who has walked the path you are choosing.",
    Icon: MessageCircle,
  },
  {
    n: "03",
    title: "Published on stage",
    body: "What many asked together can be shared on the open floor — so the Congress learns as you do.",
    Icon: Sparkles,
  },
];

function HallView({ onEnter, staff, delegates, questions }) {
  const [resultsOpen, setResultsOpen] = useState(false);

  const openResults = useCallback(() => {
    setResultsOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("wac-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return (
    <div id="main">
      <section className="aym-hero">
        <div className="aym-hero-leaf" />
        <div className="aym-hero-glow" aria-hidden="true" />
        <div className="aym-hero-inner">
          <div className="aym-eyebrow" style={{ color: C.oak }}>AYURDISHA · 11th World Ayurveda Congress · Bhubaneswar 2026</div>
          <h1 className="aym-display">The Hall</h1>
          <div className="aym-hero-rule" aria-hidden="true" />
          <p className="aym-hero-sub">
            Meet the Mentors — a quiet career floor at World Ayurveda Congress.
            Podcast conversations and the Congress selection board live here.
          </p>
          <MentorConnectScene />
        </div>
      </section>

      <div className="aym-hall">
        <section className="aym-hall-floor" aria-labelledby="hall-beats-title">
          <div className="aym-eyebrow" style={{ color: C.oak }}>What happens in this hall</div>
          <h2 id="hall-beats-title" className="aym-display aym-hall-floor-title">Ask. Sit. The floor grows.</h2>
          <p className="aym-hall-floor-lede">
            AYURDISHA is a career hall for BAMS mentees: a question, a mentor’s answer,
            then the Congress stage when the hall is ready to share it.
          </p>
          <ol className="aym-hall-beats">
            {HALL_BEATS.map(({ n, title, body, Icon }) => (
              <li key={n} className="aym-hall-beat">
                <span className="aym-hall-beat-n aym-mono">{n}</span>
                <span className="aym-hall-beat-icon" aria-hidden="true"><Icon size={16} /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="aym-hall-atmo" aria-label="Congress atmosphere">
          <figure className="aym-hall-atmo-shot aym-hall-atmo-pods">
            <figcaption>Wooden pods</figcaption>
          </figure>
          <figure className="aym-hall-atmo-shot aym-hall-atmo-stage">
            <figcaption>The stage</figcaption>
          </figure>
          <figure className="aym-hall-atmo-shot aym-hall-atmo-hall">
            <figcaption>Bhubaneswar 2026</figcaption>
          </figure>
        </section>

        <div className="aym-hall-zones">
          <div className="aym-eyebrow" style={{ marginBottom: 14 }}>On this floor</div>
          <div className="aym-zone-grid">
            <button type="button" className="aym-zone aym-zone-podc" onClick={() => onEnter("podcast")}>
              <div className="aym-zone-media" aria-hidden="true" />
              <div>
                <div className="aym-eyebrow">Round table · mics</div>
                <h3>Podcast corner</h3>
                <p>Watch recorded mentor conversations from the hall — talks appear here after they are posted.</p>
              </div>
              <span className="aym-zone-cta"><Mic size={18} /> Open podcast corner →</span>
            </button>
            <button type="button" className={`aym-zone aym-zone-results aym-card${resultsOpen ? " aym-zone-results-open" : ""}`}
              onClick={openResults} aria-expanded={resultsOpen}>
              <div className="aym-zone-media" aria-hidden="true" />
              <div>
                <div className="aym-eyebrow">Congress shortlist · Bhubaneswar</div>
                <h3>Selection results</h3>
                <p>Students invited for the in-person Meet the Mentors programme at WAC Bhubaneswar. Tap to open the results board.</p>
              </div>
              <span className="aym-zone-cta"><Award size={18} /> Open results board →</span>
            </button>
          </div>
        </div>

        {resultsOpen && (
          <WacResultsSection
            staff={staff}
            delegates={delegates}
            questions={questions}
            onClose={() => setResultsOpen(false)}
          />
        )}

        <aside className="aym-hall-quote">
          <div className="aym-hall-quote-mcg" aria-hidden="true">
            <span>Meet</span><span>Connect</span><span>Grow</span>
          </div>
          <blockquote>
            <p>Sit with a mentor. Carry the answer onto the Congress floor.</p>
          </blockquote>
          <cite>AYURDISHA · Meet the Mentors · 11th World Ayurveda Congress</cite>
        </aside>
      </div>
    </div>
  );
}

/* Mentors directory + profile live in MentorsDirectory.jsx / MentorProfile.jsx */

function journalCardKey(card) {
  return `${card.url}|${card.title}`;
}

function KnowledgeJournalCarousel({ cards, onSelect }) {
  if (!cards?.length) return null;
  return (
    <div className="aym-know-journals">
      <div className="aym-know-journals-head">
        <h4>Top journals &amp; sources</h4>
        <Newspaper size={18} aria-hidden="true" />
      </div>
      <div className="aym-know-carousel" role="list">
        {cards.map(card => {
          const CardTag = onSelect ? "button" : "a";
          const cardProps = onSelect
            ? { type: "button", onClick: () => onSelect(card) }
            : { href: card.url, target: "_blank", rel: "noopener noreferrer" };
          return (
            <CardTag
              key={journalCardKey(card)}
              className="aym-know-story-card"
              role="listitem"
              {...cardProps}
            >
              <div className="aym-know-story-img-wrap">
                <div
                  className="aym-know-story-img"
                  style={{ backgroundImage: `url(${card.image || "/assets/hall-pods.png"})` }}
                />
              </div>
              <div className="aym-know-story-body">
                <h5>{card.title}</h5>
                <p className="aym-know-story-time">{card.publishedHint || card.time || "Official source"}</p>
                {card.snippet && <p className="aym-know-story-snippet">{card.snippet}</p>}
                <div className="aym-know-story-foot">
                  <span className="aym-know-story-source">
                    <span className="aym-know-story-logo" aria-hidden="true">{card.sourceLogo || card.source?.slice(0, 2)}</span>
                    {card.source}
                  </span>
                  <MoreVertical size={14} aria-hidden="true" />
                </div>
              </div>
            </CardTag>
          );
        })}
      </div>
    </div>
  );
}


function KnowledgeSourceRows({ rows }) {
  const [open, setOpen] = useState(null);
  if (!rows?.length) return null;
  return (
    <div className="aym-know-source-list">
      {rows.map((row, i) => {
        const key = row.headline.slice(0, 40);
        const expanded = open === key;
        const sourceLine = row.sources.length > 2
          ? `${row.sources.slice(0, 2).join(", ")} and more`
          : row.sources.join(", ");
        return (
          <div key={key} className="aym-know-source-row">
            <button
              type="button"
              className="aym-know-source-trigger"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : key)}
            >
              <div>
                <div className="aym-know-source-headline">{row.headline}</div>
                <div className="aym-know-source-meta">{sourceLine}</div>
              </div>
              <span className={`aym-know-source-chev${expanded ? " open" : ""}`} aria-hidden="true">
                <ChevronDown size={18} />
              </span>
            </button>
            {expanded && row.urls?.length > 0 && (
              <ul className="aym-know-source-links">
                {row.urls.map(u => (
                  <li key={u.url}>
                    <a href={u.url} target="_blank" rel="noopener noreferrer">
                      {u.label} <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}


function KnowledgeBulletList({ items, variant = "default" }) {
  if (!items?.length) return null;
  return (
    <ul className={`aym-know-bullets${variant === "gold" ? " aym-know-bullets-gold" : ""}${variant === "mitigation" ? " aym-know-bullets-mitigation" : ""}`}>
      {items.map(b => (
        <li key={b.slice(0, 56)}>{b}</li>
      ))}
    </ul>
  );
}

function KnowledgeKeyInsight({ text }) {
  if (!text) return null;
  return (
    <aside className="aym-know-insight" role="note">
      <div className="aym-know-insight-icon" aria-hidden="true"><Sparkles size={16} /></div>
      <div>
        <div className="aym-know-insight-label">Key insight</div>
        <p>{text}</p>
      </div>
    </aside>
  );
}

function KnowledgeAtAGlance({ items }) {
  if (!items?.length) return null;
  return (
    <div className="aym-know-glance">
      <h4 className="aym-know-glance-title">At a glance</h4>
      <dl className="aym-know-glance-grid">
        {items.map(({ label, value }) => (
          <div key={label} className="aym-know-glance-item">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function KnowledgeTabToc({ subsections }) {
  if (!subsections || subsections.length < 2) return null;
  return (
    <nav className="aym-know-toc" aria-label="Section contents">
      <span className="aym-know-toc-label">On this page</span>
      <ul>
        {subsections.map(sub => (
          <li key={sub.heading}>
            <a href={`#${sub.heading.replace(/\s+/g, "-").toLowerCase()}`}>{sub.heading}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function KnowledgeRichTabPanel({ tab, pod, section, overviewSection }) {
  const tc = pod.tabContent?.[tab];

  if (tab === "overview") {
    const prose = tc?.prose?.length ? tc.prose : pod.overviewProse;
    return (
      <>
        {prose?.map((p, i) => (
          <p key={p.slice(0, 48)} className={`aym-know-prose${i === 0 ? " aym-know-lead" : ""}`}>{p}</p>
        ))}
        {pod.pullQuote && (
          <blockquote className="aym-know-pullquote">
            <p>&ldquo;{pod.pullQuote.text}&rdquo;</p>
            <cite>{pod.pullQuote.attribution}</cite>
          </blockquote>
        )}
        {pod.statCallout && (
          <div className="aym-know-stat">
            <div className="aym-know-stat-num">{pod.statCallout.stat}</div>
            <div>
              <p className="aym-know-stat-label">{pod.statCallout.label}</p>
              <p className="aym-know-stat-caveat">{pod.statCallout.caveat}</p>
            </div>
          </div>
        )}
        {tc?.atAGlance && <KnowledgeAtAGlance items={tc.atAGlance} />}
        {tc?.keyInsight && <KnowledgeKeyInsight text={tc.keyInsight} />}
        {overviewSection && (
          <article className="aym-pod-know-card aym-know-rich-card">
            <h3>Key facts &amp; eligibility</h3>
            <KnowledgeBulletList items={overviewSection.bullets} variant="gold" />
          </article>
        )}
      </>
    );
  }

  if (!tc && section) {
    return (
      <article className="aym-pod-know-card aym-know-rich-card">
        <h3>{section.title}</h3>
        <KnowledgeBulletList items={section.bullets} variant="gold" />
      </article>
    );
  }

  if (!tc) return null;

  const tabTitles = {
    opportunities: "Opportunities landscape",
    challenges: "Real challenges & pitfalls",
    income: "Income & earning potential",
  };

  return (
    <>
      {tc.prose?.map((p, i) => (
        <p key={p.slice(0, 48)} className={`aym-know-prose${i === 0 ? " aym-know-lead" : ""}`}>{p}</p>
      ))}
      {tc.keyInsight && <KnowledgeKeyInsight text={tc.keyInsight} />}
      <KnowledgeTabToc subsections={tc.subsections} />
      {tc.subsections?.map(sub => (
        <article
          key={sub.heading}
          id={sub.heading.replace(/\s+/g, "-").toLowerCase()}
          className="aym-pod-know-card aym-know-rich-card aym-know-subsection"
        >
          <h3>{sub.heading}</h3>
          <KnowledgeBulletList items={sub.bullets} variant="gold" />
        </article>
      ))}
      {tc.bullets?.length > 0 && (
        <article className="aym-pod-know-card aym-know-rich-card">
          <h3>{tab === "challenges" ? "Common pitfalls" : tabTitles[tab] || section?.title}</h3>
          <KnowledgeBulletList items={tc.bullets} variant="gold" />
        </article>
      )}
      {tc.mitigationTips?.length > 0 && (
        <article className="aym-pod-know-card aym-know-rich-card aym-know-mitigation">
          <h3>Mitigation strategies</h3>
          <KnowledgeBulletList items={tc.mitigationTips} variant="mitigation" />
        </article>
      )}
      {section?.bullets?.length > 0 && tc.subsections && (
        <article className="aym-pod-know-card aym-know-rich-card aym-know-reference">
          <h3>Quick reference</h3>
          <KnowledgeBulletList items={section.bullets} />
        </article>
      )}
    </>
  );
}

function PodKnowledgeView({ pod, track, onBack, onEnterAsk }) {
  const [tab, setTab] = useState("overview");
  const section = getSectionForTab(pod, tab);
  const overviewSection = pod.sections.find(s => s.title === "Overview");

  return (
    <div className="aym-pod-know aym-pod-know-journal">
      <button type="button" className="aym-pod-know-back" onClick={onBack}>
        <ArrowLeft size={16} /> All themes
      </button>
      <header className="aym-pod-know-hero" aria-label={pod.title}>
        <div className="aym-pod-know-hero-bg" style={{ backgroundImage: `url(${pod.heroImage})` }} />
        <div className="aym-pod-know-hero-veil" />
        <div className="aym-pod-know-botanical" aria-hidden="true" />
        <div className="aym-pod-know-hero-frame aym-pod-know-hero-frame-a" aria-hidden="true" />
        <div className="aym-pod-know-hero-frame aym-pod-know-hero-frame-b" aria-hidden="true" />
        <div className="aym-pod-know-hero-copy">
          <div className="aym-eyebrow">{pod.code} · Career knowledge</div>
          <h2 className="aym-display">{pod.title}</h2>
          <p>{pod.tagline}</p>
        </div>
      </header>

      <div className="aym-know-tabs" role="tablist" aria-label="Knowledge sections">
        {KNOWLEDGE_TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`aym-know-tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="aym-pod-know-panel" role="tabpanel">
        {tab !== "journals" && (
          <KnowledgeRichTabPanel
            tab={tab}
            pod={pod}
            section={section}
            overviewSection={overviewSection}
          />
        )}

        {tab === "journals" && (
          <div className="aym-know-journals-wrap">
            {pod.journalCards?.length > 0 && (
              <KnowledgeJournalCarousel cards={pod.journalCards} />
            )}
            <KnowledgeSourceRows rows={pod.sourceRows} />
            <section className="aym-pod-know-refs">
              <h3>Reference library</h3>
              <p className="aym-pod-know-refs-note">Verified public sources — check pages for the latest notifications and figures.</p>
              <ul>
                {pod.references.map(ref => (
                  <li key={ref.url}>
                    <a href={ref.url} target="_blank" rel="noopener noreferrer">
                      {ref.label} <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>

      <footer className="aym-pod-know-cta">
        <button type="button" className="aym-btn aym-btn-primary" onClick={() => onEnterAsk(null)}>
          Have a specific question? Walk to Ask Desk <ArrowRight size={16} />
        </button>
        {track && (
          <button
            type="button"
            className="aym-pod-know-cta-theme"
            onClick={() => onEnterAsk({ theme: track.name, subtheme: track.subs[0] })}
          >
            Prefill Ask Desk with this theme
          </button>
        )}
      </footer>
    </div>
  );
}

function PodsView({ onEnterAsk }) {
  const [selectedCode, setSelectedCode] = useState(null);
  const [hubTab, setHubTab] = useState("overview");
  const pod = selectedCode ? getPodByCode(selectedCode) : null;
  const track = selectedCode ? TRACKS.find(t => t.code === selectedCode) : null;

  if (pod) {
    return (
      <PodKnowledgeView
        pod={pod}
        track={track}
        onBack={() => { setSelectedCode(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        onEnterAsk={onEnterAsk}
      />
    );
  }

  const hubCards = POD_KNOWLEDGE.flatMap(p => p.journalCards || []);

  return (
    <div className="aym-pods-hub aym-pod-know-journal">
      <div className="aym-pods-banner" role="img" aria-label="Wooden mentor pods in the Meet the Mentors hall" />
      <div className="aym-page-head">
        <div className="aym-eyebrow">Knowledge</div>
        <h1 className="aym-display">Ten paths after BAMS — authoritative career briefs.</h1>
        <p>Congress-grade guidance: long-form overviews, opportunities, challenges, income ranges, and curated journal links. When you are ready for a 1:1 mentor question, walk to the Ask Desk.</p>
      </div>

      <div className="aym-know-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={hubTab === "overview"} className={`aym-know-tab${hubTab === "overview" ? " active" : ""}`} onClick={() => setHubTab("overview")}>Overview</button>
        <button type="button" role="tab" aria-selected={hubTab === "journals"} className={`aym-know-tab${hubTab === "journals" ? " active" : ""}`} onClick={() => setHubTab("journals")}>Journals &amp; sources</button>
      </div>

      {hubTab === "overview" && (
        <div className="aym-pod-grid">
          {TRACKS.map(t => (
            <button key={t.code} className="aym-pod-card" onClick={() => { setSelectedCode(t.code); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              <div className="aym-mono" style={{ fontSize: 11, color: C.oak }}>{t.code}</div>
              <h3>{t.name}</h3>
              <p>{t.subs[0]}</p>
            </button>
          ))}
        </div>
      )}

      {hubTab === "journals" && (
        <div className="aym-know-journals-wrap">
          <p className="aym-know-hub-note aym-know-hub-prompt">Curated journals and official sources across all ten career themes.</p>
          <KnowledgeJournalCarousel cards={hubCards} />
        </div>
      )}
    </div>
  );
}

function ExchangeView({ onAskPath }) {
  return (
    <div>
      <div className="aym-exchange-hero">
        <img src="/assets/hall-exchange.png" alt="Opportunity Exchange wall in the Meet the Mentors hall" width={1180} height={420} />
      </div>
      <div className="aym-page-head">
        <div className="aym-eyebrow">Opportunity Exchange</div>
        <h1 className="aym-display">After BAMS — which wall is yours?</h1>
        <p>The poster wall in the hall. Each panel is a future: PG, clinic, research, public health, start-up, or practice abroad. Tap a path to walk it to the Ask Desk.</p>
      </div>
      <div className="aym-path-grid">
        {EXCHANGE_PATHS.map(p => (
          <button key={p.title} className="aym-path" onClick={() => onAskPath(p)}>
            <div className="aym-path-media" aria-hidden="true" />
            <div className="aym-path-head">Opportunity Exchange</div>
            <h3>{p.title}</h3>
            <p>{p.blurb}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Ask — walking up to the Ask Desk                                 */
/* ------------------------------------------------------------------ */

const BLANK = {
  name: "", email: "", mobile: "", state: "", institution: "", stage: "",
  registered: "", regNo: "", inPerson: "", days: [],
  theme: "", subtheme: "", question: "", context: "", outcome: "",
  consentFollow: "",
};

function AskView({ onSaved, preset, profile, onGoRegister }) {
  const blankFromProfile = (p) => {
    const next = {
      ...BLANK,
      ...(preset || {}),
      ...(p ? {
        name: p.name || "",
        email: p.email || "",
        institution: p.institute || "",
        regNo: p.regNo || "",
      } : {}),
    };
    // Issued WAC number means they already registered — answer Yes without asking again.
    if (String(next.regNo || "").trim()) next.registered = "Yes";
    return next;
  };
  const [f, setF] = useState(() => blankFromProfile(profile));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [errs, setErrs] = useState([]);
  const [autofillNote, setAutofillNote] = useState(() => (
    profile && profile.regNo ? `Filled from your WAC registration number ${profile.regNo}` : ""
  ));
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  function autofill() {
    if (!profile) return;
    setF(p => {
      const regNo = profile.regNo || p.regNo;
      return {
        ...p,
        name: profile.name,
        email: profile.email,
        institution: profile.institute,
        regNo,
        ...(String(regNo || "").trim() ? { registered: "Yes" } : {}),
      };
    });
    if (profile.regNo) setAutofillNote(`Filled from your WAC registration number ${profile.regNo}`);
    else setAutofillNote("Filled name, email, and institute from your registration.");
  }

  useEffect(() => {
    if (!preset) return;
    setF(p => {
      const next = { ...p, ...preset };
      if (String(next.regNo || "").trim()) next.registered = "Yes";
      return next;
    });
  }, [preset]);

  useEffect(() => {
    if (!profile) return;
    setF(p => {
      const regNo = p.regNo || profile.regNo || "";
      return {
        ...p,
        name: p.name || profile.name || "",
        email: p.email || profile.email || "",
        institution: p.institution || profile.institute || "",
        regNo,
        ...(String(regNo).trim() ? { registered: "Yes" } : {}),
      };
    });
    if (profile.regNo) setAutofillNote(`Filled from your WAC registration number ${profile.regNo}`);
  }, [profile]);

  const track = TRACKS.find(t => t.name === f.theme);
  const subs = track ? track.subs : f.theme === NOT_SURE
    ? ["Choosing between pathways", "Building a skill", "Solving a project or research barrier", "Finding an official resource", "Testing an idea", "Something else"] : [];

  function applyPrompt(p) {
    if (!profile) return;
    setF(prev => ({ ...prev, theme: p.theme, subtheme: p.sub, question: p.text }));
  }

  function validate() {
    const e = [];
    if (!f.name.trim()) e.push("your name");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) e.push("a valid email address");
    if (!f.state) e.push("your state or union territory");
    if (!f.institution.trim()) e.push("your institution");
    if (!f.stage) e.push("your programme or stage");
    if (!f.registered) e.push("whether you have registered for WAC 2026");
    const wac = String((profile && profile.regNo) || f.regNo || "").trim();
    if (!wac) {
      e.push("your issued WAC registration number (open Register if it is missing)");
    }
    if (!f.inPerson) e.push("whether you will attend in person");
    if (!f.theme) e.push("a theme");
    if (!f.subtheme) e.push("a sub-area");
    if (f.question.trim().length < 25) e.push("a question of at least 25 characters");
    return e;
  }

  async function submit() {
    if (!profile) return;
    const e = validate();
    setErrs(e);
    if (e.length) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setBusy(true);
    const rec = {
      ...f, id: rid(10), ticket: ticketId(), createdAt: Date.now(),
      question: f.question.trim(), context: f.context.trim(), outcome: f.outcome.trim(),
      regNo: String((profile && profile.regNo) || f.regNo || "").trim(),
      consentPublish: "Yes",
      consentFollow: f.consentFollow || "No",
      anonId: await anonIdFromEmail(f.email),
      // Keep legacy field in sync with the issued WAC number for older staff exports.
      delegateNo: String((profile && profile.regNo) || f.regNo || "").trim(),
    };
    try {
      if (await hasApi()) {
        const s = loadLocalSession();
        const saved = await api("set", { key: K_Q + rec.id, val: rec, token: s && s.token });
        onSaved && onSaved(rec, saved && saved.profile);
      } else {
        const ok = await store.set(K_Q + rec.id, rec);
        if (!ok) throw new Error("We could not save your question. Check your connection and send it again.");
        onSaved && onSaved(rec);
      }
      setDone(rec);
    } catch (err) {
      setErrs([err.message || "We could not save your question. Check your connection and send it again."]);
      setBusy(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setBusy(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (done) {
    return (
      <div className="aym-card" style={{ padding: "34px 28px", textAlign: "center", maxWidth: 620, margin: "0 auto" }}>
        <div style={{ display: "inline-flex", width: 46, height: 46, borderRadius: 23, background: C.tan, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <Check size={24} color={C.maroon} />
        </div>
        <h2 className="aym-display" style={{ fontSize: 24, color: C.maroon, margin: "0 0 8px" }}>The Ask Desk has your question.</h2>
        <p style={{ color: C.muted, fontSize: 14.5, margin: "0 0 20px", lineHeight: 1.6 }}>
          Keep this ticket. Use it under <b>Track my answer</b> when a mentor publishes the reply.
        </p>
        <div className="aym-mono" style={{ fontSize: 22, fontWeight: 700, color: C.maroon, background: C.tan, padding: "12px 18px", borderRadius: 14, display: "inline-block", letterSpacing: ".08em" }}>
          {done.ticket}
        </div>
        <div style={{ marginTop: 22, textAlign: "left", background: C.cream, padding: 16, borderRadius: 14, border: `1px solid ${C.line}` }}>
          <div className="aym-eyebrow" style={{ marginBottom: 6 }}>You asked</div>
          <div style={{ fontSize: 14.5, lineHeight: 1.55 }}>{done.question}</div>
          <div style={{ marginTop: 10 }}><Chip>{done.theme}</Chip></div>
        </div>
        <p style={{ fontSize: 12.5, color: C.muted, marginTop: 18, lineHeight: 1.55 }}>
          Questions many mentees ask are merged and answered together. Sending a question does not reserve a live mentor slot.
        </p>
        <button className="aym-btn aym-btn-ghost" style={{ marginTop: 16 }} onClick={() => { setF(blankFromProfile(profile)); setDone(null); }}>
          Ask another question
        </button>
      </div>
    );
  }

  const locked = !profile;

  return (
    <div style={{ maxWidth: 660, margin: "0 auto" }}>
      {locked && (
        <aside className="aym-ask-register-banner" role="status" aria-live="polite">
          <div className="aym-ask-register-banner-glow" aria-hidden="true" />
          <div className="aym-ask-register-banner-icon" aria-hidden="true">
            <UserPlus size={22} strokeWidth={2.2} />
          </div>
          <div className="aym-ask-register-banner-copy">
            <div className="aym-ask-register-banner-eyebrow">You’re browsing Ask Desk</div>
            <p className="aym-ask-register-banner-title">
              Register once with your email to unlock and submit your question. The hall issues your WAC registration number when you verify.
            </p>
            <p className="aym-ask-register-banner-meta">Takes a minute · OTP-verified email</p>
          </div>
          <button type="button" className="aym-ask-register-banner-cta" onClick={onGoRegister}>
            Register now
            <ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </aside>
      )}

      <div className="aym-desk-cap">
        <div className="aym-eyebrow">Ask Desk · Meet the Mentors</div>
        <h1 className="aym-display" style={{ fontSize: 28, margin: "6px 0 8px", color: "#fff" }}>Walk up. Ask one question.</h1>
        <p style={{ margin: 0, color: "rgba(245,235,224,.88)", fontSize: 15, lineHeight: 1.55, maxWidth: 520 }}>
          You are a BAMS mentee. Mentors are here for future development — what to do after BAMS, PG, practice, research — not a support ticket.
        </p>
      </div>

      {errs.length > 0 && (
        <Notice tone="bad">
          Add {errs.join(", ")} before sending.
        </Notice>
      )}

      <div className="aym-eyebrow" style={{ marginBottom: 8 }}>Start from a hall prompt</div>
      <div className="aym-prompt-row">
        {ASK_PROMPTS.map(p => (
          <button key={p.label} type="button" className={`aym-prompt${f.question === p.text ? " aym-prompt-on" : ""}`} onClick={() => applyPrompt(p)} disabled={locked}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="aym-card" style={{ padding: "24px 22px", marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <div>
            <div className="aym-eyebrow" style={{ marginBottom: 6 }}>Who is at the desk</div>
            <h3 className="aym-display" style={{ fontSize: 18, color: C.maroon, margin: 0 }}>Introduce yourself</h3>
          </div>
          <button type="button" className="aym-btn aym-btn-gold" style={{ padding: "8px 14px", fontSize: 13, flexShrink: 0 }} onClick={autofill} disabled={locked}>
            <Sparkles size={14} /> Autofill
          </button>
        </div>

        {autofillNote && <Notice tone="ok">{autofillNote}</Notice>}

        <Field label="WAC registration number" required hint="Issued when you registered. The Ask Desk uses this number — you cannot change it.">
          <input
            className="aym-input aym-mono aym-input-issued"
            value={f.regNo}
            readOnly
            disabled={locked}
            autoComplete="off"
            aria-readonly="true"
            placeholder={locked ? "Issued after you register" : "Issued on your profile"}
          />
        </Field>

        <Field label="Full name" required><input className="aym-input" value={f.name} onChange={e => set("name", e.target.value)} disabled={locked} /></Field>
        <Field label="Email" hint="Used only to send you your answer and, if shortlisted, a slot confirmation." required>
          <input className="aym-input" type="email" value={f.email} onChange={e => set("email", e.target.value)} disabled={locked} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
          <Field label="State or union territory" required>
            <select className="aym-input" value={f.state} onChange={e => set("state", e.target.value)} disabled={locked}>
              <option value="">Select</option>{STATES.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Programme or stage" required>
            <select className="aym-input" value={f.stage} onChange={e => set("stage", e.target.value)} disabled={locked}>
              <option value="">Select</option>{STAGES.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Institution or college" required><input className="aym-input" value={f.institution} onChange={e => set("institution", e.target.value)} disabled={locked} /></Field>
      </div>

      <div className="aym-card" style={{ padding: "24px 22px", marginBottom: 18 }}>
        <div className="aym-eyebrow" style={{ marginBottom: 6 }}>Coming to Bhubaneswar?</div>
        <h3 className="aym-display" style={{ fontSize: 18, color: C.maroon, margin: "0 0 6px" }}>The live hall</h3>
        <p style={{ fontSize: 13, color: C.muted, margin: "0 0 16px" }}>
          Every BAMS student in India may ask. Only registered mentees attending in person can be considered for a live pod or stage session.
        </p>
        <Field label="Have you registered for WAC 2026?" required>
          <select className="aym-input" value={f.registered} onChange={e => set("registered", e.target.value)} disabled={locked}>
            <option value="">Select</option><option>Yes</option><option>Registration in process</option><option>No</option>
          </select>
        </Field>
        <Field label="Will you attend in person at Bhubaneswar?" required>
          <select className="aym-input" value={f.inPerson} onChange={e => set("inPerson", e.target.value)} disabled={locked}>
            <option value="">Select</option><option>Yes</option><option>Not yet confirmed</option><option>No</option>
          </select>
        </Field>
        {f.inPerson === "Yes" && (
          <>
            <Field label="Which core days can you attend?">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {CORE_DAYS.map(d => {
                  const on = f.days.includes(d);
                  return (
                    <button key={d} type="button" onClick={() => set("days", on ? f.days.filter(x => x !== d) : [...f.days, d])}
                      disabled={locked}
                      className="aym-btn" style={{ background: on ? C.maroon : "transparent", color: on ? "#fff" : C.maroon, borderColor: C.line, fontSize: 13 }}>
                      {on && <Check size={14} />}{d}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Mobile number" hint="Optional. Used only if you are shortlisted for a live session.">
              <input className="aym-input" value={f.mobile} onChange={e => set("mobile", e.target.value)} disabled={locked} />
            </Field>
          </>
        )}
      </div>

      <div className="aym-card" style={{ padding: "24px 22px", marginBottom: 18 }}>
        <div className="aym-eyebrow" style={{ marginBottom: 6 }}>Your one question</div>
        <h3 className="aym-display" style={{ fontSize: 18, color: C.maroon, margin: "0 0 16px" }}>What should I do after BAMS?</h3>

        <Field label="Which theme is closest to your question?" required>
          <select className="aym-input" value={f.theme} onChange={e => { set("theme", e.target.value); set("subtheme", ""); }} disabled={locked}>
            <option value="">Select a mentor-pod theme</option>
            {TRACKS.map(t => <option key={t.code} value={t.name}>{t.code} — {t.name}</option>)}
            <option value={NOT_SURE}>{NOT_SURE}</option>
          </select>
        </Field>

        {subs.length > 0 && (
          <Field label="Sub-area" required>
            <select className="aym-input" value={f.subtheme} onChange={e => set("subtheme", e.target.value)} disabled={locked}>
              <option value="">Select</option>{subs.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
        )}

        <Field label="Ask one focused question" required counter={`${f.question.length} / 500`}
          hint="One question, as specific as you can make it. Career, PG, practice, research — not patient details.">
          <textarea className="aym-input" rows={4} maxLength={500} value={f.question} onChange={e => set("question", e.target.value)}
            placeholder="For example: What should I do after BAMS if I am unsure between PG in Kayachikitsa and starting a small clinic?" disabled={locked} />
        </Field>
        <Field label="Where you are stuck" counter={`${f.context.length} / 300`} hint="Keep it general — no unpublished data.">
          <textarea className="aym-input" rows={2} maxLength={300} value={f.context} onChange={e => set("context", e.target.value)} disabled={locked} />
        </Field>
        <Field label="What should a useful answer help you do in the next 90 days?" counter={`${f.outcome.length} / 200`}>
          <textarea className="aym-input" rows={2} maxLength={200} value={f.outcome} onChange={e => set("outcome", e.target.value)} disabled={locked} />
        </Field>
      </div>

      <div className="aym-card" style={{ padding: "24px 22px", marginBottom: 18 }}>
        <div className="aym-eyebrow" style={{ marginBottom: 6 }}>Permissions</div>
        <h3 className="aym-display" style={{ fontSize: 18, color: C.maroon, margin: "0 0 16px" }}>How we may use this</h3>
        <Field label="May we contact you once after the Congress about relevant opportunities?">
          <select className="aym-input" value={f.consentFollow} onChange={e => set("consentFollow", e.target.value)} disabled={locked}>
            <option value="">Select</option><option>Yes</option><option>No</option>
          </select>
        </Field>
      </div>

      <button className="aym-btn aym-btn-primary" style={{ width: "100%", justifyContent: "center", padding: "13px", fontSize: 15 }} disabled={busy || locked} onClick={submit}>
        {busy ? <Loader2 size={17} className="animate-spin" /> : <Send size={16} />}
        {busy ? "Sending" : "Hand this to the Ask Desk"}
      </button>
      <p style={{ fontSize: 12, color: C.muted, textAlign: "center", marginTop: 12, lineHeight: 1.55 }}>
        Your name stays with the curation desk. Similar questions may be merged by staff before a mentor answers on the stage board.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Track my answer                                                  */
/* ------------------------------------------------------------------ */

function LookupView({ loading }) {
  const [q, setQ] = useState("");
  const [hit, setHit] = useState(null);
  const [searched, setSearched] = useState(false);
  const [finding, setFinding] = useState(false);

  async function find() {
    const needle = q.trim();
    setSearched(true);
    if (!needle) { setHit(null); return; }
    setFinding(true);
    const mine = await lookupSubmissions(needle);
    setHit(mine.length ? mine : null);
    setFinding(false);
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <div className="aym-card" style={{ padding: "22px", marginBottom: 20 }}>
        <Field label="Ticket number or email" hint="The ticket looks like AYM-Q-XXXXXXX." htmlFor="track-q">
          <div style={{ display: "flex", gap: 8 }}>
            <input id="track-q" className="aym-input" value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === "Enter" && find()} placeholder="AYM-Q-M4KX2P9" autoComplete="off" />
            <button type="button" className="aym-btn aym-btn-primary" onClick={find} disabled={loading || finding}>
              {finding ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} aria-hidden="true" />}Find
            </button>
          </div>
        </Field>
      </div>

      {loading && <div style={{ textAlign: "center", color: C.muted, fontSize: 14 }}><Loader2 size={18} className="animate-spin" style={{ display: "inline" }} /> Loading the question bank</div>}

      {searched && !hit && !loading && (
        <Notice tone="warn">No question found for that ticket or email. Check the spelling, or send your question from the Ask tab.</Notice>
      )}

      {hit && hit.map(s => {
        const c = s.cluster;
        const mergedBody = String(c && c.answer || "").trim();
        const individualBody = String(s.individualAnswer || "").trim();
        const mergedReady = Boolean(mergedBody);
        const individualReady = Boolean(individualBody);
        const anyReady = mergedReady || individualReady;
        const status = trackStatusOf(s);
        const sharedN = c && Array.isArray(c.memberIds) ? c.memberIds.length : 0;
        return (
          <div key={s.id} className="aym-card aym-track-card" style={{ padding: "22px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <span className="aym-mono" style={{ fontSize: 13, fontWeight: 700, color: C.maroon }}>{s.ticket}</span>
              <Chip tone={status.tone}>{status.label}</Chip>
            </div>
            <div className="aym-eyebrow">Your question</div>
            <p style={{ fontSize: 15, lineHeight: 1.6, margin: "5px 0 14px" }}>{s.question}</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              <Chip>{s.theme}</Chip>{s.subtheme && <Chip tone="grey">{s.subtheme}</Chip>}
            </div>

            {!anyReady && !c && (
              <Notice tone="info">Received. Your question is with the AYURDISHA desk. Track again with this ticket after a mentor answers.</Notice>
            )}

            {!anyReady && c && (
              <Notice tone="info">
                {c.kind === "unique"
                  ? <>Your question is with a mentor under {c.id}. Track again with this ticket after they write.</>
                  : <>Sitting with a mentor, grouped with <b>{Math.max(0, sharedN - 1)} other student{sharedN === 2 ? "" : "s"}</b> under {c.id}.</>}
              </Notice>
            )}

            {mergedReady && (
              <MentorAnswerLetter
                variant="hall"
                eyebrow={sharedN > 1 ? `Shared hall guidance · ${sharedN} mentees` : "From the hall"}
                kicker={c.composite || c.representative || ""}
                mentorName={c.mentorName}
                body={mergedBody}
                actions={c.actions}
                mistake={c.mistake}
                resources={c.resources}
              />
            )}

            {individualReady && (
              <MentorAnswerLetter
                variant="personal"
                eyebrow={mergedReady ? "A note just for you" : "Written for you"}
                mentorName={s.individualMentor}
                body={individualBody}
                actions={s.individualActions}
                mistake={s.individualMistake}
                resources={s.individualResources}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AnswerExtras({ cluster: c }) {
  const acts = (c.actions || []).filter(Boolean);
  const res = (c.resources || []).filter(Boolean);
  return (
    <>
      {acts.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="aym-eyebrow" style={{ marginBottom: 5 }}>Do these next</div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14.5, lineHeight: 1.65 }}>
            {acts.map((a, i) => <li key={i}>{a}</li>)}
          </ol>
        </div>
      )}
      {c.mistake && (
        <div style={{ marginBottom: 12, background: "#FBEEDC", borderRadius: 3, padding: "9px 12px" }}>
          <div className="aym-eyebrow" style={{ marginBottom: 3, color: "#8A5A12" }}>Common mistake</div>
          <div style={{ fontSize: 14, color: "#6E4A10" }}>{c.mistake}</div>
        </div>
      )}
      {res.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="aym-eyebrow" style={{ marginBottom: 5 }}>Official resources</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.6, color: C.muted }}>
            {res.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
      {c.mentorName && (
        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10, fontSize: 13, color: C.muted }}>
          Answered by <b style={{ color: C.maroon }}>{c.mentorName}</b>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Curation desk                                                    */
/* ------------------------------------------------------------------ */

function ClusterConflictModal({ open, message, onReload, onDismiss }) {
  if (!open) return null;
  return (
    <div className="aym-modal-bg aym-cluster-conflict-bg" onClick={e => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div className="aym-card aym-cluster-conflict" role="alertdialog" aria-labelledby="cluster-conflict-title" aria-modal="true">
        <AlertCircle size={28} style={{ color: "#C45C26", marginBottom: 10 }} />
        <h3 id="cluster-conflict-title" className="aym-display" style={{ fontSize: 19, color: C.maroon, margin: "0 0 10px" }}>
          Curation desk updated elsewhere
        </h3>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: C.muted, margin: "0 0 18px" }}>
          {message || "Another staff member saved changes while you were editing. Reload to see their work before you save again."}
        </p>
        <button type="button" className="aym-btn aym-btn-primary" style={{ width: "100%" }} onClick={onReload} autoFocus>
          <RefreshCw size={15} /> Reload latest
        </button>
        <button type="button" className="aym-btn aym-btn-ghost" style={{ width: "100%", marginTop: 8, fontSize: 13 }}
          onClick={onDismiss}>
          Dismiss without reloading
        </button>
      </div>
    </div>
  );
}

function CurationView({ subs, clusters, setClusters, reload, loading, saveClusters, flushClusterSave, clustersVersion, onClustersVersion, onClusterConflict, clusterSaveStatus }) {
  const [threshold, setThreshold] = useState(0.42);
  const [useSub, setUseSub] = useState(true);
  const [running, setRunning] = useState(false);
  const [merging, setMerging] = useState(false);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("");
  const [pick, setPick] = useState([]);
  const [flash, setFlash] = useState("");
  const [err, setErr] = useState("");

  const byId = useMemo(() => Object.fromEntries(subs.map(s => [s.id, s])), [subs]);

  async function run() {
    setErr("");
    if (!subs.length) {
      setErr("No questions on the desk yet. Seed sample questions or wait for the Ask Desk.");
      return;
    }
    setRunning(true);
    try {
      await new Promise(r => setTimeout(r, 40));
      const next = buildClusters(subs, threshold, useSub, clusters);
      const saved = await saveClusters(next, { immediate: true });
      setClusters(saved);
      setFlash(`Merged ${subs.length} questions into ${saved.length} groups.`);
      setTimeout(() => setFlash(""), 4000);
    } catch (e) {
      setErr(e.message || "Could not merge the questions. Sign in as staff and try again.");
    }
    setRunning(false);
  }

  async function patch(id, changes) {
    setErr("");
    const next = clusters.map(c => (c.id === id ? { ...c, ...changes } : c));
    setClusters(next);
    try {
      await saveClusters(next);
    } catch (e) {
      if (e.status !== 409) setErr(e.message || "Could not save that change.");
    }
  }

  function blurSave() {
    flushClusterSave().catch(e => {
      if (e.status !== 409) setErr(e.message || "Could not save that change.");
    });
  }

  async function mergePicked() {
    setErr("");
    if (pick.length < 2) {
      setErr("Tick at least two groups, then Merge.");
      return;
    }
    setMerging(true);
    try {
      const r = await api("clustersMerge", { ids: pick, version: clustersVersion });
      const next = Array.isArray(r.clusters) ? r.clusters : clusters;
      setClusters(next);
      if (r.clustersVersion != null) onClustersVersion?.(r.clustersVersion);
      setPick([]);
      setFlash(`Merged ${pick.length} groups into ${r.mergedId || next[0] && next[0].id}.`);
      setTimeout(() => setFlash(""), 4000);
    } catch (e) {
      if (e.status === 409) onClusterConflict?.(e);
      setErr(e.message || "Could not merge those groups.");
    }
    setMerging(false);
  }

  async function detach(clusterIdVal, subId) {
    setErr("");
    const src = clusters.find(c => c.id === clusterIdVal);
    if (!src || src.memberIds.length < 2) return;
    const left = src.memberIds.filter(i => i !== subId);
    const leftMembers = left.map(i => byId[i]).filter(Boolean);
    if (!leftMembers.length) return;
    const repL = leftMembers.reduce((a, c) => (c.question.length > a.question.length ? c : a), leftMembers[0]);
    const moved = byId[subId];
    if (!moved) return;
    const next = clusters.map(c => c.id === clusterIdVal
      ? { ...c, memberIds: left, representative: repL.question, variants: left.map(i => byId[i]).filter(x => x && x.id !== repL.id).slice(0, 3).map(x => x.question) }
      : c);
    next.push({
      id: clusterId(), theme: moved.theme, subtheme: moved.subtheme, memberIds: [subId],
      representative: moved.question, variants: [], composite: "", mentor: "", answer: "",
      actions: ["", "", ""], mistake: "", resources: ["", ""], mentorName: "", status: "New",
    });
    setClusters(next);
    try { await saveClusters(next, { immediate: true }); }
    catch (e) { setErr(e.message || "Could not split that question out."); }
  }

  const shown = clusters.filter(c => {
    if (!filter) return true;
    const n = filter.toLowerCase();
    return c.theme.toLowerCase().includes(n) || c.id.toLowerCase().includes(n) ||
      c.representative.toLowerCase().includes(n) || (c.composite || "").toLowerCase().includes(n);
  });

  const stats = useMemo(() => ({
    subs: subs.length,
    clusters: clusters.length,
    answered: clusters.filter(c => c.answer).length,
    published: clusters.filter(c => c.status === "Published").length,
    states: new Set(subs.map(s => s.state)).size,
    institutions: new Set(subs.map(s => (s.institution || "").trim().toLowerCase())).size,
    live: subs.filter(s => s.registered === "Yes" && s.inPerson === "Yes").length,
  }), [subs, clusters]);

  const perTheme = useMemo(() => {
    const m = {};
    subs.forEach(s => { m[s.theme] = (m[s.theme] || 0) + 1; });
    return TRACKS.map(t => ({ name: t.name, code: t.code, n: m[t.name] || 0 }))
      .concat([{ name: NOT_SURE, code: "—", n: m[NOT_SURE] || 0 }]);
  }, [subs]);
  const peak = Math.max(1, ...perTheme.map(x => x.n));

  return (
    <div>
      <section className="aym-desk-hero" aria-label="Curation desk">
        <div className="aym-desk-hero-veil" />
        <div className="aym-desk-hero-copy">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div className="aym-eyebrow">Curation desk · Meet the Mentors</div>
            {clusterSaveStatus && clusterSaveStatus !== "idle" && (
              <span className={`aym-curation-save-status aym-curation-save-status--${clusterSaveStatus}`} aria-live="polite">
                {clusterSaveStatus === "pending" && "Saving…"}
                {clusterSaveStatus === "saving" && <><Loader2 size={12} className="animate-spin" /> Saving…</>}
                {clusterSaveStatus === "saved" && <><Check size={12} /> Saved</>}
              </span>
            )}
          </div>
          <h2>One question, many mentees.</h2>
          <p>Merge what BAMS students are asking — then a mentor answers the hall, not a single inbox.</p>
        </div>
      </section>

      {flash && <Notice tone="ok">{flash}</Notice>}
      {err && <Notice tone="bad">{err}</Notice>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginBottom: 22 }}>
        {[["Questions in", stats.subs], ["Merged groups", stats.clusters], ["Answered", stats.answered],
          ["Published", stats.published], ["States", stats.states], ["Institutions", stats.institutions],
          ["Eligible for live", stats.live]].map(([k, v]) => (
          <div key={k} className="aym-card" style={{ padding: "12px 14px" }}>
            <div className="aym-serif" style={{ fontSize: 26, fontWeight: 700, color: C.maroon, lineHeight: 1 }}>{v}</div>
            <div className="aym-eyebrow" style={{ marginTop: 4 }}>{k}</div>
          </div>
        ))}
      </div>

      <Section number="01" title="Merge the incoming questions"
        blurb="Edits save automatically ~1.5s after you pause typing — use Reload if another staff member is also curating. Questions are compared word-by-word inside each theme and sub-area. Similar ones pack toward groups of 6–7 (they can be larger when more students share the same ask). Distinct questions stay on this desk as their own row so a mentor still answers them. Personal one-to-one replies can be added from Insights → Briefing board.">
        <div className="aym-card" style={{ padding: 18 }}>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 260px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: C.maroon, marginBottom: 6 }}>
                <span>Word overlap needed to merge</span><span className="aym-mono">{threshold.toFixed(2)}</span>
              </div>
              <input type="range" min="0.15" max="0.7" step="0.01" value={threshold}
                onChange={e => setThreshold(parseFloat(e.target.value))} style={{ width: "100%", accentColor: C.maroon }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.muted }}>
                <span>Fewer, broader groups</span><span>More, tighter groups</span>
              </div>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, cursor: "pointer" }}>
              <input type="checkbox" checked={useSub} onChange={e => setUseSub(e.target.checked)} style={{ accentColor: C.maroon, width: 16, height: 16 }} />
              Keep sub-areas separate
            </label>
            <button type="button" className="aym-btn aym-btn-primary" onClick={run} disabled={running}>
              {running ? <Loader2 size={16} className="animate-spin" /> : <Layers size={16} />}
              {clusters.length ? "Re-merge" : "Merge questions"}
            </button>
            <button className="aym-btn aym-btn-ghost" onClick={reload} disabled={loading}>
              <RefreshCw size={15} />Reload
            </button>
          </div>
          {clusters.length > 0 && (
            <p style={{ fontSize: 12.5, color: C.muted, marginTop: 12, marginBottom: 0 }}>
              Re-merging keeps any composite wording and answers already attached to a group.
            </p>
          )}
        </div>
      </Section>

      {subs.length > 0 && (
        <Section number="02" title="Where the demand is">
          <div className="aym-card" style={{ padding: 18 }}>
            {perTheme.map(t => (
              <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                <span className="aym-mono" style={{ fontSize: 11, color: C.gold, width: 30, flexShrink: 0 }}>{t.code}</span>
                <span style={{ fontSize: 13, width: 210, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                <div style={{ flex: 1, height: 14, background: C.cream, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${(t.n / peak) * 100}%`, height: "100%", background: t.n ? C.maroon : "transparent" }} />
                </div>
                <span className="aym-mono" style={{ fontSize: 12.5, width: 26, textAlign: "right", color: t.n ? C.ink : C.muted }}>{t.n}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section number="03" title="Review each merged group"
        blurb="Write the composite question a mentor will actually answer. The raw student wording stays on the left so you can check nothing was lost.">
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          <input className="aym-input" style={{ flex: "1 1 240px" }} placeholder="Filter by theme, group ID or wording"
            value={filter} onChange={e => setFilter(e.target.value)} />
          <button type="button" className="aym-btn aym-btn-gold" disabled={merging} onClick={mergePicked}>
            {merging ? <Loader2 size={15} className="animate-spin" /> : <Merge size={15} />}
            {pick.length >= 2 ? `Merge ${pick.length} groups` : "Merge selected groups"}
          </button>
          {pick.length > 0 && <button type="button" className="aym-btn aym-btn-ghost" onClick={() => setPick([])}><X size={15} />Clear</button>}
        </div>

        {!clusters.length && (
          <div className="aym-card" style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 14 }}>
            {subs.length ? "Run the merge above to group the questions." : "No questions yet. Seed the demo data or open the Ask tab and send one."}
          </div>
        )}

        {shown.map(c => {
          const members = c.memberIds.map(i => byId[i]).filter(Boolean);
          const isOpen = open === c.id;
          const picked = pick.includes(c.id);
          return (
            <div key={c.id} className={`aym-card aym-cluster-card${picked ? " aym-cluster-picked" : ""}`} style={{ marginBottom: 12 }}>
              <div style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}
                onClick={() => setOpen(isOpen ? null : c.id)}>
                <input type="checkbox" checked={picked} onClick={e => e.stopPropagation()}
                  onChange={() => setPick(p => picked ? p.filter(x => x !== c.id) : [...p, c.id])}
                  style={{ accentColor: C.gold, width: 16, height: 16, marginTop: 3, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                    <span className="aym-mono" style={{ fontSize: 11.5, fontWeight: 700, color: C.gold }}>{c.id}</span>
                    <Chip tone="maroon">{members.length} student{members.length === 1 ? "" : "s"}</Chip>
                    <Chip tone="grey">{c.theme}</Chip>
                    {c.answer && <Chip tone="green">{c.status}</Chip>}
                  </div>
                  <div className="aym-serif" style={{ fontSize: 15.5, lineHeight: 1.45, fontWeight: c.composite ? 700 : 400, color: c.composite ? C.maroon : C.ink }}>
                    {c.composite || c.representative}
                  </div>
                  {!c.composite && <div style={{ fontSize: 12, color: C.muted, marginTop: 5 }}>Raw student wording — write a composite question below.</div>}
                </div>
                <ChevronRight size={18} color={C.muted} style={{ flexShrink: 0, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
              </div>

              {isOpen && (
                <div style={{ borderTop: `1px solid ${C.line}`, padding: "16px", background: C.cream }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 22 }}>
                    <div>
                      <div className="aym-eyebrow" style={{ marginBottom: 8 }}>What students actually wrote</div>
                      <div className="aym-thread">
                        {members.map(m => (
                          <div key={m.id} style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{m.question}</div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, fontSize: 11.5, color: C.muted, flexWrap: "wrap" }}>
                              <span className="aym-mono">{m.ticket}</span>
                              <span>·</span><span>{m.stage}</span>
                              <span>·</span><span>{m.state}</span>
                              {members.length > 1 && (
                                <button className="aym-btn" style={{ padding: "1px 6px", fontSize: 11, background: "transparent", color: C.maroon, borderColor: C.line }}
                                  onClick={() => detach(c.id, m.id)}><Scissors size={11} />Split out</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Field label="Composite question for the mentor" hint="One question that fairly covers everyone in this group.">
                        <textarea className="aym-input" rows={3} value={c.composite}
                          onChange={e => patch(c.id, { composite: e.target.value, status: c.status === "New" ? "Composed" : c.status })}
                          onBlur={blurSave}
                          placeholder={c.representative} />
                      </Field>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <Field label="Assigned mentor">
                          <input className="aym-input" value={c.mentor} onChange={e => patch(c.id, { mentor: e.target.value })} onBlur={blurSave} />
                        </Field>
                        <Field label="Status">
                          <select className="aym-input" value={c.status} onChange={e => patch(c.id, { status: e.target.value })} onBlur={blurSave}>
                            {["New", "Composed", "Sent to mentor", "Answered", "Published"].map(s => <option key={s}>{s}</option>)}
                          </select>
                        </Field>
                      </div>
                      <Field label="Mentor's answer" hint="Filled here or imported from the returned Excel sheet.">
                        <textarea className="aym-input" rows={4} value={c.answer}
                          onChange={e => patch(c.id, { answer: e.target.value, status: c.status === "Published" ? "Published" : "Answered" })}
                          onBlur={blurSave} />
                      </Field>
                      {[0, 1, 2].map(i => (
                        <Field key={i} label={`Action ${i + 1}`}>
                          <input className="aym-input" value={(c.actions || [])[i] || ""}
                            onChange={e => { const a = [...(c.actions || ["", "", ""])]; a[i] = e.target.value; patch(c.id, { actions: a }); }}
                            onBlur={blurSave} />
                        </Field>
                      ))}
                      <Field label="One common mistake">
                        <input className="aym-input" value={c.mistake} onChange={e => patch(c.id, { mistake: e.target.value })} onBlur={blurSave} />
                      </Field>
                      {[0, 1].map(i => (
                        <Field key={i} label={`Official resource ${i + 1}`}>
                          <input className="aym-input" value={(c.resources || [])[i] || ""}
                            onChange={e => { const r = [...(c.resources || ["", ""])]; r[i] = e.target.value; patch(c.id, { resources: r }); }}
                            onBlur={blurSave} />
                        </Field>
                      ))}
                      <Field label="Answered by">
                        <input className="aym-input" value={c.mentorName} placeholder="Name, designation, institution"
                          onChange={e => patch(c.id, { mentorName: e.target.value })}
                          onBlur={blurSave} />
                      </Field>
                      <button className="aym-btn aym-btn-primary" disabled={!c.answer}
                        onClick={() => patch(c.id, { status: c.status === "Published" ? "Answered" : "Published" })}>
                        {c.status === "Published" ? <><X size={15} />Unpublish</> : <><Check size={15} />Publish to students</>}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Mentor pack                                                      */
/* ------------------------------------------------------------------ */

function MentorPackView({ subs, clusters, setClusters, saveClusters, onSaveQuestion }) {
  const [theme, setTheme] = useState("All themes");
  const [minSize, setMinSize] = useState(1);
  const [result, setResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const selection = clusters.filter(c =>
    (theme === "All themes" || c.theme === theme) && c.memberIds.length >= minSize);
  const packed = selection.filter(c => (c.memberIds || []).length >= 2);
  const unique = selection.filter(c => (c.memberIds || []).length < 2);
  const label = theme === "All themes" ? "All themes" : theme;

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setImporting(true); setResult(null);
    try {
      const rows = await readAnswerWorkbook(file);
      const clusterRows = rows.filter(r => r.kind === "cluster");
      const individualRows = rows.filter(r => r.kind === "individual");
      let filledClusters = 0;
      let filledIndividuals = 0;
      let unknown = [];

      if (clusterRows.length) {
        const map = Object.fromEntries(clusterRows.map(r => [r.id, r]));
        const next = clusters.map(c => {
          const r = map[c.id];
          if (!r || !r.answer) return c;
          filledClusters++;
          return {
            ...c, answer: r.answer, actions: r.actions, mistake: r.mistake,
            resources: r.resources, mentorName: r.mentorName,
            composite: r.composite || c.composite,
            status: "Published",
          };
        });
        clusterRows.forEach(r => {
          if (r.answer && !clusters.some(c => c.id === r.id)) unknown.push(r.id);
        });
        setClusters(next);
        await saveClusters(next, { immediate: true });
      }

      if (individualRows.length) {
        const nextSubs = [...subs];
        for (const r of individualRows) {
          if (!r.answer) continue;
          const hit = nextSubs.find(s => s.ticket === r.ticket || s.id === r.id);
          if (!hit) { unknown.push(r.ticket || r.id); continue; }
          const saved = await api("answerIndividual", {
            id: hit.id, answer: r.answer, actions: r.actions,
            mistake: r.mistake, resources: r.resources, mentorName: r.mentorName,
          });
          filledIndividuals++;
          const rec = saved.question || { ...hit, individualAnswer: r.answer };
          const idx = nextSubs.findIndex(s => s.id === hit.id);
          if (idx >= 0) nextSubs[idx] = rec;
          if (onSaveQuestion) onSaveQuestion(rec);
        }
      }

      if (!clusterRows.length && !individualRows.length) {
        throw new Error("No answer rows found in that file.");
      }

      const filled = filledClusters + filledIndividuals;
      const kind = filledClusters && filledIndividuals
        ? "mixed"
        : individualRows.length && !clusterRows.length
          ? "individual"
          : "cluster";
      setResult({ ok: true, filled, rows: rows.length, unknown, kind, filledClusters, filledIndividuals });
    } catch (err) {
      setResult({ ok: false, message: err.message });
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div>
      <Section number="01" title="Merged questions — export and import"
        blurb="One row per student in each merged group. Similar asks become one hall question; each row shows that student's original wording plus a MERGED_ANSWER column. Download the sheet for mentors, then upload the filled file — answers land on Track my answer by ticket. Personal one-to-one replies are handled in Insights → Briefing board, not here.">
        <div className="aym-card aym-pack-hero" style={{ padding: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginBottom: 16 }}>
            <Field label="Theme">
              <select className="aym-input" value={theme} onChange={e => setTheme(e.target.value)}>
                <option>All themes</option>
                {TRACKS.map(t => <option key={t.code}>{t.name}</option>)}
                <option>{NOT_SURE}</option>
              </select>
            </Field>
            <Field label="Only groups with at least this many students">
              <select className="aym-input" value={minSize} onChange={e => setMinSize(Number(e.target.value))}>
                {[1, 2, 3, 5, 6, 7, 10].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ background: C.cream, borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 14 }}>
            <b className="aym-serif" style={{ color: C.maroon, fontSize: 18 }}>{packed.length}</b> merged groups
            {" · "}<b className="aym-serif" style={{ color: C.maroon, fontSize: 18 }}>{unique.length}</b> unique (could not merge)
            {" · "}<b className="aym-serif" style={{ color: C.maroon, fontSize: 18 }}>{selection.reduce((n, c) => n + c.memberIds.length, 0)}</b> students in selection
            {" · "}{subs.length} total questions
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <button className="aym-btn aym-btn-primary" disabled={!selection.length} onClick={() => exportMentorWorkbook(selection, subs, label)}>
              <FileSpreadsheet size={16} />Download Excel sheet
            </button>
            <button className="aym-btn aym-btn-ghost" disabled={!selection.length} onClick={() => exportMentorDoc(selection, label)}>
              <Download size={16} />Download Word brief
            </button>
            <button className="aym-btn aym-btn-ghost" disabled={!subs.length} onClick={() => exportSubmissionRegister(subs, clusters)}>
              <Download size={16} />Full submission register
            </button>
          </div>

          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFile} style={{ display: "none" }} />
          <button className="aym-btn aym-btn-gold" onClick={() => fileRef.current && fileRef.current.click()} disabled={importing}>
            {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {importing ? "Reading sheet…" : "Upload filled merged answer sheet"}
          </button>

          {result && result.ok && (
            <div style={{ marginTop: 14 }}>
              <Notice tone="ok">
                Loaded {result.filled} answer{result.filled === 1 ? "" : "s"} from {result.rows} rows
                {result.kind === "individual" ? " (individual tickets)"
                  : result.kind === "mixed"
                    ? ` (${result.filledClusters} merged group${result.filledClusters === 1 ? "" : "s"}, ${result.filledIndividuals} personal)`
                    : " (merged groups)"}.
                {result.unknown.length > 0 && <> {result.unknown.length} row{result.unknown.length === 1 ? "" : "s"} had an unrecognised id and {result.unknown.length === 1 ? "was" : "were"} skipped: {result.unknown.slice(0, 5).join(", ")}.</>}
                {" "}Students can now find them on Track my answer with their ticket.
              </Notice>
            </div>
          )}
          {result && !result.ok && <div style={{ marginTop: 14 }}><Notice tone="bad">{result.message}</Notice></div>}
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Answer board                                                     */
/* ------------------------------------------------------------------ */

function BoardView({ clusters }) {
  const [theme, setTheme] = useState("All themes");
  const [q, setQ] = useState("");
  const pub = clusters.filter(c => c.status === "Published" && c.answer)
    .filter(c => theme === "All themes" || c.theme === theme)
    .filter(c => !q || (c.composite + " " + c.representative + " " + c.answer).toLowerCase().includes(q.toLowerCase()));

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <select className="aym-input" style={{ flex: "1 1 220px" }} value={theme} onChange={e => setTheme(e.target.value)}>
          <option>All themes</option>{TRACKS.map(t => <option key={t.code}>{t.name}</option>)}
        </select>
        <input className="aym-input" style={{ flex: "1 1 200px" }} placeholder="Search the answers" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {!pub.length && (
        <div className="aym-card" style={{ padding: 34, textAlign: "center", color: C.muted, fontSize: 14 }}>
          Nothing published yet. Answers appear here once the curation desk publishes them.
        </div>
      )}

      {pub.map(c => (
        <div key={c.id} className="aym-card" style={{ padding: 22, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
            <Chip>{c.theme}</Chip>
            {c.subtheme && <Chip tone="grey">{c.subtheme}</Chip>}
            <Chip tone="gold">Asked by {c.memberIds.length}</Chip>
          </div>
          <h3 className="aym-serif" style={{ fontSize: 18, color: C.maroon, margin: "0 0 12px", lineHeight: 1.4 }}>
            {c.composite || c.representative}
          </h3>
          <p style={{ fontSize: 15, lineHeight: 1.65, margin: "0 0 14px", whiteSpace: "pre-wrap" }}>{c.answer}</p>
          <AnswerExtras cluster={c} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Admin insights — stats + asked questions                         */
/* ------------------------------------------------------------------ */

function fmtWhen(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function InsightsView({ subs, clusters, onSaveQuestion }) {
  const [q, setQ] = useState("");
  const [theme, setTheme] = useState("All themes");
  const [showContacts, setShowContacts] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [draftErr, setDraftErr] = useState("");

  const statusOf = useCallback((s) => {
    const c = clusters.find(x => clusterOwnsQuestion(x, s));
    const merged = c && clusterAnswerText(c);
    const ind = Boolean(pickStoredAnswer(s));
    if (merged && ind) return "Both answers";
    if (ind) return "Answered";
    if (c && c.status === "Published" && clusterAnswerText(c)) return "Published";
    if (c && clusterAnswerText(c)) return "Answered";
    if (c) return "With mentor";
    return "Received";
  }, [clusters]);

  const stats = useMemo(() => {
    const now = Date.now();
    const day = 86400000;
    return {
      total: subs.length,
      today: subs.filter(s => now - (s.createdAt || 0) < day).length,
      week: subs.filter(s => now - (s.createdAt || 0) < 7 * day).length,
      published: clusters.filter(c => c.status === "Published").length,
      states: new Set(subs.map(s => s.state).filter(Boolean)).size,
      live: subs.filter(s => s.registered === "Yes" && s.inPerson === "Yes").length,
    };
  }, [subs, clusters]);

  const perTheme = useMemo(() => {
    const m = {};
    subs.forEach(s => { m[s.theme] = (m[s.theme] || 0) + 1; });
    return TRACKS.map(t => ({ name: t.name, code: t.code, n: m[t.name] || 0 }))
      .concat([{ name: NOT_SURE, code: "—", n: m[NOT_SURE] || 0 }]);
  }, [subs]);
  const peakTheme = Math.max(1, ...perTheme.map(x => x.n));

  const trend = useMemo(() => {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(dayKey(d.getTime()));
    }
    const counts = Object.fromEntries(days.map(k => [k, 0]));
    subs.forEach(s => {
      const k = dayKey(s.createdAt);
      if (k in counts) counts[k]++;
    });
    return days.map(k => ({ k, n: counts[k], label: k.slice(5) }));
  }, [subs]);
  const peakTrend = Math.max(1, ...trend.map(x => x.n));

  const queue = useMemo(() => {
    return [...subs].reverse().filter(s => statusOf(s) === "Received" || statusOf(s) === "With mentor").slice(0, 8);
  }, [subs, statusOf]);

  const podLoad = useMemo(() => {
    return HALL_PODS.map(p => ({
      ...p,
      n: subs.filter(s => p.themes.includes(s.theme)).length,
    }));
  }, [subs]);

  const afterMix = useMemo(() => {
    return AFTER_BAMS.map(b => ({
      ...b,
      n: subs.filter(s => b.themes.includes(s.theme)).length,
    }));
  }, [subs]);

  const exchangeN = afterMix.filter(b => ["startup", "industry", "global"].includes(b.id)).reduce((n, b) => n + b.n, 0);
  const podcastN = subs.filter(s => s.theme === "Brand Building & Communication").length;
  const deskN = subs.filter(s => statusOf(s) === "Received").length;
  const stageN = stats.published;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...subs].reverse().filter(s => {
      if (theme !== "All themes" && s.theme !== theme) return false;
      if (!needle) return true;
      return [s.question, s.ticket, s.theme, s.subtheme, s.state, s.stage, s.anonId, s.email, s.name]
        .join(" ").toLowerCase().includes(needle);
    });
  }, [subs, q, theme]);

  function exportCsv() {
    const headers = ["When", "Ticket", "AnonId", "Theme", "Subtheme", "Question", "Stage", "State", "Status"];
    if (showContacts) headers.push("Name", "Email");
    const rows = shown.map(s => {
      const row = [
        new Date(s.createdAt).toISOString(), s.ticket, s.anonId || "",
        s.theme, s.subtheme, s.question, s.stage, s.state, statusOf(s),
      ];
      if (showContacts) row.push(s.name || "", s.email || "");
      return row.map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(",");
    });
    const blob = new Blob([headers.join(",") + "\n" + rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ayurdisha-questions.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function saveDraft() {
    if (!draft) return;
    const answer = String(draft.answer || "").trim();
    if (!answer) { setDraftErr("Write the mentor answer first."); return; }
    setSaving(true); setDraftErr("");
    try {
      const r = await api("answerIndividual", {
        id: draft.id,
        answer,
        mentorName: draft.mentorName || "",
        actions: [draft.a1, draft.a2, draft.a3],
        mistake: draft.mistake || "",
        resources: [draft.r1, draft.r2],
      });
      if (onSaveQuestion) onSaveQuestion(r.question);
      setDraft(null);
    } catch (e) {
      setDraftErr(e.message || "Could not save that answer.");
    }
    setSaving(false);
  }

  return (
    <div>
      <section className="aym-insights-hero" aria-label="Meet the Mentors hall">
        <img
          src="/assets/hall-photo.png"
          alt="Meet the Mentors hall — forest-green stage, oak mentor pods, Opportunity Exchange wall"
          width={1600}
          height={900}
          loading="lazy"
          decoding="async"
        />
        <div className="aym-insights-hero-veil" />
        <div className="aym-insights-hero-copy">
          <div className="aym-eyebrow">Insights · hall floor</div>
          <h2>Meet the Mentors</h2>
          <p>{stats.today} arrived today · {stats.week} in the last 7 days · career guidance for BAMS mentees</p>
        </div>
      </section>
      <div className="aym-floor">
          <div className="aym-cell">
            <span>Opportunity Exchange</span>
            <b>{exchangeN}</b>
            <p>Interest in start-ups, industry, practice abroad</p>
          </div>
          <div className="aym-cell aym-cell-stage">
            <span>Open theme stage</span>
            <b>{stageN}</b>
            <p>Published sessions on the two-chair board</p>
          </div>
          <div className="aym-cell aym-cell-lounge">
            <span>In-person delegates</span>
            <b>{stats.live}</b>
            <p>Ready for a live mentor slot</p>
          </div>
          <div className="aym-cell">
            <span>Guided screens</span>
            <b>{stats.total}</b>
            <p>Tickets in the national bank · {stats.states} state{stats.states === 1 ? "" : "s"}</p>
          </div>
          <div className="aym-cell aym-cell-desk">
            <span>Ask Desk queue</span>
            <b>{deskN}</b>
            <p>Waiting to be clustered</p>
          </div>
          <div className="aym-cell">
            <span>Podcast corner</span>
            <b>{podcastN}</b>
            <p>Brand & communication questions</p>
          </div>
          <div className="aym-pods-live" style={{ gridColumn: "1 / -1" }}>
            {podLoad.map(p => (
              <div key={p.id} className="aym-live-pod">
                <em>{p.n}</em>
                Pod {p.id}<br />{p.name}
              </div>
            ))}
          </div>
        </div>

      <Section title="Ask Desk queue" blurb="Newest unanswered or mentor-bound tickets — treat this as the curved desk strip, not a ticket dump.">
        <div className="aym-queue">
          {!queue.length && <div className="aym-card" style={{ padding: 20, color: C.muted }}>Desk is clear. No questions waiting.</div>}
          {queue.map(s => (
            <div key={s.id} className={`aym-qstrip${statusOf(s) === "Received" ? " aym-qstrip-hot" : ""}`}>
              <span className="aym-mono" style={{ fontWeight: 700, color: C.forest }}>{s.ticket}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.question}</span>
              <Chip tone={statusOf(s) === "Received" ? "maroon" : "grey"}>{statusOf(s)}</Chip>
            </div>
          ))}
        </div>
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18 }}>
        <Section title="After-BAMS topic mix">
          <div className="aym-mix">
            {afterMix.map(b => (
              <div key={b.id} className="aym-mix-pod">
                <b>{b.n}</b>
                <span>{b.label}</span>
              </div>
            ))}
          </div>
        </Section>
        <Section title="14-day arrivals">
          <div className="aym-card" style={{ padding: 16 }}>
            <div className="aym-trend">
              {trend.map(d => (
                <div key={d.k} className="aym-bar" title={`${d.k}: ${d.n}`}>
                  <i style={{ height: `${(d.n / peakTrend) * 100}%`, minHeight: d.n ? 4 : 3, opacity: d.n ? 1 : .25 }} />
                  <span>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <Section title="Mentor-pod occupancy by theme" blurb="Demand across the ten themes that sit behind the four wooden pods.">
        <div className="aym-card" style={{ padding: 18 }}>
          {perTheme.map(t => (
            <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
              <span className="aym-mono" style={{ fontSize: 11, color: C.oak, width: 30, flexShrink: 0 }}>{t.code}</span>
              <span style={{ fontSize: 13, width: 170, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
              <div style={{ flex: 1, height: 12, background: C.cream, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: `${(t.n / peakTheme) * 100}%`, height: "100%", background: t.n ? C.forest : "transparent" }} />
              </div>
              <span className="aym-mono" style={{ fontSize: 12.5, width: 26, textAlign: "right", color: t.n ? C.ink : C.muted }}>{t.n}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Briefing board" blurb="Staff only. Every question that has walked up to the Ask Desk. Names stay hidden unless you open contacts.">
        <div className="aym-brief">
          <div className="aym-brief-toolbar">
            <input className="aym-input" style={{ flex: "1 1 220px" }} placeholder="Search the briefing board"
              value={q} onChange={e => setQ(e.target.value)} />
            <select className="aym-input" style={{ flex: "0 1 220px" }} value={theme} onChange={e => setTheme(e.target.value)}>
              <option>All themes</option>
              {TRACKS.map(t => <option key={t.code}>{t.name}</option>)}
              <option>{NOT_SURE}</option>
            </select>
            <button className="aym-btn aym-btn-ghost" style={{ color: "#fff", borderColor: "#3d5248" }} onClick={() => setShowContacts(v => !v)}>
              {showContacts ? <EyeOff size={14} /> : <Eye size={14} />}{showContacts ? "Hide contacts" : "Show contacts"}
            </button>
            <button className="aym-btn aym-btn-ghost" style={{ color: "#fff", borderColor: "#3d5248" }} disabled={!shown.length} onClick={exportCsv}>
              <Download size={14} />Export CSV
            </button>
          </div>
          <div style={{ overflow: "auto" }}>
            {!shown.length ? (
              <div style={{ padding: 30, textAlign: "center", color: "rgba(243,235,225,.6)", fontSize: 14 }}>
                {subs.length ? "No questions match this filter." : "Hall is empty. Seed sample questions, or wait for the Ask Desk."}
              </div>
            ) : (
              <table className="aym-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Ticket</th>
                    <th>Zone</th>
                    <th>Question</th>
                    <th>Status</th>
                    <th>Stage / state</th>
                    {showContacts ? <th>Contact</th> : <th>Anon ID</th>}
                    <th>Answer</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(s => (
                    <tr key={s.id}>
                      <td className="aym-mono" style={{ whiteSpace: "nowrap", color: "rgba(243,235,225,.55)" }}>{fmtWhen(s.createdAt)}</td>
                      <td className="aym-mono" style={{ whiteSpace: "nowrap", fontWeight: 700, color: C.oak }}>{s.ticket}</td>
                      <td style={{ maxWidth: 160 }}>{s.theme}{s.subtheme ? <div style={{ color: "rgba(243,235,225,.5)", fontSize: 12 }}>{s.subtheme}</div> : null}</td>
                      <td style={{ minWidth: 220 }}>{s.question}</td>
                      <td><Chip tone={statusOf(s) === "Published" || statusOf(s) === "Both answers" || statusOf(s) === "Answered" ? "green" : "grey"}>{statusOf(s)}</Chip></td>
                      <td>{s.stage}<div style={{ color: "rgba(243,235,225,.5)", fontSize: 12 }}>{s.state}</div></td>
                      {showContacts
                        ? <td>{s.name}<div style={{ color: "rgba(243,235,225,.5)", fontSize: 12 }}>{s.email}</div></td>
                        : <td className="aym-mono" style={{ fontSize: 12 }}>{s.anonId || "—"}</td>}
                      <td>
                        <button type="button" className="aym-btn aym-btn-gold" style={{ padding: "6px 10px", fontSize: 12 }}
                          onClick={() => {
                            setDraftErr("");
                            setDraft({
                              id: s.id, ticket: s.ticket, name: s.name, email: s.email,
                              question: s.question, theme: s.theme, subtheme: s.subtheme,
                              context: s.context, stage: s.stage, state: s.state,
                              institution: s.institution,
                              answer: s.individualAnswer || "", mentorName: s.individualMentor || "",
                              a1: (s.individualActions && s.individualActions[0]) || "",
                              a2: (s.individualActions && s.individualActions[1]) || "",
                              a3: (s.individualActions && s.individualActions[2]) || "",
                              mistake: s.individualMistake || "",
                              r1: (s.individualResources && s.individualResources[0]) || "",
                              r2: (s.individualResources && s.individualResources[1]) || "",
                            });
                          }}>
                          <PenLine size={13} />{s.individualAnswer ? "Edit answer" : "Provide answer"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <p style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>{shown.length} of {subs.length} on the board</p>
      </Section>

      {draft && (
        <div className="aym-modal-bg" onClick={e => { if (e.target === e.currentTarget && !saving) setDraft(null); }}>
          <div className="aym-card aym-answer-modal" style={{ padding: 24, maxWidth: 640, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
            <div className="aym-eyebrow">Provide a mentor answer</div>
            <h3 className="aym-display" style={{ fontSize: 20, color: C.maroon, margin: "6px 0 10px" }}>{draft.ticket}</h3>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              <Chip>{draft.theme}</Chip>
              {draft.subtheme && <Chip tone="grey">{draft.subtheme}</Chip>}
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 8px" }}><b>Question.</b> {draft.question}</p>
            {draft.context && <p style={{ fontSize: 13.5, color: C.muted, margin: "0 0 8px" }}><b>Context.</b> {draft.context}</p>}
            <p style={{ fontSize: 13, color: C.muted, margin: "0 0 14px" }}>
              {draft.stage} · {draft.state} · {draft.institution || "—"}
              {draft.name ? ` · ${draft.name}` : ""}
            </p>
            <Field label="Mentor answer" required>
              <textarea className="aym-input" rows={5} value={draft.answer} onChange={e => setDraft({ ...draft, answer: e.target.value })}
                placeholder="Write the guidance this mentee should see on Track my answer." />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Action 1"><input className="aym-input" value={draft.a1} onChange={e => setDraft({ ...draft, a1: e.target.value })} /></Field>
              <Field label="Action 2"><input className="aym-input" value={draft.a2} onChange={e => setDraft({ ...draft, a2: e.target.value })} /></Field>
            </div>
            <Field label="Action 3"><input className="aym-input" value={draft.a3} onChange={e => setDraft({ ...draft, a3: e.target.value })} /></Field>
            <Field label="Common mistake"><input className="aym-input" value={draft.mistake} onChange={e => setDraft({ ...draft, mistake: e.target.value })} /></Field>
            <Field label="Mentor name / designation"><input className="aym-input" value={draft.mentorName} onChange={e => setDraft({ ...draft, mentorName: e.target.value })} /></Field>
            {draftErr && <Notice tone="bad">{draftErr}</Notice>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" className="aym-btn aym-btn-ghost" disabled={saving} onClick={() => setDraft(null)}>Cancel</button>
              <button type="button" className="aym-btn aym-btn-primary" disabled={saving} onClick={saveDraft}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <PenLine size={15} />}
                {saving ? "Saving" : "Save to Track my answer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 7. Delegate registration — heroic, OTP-verified                     */
/* ------------------------------------------------------------------ */

function LeafDrift() {
  const leaves = useMemo(() => Array.from({ length: 10 }, (_, i) => ({
    left: (i * 10.7 + 3) % 94,
    delay: (i * 1.9) % 11,
    dur: 10 + (i % 5) * 2.8,
    size: 15 + (i % 4) * 7,
    hue: i % 3,
  })), []);
  return (
    <div className="aym-leaf-field" aria-hidden="true">
      {leaves.map((l, i) => (
        <span key={i} className="aym-leaf-drift"
          style={{ left: `${l.left}%`, animationDelay: `${l.delay}s`, animationDuration: `${l.dur}s`,
            color: l.hue === 0 ? "rgba(149,213,178,.55)" : l.hue === 1 ? "rgba(196,164,132,.5)" : "rgba(245,235,224,.4)" }}>
          <svg viewBox="0 0 24 24" width={l.size} height={l.size} fill="currentColor">
            <path d="M12 2C17.5 8 18.5 15 12 22 5.5 15 6.5 8 12 2Z" />
            <path d="M12 4v16" stroke="rgba(15,42,31,.4)" strokeWidth="1" fill="none" />
          </svg>
        </span>
      ))}
    </div>
  );
}

function PassRow({ label, value }) {
  return (
    <div className="aym-pass-row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function DelegatePass({ profile, onGoAsk, onSignOut }) {
  const issued = String(profile.regNo || "").trim();
  const [copied, setCopied] = useState(false);

  async function copyWac() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = issued;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } catch { /* ignore */ }
    }
  }

  return (
    <div className="aym-reg-wrap">
      <div className="aym-pass aym-rise">
        <div className="aym-hero-leaf" />
        <LeafDrift />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div className="aym-eyebrow" style={{ color: C.oak }}>AYURDISHA · Delegate profile</div>
              <h2 className="aym-display" style={{ color: "#fff", fontSize: "clamp(26px,4vw,34px)", margin: "6px 0 4px" }}>
                Welcome back, {String(profile.name || "").split(" ")[0]}.
              </h2>
              <p style={{ margin: 0, color: "rgba(245,235,224,.8)", fontSize: 14 }}>
                Your seat in the Meet the Mentors hall is saved on this device.
              </p>
            </div>
            <BadgeCheck size={30} color="#95D5B2" style={{ flexShrink: 0, marginTop: 4 }} />
          </div>

          <div className="aym-pass-no">
            <span>WAC registration number</span>
            {issued ? (
              <div className="aym-pass-no-row">
                <b className="aym-mono">{issued}</b>
                <button type="button" className="aym-pass-copy" onClick={copyWac} aria-label="Copy WAC registration number">
                  {copied ? <CopyCheck size={15} /> : <Copy size={15} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            ) : (
              <b className="aym-mono" style={{ fontSize: 16, letterSpacing: ".04em", fontWeight: 600 }}>
                Issuing your number…
              </b>
            )}
          </div>

          <div className="aym-pass-grid">
            <PassRow label="Name" value={profile.name} />
            <PassRow label="Age" value={profile.age} />
            <PassRow label="Sex" value={profile.sex} />
            <PassRow label="Institute" value={profile.institute} />
            <PassRow label="Email (verified)" value={profile.email} />
            <PassRow label="Registered" value={new Date(profile.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
            <button className="aym-btn aym-btn-gold" onClick={onGoAsk}>
              <Sparkles size={15} /> Autofill the Ask Desk <ArrowRight size={15} />
            </button>
            <button className="aym-btn" style={{ background: "rgba(255,255,255,.08)", color: "rgba(245,235,224,.85)", borderColor: "rgba(245,235,224,.25)" }} onClick={onSignOut}>
              <LogOut size={14} /> Sign out on this device
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RegSuccess({ profile, onGoAsk, onViewProfile }) {
  const issued = String(profile.regNo || "").trim();
  const chars = issued ? issued.split("") : [];
  const [copied, setCopied] = useState(false);

  async function copyWac() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore */ }
  }

  return (
    <div className="aym-reg-wrap">
      <div className="aym-pass aym-rise" style={{ textAlign: "center", padding: "44px 28px 38px" }}>
        <div className="aym-hero-leaf" />
        <LeafDrift />
        <div style={{ position: "relative" }}>
          <div style={{ display: "inline-flex", width: 56, height: 56, borderRadius: 28, background: "rgba(149,213,178,.16)", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <ShieldCheck size={28} color="#95D5B2" />
          </div>
          <div className="aym-eyebrow" style={{ color: C.oak }}>Email verified · Registration complete</div>
          <h2 className="aym-display" style={{ color: "#fff", fontSize: "clamp(28px,4.6vw,40px)", margin: "8px 0 20px" }}>
            Welcome to the hall, {String(profile.name || "").split(" ")[0]}.
          </h2>
          <div className="aym-regno-reveal">
            <span>Your WAC registration number</span>
            {issued ? (
              <b className="aym-mono">
                {chars.map((d, i) => <em key={i} style={{ animationDelay: `${.12 + i * .05}s` }}>{d}</em>)}
              </b>
            ) : (
              <b className="aym-mono" style={{ fontSize: 18, letterSpacing: ".04em" }}>Issuing your number…</b>
            )}
            {issued ? (
              <button type="button" className="aym-pass-copy aym-pass-copy-on-reveal" onClick={copyWac}>
                {copied ? <CopyCheck size={15} /> : <Copy size={15} />}
                {copied ? "Copied" : "Copy number"}
              </button>
            ) : null}
          </div>
          <p style={{ color: "rgba(245,235,224,.82)", fontSize: 14.5, lineHeight: 1.6, maxWidth: 420, margin: "18px auto 24px" }}>
            The Ask Desk recognises you by this issued WAC registration number. It is saved on this device and will autofill any questionnaire in the hall.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="aym-btn aym-btn-gold" onClick={onGoAsk}>
              Walk up to the Ask Desk <ArrowRight size={15} />
            </button>
            <button className="aym-btn" style={{ background: "rgba(255,255,255,.08)", color: "#fff", borderColor: "rgba(245,235,224,.3)" }} onClick={onViewProfile}>
              View my profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RegisterView({ profile, onRegistered, onSignOut, onGoAsk }) {
  const [step, setStep] = useState("form");         // form | otp | done
  const [f, setF] = useState({ name: "", age: "", sex: "", institute: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [delivery, setDelivery] = useState("email");
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [justDone, setJustDone] = useState(null);
  // Randomised field name + autocomplete=off so browsers never autofill the code.
  const otpName = useRef("code_" + Math.random().toString(36).slice(2, 10));
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function start() {
    setErr("");
    const problems = [];
    const age = Number(f.age);
    if (f.name.trim().length < 2) problems.push("your full name");
    if (!Number.isFinite(age) || age < 15 || age > 100) problems.push("a valid age (15–100)");
    if (!f.sex) problems.push("your sex");
    if (f.institute.trim().length < 2) problems.push("your institute name");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) problems.push("a valid email address");
    if (problems.length) { setErr(`Add ${problems.join(", ")} first.`); return; }
    setBusy(true);
    try {
      const r = await api("regStart", {
        name: f.name.trim(), age, sex: f.sex, institute: f.institute.trim(),
        email: f.email.trim(),
      });
      setDelivery(r.delivery || "email");
      setCooldown(r.resendIn || 60);
      setOtp("");
      setStep("otp");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr(e.message || "We could not send the code. Check your connection.");
      if (e.data && e.data.retryIn) setCooldown(e.data.retryIn);
    }
    setBusy(false);
  }

  async function resend() {
    setErr(""); setBusy(true);
    try {
      const r = await api("regResend", { email: f.email.trim() });
      setDelivery(r.delivery || "email");
      setCooldown(r.resendIn || 60);
    } catch (e) {
      setErr(e.message || "Could not resend the code.");
      if (e.data && e.data.retryIn) setCooldown(e.data.retryIn);
    }
    setBusy(false);
  }

  async function verify() {
    const code = otpDigits(otp);
    if (code !== otp) setOtp(code);
    if (!/^\d{6}$/.test(code)) {
      setErr("Type the 6-digit code from the email.");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      const r = await api("regVerify", { email: f.email.trim(), otp: code });
      if (!r || !r.profile || !r.token) {
        setErr("We could not complete registration. Try again.");
        return;
      }
      setJustDone(r.profile);
      onRegistered(r.token, r.profile);
      setStep("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr(e.message || "That code does not match. Request a new one if it has expired.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "done" && justDone) {
    return <RegSuccess profile={justDone} onGoAsk={onGoAsk} onViewProfile={() => { setJustDone(null); setStep("form"); }} />;
  }

  if (profile) {
    return <DelegatePass profile={profile} onGoAsk={onGoAsk} onSignOut={onSignOut} />;
  }

  return (
    <div className="aym-reg-wrap">
      <div className="aym-reg-hero">
        <div className="aym-hero-leaf" />
        <LeafDrift />
        <div style={{ position: "relative" }}>
          <div className="aym-eyebrow" style={{ color: C.oak }}>Registration · Meet the Mentors</div>
          <h1 className="aym-display">Take your place in the hall.</h1>
          <p>
            Register once with your name, institute, and email. We verify that inbox with a one-time code,
            then the hall issues your WAC registration number — you do not type one.
          </p>
          <div className="aym-reg-steps">
            <span className={step === "form" ? "on" : ""}>1 · Your details</span>
            <span className={step === "otp" ? "on" : ""}>2 · Verify email</span>
            <span>3 · Confirmed</span>
          </div>
        </div>
      </div>

      {err && step !== "otp" && <Notice tone="bad">{err}</Notice>}

      {step === "form" && (
        <div className="aym-card aym-rise" style={{ padding: "26px 24px", animationDelay: ".1s" }}>
          <div className="aym-eyebrow" style={{ marginBottom: 6 }}>Who walks in</div>
          <h3 className="aym-display" style={{ fontSize: 19, color: C.maroon, margin: "0 0 18px" }}>Introduce yourself once</h3>

          <Field label="Full name" required>
            <input className="aym-input" value={f.name} onChange={e => set("name", e.target.value)} autoComplete="name" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14 }}>
            <Field label="Age" required>
              <input className="aym-input" type="number" min="15" max="100" inputMode="numeric" value={f.age} onChange={e => set("age", e.target.value)} />
            </Field>
            <Field label="Sex" required>
              <select className="aym-input" value={f.sex} onChange={e => set("sex", e.target.value)}>
                <option value="">Select</option>{SEX_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Institute name" required>
            <input className="aym-input" value={f.institute} onChange={e => set("institute", e.target.value)} autoComplete="organization" />
          </Field>
          <Field label="Email" required hint="We send a 6-digit code here — your registration completes only after you type it in.">
            <input className="aym-input" type="email" value={f.email} onChange={e => set("email", e.target.value)} autoComplete="email" />
          </Field>
          <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55, margin: "0 0 14px" }}>
            Your WAC registration number is issued automatically after you verify this email. You will not need to type or save one.
          </p>

          <button className="aym-btn aym-btn-primary" style={{ width: "100%", justifyContent: "center", padding: 13, fontSize: 15, marginTop: 4 }} disabled={busy} onClick={start}>
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Mail size={16} />}
            {busy ? "Sending your code" : "Send my verification code"}
          </button>
          <p style={{ fontSize: 12, color: C.muted, textAlign: "center", marginTop: 12, lineHeight: 1.55, marginBottom: 0 }}>
            Your details stay with the curation desk. The stage board never shows mentee names.
          </p>
        </div>
      )}

      {step === "otp" && (
        <form className="aym-card aym-rise" style={{ padding: "30px 24px", textAlign: "center" }} onSubmit={e => { e.preventDefault(); verify(); }}>
          <div style={{ display: "inline-flex", width: 50, height: 50, borderRadius: 25, background: C.tan, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Mail size={24} color={C.maroon} />
          </div>
          <h3 className="aym-display" style={{ fontSize: 21, color: C.maroon, margin: "0 0 6px" }}>Check {f.email}</h3>
          <p style={{ fontSize: 13.5, color: C.muted, margin: "0 auto 18px", maxWidth: 400, lineHeight: 1.6 }}>
            Type the 6-digit code from the email. It expires in 10 minutes and must be typed by hand — it will not autofill.
          </p>

          {delivery === "console" && (
            <div style={{ textAlign: "left" }}>
              <Notice tone="warn">
                Email sending is not configured on this server yet, so the code was printed on the <b>server console</b> (dev mode). Ask the desk staff for it.
              </Notice>
            </div>
          )}

          {err && (
            <div style={{ textAlign: "left", marginBottom: 12 }}>
              <Notice tone="bad">{err}</Notice>
            </div>
          )}

          <input
            className="aym-input aym-otp-input"
            type="text"
            name={otpName.current}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="numeric"
            pattern="[0-9 ]*"
            maxLength={24}
            value={otp}
            autoFocus
            data-lpignore="true"
            data-1p-ignore="true"
            onChange={e => { setOtp(otpDigits(e.target.value)); if (err) setErr(""); }}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); verify(); } }}
            placeholder="······"
            aria-label="6-digit verification code"
          />

          <button type="button" className="aym-btn aym-btn-primary" style={{ width: "100%", justifyContent: "center", padding: 13, fontSize: 15, marginTop: 16 }} disabled={busy} onClick={verify}>
            {busy ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={16} />}
            {busy ? "Verifying" : "Verify and complete registration"}
          </button>

          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 14 }}>
            <button type="button" className="aym-btn aym-btn-ghost" disabled={busy || cooldown > 0} onClick={resend}>
              <RefreshCw size={14} />{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend the code"}
            </button>
            <button type="button" className="aym-btn aym-btn-ghost" disabled={busy} onClick={() => { setStep("form"); setErr(""); }}>
              Edit my details
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 8. Staff — registered delegates panel                               */
/* ------------------------------------------------------------------ */

const DELEGATE_PAGE = 12;

function exportDelegatesPdf(users) {
  const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = (users || []).map((u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(u.regNo || "Not issued yet")}</td>
      <td>${esc(u.name)}</td>
      <td>${esc(u.age)} · ${esc(u.sex)}</td>
      <td>${esc(u.institute)}</td>
      <td>${esc(u.email)}</td>
      <td>${esc(fmtWhen(u.createdAt))}</td>
    </tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>AYURDISHA delegates</title>
    <style>
      body{font-family:Georgia,serif;color:#1A2E24;padding:28px;background:#F5EBE0}
      h1{font-size:22px;margin:0 0 6px;color:#1B4332}
      p{color:#5C6B62;margin:0 0 16px}
      table{width:100%;border-collapse:collapse;background:#fff;font-size:12px}
      th,td{border:1px solid #D9CBB8;padding:8px 10px;text-align:left}
      th{background:#1B4332;color:#F5EBE0}
    </style></head><body>
    <h1>AYURDISHA · registered delegates</h1>
    <p>Meet the Mentors · World Ayurveda Congress 2026 · ${users.length} genuine OTP-verified records · ${new Date().toLocaleString("en-IN")}</p>
    <table><thead><tr><th>#</th><th>WAC registration number</th><th>Name</th><th>Age / sex</th><th>Institute</th><th>Email</th><th>Registered</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7">No genuine delegates yet.</td></tr>`}</tbody></table>
    <script>window.onload=function(){window.print()}</script>
    </body></html>`;
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    downloadBlob(html, "AYURDISHA-delegates.html", "text/html");
    return;
  }
  w.document.write(html);
  w.document.close();
}

function DelegatesPanel({ users: incoming, onRefresh, loading }) {
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const users = incoming || [];
  const pages = Math.max(1, Math.ceil(users.length / DELEGATE_PAGE));
  const safePage = Math.min(page, pages - 1);
  const slice = users.slice(safePage * DELEGATE_PAGE, safePage * DELEGATE_PAGE + DELEGATE_PAGE);

  useEffect(() => {
    if (page > pages - 1) setPage(Math.max(0, pages - 1));
  }, [pages, page]);

  async function refresh() {
    setBusy(true); setError("");
    try {
      await onRefresh();
    } catch (e) {
      setError(e.message || "Refresh failed.");
    }
    setBusy(false);
  }

  return (
    <aside className="aym-staff-aside">
      <div className="aym-staff-connect aym-card" aria-hidden="true">
        <MentorConnectScene compact />
        <p className="aym-staff-connect-copy">Mentees meet mentors across the hall — every OTP-verified delegate below.</p>
      </div>
      <div className="aym-card aym-delegate-panel" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
          <div>
            <div className="aym-eyebrow">Registered delegates</div>
            <div className="aym-serif" style={{ fontSize: 24, fontWeight: 700, color: C.maroon, lineHeight: 1.1 }}>
              {loading && incoming == null ? "…" : users.length}
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>OTP-verified only</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button className="aym-btn aym-btn-ghost" style={{ padding: "7px 12px", fontSize: 12.5 }} onClick={refresh} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Refresh
            </button>
            <button className="aym-btn aym-btn-ghost" style={{ padding: "7px 12px", fontSize: 12.5 }} onClick={() => exportDelegatesPdf(users)} disabled={!users.length}>
              <Printer size={13} />Download PDF
            </button>
          </div>
        </div>

        {error && <Notice tone="bad">{error}</Notice>}
        {!users.length && !error && (
          <div style={{ fontSize: 13, color: C.muted, padding: "10px 0" }}>
            No genuine delegates yet. Only OTP-verified registrations appear here — sample / test accounts are hidden from the count.
          </div>
        )}

        <div className="aym-delegate-slide">
          {slice.map(u => (
            <div key={u.email || u.regNo} className="aym-delegate-card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <b style={{ fontSize: 14, color: C.maroon }}>{u.name}</b>
                <span className="aym-mono" style={{ fontSize: 12.5, fontWeight: 700, color: u.regNo ? C.oak : C.muted }} title="WAC registration number">{u.regNo || "Not issued yet"}</span>
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>{u.age} · {u.sex}</div>
              <div style={{ fontSize: 12.5, color: C.ink, marginTop: 3 }}>{u.institute}</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3, wordBreak: "break-all" }}>{u.email}</div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 5 }}>Registered {fmtWhen(u.createdAt)}</div>
            </div>
          ))}
        </div>

        {users.length > 0 && (
          <div className="aym-delegate-pager">
            <button type="button" className="aym-btn aym-btn-ghost" style={{ padding: "6px 10px" }}
              disabled={safePage <= 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
              <ChevronLeft size={14} />
            </button>
            <input type="range" min={0} max={pages - 1} value={safePage}
              onChange={e => setPage(Number(e.target.value))}
              aria-label="Slide through registered delegates" />
            <button type="button" className="aym-btn aym-btn-ghost" style={{ padding: "6px 10px" }}
              disabled={safePage >= pages - 1} onClick={() => setPage(p => Math.min(pages - 1, p + 1))}>
              <ChevronRight size={14} />
            </button>
            <span className="aym-mono" style={{ fontSize: 11.5, color: C.muted }}>
              {users.length <= DELEGATE_PAGE ? `${users.length} on this desk` : `${safePage * DELEGATE_PAGE + 1}–${Math.min(users.length, (safePage + 1) * DELEGATE_PAGE)} of ${users.length}`}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Demo data                                                           */
/* ------------------------------------------------------------------ */

const SEED = [
  ["Clinical Practice & Integrative Care", "Setting up private practice", "How do I start my own Ayurveda clinic right after internship without much capital?", "Kerala", "Intern"],
  ["Clinical Practice & Integrative Care", "Setting up private practice", "What is the minimum investment and which licences do I need to open a small Ayurveda clinic after BAMS?", "Maharashtra", "BAMS student (3rd–final prof)"],
  ["Clinical Practice & Integrative Care", "Setting up private practice", "I want to open a clinic in a small town. What licence and how much money do I need to start?", "Rajasthan", "Graduate (up to 5 years)"],
  ["Clinical Practice & Integrative Care", "Hospital employment", "Is it better to work in a government hospital first or go into private practice straight away?", "Odisha", "Intern"],
  ["Research, Evidence & Publication", "Framing a research question", "How do I choose a feasible research question for my MD thesis in Ayurveda?", "Karnataka", "MD / MS postgraduate"],
  ["Research, Evidence & Publication", "Framing a research question", "My guide has asked me to finalise a thesis topic. How do I pick a research question that is actually feasible in two years?", "Gujarat", "MD / MS postgraduate"],
  ["Research, Evidence & Publication", "Thesis & publication", "Which journals accept Ayurveda clinical studies and how do I avoid predatory ones?", "Delhi", "PhD scholar"],
  ["Export & Global Trade", "Certification and quality marks", "What certifications are required to export Ayurvedic churna to the European market?", "Gujarat", "Graduate (up to 5 years)"],
  ["Export & Global Trade", "Certification and quality marks", "Which documents and certificates are needed for exporting Ayurvedic products to Europe?", "Maharashtra", "Practitioner"],
  ["Export & Global Trade", "Getting started in export", "I have a small formulation unit. What is the first step to begin exporting at all?", "Tamil Nadu", "Practitioner"],
  ["Practice Abroad & Practitioner Mobility", "Country-wise recognition", "Can a BAMS graduate practise legally in the UAE, and what licence is required?", "Kerala", "Graduate (up to 5 years)"],
  ["Practice Abroad & Practitioner Mobility", "Country-wise recognition", "Is BAMS recognised in Germany for clinical practice, or only for wellness work?", "Punjab", "MD / MS postgraduate"],
  ["Academics, Teaching & Higher Education", "Choosing a PG branch", "How should I choose between Kayachikitsa and Kaumarbhritya for my PG?", "Uttar Pradesh", "Intern"],
  ["Academics, Teaching & Higher Education", "Faculty recruitment & eligibility", "What is the eligibility to become a lecturer in an Ayurveda college and when should I start preparing?", "West Bengal", "MD / MS postgraduate"],
  ["Entrepreneurship & Start-ups", "Validating the idea", "How do I test whether my Ayurvedic skincare idea has a real market before spending money?", "Karnataka", "Graduate (up to 5 years)"],
  ["Entrepreneurship & Start-ups", "Funding & finance", "Which government schemes fund an Ayurveda start-up founded by a fresh BAMS graduate?", "Madhya Pradesh", "Intern"],
  ["Manufacturing, Quality & GMP", "GMP and licensing", "What does a small unit need to get a GMP certificate for Ayurvedic manufacturing?", "Himachal Pradesh", "Practitioner"],
  ["Policy, Public Health & Global Agencies", "Government service routes", "What is the route to a government AYUSH medical officer post and how competitive is it?", "Bihar", "BAMS student (3rd–final prof)"],
  ["Policy, Public Health & Global Agencies", "International organisations", "How does an Ayurveda graduate get into WHO or similar international health work?", "Assam", "PhD scholar"],
  ["Medical Value Travel & Wellness", "How the MVT ecosystem works", "How does medical value travel actually work and where does an Ayurveda doctor fit in it?", "Goa", "Graduate (up to 5 years)"],
  ["Brand Building & Communication", "Advertising & claims compliance", "What can I legally claim about an Ayurvedic product in social media advertising?", "Telangana", "Practitioner"],
  ["Clinical Practice & Integrative Care", "Panchakarma & therapy services", "Do I need separate approval to run Panchakarma therapies in my clinic?", "Andhra Pradesh", "Graduate (up to 5 years)"],
];

async function seedDemo() {
  const now = Date.now();
  const recs = SEED.map(([theme, sub, question, state, stage], i) => ({
    id: rid(10), ticket: ticketId(), createdAt: now - (SEED.length - i) * 90000,
    name: `Demo Student ${i + 1}`, email: `demo${i + 1}@example.in`, mobile: "",
    state, institution: `Ayurveda College ${1 + (i % 9)}`, stage,
    registered: i % 3 === 0 ? "Yes" : i % 3 === 1 ? "Registration in process" : "No",
    regNo: i % 3 === 0 ? `11WAC/2026/${String(1 + i).padStart(4, "0")}` : "",
    inPerson: i % 3 === 0 ? "Yes" : "Not yet confirmed",
    days: i % 3 === 0 ? [CORE_DAYS[i % 3]] : [],
    theme, subtheme: sub, question, context: "", outcome: "",
    consentPublish: "Yes", consentFollow: i % 2 ? "Yes" : "No",
    anonId: `U-DEMO${String(i + 1).padStart(4, "0")}`,
  }));
  for (const r of recs) await store.set(K_Q + r.id, r);
  return recs.length;
}

/* ------------------------------------------------------------------ */
/* App shell                                                           */
/* ------------------------------------------------------------------ */

function StaffPinModal({ pinValue, pinError, setPinValue, setPinError, onUnlock, onClose }) {
  const titleId = useId();
  const panelRef = useRef(null);
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="aym-modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panelRef}
        className="aym-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ padding: 24, maxWidth: 380, width: "100%" }}
      >
        <div className="aym-eyebrow">Staff</div>
        <h2 id={titleId} className="aym-display" style={{ fontSize: 19, color: C.maroon, margin: "6px 0" }}>Staff sign-in</h2>
        <p style={{ fontSize: 13.5, color: C.muted, margin: "0 0 16px", lineHeight: 1.55 }}>
          Enter the authority staff code. Only that provided code works. Students cannot create or set a code here.
        </p>
        <label className="aym-visually-hidden" htmlFor="staff-pin">Authority staff code</label>
        <input
          id="staff-pin"
          className="aym-input"
          type="password"
          value={pinValue}
          autoFocus
          autoComplete="current-password"
          aria-invalid={pinError ? true : undefined}
          aria-describedby={pinError ? "staff-pin-err" : undefined}
          onChange={e => { setPinValue(e.target.value); setPinError(""); }}
          onKeyDown={e => e.key === "Enter" && onUnlock()}
          placeholder="Authority staff code"
        />
        {pinError && <div id="staff-pin-err" role="alert" style={{ color: "#8B2020", fontSize: 13, marginTop: 8 }}>{pinError}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button type="button" className="aym-btn aym-btn-primary" onClick={onUnlock}>Enter</button>
          <button type="button" className="aym-btn aym-btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { id: "hall", label: "The hall", icon: Leaf, public: true },
  { id: "mentors", label: "Mentors", icon: Users, public: true },
  { id: "register", label: "Register", icon: UserPlus, public: true },
  { id: "ask", label: "Ask Desk", icon: Send, public: true },
  { id: "pods", label: "Knowledge", icon: GraduationCap, public: true },
  { id: "exchange", label: "Opportunity Exchange", icon: Compass, public: true },
  { id: "track", label: "Track my answer", icon: Ticket, public: true },
  { id: "board", label: "Open theme stage", icon: BookOpen, public: true },
  { id: "staff", label: "Staff Portal", icon: ShieldCheck, public: false },
  { id: "curate", label: "Curation desk", icon: Layers, public: false },
  { id: "insights", label: "Insights", icon: Map, public: false },
  { id: "pack", label: "Mentor pack", icon: FileSpreadsheet, public: false },
];

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  // Global Scroll-To-Top listener triggered by location change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname, location.search]);
  const appPath = parseAppPath(location.pathname);
  const onMentorsRoute = appPath.kind === "mentors";
  const mentorId = appPath.kind === "mentors" ? appPath.mentorId : null;
  const legalPage = appPath.kind === "legal" ? appPath.page : null;
  const onWelcomeRoute = appPath.kind === "welcome";
  const isNotFound = appPath.kind === "404";

  const [tab, setTab] = useState(() => {
    if (typeof window === "undefined") return "intro";
    return tabFromUrl(window.location.pathname, window.location.hash);
  });
  const [subs, setSubs] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [clustersVersion, setClustersVersion] = useState(1);
  const [clusterConflict, setClusterConflict] = useState(null);
  const [clusterSaveStatus, setClusterSaveStatus] = useState("idle");
  const clustersVersionRef = useRef(1);
  const clusterSaveTimerRef = useRef(null);
  const clusterSavedTimerRef = useRef(null);
  const pendingClustersRef = useRef(null);
  const [delegates, setDelegates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState("");
  const [staff, setStaff] = useState(false);
  const [pinPrompt, setPinPrompt] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState("");
  const [config, setConfig] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [askPreset, setAskPreset] = useState(null);
  const [profile, setProfile] = useState(() => {
    const s = loadLocalSession();
    return s && s.token && s.profile ? s.profile : null;
  });

  // Validate + refresh the delegate session against the server.
  // Missing WAC numbers are issued on the server during regMe — retry briefly if still empty.
  useEffect(() => {
    const s = loadLocalSession();
    if (!s || !s.token) return;
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        try {
          const r = await api("regMe", { token: s.token });
          const local = loadLocalSession();
          const server = r.profile || {};
          const localWac = local && local.profile ? String(local.profile.regNo || "").trim() : "";
          const merged = {
            ...server,
            regNo: String(server.regNo || "").trim() || localWac || "",
          };
          if (cancelled) return;
          setProfile(merged);
          saveLocalSession({ token: s.token, profile: merged });
          if (String(merged.regNo || "").trim()) return;
        } catch (e) {
          if (e.status === 403) {
            const local = loadLocalSession();
            if (local && local.profile) setProfile(local.profile);
            return;
          }
        }
        await new Promise(ok => setTimeout(ok, 700));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onRegistered = useCallback((token, prof) => {
    saveLocalSession({ token, profile: prof });
    setProfile(prof);
  }, []);

  const signOutDelegate = useCallback(() => {
    saveLocalSession(null);
    setProfile(null);
  }, []);

  const goTab = useCallback((id, { preset, replace = false } = {}) => {
    if (id === "ask") setAskPreset(preset === undefined ? null : preset);
    if (id === "mentors") {
      setTab("mentors");
      navigate("/mentors", { replace });
      window.scrollTo(0, 0);
      return;
    }
    if (id === "intro") {
      setTab("intro");
      navigate({ pathname: "/", hash: "" }, { replace });
      window.scrollTo(0, 0);
      return;
    }
    setTab(id);
    navigate({ pathname: "/", hash: `#${id}` }, { replace });
    window.scrollTo(0, 0);
  }, [navigate]);

  const [visitGuide, setVisitGuide] = useState(null);
  const pendingVisitGoRef = useRef(null);

  const openWelcome = useCallback(() => {
    navigate("/welcome");
    window.scrollTo(0, 0);
  }, [navigate]);

  const requestGoTab = useCallback((id, opts = {}) => {
    // Soften: after welcome in this session, skip feature coaches so we don't double-bomb.
    if (
      FIRST_VISIT_GUIDES[id] &&
      !hasSeenFirstVisit(id) &&
      !welcomeShownThisSession()
    ) {
      pendingVisitGoRef.current = { id, opts };
      setVisitGuide(id);
      return;
    }
    goTab(id, opts);
  }, [goTab]);

  const finishVisitGuide = useCallback(() => {
    const id = visitGuide;
    if (id) markFirstVisitSeen(id);
    setVisitGuide(null);
    const pending = pendingVisitGoRef.current;
    pendingVisitGoRef.current = null;
    if (pending) goTab(pending.id, pending.opts);
  }, [visitGuide, goTab]);

  // Intercept hash / deep-link CTAs before navigation so guides only fire on tap
  // (never on cold load of /#ask, /#track, etc.).
  useEffect(() => {
    const onClick = (e) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!a) return;
      const href = a.getAttribute("href");
      const id = firstVisitIdFromHref(href);
      if (!id) return;
      e.preventDefault();
      requestGoTab(id);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [requestGoTab]);

  const goAsk = useCallback((preset) => {
    requestGoTab("ask", { preset: preset || null });
  }, [requestGoTab]);

  const enterStaff = useCallback(async () => {
    setStaff(true);
    goTab("insights");
  }, [goTab]);

  const leaveStaff = useCallback(async () => {
    await staffLogout();
    setStaff(false);
    setSubs([]);
    goTab("hall");
  }, [goTab]);

  const applyClustersVersion = useCallback(v => {
    if (v == null) return;
    clustersVersionRef.current = v;
    setClustersVersion(v);
  }, []);

  const reportClusterConflict = useCallback(e => {
    if (e?.status !== 409) return;
    if (e.data?.clustersVersion != null) applyClustersVersion(e.data.clustersVersion);
    setClusterConflict({
      message: e.message || "Another staff member updated the curation desk while you were editing.",
    });
  }, [applyClustersVersion]);

  const reload = useCallback(async (asStaff = staff) => {
    setLoading(true);
    setClusterConflict(null);
    try {
      if (asStaff) {
        const snap = await api("staffSnapshot");
        setSubs(Array.isArray(snap.questions) ? snap.questions : []);
        setClusters(Array.isArray(snap.clusters) ? snap.clusters : []);
        applyClustersVersion(snap.clustersVersion ?? 1);
        setDelegates(Array.isArray(snap.users) ? snap.users : []);
        setConfig(c => ({ ...(c || {}), hasPin: true, backend: snap.backend }));
      } else {
        const [cl, cfg] = await Promise.all([store.get(K_CLUSTERS), store.get(K_CONFIG)]);
        setConfig(cfg || {});
        setSubs([]);
        setDelegates([]);
        setClusters(publishedClusters(cl));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setProgress("");
      setLoading(false);
    }
  }, [staff, applyClustersVersion]);

  const onAskSaved = useCallback((rec, serverProfile) => {
    if (staff) reload(true);
    const wac = String((serverProfile && serverProfile.regNo) || (rec && rec.regNo) || "").trim();
    if (!wac) return;
    setProfile(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...(serverProfile || {}), regNo: wac };
      const s = loadLocalSession();
      if (s && s.token) saveLocalSession({ token: s.token, profile: next });
      return next;
    });
  }, [staff, reload]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await staffWhoami();
      if (cancelled) return;
      setConfig({ hasPin: me.hasPin });
      if (me.staff) {
        setStaff(true);
        await reload(true);
      } else {
        await reload(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (onMentorsRoute && mentorId) {
      const mentor = getMentorByParam(mentorId);
      if (mentor) {
        const canonical = mentorPublicPath(mentor);
        const here = location.pathname.replace(/\/+$/, "") || "/";
        if (canonical !== here) {
          navigate(canonical, { replace: true });
          return;
        }
      }
    }
    if (onMentorsRoute) {
      setTab(t => (t === "mentors" ? t : "mentors"));
      window.scrollTo(0, 0);
      return;
    }
    if (legalPage || isNotFound || onWelcomeRoute) return;
    const hashTab = tabFromHash(location.hash);
    if (hashTab === "mentors") {
      navigate("/mentors", { replace: true });
      return;
    }
    if (hashTab === "intro") {
      navigate({ pathname: "/", hash: "" }, { replace: true });
    }
    const next = tabFromUrl(location.pathname, location.hash);
    setTab(t => (t === next ? t : next));
  }, [location.pathname, location.hash, onMentorsRoute, mentorId, legalPage, isNotFound, onWelcomeRoute, navigate]);

  useEffect(() => {
    if (legalPage || isNotFound || onWelcomeRoute) return;
    if (onMentorsRoute && mentorId) {
      const mentor = getMentorByParam(mentorId);
      if (!mentor) {
        setPageMeta({
          title: "Mentor not found · AYURDISHA · WAC 2026",
          description: "That mentor is not on the current AYURDISHA Meet the Mentors roster for the 11th World Ayurveda Congress.",
          path: `/mentors/${encodeURIComponent(mentorId)}`,
          robots: "noindex",
        });
        return;
      }
      const desc = [mentor.designation, mentor.affiliation, mentor.bio]
        .map(s => String(s || "").trim())
        .filter(Boolean)
        .join(" — ") || `${mentor.name} is a tentative mentor for AYURDISHA Meet the Mentors at WAC 2026.`;
      const path = mentorPublicPath(mentor);
      setPageMeta({
        title: `${mentor.name} · Mentors · AYURDISHA`,
        description: desc.slice(0, 220),
        path,
        type: "profile",
        personLd: personJsonLd(mentor, path),
        breadcrumbLd: breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Mentors", path: "/mentors" },
          { name: mentor.name, path },
        ]),
      });
      return;
    }
    if (onMentorsRoute) {
      setPageMeta({
        title: "Meet the Mentors · AYURDISHA · WAC 2026",
        description:
          "Browse the tentative mentor roster for AYURDISHA at the 11th World Ayurveda Congress, Bhubaneswar — Ayurveda career guides for BAMS mentees.",
        path: "/mentors",
        breadcrumbLd: breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Mentors", path: "/mentors" },
        ]),
      });
      return;
    }
    const titles = {
      intro: ["AYURDISHA · Meet the Mentors · WAC 2026", "Walk into the digital Meet the Mentors hall of the 11th World Ayurveda Congress. Register, receive your WAC number, and a mentor answers."],
      hall: ["The Hall · AYURDISHA · WAC 2026", "Enter the AYURDISHA hall — podcast corner and Congress selection results at the 11th World Ayurveda Congress."],
      register: ["Register · AYURDISHA · WAC 2026", "Register for AYURDISHA with your name, institute, and email. Your WAC registration number is issued when you verify."],
      ask: ["Ask Desk · AYURDISHA · WAC 2026", "Ask one career question at the AYURDISHA Ask Desk. Your issued WAC registration number is attached automatically."],
      pods: ["Knowledge · AYURDISHA · WAC 2026", "Explore AYURDISHA knowledge pods for BAMS career pathways at the World Ayurveda Congress."],
      exchange: ["Opportunity Exchange · AYURDISHA", "Career paths after BAMS — PG, practice, research, public health, start-ups, and practice abroad."],
      track: ["Track my answer · AYURDISHA", "Track your Ask Desk ticket and see when a mentor answers."],
      board: ["Open theme stage · AYURDISHA", "Published mentor answers from the AYURDISHA Meet the Mentors hall."],
      podcast: ["Podcast · AYURDISHA · WAC 2026", "Watch recorded mentor conversations from the AYURDISHA hall at the 11th World Ayurveda Congress."],
      staff: ["Staff Portal · AYURDISHA", "Official staff curation & management portal."],
      curate: ["Curation Desk · AYURDISHA Staff", "Review and group submitted delegate questions."],
      insights: ["Insights · AYURDISHA Staff", "View delegate question trends and briefing summaries."],
      pack: ["Mentor Pack · AYURDISHA Staff", "Mentor briefing packs and export tools."],
    };
    const pair = titles[tab] || titles.intro;
    const staffish = tab === "staff" || tab === "curate" || tab === "insights" || tab === "pack";
    setPageMeta({
      title: pair[0],
      description: pair[1],
      path: tab === "intro" ? "/" : (tab === "staff" ? "/staff" : `/#${tab}`),
      robots: staffish ? "noindex, nofollow" : undefined,
      jsonLd: tab === "intro" ? faqJsonLd(LAND_FAQS) : null,
    });
  }, [onMentorsRoute, mentorId, tab, legalPage, isNotFound, onWelcomeRoute]);

  const enterFromLand = useCallback((next) => {
    requestGoTab(next);
  }, [requestGoTab]);


  const persistClusters = useCallback(async next => {
    if (await hasApi()) {
      const r = await api("clustersSave", { clusters: next, version: clustersVersionRef.current });
      applyClustersVersion(r.clustersVersion ?? clustersVersionRef.current);
      return Array.isArray(r.clusters) ? r.clusters : next;
    }
    const ok = await store.set(K_CLUSTERS, next);
    if (!ok) throw new Error("Could not save merged groups on this device.");
    return next;
  }, [applyClustersVersion]);

  const markClusterSaved = useCallback(() => {
    setClusterSaveStatus("saved");
    if (clusterSavedTimerRef.current) clearTimeout(clusterSavedTimerRef.current);
    clusterSavedTimerRef.current = setTimeout(() => {
      clusterSavedTimerRef.current = null;
      setClusterSaveStatus("idle");
    }, 2200);
  }, []);

  const saveClusters = useCallback(async (next, { immediate = false } = {}) => {
    const runSave = async () => {
      pendingClustersRef.current = null;
      setClusterSaveStatus("saving");
      try {
        const saved = await persistClusters(next);
        markClusterSaved();
        return saved;
      } catch (e) {
        setClusterSaveStatus("idle");
        reportClusterConflict(e);
        throw e;
      }
    };

    if (immediate) {
      if (clusterSaveTimerRef.current) {
        clearTimeout(clusterSaveTimerRef.current);
        clusterSaveTimerRef.current = null;
      }
      pendingClustersRef.current = null;
      return runSave();
    }

    pendingClustersRef.current = next;
    setClusterSaveStatus("pending");
    return new Promise((resolve, reject) => {
      if (clusterSaveTimerRef.current) clearTimeout(clusterSaveTimerRef.current);
      clusterSaveTimerRef.current = setTimeout(async () => {
        clusterSaveTimerRef.current = null;
        const pending = pendingClustersRef.current;
        if (!pending) { resolve(next); return; }
        try {
          resolve(await runSave());
        } catch (e) {
          reject(e);
        }
      }, CLUSTER_SAVE_DEBOUNCE_MS);
    });
  }, [persistClusters, reportClusterConflict, markClusterSaved]);

  const flushClusterSave = useCallback(async () => {
    if (clusterSaveTimerRef.current) {
      clearTimeout(clusterSaveTimerRef.current);
      clusterSaveTimerRef.current = null;
    }
    const pending = pendingClustersRef.current;
    if (!pending) return null;
    pendingClustersRef.current = null;
    setClusterSaveStatus("saving");
    try {
      const saved = await persistClusters(pending);
      markClusterSaved();
      return saved;
    } catch (e) {
      setClusterSaveStatus("idle");
      reportClusterConflict(e);
      throw e;
    }
  }, [persistClusters, reportClusterConflict, markClusterSaved]);

  useEffect(() => () => {
    if (clusterSavedTimerRef.current) clearTimeout(clusterSavedTimerRef.current);
    if (clusterSaveTimerRef.current && pendingClustersRef.current) {
      clearTimeout(clusterSaveTimerRef.current);
      persistClusters(pendingClustersRef.current).catch(() => {});
    }
  }, [persistClusters]);

  async function unlock() {
    const pin = pinValue.trim();
    if (pin.length < 4) { setPinError("Use at least four characters."); return; }
    try {
      await staffLogin(pin);
      setPinPrompt(false); setPinValue(""); setPinError("");
      await enterStaff();
      await reload(true);
    } catch (e) {
      setPinError(e.message || "That code does not match.");
    }
  }

  async function lockAndPublic() {
    await leaveStaff();
    await reload(false);
  }

  async function wipe() {
    const keys = await store.list(K_Q);
    for (const k of keys) await store.del(k);
    await store.del(K_CLUSTERS);
    setSubs([]); setClusters([]);
  }

  const visible = TABS.filter(t => t.public || staff);
  const fullBleed = tab === "hall" && !legalPage && !isNotFound;
  const closePin = useCallback(() => { setPinPrompt(false); setPinValue(""); setPinError(""); }, []);
  const pinModal = pinPrompt ? (
    <StaffPinModal
      pinValue={pinValue}
      pinError={pinError}
      setPinValue={setPinValue}
      setPinError={setPinError}
      onUnlock={unlock}
      onClose={closePin}
    />
  ) : null;

  return (
    <ErrorBoundary>
      <div className="aym" style={{ minHeight: "100vh" }}>
        {!onWelcomeRoute && (
          <a className="aym-skip" href="#main">Skip to content</a>
        )}
        {!onWelcomeRoute && (
          <AppHeader
            tabs={visible}
            tab={tab}
            onGoTab={requestGoTab}
            staff={staff}
            onStaffClick={() => { if (staff) lockAndPublic(); else setPinPrompt(true); }}
            brandToIntro={() => goTab("intro")}
            onOpenWelcome={openWelcome}
          />
        )}

        {staff && (tab === "curate" || tab === "insights" || tab === "pack") && (
          <div className="aym-staff-tip" role="status">
            <HelpCircle size={15} aria-hidden="true" />
            <span>Curation: one editor at a time recommended; Insights can run in parallel.</span>
          </div>
        )}

        {visitGuide && (
          <FirstVisitGuide guideId={visitGuide} onContinue={finishVisitGuide} />
        )}

        {pinModal}

        <Suspense fallback={<PageSkeleton label="Loading content..." />}>
          <Routes>
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="/" element={
              !staff && !hasSeenWelcome() && (!location.hash || location.hash === "#intro") ? (
                <Navigate to="/welcome" replace />
              ) : tab === "intro" && (!location.hash || location.hash === "#intro") ? (
                <HomePage onGoTab={requestGoTab} />
              ) : fullBleed ? (
                <HallView
                  staff={staff}
                  delegates={delegates}
                  questions={subs}
                  onEnter={(id) => requestGoTab(id, id === "ask" ? { preset: null } : {})}
                />
              ) : (
                <main className="aym-main" id="main">
                  {tab === "track" && (
                    <div className="aym-page-head">
                      <div className="aym-eyebrow">Guided screens</div>
                      <h1 className="aym-display">Track my answer</h1>
                      <p>Enter your Ask Desk ticket. See whether your question is received, sitting with a mentor, or published on the stage. When a mentor writes, this page shows the Mentor’s answer letter. Unanswered tickets stay Received.</p>
                    </div>
                  )}
                  {tab === "board" && (
                    <div className="aym-page-head">
                      <div className="aym-eyebrow">Open theme stage</div>
                      <h1 className="aym-display">The two-chair conversation</h1>
                      <p>Published mentor answers — the record the Congress leaves for every BAMS mentee, whether or not they reached Bhubaneswar.</p>
                    </div>
                  )}

                  {loading && tab !== "ask" && tab !== "register" && tab !== "pods" && tab !== "mentors" && tab !== "exchange" && tab !== "podcast" && tab !== "hall" && tab !== "staff" ? (
                    <PageSkeleton label="Loading the question bank" />
                  ) : (
                    <>
                      {tab === "register" && (
                        <RegisterView profile={profile} onRegistered={onRegistered} onSignOut={signOutDelegate} onGoAsk={() => goAsk(null)} />
                      )}
                      {tab === "ask" && (
                        <AskView preset={askPreset} profile={profile} onGoRegister={() => goTab("register")}
                          onSaved={onAskSaved} />
                      )}
                      {tab === "pods" && <PodsView onEnterAsk={goAsk} />}
                      {tab === "mentors" && (
                        <Suspense fallback={<PageSkeleton label="Loading mentors" />}>
                          {mentorId
                            ? <MentorProfile mentorId={mentorId} />
                            : <MentorsDirectory />}
                        </Suspense>
                      )}
                      {tab === "exchange" && <ExchangeView onAskPath={p => goAsk({ theme: p.theme, subtheme: p.sub, question: p.prompt })} />}
                      {tab === "podcast" && (
                        <Suspense fallback={<PageSkeleton label="Loading podcast corner" />}>
                          <PodcastView staff={staff} onAsk={goAsk} onBack={() => requestGoTab("hall")} />
                        </Suspense>
                      )}
                      {tab === "track" && <LookupView loading={loading} />}
                      {tab === "board" && (
                        <>
                          {staff && (
                            <div className="aym-staff-subnav" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 18px", background: "var(--white)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)", marginBottom: 24, flexWrap: "wrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" onClick={() => goTab("staff")}>
                                  <ArrowLeft size={14} aria-hidden="true" />
                                  <span>Back to Staff Portal</span>
                                </button>
                                <span style={{ color: "var(--muted)" }}>/</span>
                                <span style={{ fontWeight: 600, color: "var(--forest)", fontSize: 14 }}>Open Theme Stage</span>
                              </div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button type="button" className="aym-btn aym-btn-sm aym-btn-ghost" onClick={() => goTab("curate")}>Curation Desk</button>
                                <button type="button" className="aym-btn aym-btn-sm aym-btn-primary" onClick={() => goTab("board")}>Theme Stage</button>
                                <button type="button" className="aym-btn aym-btn-sm aym-btn-ghost" onClick={() => goTab("insights")}>Insights</button>
                                <button type="button" className="aym-btn aym-btn-sm aym-btn-ghost" onClick={() => goTab("pack")}>Mentor Pack</button>
                              </div>
                            </div>
                          )}
                          <BoardView clusters={clusters} />
                        </>
                      )}

                      {tab === "staff" && (
                        staff ? (
                          <StaffWorkspace
                            onGoTab={goTab}
                            onLogout={lockAndPublic}
                            questionsCount={subs.length}
                            clustersCount={clusters.length}
                          />
                        ) : (
                          <div className="aym-empty-state" style={{ margin: "3rem auto", maxWidth: 540 }}>
                            <div className="aym-empty-icon"><Lock size={32} /></div>
                            <h2 className="aym-empty-title">Staff Authentication Required</h2>
                            <p className="aym-empty-message">Please enter the authority staff code to access the staff portal and curation tools.</p>
                            <button type="button" className="aym-btn aym-btn-primary" onClick={() => setPinPrompt(true)}>
                              Enter Staff Code
                            </button>
                          </div>
                        )
                      )}

                      {(tab === "curate" || tab === "insights" || tab === "pack") && (
                        staff ? (
                          <div className="aym-staff-wrapper">
                            <div className="aym-staff-subnav" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 18px", background: "var(--white)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)", marginBottom: 24, flexWrap: "wrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <button type="button" className="aym-btn aym-btn-ghost aym-btn-sm" onClick={() => goTab("staff")}>
                                  <ArrowLeft size={14} aria-hidden="true" />
                                  <span>Staff Workspace</span>
                                </button>
                                <span style={{ color: "var(--muted)" }}>/</span>
                                <span style={{ fontWeight: 600, color: "var(--forest)", fontSize: 14 }}>
                                  {tab === "curate" ? "Curation Desk" : tab === "insights" ? "Insights" : "Mentor Pack"}
                                </span>
                              </div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button type="button" className={`aym-btn aym-btn-sm ${tab === "curate" ? "aym-btn-primary" : "aym-btn-ghost"}`} onClick={() => goTab("curate")}>Curation Desk</button>
                                <button type="button" className={`aym-btn aym-btn-sm ${tab === "board" ? "aym-btn-primary" : "aym-btn-ghost"}`} onClick={() => goTab("board")}>Theme Stage</button>
                                <button type="button" className={`aym-btn aym-btn-sm ${tab === "insights" ? "aym-btn-primary" : "aym-btn-ghost"}`} onClick={() => goTab("insights")}>Insights</button>
                                <button type="button" className={`aym-btn aym-btn-sm ${tab === "pack" ? "aym-btn-primary" : "aym-btn-ghost"}`} onClick={() => goTab("pack")}>Mentor Pack</button>
                              </div>
                            </div>

                            <div className="aym-staff-grid">
                              <div style={{ minWidth: 0 }}>
                                {tab === "curate" && (
                                  <CurationView subs={subs} clusters={clusters} setClusters={setClusters}
                                    reload={() => reload(true)} loading={loading} saveClusters={saveClusters}
                                    flushClusterSave={flushClusterSave} clustersVersion={clustersVersion}
                                    clusterSaveStatus={clusterSaveStatus}
                                    onClustersVersion={applyClustersVersion} onClusterConflict={reportClusterConflict} />
                                )}
                                {tab === "insights" && (
                                  <InsightsView subs={subs} clusters={clusters}
                                    onSaveQuestion={rec => setSubs(prev => prev.map(s => s.id === rec.id ? rec : s))} />
                                )}
                                {tab === "pack" && (
                                  <MentorPackView subs={subs} clusters={clusters} setClusters={setClusters} saveClusters={saveClusters}
                                    onSaveQuestion={rec => setSubs(prev => prev.map(s => s.id === rec.id ? rec : s))} />
                                )}
                              </div>
                              <DelegatesPanel users={delegates} loading={loading} onRefresh={() => reload(true)} />
                            </div>
                          </div>
                        ) : (
                          <div className="aym-empty-state" style={{ margin: "3rem auto", maxWidth: 540 }}>
                            <div className="aym-empty-icon"><Lock size={32} /></div>
                            <h2 className="aym-empty-title">Staff Authentication Required</h2>
                            <p className="aym-empty-message">Please enter the authority staff code to access this curation view.</p>
                            <button type="button" className="aym-btn aym-btn-primary" onClick={() => setPinPrompt(true)}>
                              Enter Staff Code
                            </button>
                          </div>
                        )
                      )}
                    </>
                  )}

                  {staff && (tab === "curate" || tab === "pack" || tab === "insights") && (
                    <div style={{ marginTop: 40, paddingTop: 18, borderTop: `1px solid ${C.line}`, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <span className="aym-eyebrow">Demo controls</span>
                      <button type="button" className="aym-btn aym-btn-ghost" disabled={seeding} onClick={async () => {
                        setSeeding(true); await seedDemo(); await reload(true); setSeeding(false);
                      }}>
                        {seeding ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}Add 22 sample questions
                      </button>
                      <button type="button" className="aym-btn aym-btn-ghost" style={{ color: "#8B2020" }}
                        onClick={() => { if (window.confirm("Delete every question and every merged group? This cannot be undone.")) wipe(); }}>
                        <Trash2 size={14} />Clear all data
                      </button>
                    </div>
                  )}
                </main>
              )
            } />

            <Route path="/ask" element={<Navigate to="/#ask" replace />} />
            <Route path="/about" element={<AboutPageNew />} />
            <Route path="/mentors" element={<MentorsPage />} />
            <Route path="/mentors/:slug" element={<MentorDetailPage />} />
            <Route path="/programs" element={<ProgramsPage />} />
            <Route path="/programs/:slug" element={<ProgramDetailPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:slug" element={<EventDetailPage />} />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="/resources/:slug" element={<ResourceDetailPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/track-answer" element={<Navigate to="/#track" replace />} />
            <Route path="/careers" element={<Navigate to="/programs" replace />} />
            <Route path="/staff" element={<Navigate to="/#staff" replace />} />
            <Route path="/staff/login" element={<Navigate to="/#staff" replace />} />
            <Route path="/staff/curation" element={<Navigate to="/#curate" replace />} />
            <Route path="/staff/theme-stage" element={<Navigate to="/#board" replace />} />
            <Route path="/staff/insights" element={<Navigate to="/#insights" replace />} />
            <Route path="/staff/mentor-pack" element={<Navigate to="/#pack" replace />} />
            <Route path="/privacy" element={<PrivacyRoute />} />
            <Route path="/terms" element={<TermsRoute />} />
            <Route path="/disclaimer" element={<DisclaimerRoute />} />
            <Route path="*" element={<NotFoundPage />} />

          </Routes>
        </Suspense>

        <ClusterConflictModal
          open={!!clusterConflict}
          message={clusterConflict?.message}
          onReload={async () => { setClusterConflict(null); await reload(true); }}
          onDismiss={() => setClusterConflict(null)}
        />

        {!onWelcomeRoute && (
          <SiteFooter onStaff={() => setPinPrompt(true)} />
        )}
      </div>
    </ErrorBoundary>
  );
}
