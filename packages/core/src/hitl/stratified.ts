/**
 * APL stratified review sampling (v0.3 eval-science delta, FR-HITL-2).
 *
 * WHY: if only escalations / hard cases reach a human, review-derived golden data
 * (FR-HITL-1) skews hard — the resulting set loses representativeness of routine
 * production traffic and the judge is calibrated against a distribution nobody
 * ships. The fix is a declared escalation:random ratio: take ALL escalations PLUS
 * a random slice of routine traffic; the random arm de-biases the label supply.
 * Selection is hash-based (hashUnit, no RNG), so the sample is deterministic and
 * reproducible for a given traffic window. Pure.
 */

import { hashUnit } from "../eval/mining"

export interface ReviewSamplingInput {
  /** Item refs escalated to human review — reviewed in full, never sampled away. */
  escalations: readonly string[]
  /** Item refs of routine (non-escalated) production traffic. */
  routineTraffic: readonly string[]
  /** Declared escalation:random ratio, e.g. {escalation: 2, random: 1} = 1 routine per 2 escalations. */
  ratio: { escalation: number; random: number }
}

/**
 * All escalations plus a deterministic random slice of routine traffic sized
 * `ceil(escalations.length * random/escalation)` (an escalation part <= 0 is
 * treated as 1). Routine ids are ranked by hashUnit and the lowest-hash ids win —
 * stable across runs, no duplicates, escalated ids never double-drawn.
 */
export const stratifiedReviewSample = (
  input: ReviewSamplingInput,
): { escalated: string[]; random: string[] } => {
  const escalated = [...input.escalations]
  const escalationPart = input.ratio.escalation <= 0 ? 1 : input.ratio.escalation
  const target = Math.max(0, Math.ceil(escalated.length * (input.ratio.random / escalationPart)))

  const escalatedSet = new Set(escalated)
  const pool = [...new Set(input.routineTraffic)].filter((id) => !escalatedSet.has(id))
  const random = pool
    .map((id) => ({ id, unit: hashUnit(id) }))
    .sort((a, b) => a.unit - b.unit)
    .slice(0, Math.min(target, pool.length))
    .map((entry) => entry.id)

  return { escalated, random }
}
