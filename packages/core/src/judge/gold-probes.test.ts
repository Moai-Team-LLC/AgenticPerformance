import { describe, expect, it } from "vitest"

import { probeAccuracyTrend, probeDriftAlert, shouldBeProbe } from "./gold-probes"

describe("APL gold probes (Eval-Science FR-JUDGE-7)", () => {
  it("shouldBeProbe is deterministic: same callId + ratio → same decision", () => {
    for (let i = 0; i < 100; i += 1) {
      const id = `call-${i}`
      expect(shouldBeProbe(id, 0.03)).toBe(shouldBeProbe(id, 0.03))
    }
  })

  it("shouldBeProbe clamps the ratio to [0, 1]", () => {
    expect(shouldBeProbe("call-1", -0.5)).toBe(false)
    expect(shouldBeProbe("call-1", 0)).toBe(false)
    expect(shouldBeProbe("call-1", 5)).toBe(true) // clamped to 1 → always a probe
  })

  it("shouldBeProbe approximates the ratio over many ids", () => {
    const total = 10_000
    let probes = 0
    for (let i = 0; i < total; i += 1) {
      if (shouldBeProbe(`call-${i}`, 0.03)) probes += 1
    }
    const fraction = probes / total
    expect(fraction).toBeGreaterThan(0.02)
    expect(fraction).toBeLessThan(0.04)
  })

  it("probeAccuracyTrend scores only the recent window", () => {
    const nowMs = 100_000
    const outcomes = [
      { correct: true, atMs: 40_000 }, // outside the 50k window
      { correct: true, atMs: 50_000 }, // exactly nowMs - windowMs → excluded
      { correct: true, atMs: 60_000 },
      { correct: false, atMs: 90_000 },
      { correct: true, atMs: 100_000 }, // exactly nowMs → included
    ]
    const trend = probeAccuracyTrend(outcomes, 50_000, nowMs)
    expect(trend.n).toBe(3)
    expect(trend.accuracy).toBeCloseTo(2 / 3)
  })

  it("probeAccuracyTrend with zero probes reports accuracy 0 (not a pass)", () => {
    expect(probeAccuracyTrend([], 50_000, 100_000)).toEqual({ accuracy: 0, n: 0 })
    const stale = [{ correct: true, atMs: 1_000 }]
    expect(probeAccuracyTrend(stale, 50_000, 100_000)).toEqual({ accuracy: 0, n: 0 })
  })

  it("probeDriftAlert is suppressed below the minN volume floor", () => {
    const v = probeDriftAlert({ accuracy: 0.2, n: 10 }, 0.9)
    expect(v.alert).toBe(false)
    expect(v.reason).toContain("suppressed")
  })

  it("probeDriftAlert fires on a real drop with enough probes", () => {
    const v = probeDriftAlert({ accuracy: 0.7, n: 50 }, 0.9)
    expect(v.alert).toBe(true)
    expect(v.reason).toContain("baseline")
  })

  it("probeDriftAlert stays quiet when accuracy is within the drop tolerance", () => {
    const v = probeDriftAlert({ accuracy: 0.85, n: 50 }, 0.9)
    expect(v.alert).toBe(false)
  })

  it("probeDriftAlert honours custom minN and drop", () => {
    expect(probeDriftAlert({ accuracy: 0.7, n: 6 }, 0.9, { minN: 5, drop: 0.05 }).alert).toBe(true)
    expect(probeDriftAlert({ accuracy: 0.7, n: 4 }, 0.9, { minN: 5, drop: 0.05 }).alert).toBe(false)
  })
})
