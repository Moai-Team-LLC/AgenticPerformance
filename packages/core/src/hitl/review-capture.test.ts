import { describe, expect, it } from "vitest"

import type { ReviewCapture } from "./review-capture"

import { toGoldenCandidate } from "./review-capture"

describe("APL review capture — human decisions as golden candidates (FR-HITL-1)", () => {
  const capture: ReviewCapture = {
    itemRef: "trace-42",
    decision: "override",
    reviewer: "alex",
    rubricVersion: "2.1",
    atMs: 1_700_000_000_000,
  }

  it("produces provenance with origin review_capture and a human labeler", () => {
    const candidate = toGoldenCandidate(capture)
    expect(candidate.provenance.origin).toBe("review_capture")
    expect(candidate.provenance.labeler).toBe("human")
  })

  it("binds the label to the rubric version and decision timestamp", () => {
    const candidate = toGoldenCandidate(capture)
    expect(candidate.provenance.rubricVersion).toBe("2.1")
    expect(candidate.provenance.labelDateMs).toBe(1_700_000_000_000)
  })

  it("carries the item ref and uses the decision as the label", () => {
    const candidate = toGoldenCandidate(capture)
    expect(candidate.itemRef).toBe("trace-42")
    expect(candidate.label).toBe("override")
    expect(toGoldenCandidate({ ...capture, decision: "approve" }).label).toBe("approve")
    expect(toGoldenCandidate({ ...capture, decision: "reject" }).label).toBe("reject")
  })
})
