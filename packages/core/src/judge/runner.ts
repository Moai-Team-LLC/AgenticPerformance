/**
 * APL judge runner (Phase-3, backlog APL-2.5/3.x) — drives an LLM-as-judge over a
 * labeled set and feeds the verdicts into stratified calibration.
 *
 * The judge is asked a single binary question ("is the answer supported?") and must
 * reply PASS/FAIL on its first line; we parse a permissive positive vocabulary so
 * minor phrasing drift ("supported", "yes") still lands. A thrown chat call is a
 * hard negative (got=false) rather than an error — a judge that cannot answer has
 * not endorsed the example. The chat boundary is injected (AplChat) so tests use a
 * fake and never touch a network/LLM. Pure aside from the injected chat.
 */

import type { AplChat } from "../ai"

import { stratifiedCalibration, type StratifiedCalibration } from "./calibration"
import { assertModelSnapshot } from "./version"

export interface JudgeExample {
  id: string
  input: string
  expected: boolean
}

/** Default system framing — a binary, first-line PASS/FAIL judge (never Likert). */
const DEFAULT_SYSTEM =
  "You are a strict binary judge. Answer only PASS if the item is supported, otherwise FAIL. " +
  "Put the single word PASS or FAIL on the first line."

/** Positive verdict vocabulary parsed off the judge's first non-empty line. */
const PASS_PATTERN = /\b(pass|supported|yes|true)\b/i

const firstNonEmptyLine = (text: string): string => {
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.length > 0) return trimmed
  }
  return ""
}

const buildPrompt = (input: string): string =>
  `Item to evaluate:\n${input}\n\nIs it supported? Answer PASS or FAIL on the first line.`

/**
 * Runs the judge over every example. Each verdict is parsed from the first
 * non-empty line; a chat throw yields got=false. Order matches `examples`.
 */
export const runJudge = async (
  examples: readonly JudgeExample[],
  chat: AplChat,
  opts?: { system?: string; model?: string },
): Promise<{ id: string; expected: boolean; got: boolean }[]> => {
  const system = opts?.system ?? DEFAULT_SYSTEM
  // A named judge model must be a pinned snapshot — a floating alias makes calibration
  // meaningless (doctrine §1). Fail closed before spending a single call.
  if (opts?.model !== undefined) assertModelSnapshot(opts.model, "judge")
  const results: { id: string; expected: boolean; got: boolean }[] = []
  for (const example of examples) {
    let got = false
    try {
      const reply = await chat({
        system,
        prompt: buildPrompt(example.input),
        model: opts?.model,
        temperature: 0,
      })
      got = PASS_PATTERN.test(firstNonEmptyLine(reply))
    } catch {
      got = false
    }
    results.push({ id: example.id, expected: example.expected, got })
  }
  return results
}

/** Runs the judge, then reports stratified calibration over its verdicts. */
export const calibrateWithJudge = async (
  examples: readonly JudgeExample[],
  chat: AplChat,
  opts?: { system?: string; model?: string; threshold?: number; minPerClass?: number },
): Promise<StratifiedCalibration> =>
  stratifiedCalibration(await runJudge(examples, chat, opts), {
    threshold: opts?.threshold,
    minPerClass: opts?.minPerClass,
  })
