import { describe, expect, it } from "vitest"

import type { AplTrace, RawTrace } from "../contract"
import type { SpanTiming } from "./trace-mapper"

import { Apl, AplOperation, GenAI } from "../contract"
import { normalizeOpenInference } from "../normalize"
import { spansToRows } from "./trace-mapper"

const trace = (): AplTrace => ({
  resource: {
    [Apl.TENANT_ID]: "tenant-1",
    [Apl.PRODUCT_ID]: "moai-research",
  },
  spans: [
    {
      spanId: "root",
      parentSpanId: null,
      operation: AplOperation.INVOKE_AGENT,
      attributes: {
        [GenAI.OPERATION_NAME]: "invoke_agent",
        [Apl.AGENT_ID]: "research-agent",
        [Apl.AGENT_VERSION]: "v3-abc123",
      },
      raw: {
        spanId: "root",
        parentSpanId: null,
        name: "invoke_agent research-agent",
        attributes: {},
      },
    },
    {
      spanId: "chat",
      parentSpanId: "root",
      operation: AplOperation.CHAT,
      attributes: { [GenAI.OPERATION_NAME]: "chat", [GenAI.REQUEST_MODEL]: "gpt-4o" },
      raw: { spanId: "chat", parentSpanId: "root", name: "chat gpt-4o", attributes: {} },
    },
  ],
})

const timings = (): Map<string, SpanTiming> =>
  new Map([
    ["root", { startMs: 1_000, endMs: 5_000 }],
    ["chat", { startMs: 2_000, endMs: 3_000 }],
  ])

describe("APL trace mapper (Phase-1 APL-1.4)", () => {
  it("emits one row per span", () => {
    const rows = spansToRows(trace(), "trace-1", timings())
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.spanId)).toEqual(["root", "chat"])
  })

  it("carries operation and raw name per span", () => {
    const rows = spansToRows(trace(), "trace-1", timings())
    const [root, chat] = rows
    expect(root?.operation).toBe(AplOperation.INVOKE_AGENT)
    expect(root?.name).toBe("invoke_agent research-agent")
    expect(chat?.operation).toBe(AplOperation.CHAT)
    expect(chat?.name).toBe("chat gpt-4o")
  })

  it("derives tenant id from the resource and agent identity from invoke_agent", () => {
    const rows = spansToRows(trace(), "trace-1", timings())
    for (const row of rows) {
      expect(row.tenantId).toBe("tenant-1")
      expect(row.traceId).toBe("trace-1")
      expect(row.agentId).toBe("research-agent")
      expect(row.agentVersion).toBe("v3-abc123")
    }
  })

  it("maps timings to Date timestamps, defaulting missing spans to the epoch", () => {
    const rows = spansToRows(
      trace(),
      "trace-1",
      new Map([["root", { startMs: 1_000, endMs: 5_000 }]]),
    )
    const [root, chat] = rows
    expect(root?.startTs.getTime()).toBe(1_000)
    expect(root?.endTs.getTime()).toBe(5_000)
    expect(chat?.startTs.getTime()).toBe(0)
    expect(chat?.endTs.getTime()).toBe(0)
  })

  it("leaves tenant undefined when the resource has no tenant id", () => {
    const t = trace()
    delete t.resource[Apl.TENANT_ID]
    const rows = spansToRows(t, "trace-1", timings())
    expect(rows[0]?.tenantId).toBeUndefined()
  })

  it("attributes agents by the OTel GenAI standard keys when apl.* is absent", () => {
    const t = trace()
    const root = t.spans[0]
    if (!root) throw new Error("fixture missing invoke_agent span")
    root.attributes = {
      [GenAI.OPERATION_NAME]: "invoke_agent",
      [GenAI.AGENT_ID]: "genai-agent",
      [GenAI.AGENT_VERSION]: "v9-std",
    }
    const rows = spansToRows(t, "trace-1", timings())
    for (const row of rows) {
      expect(row.agentId).toBe("genai-agent")
      expect(row.agentVersion).toBe("v9-std")
    }
  })

  it("keeps apl.agent_id winning when both apl.* and gen_ai.* are present", () => {
    const t = trace()
    const root = t.spans[0]
    if (!root) throw new Error("fixture missing invoke_agent span")
    root.attributes = {
      [GenAI.OPERATION_NAME]: "invoke_agent",
      [Apl.AGENT_ID]: "research-agent",
      [Apl.AGENT_VERSION]: "v3-abc123",
      [GenAI.AGENT_ID]: "genai-agent",
      [GenAI.AGENT_VERSION]: "v9-std",
    }
    const rows = spansToRows(t, "trace-1", timings())
    for (const row of rows) {
      expect(row.agentId).toBe("research-agent")
      expect(row.agentVersion).toBe("v3-abc123")
    }
  })

  it("attributes an OpenInference agent by gen_ai.agent.id through the REAL normalize pipeline", () => {
    // A Mind-shaped root span: openinference.span.kind=CHAIN (root) carrying only
    // the vendor-neutral gen_ai.agent.* attrs. Regression for the drop bug: the
    // OpenInference normalizer must preserve the agent identity, not strip it to
    // apl.* before the mapper resolves it. Goes through normalizeOpenInference, not
    // a hand-built AplTrace, so it exercises the same path a real kl_ask exporter hits.
    const raw: RawTrace = {
      resource: { [Apl.TENANT_ID]: "tenant-1", [Apl.PRODUCT_ID]: "moai" },
      spans: [
        {
          spanId: "root",
          parentSpanId: null,
          name: "knowledge.ask",
          attributes: {
            "openinference.span.kind": "CHAIN",
            [GenAI.AGENT_ID]: "agenticmind",
            [GenAI.AGENT_VERSION]: "v0.13.0",
          },
        },
      ],
    }
    const rows = spansToRows(
      normalizeOpenInference(raw),
      "trace-1",
      new Map([["root", { startMs: 1_000, endMs: 2_000 }]]),
    )
    expect(rows[0]?.operation).toBe(AplOperation.INVOKE_AGENT)
    expect(rows[0]?.agentId).toBe("agenticmind")
    expect(rows[0]?.agentVersion).toBe("v0.13.0")
  })
})
