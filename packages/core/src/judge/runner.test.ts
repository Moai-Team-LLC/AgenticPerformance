import { describe, expect, it } from "vitest"

import type { AplChat } from "../ai"

import { calibrateWithJudge, runJudge, type JudgeExample } from "./runner"

/** Fake judge: PASS for inputs mentioning "good", FAIL otherwise. */
const fakeChat: AplChat = async ({ prompt }) => (/good/i.test(prompt) ? "PASS" : "FAIL")

const examples: readonly JudgeExample[] = [
  { id: "a", input: "a good answer", expected: true },
  { id: "b", input: "a good citation", expected: true },
  { id: "c", input: "a bad answer", expected: false },
  { id: "d", input: "a bad citation", expected: false },
]

describe("APL judge runner (Phase-3 APL-2.5/3.x)", () => {
  it("parses PASS/FAIL verdicts off the first line, preserving order", async () => {
    const results = await runJudge(examples, fakeChat)
    expect(results.map((r) => r.id)).toEqual(["a", "b", "c", "d"])
    expect(results.map((r) => r.got)).toEqual([true, true, false, false])
  })

  it("accepts alternative positive vocabulary and ignores blank leading lines", async () => {
    const wordy: AplChat = async () => "\n  supported — the claim holds\nFAIL"
    const [only] = await runJudge([{ id: "x", input: "anything", expected: true }], wordy)
    expect(only?.got).toBe(true)
  })

  it("treats a chat throw as a hard negative", async () => {
    const boom: AplChat = async () => {
      throw new Error("provider down")
    }
    const [only] = await runJudge([{ id: "x", input: "good", expected: true }], boom)
    expect(only?.got).toBe(false)
  })

  it("calibrateWithJudge builds a confusion matrix matching the fake", async () => {
    const report = await calibrateWithJudge(examples, fakeChat, { minPerClass: 2 })
    expect(report.tp).toBe(2)
    expect(report.tn).toBe(2)
    expect(report.fp).toBe(0)
    expect(report.fn).toBe(0)
    expect(report.positives).toBe(2)
    expect(report.negatives).toBe(2)
    expect(report.tpr).toBe(1)
    expect(report.tnr).toBe(1)
  })

  it("threshold/minPerClass flow through to stratified reasons", async () => {
    // Only 2 per class → below the default 50-per-class gate; wiring, not the gate itself.
    const report = await calibrateWithJudge(examples, fakeChat)
    expect(report.stratifiedCalibrated).toBe(false)
    expect(report.reasons.some((r) => r.includes("positive labels"))).toBe(true)
  })

  it("rejects a floating judge model before spending a call, accepts a pinned snapshot (§1)", async () => {
    await expect(runJudge(examples, fakeChat, { model: "gpt-4o-mini" })).rejects.toThrow(
      /floating alias/,
    )
    const ok = await runJudge(examples, fakeChat, { model: "gpt-4o-2024-11-20" })
    expect(ok.map((r) => r.got)).toEqual([true, true, false, false])
  })
})
