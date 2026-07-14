import { describe, expect, it } from "vitest"

import type { ReviewQueueItem } from "./reviewer-ops"

import { nextSamplingIntensity, reviewerOps } from "./reviewer-ops"

const NOW = 1_000_000

describe("APL reviewer ops — dashboard metrics (FR-HITL-3)", () => {
  it("returns all-zero metrics on an empty queue (no divide-by-zero)", () => {
    expect(reviewerOps([], NOW)).toEqual({
      queueDepth: 0,
      maxAgeMs: 0,
      slaCompliance: 0,
      overrideRate: 0,
      reviewerJudgeAgreement: 0,
    })
  })

  it("counts pending items and ages the oldest against now", () => {
    const items: ReviewQueueItem[] = [
      { enqueuedAtMs: NOW - 5_000, slaMs: 60_000 },
      { enqueuedAtMs: NOW - 30_000, slaMs: 60_000 },
      { enqueuedAtMs: NOW - 100_000, decidedAtMs: NOW - 90_000, slaMs: 60_000 },
    ]
    const report = reviewerOps(items, NOW)
    expect(report.queueDepth).toBe(2)
    expect(report.maxAgeMs).toBe(30_000)
  })

  it("computes SLA-compliance over decided items only, 0 when none decided", () => {
    const decided: ReviewQueueItem[] = [
      { enqueuedAtMs: 0, decidedAtMs: 50_000, slaMs: 60_000 }, // within SLA
      { enqueuedAtMs: 0, decidedAtMs: 90_000, slaMs: 60_000 }, // breached
      { enqueuedAtMs: 0, slaMs: 60_000 }, // pending — excluded even though its age exceeds the SLA
    ]
    expect(reviewerOps(decided, NOW).slaCompliance).toBe(0.5)
    expect(reviewerOps([{ enqueuedAtMs: 0, slaMs: 1 }], NOW).slaCompliance).toBe(0)
  })

  it("computes override-rate over decided items carrying the flag, 0 when none do", () => {
    const items: ReviewQueueItem[] = [
      { enqueuedAtMs: 0, decidedAtMs: 1, slaMs: 10, overridden: true },
      { enqueuedAtMs: 0, decidedAtMs: 1, slaMs: 10, overridden: false },
      { enqueuedAtMs: 0, decidedAtMs: 1, slaMs: 10, overridden: false },
      { enqueuedAtMs: 0, decidedAtMs: 1, slaMs: 10 }, // flag absent — excluded from the denominator
    ]
    expect(reviewerOps(items, NOW).overrideRate).toBeCloseTo(1 / 3)
    expect(reviewerOps([{ enqueuedAtMs: 0, decidedAtMs: 1, slaMs: 10 }], NOW).overrideRate).toBe(0)
  })

  it("computes reviewer–judge agreement over decided items carrying the flag, 0 when none do", () => {
    const items: ReviewQueueItem[] = [
      { enqueuedAtMs: 0, decidedAtMs: 1, slaMs: 10, agreesWithJudge: true },
      { enqueuedAtMs: 0, decidedAtMs: 1, slaMs: 10, agreesWithJudge: true },
      { enqueuedAtMs: 0, decidedAtMs: 1, slaMs: 10, agreesWithJudge: false },
      { enqueuedAtMs: 0, decidedAtMs: 1, slaMs: 10 },
    ]
    expect(reviewerOps(items, NOW).reviewerJudgeAgreement).toBeCloseTo(2 / 3)
    expect(
      reviewerOps([{ enqueuedAtMs: 0, decidedAtMs: 1, slaMs: 10 }], NOW).reviewerJudgeAgreement,
    ).toBe(0)
  })
})

describe("APL sampling intensity — Cycle of Trust ladder (FR-HITL-3)", () => {
  it("earned trust halves intensity, descending 100% review toward the 2% floor", () => {
    let intensity = 1.0
    const rungs: number[] = []
    for (let i = 0; i < 8; i += 1) {
      intensity = nextSamplingIntensity(intensity, { regression: false, earnedTrust: true })
      rungs.push(intensity)
    }
    expect(rungs[0]).toBe(0.5)
    expect(rungs[1]).toBe(0.25)
    expect(rungs.at(-1)).toBe(0.02) // spot-check floor — never descends below
  })

  it("clamps a trust step that would undershoot the floor", () => {
    expect(nextSamplingIntensity(0.03, { regression: false, earnedTrust: true })).toBe(0.02)
  })

  it("regression multiplies by 4 (auto-re-escalation), capped at the ceiling", () => {
    expect(nextSamplingIntensity(0.1, { regression: true, earnedTrust: false })).toBeCloseTo(0.4)
    expect(nextSamplingIntensity(0.5, { regression: true, earnedTrust: false })).toBe(1.0)
  })

  it("regression WINS when both flags are set — trust never masks a regression", () => {
    expect(nextSamplingIntensity(0.1, { regression: true, earnedTrust: true })).toBeCloseTo(0.4)
  })

  it("leaves intensity unchanged (within bounds) when neither flag is set", () => {
    expect(nextSamplingIntensity(0.25, { regression: false, earnedTrust: false })).toBe(0.25)
  })

  it("respects custom floor/ceiling/step", () => {
    expect(
      nextSamplingIntensity(0.4, {
        regression: false,
        earnedTrust: true,
        step: 4,
        floor: 0.05,
      }),
    ).toBe(0.1)
    expect(
      nextSamplingIntensity(0.4, { regression: true, earnedTrust: false, ceiling: 0.8 }),
    ).toBe(0.8)
  })
})
