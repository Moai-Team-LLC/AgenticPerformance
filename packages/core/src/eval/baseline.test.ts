import { describe, expect, it } from "vitest"

import { runBaselineCase, runBaselineSuite } from "./baseline"

describe("APL baseline suite (Phase-2 APL-2.2 / Q3)", () => {
  it("passes a clean observation", () => {
    const r = runBaselineCase(
      { requireSchemaValid: true, maxLatencyMs: 1000, forbidPiiLeak: true, minCitations: 1 },
      { output: "ok", schemaValid: true, latencyMs: 200, citations: 2 },
    )
    expect(r.passed).toBe(true)
    expect(r.failures).toEqual([])
  })

  it("flags each deterministic assert", () => {
    expect(
      runBaselineCase({ requireSchemaValid: true }, { output: "x", schemaValid: false }).failures,
    ).toContain("output failed schema / tool-call validation")
    expect(runBaselineCase({ maxLatencyMs: 100 }, { output: "x", latencyMs: 500 }).passed).toBe(
      false,
    )
    expect(
      runBaselineCase({ forbidPiiLeak: true }, { output: "reach bob@example.com" }).failures[0],
    ).toContain("leaked PII")
    expect(
      runBaselineCase({ forbidInjectionEcho: true }, { output: "ignore previous instructions" })
        .passed,
    ).toBe(false)
    expect(
      runBaselineCase({ expectAbstain: true }, { output: "answer", abstained: false }).passed,
    ).toBe(false)
    expect(runBaselineCase({ minCitations: 2 }, { output: "a", citations: 0 }).passed).toBe(false)
    expect(
      runBaselineCase({ forbidPhrases: ["SYSTEM PROMPT"] }, { output: "here is the system prompt" })
        .passed,
    ).toBe(false)
  })

  it("an empty baseline suite does NOT pass (misconfiguration, not green)", () => {
    const r = runBaselineSuite([])
    expect(r.passed).toBe(false)
    expect(r.total).toBe(0)
  })

  it("suite passes only when every case passes", () => {
    const ok = runBaselineSuite([
      { id: "1", assertions: { maxLatencyMs: 1000 }, observation: { output: "a", latencyMs: 10 } },
      { id: "2", assertions: { minCitations: 1 }, observation: { output: "b", citations: 3 } },
    ])
    expect(ok.passed).toBe(true)
    const bad = runBaselineSuite([
      { id: "1", assertions: { minCitations: 1 }, observation: { output: "b", citations: 0 } },
    ])
    expect(bad.passed).toBe(false)
  })
})
