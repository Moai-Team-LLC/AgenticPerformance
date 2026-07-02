import { describe, expect, it } from "vitest"

import type { AplTrace } from "../contract"
import type { SpanTiming } from "./trace-mapper"

import { Apl, AplOperation, GenAI } from "../contract"
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
})
