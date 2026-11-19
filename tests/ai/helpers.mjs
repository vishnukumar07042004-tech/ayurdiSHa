/**
 * Shared fixtures for the AI pipeline tests: a tiny trusted KB, an allow-list and a mock
 * provider that drafts only from the SOURCES it is given (so the verifier can be exercised
 * deterministically). No network.
 */

export const NOW = Date.parse("2026-10-28T06:00:00Z");

export const ALLOW = [
  { domain: "nta.ac.in", authority: "regulator" },
  { domain: "natboard.edu.in", authority: "regulator" },
  { domain: "ncismindia.org", authority: "regulator" },
  { domain: "upsc.gov.in", authority: "regulator" },
  { domain: "ayush.gov.in", authority: "government" },
  { domain: "ccras.nic.in", authority: "council" },
];

export const CHUNKS = [
  {
    id: "nta-aiapget-2026-1",
    url: "https://exams.nta.ac.in/AIAPGET/notice-2026",
    title: "AIAPGET 2026 information bulletin",
    text: "The All India AYUSH Post Graduate Entrance Test (AIAPGET) 2026 is conducted by the National Testing Agency (NTA) for admission to MD/MS Ayurveda courses. Candidates must hold a BAMS degree recognised by NCISM and must complete the compulsory rotatory internship on or before 30 June 2026. The application fee for General category candidates is Rs 2,700.",
    authority: "regulator",
    publishedAt: "2026-03-10",
    fetchedAt: "2026-10-01",
    streams: ["pg-entrance"],
  },
  {
    id: "nta-aiapget-2023",
    url: "https://exams.nta.ac.in/AIAPGET/notice-2023",
    title: "AIAPGET 2023 information bulletin",
    text: "AIAPGET 2023 application fee for General category candidates was Rs 2,000. The test is a computer based test of 120 questions.",
    authority: "regulator",
    publishedAt: "2023-04-02",
    fetchedAt: "2023-04-02",
    streams: ["pg-entrance"],
  },
  {
    id: "nbems-neetpg-1",
    url: "https://natboard.edu.in/neetpg/eligibility",
    title: "NEET-PG eligibility",
    text: "NEET-PG is the entrance examination for MD/MS/PG Diploma courses for MBBS graduates. Only candidates holding an MBBS degree are eligible to appear for NEET-PG. BAMS graduates take AIAPGET for Ayurveda postgraduate seats.",
    authority: "regulator",
    publishedAt: "2026-01-15",
    streams: ["pg-entrance"],
  },
  {
    id: "upsc-cms-ayush-1",
    url: "https://upsc.gov.in/recruitment/ayush-medical-officer",
    title: "Recruitment of Medical Officer (Ayurveda)",
    text: "The Union Public Service Commission recruits Medical Officers (Ayurveda) for central government services. Applicants need a BAMS degree from a recognised university and registration with a State Board or the Central Register of Indian Medicine. State AYUSH medical officer posts are filled through the respective State Public Service Commission.",
    authority: "regulator",
    publishedAt: "2026-02-20",
    streams: ["govt-jobs"],
  },
  {
    id: "ccras-fellowship-1",
    url: "https://ccras.nic.in/research/fellowships",
    title: "CCRAS research fellowships",
    text: "The Central Council for Research in Ayurvedic Sciences (CCRAS) offers research projects and fellowships across its network of institutes. Young graduates can join CCRAS projects as research associates.",
    authority: "council",
    publishedAt: "2025-12-01",
    streams: ["research"],
  },
  {
    id: "blog-aiapget-tips",
    url: "https://random-coaching-blog.example/aiapget-tips",
    title: "AIAPGET topper tips",
    text: "AIAPGET 2026 fee is Rs 1,500 and cut-off is 50 percentile. Join our coaching for guaranteed seats.",
    authority: "other",
    publishedAt: "2026-05-01",
    streams: ["pg-entrance"],
  },
];

function sentencesOf(text) {
  return String(text).split(/(?<=[.!?])\s+/).filter(Boolean);
}

/**
 * @param {object} opts
 * @param {(payload: object) => object} [opts.draft]  override the draft JSON
 * @param {(payload: object) => object} [opts.verify] override the verify JSON
 * @param {(args: object, n: number) => boolean} [opts.fail] throw on matching calls
 */
