import { describe, expect, it } from "vitest"

import { AplOperation, GenAI } from "./contract"
import { genAiFixture, openInferenceFixture } from "./fixtures"
import {
  canonicalEquivalent,
  canonicalShape,
  normalizeGenAI,
  normalizeOpenInference,
  validateTrace,
} from "./normalize"

describe("APL normalization — Phase-0 acceptance (§6.1)", () => {
  it("both fixture products normalize to the SAME canonical shape", () => {
    const a = normalizeGenAI(genAiFixture())
    const b = normalizeOpenInference(openInferenceFixture())
    expect(canonicalShape(a)).toEqual(canonicalShape(b))
    expect(canonicalShape(a)).toEqual([
      "chat<invoke_agent",
      "execute_tool<invoke_agent",
      "invoke_agent<",
    ])
  })

  it("both traces satisfy the contract (mandatory attrs present)", () => {
    expect(validateTrace(normalizeGenAI(genAiFixture()))).toEqual([])
    expect(validateTrace(normalizeOpenInference(openInferenceFixture()))).toEqual([])
  })

  it("declares the two fixtures equivalent", () => {
    expect(
      canonicalEquivalent(
        normalizeGenAI(genAiFixture()),
        normalizeOpenInference(openInferenceFixture()),
      ),
    ).toBe(true)
  })

  it("keys on the operation, not the span name (name carries a model/tool suffix)", () => {
    const a = normalizeGenAI(genAiFixture())
    const chat = a.spans.find((s) => s.operation === AplOperation.CHAT)
    expect(chat?.raw.name).toBe("chat gpt-4o") // suffix present on the raw name
    expect(chat?.attributes[GenAI.OPERATION_NAME]).toBe("chat") // classification uses the attr
  })

  it("maps OpenInference LLM/TOOL attrs into canonical gen_ai.* keys", () => {
    const b = normalizeOpenInference(openInferenceFixture())
    const chat = b.spans.find((s) => s.operation === AplOperation.CHAT)
    expect(chat?.attributes[GenAI.REQUEST_MODEL]).toBe("gpt-4o")
    expect(chat?.attributes[GenAI.USAGE_INPUT_TOKENS]).toBe(412)
    const tool = b.spans.find((s) => s.operation === AplOperation.EXECUTE_TOOL)
    expect(tool?.attributes[GenAI.TOOL_NAME]).toBe("web_search")
  })

  it("preserves framework-internal spans but excludes them from the canonical shape", () => {
    const b = normalizeOpenInference(openInferenceFixture())
    const retriever = b.spans.find((s) => s.raw.spanId === "b-retrieve")
    expect(retriever).toBeDefined() // preserved
    expect(retriever?.operation).toBeNull() // not canonical
    expect(canonicalShape(b)).not.toContain("retrieve")
  })

  it("validateTrace flags a missing mandatory attribute", () => {
    const broken = normalizeGenAI(genAiFixture())
    const chat = broken.spans.find((s) => s.operation === AplOperation.CHAT)
    if (chat) delete chat.attributes[GenAI.REQUEST_MODEL]
    expect(validateTrace(broken)).toContain(`chat (a-chat) missing ${GenAI.REQUEST_MODEL}`)
  })

  it("is NOT equivalent when one trace drops the tool call", () => {
    const full = normalizeGenAI(genAiFixture())
    const noTool = normalizeOpenInference({
      ...openInferenceFixture(),
      spans: openInferenceFixture().spans.filter((s) => s.spanId !== "b-tool"),
    })
    expect(canonicalEquivalent(full, noTool)).toBe(false)
  })
})
