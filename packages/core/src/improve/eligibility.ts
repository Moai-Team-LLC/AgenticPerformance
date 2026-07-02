/**
 * APL L3 eligibility (Phase-5, backlog APL-5.1) — fixes improve-trust#6 by
 * reframing PRD assumption A2 into a CODE-ENFORCED gate. An agent is only eligible
 * for judge-gated auto-improvement (L3) once it has actually earned it: a per-agent
 * golden set of real size, a fresh stratified judge calibration, and an available
 * independent gating judge. So L3 lights up gradually per agent, never fleet-wide at
 * GA. Pure.
 */

export const DEFAULT_MIN_GOLDEN_SET = 30

export interface L3EligibilityInput {
  goldenSetSize: number
  /** stratifiedCalibration(...).stratifiedCalibrated */
  calibrationStratified: boolean
  /** isCalibrationStale(...).stale */
  calibrationStale: boolean
  /** checkJudgeIndependence(...).independent */
  independentGatingJudgeAvailable: boolean
  minGoldenSet?: number
}

export interface L3EligibilityResult {
  eligible: boolean
  reasons: string[]
}

export const checkL3Eligibility = (input: L3EligibilityInput): L3EligibilityResult => {
  const minGoldenSet = input.minGoldenSet ?? DEFAULT_MIN_GOLDEN_SET
  const reasons: string[] = []

  if (input.goldenSetSize < minGoldenSet) {
    reasons.push(`golden set ${input.goldenSetSize} < ${minGoldenSet}`)
  }
  if (!input.calibrationStratified) reasons.push("judge is not stratified-calibrated")
  if (input.calibrationStale) reasons.push("judge calibration is stale")
  if (!input.independentGatingJudgeAvailable) reasons.push("no independent gating judge available")

  return { eligible: reasons.length === 0, reasons }
}
