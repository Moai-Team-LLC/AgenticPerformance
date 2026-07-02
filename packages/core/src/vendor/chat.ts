/**
 * Chat provider seam (vendored/adapted from AgenticMind lib/ai/chat.ts). One
 * OpenAI-compatible endpoint, configured by APL_CHAT_BASE_URL + APL_CHAT_API_KEY:
 * OpenAI by default, or Ollama / vLLM / OpenRouter / Together / Groq / Azure —
 * anything that speaks the OpenAI chat API. Used by the LLM tails (judge runner,
 * taxonomy open-coding, L2 proposer) via ai.ts.
 */

import type { LanguageModel } from "ai"

import { createOpenAICompatible } from "@ai-sdk/openai-compatible"

const DEFAULT_CHAT_BASE_URL = "https://api.openai.com/v1"

type CompatProvider = ReturnType<typeof createOpenAICompatible>
let compat: CompatProvider | null = null

const compatProvider = (): CompatProvider => {
  if (compat !== null) return compat
  compat = createOpenAICompatible({
    name: "apl-chat",
    baseURL: process.env.APL_CHAT_BASE_URL ?? DEFAULT_CHAT_BASE_URL,
    apiKey: process.env.APL_CHAT_API_KEY,
  })
  return compat
}

/** Resolves the configured chat model for a given model id. */
export const chatModel = (modelId: string): LanguageModel => compatProvider()(modelId)
