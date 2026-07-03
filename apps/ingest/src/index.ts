/**
 * @apl/ingest — the OTLP/JSON trace ingest server. A Collector (otlphttp exporter,
 * encoding=json) POSTs to /v1/traces; we flatten → normalize → map → insert into
 * apl_span. Bun-native (run: `bun src/index.ts`). Single-tenant by default (the
 * tenant_id column DEFAULT resolves the unset GUC); multi-tenant ingest should wrap
 * the write in withTenant per the authenticated tenant. This file is the thin
 * bootstrap (env parsing + pg writer + Bun.serve); request handling lives in
 * handler.ts (pure, testable). Set APL_INGEST_TOKEN to require Bearer auth on
 * POST /v1/traces; APL_MAX_BODY_BYTES caps the request body size.
 */

import type { AplDatabase } from "@apl/core/database/client"
import type { AplSpanRow } from "@apl/core/ingest/trace-mapper"
import type { TraceWriter } from "@apl/core/ingest/writer"

import { createClient } from "@apl/core/database/client"
import { aplSpan } from "@apl/core/database/schema/trace-span"

import { DEFAULT_MAX_BODY_BYTES, createHandler } from "./handler"

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

// Non-empty APL_INGEST_TOKEN ⇒ POST /v1/traces requires `Authorization: Bearer <token>`.
const token = process.env.APL_INGEST_TOKEN
const authEnabled = token !== undefined && token.length > 0

const rawMaxBodyBytes = Number(process.env.APL_MAX_BODY_BYTES ?? "")
const maxBodyBytes =
  Number.isFinite(rawMaxBodyBytes) && rawMaxBodyBytes > 0 ? rawMaxBodyBytes : DEFAULT_MAX_BODY_BYTES

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

const handler = createHandler({ writer: pgTraceWriter(db), token, maxBodyBytes })

Bun.serve({ port, hostname: "0.0.0.0", fetch: handler })
console.log(`[apl-ingest] listening on :${port} (POST /v1/traces)`)
console.log(
  authEnabled
    ? "[apl-ingest] auth ENABLED (Bearer token required on POST /v1/traces)"
    : "[apl-ingest] auth OPEN (set APL_INGEST_TOKEN to require Bearer auth — dev only)",
)
