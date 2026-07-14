import { describe, expect, it } from "vitest"

import type { GoldenProvenance } from "./provenance"

import { canBackReleaseGate, isUnanchored, rebaselineTargets } from "./provenance"

const provenance = (overrides: Partial<GoldenProvenance> = {}): GoldenProvenance => ({
  rubricVersion: "2.1",
  labeler: "human",
  labelDateMs: 1_750_000_000_000,
  origin: "authored",
  ...overrides,
})

describe("APL ground-truth provenance (Eval-Science FR-EVAL-7/8)", () => {
  it("flags an empty set as unanchored (never a green anchor)", () => {
    expect(isUnanchored([])).toBe(true)
    expect(canBackReleaseGate([])).toBe(false)
  })

  it("flags the set as unanchored when ANY item lacks provenance", () => {
    const items = [{ provenance: provenance() }, {}, { provenance: provenance() }]
    expect(isUnanchored(items)).toBe(true)
    expect(canBackReleaseGate(items)).toBe(false)
  })

  it("a fully anchored set can back a Loop-License / release gate", () => {
    const items = [
      { provenance: provenance() },
      { provenance: provenance({ labeler: "model:gpt-4o-2024-11-20", origin: "adjudicated" }) },
      {
        provenance: provenance({
          labeler: "hybrid",
          origin: "review_capture",
          agreement: { raters: 2, kappa: 0.78 },
        }),
      },
    ]
    expect(isUnanchored(items)).toBe(false)
    expect(canBackReleaseGate(items)).toBe(true)
  })

  it("rebaselineTargets picks only judges whose Judge Card carries the OLD rubric version", () => {
    const targets = rebaselineTargets(
      { rubricVersion: "2.2", judgesUsingRubric: ["j-b", "j-a", "j-c"] },
      [
        { judgeId: "j-a", rubricVersion: "2.1" }, // stale → re-baseline
        { judgeId: "j-b", rubricVersion: "2.2" }, // already on the new version
        { judgeId: "j-d", rubricVersion: "2.1" }, // not using this rubric
      ],
    )
    expect(targets).toEqual(["j-a"])
  })

  it("rebaselineTargets omits judges without a Judge Card (uncalibrated, not a re-baseline)", () => {
    const targets = rebaselineTargets({ rubricVersion: "3.0", judgesUsingRubric: ["j-x"] }, [])
    expect(targets).toEqual([])
  })

  it("rebaselineTargets is deterministic: deduplicated, sorted order", () => {
    const targets = rebaselineTargets(
      { rubricVersion: "2.2", judgesUsingRubric: ["j-c", "j-a", "j-b"] },
      [
        { judgeId: "j-c", rubricVersion: "2.0" },
        { judgeId: "j-a", rubricVersion: "2.1" },
        { judgeId: "j-a", rubricVersion: "2.0" },
        { judgeId: "j-b", rubricVersion: "1.9" },
      ],
    )
    expect(targets).toEqual(["j-a", "j-b", "j-c"])
  })
})
