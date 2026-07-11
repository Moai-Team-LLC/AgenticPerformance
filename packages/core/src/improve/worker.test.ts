import { describe, expect, it } from "vitest"

import type { CanaryEvent } from "./canary"
import type { LoopBudget } from "./loop-budget"
import type { ImprovementRow } from "./worker"

import { guardedSweep, inMemoryImprovementStore, sweepImprovements } from "./worker"

const budget = (over: Partial<LoopBudget> = {}): LoopBudget => ({
  maxIterations: 1000,
  tokenBudget: 1_000_000,
  costCapUsd: 1000,
  timeoutMs: 600_000,
  escalateAfterVerifyFails: 100,
  ...over,
})

describe("APL improvement sweep (Phase-5 APL-5.3)", () => {
  it("advances a due canary row on an ab_promote decision, then is idempotent", async () => {
    const rows: ImprovementRow[] = [{ id: "imp-1", status: "canary" }]
    const store = inMemoryImprovementStore(rows)
    const resolve = (): CanaryEvent => "ab_promote"

    const first = await sweepImprovements(store, resolve, 0)
    expect(first).toEqual({ advanced: 1, skipped: 0 })
    expect(rows[0]?.status).toBe("deployed")

    const second = await sweepImprovements(store, resolve, 0)
    expect(second).toEqual({ advanced: 0, skipped: 1 })
    expect(rows[0]?.status).toBe("deployed")
  })

  it("skips a row with no resolved event", async () => {
    const rows: ImprovementRow[] = [{ id: "imp-1", status: "canary" }]
    const store = inMemoryImprovementStore(rows)

    const r = await sweepImprovements(store, () => null, 0)
    expect(r).toEqual({ advanced: 0, skipped: 1 })
    expect(rows[0]?.status).toBe("canary")
  })

  it("skips an illegal transition without mutating the row", async () => {
    const rows: ImprovementRow[] = [{ id: "imp-1", status: "proposed" }]
    const store = inMemoryImprovementStore(rows)

    const r = await sweepImprovements(store, () => "ab_promote", 0)
    expect(r).toEqual({ advanced: 0, skipped: 1 })
    expect(rows[0]?.status).toBe("proposed")
  })

  it("counts a mix of advanced and skipped rows in one sweep", async () => {
    const rows: ImprovementRow[] = [
      { id: "advance-me", status: "canary" },
      { id: "illegal", status: "proposed" },
      { id: "no-event", status: "canary" },
    ]
    const store = inMemoryImprovementStore(rows)
    const resolve = (row: ImprovementRow): CanaryEvent | null =>
      row.id === "no-event" ? null : "ab_promote"

    const r = await sweepImprovements(store, resolve, 0)
    expect(r).toEqual({ advanced: 1, skipped: 2 })
    expect(rows.find((x) => x.id === "advance-me")?.status).toBe("deployed")
    expect(rows.find((x) => x.id === "illegal")?.status).toBe("proposed")
    expect(rows.find((x) => x.id === "no-event")?.status).toBe("canary")
  })
})

describe("APL guarded sweep — loop fail-block (Verified-Autonomy §2)", () => {
  it("advances all rows under a permissive budget (no stop)", async () => {
    const rows: ImprovementRow[] = [
      { id: "a", status: "canary" },
      { id: "b", status: "canary" },
    ]
    const store = inMemoryImprovementStore(rows)
    const r = await guardedSweep(store, () => "ab_promote", 0, budget())
    expect(r).toEqual({ advanced: 2, skipped: 0 })
  })

  it("stops fail-closed at max_iterations, leaving later rows untouched", async () => {
    const rows: ImprovementRow[] = [
      { id: "a", status: "canary" },
      { id: "b", status: "canary" },
      { id: "c", status: "canary" },
    ]
    const store = inMemoryImprovementStore(rows)
    const r = await guardedSweep(store, () => "ab_promote", 0, budget({ maxIterations: 1 }))
    expect(r).toEqual({ advanced: 1, skipped: 0, stopped: "max_iterations" })
    expect(rows.find((x) => x.id === "a")?.status).toBe("deployed")
    expect(rows.find((x) => x.id === "b")?.status).toBe("canary")
    expect(rows.find((x) => x.id === "c")?.status).toBe("canary")
  })

  it("halts immediately on an engaged kill switch without any write", async () => {
    const rows: ImprovementRow[] = [{ id: "a", status: "canary" }]
    const store = inMemoryImprovementStore(rows)
    const r = await guardedSweep(store, () => "ab_promote", 0, budget(), () => true)
    expect(r).toEqual({ advanced: 0, skipped: 0, stopped: "kill_switch" })
    expect(rows[0]?.status).toBe("canary")
  })

  it("escalates after N consecutive verify fails (reject/ab_rollback)", async () => {
    const rows: ImprovementRow[] = [
      { id: "a", status: "proposed" },
      { id: "b", status: "proposed" },
      { id: "c", status: "proposed" },
    ]
    const store = inMemoryImprovementStore(rows)
    const r = await guardedSweep(store, () => "reject", 0, budget({ escalateAfterVerifyFails: 2 }))
    expect(r).toEqual({ advanced: 2, skipped: 0, stopped: "escalate_verify_fails" })
    expect(rows.find((x) => x.id === "c")?.status).toBe("proposed")
  })
})
