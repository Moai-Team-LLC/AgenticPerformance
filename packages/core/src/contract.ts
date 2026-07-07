/**
 * APL telemetry contract (Phase-0, backlog APL-0.1).
 *
 * The canonical internal model is OpenTelemetry GenAI semconv. Two decisions from
 * the PRD v0.2 review are encoded here:
 *
 *  1. Operation, not span name. `invoke_agent` / `chat` / `execute_tool` are the
 *     canonical OPERATIONS (values of `gen_ai.operation.name`), never span names —
 *     a conformant emitter names spans `chat gpt-4o` / `execute_tool web_search`.
 *     APL keys on the operation, so the model/tool suffix never fragments anything.
 *  2. Identity on the Resource, per-invocation on the span. Stable identity
 *     (tenant/product/agent/agent_version) lives on the OTel Resource; only
 *     per-invocation facts (task_id/outcome/human_feedback/decision_reason) are
 *     span attributes. Tenant isolation therefore keys on Resource identity, not
 *     on trusting every span to carry the right attribute.
 */

/** Canonical GenAI operations APL recognises. Everything else is framework-internal. */
export const AplOperation = {
  INVOKE_AGENT: "invoke_agent",
  CHAT: "chat",
  EXECUTE_TOOL: "execute_tool",
} as const
export type AplOperation = (typeof AplOperation)[keyof typeof AplOperation]

const CANONICAL_OPERATIONS: ReadonlySet<string> = new Set(Object.values(AplOperation))
export const isAplOperation = (value: unknown): value is AplOperation =>
  typeof value === "string" && CANONICAL_OPERATIONS.has(value)

/** Standardised OTel GenAI attribute keys (FR-CONTRACT-3). */
export const GenAI = {
  OPERATION_NAME: "gen_ai.operation.name",
  REQUEST_MODEL: "gen_ai.request.model",
  PROVIDER_NAME: "gen_ai.provider.name",
  USAGE_INPUT_TOKENS: "gen_ai.usage.input_tokens",
  USAGE_OUTPUT_TOKENS: "gen_ai.usage.output_tokens",
  RESPONSE_FINISH_REASONS: "gen_ai.response.finish_reasons",
  TOOL_NAME: "gen_ai.tool.name",
  INPUT_MESSAGES: "gen_ai.input.messages",
  OUTPUT_MESSAGES: "gen_ai.output.messages",
  SYSTEM_INSTRUCTIONS: "gen_ai.system_instructions",
  // Standard GenAI agent identity — the fallback when apl.* identity is absent.
  AGENT_ID: "gen_ai.agent.id",
  AGENT_NAME: "gen_ai.agent.name",
  AGENT_VERSION: "gen_ai.agent.version",
} as const

/** APL-namespaced attributes (FR-CONTRACT-5). apl.*, not moai.*. */
export const Apl = {
  // Resource-level identity (stable across the whole trace).
  TENANT_ID: "apl.tenant_id",
  PRODUCT_ID: "apl.product_id",
  AGENT_ID: "apl.agent_id",
  AGENT_VERSION: "apl.agent_version",
  // Per-invocation facts (span-level).
  TASK_ID: "apl.task_id",
  OUTCOME: "apl.outcome",
  HUMAN_FEEDBACK: "apl.human_feedback",
  DECISION_REASON: "apl.decision_reason",
  /** Tail-sampling keep-hint: head sampling can't know errors/latency, so the SDK flags keep here. */
  KEEP: "apl.keep",
} as const

export type AttrValue = string | number | boolean
export type Attributes = Record<string, AttrValue>

/** A raw span exactly as an SDK / instrumentor emits it (convention-agnostic). */
export interface RawSpan {
  spanId: string
  parentSpanId: string | null
  name: string
  attributes: Attributes
}

/** A raw trace: Resource-level attributes + the emitted spans. */
export interface RawTrace {
  resource: Attributes
  spans: RawSpan[]
}

/** A normalised span. `operation === null` means framework-internal (preserved, non-canonical). */
export interface AplSpan {
  spanId: string
  parentSpanId: string | null
  operation: AplOperation | null
  attributes: Attributes
  /** The original raw span, preserved verbatim (FR-INTEG-2: extra framework spans are kept). */
  raw: RawSpan
}

export interface AplTrace {
  resource: Attributes
  spans: AplSpan[]
}

/**
 * Deployment-level identity every APL trace must carry on the Resource. Only
 * tenant/product are process-wide; agent_id/agent_version vary per agent within a
 * process, so they live on the invoke_agent span (see MANDATORY_SPAN_ATTRS).
 */
export const MANDATORY_RESOURCE_ATTRS: readonly string[] = [Apl.TENANT_ID, Apl.PRODUCT_ID]

/** Mandatory span attributes per canonical operation (FR-CONTRACT-3 + agent identity on the root). */
export const MANDATORY_SPAN_ATTRS: Readonly<Record<AplOperation, readonly string[]>> = {
  [AplOperation.INVOKE_AGENT]: [GenAI.OPERATION_NAME, Apl.AGENT_ID, Apl.AGENT_VERSION],
  [AplOperation.CHAT]: [GenAI.OPERATION_NAME, GenAI.REQUEST_MODEL],
  [AplOperation.EXECUTE_TOOL]: [GenAI.OPERATION_NAME, GenAI.TOOL_NAME],
}
