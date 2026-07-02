import { describe, expect, it } from "vitest"

import { accumulate, assignArm, routeAndDecide, type Outcome } from "./routing"

describe("APL canary routing (Phase-5 APL-5.4)", () => {
  it("routes all traffic to prod at ratio 0 and to canary at ratio 1", () => {
    expect(assignArm("trace-x", 0)).toBe("prod")
    expect(assignArm("trace-x", -0.5)).toBe("prod")
    expect(assignArm("trace-x", 1)).toBe("canary")
    expect(assignArm("trace-x", 1.5)).toBe("canary")
  })

  it("is deterministic: same id + ratio always resolves to the same arm", () => {
    const first = assignArm("trace-abc", 0.5)
    for (let i = 0; i < 5; i += 1) expect(assignArm("trace-abc", 0.5)).toBe(first)
  })

  it("splits many ids to canary in ~ratio proportion", () => {
    const n = 5000
    const ratio = 0.3
    let canary = 0
    for (let i = 0; i < n; i += 1) if (assignArm(`trace-${i}`, ratio) === "canary") canary += 1
    const observed = canary / n
    expect(Math.abs(observed - ratio)).toBeLessThan(0.03)
  })

  it("accumulate computes n + passRate per arm (0 rate for an empty arm)", () => {
    const outcomes: Outcome[] = [
      { arm: "canary", pass: true },
      { arm: "canary", pass: true },
      { arm: "canary", pass: false },
      { arm: "prod", pass: false },
    ]
    const { canary, prod } = accumulate(outcomes)
    expect(canary.n).toBe(3)
    expect(canary.passRate).toBeCloseTo(2 / 3)
    expect(prod.n).toBe(1)
    expect(prod.passRate).toBe(0)
  })

  it("returns passRate 0 for an arm with no outcomes", () => {
    const { canary, prod } = accumulate([])
    expect(canary).toEqual({ n: 0, passRate: 0 })
    expect(prod).toEqual({ n: 0, passRate: 0 })
  })

  it("promotes when the canary outperforms prod with enough sample", () => {
    const outcomes: Outcome[] = []
    for (let i = 0; i < 100; i += 1) outcomes.push({ arm: "canary", pass: i < 95 })
    for (let i = 0; i < 100; i += 1) outcomes.push({ arm: "prod", pass: i < 80 })
    const decision = routeAndDecide(outcomes)
    expect(decision.verdict).toBe("promote")
  })

  it("is inconclusive on insufficient sample", () => {
    const outcomes: Outcome[] = [
      { arm: "canary", pass: true },
      { arm: "prod", pass: false },
    ]
    expect(routeAndDecide(outcomes).verdict).toBe("inconclusive")
  })

  it("rolls back when the canary underperforms prod with enough sample", () => {
    const outcomes: Outcome[] = []
    for (let i = 0; i < 100; i += 1) outcomes.push({ arm: "canary", pass: i < 70 })
    for (let i = 0; i < 100; i += 1) outcomes.push({ arm: "prod", pass: i < 90 })
    expect(routeAndDecide(outcomes).verdict).toBe("rollback")
  })
})
