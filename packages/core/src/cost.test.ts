import { describe, expect, it } from "vitest"

import { cacheAdjustedCostUsd, cacheSavingsRatio, rawCostUsd } from "./cost"

const pricing = { inputPerMTok: 3, outputPerMTok: 15 } // $/Mtok

describe("cache-adjusted cost (doctrine §5 / dev-env dogfooding export)", () => {
  it("prices cache-read at a deep discount vs fresh input", () => {
    expect(
      cacheAdjustedCostUsd({ freshInput: 1_000_000, cacheWrite: 0, cacheRead: 0, output: 0 }, pricing),
    ).toBeCloseTo(3, 6) // 1M fresh input @ $3/M
    expect(
      cacheAdjustedCostUsd({ freshInput: 0, cacheWrite: 0, cacheRead: 1_000_000, output: 0 }, pricing),
    ).toBeCloseTo(0.3, 6) // 10% of $3
  })

  it("prices cache-write at a premium", () => {
    expect(
      cacheAdjustedCostUsd({ freshInput: 0, cacheWrite: 1_000_000, cacheRead: 0, output: 0 }, pricing),
    ).toBeCloseTo(3 * 1.25, 6)
  })

  it("raw cost overstates badly when cache-read dominates (our 96.5% profile)", () => {
    const usage = { freshInput: 35_000, cacheWrite: 500_000, cacheRead: 10_000_000, output: 100_000 }
    const adj = cacheAdjustedCostUsd(usage, pricing)
    const raw = rawCostUsd(usage, pricing)
    expect(raw).toBeGreaterThan(adj * 4) // a cache-blind metric is >4x too high here
    expect(cacheSavingsRatio(usage, pricing)).toBeGreaterThan(0.7)
  })

  it("empty window → 0 savings, no divide-by-zero", () => {
    expect(
      cacheSavingsRatio({ freshInput: 0, cacheWrite: 0, cacheRead: 0, output: 0 }, pricing),
    ).toBe(0)
  })
})
