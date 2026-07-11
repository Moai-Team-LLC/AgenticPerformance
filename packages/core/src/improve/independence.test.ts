import { describe, expect, it } from "vitest"

import {
  checkGeneratorJudgeDecorrelation,
  checkGeneratorJudgeDecorrelationByModel,
  checkJudgeIndependence,
  partitionCorpus,
  providerFamily,
} from "./independence"

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

  it("flags a judge that shares the generator's model family, passes a different one (§1a)", () => {
    expect(checkGeneratorJudgeDecorrelation("openai", "openai").decorrelated).toBe(false)
    expect(checkGeneratorJudgeDecorrelation("openai", "anthropic")).toEqual({ decorrelated: true })
  })

  it("maps model ids (bare or gateway-prefixed) to a coarse family", () => {
    expect(providerFamily("gpt-4o-mini")).toBe("openai")
    expect(providerFamily("o3-mini")).toBe("openai")
    expect(providerFamily("openrouter/openai/gpt-4o")).toBe("openai")
    expect(providerFamily("claude-3-5-sonnet-20241022")).toBe("anthropic")
    expect(providerFamily("openrouter/anthropic/claude-3-5-sonnet")).toBe("anthropic")
    expect(providerFamily("openrouter/google/gemini-1.5-pro")).toBe("google")
    expect(providerFamily("meta-llama/llama-3.1-70b")).toBe("open-weights")
  })

  it("grounds the §1a check in the actual routed model ids, not hand-typed providers", () => {
    // gateway slugs that a hand-typed provider string could misreport
    expect(
      checkGeneratorJudgeDecorrelationByModel(
        "openrouter/openai/gpt-4o",
        "openrouter/google/gemini-1.5-pro",
      ),
    ).toEqual({ decorrelated: true })
    expect(
      checkGeneratorJudgeDecorrelationByModel("openrouter/openai/gpt-4o", "gpt-4o-mini")
        .decorrelated,
    ).toBe(false)
  })
})
