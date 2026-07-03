/**
 * @apl/ingest HTTP handler (pure, testable). Routes: GET /health (or /) → liveness;
 * POST /v1/traces → flatten OTLP/JSON (otlpJsonToTraces) → ingestOtlp → writer.
 * Hardening: optional Bearer-token auth on /v1/traces (health stays open) and a
 * request-body byte cap (Content-Length short-circuit + actual byte length after
 * read). The writer is injected so this stays pure — no db, no Bun globals.
 */

import type { TraceWriter } from "@apl/core/ingest/writer"

import { Buffer } from "node:buffer"
import { createHash, timingSafeEqual } from "node:crypto"

import { otlpJsonToTraces } from "@apl/core/ingest/otlp-json"
import { ingestOtlp } from "@apl/core/ingest/receiver"

/**
 * Constant-time credential compare. Hashing both sides first normalises lengths
 * (timingSafeEqual requires equal-length buffers), so neither the length nor the
 * content of the expected token leaks through response timing.
 */
const safeEqual = (a: string, b: string): boolean =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest())

/** Default request-body cap: 5 MB of OTLP/JSON is far beyond a normal export batch. */
export const DEFAULT_MAX_BODY_BYTES = 5_000_000

export interface HandlerOptions {
  writer: TraceWriter
  /** Non-empty ⇒ POST /v1/traces requires `Authorization: Bearer <token>`. */
  token?: string
  /** Reject bodies larger than this many bytes (default DEFAULT_MAX_BODY_BYTES). */
  maxBodyBytes?: number
}

export const createHandler = (opts: HandlerOptions) => {
  const maxBodyBytes = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const token = opts.token
  const authRequired = typeof token === "string" && token.length > 0

  return async (req: Request): Promise<Response> => {
    const { pathname } = new URL(req.url)
    if (pathname === "/health" || pathname === "/") {
      return Response.json({ ok: true, service: "apl-ingest" })
    }
    if (pathname === "/v1/traces" && req.method === "POST") {
      if (authRequired && !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${token}`)) {
        return Response.json({ ok: false, error: "unauthorized" }, { status: 401 })
      }
      // Short-circuit on a declared Content-Length before reading the body
      // (NaN comparisons are false, so a garbage header falls through to the real check).
      const contentLength = req.headers.get("content-length")
      if (contentLength !== null && Number(contentLength) > maxBodyBytes) {
        return Response.json({ ok: false, error: "payload too large" }, { status: 413 })
      }
      const text = await req.text()
      if (Buffer.byteLength(text, "utf8") > maxBodyBytes) {
        return Response.json({ ok: false, error: "payload too large" }, { status: 413 })
      }
      let body: unknown = null
      try {
        body = JSON.parse(text) as unknown
      } catch {
        // Malformed JSON → body stays null → otlpJsonToTraces yields no traces.
      }
      const traces = otlpJsonToTraces(body)
      let written = 0
      for (const trace of traces) {
        written += (await ingestOtlp(trace, opts.writer)).written
      }
      return Response.json({ ok: true, written })
    }
    return new Response("Not found", { status: 404 })
  }
}
