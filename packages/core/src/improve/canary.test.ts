import { describe, expect, it } from "vitest"

import { abDecision, advance } from "./canary"

describe("APL canary orchestration (Phase-5 APL-5.3/5.4)", () => {
  it("advance is idempotent and refuses illegal transitions", () => {
    expect(advance("proposed", "approve")).toEqual({ status: "approved", changed: true })
    expect(advance("canary", "start_canary").changed).toBe(false) // already at target
    const illegal = advance("proposed", "ab_promote")
    expect(illegal.changed).toBe(false)
    expect(illegal.reason).toContain("illegal transition")
  })

  it("advances through the canary → deploy path", () => {
    expect(advance("approved", "start_canary").status).toBe("canary")
    expect(advance("canary", "ab_promote").status).toBe("deployed")
    expect(advance("canary", "ab_rollback").status).toBe("rolled_back")
  })

  it("A/B: promote on a real gain, rollback on a real drop, else inconclusive", () => {
    expect(
      abDecision({ canary: { passRate: 0.95, n: 200 }, prod: { passRate: 0.9, n: 200 } }).verdict,
    ).toBe("promote")
    expect(
      abDecision({ canary: { passRate: 0.8, n: 200 }, prod: { passRate: 0.9, n: 200 } }).verdict,
    ).toBe("rollback")
    expect(
      abDecision({ canary: { passRate: 0.905, n: 200 }, prod: { passRate: 0.9, n: 200 } }).verdict,
    ).toBe("inconclusive")
  })

  it("A/B is inconclusive below the minimum sample (no decision on noise)", () => {
    const d = abDecision({
      canary: { passRate: 1, n: 10 },
      prod: { passRate: 0.5, n: 10 },
      minSample: 100,
    })
    expect(d.verdict).toBe("inconclusive")
    expect(d.reason).toContain("insufficient sample")
  })
})
