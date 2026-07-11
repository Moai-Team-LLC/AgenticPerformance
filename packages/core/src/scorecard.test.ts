import { describe, expect, it } from "vitest"

import type { ScorecardInput } from "./scorecard"

import { buildScorecard } from "./scorecard"

const base: ScorecardInput = {
  agentId: "research-agent",
  currentVersion: "v3",
  runs: [
    { agentVersion: "v1", caseSetHash: "old", passRate: 0.7, tsMs: 1 },
    { agentVersion: "v2", caseSetHash: "h1", passRate: 0.85, tsMs: 3 },
    { agentVersion: "v3", caseSetHash: "h1", passRate: 0.9, tsMs: 5 },
  ],
  clusters: [
    { label: "schema", count: 3, trend: "flat" },
    { label: "timeout", count: 9, trend: "up" },
  ],
  budget: { costUsd: 10, latencyMs: 2000 },
  actual: { costUsd: 12, latencyMs: 1500 },
  escalationRate: 0.05,
  toolCallSuccessRate: 0.97,
  pendingApprovals: 2,
  l3Eligible: false,
  verifiedOutcomes: 4,
}

describe("APL scorecard read-model (Phase-3 APL-3.7)", () => {
  it("filters the score curve to the current frozen case set and sorts by time", () => {
    const sc = buildScorecard(base)
    // v1 was on a different case set ("old") → excluded so growth ≠ regression
    expect(sc.scoreCurve.map((r) => r.agentVersion)).toEqual(["v2", "v3"])
  })

  it("ranks clusters by count and flags over-budget metrics", () => {
    const sc = buildScorecard(base)
    expect(sc.topClusters[0]?.label).toBe("timeout")
    const cost = sc.budgetVsActual.find((b) => b.metric === "cost")
    const latency = sc.budgetVsActual.find((b) => b.metric === "latency")
    expect(cost?.overBudget).toBe(true) // 12 > 10
    expect(latency?.overBudget).toBe(false) // 1500 < 2000
  })

  it("passes through the headless control-plane fields", () => {
    const sc = buildScorecard(base)
    expect(sc.pendingApprovals).toBe(2)
    expect(sc.toolCallSuccessRate).toBe(0.97)
    expect(sc.l3Eligible).toBe(false)
  })

  it("computes cost per verified outcome = actual cost / verified count (§5)", () => {
    const sc = buildScorecard(base) // actual.costUsd 12 / verifiedOutcomes 4
    expect(sc.costPerVerifiedOutcome).toBe(3)
  })

  it("returns null cost-per-verified rather than dividing by zero when none passed", () => {
    const sc = buildScorecard({ ...base, verifiedOutcomes: 0 })
    expect(sc.costPerVerifiedOutcome).toBeNull()
  })
})
