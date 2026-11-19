/**
 * Storage for the AI answer pipeline. On Firestore it uses its own collections
 * (`ai_config`, `ai_jobs`, `ai_drafts`, `ai_answer_bank`, `ai_usage`, `kb_chunks`) through the
 * Admin app that `server/store.js` already initialised; on the file / Blob / in-memory stores it
 * falls back to `aym:ai:*` KV keys so tests and local QA never touch production.
 *
 * Drafts live in `ai_drafts/<q:id | c:clusterId>` instead of on the question / cluster record:
 * the worker never rewrites a student's question (no race with `answerIndividual`) and never
 * bumps the clusters version (no spurious 409s on the Curation desk).
 */

import { normalizeConfig } from "./config.js";
import { sumByProvider } from "./usage.js";

export const K_AI_CONFIG = "aym:ai:config";
export const K_AI_DRAFT = "aym:ai:draft:";
export const K_AI_JOB = "aym:ai:job:";
export const K_AI_BANK = "aym:ai:bank:";
export const K_AI_USAGE = "aym:ai:usage:";
export const K_AI_STATE = "aym:ai:state";

const COL = {
  config: "ai_config",
  jobs: "ai_jobs",
  drafts: "ai_drafts",
  bank: "ai_answer_bank",
  usage: "ai_usage",
  kb: "kb_chunks",
};
const CONFIG_DOC = "settings";
const STATE_DOC = "worker";
const FIREBASE_APP = "aym-preview";

