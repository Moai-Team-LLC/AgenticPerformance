import { describe, expect, it } from "vitest"

import type { ImprovementRecord } from "./ledger"

import { canTransition, isWritable, validateImprovement } from "./ledger"

const base: ImprovementRecord = {
  versionFrom: "v1",
  versionTo: "v2",
  hypothesis: "tighten the abstain instruction",
  status: "proposed",
  author: "human",
}

describe("APL improvement ledger (Phase-4 APL-4.5)", () => {
  it("a human-authored record needs no auto-justification", () => {
    expect(validateImprovement(base)).toEqual([])
    expect(isWritable(base)).toBe(true)
  })

  it("a judge-gated record is UN-writable without full justification", () => {
    const errors = validateImprovement({ ...base, author: "judge-gated" })
    expect(errors.length).toBe(7)
    expect(errors.some((e) => e.includes("calibrationSnapshot"))).toBe(true)
    expect(isWritable({ ...base, author: "judge-gated" })).toBe(false)
  })

  it("a fully-justified judge-gated record is writable", () => {
    const full: ImprovementRecord = {
      ...base,
      author: "judge-gated",
      patchDiff: { field: "few_shot", value: "..." },
      evalRunId: "run-1",
      perModeDelta: { schema: 0.02 },
      judgeVersion: "j-abc",
      calibrationSnapshot: { tpr: 0.9, tnr: 0.91, labelCount: 120 },
      sourceTraceRefs: ["trace-9"],
      canaryAbOutcome: "promoted",
    }
    expect(isWritable(full)).toBe(true)
  })

  it("enforces the lifecycle state machine", () => {
    expect(canTransition("proposed", "approved")).toBe(true)
    expect(canTransition("proposed", "deployed")).toBe(false)
    expect(canTransition("canary", "rolled_back")).toBe(true)
    expect(canTransition("rejected", "approved")).toBe(false)
  })
})
