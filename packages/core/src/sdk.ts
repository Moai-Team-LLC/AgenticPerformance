/**
 * APL instrumentation SDK (Phase-1, backlog APL-1.1 / APL-1.2).
 *
 * `wrapAgent` opens the `invoke_agent` span and stamps agent identity + the
 * per-invocation apl.* facts; `instrumentTools` / `wrapTool` auto-emit
 * `execute_tool` spans (one integration per product, not per tool — TS has no
 * runtime monkey-patch of arbitrary functions). Spans are keyed on
 * gen_ai.operation.name, never the span name (contract.ts).
 *
 * Emission goes through an injectable `AplSpanSink`; the default is backed by
 * @opentelemetry/api and is a no-op until a TracerProvider is registered (so it
 * is safe on the hot path). Tests inject a recording sink — no OTel SDK required.
 */

import { SpanStatusCode, trace } from "@opentelemetry/api"
import { randomUUID } from "node:crypto"

import type { AttrValue, Attributes } from "./contract"

import { Apl, AplOperation, GenAI } from "./contract"
import { redactText } from "./redact"

export type Outcome = "success" | "fail" | "escalated" | "unknown"
export interface Feedback {
  kind: "thumbs" | "rubric" | "correction"
  value: AttrValue
}

export interface AplSpanHandle {
  setAttribute(key: string, value: AttrValue): void
  recordException(error: unknown): void
}

export interface AplSpanSink {
  run<T>(name: string, attributes: Attributes, fn: (span: AplSpanHandle) => Promise<T>): Promise<T>
}

/** Default sink over @opentelemetry/api. No-op until an exporter/provider is registered. */
export const otelSink = (tracerName = "apl"): AplSpanSink => {
  const tracer = trace.getTracer(tracerName)
  return {
    run: (name, attributes, fn) =>
      tracer.startActiveSpan(name, async (span) => {
        span.setAttributes(attributes)
        const handle: AplSpanHandle = {
          setAttribute: (key, value) => {
            span.setAttribute(key, value)
          },
          recordException: (error) => {
            span.recordException(error instanceof Error ? error : new Error(String(error)))
            span.setStatus({ code: SpanStatusCode.ERROR })
          },
        }
        try {
          return await fn(handle)
        } finally {
          span.end()
        }
      }),
  }
}

export interface WrapAgentOpts {
  productId: string
  agentVersion: string
  /** Override the generated task id (tests pass a fixed value). */
  taskId?: string
  sink?: AplSpanSink
}

export interface AgentContext {
  recordOutcome(outcome: Outcome): void
  recordFeedback(feedback: Feedback): void
  /** Records a why-trace decision reason (redacted before it becomes an attribute). */
  recordDecision(reason: string): void
  wrapTool<A extends unknown[], R>(
    name: string,
    fn: (...args: A) => Promise<R>,
  ): (...args: A) => Promise<R>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instrumentTools<T extends Record<string, (...args: any[]) => Promise<unknown>>>(tools: T): T
}

export interface WrappedAgent {
  run<T>(task: (ctx: AgentContext) => Promise<T>): Promise<T>
}

export const wrapAgent = (agentId: string, opts: WrapAgentOpts): WrappedAgent => {
  const sink = opts.sink ?? otelSink()
  return {
    run: (task) => {
      const attrs: Attributes = {
        [GenAI.OPERATION_NAME]: AplOperation.INVOKE_AGENT,
        [Apl.AGENT_ID]: agentId,
        [Apl.AGENT_VERSION]: opts.agentVersion,
        [Apl.TASK_ID]: opts.taskId ?? randomUUID(),
      }
      return sink.run(`invoke_agent ${agentId}`, attrs, async (span) => {
        const wrapTool =
          <A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>) =>
          (...args: A): Promise<R> =>
            sink.run(
              `execute_tool ${name}`,
              {
                [GenAI.OPERATION_NAME]: AplOperation.EXECUTE_TOOL,
                [GenAI.TOOL_NAME]: name,
              },
              async (toolSpan) => {
                try {
                  return await fn(...args)
                } catch (error) {
                  toolSpan.recordException(error)
                  throw error
                }
              },
            )

        const ctx: AgentContext = {
          recordOutcome: (outcome) => {
            span.setAttribute(Apl.OUTCOME, outcome)
            // Head sampling can't know errors at start; flag keep for the Collector tail sampler.
            if (outcome === "fail" || outcome === "escalated") span.setAttribute(Apl.KEEP, true)
          },
          recordFeedback: (feedback) => {
            span.setAttribute(Apl.HUMAN_FEEDBACK, `${feedback.kind}:${String(feedback.value)}`)
          },
          recordDecision: (reason) => {
            span.setAttribute(Apl.DECISION_REASON, redactText(reason).redacted)
          },
          wrapTool,
          instrumentTools: (tools) => {
            const out: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
            for (const [key, fn] of Object.entries(tools)) {
              out[key] = wrapTool(key, fn)
            }
            return out as unknown as typeof tools
          },
        }
        return task(ctx)
      })
    },
  }
}
