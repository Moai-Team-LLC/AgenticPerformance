/**
 * APL autonomy boundary (Phase-4, backlog APL-4.4) — fixes improve-trust#2.
 *
 * FR-IMPROVE-4 says auto-evolution touches ONLY prompt/context/few-shot and never
 * tools/rights/trust boundaries. That can't be a category label: a prompt is
 * free-form text in the instruction channel, so "tools[] unchanged" is NECESSARY
 * but NOT SUFFICIENT — an auto-patched prompt can smuggle "always call
 * delete_record" while the tools[] array is byte-identical. This enforces the
 * boundary mechanically: a diff allowlist (field-scoped) PLUS a content guard over
 * the patched text (injection markers, tool-invocation directives, secret/scope
 * language, references to real tool names). Pure. Reuses guard.ts.
 */

import { detectInjection } from "../vendor/guard"

/** The only fields an auto-patch may touch. */
export const ALLOWED_PATCH_FIELDS: ReadonlySet<string> = new Set([
  "system_prompt",
  "context_strategy",
  "few_shot",
])

/** Tool-invocation / secret / scope language that must never enter an auto-patch. */
const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\balways\s+(call|invoke|use|run|execute)\b/i,
  /\b(call|invoke|execute|run)\s+(the\s+)?[a-z_][\w]*\s+tool\b/i,
  /\b(process\.env|api[_\s-]?key|secret|password|credential|access[_\s-]?token)\b/i,
  /\b(grant|escalate|elevate)\b[\s\S]{0,20}\b(access|privilege|permission|scope|role)\b/i,
  /\b(delete|drop|revoke|remove)_[a-z]\w*/i,
]

export interface PatchOp {
  field: string
  /** The new content being introduced into that field. */
  value: string
}

export interface Patch {
  ops: readonly PatchOp[]
  /** tools[] before/after — asserting they are equal is necessary (not sufficient). */
  toolsBefore?: readonly string[]
  toolsAfter?: readonly string[]
}

export interface AutonomyResult {
  allowed: boolean
  violations: string[]
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i])

export const checkAutonomy = (
  patch: Patch,
  opts: { knownTools?: readonly string[] } = {},
): AutonomyResult => {
  const violations: string[] = []

  for (const op of patch.ops) {
    if (!ALLOWED_PATCH_FIELDS.has(op.field)) {
      violations.push(`patch touches non-allowlisted field "${op.field}"`)
    }
  }

  if (patch.toolsBefore !== undefined && patch.toolsAfter !== undefined) {
    if (!sameSet(patch.toolsBefore, patch.toolsAfter)) {
      violations.push("tools[] changed — never permitted via auto-patch")
    }
  }

  for (const op of patch.ops) {
    for (const re of FORBIDDEN_PATTERNS) {
      if (re.test(op.value)) {
        violations.push(`"${op.field}" content references forbidden tool/secret/scope language`)
        break
      }
    }
    for (const tool of opts.knownTools ?? []) {
      if (op.value.toLowerCase().includes(tool.toLowerCase())) {
        violations.push(
          `"${op.field}" content references tool "${tool}" (tool-invocation smuggling)`,
        )
      }
    }
    if (detectInjection(op.value).injection) {
      violations.push(`"${op.field}" content contains an injection/jailbreak marker`)
    }
  }

  return { allowed: violations.length === 0, violations }
}
