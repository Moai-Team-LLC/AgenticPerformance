/**
 * OTLP/JSON → OtlpTrace flattener (Phase-1, backlog APL-1.4). The real wire format
 * an OTel Collector (otlphttp exporter, encoding=json) POSTs to the APL ingest
 * endpoint: nested resourceSpans[].scopeSpans[].spans[] with attributes as
 * {key,value:{stringValue|intValue|...}}. This flattens each resourceSpans group
 * into one OtlpTrace (resource attrs + spans) the receiver can normalize. Pure +
 * defensive over `unknown` input (malformed entries are skipped, never thrown).
 */

import type { AttrValue, Attributes } from "../contract"
import type { OtlpSpan, OtlpTrace } from "./otlp"

interface OtlpAnyValue {
  stringValue?: string
  intValue?: string | number
  boolValue?: boolean
  doubleValue?: number
}
interface OtlpKeyValue {
  key?: string
  value?: OtlpAnyValue
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

const decodeValue = (value: OtlpAnyValue | undefined): AttrValue | undefined => {
  if (value === undefined) return undefined
  if (typeof value.stringValue === "string") return value.stringValue
  if (typeof value.boolValue === "boolean") return value.boolValue
  if (typeof value.doubleValue === "number") return value.doubleValue
  if (value.intValue !== undefined) {
    const n = typeof value.intValue === "string" ? Number(value.intValue) : value.intValue
    if (Number.isFinite(n)) return n
  }
  return undefined
}

const decodeAttributes = (raw: unknown): Attributes => {
  const out: Attributes = {}
  for (const entry of asArray(raw)) {
    if (!isObject(entry)) continue
    const kv = entry as OtlpKeyValue
    if (typeof kv.key !== "string") continue
    const decoded = decodeValue(kv.value)
    if (decoded !== undefined) out[kv.key] = decoded
  }
  return out
}

const toNumber = (v: unknown): number => {
  if (typeof v === "number") return v
  if (typeof v === "string") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return 0
}

const decodeSpan = (raw: unknown): OtlpSpan | null => {
  if (!isObject(raw)) return null
  const spanId = raw.spanId
  const name = raw.name
  const traceId = raw.traceId
  if (typeof spanId !== "string" || typeof name !== "string" || typeof traceId !== "string")
    return null
  const parent = raw.parentSpanId
  return {
    traceId,
    spanId,
    // OTLP uses "" for a root span → normalize to null.
    parentSpanId: typeof parent === "string" && parent.length > 0 ? parent : null,
    name,
    startTimeUnixNano: toNumber(raw.startTimeUnixNano),
    endTimeUnixNano: toNumber(raw.endTimeUnixNano),
    attributes: decodeAttributes(raw.attributes),
  }
}

/** Flattens an OTLP/JSON export body into one OtlpTrace per resourceSpans group. */
export const otlpJsonToTraces = (body: unknown): OtlpTrace[] => {
  if (!isObject(body)) return []
  const traces: OtlpTrace[] = []
  for (const rs of asArray(body.resourceSpans)) {
    if (!isObject(rs)) continue
    const resource = isObject(rs.resource) ? decodeAttributes(rs.resource.attributes) : {}
    const spans: OtlpSpan[] = []
    for (const ss of asArray(rs.scopeSpans)) {
      if (!isObject(ss)) continue
      for (const rawSpan of asArray(ss.spans)) {
        const span = decodeSpan(rawSpan)
        if (span !== null) spans.push(span)
      }
    }
    if (spans.length > 0) traces.push({ resource, spans })
  }
  return traces
}
