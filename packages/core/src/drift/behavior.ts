/**
 * APL behavior drift (Eval-Science delta §5, FR-DRIFT-2) — tool-call mix drift
 * per agent from existing OTel data, for agents of autonomy >= L2.
 *
 * The tool-call mix (fraction of calls per tool) is a cheap behavioral
 * fingerprint; a significant shift vs the stored baseline means the agent is
 * doing something different in prod. Like failure/trend.ts, the alert is gated
 * on significance: below a minimum volume it is suppressed (the mix is noise),
 * above it we alert when the total variation distance breaches the threshold.
 *
 * Note: provider drift (hosted-model canaries) lives in AgenticGateway (Layer 1);
 * APL consumes those canary results as an eval signal — this module only covers
 * the agent's own tool-call behavior. Pure + deterministic.
 */

export const DEFAULT_MIN_VOLUME = 20
export const DEFAULT_TVD_THRESHOLD = 0.25

/** Fraction of calls per tool ([] -> {}). */
export const toolCallMix = (
  calls: readonly { tool: string }[],
): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = {}
  for (const call of calls) counts[call.tool] = (counts[call.tool] ?? 0) + 1
  const mix: Record<string, number> = {}
  for (const [tool, count] of Object.entries(counts)) mix[tool] = count / calls.length
  return mix
}

/** Total variation distance: 0.5 * sum |p - q| over the union of keys (0 = same mix, 1 = disjoint). */
export const mixShift = (
  recent: Readonly<Record<string, number>>,
  baseline: Readonly<Record<string, number>>,
): number => {
  const keys = new Set([...Object.keys(recent), ...Object.keys(baseline)])
  let sum = 0
  for (const key of keys) sum += Math.abs((recent[key] ?? 0) - (baseline[key] ?? 0))
  return 0.5 * sum
}

/**
 * FR-DRIFT-2 alert. Volume-floor suppressed below `minVolume` (mirrors
 * failure/trend.ts poissonSpike — too few calls to be significant), else alerts
 * when the TVD between the recent mix and the baseline mix exceeds `threshold`.
 */
export const behaviorDriftAlert = (
  recentCalls: readonly { tool: string }[],
  baselineMix: Readonly<Record<string, number>>,
  opts: { minVolume?: number; threshold?: number } = {},
): { alert: boolean; reason: string } => {
  const minVolume = opts.minVolume ?? DEFAULT_MIN_VOLUME
  const threshold = opts.threshold ?? DEFAULT_TVD_THRESHOLD
  if (recentCalls.length < minVolume) {
    return {
      alert: false,
      reason: `volume ${recentCalls.length} < ${minVolume}: suppressed (not significant)`,
    }
  }
  const tvd = mixShift(toolCallMix(recentCalls), baselineMix)
  if (tvd > threshold) {
    return {
      alert: true,
      reason: `tool-call mix TVD ${tvd.toFixed(3)} > ${threshold}: behavior drifted vs baseline`,
    }
  }
  return { alert: false, reason: `tool-call mix TVD ${tvd.toFixed(3)} within ${threshold}` }
}
