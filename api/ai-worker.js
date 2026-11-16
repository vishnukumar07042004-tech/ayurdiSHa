/**
 * Vercel serverless entry for `/api/ai-worker` (see vercel.json).
 * Drains the DISHA draft queue via `runWorker` in `server/ai/queue.js` — drafts only, never
 * auto-publishes. After each run, `repairHybridDraftSlots` normalizes compare records so the
 * Hybrid card shows the GPT letter or a visible error (not a blank shell).
 */
import { aiWorkerHandler } from "../server/storePlugin.js";

export default aiWorkerHandler;
