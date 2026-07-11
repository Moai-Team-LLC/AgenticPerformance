import { describe, expect, it } from "vitest"

import { checkL3Eligibility, shouldAutoDemote } from "./eligibility"

const good = {
  goldenSetSize: 40,
  calibrationStratified: true,
  calibrationStale: false,
  independentGatingJudgeAvailable: true,
  consecutiveCleanRuns: 3,
  openCriticalOrHigh: 0,
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

  it("blocks until a clean-run streak is earned (§6)", () => {
    const r = checkL3Eligibility({ ...good, consecutiveCleanRuns: 1 })
    expect(r.eligible).toBe(false)
    expect(r.reasons.some((x) => x.includes("consecutive clean run"))).toBe(true)
    // absent streak defaults to 0 → not eligible (graduation must be earned)
    const { consecutiveCleanRuns: _omit, ...noStreak } = good
    expect(checkL3Eligibility(noStreak).eligible).toBe(false)
  })

  it("blocks on an open Critical/High finding (§6)", () => {
    const r = checkL3Eligibility({ ...good, openCriticalOrHigh: 1 })
    expect(r.eligible).toBe(false)
    expect(r.reasons.some((x) => x.includes("Critical/High"))).toBe(true)
  })
})

describe("APL auto-demote (Cycle-of-Trust §6)", () => {
  it("demotes on a live regression/rollback", () => {
    expect(shouldAutoDemote({ regressed: true, openCriticalOrHigh: 0 }).demote).toBe(true)
  })

  it("demotes on a new open Critical/High finding", () => {
    expect(shouldAutoDemote({ regressed: false, openCriticalOrHigh: 2 }).demote).toBe(true)
  })

  it("does not demote a clean, finding-free version", () => {
    expect(shouldAutoDemote({ regressed: false, openCriticalOrHigh: 0 })).toEqual({ demote: false })
  })
})
