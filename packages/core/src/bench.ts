/**
 * APL SDK-overhead benchmark (Phase-1, backlog APL-1.6).
 *
 * The instrumentation must be cheap enough to leave always-on. This measures the
 * marginal cost `wrapAgent().run` adds over a bare async call, using a NO-OP sink
 * (the sink is the injectable boundary — no OTel SDK, no exporter, no I/O) so the
 * number reflects the wrapper's own bookkeeping, not span export. Pure and
 * self-contained: it times two loops with performance.now() and reports the
 * per-op delta in microseconds. Timing is machine-dependent — treat the absolute
 * value as a regression signal, not a spec.
 */

import { wrapAgent, type AplSpanHandle, type AplSpanSink } from "./sdk"

export interface OverheadResult {
  iterations: number
  baselineMs: number
  instrumentedMs: number
  /** Marginal cost of one wrapped invocation over a bare async call, in microseconds. Floored at 0. */
  overheadPerOpMicros: number
}

/** A sink that does no span bookkeeping — it just runs `fn` with a no-op handle. */
const noopSink: AplSpanSink = {
  run: (_name, _attributes, fn) => {
    const handle: AplSpanHandle = {
      setAttribute: () => {},
      recordException: () => {},
    }
    return fn(handle)
  },
}

export const measureOverhead = async (iterations = 2000): Promise<OverheadResult> => {
  const empty = async (): Promise<void> => {}

  const baselineStart = performance.now()
  for (let i = 0; i < iterations; i++) {
    await empty()
  }
  const baselineMs = performance.now() - baselineStart

  const instrumentedStart = performance.now()
  for (let i = 0; i < iterations; i++) {
    await wrapAgent("bench", {
      productId: "b",
      agentVersion: "v",
      taskId: "t",
      sink: noopSink,
    }).run(async () => {})
  }
  const instrumentedMs = performance.now() - instrumentedStart

  const overheadPerOpMicros = Math.max(0, ((instrumentedMs - baselineMs) / iterations) * 1000)

  return { iterations, baselineMs, instrumentedMs, overheadPerOpMicros }
}
