/**
 * APL content-safety for mined artifacts (Phase-4, backlog APL-4.3) — fixes
 * improve-trust#3 (the live hole: feedback-promoter.ts promotes production answers
 * into the retrieval pool with ZERO guard calls, so a poisoned trace becomes
 * durable behaviour).
 *
 * Before any mined trace becomes a few-shot / promoted card it must pass: guard.ts
 * injection + PII detection, plus an "is this an INSTRUCTION, not an answer?"
 * heuristic (the deterministic stand-in for the LLM judge dimension, which is
 * deferred with #16/#20), and low-trust/anonymous sources are quarantined. Every
 * artifact is provenance-tagged so a poisoned example can be traced and purged. Pure.
 */

import { detectInjection, findPii } from "../vendor/guard"

/** Directive markers that make a "candidate answer" actually an instruction. */
const INSTRUCTION_MARKERS: readonly RegExp[] = [
  /\b(always|never)\s+(respond|answer|say|recommend|mention|call|use|include)\b/i,
  /\bfrom now on\b/i,
  /\byou\s+(must|should)\s+(always|never)\b/i,
  /\bwhen\s+(asked|the user)\b[\s\S]{0,40}\b(respond|answer|say|output|reply)\b/i,
]

export const looksLikeInstruction = (text: string): boolean =>
  INSTRUCTION_MARKERS.some((re) => re.test(text))

export type TrustTier = "trusted" | "low" | "anonymous"

export interface MinedArtifact {
  text: string
  /** Provenance: the trace this was mined from (so a poisoned example is purgeable). */
  sourceTraceRef: string
  tenantId: string
  trust: TrustTier
}

export interface ScreenResult {
  accepted: boolean
  quarantined: boolean
  reasons: string[]
  provenance: { sourceTraceRef: string; tenantId: string }
}

export const screenMinedArtifact = (artifact: MinedArtifact): ScreenResult => {
  const reasons: string[] = []

  if (detectInjection(artifact.text).injection) reasons.push("injection/jailbreak marker")

  const piiKinds = [...new Set(findPii(artifact.text).map((p) => p.kind))]
  if (piiKinds.length > 0) reasons.push(`PII: ${piiKinds.join(", ")}`)

  if (looksLikeInstruction(artifact.text)) reasons.push("reads as an instruction, not an answer")

  const quarantined = artifact.trust !== "trusted"
  if (quarantined) reasons.push(`quarantined: ${artifact.trust} source`)

  return {
    accepted: reasons.length === 0,
    quarantined,
    reasons,
    provenance: { sourceTraceRef: artifact.sourceTraceRef, tenantId: artifact.tenantId },
  }
}
