/**
 * APL reviewer ops (v0.3 eval-science delta, FR-HITL-3) — the reviewer dashboard
 * metrics (queue depth/age, SLA-compliance, override-rate, reviewer–judge
 * agreement) plus the sampling schedule as a trust instrument.
 *
 * The sampling intensity operationalizes the Cycle of Trust ladder
 * (100% review → 10% audit → 2% spot-checks): oversight intensity descends with
 * earned trust and AUTO-RE-ESCALATES on regression — trust is earned slowly and
 * lost quickly by design. This feeds the Standard Loop-License human-oversight
 * plan (sampling/SLA/re-escalation). `nowMs` is injected so everything stays
 * pure/deterministic.
 */

export interface ReviewQueueItem {
  enqueuedAtMs: number
  /** Absent while the item is still pending review. */
  decidedAtMs?: number
  slaMs: number
  /** Whether the human overrode the agent/judge outcome (absent = not recorded). */
  overridden?: boolean
  /** Whether the human decision agrees with the judge verdict (absent = not recorded). */
  agreesWithJudge?: boolean
}

export interface ReviewerOpsReport {
  /** Items still awaiting a decision. */
  queueDepth: number
  /** Age of the oldest pending item vs now (0 when the queue is empty). */
  maxAgeMs: number
  /** Fraction of decided items decided within their SLA (0 when none decided). */
  slaCompliance: number
  /** Fraction of decided-with-flag items the human overrode (0 when none carry the flag). */
  overrideRate: number
  /** Fraction of decided-with-flag items agreeing with the judge (0 when none carry the flag). */
  reviewerJudgeAgreement: number
}

/** Computes the FR-HITL-3 reviewer dashboard metrics over a review queue. */
export const reviewerOps = (
  items: readonly ReviewQueueItem[],
  nowMs: number,
): ReviewerOpsReport => {
  let queueDepth = 0
  let maxAgeMs = 0
  let decided = 0
  let withinSla = 0
  let overrideFlagged = 0
  let overrides = 0
  let agreementFlagged = 0
  let agreements = 0

  for (const item of items) {
    if (item.decidedAtMs === undefined) {
      queueDepth += 1
      maxAgeMs = Math.max(maxAgeMs, nowMs - item.enqueuedAtMs)
      continue
    }
    decided += 1
    if (item.decidedAtMs - item.enqueuedAtMs <= item.slaMs) withinSla += 1
    if (item.overridden !== undefined) {
      overrideFlagged += 1
      if (item.overridden) overrides += 1
    }
    if (item.agreesWithJudge !== undefined) {
      agreementFlagged += 1
      if (item.agreesWithJudge) agreements += 1
    }
  }

  return {
    queueDepth,
    maxAgeMs,
    slaCompliance: decided === 0 ? 0 : withinSla / decided,
    overrideRate: overrideFlagged === 0 ? 0 : overrides / overrideFlagged,
    reviewerJudgeAgreement: agreementFlagged === 0 ? 0 : agreements / agreementFlagged,
  }
}

export const DEFAULT_SAMPLING_FLOOR = 0.02
export const DEFAULT_SAMPLING_CEILING = 1.0
export const DEFAULT_SAMPLING_STEP = 2

/**
 * Next review-sampling intensity on the trust ladder (Cycle of Trust,
 * FR-HITL-3): earned trust divides by `step` (halves by default) toward `floor`
 * (2% spot-checks); a regression multiplies by `step`^2 (x4 by default) capped at
 * `ceiling` (100% review) — auto-re-escalation climbs two rungs at once, so
 * oversight returns faster than it was relaxed. Regression WINS when both flags
 * are set. The result is always clamped to [floor, ceiling].
 */
export const nextSamplingIntensity = (
  current: number,
  opts: {
    regression: boolean
    earnedTrust: boolean
    floor?: number
    ceiling?: number
    step?: number
  },
): number => {
  const floor = opts.floor ?? DEFAULT_SAMPLING_FLOOR
  const ceiling = opts.ceiling ?? DEFAULT_SAMPLING_CEILING
  const step = opts.step ?? DEFAULT_SAMPLING_STEP
  const clamp = (value: number): number => Math.min(ceiling, Math.max(floor, value))

  if (opts.regression) return clamp(current * step * step)
  if (opts.earnedTrust) return clamp(current / step)
  return clamp(current)
}
