import { describe, expect, it } from "vitest"

import { ewma, poissonSpike } from "./trend"

describe("APL trend detection (Phase-3 APL-3.5)", () => {
  it("ewma weights recent values more", () => {
    expect(ewma([])).toBe(0)
    expect(ewma([5, 5, 5])).toBeCloseTo(5)
    expect(ewma([0, 0, 10], 0.5)).toBeGreaterThan(ewma([10, 0, 0], 0.5))
  })

  it("suppresses alerts below the volume floor", () => {
    const v = poissonSpike({ observed: 8, expected: 1, windowVolume: 10 }, { minVolume: 20 })
    expect(v.alert).toBe(false)
    expect(v.reason).toContain("suppressed")
  })

  it("alerts on a significant spike above baseline", () => {
    const v = poissonSpike({ observed: 25, expected: 5, windowVolume: 200 }, { z: 3 })
    expect(v.alert).toBe(true)
  })

  it("does not alert on noise within z sigma", () => {
    const v = poissonSpike({ observed: 7, expected: 5, windowVolume: 200 }, { z: 3 })
    expect(v.alert).toBe(false)
  })
})
