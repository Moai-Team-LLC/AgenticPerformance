import { describe, expect, it } from "vitest"

import { Apl } from "./contract"
import { shouldHeadSample, tailKeepDecision } from "./sampling"

describe("APL sampling (Phase-1 APL-1.5)", () => {
  it("honours the head-sampling ratio bounds and is deterministic", () => {
    expect(shouldHeadSample("t-1", 0)).toBe(false)
    expect(shouldHeadSample("t-1", 1)).toBe(true)
    expect(shouldHeadSample("t-abc", 0.5)).toBe(shouldHeadSample("t-abc", 0.5))
  })

  it("approximates the ratio over many trace ids", () => {
    const n = 4000
    let kept = 0
    for (let i = 0; i < n; i += 1) if (shouldHeadSample(`trace-${i}`, 0.25)) kept += 1
    expect(kept / n).toBeGreaterThan(0.2)
    expect(kept / n).toBeLessThan(0.3)
  })

  it("tail-keeps errors, keep-hints and slow traces; drops the rest", () => {
    expect(tailKeepDecision({ [Apl.KEEP]: true }, 5)).toBe(true)
    expect(tailKeepDecision({ [Apl.OUTCOME]: "fail" }, 5)).toBe(true)
    expect(tailKeepDecision({ [Apl.OUTCOME]: "escalated" }, 5)).toBe(true)
    expect(tailKeepDecision({ [Apl.OUTCOME]: "success" }, 20_000, { slowMs: 10_000 })).toBe(true)
    expect(tailKeepDecision({ [Apl.OUTCOME]: "success" }, 5)).toBe(false)
  })
})
