/**
 * @apl/ingest — the OTLP/JSON trace ingest server. A Collector (otlphttp exporter,
 * encoding=json) POSTs to /v1/traces; we flatten → normalize → map → insert into
 * apl_span. Bun-native (run: `bun src/index.ts`). Single-tenant by default (the
 * tenant_id column DEFAULT resolves the unset GUC); multi-tenant ingest should wrap
 * the write in withTenant per the authenticated tenant.
 */

import type { AplDatabase } from "@apl/core/database/client"
import type { AplSpanRow } from "@apl/core/ingest/trace-mapper"
import type { TraceWriter } from "@apl/core/ingest/writer"

import { createClient } from "@apl/core/database/client"
import { aplSpan } from "@apl/core/database/schema/trace-span"
import { otlpJsonToTraces } from "@apl/core/ingest/otlp-json"
import { ingestOtlp } from "@apl/core/ingest/receiver"

// Bun global (this app is Bun-native); declared locally to avoid a @types/bun dep.
declare const Bun: {
  serve(options: {
    port: number
    hostname?: string
    fetch: (req: Request) => Response | Promise<Response>
  }): unknown
}

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined || databaseUrl.length === 0) {
  console.error("[apl-ingest] DATABASE_URL is required")
  process.exit(1)
}
const port = Number(process.env.PORT ?? 4319)
const db = createClient(databaseUrl)

/** A TraceWriter backed by a drizzle insert into apl_span. */
const pgTraceWriter = (database: AplDatabase): TraceWriter => ({
  write: async (rows: readonly AplSpanRow[]): Promise<void> => {
    if (rows.length === 0) return
    await database.insert(aplSpan).values(
      rows.map((r) => ({
        tenantId: r.tenantId,
        traceId: r.traceId,
        spanId: r.spanId,
        parentSpanId: r.parentSpanId,
        operation: r.operation,
        name: r.name,
        agentId: r.agentId,
        agentVersion: r.agentVersion,
        startTs: r.startTs,
        endTs: r.endTs,
        attributes: r.attributes,
      })),
    )
  },
})

const writer = pgTraceWriter(db)

const handler = async (req: Request): Promise<Response> => {
  const { pathname } = new URL(req.url)
  if (pathname === "/health" || pathname === "/") {
    return Response.json({ ok: true, service: "apl-ingest" })
  }
  if (pathname === "/v1/traces" && req.method === "POST") {
    const body: unknown = await req.json().catch(() => null)
    const traces = otlpJsonToTraces(body)
    let written = 0
    for (const trace of traces) {
      written += (await ingestOtlp(trace, writer)).written
    }
    return Response.json({ ok: true, written })
  }
  return new Response("Not found", { status: 404 })
}

Bun.serve({ port, hostname: "0.0.0.0", fetch: handler })
console.log(`[apl-ingest] listening on :${port} (POST /v1/traces)`)
