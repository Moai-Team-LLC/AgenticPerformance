/**
 * APL gold probes (Eval-Science delta v0.3, FR-JUDGE-7).
 *
 * Continuous judge QA: a deterministic slice of judge calls (recommended 2–5%) is
 * answered against gold probes — questions with known answers — and the
 * probe-accuracy trend is tracked. A sustained accuracy drop below the judge's
 * baseline raises a drift alert; this does double duty as the judge-drift detector
 * of §5. Below a minimum probe count the alert is SUPPRESSED, mirroring the
 * failure/trend.ts volume-floor philosophy: a handful of probes is noise, not
 * evidence — and suppression means "not enough evidence", never "healthy".
 *
 * Invariant (FR-JUDGE-4): the gold-probe set must stay DISJOINT from the
 * calibration and taxonomy sets. That is enforced upstream where the sets are
 * assembled; this module only samples and scores.
 */

import { hashUnit } from "../eval/mining"

/**
 * Deterministic probe sampling: the same callId always lands on the same side of
 * the cut, so a probe decision is reproducible across processes and replays.
 * `ratio` is clamped to [0, 1]; the FR-JUDGE-7 recommendation is 0.02–0.05
 * (2–5% of judge calls).
 */
export const shouldBeProbe = (callId: string, ratio: number): boolean => {
  const clamped = Math.min(1, Math.max(0, ratio))
  return hashUnit(callId) < clamped
}

/** One scored gold-probe answer. */
export interface ProbeOutcome {
  correct: boolean
  atMs: number
}

/**
 * Probe accuracy over the recent window: outcomes with atMs in
 * (nowMs - windowMs, nowMs]. With n = 0 the accuracy is reported as 0 — NOT a
 * pass: zero probes is zero evidence, and the caller must route the decision
 * through the minN floor of probeDriftAlert. `nowMs` is injected so this stays
 * pure/deterministic.
 */
export const probeAccuracyTrend = (
  outcomes: readonly ProbeOutcome[],
  windowMs: number,
  nowMs: number,
): { accuracy: number; n: number } => {
  let n = 0
  let correct = 0
  for (const outcome of outcomes) {
    if (outcome.atMs > nowMs - windowMs && outcome.atMs <= nowMs) {
      n += 1
      if (outcome.correct) correct += 1
    }
  }
  return { accuracy: n === 0 ? 0 : correct / n, n }
}

/**
 * Judge-drift alert on the probe-accuracy trend (FR-JUDGE-7, double duty for §5):
 * alerts when n >= minN (default 20) AND accuracy < baselineAccuracy - drop
 * (default 0.1). Below minN the alert is suppressed (volume floor, as in
 * failure/trend.ts poissonSpike).
 */
export const probeDriftAlert = (
  recent: { accuracy: number; n: number },
  baselineAccuracy: number,
  opts: { minN?: number; drop?: number } = {},
): { alert: boolean; reason: string } => {
  const minN = opts.minN ?? 20
  const drop = opts.drop ?? 0.1
  if (recent.n < minN) {
    return {
      alert: false,
      reason: `only ${recent.n} probes in window (< ${minN}): suppressed (not significant)`,
    }
  }
  const floor = baselineAccuracy - drop
  if (recent.accuracy < floor) {
    return {
      alert: true,
      reason: `probe accuracy ${recent.accuracy.toFixed(3)} < baseline ${baselineAccuracy.toFixed(3)} - ${drop} (${floor.toFixed(3)})`,
    }
  }
  return {
    alert: false,
    reason: `probe accuracy ${recent.accuracy.toFixed(3)} within ${drop} of baseline ${baselineAccuracy.toFixed(3)}`,
  }
}
