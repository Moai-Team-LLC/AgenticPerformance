/**
 * APL Judge Card (Eval-Science delta v0.3, FR-JUDGE-5/6).
 *
 * The judge already carries ACCURACY calibration (TPR/TNR + Wilson-LB in
 * judge/calibration.ts, staleness in judge/version.ts). The Judge Card adds the
 * CONFIDENCE side — ECE (Expected Calibration Error) + Brier — and a bias battery
 * (swap-consistency, self-preference, verbosity), rolled into one versionable
 * artifact with a derived status. The confidence signal for gating is
 * self-consistency (k=3–5) or swap-consistency — NEVER raw verbalized confidence
 * (systematically overconfident). Pure/deterministic: the clock is injected
 * (nowMs); no network/db/LLM.
 */

export type JudgeCardStatus = "calibrated" | "uncalibrated" | "stale"

/**
 * The versionable Judge Card artifact (FR-JUDGE-5). Stored as jsonb in the
 * `apl_judge.card` column; `status` is mirrored into its own column for gating
 * queries (FR-JUDGE-6).
 */
export interface JudgeCard {
  judgeId: string
  /** Rubrics are versioned supply-chain artifacts (FR-EVAL-8); a rubric change forces a re-baseline. */
  rubricVersion: string
  model: string
  /** Accuracy vs the ground-truth anchor sample (the TPR/TNR contour of FR-JUDGE-2). */
  anchoredAccuracy: number
  /** Expected Calibration Error (computeEce). */
  ece: number
  /** Brier score (computeBrier). */
  brier: number
  biasBattery: {
    /** (A,B) vs (B,A) agreement; position bias = 1 - swap-consistency. */
    swapConsistency: number
    /** Cross-family self-preference test. */
    selfPreference: "pass" | "fail"
    verbosity: "pass" | "fail"
  }
  /** Provenance of the anchor sample the card was calibrated against (FR-EVAL-7 origins). */
  anchorSample: {
    n: number
    windowDays: number
    source: "adjudicated" | "authored" | "review_capture"
  }
  lastCalibratedMs: number
  status: JudgeCardStatus
}

export const DEFAULT_ECE_BINS = 10

/**
 * Expected Calibration Error — standard equal-width binning over [0, 1]. Per
 * non-empty bin: |mean confidence - accuracy|, weighted by the bin's share of
 * predictions. `confidence` of exactly 1 lands in the top bin. Empty input -> 0.
 */
export const computeEce = (
  predictions: readonly { confidence: number; correct: boolean }[],
  bins = DEFAULT_ECE_BINS,
): number => {
  if (predictions.length === 0) return 0
  const acc = Array.from({ length: bins }, () => ({ confidenceSum: 0, correctCount: 0, n: 0 }))
  for (const p of predictions) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(p.confidence * bins)))
    const bin = acc[idx]
    if (bin === undefined) continue // unreachable: idx is clamped to [0, bins)
    bin.confidenceSum += p.confidence
    bin.correctCount += p.correct ? 1 : 0
    bin.n += 1
  }
  let ece = 0
  for (const bin of acc) {
    if (bin.n === 0) continue
    const meanConfidence = bin.confidenceSum / bin.n
    const accuracy = bin.correctCount / bin.n
    ece += (bin.n / predictions.length) * Math.abs(meanConfidence - accuracy)
  }
  return ece
}

/** Brier score: mean (confidence - outcome)^2 with outcome 1 for correct, 0 otherwise. Empty -> 0. */
export const computeBrier = (
  predictions: readonly { confidence: number; correct: boolean }[],
): number => {
  if (predictions.length === 0) return 0
  let sum = 0
  for (const p of predictions) {
    const outcome = p.correct ? 1 : 0
    sum += (p.confidence - outcome) ** 2
  }
  return sum / predictions.length
}

/** One order-swapped verdict pair from the bias battery. */
export interface SwapPair {
  /** Winner when the candidates were presented in order (A, B). */
  forward: "A" | "B"
  /** Winner when the SAME candidates were presented in order (B, A). */
  backward: "A" | "B"
}

/**
 * Swap-consistency (FR-JUDGE-5 bias battery): fraction of (A,B)/(B,A) verdict
 * pairs where the judge preferred the SAME item regardless of presentation order
 * (forward === backward). A verdict that flips with the order is anchored to
 * position, not content: position bias = 1 - swap-consistency. Empty input -> 0 —
 * no evidence of consistency is not consistency.
 */
export const swapConsistency = (pairs: readonly SwapPair[]): number => {
  if (pairs.length === 0) return 0
  let consistent = 0
  for (const pair of pairs) if (pair.forward === pair.backward) consistent += 1
  return consistent / pairs.length
}

const MS_PER_DAY = 86_400_000

/** Inputs to the FR-JUDGE-5 status rules. Bars are declared upstream and evaluated by the caller. */
export interface StatusInputs {
  /** A ground-truth anchor sample exists (anchor_sample.n > 0). */
  hasAnchorSample: boolean
  /** Declared accuracy bars met — including Wilson-LB > 0.8 from FR-JUDGE-2 (stratifiedCalibration). */
  meetsAccuracyBar: boolean
  /** Declared ECE bar met. */
  meetsEceBar: boolean
  lastCalibratedMs: number
  nowMs: number
  /** Declared recency window (the FR-JUDGE-1 expiry contour; cf. isCalibrationStale). */
  recencyWindowDays: number
}

/**
 * FR-JUDGE-5 status rules: `uncalibrated` when there is no anchor sample or a
 * declared bar (accuracy incl. Wilson-LB, ECE) is missed; `stale` when
 * last_calibrated is older than the declared recency window; else `calibrated`.
 * Uncalibrated wins over stale when both apply — either way it cannot gate.
 */
export const deriveStatus = (i: StatusInputs): JudgeCardStatus => {
  if (!i.hasAnchorSample || !i.meetsAccuracyBar || !i.meetsEceBar) return "uncalibrated"
  if (i.nowMs - i.lastCalibratedMs > i.recencyWindowDays * MS_PER_DAY) return "stale"
  return "calibrated"
}

/**
 * FR-JUDGE-6 — Cycle-of-Trust invariant. ONLY a judge with status `calibrated`
 * may gate L3 transitions, auto-apply (FR-IMPROVE-3), or release gates;
 * `uncalibrated` and `stale` must not (the "flaky graders in release gates"
 * anti-pattern). And a low-confidence verdict from a calibrated judge must
 * abstain -> escalate to human review (FR-HITL) — never pass.
 */
export const canGate = (status: JudgeCardStatus): boolean => status === "calibrated"
