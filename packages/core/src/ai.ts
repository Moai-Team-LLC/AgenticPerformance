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
}

export type AplChat = (request: AplChatRequest) => Promise<string>

/** Default chat model id — a cheap tier suits triage/judge/proposer work. Overridable per call. */
export const DEFAULT_APL_CHAT_MODEL = "gpt-4o-mini"

/** Real adapter over the engine's configured chat provider. */
export const aiChat: AplChat = async ({ prompt, system, model }) => {
  const { text } = await generateText({
    model: chatModel(model ?? DEFAULT_APL_CHAT_MODEL),
    system,
    prompt,
  })
  return text
}
