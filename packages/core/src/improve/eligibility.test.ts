import { describe, expect, it } from "vitest"

import { checkL3Eligibility } from "./eligibility"

const good = {
  goldenSetSize: 40,
  calibrationStratified: true,
  calibrationStale: false,
  independentGatingJudgeAvailable: true,
}

describe("APL L3 eligibility (Phase-5 APL-5.1)", () => {
  it("eligible only when every precondition holds", () => {
    expect(checkL3Eligibility(good).eligible).toBe(true)
  })

  it("blocks on a thin golden set", () => {
    const r = checkL3Eligibility({ ...good, goldenSetSize: 5 })
    expect(r.eligible).toBe(false)
    expect(r.reasons[0]).toContain("golden set")
  })

  it("blocks on uncalibrated / stale judge / no independent judge", () => {
    expect(checkL3Eligibility({ ...good, calibrationStratified: false }).eligible).toBe(false)
    expect(checkL3Eligibility({ ...good, calibrationStale: true }).eligible).toBe(false)
    expect(checkL3Eligibility({ ...good, independentGatingJudgeAvailable: false }).eligible).toBe(
      false,
    )
  })
})
