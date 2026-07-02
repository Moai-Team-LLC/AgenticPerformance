/**
 * APL judge calibration (Phase-3, backlog APL-3.2) — fixes the judge#1 finding.
 *
 * The engine's computeCalibration reports point-estimate TPR/TNR and returns 1 on
 * an empty class (judge-calibration.ts:60-61), so a judge "passes" on ~5 lucky
 * positives at a 5% base rate. This layer adds what the PRD v0.2 requires:
 *   - class stratification: >= minPerClass positives AND negatives, and
 *   - a Wilson 95% LOWER bound on both TPR and TNR that must clear the threshold
 *     (a point estimate is not enough; an empty class yields a lower bound of 0).
 * Reuses computeCalibration for the confusion matrix. Pure.
 */

import type { CalibrationReport } from "../vendor/calibration-math"

import { computeCalibration } from "../vendor/calibration-math"

export const DEFAULT_MIN_PER_CLASS = 50

/** Wilson score interval lower bound for `successes`/`n` at z (1.96 = 95%). n=0 → 0. */
export const wilsonLowerBound = (successes: number, n: number, z = 1.96): number => {
  if (n === 0) return 0
  const p = successes / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = p + z2 / (2 * n)
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))
  return Math.max(0, (center - margin) / denom)
}

export interface StratifiedCalibration extends CalibrationReport {
  positives: number
  negatives: number
  minPerClass: number
  tprLower: number
  tnrLower: number
  /** Stratified AND both Wilson lower bounds clear the threshold. */
  stratifiedCalibrated: boolean
  /** Why it is not calibrated (empty when it is). */
  reasons: string[]
}

export const stratifiedCalibration = (
  results: readonly { id: string; expected: boolean; got: boolean }[],
  opts: { threshold?: number; minPerClass?: number; z?: number } = {},
): StratifiedCalibration => {
  const threshold = opts.threshold ?? 0.8
  const minPerClass = opts.minPerClass ?? DEFAULT_MIN_PER_CLASS
  const base = computeCalibration(results, threshold)
  const positives = base.tp + base.fn
  const negatives = base.tn + base.fp
  const tprLower = wilsonLowerBound(base.tp, positives, opts.z)
  const tnrLower = wilsonLowerBound(base.tn, negatives, opts.z)

  const reasons: string[] = []
  if (positives < minPerClass)
    reasons.push(`only ${positives} positive labels (need >= ${minPerClass})`)
  if (negatives < minPerClass)
    reasons.push(`only ${negatives} negative labels (need >= ${minPerClass})`)
  if (tprLower <= threshold) reasons.push(`TPR lower bound ${tprLower.toFixed(3)} <= ${threshold}`)
  if (tnrLower <= threshold) reasons.push(`TNR lower bound ${tnrLower.toFixed(3)} <= ${threshold}`)

  return {
    ...base,
    positives,
    negatives,
    minPerClass,
    tprLower,
    tnrLower,
    stratifiedCalibrated: reasons.length === 0,
    reasons,
  }
}
