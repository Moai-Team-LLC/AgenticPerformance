/**
 * APL cluster trend detection (Phase-3, backlog APL-3.5) — fixes the failure#4
 * finding (trend math collapses on small counts).
 *
 * A cluster alert must be gated on statistical SIGNIFICANCE, not raw appearance:
 * we model per-window counts as Poisson around a baseline rate and alert only when
 * the observed count exceeds baseline by z standard deviations. Below a minimum
 * weekly volume, trend alerts are suppressed (the counts are noise). Pure.
 */

/** Exponentially-weighted moving average of a rate series (most-recent last). */
export const ewma = (series: readonly number[], alpha = 0.3): number => {
  if (series.length === 0) return 0
  let acc = series[0] ?? 0
  for (let i = 1; i < series.length; i += 1) acc = alpha * (series[i] ?? 0) + (1 - alpha) * acc
  return acc
}

export interface SpikeInput {
  /** Count of failures in the current window. */
  observed: number
  /** Expected count from the baseline rate (e.g. EWMA of prior windows). */
  expected: number
  /** Total events (all outcomes) in the current window — the volume floor keys off this. */
  windowVolume: number
}

export interface SpikeVerdict {
  alert: boolean
  reason: string
}

/**
 * Poisson spike test. Suppressed below `minVolume` (too few events to be
 * significant). Otherwise alerts when observed > expected + z*sqrt(max(expected,1)).
 */
export const poissonSpike = (
  input: SpikeInput,
  opts: { z?: number; minVolume?: number } = {},
): SpikeVerdict => {
  const z = opts.z ?? 3
  const minVolume = opts.minVolume ?? 20
  if (input.windowVolume < minVolume) {
    return {
      alert: false,
      reason: `volume ${input.windowVolume} < ${minVolume}: suppressed (not significant)`,
    }
  }
  const sigma = Math.sqrt(Math.max(input.expected, 1))
  const bound = input.expected + z * sigma
  if (input.observed > bound) {
    return {
      alert: true,
      reason: `observed ${input.observed} > baseline ${input.expected.toFixed(1)} + ${z}σ (${bound.toFixed(1)})`,
    }
  }
  return { alert: false, reason: `observed ${input.observed} within ${z}σ of baseline` }
}
