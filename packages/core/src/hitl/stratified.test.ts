import { describe, expect, it } from "vitest"

import { stratifiedReviewSample } from "./stratified"

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)

describe("APL stratified review sampling (FR-HITL-2)", () => {
  it("includes ALL escalations", () => {
    const escalations = ids("e", 7)
    const sample = stratifiedReviewSample({
      escalations,
      routineTraffic: ids("r", 20),
      ratio: { escalation: 2, random: 1 },
    })
    expect(sample.escalated).toEqual(escalations)
  })

  it("sizes the random arm as ceil(escalations * random/escalation) — the de-biasing arm", () => {
    const sample = stratifiedReviewSample({
      escalations: ids("e", 4),
      routineTraffic: ids("r", 20),
      ratio: { escalation: 2, random: 1 },
    })
    expect(sample.random).toHaveLength(2) // ceil(4 * 1/2)

    const odd = stratifiedReviewSample({
      escalations: ids("e", 5),
      routineTraffic: ids("r", 20),
      ratio: { escalation: 2, random: 1 },
    })
    expect(odd.random).toHaveLength(3) // ceil(5 * 1/2)
  })

  it("treats an escalation part <= 0 as 1 (division-by-zero guard)", () => {
    const sample = stratifiedReviewSample({
      escalations: ids("e", 3),
      routineTraffic: ids("r", 20),
      ratio: { escalation: 0, random: 1 },
    })
    expect(sample.random).toHaveLength(3) // ceil(3 * 1/1)
  })

  it("is deterministic — same traffic window, same sample (hash-based, no RNG)", () => {
    const input = {
      escalations: ids("e", 6),
      routineTraffic: ids("r", 50),
      ratio: { escalation: 1, random: 1 },
    }
    const first = stratifiedReviewSample(input)
    const second = stratifiedReviewSample(input)
    expect(second).toEqual(first)
    expect(first.random).toHaveLength(6)
  })

  it("never draws duplicates or already-escalated ids into the random arm", () => {
    const sample = stratifiedReviewSample({
      escalations: ["e0", "e1"],
      routineTraffic: ["r0", "r0", "r1", "e0", "r2", "r1"],
      ratio: { escalation: 1, random: 10 }, // target 20 >> pool, drains the whole pool
    })
    expect([...sample.random].sort()).toEqual(["r0", "r1", "r2"])
    expect(new Set(sample.random).size).toBe(sample.random.length)
  })

  it("caps the random arm at the routine pool size", () => {
    const sample = stratifiedReviewSample({
      escalations: ids("e", 5),
      routineTraffic: ids("r", 2),
      ratio: { escalation: 1, random: 2 }, // target ceil(5*2) = 10 > pool 2
    })
    expect(sample.random).toHaveLength(2)
  })

  it("yields an empty random arm when there are no escalations", () => {
    const sample = stratifiedReviewSample({
      escalations: [],
      routineTraffic: ids("r", 10),
      ratio: { escalation: 1, random: 1 },
    })
    expect(sample.escalated).toEqual([])
    expect(sample.random).toEqual([])
  })
})
