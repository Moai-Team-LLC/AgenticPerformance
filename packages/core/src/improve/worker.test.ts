import { describe, expect, it } from "vitest"

import type { CanaryEvent } from "./canary"
import type { ImprovementRow } from "./worker"

import { inMemoryImprovementStore, sweepImprovements } from "./worker"

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
