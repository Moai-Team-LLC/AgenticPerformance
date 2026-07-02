/**
 * APL trace writer port (Phase-1, backlog APL-1.4).
 *
 * The injected sink the receiver writes span rows into. Kept drizzle-free so the
 * data-plane stays pure and unit-testable: `inMemoryTraceWriter` collects rows for
 * tests, and the orchestrator's Postgres adapter mirrors this same interface over
 * an `apl_span` bulk insert (schema/apl/trace-span.ts).
 */

import type { AplSpanRow } from "./trace-mapper"

export interface TraceWriter {
  write(rows: readonly AplSpanRow[]): Promise<void>
}

/** In-memory writer: appends rows to a public `rows` array. Tests read it directly. */
export interface InMemoryTraceWriter extends TraceWriter {
  readonly rows: AplSpanRow[]
}

export const inMemoryTraceWriter = (): InMemoryTraceWriter => {
  const rows: AplSpanRow[] = []
  return {
    rows,
    write: async (batch) => {
      rows.push(...batch)
    },
  }
}
