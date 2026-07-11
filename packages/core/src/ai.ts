/**
 * APL chat port (Phase-1→5 LLM tails). A minimal injected interface so the
 * LLM-driven modules (judge runner, taxonomy open-coding, L2 proposer) stay
 * unit-testable with a fake and provider-agnostic — mirroring how the eval harness
 * injects its `ask`/`judge` fns. The default adapter routes through the engine's
 * multi-provider chat seam (lib/ai/chat.ts, Vercel AI SDK).
 */

import { chatModel } from "./vendor/chat"
import { generateText } from "ai"

export interface AplChatRequest {
  prompt: string
  system?: string
  /** OpenAI-compatible model id; operators configure per deployment. */
  model?: string
  /**
   * Sampling temperature. Defaults to 0 (deterministic) — a judge or extractor whose
   * verdict changes run-to-run cannot be calibrated, so reproducibility is the default;
   * a caller that genuinely wants diversity (e.g. a proposer) opts in explicitly.
   */
  temperature?: number
}

export type AplChat = (request: AplChatRequest) => Promise<string>

/** Default chat model id — a cheap tier suits triage/judge/proposer work. Overridable per call. */
export const DEFAULT_APL_CHAT_MODEL = "gpt-4o-mini"

/**
 * Operator override for the eval JUDGE model (doctrine §1a). When `APL_JUDGE_MODEL` is set,
 * the judge runs on it instead of the agent-under-test's family — point it at a DIFFERENT
 * family routed through the gateway (e.g. a pinned Gemini/Claude snapshot) so the verify
 * pass does not co-sign the generator's blind spots. Must be a dated snapshot: `runJudge`
 * enforces it (a floating alias makes calibration meaningless). Returns undefined when
 * unset, so the judge falls back to the caller's model / the default.
 */
export const aplJudgeModel = (): string | undefined => process.env.APL_JUDGE_MODEL

/** Real adapter over the engine's configured chat provider. */
export const aiChat: AplChat = async ({ prompt, system, model, temperature }) => {
  const { text } = await generateText({
    model: chatModel(model ?? DEFAULT_APL_CHAT_MODEL),
    system,
    prompt,
    temperature: temperature ?? 0,
  })
  return text
}
