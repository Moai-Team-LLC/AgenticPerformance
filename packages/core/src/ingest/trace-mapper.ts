/**
 * APL trace → span rows (Phase-1, backlog APL-1.4).
 *
 * Maps a NORMALIZED `AplTrace` onto the insert-row shape of the `apl_span` table
 * (schema/apl/trace-span.ts) without importing drizzle — the row type mirrors the
 * table columns so the orchestrator's Postgres writer can pass it straight through.
 * Tenant identity comes off the Resource (Apl.TENANT_ID), agent identity off the
 * invoke_agent span (identity lives on the root, per the contract), and timings are
 * injected via a spanId→ms map (the OTLP nanos, converted by the receiver). Pure.
 */

import type { AplTrace, Attributes } from "../contract"

import { Apl, AplOperation, GenAI } from "../contract"

/** One insert row for `apl_span` — column-for-column with the drizzle table. */
export interface AplSpanRow {
  tenantId?: string
  traceId: string
  spanId: string
  parentSpanId: string | null
  operation: string | null
  name: string
  agentId: string | null
  agentVersion: string | null
  startTs: Date
  endTs: Date
  attributes: Attributes
}

/** Span-level ms window, keyed by spanId (converted from OTLP unix nanos upstream). */
export interface SpanTiming {
  startMs: number
  endMs: number
}

const stringAttr = (attrs: Attributes, key: string): string | null => {
  const value = attrs[key]
  return typeof value === "string" ? value : null
}

/**
 * Flatten a normalized trace to insert rows. `traceId` is passed in (it lives on
 * the OTLP span, not the normalized model). tenantId is derived from the Resource;
 * agentId/agentVersion from the invoke_agent span's attributes (identity on the
 * root). Timestamps come from `timings` (default 0 = epoch when a span is missing).
 */
export const spansToRows = (
  trace: AplTrace,
  traceId: string,
  timings: ReadonlyMap<string, SpanTiming>,
): AplSpanRow[] => {
  const tenantId = stringAttr(trace.resource, Apl.TENANT_ID) ?? undefined

  const agentSpan = trace.spans.find((s) => s.operation === AplOperation.INVOKE_AGENT)
  // apl.agent_id wins as an explicit override; otherwise fall back to the OTel GenAI
  // standard so any conformant emitter (gen_ai.agent.id) is attributed. Same for version.
  const agentAttrs = agentSpan?.attributes
  const agentId = agentAttrs
    ? (stringAttr(agentAttrs, Apl.AGENT_ID) ?? stringAttr(agentAttrs, GenAI.AGENT_ID))
    : null
  const agentVersion = agentAttrs
    ? (stringAttr(agentAttrs, Apl.AGENT_VERSION) ?? stringAttr(agentAttrs, GenAI.AGENT_VERSION))
    : null

  return trace.spans.map((span) => {
    const timing = timings.get(span.spanId)
    return {
      tenantId,
      traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      operation: span.operation,
      name: span.raw.name,
      agentId,
      agentVersion,
      startTs: new Date(timing?.startMs ?? 0),
      endTs: new Date(timing?.endMs ?? 0),
      attributes: { ...span.attributes },
    }
  })
}
