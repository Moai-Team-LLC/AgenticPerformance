import { describe, expect, it } from "vitest"

import type { OpenInferenceSpan } from "./agenticmind"

import { canonicalShape, normalizeOpenInference, validateTrace } from "../normalize"
import { fromAgenticMind } from "./agenticmind"

const oiSpans: OpenInferenceSpan[] = [
  {
    spanId: "ask",
    parentSpanId: null,
    name: "knowledge.ask",
    attributes: { "openinference.span.kind": "AGENT", "apl.task_id": "t1" },
  },
  {
    spanId: "retr",
    parentSpanId: "ask",
    name: "retrieve",
    attributes: { "openinference.span.kind": "RETRIEVER", "retrieval.documents.count": 5 },
  },
  {
    spanId: "llm",
    parentSpanId: "ask",
    name: "synthesize",
    attributes: { "openinference.span.kind": "LLM", "llm.model_name": "gpt-4o" },
  },
]

describe("AgenticMind → APL adapter", () => {
  it("injects identity and normalizes to a contract-valid trace", () => {
    const raw = fromAgenticMind(oiSpans, { agentId: "knowledge-agent", agentVersion: "v0.8.0" })
    const normalized = normalizeOpenInference(raw)
    expect(validateTrace(normalized)).toEqual([])
    // AGENT root → invoke_agent, LLM → chat; RETRIEVER preserved but non-canonical.
    expect(canonicalShape(normalized)).toEqual(["chat<invoke_agent", "invoke_agent<"])
  })

  it("stamps agent identity on the root span only", () => {
    const raw = fromAgenticMind(oiSpans, { agentId: "knowledge-agent", agentVersion: "v0.8.0" })
    const root = raw.spans.find((s) => s.parentSpanId === null)
    const child = raw.spans.find((s) => s.spanId === "llm")
    expect(root?.attributes["apl.agent_id"]).toBe("knowledge-agent")
    expect(child?.attributes["apl.agent_id"]).toBeUndefined()
  })
})
