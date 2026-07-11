/**
 * APL version gate (Phase-2, backlog APL-2.3/2.4) — fixes the two eval bugs the
 * PRD review confirmed in lib/eval/harness.ts:
 *   - empty/absent golden set returns passRate=1 (a green pass) → here a HARD FAIL;
 *   - regression is measured vs a flat baseline constant → here vs the PRIOR
 *     agent_version's stored score ON THE SAME frozen case_set_hash.
 *
 * Cold-start: v1 of a new agent has no prior run, so it is gated on the mandatory
 * baseline suite only (FR-EVAL-4); the version-diff gate activates once the set has
 * >= MIN_SEED_CASES and a prior score exists. Pure + deterministic.
 */

import { createHash } from "node:crypto"

export const MIN_SEED_CASES = 20
export const DEFAULT_TOLERANCE = 0.02

/** Deterministic id for a frozen generation of a case set (order-independent). */
export const caseSetHash = (caseIds: readonly string[]): string =>
  createHash("sha256")
    .update([...caseIds].sort().join("\n"))
    .digest("hex")
    .slice(0, 16)

export interface SuiteScore {
  caseSetHash: string
  passRate: number
  total: number
}

export interface GateInput {
  /** Score of the NEW agent_version on its frozen golden set. */
  current: SuiteScore
  /** Stored score of the current prod version on the SAME case set (null at cold start). */
  prior?: SuiteScore | null
  /** Whether the mandatory deterministic baseline suite passed. */
  baselinePassed: boolean
  /**
   * When this suite's pass decision used an LLM judge, its calibration state. An
   * uncalibrated or stale judge cannot gate — its verdicts are not trustworthy, so the
   * gate HARD-FAILS rather than shipping on an unverified judge (doctrine §1). Omit for
   * deterministic-only suites.
   */
  judge?: { calibrated: boolean; stale: boolean }
  tolerance?: number
  minSeedCases?: number
}

export type GateKind =
  | "baseline-fail"
  | "judge-uncalibrated"
  | "empty-suite"
  | "cold-start"
  | "case-set-mismatch"
  | "regression"
  | "ok"

export interface GateDecision {
  pass: boolean
  kind: GateKind
  reason: string
}

export const gate = (input: GateInput): GateDecision => {
  const tolerance = input.tolerance ?? DEFAULT_TOLERANCE
  const minSeed = input.minSeedCases ?? MIN_SEED_CASES

  if (!input.baselinePassed) {
    return { pass: false, kind: "baseline-fail", reason: "mandatory baseline suite failed" }
  }
  if (input.judge !== undefined && (!input.judge.calibrated || input.judge.stale)) {
    return {
      pass: false,
      kind: "judge-uncalibrated",
      reason: input.judge.stale
        ? "judge calibration is stale — recalibrate before gating on its verdicts"
        : "judge is not calibrated — its verdicts cannot gate",
    }
  }
  if (input.current.total === 0) {
    return {
      pass: false,
      kind: "empty-suite",
      reason: "empty/absent golden set is a HARD FAIL (never a green gate)",
    }
  }
  if (input.prior == null || input.current.total < minSeed) {
    return {
      pass: true,
      kind: "cold-start",
      reason: `cold-start: gated on baseline only (version-diff activates at >= ${minSeed} seed cases with a prior run)`,
    }
  }
  if (input.prior.caseSetHash !== input.current.caseSetHash) {
    return {
      pass: false,
      kind: "case-set-mismatch",
      reason:
        "prior scored on a different case set; re-run the prior version on the current frozen set before gating",
    }
  }
  if (input.current.passRate < input.prior.passRate - tolerance) {
    return {
      pass: false,
      kind: "regression",
      reason: `regression: ${input.current.passRate.toFixed(3)} < prior ${input.prior.passRate.toFixed(3)} - ${tolerance}`,
    }
  }
  return { pass: true, kind: "ok", reason: "no regression vs prior version on the frozen set" }
}
