/**
 * APL improvement submission flow (Phase-4, backlog APL-4.1/4.2) — the L1/L2
 * "ship a patch through the gate" path, composed from the safety envelope + the
 * Phase-2 eval gate. L1 (assisted) and L2 (suggested) differ only in WHO authors
 * the patch (engineer vs LLM proposer, the latter deferred with #16); both flow
 * through exactly this gate. Pure: pass the pieces in, get an accept/reject with
 * the stage that blocked it.
 */

import type { GateDecision, GateInput } from "../eval/gate"
import type { Patch } from "./autonomy"
import type { MinedArtifact } from "./content-safety"

import { gate } from "../eval/gate"
import { checkAutonomy } from "./autonomy"
import { screenMinedArtifact } from "./content-safety"

export interface PatchSubmission {
  patch: Patch
  /** Few-shot examples mined from traces, if any (screened before they can ship). */
  minedArtifacts?: readonly MinedArtifact[]
  knownTools?: readonly string[]
  gateInput: GateInput
}

export type SubmissionStage = "autonomy" | "content-safety" | "gate" | "accepted"

export interface SubmissionDecision {
  accepted: boolean
  stage: SubmissionStage
  reasons: string[]
  gate?: GateDecision
}

export const evaluateSubmission = (submission: PatchSubmission): SubmissionDecision => {
  // 1. Autonomy boundary — the patch may only touch prompt/context/few-shot fields.
  const autonomy = checkAutonomy(submission.patch, { knownTools: submission.knownTools })
  if (!autonomy.allowed) {
    return { accepted: false, stage: "autonomy", reasons: autonomy.violations }
  }

  // 2. Content-safety — no poisoned mined artifact becomes durable behaviour.
  const contentReasons: string[] = []
  for (const artifact of submission.minedArtifacts ?? []) {
    const screen = screenMinedArtifact(artifact)
    if (!screen.accepted) {
      contentReasons.push(...screen.reasons.map((r) => `${artifact.sourceTraceRef}: ${r}`))
    }
  }
  if (contentReasons.length > 0) {
    return { accepted: false, stage: "content-safety", reasons: contentReasons }
  }

  // 3. Eval gate — no regression vs the prior version on the frozen set.
  const decision = gate(submission.gateInput)
  if (!decision.pass) {
    return { accepted: false, stage: "gate", reasons: [decision.reason], gate: decision }
  }

  return { accepted: true, stage: "accepted", reasons: [], gate: decision }
}
