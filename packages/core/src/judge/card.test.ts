import { describe, expect, it } from "vitest"

import { canGate, computeBrier, computeEce, deriveStatus, swapConsistency } from "./card"

const DAY_MS = 86_400_000

describe("APL Judge Card — ECE / Brier / swap-consistency / status (FR-JUDGE-5/6)", () => {
  it("ECE on a hand-computable 2-bin example", () => {
    // Bin [0, 0.5): conf 0.3, 0.3 — one correct -> |0.3 - 0.5| = 0.2, weight 2/4
    // Bin [0.5, 1]: conf 0.9, 0.9 — both correct -> |0.9 - 1.0| = 0.1, weight 2/4
    // ECE = 0.5 * 0.2 + 0.5 * 0.1 = 0.15
    const predictions = [
      { confidence: 0.3, correct: true },
      { confidence: 0.3, correct: false },
      { confidence: 0.9, correct: true },
      { confidence: 0.9, correct: true },
    ]
    expect(computeEce(predictions, 2)).toBeCloseTo(0.15, 10)
  })

  it("ECE: empty input -> 0; confidence 1.0 lands in the top bin, perfectly calibrated -> 0", () => {
    expect(computeEce([])).toBe(0)
    expect(computeEce([{ confidence: 1, correct: true }])).toBe(0)
  })

  it("Brier: known value, perfect predictions -> 0, empty -> 0", () => {
    // ((0.8 - 1)^2 + (0.4 - 0)^2) / 2 = (0.04 + 0.16) / 2 = 0.1
    const predictions = [
      { confidence: 0.8, correct: true },
      { confidence: 0.4, correct: false },
    ]
    expect(computeBrier(predictions)).toBeCloseTo(0.1, 10)
    expect(
      computeBrier([
        { confidence: 1, correct: true },
        { confidence: 0, correct: false },
      ]),
    ).toBe(0)
    expect(computeBrier([])).toBe(0)
  })

  it("swap-consistency: a flipped pair is position bias, empty -> 0", () => {
    // Second pair flips the winner with the presentation order -> position bias.
    const pairs = [
      { forward: "A", backward: "A" },
      { forward: "A", backward: "B" },
    ] as const
    const consistency = swapConsistency(pairs)
    expect(consistency).toBe(0.5)
    expect(1 - consistency).toBe(0.5) // position bias
    expect(
      swapConsistency([
        { forward: "B", backward: "B" },
        { forward: "A", backward: "A" },
      ]),
    ).toBe(1)
    expect(swapConsistency([])).toBe(0)
  })

  it("deriveStatus: uncalibrated without an anchor sample or below a declared bar", () => {
    const base = {
      hasAnchorSample: true,
      meetsAccuracyBar: true,
      meetsEceBar: true,
      lastCalibratedMs: 0,
      nowMs: 10 * DAY_MS,
      recencyWindowDays: 90,
    }
    expect(deriveStatus({ ...base, hasAnchorSample: false })).toBe("uncalibrated")
    expect(deriveStatus({ ...base, meetsAccuracyBar: false })).toBe("uncalibrated")
    expect(deriveStatus({ ...base, meetsEceBar: false })).toBe("uncalibrated")
  })

  it("deriveStatus: stale past the recency window, calibrated within it", () => {
    const base = {
      hasAnchorSample: true,
      meetsAccuracyBar: true,
      meetsEceBar: true,
      lastCalibratedMs: 0,
      recencyWindowDays: 90,
    }
    expect(deriveStatus({ ...base, nowMs: 91 * DAY_MS })).toBe("stale")
    expect(deriveStatus({ ...base, nowMs: 90 * DAY_MS })).toBe("calibrated") // window edge inclusive
    expect(deriveStatus({ ...base, nowMs: 10 * DAY_MS })).toBe("calibrated")
    // Below-bar wins over stale — either way it cannot gate.
    expect(deriveStatus({ ...base, nowMs: 91 * DAY_MS, meetsEceBar: false })).toBe("uncalibrated")
  })

  it("canGate: true ONLY for calibrated (FR-JUDGE-6 Cycle of Trust)", () => {
    expect(canGate("calibrated")).toBe(true)
    expect(canGate("uncalibrated")).toBe(false)
    expect(canGate("stale")).toBe(false)
  })
})
