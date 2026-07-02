/**
 * AgenticOps → APL adapter. In the Moai stack (Standard → AgenticMind → AgenticOps
 * → APL), AgenticOps runs the fleet (bounded runner + scheduler + audit/health);
 * APL is the performance layer that evaluates and improves those runs. This maps an
 * AgenticOps run — its manifest, RunOutcome, and tool-audit events — into an APL
 * RawTrace (+ per-span timings) ready for normalize → ingest.
 *
 * The AgenticOps types are mirrored STRUCTURALLY (a caller fills them from
 * @agenticops exports) so APL keeps zero dependency on the AgenticOps package.
 * Source: Moai-Team-LLC/AgenticOps src/runner/runner.ts + src/telemetry/telemetry.ts.
 */

import type { Attributes, RawSpan, RawTrace } from "../contract"

import { Apl, AplOperation, GenAI } from "../contract"

/** Single-tenant sentinel (matches the DB tenant_id DEFAULT). */
const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000000"

/** RunOutcome.status from AgenticOps' bounded runner. */
export type AgenticOpsRunStatus = "completed" | "max-turns" | "timeout" | "cancelled" | "error"

/** Subset of AgenticOps AgentManifest the adapter needs. */
export interface AgenticOpsManifestLike {
  name: string
  model: string
}

/** Subset of AgenticOps AuditEvent (kind "tool" become execute_tool spans). */
export interface AgenticOpsAuditLike {
  kind: "lifecycle" | "auth" | "tool"
  action: string
  at: number
}

export interface AgenticOpsRun {
  manifest: AgenticOpsManifestLike
  outcome: { status: AgenticOpsRunStatus; turns: number }
  audit?: readonly AgenticOpsAuditLike[]
  /** The manifest version/hash — AgenticOps manifests are versioned artifacts. */
  agentVersion: string
  traceId: string
  startMs: number
  endMs: number
  tenantId?: string
  productId?: string
  taskId?: string
}

export type AplOutcome = "success" | "fail" | "escalated" | "unknown"

/** Maps a bounded-runner status to an APL outcome (escalated = hit a limit; unknown = cancelled). */
export const outcomeToApl = (status: AgenticOpsRunStatus): AplOutcome => {
  switch (status) {
    case "completed":
      return "success"
    case "error":
      return "fail"
    case "timeout":
    case "max-turns":
      return "escalated"
    case "cancelled":
      return "unknown"
  }
}

export interface AdaptedTrace {
  trace: RawTrace
  timings: Map<string, { startMs: number; endMs: number }>
}

/** Builds an APL RawTrace (invoke_agent root + one execute_tool per tool-audit event) from an AgenticOps run. */
export const fromAgenticOpsRun = (run: AgenticOpsRun): AdaptedTrace => {
  const resource: Attributes = {
    [Apl.TENANT_ID]: run.tenantId ?? DEFAULT_TENANT_ID,
    [Apl.PRODUCT_ID]: run.productId ?? "agenticops",
  }

  const rootId = `${run.traceId}-root`
  const timings = new Map<string, { startMs: number; endMs: number }>()
  timings.set(rootId, { startMs: run.startMs, endMs: run.endMs })

  const root: RawSpan = {
    spanId: rootId,
    parentSpanId: null,
    name: `invoke_agent ${run.manifest.name}`,
    attributes: {
      [GenAI.OPERATION_NAME]: AplOperation.INVOKE_AGENT,
      [GenAI.REQUEST_MODEL]: run.manifest.model,
      [Apl.AGENT_ID]: run.manifest.name,
      [Apl.AGENT_VERSION]: run.agentVersion,
      [Apl.TASK_ID]: run.taskId ?? run.traceId,
      [Apl.OUTCOME]: outcomeToApl(run.outcome.status),
    },
  }

  const spans: RawSpan[] = [root]
  const toolAudits = (run.audit ?? []).filter((a) => a.kind === "tool")
  toolAudits.forEach((audit, i) => {
    const spanId = `${run.traceId}-tool-${i}`
    timings.set(spanId, { startMs: audit.at, endMs: audit.at })
    spans.push({
      spanId,
      parentSpanId: rootId,
      name: `execute_tool ${audit.action}`,
      attributes: {
        [GenAI.OPERATION_NAME]: AplOperation.EXECUTE_TOOL,
        [GenAI.TOOL_NAME]: audit.action,
      },
    })
  })

  return { trace: { resource, spans }, timings }
}