export function mockProvider(opts = {}) {
  const calls = [];
  return {
    calls,
    isConfigured: () => opts.configured !== false,
    async chat(args) {
      calls.push(args);
      if (opts.fail && opts.fail(args, calls.length)) throw new Error("mock provider failure");
      const usage = { inputTokens: 1200, outputTokens: 300 };
      if (/Decide whether a student's question asks for MEDICAL/.test(args.system)) {
        const json = opts.medical ? opts.medical(args) : { medical: false, reason: "career" };
        return { text: JSON.stringify(json), json, usage: { inputTokens: 80, outputTokens: 10 }, model: "mock-verify" };
      }
      const payload = JSON.parse(args.messages[0].content);
      if (/strict fact checker/.test(args.system)) {
        const json = opts.verify ? opts.verify(payload) : defaultVerify(payload);
        return { text: JSON.stringify(json), json, usage, model: "mock-verify" };
      }
      if (/MENTOR-ASSIST MODE/.test(args.system)) {
        const json = opts.mentorAssist ? opts.mentorAssist(payload) : defaultMentorAssist(payload);
        return { text: JSON.stringify(json), json, usage, model: "mock-draft" };
      }
      const json = opts.draft ? opts.draft(payload) : defaultDraft(payload);
      return { text: JSON.stringify(json), json, usage, model: "mock-draft" };
    },
    async embed(texts) {
      return texts.map(() => null);
    },
  };
}

function defaultDraft(payload) {
  const srcs = payload.SOURCES || [];
  if (!srcs.length) return { insufficient: true, reason: "no sources" };
  const top = srcs.slice(0, 2);
  const lines = top.map(s => `${sentencesOf(s.text)[0]} [c:${s.id}]`);
  return {
    answer: `Here is how the system works. ${lines.join(" ")} Plan your preparation around these official rules.`,
    actions: ["Read the official bulletin end to end", "Make a 6-month study plan", "Track the official website for notices"],
    mistake: "Relying on coaching blogs instead of the official notice.",
    resources: top.map(s => ({ title: s.title, url: s.url })),
    citations: top.map(s => ({ chunkId: s.id, quote: sentencesOf(s.text)[0] })),
  };
}

/** General guidance plus two unsourced specifics (an amount + seat count, a month) the post-check must strip. */
export function defaultMentorAssist(payload) {
  const home = (payload.OFFICIAL_HOMEPAGES || [])[0];
  return {
    answer: "Choosing between these paths is a big decision, so start from the kind of work you enjoy every day and where you want to be in the long run. Talk to scholars and seniors who chose each path recently and ask what surprised them. The fee at most colleges is Rs 1,20,000 and there are 500 seats. Applications usually open in March. Before you decide, read the latest official notice from the body that runs the exam or recruitment, and check your own eligibility against it line by line.",
    actions: ["List what you want from the next three years", "Read the latest official notice end to end", "Apply before 30 June"],
    mistake: "Deciding on the basis of coaching blogs instead of the official notice.",
    resources: [
      ...(home ? [{ title: "Official site", url: home.url }] : []),
      { title: "Coaching blog", url: "https://random-coaching-blog.example/aiapget-tips" },
    ],
    citations: [],
  };
}

function defaultVerify(payload) {
  const claims = [];
  for (const line of String(payload.draft).split(/(?<=[.!?])\s+|\n/)) {
    const ids = [...line.matchAll(/\[c:([^\]\s]+)\]/g)].map(m => m[1]);
    if (!ids.length) continue;
    claims.push({ claim: line.replace(/\s*\[c:[^\]]+\]/g, ""), status: "supported", chunkIds: ids, note: "stated in source" });
  }
  return { claims };
}

/** Minimal KV + question/cluster store with the surface ops.js / queue.js use. */
export function memoryStore(seed = {}) {
  const db = JSON.parse(JSON.stringify(seed));
  let meta = { version: 1 };
  return {
    name: "memory",
    db,
    async get(k) { return k in db ? JSON.parse(JSON.stringify(db[k])) : null; },
    async set(k, v) { db[k] = JSON.parse(JSON.stringify(v)); },
    async del(k) { delete db[k]; },
    async list(prefix = "") { return Object.keys(db).filter(k => k.startsWith(prefix)); },
    async listQuestions() { return Object.keys(db).filter(k => k.startsWith("aym:q:")).map(k => db[k]); },
    async getClustersMeta() { return { value: db["aym:clusters"] || [], version: meta.version, updatedAt: 0 }; },
    async saveClusters(clusters, expectedVersion) {
      if (expectedVersion != null && expectedVersion !== meta.version) {
        const { ClustersVersionConflictError } = await import("../../server/store.js");
        throw new ClustersVersionConflictError(meta.version);
      }
      meta = { version: meta.version + 1 };
      db["aym:clusters"] = JSON.parse(JSON.stringify(clusters));
      return { clusters: db["aym:clusters"], version: meta.version, updatedAt: Date.now() };
    },
    bumpVersion() { meta = { version: meta.version + 1 }; },
  };
}
