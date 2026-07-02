/**
 * AgenticMind → APL adapter. AgenticMind (the knowledge/judgment layer) emits
 * OpenInference spans (openinference.span.kind CHAIN/RETRIEVER/LLM). APL already
 * normalizes OpenInference; this adapter just stamps the APL identity the engine's
 * spans don't carry — agent_id/agent_version on the root invoke_agent span, and
 * tenant/product on the Resource — so the trace satisfies the APL contract. Pipe
 * the result through normalizeOpenInference.
 *
 * Source: Moai-Team-LLC/AgenticMind packages/shared/src/lib/observability/trace.ts.
 */

import type { Attributes, RawSpan, RawTrace } from "../contract"

import { Apl } from "../contract"

/** Single-tenant sentinel (matches the DB tenant_id DEFAULT). */
const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000000"

/** An OpenInference span as emitted by AgenticMind (attributes keyed by openinference.*). */
export interface OpenInferenceSpan {
  spanId: string
  parentSpanId: string | null
  name: string
  attributes: Attributes
}

export interface AplIdentity {
  agentId: string
  agentVersion: string
  tenantId?: string
  productId?: string
  taskId?: string
}

/**
 * Injects APL identity into an AgenticMind OpenInference trace: agent_id/version
 * (+ optional task_id/outcome passthrough) on the root span, tenant/product on the
 * Resource. Root = the parentless span (AgenticMind's `knowledge.ask` CHAIN).
 */
export const fromAgenticMind = (
  spans: readonly OpenInferenceSpan[],
  identity: AplIdentity,
): RawTrace => {
  const resource: Attributes = {
    [Apl.TENANT_ID]: identity.tenantId ?? DEFAULT_TENANT_ID,
    [Apl.PRODUCT_ID]: identity.productId ?? "agenticmind",
  }

  const out: RawSpan[] = spans.map((span) => {
    if (span.parentSpanId !== null) return { ...span, attributes: { ...span.attributes } }
    // Root span → stamp APL identity so normalizeOpenInference validates it as invoke_agent.
    const attributes: Attributes = {
      ...span.attributes,
      [Apl.AGENT_ID]: identity.agentId,
      [Apl.AGENT_VERSION]: identity.agentVersion,
    }
    if (identity.taskId !== undefined) attributes[Apl.TASK_ID] = identity.taskId
    return { ...span, attributes }
  })

  return { resource, spans: out }
}
