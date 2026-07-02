/**
 * APL sampling (Phase-1, backlog APL-1.5).
 *
 * The SDK can only do HEAD sampling (a decision at root-span start), so it cannot
 * itself guarantee "keep 100% of errors and slow traces" — the error/latency are
 * unknown when the root starts. That guarantee is the OTel Collector's
 * tailsamplingprocessor (see deploy/otel-collector.apl.yaml). This module provides
 * the in-process head sampler + models the Collector's tail-keep decision so the
 * two are specified and testable in one place.
 */

import type { Attributes } from "./contract"

import { Apl } from "./contract"

/** FNV-1a 32-bit → uniform [0,1), deterministic per trace id. */
const hashUnit = (s: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 0x1_0000_0000
}

/** Deterministic head-sampling decision. ratio<=0 never, ratio>=1 always. */
export const shouldHeadSample = (traceId: string, ratio: number): boolean => {
  if (ratio >= 1) return true
  if (ratio <= 0) return false
  return hashUnit(traceId) < ratio
}

export interface TailKeepOpts {
  /** Traces at/over this wall-clock duration are always kept. */
  slowMs?: number
}

/**
 * Models the Collector tail-sampling decision APL relies on: keep on an explicit
 * keep-hint (apl.keep, set by recordOutcome on fail/escalate), on a fail/escalated
 * outcome, or when the trace is slow. Everything else is subject to head sampling.
 */
export const tailKeepDecision = (
  attributes: Attributes,
  latencyMs: number,
  opts: TailKeepOpts = {},
): boolean => {
  if (attributes[Apl.KEEP] === true) return true
  const outcome = attributes[Apl.OUTCOME]
  if (outcome === "fail" || outcome === "escalated") return true
  return latencyMs >= (opts.slowMs ?? 10_000)
}
