/**
 * APL golden-set mining hygiene (Phase-2, backlog APL-2.4) — fixes the eval#4
 * selection-bias + leakage findings:
 *   - the set must not drift failure-heavy (cap the failure fraction; keep
 *     successes/escalations/abstentions), and
 *   - cases consumed by the L2/L3 improver must be held OUT of the gate's scoring
 *     set (a deterministic, disjoint train/gate split).
 * Pure + deterministic (hash-based split, no RNG).
 */

import { createHash } from "node:crypto"

export type Outcome = "success" | "fail" | "escalated" | "unknown"

export interface MinedCase {
  id: string
  outcome: Outcome
  source: "curated" | "mined"
}

export interface Composition {
  total: number
  failureFraction: number
  byOutcome: Record<Outcome, number>
}

export const composition = (cases: readonly MinedCase[]): Composition => {
  const byOutcome: Record<Outcome, number> = { success: 0, fail: 0, escalated: 0, unknown: 0 }
  for (const c of cases) byOutcome[c.outcome] += 1
  const failures = byOutcome.fail + byOutcome.escalated
  return {
    total: cases.length,
    failureFraction: cases.length === 0 ? 0 : failures / cases.length,
    byOutcome,
  }
}

/** True when the failure-derived fraction is within the cap (guards against a failure-heavy set). */
export const withinFailureCap = (
  cases: readonly MinedCase[],
  maxFailureFraction: number,
): boolean => composition(cases).failureFraction <= maxFailureFraction

/** Deterministic [0,1) from an id (sha256 → first 32 bits). Shared by the split helpers. */
export const hashUnit = (id: string): number =>
  createHash("sha256").update(id).digest().readUInt32BE(0) / 0x1_0000_0000

/**
 * Deterministic, disjoint train/gate split. `train` is visible to the improver;
 * `gate` is the held-out scoring set. Stable across runs (same ids → same split).
 */
export const splitTrainGate = (
  caseIds: readonly string[],
  gateFraction: number,
): { train: string[]; gate: string[] } => {
  const train: string[] = []
  const gate: string[] = []
  for (const id of caseIds) {
    if (hashUnit(id) < gateFraction) gate.push(id)
    else train.push(id)
  }
  return { train, gate }
}

/** Removes improver-consumed ids from a scoring set (enforces the no-leakage invariant). */
export const excludeConsumed = (
  scoringIds: readonly string[],
  consumedIds: readonly string[],
): string[] => {
  const consumed = new Set(consumedIds)
  return scoringIds.filter((id) => !consumed.has(id))
}
