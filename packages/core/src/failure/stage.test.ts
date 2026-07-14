import { describe, expect, it } from "vitest"

import type { PipelineStage } from "./stage"

import { PIPELINE_STAGES, inferStage, isPipelineStage, stageRollup } from "./stage"

describe("APL staged failure attribution (eval-science delta, FR-FAIL-6/7)", () => {
  it("inferStage precedence: retrieval_miss outranks every other signal", () => {
    expect(
      inferStage({ retrievalRecallFailed: true, toolErrored: true, verificationRejected: true }),
    ).toBe("retrieval_miss")
    expect(inferStage({ retrievalRecallFailed: true })).toBe("retrieval_miss")
  })

  it("inferStage precedence: tool_error outranks verification_error", () => {
    expect(inferStage({ toolErrored: true, verificationRejected: true })).toBe("tool_error")
    expect(inferStage({ verificationRejected: true })).toBe("verification_error")
  })

  it("inferStage residual: no signal → reasoning_error (explicit false = absent)", () => {
    expect(inferStage({})).toBe("reasoning_error")
    expect(
      inferStage({ retrievalRecallFailed: false, toolErrored: false, verificationRejected: false }),
    ).toBe("reasoning_error")
  })

  it("stageRollup counts per stage and sorts desc", () => {
    const failures: { stage: PipelineStage }[] = [
      { stage: "tool_error" },
      { stage: "retrieval_miss" },
      { stage: "tool_error" },
      { stage: "reasoning_error" },
      { stage: "tool_error" },
      { stage: "reasoning_error" },
    ]
    expect(stageRollup(failures)).toEqual([
      { stage: "tool_error", count: 3 },
      { stage: "reasoning_error", count: 2 },
      { stage: "retrieval_miss", count: 1 },
    ])
  })

  it("stageRollup is stable on ties (PIPELINE_STAGES order) and input-order independent", () => {
    const tied = stageRollup([
      { stage: "verification_error" },
      { stage: "retrieval_miss" },
      { stage: "tool_error" },
    ])
    // All counts equal → declaration order of PIPELINE_STAGES, not input order.
    expect(tied).toEqual([
      { stage: "retrieval_miss", count: 1 },
      { stage: "tool_error", count: 1 },
      { stage: "verification_error", count: 1 },
    ])
    const shuffled = stageRollup([
      { stage: "tool_error" },
      { stage: "verification_error" },
      { stage: "retrieval_miss" },
    ])
    expect(shuffled).toEqual(tied)
  })

  it("stageRollup: empty input → empty rollup (no zero-count rows)", () => {
    expect(stageRollup([])).toEqual([])
  })

  it("isPipelineStage accepts exactly the four stages", () => {
    for (const stage of PIPELINE_STAGES) expect(isPipelineStage(stage)).toBe(true)
    expect(isPipelineStage("retrieval-miss")).toBe(false)
    expect(isPipelineStage("unknown")).toBe(false)
    expect(isPipelineStage("")).toBe(false)
    expect(isPipelineStage(42)).toBe(false)
    expect(isPipelineStage(null)).toBe(false)
    expect(isPipelineStage(undefined)).toBe(false)
  })

  it("isPipelineStage narrows unknown to PipelineStage", () => {
    const raw: unknown = "verification_error"
    if (isPipelineStage(raw)) {
      const stage: PipelineStage = raw // compiles only if the guard narrows
      expect(stage).toBe("verification_error")
    } else {
      expect.unreachable("guard must accept a valid stage")
    }
  })
})
