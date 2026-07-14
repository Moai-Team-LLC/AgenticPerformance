import { describe, expect, it } from "vitest"

import {
  centroid,
  centroidCosineShift,
  representativeness,
  twoSampleAuc,
} from "./representativeness"

/** A deterministic point cloud near [1, 0]. */
const cloudA: readonly (readonly number[])[] = [
  [1, 0],
  [0.9, 0.1],
  [1, 0.05],
  [0.95, 0],
]

/** A deterministic point cloud near [0, 1] — clearly separated from cloudA. */
const cloudB: readonly (readonly number[])[] = [
  [0, 1],
  [0.1, 0.9],
  [0.05, 1],
  [0, 0.95],
]

describe("APL representativeness (Eval-Science delta FR-DRIFT-1)", () => {
  it("centroid: mean vector, [] -> []", () => {
    expect(centroid([])).toEqual([])
    expect(centroid([[1, 2]])).toEqual([1, 2])
    expect(
      centroid([
        [1, 2],
        [3, 4],
      ]),
    ).toEqual([2, 3])
  })

  it("identical clouds: shift ~0, AUC ~0.5 (same distribution), not drifted", () => {
    expect(centroidCosineShift(cloudA, cloudA)).toBeCloseTo(0, 6)
    expect(twoSampleAuc(cloudA, cloudA)).toBeCloseTo(0.5, 6)
    const result = representativeness(cloudA, cloudA)
    expect(result.drifted).toBe(false)
    expect(result.reason).toContain("representative")
  })

  it("separated clouds: AUC near 1, shift breached, drifted with named reasons", () => {
    expect(twoSampleAuc(cloudA, cloudB)).toBeGreaterThan(0.95)
    expect(centroidCosineShift(cloudA, cloudB)).toBeGreaterThan(0.5)
    const result = representativeness(cloudA, cloudB)
    expect(result.drifted).toBe(true)
    expect(result.reason).toContain("centroid shift")
    expect(result.reason).toContain("two-sample AUC")
  })

  it("empty golden set: max shift, drifted (absent data is NOT representative)", () => {
    const result = representativeness(cloudA, [])
    expect(result.centroidShift).toBe(1)
    expect(result.auc).toBe(1)
    expect(result.drifted).toBe(true)
    expect(centroidCosineShift([], cloudA)).toBe(1)
    expect(twoSampleAuc([], cloudA)).toBe(1)
    expect(twoSampleAuc(cloudA, [])).toBe(1)
  })

  it("respects custom thresholds (drifted only when EITHER is breached)", () => {
    // Identical clouds never breach, even with tight thresholds.
    const tight = representativeness(cloudA, cloudA, { shiftThreshold: 0.01, aucThreshold: 0.51 })
    expect(tight.drifted).toBe(false)
    // Separated clouds pass only if BOTH thresholds are absurdly loose.
    const loose = representativeness(cloudA, cloudB, { shiftThreshold: 2, aucThreshold: 1 })
    expect(loose.drifted).toBe(false)
  })
})
