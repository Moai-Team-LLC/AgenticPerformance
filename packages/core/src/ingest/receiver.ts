/**
 * APL OTLP receiver (Phase-1, backlog APL-1.4).
 *
 * The data-plane pipeline: OTLP trace → RawTrace → normalize → span rows → writer.
 * Convention is auto-detected — if any span carries `openinference.span.kind` the
 * trace is OpenInference (what the AgenticMind engine and LangGraph/CrewAI emit),
 * otherwise it is OTel GenAI semconv. Timings are read off the OTLP unix-nano
 * fields (÷1e6 → ms) into a spanId map the mapper stamps onto the rows. The writer
 * is injected so this stays pure and testable (no db, no network).
 */

import type { AplTrace } from "../contract"
import type { OtlpTrace } from "./otlp"
import type { SpanTiming } from "./trace-mapper"
import type { TraceWriter } from "./writer"

import { normalizeGenAI, normalizeOpenInference } from "../normalize"
import { toRawTrace } from "./otlp"
import { spansToRows } from "./trace-mapper"

const OI_KIND = "openinference.span.kind"

const NANOS_PER_MS = 1e6

/** Auto-detect: any OpenInference span kind ⇒ OpenInference, else OTel GenAI. */
const normalizeByConvention = (payload: OtlpTrace): AplTrace => {
  const isOpenInference = payload.spans.some((s) => s.attributes[OI_KIND] !== undefined)
  const raw = toRawTrace(payload)
  return isOpenInference ? normalizeOpenInference(raw) : normalizeGenAI(raw)
}

/**
 * Ingest one OTLP trace: normalize by detected convention, flatten to `apl_span`
 * rows, and hand them to the writer. Returns how many rows were written.
 */
export const ingestOtlp = async (
  payload: OtlpTrace,
  writer: TraceWriter,
): Promise<{ written: number }> => {
  const trace = normalizeByConvention(payload)

  const timings = new Map<string, SpanTiming>(
    payload.spans.map((s) => [
      s.spanId,
      { startMs: s.startTimeUnixNano / NANOS_PER_MS, endMs: s.endTimeUnixNano / NANOS_PER_MS },
    ]),
  )

  const traceId = payload.spans[0]?.traceId ?? ""
  const rows = spansToRows(trace, traceId, timings)
  await writer.write(rows)
  return { written: rows.length }
}
