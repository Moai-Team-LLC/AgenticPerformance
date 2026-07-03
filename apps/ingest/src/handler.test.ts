import { describe, expect, it } from "vitest"

import { inMemoryTraceWriter } from "@apl/core/ingest/writer"

import { createHandler } from "./handler"

/** Minimal real OTLP/JSON export body (same shape the Collector POSTs). */
const otlpBody = {
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
              ],
            },
          ],
        },
      ],
    },
  ],
}

const post = (body: string, headers: Record<string, string> = {}): Request =>
  new Request("http://localhost/v1/traces", { method: "POST", body, headers })

describe("@apl/ingest handler (auth + payload cap)", () => {
  it("health stays open on / and /health even when a token is configured", async () => {
    const handler = createHandler({ writer: inMemoryTraceWriter(), token: "s3cret" })
    for (const path of ["/", "/health"]) {
      const res = await handler(new Request(`http://localhost${path}`))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, service: "apl-ingest" })
    }
  })

  it("rejects POST /v1/traces without a Bearer token when auth is configured", async () => {
    const writer = inMemoryTraceWriter()
    const handler = createHandler({ writer, token: "s3cret" })
    const res = await handler(post(JSON.stringify(otlpBody)))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: "unauthorized" })
    expect(writer.rows).toHaveLength(0)
  })

  it("rejects a wrong Bearer token with 401", async () => {
    const handler = createHandler({ writer: inMemoryTraceWriter(), token: "s3cret" })
    const res = await handler(
      post(JSON.stringify(otlpBody), { authorization: "Bearer wrong" }),
    )
    expect(res.status).toBe(401)
  })

  it("accepts the correct Bearer token and writes spans", async () => {
    const writer = inMemoryTraceWriter()
    const handler = createHandler({ writer, token: "s3cret" })
    const res = await handler(
      post(JSON.stringify(otlpBody), { authorization: "Bearer s3cret" }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; written: number }
    expect(body.ok).toBe(true)
    expect(body.written).toBeGreaterThan(0)
    expect(writer.rows).toHaveLength(body.written)
  })

  it("stays open (no auth) when no token is configured", async () => {
    const writer = inMemoryTraceWriter()
    const handler = createHandler({ writer })
    const res = await handler(post(JSON.stringify(otlpBody)))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { written: number }
    expect(body.written).toBeGreaterThan(0)
  })

  it("treats an empty-string token as open (auth requires a non-empty token)", async () => {
    const handler = createHandler({ writer: inMemoryTraceWriter(), token: "" })
    const res = await handler(post(JSON.stringify(otlpBody)))
    expect(res.status).toBe(200)
  })

  it("rejects an oversized body with 413", async () => {
    const writer = inMemoryTraceWriter()
    const handler = createHandler({ writer, maxBodyBytes: 64 })
    const res = await handler(post(JSON.stringify(otlpBody)))
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ ok: false, error: "payload too large" })
    expect(writer.rows).toHaveLength(0)
  })

  it("answers malformed JSON with ok:true written:0 (defensive, never throws)", async () => {
    const handler = createHandler({ writer: inMemoryTraceWriter() })
    const res = await handler(post("{not json"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, written: 0 })
  })

  it("returns 404 for unknown routes", async () => {
    const handler = createHandler({ writer: inMemoryTraceWriter() })
    const res = await handler(new Request("http://localhost/nope"))
    expect(res.status).toBe(404)
  })
})
