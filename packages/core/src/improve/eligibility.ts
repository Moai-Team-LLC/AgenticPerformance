/**
 * APL L3 eligibility (Phase-5, backlog APL-5.1) — fixes improve-trust#6 by
 * reframing PRD assumption A2 into a CODE-ENFORCED gate. An agent is only eligible
 * for judge-gated auto-improvement (L3) once it has actually earned it: a per-agent
 * golden set of real size, a fresh stratified judge calibration, and an available
 * independent gating judge. So L3 lights up gradually per agent, never fleet-wide at
 * GA. Pure.
 */

export const DEFAULT_MIN_GOLDEN_SET = 30
/** Clean (non-regressing) runs an agent must string together before it graduates. */
export const DEFAULT_MIN_CLEAN_RUNS = 3

export interface L3EligibilityInput {
  goldenSetSize: number
  /** stratifiedCalibration(...).stratifiedCalibrated */
  calibrationStratified: boolean
  /** isCalibrationStale(...).stale */
  calibrationStale: boolean
  /** checkJudgeIndependence(...).independent */
  independentGatingJudgeAvailable: boolean
  /**
   * Consecutive runs without a regression/rollback (the Cycle-of-Trust streak, §6).
   * Defaults to 0 — graduation must be EARNED, so an agent with no proven streak is not
   * eligible; the counter resets to 0 on any regression.
   */
  consecutiveCleanRuns?: number
  /** Open assurance findings at Critical/High severity — any blocks graduation (§6). */
  openCriticalOrHigh?: number
  minGoldenSet?: number
  minCleanRuns?: number
}

export interface L3EligibilityResult {
  eligible: boolean
  reasons: string[]
}

/**
 * The numeric Cycle-of-Trust graduation gate (doctrine §6). An agent is L3-eligible only
 * when it has EARNED it — a real golden set, a fresh stratified + independent judge, a
 * streak of clean runs, and zero open Critical/High findings — a fail-closed allowlist of
 * conditions, not a human toggle. Pure.
 */
export const checkL3Eligibility = (input: L3EligibilityInput): L3EligibilityResult => {
  const minGoldenSet = input.minGoldenSet ?? DEFAULT_MIN_GOLDEN_SET
  const minCleanRuns = input.minCleanRuns ?? DEFAULT_MIN_CLEAN_RUNS
  const cleanRuns = input.consecutiveCleanRuns ?? 0
  const openCriticalOrHigh = input.openCriticalOrHigh ?? 0
  const reasons: string[] = []

  if (input.goldenSetSize < minGoldenSet) {
    reasons.push(`golden set ${input.goldenSetSize} < ${minGoldenSet}`)
  }
  if (!input.calibrationStratified) reasons.push("judge is not stratified-calibrated")
  if (input.calibrationStale) reasons.push("judge calibration is stale")
  if (!input.independentGatingJudgeAvailable) reasons.push("no independent gating judge available")
  if (cleanRuns < minCleanRuns) {
    reasons.push(`only ${cleanRuns} consecutive clean run(s) (need >= ${minCleanRuns})`)
  }
  if (openCriticalOrHigh > 0) {
    reasons.push(`${openCriticalOrHigh} open Critical/High finding(s)`)
  }

  return { eligible: reasons.length === 0, reasons }
}

export interface AutoDemoteInput {
  /** A gate regression or an A/B rollback observed on the LIVE version. */
  regressed: boolean
  /** Assurance findings opened at Critical/High since the last promotion. */
  openCriticalOrHigh: number
}

/**
 * The standing auto-demote rule (doctrine §6): trust decays, it is not sticky. A live
 * regression/rollback or a new Critical/High finding drops the agent a level — automatic,
 * not waiting for a human to notice.
 */
export const shouldAutoDemote = (input: AutoDemoteInput): { demote: boolean; reason?: string } => {
  if (input.regressed) {
    return { demote: true, reason: "regression/rollback on the live version — trust decays, drop a level" }
  }
  if (input.openCriticalOrHigh > 0) {
    return { demote: true, reason: `${input.openCriticalOrHigh} open Critical/High finding(s) — drop a level` }
  }
  return { demote: false }
}
