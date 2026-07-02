import { describe, expect, it } from "vitest"

import { checkJudgeIndependence, partitionCorpus } from "./independence"

describe("APL gating-judge independence (Phase-5 APL-5.2)", () => {
  it("independent only when provider, authorship, and label set all differ", () => {
    const gating = { provider: "anthropic", promptAuthorHash: "authorB", labelSetId: "held-out" }
    const optimized = { provider: "openai", promptAuthorHash: "authorA", labelSetId: "tuning" }
    expect(checkJudgeIndependence(gating, optimized).independent).toBe(true)
  })

  it("flags each shared dimension", () => {
    const j = { provider: "openai", promptAuthorHash: "a", labelSetId: "s" }
    const r = checkJudgeIndependence(j, j)
    expect(r.independent).toBe(false)
    expect(r.reasons).toHaveLength(3)
  })

  it("partitions the corpus into disjoint sealed/gate/tuning, deterministically", () => {
    const ids = Array.from({ length: 300 }, (_, i) => `c-${i}`)
    const a = partitionCorpus(ids, { sealedFraction: 0.2, gateFraction: 0.3 })
    const b = partitionCorpus(ids, { sealedFraction: 0.2, gateFraction: 0.3 })
    expect(a).toEqual(b) // deterministic
    expect([...a.sealed, ...a.gate, ...a.tuning].sort()).toEqual([...ids].sort()) // complete
    const overlap = a.sealed.filter((id) => a.gate.includes(id) || a.tuning.includes(id))
    expect(overlap).toEqual([]) // sealed never leaks into gate/tuning
    expect(a.sealed.length / ids.length).toBeGreaterThan(0.12)
    expect(a.sealed.length / ids.length).toBeLessThan(0.28)
  })
})
