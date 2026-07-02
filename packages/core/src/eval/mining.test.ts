import { describe, expect, it } from "vitest"

import type { MinedCase } from "./mining"

import { composition, excludeConsumed, splitTrainGate, withinFailureCap } from "./mining"

const mk = (id: string, outcome: MinedCase["outcome"]): MinedCase => ({
  id,
  outcome,
  source: "mined",
})

describe("APL mining hygiene (Phase-2 APL-2.4)", () => {
  it("computes composition and failure fraction", () => {
    const c = composition([
      mk("1", "success"),
      mk("2", "fail"),
      mk("3", "escalated"),
      mk("4", "success"),
    ])
    expect(c.total).toBe(4)
    expect(c.failureFraction).toBe(0.5)
    expect(c.byOutcome.success).toBe(2)
  })

  it("enforces a failure-fraction cap", () => {
    const cases = [mk("1", "fail"), mk("2", "fail"), mk("3", "success")]
    expect(withinFailureCap(cases, 0.5)).toBe(false)
    expect(withinFailureCap(cases, 0.7)).toBe(true)
  })

  it("splits train/gate disjointly, deterministically, and completely", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `case-${i}`)
    const a = splitTrainGate(ids, 0.3)
    const b = splitTrainGate(ids, 0.3)
    expect(a).toEqual(b) // deterministic
    expect([...a.train, ...a.gate].sort()).toEqual([...ids].sort()) // complete
    expect(a.train.some((id) => a.gate.includes(id))).toBe(false) // disjoint
    expect(a.gate.length / ids.length).toBeGreaterThan(0.2)
    expect(a.gate.length / ids.length).toBeLessThan(0.4)
  })

  it("excludes improver-consumed ids from a scoring set (no leakage)", () => {
    expect(excludeConsumed(["a", "b", "c", "d"], ["b", "d"])).toEqual(["a", "c"])
  })
})
