/**
 * Stores for burst tests.
 *
 * createSimFirestore() models what matters about Firestore under a registration burst:
 *   - every op has random latency, so requests interleave;
 *   - `update` / `reserveBlock` are optimistic transactions: read a document version, wait, then
 *     commit only if nobody wrote it meanwhile — otherwise throw ABORTED (code 10), exactly the
 *     contention error a hot document produces — plus a configurable rate of random ABORTED;
 *   - `create` is atomic create-if-absent.
 * `instance(i)` returns a separate store object per simulated serverless instance (each gets its
 * own pass-number pool) over the same shared documents.
 */
import { planShardReservation, withContentionRetry, shardOrder } from "../../server/passIssuer.js";

const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

function aborted(msg = "10 ABORTED: Too much contention on these documents. Please try again.") {
  const e = new Error(msg);
  e.code = 10;
  return e;
}

export function createSimFirestore({ latencyMs = [0, 4], abortRate = 0.05, seed = {}, fastRetry = true } = {}) {
  const docs = new Map(Object.entries(seed).map(([k, v]) => [k, { v: 1, value: clone(v) }]));
  const counters = { ops: 0, aborts: 0, contention: 0, transactions: 0, reservations: 0, writesByDoc: new Map() };
  const [lo, hi] = latencyMs;
  const delay = () => new Promise(r => setTimeout(r, lo + Math.random() * (hi - lo)));
  const retryOpts = fastRetry ? { attempts: 8, baseMs: 2, capMs: 40 } : { attempts: 8 };
  const bump = key => counters.writesByDoc.set(key, (counters.writesByDoc.get(key) || 0) + 1);

  function write(key, value) {
    const cur = docs.get(key);
    docs.set(key, { v: (cur ? cur.v : 0) + 1, value: clone(value) });
    bump(key);
  }

  /** One optimistic transaction over `keys`: fn(values) → { writes: {key: value|undefined}, result }. */
  async function transaction(keys, fn) {
    return withContentionRetry(async () => {
      counters.transactions++;
      const seen = keys.map(k => (docs.get(k) ? docs.get(k).v : 0));
      const values = Object.fromEntries(keys.map(k => [k, docs.has(k) ? clone(docs.get(k).value) : null]));
      await delay();
      if (Math.random() < abortRate) { counters.aborts++; throw aborted(); }
      if (keys.some((k, i) => (docs.get(k) ? docs.get(k).v : 0) !== seen[i])) { counters.contention++; throw aborted(); }
      const { writes, result } = fn(values);
      for (const [k, v] of Object.entries(writes || {})) if (v !== undefined) write(k, v);
      return result;
    }, retryOpts);
  }

  function instance(i = 0) {
    return {
      name: "firestore-sim",
      instanceId: i,
      async get(key) { counters.ops++; await delay(); const d = docs.get(key); return d ? clone(d.value) : null; },
      async set(key, val) { counters.ops++; await delay(); write(key, val); },
      async del(key) { counters.ops++; await delay(); docs.delete(key); },
      async list(prefix = "") { await delay(); return [...docs.keys()].filter(k => k.startsWith(prefix)); },
      async snapshot() { await delay(); return Object.fromEntries([...docs].map(([k, d]) => [k, clone(d.value)])); },
      async merge(entries) { for (const [k, v] of Object.entries(entries || {})) await this.set(k, v); },
      async update(key, fn) {
        return transaction([key], vals => {
          const next = fn(vals[key]);
          return next === undefined ? { writes: {}, result: vals[key] } : { writes: { [key]: next }, result: clone(next) };
        });
      },
      async create(key, val) {
        counters.ops++;
        await delay();
        if (docs.has(key)) return false;
        write(key, val);
        return true;
      },
      async reserveBlock(name, size, { shards, initialBase } = {}) {
        counters.reservations++;
        const key = k => `meta/${name}~s${k}`;
        await delay();
        const order = shardOrder(shards, k => (docs.has(key(k)) ? Number(docs.get(key(k)).value.blocks) || 0 : 0));
        const legacyKey = `meta/${name}`;
        let lastErr;
        for (const shard of order) {
          const shardKey = key(shard);
          try {
            return await transaction([shardKey, legacyKey], vals => {
              let plan = planShardReservation({ name, shard, shards, size, shardDoc: vals[shardKey], initialBase });
              if (plan.needsLegacy) plan = planShardReservation({ name, shard, shards, size, shardDoc: vals[shardKey], legacyDoc: vals[legacyKey], initialBase });
              const writes = { [shardKey]: { ...(vals[shardKey] || {}), ...plan.shardWrite } };
              if (plan.legacyWrite) writes[legacyKey] = { ...(vals[legacyKey] || {}), ...plan.legacyWrite };
              return { writes, result: plan.range };
            });
          } catch (err) { lastErr = err; }
        }
        throw lastErr;
      },
    };
  }

  return { docs, counters, instance, values: () => new Map([...docs].map(([k, d]) => [k, d.value])) };
}

/** Plain in-memory KV with atomic update/create (single process) and a little latency. */
export function createMemoryStore({ latencyMs = [0, 2] } = {}) {
  const sim = createSimFirestore({ latencyMs, abortRate: 0 });
  const s = sim.instance(0);
  delete s.reserveBlock;
  s.name = "memory";
  return { store: s, sim };
}
