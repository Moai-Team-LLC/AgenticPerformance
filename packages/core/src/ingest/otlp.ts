/**
 * APL OTLP ingest shapes (Phase-1, backlog APL-1.4).
 *
 * The data-plane entry point: an OTLP-shaped trace as a Collector / OTLP receiver
 * hands it over (flat span list, resource attributes, nanosecond timestamps). This
 * module only carries the transport shape and projects it onto the normalizer's
 * convention-agnostic `RawTrace` — it does NOT classify operations (that is the
 * normalize layer) and it drops the OTLP timing fields, which the receiver reads
 * separately into a timings map. Pure.
 */

import type { Attributes, RawTrace } from "../contract"

/** A single span exactly as an OTLP exporter emits it (timestamps in unix nanos). */
export interface OtlpSpan {
  traceId: string
  spanId: string
  parentSpanId: string | null
  name: string
  startTimeUnixNano: number
  endTimeUnixNano: number
  attributes: Attributes
}

/** An OTLP trace: resource-level attributes + the emitted spans. */
export interface OtlpTrace {
  resource: Attributes
  spans: OtlpSpan[]
}

/**
 * Project an OTLP trace onto the normalizer's `RawTrace`: keep resource +
 * per-span identity/name/attributes, drop the transport-only timing fields (the
 * receiver reads those into a separate timings map keyed by spanId).
 */
export const toRawTrace = (t: OtlpTrace): RawTrace => ({
  resource: { ...t.resource },
  spans: t.spans.map((s) => ({
    spanId: s.spanId,
    parentSpanId: s.parentSpanId,
    name: s.name,
    attributes: { ...s.attributes },
  })),
})
