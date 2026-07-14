import { describe, expect, it } from "vitest"

import { behaviorDriftAlert, mixShift, toolCallMix } from "./behavior"

const calls = (spec: Readonly<Record<string, number>>): { tool: string }[] =>
  Object.entries(spec).flatMap(([tool, n]) => Array.from({ length: n }, () => ({ tool })))

describe("APL behavior drift (Eval-Science delta FR-DRIFT-2)", () => {
  it("toolCallMix: fraction per tool, [] -> {}", () => {
    expect(toolCallMix([])).toEqual({})
    expect(toolCallMix(calls({ search: 2, write: 1, read: 1 }))).toEqual({
      search: 0.5,
      write: 0.25,
      read: 0.25,
    })
  })

  it("mixShift: total variation distance, hand-computed over the union of keys", () => {
    // 0.5 * (|0.5-0.8| + |0.5-0| + |0-0.2|) = 0.5 * 1.0 = 0.5
    expect(mixShift({ a: 0.5, b: 0.5 }, { a: 0.8, c: 0.2 })).toBeCloseTo(0.5, 10)
    expect(mixShift({ a: 0.5, b: 0.5 }, { a: 0.5, b: 0.5 })).toBe(0)
    // Disjoint supports -> maximal distance 1.
    expect(mixShift({ a: 1 }, { b: 1 })).toBe(1)
  })

  it("suppresses the alert below the volume floor even on a huge shift", () => {
    const verdict = behaviorDriftAlert(calls({ search: 10 }), { write: 1 }, { minVolume: 20 })
    expect(verdict.alert).toBe(false)
    expect(verdict.reason).toContain("suppressed")
  })

  it("alerts above the volume floor when TVD exceeds the threshold", () => {
    const verdict = behaviorDriftAlert(calls({ search: 30 }), { write: 1 })
    expect(verdict.alert).toBe(true)
    expect(verdict.reason).toContain("TVD")
  })

  it("does not alert when the recent mix matches the baseline", () => {
    const verdict = behaviorDriftAlert(calls({ search: 15, write: 15 }), {
      search: 0.5,
      write: 0.5,
    })
    expect(verdict.alert).toBe(false)
  })

  it("respects a custom threshold", () => {
    // TVD = 0.5 * (|0.6-0.5| + |0.4-0.5|) = 0.1
    const recent = calls({ search: 18, write: 12 })
    const baseline = { search: 0.5, write: 0.5 }
    expect(behaviorDriftAlert(recent, baseline, { threshold: 0.05 }).alert).toBe(true)
    expect(behaviorDriftAlert(recent, baseline, { threshold: 0.25 }).alert).toBe(false)
  })
})
