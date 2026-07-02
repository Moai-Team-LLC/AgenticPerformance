/**
 * Reference fixture products (Phase-0, backlog APL-0.5) — the conformance corpus
 * for the §6.1 acceptance criterion. Both describe the SAME logical execution
 * (an agent that makes one LLM call and one tool call), emitted in two different
 * conventions, so the normalization layer can be proven to collapse them to the
 * same canonical shape.
 */

import type { Attributes, RawTrace } from "./contract"

import { Apl, GenAI } from "./contract"

/** Shared Resource identity — deployment-level only (tenant/product). */
const RESOURCE: Attributes = {
  [Apl.TENANT_ID]: "00000000-0000-0000-0000-000000000000",
  [Apl.PRODUCT_ID]: "moai-research",
}

/** Per-agent identity — stamped on the invoke_agent root span, not the Resource. */
const AGENT_IDENTITY: Attributes = {
  [Apl.AGENT_ID]: "research-agent",
  [Apl.AGENT_VERSION]: "v3-abc123",
}

/**
 * Product A — raw TS loop emitting OTel GenAI semconv directly. Note the span
 * NAMES carry the model/tool suffix (`chat gpt-4o`), while APL keys on the
 * operation attribute, not the name.
 */
export const genAiFixture = (): RawTrace => ({
  resource: { ...RESOURCE },
  spans: [
    {
      spanId: "a-root",
      parentSpanId: null,
      name: "invoke_agent research-agent",
      attributes: {
        [GenAI.OPERATION_NAME]: "invoke_agent",
        ...AGENT_IDENTITY,
        [Apl.TASK_ID]: "task-1",
        [Apl.OUTCOME]: "success",
      },
    },
    {
      spanId: "a-chat",
      parentSpanId: "a-root",
      name: "chat gpt-4o",
      attributes: {
        [GenAI.OPERATION_NAME]: "chat",
        [GenAI.REQUEST_MODEL]: "gpt-4o",
        [GenAI.PROVIDER_NAME]: "openai",
        [GenAI.USAGE_INPUT_TOKENS]: 412,
        [GenAI.USAGE_OUTPUT_TOKENS]: 87,
      },
    },
    {
      spanId: "a-tool",
      parentSpanId: "a-root",
      name: "execute_tool web_search",
      attributes: {
        [GenAI.OPERATION_NAME]: "execute_tool",
        [GenAI.TOOL_NAME]: "web_search",
      },
    },
  ],
})

/**
 * Product B — the same agent instrumented via OpenInference (what the AgenticMind
 * engine and LangGraph/CrewAI emit). Includes an extra RETRIEVER span that has no
 * canonical operation: it must be PRESERVED but must NOT affect equivalence.
 */
export const openInferenceFixture = (): RawTrace => ({
  resource: { ...RESOURCE },
  spans: [
    {
      spanId: "b-root",
      parentSpanId: null,
      name: "research-agent",
      attributes: {
        "openinference.span.kind": "AGENT",
        ...AGENT_IDENTITY,
        [Apl.TASK_ID]: "task-1",
        [Apl.OUTCOME]: "success",
      },
    },
    {
      spanId: "b-retrieve",
      parentSpanId: "b-root",
      name: "retrieve",
      attributes: {
        "openinference.span.kind": "RETRIEVER",
        "retrieval.documents.count": 5,
      },
    },
    {
      spanId: "b-llm",
      parentSpanId: "b-root",
      name: "llm",
      attributes: {
        "openinference.span.kind": "LLM",
        "llm.model_name": "gpt-4o",
        "llm.provider": "openai",
        "llm.token_count.prompt": 412,
        "llm.token_count.completion": 87,
      },
    },
    {
      spanId: "b-tool",
      parentSpanId: "b-root",
      name: "web_search",
      attributes: {
        "openinference.span.kind": "TOOL",
        "tool.name": "web_search",
      },
    },
  ],
})
