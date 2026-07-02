import { tenantColumn } from "./_tenant"
import { sql } from "drizzle-orm"
import { index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"

/**
 * APL trace store (Phase-1, backlog APL-1.4) — the ingest target for normalized
 * spans. Same Postgres, not a second datastore: this becomes a TimescaleDB
 * hypertable (companion `_span-hypertable.sql`), so tenant RLS applies, retention
 * is enforced by policy, and pgvector fail-trace search (later) runs over the same
 * rows. `operation` is the canonical gen_ai operation or NULL for framework-
 * internal spans; the raw attribute bag is kept in `attributes` (jsonb, redacted
 * before it ever reaches here — see lib/apl/redact.ts).
 */
const aplSpan = pgTable(
  "apl_span",
  {
    ...tenantColumn,
    traceId: text("trace_id").notNull(),
    spanId: text("span_id").notNull(),
    parentSpanId: text("parent_span_id"),
    /** invoke_agent | chat | execute_tool | null (framework-internal). */
    operation: text("operation"),
    name: text("name").notNull(),
    agentId: text("agent_id"),
    agentVersion: text("agent_version"),
    startTs: timestamp("start_ts", { withTimezone: true }).notNull(),
    endTs: timestamp("end_ts", { withTimezone: true }).notNull(),
    attributes: jsonb("attributes")
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    // Timescale requires the partitioning column in any unique index / PK.
    primaryKey({ columns: [table.startTs, table.spanId] }),
    index("apl_span_trace_idx").on(table.tenantId, table.traceId),
    index("apl_span_agent_idx").on(table.tenantId, table.agentId, table.startTs.desc()),
  ],
)

type AplSpanInsert = typeof aplSpan.$inferInsert
type AplSpanSelect = typeof aplSpan.$inferSelect

export { aplSpan, type AplSpanInsert, type AplSpanSelect }
