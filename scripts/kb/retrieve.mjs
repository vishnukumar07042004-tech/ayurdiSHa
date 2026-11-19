/**
 * Local hybrid retrieval over data/kb/chunks.jsonl for scripts (golden drafts, evaluation).
 * BM25 always; cosine similarity is blended in when chunks and the query have embeddings.
 * Chunks tagged with the question's stream (or "*") get a boost; authority breaks ties.
 */
import { Bm25Index, cosine, readJsonl, tokenizeForSearch, CHUNKS_FILE } from "./lib.mjs";

const AUTHORITY_BOOST = { regulator: 1.15, research: 1.05, congress: 1.0, other: 0.9 };

// Words nearly every question and chunk share; they say nothing about whether a chunk answers it.
const GENERIC = new Set(tokenizeForSearch("ayurveda ayurvedic ayurved bams ayush india indian graduate graduates student students doctor doctors practise practising practice practicing practitioner career careers option options become good best which want need get know"));

export function loadChunks(file = CHUNKS_FILE) {
  return readJsonl(file);
}

export function createRetriever(chunks) {
  const index = new Bm25Index(chunks);
  const N = chunks.length || 1;
  const idf = t => Math.log(1 + (N - (index.df.get(t) || 0) + 0.5) / ((index.df.get(t) || 0) + 0.5));
  return {
    size: chunks.length,
    /**
     * IDF-weighted share of the question's distinctive terms that appear in the chunk (0..1).
     * A length-independent "does this chunk talk about what was asked" signal, unlike raw BM25.
     */
    coverage(question, chunk) {
      const terms = [...new Set(tokenizeForSearch(question))].filter(t => !GENERIC.has(t));
      if (!terms.length) return 0;
      const have = new Set(tokenizeForSearch(`${chunk.title}\n${chunk.text}`));
      let num = 0, den = 0;
      for (const t of terms) { const w = idf(t); den += w; if (have.has(t)) num += w; }
      return den ? num / den : 0;
    },
    /**
     * @param {string} query
     * @param {{k?:number, stream?:string, queryEmbedding?:number[], perUrl?:number}} [o]
     * @returns {{chunk:object, score:number, bm25:number, cos:number|null}[]}
     */
    search(query, { k = 8, stream, queryEmbedding, perUrl = 2 } = {}) {
      const hits = index.search(query, { k: 80 });
      const max = hits[0]?.score || 1;
      const scored = hits.map(({ doc, score }) => {
        const bm = score / max;
        const cos = queryEmbedding && doc.embedding ? cosine(queryEmbedding, doc.embedding) : null;
        let s = cos == null ? bm : 0.5 * bm + 0.5 * Math.max(0, cos);
        if (stream && Array.isArray(doc.streams) && (doc.streams.includes(stream) || doc.streams.includes("*"))) s *= 1.25;
        s *= AUTHORITY_BOOST[doc.authority] || 1;
        return { chunk: doc, score: s, bm25: score, cos };
      }).sort((a, b) => b.score - a.score);
      const out = [];
      const perUrlCount = new Map();
      for (const h of scored) {
        const n = perUrlCount.get(h.chunk.url) || 0;
        if (n >= perUrl) continue;
        perUrlCount.set(h.chunk.url, n + 1);
        out.push(h);
        if (out.length >= k) break;
      }
      return out;
    },
  };
}
