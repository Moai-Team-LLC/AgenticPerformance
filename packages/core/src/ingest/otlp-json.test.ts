import { describe, expect, it } from "vitest"

import { otlpJsonToTraces } from "./otlp-json"

const body = {
  resourceSpans: [
    {
      resource: {
        attributes: [
          { key: "apl.tenant_id", value: { stringValue: "00000000-0000-0000-0000-000000000000" } },
          { key: "apl.product_id", value: { stringValue: "moai-research" } },
        ],
      },
      scopeSpans: [
        {
          spans: [
            {
              traceId: "t1",
              spanId: "root",
              parentSpanId: "",
              name: "invoke_agent research-agent",
              startTimeUnixNano: "1000000000",
              endTimeUnixNano: "2000000000",
              attributes: [
                { key: "gen_ai.operation.name", value: { stringValue: "invoke_agent" } },
                { key: "gen_ai.usage.input_tokens", value: { intValue: "412" } },
              ],
            },
            {
              traceId: "t1",
              spanId: "chat",
              parentSpanId: "root",
              name: "chat gpt-4o",
              startTimeUnixNano: "1100000000",
              endTimeUnixNano: "1900000000",
              attributes: [{ key: "gen_ai.operation.name", value: { stringValue: "chat" } }],
            },
          ],
        },
      ],
    },
  ],
}

describe("OTLP/JSON flattener (Phase-1 APL-1.4)", () => {
  it("flattens resourceSpans → one OtlpTrace with resource + spans", () => {
    const traces = otlpJsonToTraces(body)
    expect(traces).toHaveLength(1)
    const trace = traces[0]
    expect(trace?.resource["apl.product_id"]).toBe("moai-research")
    expect(trace?.spans).toHaveLength(2)
  })

  it("decodes typed attribute values and normalizes root parent to null", () => {
    const trace = otlpJsonToTraces(body)[0]
    const root = trace?.spans.find((s) => s.spanId === "root")
    expect(root?.parentSpanId).toBeNull()
    expect(root?.attributes["gen_ai.usage.input_tokens"]).toBe(412) // intValue string → number
    const chat = trace?.spans.find((s) => s.spanId === "chat")
    expect(chat?.parentSpanId).toBe("root")
  })

  it("is defensive: malformed input yields no traces, never throws", () => {
    expect(otlpJsonToTraces(null)).toEqual([])
    expect(otlpJsonToTraces({})).toEqual([])
    expect(
      otlpJsonToTraces({ resourceSpans: [{ scopeSpans: [{ spans: [{ name: "x" }] }] }] }),
    ).toEqual([])
  })
})
