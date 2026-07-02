import { describe, expect, it } from "vitest"

import type { OtlpTrace } from "./otlp"

import { Apl, AplOperation, GenAI } from "../contract"
import { ingestOtlp } from "./receiver"
import { inMemoryTraceWriter } from "./writer"

/** A gen_ai OTLP trace: one invoke_agent + one chat + one execute_tool. */
const genAiOtlp = (): OtlpTrace => ({
  resource: {
    [Apl.TENANT_ID]: "tenant-1",
    [Apl.PRODUCT_ID]: "moai-research",
  },
  spans: [
    {
      traceId: "trace-1",
      spanId: "a-root",
      parentSpanId: null,
      name: "invoke_agent research-agent",
      startTimeUnixNano: 1_000_000,
      endTimeUnixNano: 5_000_000,
      attributes: {
        [GenAI.OPERATION_NAME]: "invoke_agent",
        [Apl.AGENT_ID]: "research-agent",
        [Apl.AGENT_VERSION]: "v3-abc123",
        [Apl.TASK_ID]: "task-1",
      },
    },
    {
      traceId: "trace-1",
      spanId: "a-chat",
      parentSpanId: "a-root",
      name: "chat gpt-4o",
      startTimeUnixNano: 2_000_000,
      endTimeUnixNano: 3_000_000,
      attributes: { [GenAI.OPERATION_NAME]: "chat", [GenAI.REQUEST_MODEL]: "gpt-4o" },
    },
    {
      traceId: "trace-1",
      spanId: "a-tool",
      parentSpanId: "a-root",
      name: "execute_tool web_search",
      startTimeUnixNano: 3_000_000,
      endTimeUnixNano: 4_000_000,
      attributes: { [GenAI.OPERATION_NAME]: "execute_tool", [GenAI.TOOL_NAME]: "web_search" },
    },
  ],
})

/** The same logical trace emitted via OpenInference span kinds. */
const openInferenceOtlp = (): OtlpTrace => ({
  resource: {
    [Apl.TENANT_ID]: "tenant-1",
    [Apl.PRODUCT_ID]: "moai-research",
  },
  spans: [
    {
      traceId: "trace-2",
      spanId: "b-root",
      parentSpanId: null,
      name: "research-agent",
      startTimeUnixNano: 1_000_000,
      endTimeUnixNano: 5_000_000,
      attributes: {
        "openinference.span.kind": "AGENT",
        [Apl.AGENT_ID]: "research-agent",
        [Apl.AGENT_VERSION]: "v3-abc123",
      },
    },
    {
      traceId: "trace-2",
      spanId: "b-llm",
      parentSpanId: "b-root",
      name: "llm",
      startTimeUnixNano: 2_000_000,
      endTimeUnixNano: 3_000_000,
      attributes: { "openinference.span.kind": "LLM", "llm.model_name": "gpt-4o" },
    },
  ],
})

describe("APL OTLP receiver (Phase-1 APL-1.4)", () => {
  it("ingests a gen_ai trace: written===3, operations present", async () => {
    const writer = inMemoryTraceWriter()
    const result = await ingestOtlp(genAiOtlp(), writer)

    expect(result.written).toBe(3)
    expect(writer.rows).toHaveLength(3)
    expect(writer.rows.map((r) => r.operation)).toEqual([
      AplOperation.INVOKE_AGENT,
      AplOperation.CHAT,
      AplOperation.EXECUTE_TOOL,
    ])
  })

  it("stamps trace id, tenant, agent identity and ms timestamps onto the rows", async () => {
    const writer = inMemoryTraceWriter()
    await ingestOtlp(genAiOtlp(), writer)

    const root = writer.rows[0]
    expect(root?.traceId).toBe("trace-1")
    expect(root?.tenantId).toBe("tenant-1")
    expect(root?.agentId).toBe("research-agent")
    expect(root?.startTs.getTime()).toBe(1) // 1_000_000 nanos / 1e6 = 1 ms
    expect(root?.endTs.getTime()).toBe(5)
  })

  it("auto-detects OpenInference by span kind and normalizes its operations", async () => {
    const writer = inMemoryTraceWriter()
    const result = await ingestOtlp(openInferenceOtlp(), writer)

    expect(result.written).toBe(2)
    expect(writer.rows.map((r) => r.operation)).toEqual([
      AplOperation.INVOKE_AGENT,
      AplOperation.CHAT,
    ])
  })
})
