import { describe, expect, it } from "vitest"

import type { LoopBudget } from "./loop-budget"

import { createBudgetTracker } from "./loop-budget"

const budget = (over: Partial<LoopBudget> = {}): LoopBudget => ({
  maxIterations: 100,
  tokenBudget: 1_000_000,
  costCapUsd: 100,
  timeoutMs: 60_000,
  escalateAfterVerifyFails: 3,
  ...over,
})

describe("APL loop-budget tracker (Verified-Autonomy §2)", () => {
  it("returns null while within every ceiling", () => {
    const t = createBudgetTracker(budget(), 0)
    t.recordIteration({ tokens: 10, costUsd: 1 })
    expect(t.shouldStop(1000)).toBeNull()
  })

  it("stops at max_iterations once the cap is reached", () => {
    const t = createBudgetTracker(budget({ maxIterations: 2 }), 0)
    t.recordIteration()
    expect(t.shouldStop(0)).toBeNull()
    t.recordIteration()
    expect(t.shouldStop(0)).toBe("max_iterations")
  })

  it("stops on cost_cap and token_budget breaches", () => {
    const cost = createBudgetTracker(budget({ costCapUsd: 5 }), 0)
    cost.recordIteration({ costUsd: 6 })
    expect(cost.shouldStop(0)).toBe("cost_cap")

    const tok = createBudgetTracker(budget({ tokenBudget: 100 }), 0)
    tok.recordIteration({ tokens: 101 })
    expect(tok.shouldStop(0)).toBe("token_budget")
  })

  it("stops on timeout relative to the injected start clock", () => {
    const t = createBudgetTracker(budget({ timeoutMs: 500 }), 1_000)
    expect(t.shouldStop(1_400)).toBeNull()
    expect(t.shouldStop(1_600)).toBe("timeout")
  })

  it("escalates after N consecutive verify fails, and a pass resets the streak", () => {
    const t = createBudgetTracker(budget({ escalateAfterVerifyFails: 3 }), 0)
    t.recordVerifyFail()
    t.recordVerifyFail()
    expect(t.shouldStop(0)).toBeNull()
    t.recordVerifyPass() // resets
    t.recordVerifyFail()
    t.recordVerifyFail()
    expect(t.shouldStop(0)).toBeNull()
    t.recordVerifyFail()
    expect(t.shouldStop(0)).toBe("escalate_verify_fails")
  })

  it("re-reads the kill switch on every check (flip mid-run halts)", () => {
    let killed = false
    const t = createBudgetTracker(budget(), 0, () => killed)
    expect(t.shouldStop(0)).toBeNull()
    killed = true
    expect(t.shouldStop(0)).toBe("kill_switch")
  })

  it("kill switch takes precedence over other breaches", () => {
    const t = createBudgetTracker(budget({ maxIterations: 1 }), 0, () => true)
    t.recordIteration()
    expect(t.shouldStop(0)).toBe("kill_switch")
  })
})
