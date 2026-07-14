/**
 * APL normalization layer (Phase-0, backlog APL-0.2).
 *
 * Maps BOTH conventions APL must ingest into the canonical internal model:
 *  - OpenInference (what the AgenticMind engine itself emits — trace.ts — and what
 *    LangGraph/CrewAI instrumentors emit), and
 *  - OTel GenAI semconv (`gen_ai.*`, external products).
 *
 * Equivalence is defined POST-normalization (FR-INTEG-2, §6.1 acceptance): the same
 * set of {invoke_agent, chat, execute_tool} operations + parentage + mandatory
 * attributes. Extra framework-internal spans (retrieval, sub-chains) are preserved
 * but do NOT participate in the canonical shape — so two structurally-different but
 * semantically-equivalent traces compare equal.
 */

import type { AplSpan, AplTrace, AttrValue, Attributes, RawSpan, RawTrace } from "./contract"

import {
  AplOperation,
  GenAI,
  MANDATORY_RESOURCE_ATTRS,
  MANDATORY_SPAN_ATTRS,
  isAplOperation,
} from "./contract"

// ── gen_ai.* → internal ────────────────────────────────────────────────────────
// gen_ai spans are already canonical; we only classify the operation and copy attrs.
export const normalizeGenAI = (trace: RawTrace): AplTrace => ({
  resource: { ...trace.resource },
  spans: trace.spans.map((raw) => {
    const op = raw.attributes[GenAI.OPERATION_NAME]
    return {
      spanId: raw.spanId,
      parentSpanId: raw.parentSpanId,
      operation: isAplOperation(op) ? op : null,
      attributes: { ...raw.attributes },
      raw,
    }
  }),
})

// ── OpenInference → internal ────────────────────────────────────────────────────
const OI_KIND = "openinference.span.kind"
const OI = {
  MODEL: "llm.model_name",
  PROVIDER: "llm.provider",
  PROMPT_TOKENS: "llm.token_count.prompt",
  COMPLETION_TOKENS: "llm.token_count.completion",
  TOOL_NAME: "tool.name",
} as const

/** OpenInference span kind → canonical operation (null = framework-internal, e.g. RETRIEVER / sub-chain). */
const operationForKind = (kind: AttrValue | undefined, isRoot: boolean): AplOperation | null => {
  switch (kind) {
    case "AGENT":
      return AplOperation.INVOKE_AGENT
    case "CHAIN":
      return isRoot ? AplOperation.INVOKE_AGENT : null
    case "LLM":
      return AplOperation.CHAT
    case "TOOL":
      return AplOperation.EXECUTE_TOOL
    default:
      return null
  }
}

// Standard OTel GenAI agent-identity keys: preserved through OpenInference
// normalization so an OpenInference-emitting agent (openinference.span.kind set)
// that also stamps the vendor-neutral gen_ai.agent.* attrs stays attributable.
const AGENT_IDENTITY_KEYS: readonly string[] = [
  GenAI.AGENT_ID,
  GenAI.AGENT_NAME,
  GenAI.AGENT_VERSION,
]

const copyPassthrough = (attrs: Attributes, out: Attributes): void => {
  // Preserve apl.* attributes (per-invocation facts) + the standard GenAI agent
  // identity — everything else is recomputed from the OpenInference kind.
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith("apl.") || AGENT_IDENTITY_KEYS.includes(key)) out[key] = value
  }
}

const normalizeOpenInferenceSpan = (raw: RawSpan): AplSpan => {
  const operation = operationForKind(raw.attributes[OI_KIND], raw.parentSpanId === null)
  const attributes: Attributes = {}
  copyPassthrough(raw.attributes, attributes)

  if (operation !== null) attributes[GenAI.OPERATION_NAME] = operation

  if (operation === AplOperation.CHAT) {
    const model = raw.attributes[OI.MODEL]
    if (model !== undefined) attributes[GenAI.REQUEST_MODEL] = model
    const provider = raw.attributes[OI.PROVIDER]
    if (provider !== undefined) attributes[GenAI.PROVIDER_NAME] = provider
    const inTok = raw.attributes[OI.PROMPT_TOKENS]
    if (inTok !== undefined) attributes[GenAI.USAGE_INPUT_TOKENS] = inTok
    const outTok = raw.attributes[OI.COMPLETION_TOKENS]
    if (outTok !== undefined) attributes[GenAI.USAGE_OUTPUT_TOKENS] = outTok
  }

  if (operation === AplOperation.EXECUTE_TOOL) {
    const tool = raw.attributes[OI.TOOL_NAME]
    if (tool !== undefined) attributes[GenAI.TOOL_NAME] = tool
  }

  return { spanId: raw.spanId, parentSpanId: raw.parentSpanId, operation, attributes, raw }
}

export const normalizeOpenInference = (trace: RawTrace): AplTrace => ({
  resource: { ...trace.resource },
  spans: trace.spans.map(normalizeOpenInferenceSpan),
})

// ── Canonical projection + equivalence ──────────────────────────────────────────

/** Parent chain of CANONICAL operations, root-first — parentage independent of span ids. */
const canonicalParentPath = (span: AplSpan, byId: Map<string, AplSpan>): AplOperation[] => {
  const path: AplOperation[] = []
  let parentId = span.parentSpanId
  while (parentId !== null) {
    const parent = byId.get(parentId)
    if (parent === undefined) break
    if (parent.operation !== null) path.push(parent.operation)
    parentId = parent.parentSpanId
  }
  return path.reverse()
}

/**
 * Ordering- and span-id-independent shape: for every canonical span, its operation
 * plus its canonical parent path. Two equivalent traces yield the same sorted set.
 */
export const canonicalShape = (trace: AplTrace): string[] => {
  const byId = new Map(trace.spans.map((s) => [s.spanId, s]))
  const shape = trace.spans
    .filter((s) => s.operation !== null)
    .map((s) => `${s.operation}<${canonicalParentPath(s, byId).join("/")}`)
  return shape.sort()
}

/** Missing-attribute report — empty means the trace satisfies the contract. */
export const validateTrace = (trace: AplTrace): string[] => {
  const errors: string[] = []
  for (const key of MANDATORY_RESOURCE_ATTRS) {
    if (trace.resource[key] === undefined) errors.push(`resource missing ${key}`)
  }
  for (const span of trace.spans) {
    if (span.operation === null) continue
    for (const key of MANDATORY_SPAN_ATTRS[span.operation]) {
      if (span.attributes[key] === undefined) {
        errors.push(`${span.operation} (${span.spanId}) missing ${key}`)
      }
    }
  }
  return errors
}

const sameStringArray = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

/**
 * Two normalized traces are equivalent iff both satisfy the contract AND expose the
 * same canonical shape. Framework-internal spans (operation === null) are ignored.
 */
export const canonicalEquivalent = (a: AplTrace, b: AplTrace): boolean =>
  validateTrace(a).length === 0 &&
  validateTrace(b).length === 0 &&
  sameStringArray(canonicalShape(a), canonicalShape(b))
