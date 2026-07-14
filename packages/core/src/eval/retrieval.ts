/**
 * APL retrieval evaluation (eval-science delta §3, FR-EVAL-6).
 *
 * Agents with memory/retrieval carry a SEPARATE retrieval case set
 * `{query, relevant_memory_ids[], relevance_grade?, provenance}` — retrieval is a
 * first-class eval category, never blended into end-to-end task metrics
 * (FR-FAIL-7). Metrics: Recall@k (k=1,3,5,10) and MRR; NDCG only with graded
 * relevance. The retrieval regression gate blocks embedding-model / chunking /
 * index-parameter changes that regress Recall@5 beyond tolerance — SEPARATE from
 * the general version gate (FR-EVAL-4, eval/gate.ts). Release-critical changes
 * require pass^3 — three consecutive gate passes — see `passCubed`.
 *
 * Positioning: citations prove the answer is grounded in what was retrieved;
 * Recall@k proves the needed memory was retrievABLE — an audit requires both.
 * Pure + deterministic; the harness lives on the AgenticMind side, APL holds the
 * contract, ingestion, and the per-stage dashboard.
 */

export const DEFAULT_RETRIEVAL_TOLERANCE = 0.02
/** pass^3 — release-critical retrieval changes need this many consecutive gate passes. */
export const RELEASE_CRITICAL_CONSECUTIVE_PASSES = 3

/** One retrieval golden case (FR-EVAL-6); `provenance` per FR-EVAL-7. */
export interface RetrievalCase {
  id: string
  query: string
  relevantMemoryIds: readonly string[]
  /** memoryId → graded relevance (only needed for NDCG). */
  relevanceGrade?: Readonly<Record<string, number>>
  provenance?: unknown
}

/**
 * Recall@k = |top-k ∩ relevant| / |relevant| (both sides deduplicated).
 *
 * Empty `relevant` returns 0, NEVER a green 1 — mirrors the empty-suite hard-fail
 * philosophy of eval/gate.ts: a case with nothing to retrieve cannot certify that
 * retrieval works, so it must not count as a pass.
 */
export const recallAtK = (
  retrieved: readonly string[],
  relevant: readonly string[],
  k: number,
): number => {
  const relevantSet = new Set(relevant)
  if (relevantSet.size === 0) return 0
  const hits = new Set(retrieved.slice(0, k).filter((id) => relevantSet.has(id)))
  return hits.size / relevantSet.size
}

/**
 * Mean reciprocal rank of the FIRST relevant hit per query (rank is 1-based).
 * A query with no relevant hit contributes 0; empty input returns 0.
 */
export const mrr = (
  results: readonly { retrieved: readonly string[]; relevant: readonly string[] }[],
): number => {
  if (results.length === 0) return 0
  let sum = 0
  for (const { retrieved, relevant } of results) {
    const relevantSet = new Set(relevant)
    const rank = retrieved.findIndex((id) => relevantSet.has(id))
    if (rank >= 0) sum += 1 / (rank + 1)
  }
  return sum / results.length
}

/**
 * NDCG@k = DCG@k / IDCG@k with linear graded gain `grade / log2(position + 2)`
 * (Järvelin & Kekäläinen). Only meaningful with graded relevance — with binary
 * labels use Recall@k / MRR instead (FR-EVAL-6). Returns 0 when no graded docs
 * exist (empty `grades` or all grades <= 0). Assumes `retrieved` ids are unique
 * within the ranking, as in any standard ranking metric.
 */
export const ndcg = (
  retrieved: readonly string[],
  grades: Readonly<Record<string, number>>,
  k: number,
): number => {
  let dcg = 0
  for (const [i, id] of retrieved.slice(0, k).entries()) {
    const grade = grades[id]
    if (grade !== undefined && grade > 0) dcg += grade / Math.log2(i + 2)
  }
  const ideal = Object.values(grades)
    .filter((grade) => grade > 0)
    .sort((a, b) => b - a)
    .slice(0, k)
  let idcg = 0
  for (const [i, grade] of ideal.entries()) idcg += grade / Math.log2(i + 2)
  return idcg === 0 ? 0 : dcg / idcg
}

export interface RetrievalGateInput {
  /** Recall@5 of the candidate configuration on the frozen retrieval case set. */
  current: { recallAt5: number; n: number }
  /** Stored Recall@5 of the current prod configuration on the SAME set (null at cold start). */
  prior: { recallAt5: number; n: number } | null
  tolerance?: number
}

/**
 * Retrieval regression gate (FR-EVAL-6) — SEPARATE from the general eval gate
 * (FR-EVAL-4): blocks embedding / chunking / index changes that regress Recall@5
 * beyond `tolerance` (default 0.02). The gate evaluates ONE run:
 *   - n === 0 → HARD FAIL (empty case set is never a green gate);
 *   - prior null → cold-start pass, the current score is recorded as the baseline;
 *   - otherwise pass iff no regression beyond tolerance.
 * Release-critical changes must NOT ship on a single pass: apply `passCubed` over
 * the history of gate decisions (pass^3).
 */
export const retrievalGate = (input: RetrievalGateInput): { pass: boolean; reason: string } => {
  const tolerance = input.tolerance ?? DEFAULT_RETRIEVAL_TOLERANCE
  if (input.current.n === 0) {
    return {
      pass: false,
      reason: "empty retrieval case set is a HARD FAIL (never a green gate)",
    }
  }
  if (input.prior === null) {
    return {
      pass: true,
      reason: "cold start: no prior run — Recall@5 baseline recorded, regression gate activates on the next run",
    }
  }
  if (input.current.recallAt5 < input.prior.recallAt5 - tolerance) {
    return {
      pass: false,
      reason: `retrieval regression: Recall@5 ${input.current.recallAt5.toFixed(3)} < prior ${input.prior.recallAt5.toFixed(3)} - ${tolerance}`,
    }
  }
  return { pass: true, reason: "no Recall@5 regression vs prior on the frozen retrieval case set" }
}

/**
 * pass^3 for release-critical retrieval changes: true only when the last
 * RELEASE_CRITICAL_CONSECUTIVE_PASSES (3) entries of the gate-decision history are
 * all passes. Fewer than 3 recorded runs → false (insufficient evidence is never
 * a pass).
 */
export const passCubed = (history: readonly boolean[]): boolean =>
  history.length >= RELEASE_CRITICAL_CONSECUTIVE_PASSES &&
  history.slice(-RELEASE_CRITICAL_CONSECUTIVE_PASSES).every((pass) => pass)
