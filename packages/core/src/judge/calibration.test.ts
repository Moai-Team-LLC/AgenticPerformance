import { describe, expect, it } from "vitest"

import { stratifiedCalibration, wilsonLowerBound } from "./calibration"

const results = (pos: number, posCorrect: number, neg: number, negCorrect: number) => {
  const out: { id: string; expected: boolean; got: boolean }[] = []
  for (let i = 0; i < pos; i += 1) out.push({ id: `p${i}`, expected: true, got: i < posCorrect })
  for (let i = 0; i < neg; i += 1)
    out.push({ id: `n${i}`, expected: false, got: !(i < negCorrect) })
  return out
}

describe("APL judge calibration — Wilson + stratification (Phase-3 APL-3.2)", () => {
  it("Wilson lower bound: 0 on empty, below the point estimate otherwise", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0)
    expect(wilsonLowerBound(5, 5)).toBeLessThan(0.7) // 5/5 is not strong evidence
    const strong = wilsonLowerBound(95, 100)
    expect(strong).toBeGreaterThan(0.8)
    expect(strong).toBeLessThan(0.95)
  })

  it("rejects a judge that 'passes' on an empty positive class (the harness bug)", () => {
    const cal = stratifiedCalibration(results(0, 0, 60, 60))
    expect(cal.tpr).toBe(1) // point estimate is misleadingly 1 (base behaviour)
    expect(cal.tprLower).toBe(0) // but the lower bound is 0
    expect(cal.stratifiedCalibrated).toBe(false)
    expect(cal.reasons.some((r) => r.includes("positive labels"))).toBe(true)
  })

  it("rejects a perfect-but-tiny sample (below min per class)", () => {
    const cal = stratifiedCalibration(results(5, 5, 5, 5))
    expect(cal.tpr).toBe(1)
    expect(cal.stratifiedCalibrated).toBe(false)
    expect(cal.reasons.length).toBeGreaterThan(0)
  })

  it("calibrates when both classes are large and both lower bounds clear 0.8", () => {
    const cal = stratifiedCalibration(results(100, 95, 100, 95))
    expect(cal.positives).toBe(100)
    expect(cal.negatives).toBe(100)
    expect(cal.tprLower).toBeGreaterThan(0.8)
    expect(cal.tnrLower).toBeGreaterThan(0.8)
    expect(cal.stratifiedCalibrated).toBe(true)
    expect(cal.reasons).toEqual([])
  })
})