function clean(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function docId(id) {
  return encodeURIComponent(String(id || "")).slice(0, 700);
}

async function firestoreFor(store) {
  if (!store || store.name !== "firestore") return null;
  if (store.__aiDb !== undefined) return store.__aiDb;
  try {
    const { getApps } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    const app = getApps().find(a => a.name === FIREBASE_APP);
    store.__aiDb = app ? getFirestore(app) : null;
  } catch {
    store.__aiDb = null;
  }
  return store.__aiDb;
}

function kvAdapter(store) {
  async function listPrefix(prefix) {
    const keys = await store.list(prefix);
    const out = [];
    for (let i = 0; i < keys.length; i += 16) {
      const slice = keys.slice(i, i + 16);
      const vals = await Promise.all(slice.map(k => store.get(k)));
      vals.forEach(v => { if (v && typeof v === "object") out.push(v); });
    }
    return out;
  }
  return {
    backend: "kv",
    async getConfig() { return normalizeConfig(await store.get(K_AI_CONFIG)); },
    async setConfig(cfg) { const c = normalizeConfig(cfg); await store.set(K_AI_CONFIG, c); return c; },
    async getDraft(id) { return (await store.get(K_AI_DRAFT + id)) || null; },
    async putDraft(rec) { await store.set(K_AI_DRAFT + rec.id, clean(rec)); return rec; },
    async delDraft(id) { await store.del(K_AI_DRAFT + id); },
    async listDrafts() { return listPrefix(K_AI_DRAFT); },
    async getJob(id) { return (await store.get(K_AI_JOB + id)) || null; },
    async putJob(job) { await store.set(K_AI_JOB + job.id, clean(job)); return job; },
    async delJob(id) { await store.del(K_AI_JOB + id); },
    async listJobs(filter = {}) {
      const all = await listPrefix(K_AI_JOB);
      return filter.status ? all.filter(j => j.status === filter.status) : all;
    },
    async claimJob(id, now, lockMs) {
      const job = await store.get(K_AI_JOB + id);
      if (!job || job.status !== "queued" || (job.lockedUntil || 0) > now) return null;
      const next = { ...job, status: "running", lockedUntil: now + lockMs, attempts: (job.attempts || 0) + 1, updatedAt: now };
      await store.set(K_AI_JOB + id, next);
      return next;
    },
    async addBank(entry) { await store.set(K_AI_BANK + entry.id, clean(entry)); return entry; },
    async listBank() { return listPrefix(K_AI_BANK); },
    async getUsage(day) { return (await store.get(K_AI_USAGE + day)) || { day, costUSD: 0, calls: 0, inputTokens: 0, outputTokens: 0 }; },
    async addUsage(day, delta) {
      const prev = await this.getUsage(day);
      const next = sumUsage(prev, delta, day);
      await store.set(K_AI_USAGE + day, next);
      return next;
    },
    async listUsage() { return listPrefix(K_AI_USAGE); },
    async listKbChunks() { return null; },
    async nearestKb() { return null; },
    async getState() { return (await store.get(K_AI_STATE)) || {}; },
    async setState(patch) {
      const next = { ...((await store.get(K_AI_STATE)) || {}), ...patch };
      await store.set(K_AI_STATE, next);
      return next;
    },
    async listRecentQuestions(since) {
      if (typeof store.listQuestions === "function") {
        return (await store.listQuestions()).filter(q => q && (q.createdAt || 0) >= since);
      }
      const keys = await store.list("aym:q:");
      const out = [];
      for (const k of keys) {
        const q = await store.get(k);
        if (q && (q.createdAt || 0) >= since) out.push(q);
      }
      return out;
    },
  };
}

function sumUsage(prev, delta, day) {
  const d = delta || {};
  const out = {
    day,
    costUSD: Math.round(((prev.costUSD || 0) + (Number(d.costUSD) || 0)) * 1e6) / 1e6,
    calls: (prev.calls || 0) + (Number(d.calls) || 0),
    inputTokens: (prev.inputTokens || 0) + (Number(d.inputTokens) || 0),
    outputTokens: (prev.outputTokens || 0) + (Number(d.outputTokens) || 0),
    updatedAt: Date.now(),
  };
  if (prev.byProvider || d.byProvider) out.byProvider = sumByProvider(prev.byProvider, d.byProvider);
  return out;
}

function firestoreAdapter(db) {
  const col = name => db.collection(COL[name]);
  const all = async name => (await col(name).get()).docs.map(d => d.data()).filter(Boolean);
  return {
    backend: "firestore",
    async getConfig() {
      const snap = await col("config").doc(CONFIG_DOC).get();
      return normalizeConfig(snap.exists ? snap.data() : null);
    },
    async setConfig(cfg) {
      const c = normalizeConfig(cfg);
      await col("config").doc(CONFIG_DOC).set(clean(c));
      return c;
    },
    async getDraft(id) {
      const snap = await col("drafts").doc(docId(id)).get();
      return snap.exists ? snap.data() : null;
    },
    async putDraft(rec) { await col("drafts").doc(docId(rec.id)).set(clean(rec)); return rec; },
    async delDraft(id) { await col("drafts").doc(docId(id)).delete(); },
    async listDrafts() { return all("drafts"); },
    async getJob(id) {
      const snap = await col("jobs").doc(docId(id)).get();
      return snap.exists ? snap.data() : null;
    },
    async putJob(job) { await col("jobs").doc(docId(job.id)).set(clean(job)); return job; },
    async delJob(id) { await col("jobs").doc(docId(id)).delete(); },
    async listJobs(filter = {}) {
      const q = filter.status ? col("jobs").where("status", "==", filter.status) : col("jobs");
      return (await q.get()).docs.map(d => d.data());
    },
    async claimJob(id, now, lockMs) {
      const ref = col("jobs").doc(docId(id));
      return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const job = snap.exists ? snap.data() : null;
        if (!job || job.status !== "queued" || (job.lockedUntil || 0) > now) return null;
        const next = { ...job, status: "running", lockedUntil: now + lockMs, attempts: (job.attempts || 0) + 1, updatedAt: now };
        tx.set(ref, clean(next));
        return next;
      });
    },
    async addBank(entry) { await col("bank").doc(docId(entry.id)).set(clean(entry)); return entry; },
    async listBank() { return all("bank"); },
    async getUsage(day) {
      const snap = await col("usage").doc(day).get();
      return snap.exists ? snap.data() : { day, costUSD: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
    },
    async addUsage(day, delta) {
      const ref = col("usage").doc(day);
      return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const prev = snap.exists ? snap.data() : {};
        const next = sumUsage(prev, delta, day);
        tx.set(ref, next);
        return next;
      });
    },
    async listUsage() { return all("usage"); },
    async getState() {
      const snap = await col("config").doc(STATE_DOC).get();
      return snap.exists ? snap.data() : {};
    },
    async setState(patch) {
      await col("config").doc(STATE_DOC).set(clean(patch), { merge: true });
      return patch;
    },
    async listRecentQuestions(since) {
      const snap = await db.collection("questions").where("createdAt", ">=", since).get();
      return snap.docs.map(d => {
        const { emailLower, ticketLower, ...rest } = d.data() || {};
        return rest;
      }).filter(q => q && q.id);
    },
    async countKb() {
      const snap = await col("kb").count().get();
      return snap.data().count || 0;
    },
    async listKbChunks() {
      const snap = await col("kb").get();
      return snap.docs.map(d => {
        const data = d.data() || {};
        const emb = data.embedding;
        const embedding = Array.isArray(emb) ? emb : (emb && typeof emb.toArray === "function" ? emb.toArray() : undefined);
        return { ...data, id: data.id || d.id, embedding };
      });
    },
    /** Firestore vector search; returns null when there is no vector index (caller falls back). */
    async nearestKb(vector, k = 8) {
      try {
        const { FieldValue } = await import("firebase-admin/firestore");
        const q = col("kb").findNearest({
          vectorField: "embedding",
          queryVector: FieldValue.vector(vector),
          limit: k,
          distanceMeasure: "COSINE",
          distanceResultField: "_distance",
        });
        const snap = await q.get();
        return snap.docs.map(d => {
          const data = d.data() || {};
          return { ...data, id: data.id || d.id, embedding: undefined, _score: 1 - (Number(data._distance) || 0) };
        });
      } catch {
        return null;
      }
    },
  };
}

/** One adapter per store instance (cached on the store object). */
export async function aiStoreFor(store) {
  if (store.__aiStore) return store.__aiStore;
  const db = await firestoreFor(store);
  store.__aiStore = db ? firestoreAdapter(db) : kvAdapter(store);
  return store.__aiStore;
}

/** A plain in-memory KV store with the same surface the app's stores expose (tests, eval). */
export function createMemoryKv(seed = {}) {
  const db = { ...seed };
  return {
    name: "memory",
    db,
    async get(k) { return k in db ? JSON.parse(JSON.stringify(db[k])) : null; },
    async set(k, v) { db[k] = JSON.parse(JSON.stringify(v)); },
    async del(k) { delete db[k]; },
    async list(prefix = "") { return Object.keys(db).filter(k => k.startsWith(prefix)); },
  };
}
