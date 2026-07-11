import { afterEach, describe, expect, it } from "vitest"

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

describe("APL_JUDGE_MODEL env override (doctrine §1a)", () => {
  const prev = process.env.APL_JUDGE_MODEL
  afterEach(() => {
    if (prev === undefined) {
      delete process.env.APL_JUDGE_MODEL
    } else {
      process.env.APL_JUDGE_MODEL = prev
    }
  })

  /** Fake chat that records the model id it was called with. */
  const capture = (): { chat: AplChat; models: (string | undefined)[] } => {
    const models: (string | undefined)[] = []
    const chat: AplChat = async ({ model }) => {
      models.push(model)
      return "PASS"
    }
    return { chat, models }
  }
  const one: readonly JudgeExample[] = [{ id: "x", input: "anything", expected: true }]

  it("routes the judge to APL_JUDGE_MODEL when the caller pins nothing", async () => {
    process.env.APL_JUDGE_MODEL = "gemini-2.5-flash-2025-01-01"
    const { chat, models } = capture()
    await runJudge(one, chat)
    expect(models).toEqual(["gemini-2.5-flash-2025-01-01"])
  })

  it("lets an explicit opts.model win over the env override", async () => {
    process.env.APL_JUDGE_MODEL = "gemini-2.5-flash-2025-01-01"
    const { chat, models } = capture()
    await runJudge(one, chat, { model: "gpt-4o-2024-11-20" })
    expect(models).toEqual(["gpt-4o-2024-11-20"])
  })

  it("still enforces the pinned-snapshot rule on the env value", async () => {
    process.env.APL_JUDGE_MODEL = "gemini-2.5-flash"
    await expect(runJudge(one, capture().chat)).rejects.toThrow(/floating alias/)
  })

  it("falls back to the caller/default model when the env is unset", async () => {
    delete process.env.APL_JUDGE_MODEL
    const { chat, models } = capture()
    await runJudge(one, chat)
    expect(models).toEqual([undefined])
  })
})
