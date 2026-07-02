/**
 * APL L2 patch proposer (Phase-4, backlog APL-4.2).
 *
 * Turns a mined failure cluster into a CANDIDATE auto-patch: it asks the model for
 * a hypothesis + a few-shot exemplar, then wraps that exemplar as a `few_shot`
 * patch op. The model output is untrusted text, so this module never trusts it —
 * it parses defensively (a garbled/non-JSON reply degrades to an empty, inert
 * patch) and it is deliberately NOT a security boundary itself: `proposeAndScreen`
 * pipes every proposal through the autonomy boundary (autonomy.ts) and the mined
 * content-safety screen (content-safety.ts) before anything is accepted. The chat
 * port is injected so tests use a fake — no network/LLM call. Pure otherwise.
 */

import type { AplChat } from "../ai"

import { checkAutonomy, type Patch } from "./autonomy"
import { screenMinedArtifact, type MinedArtifact } from "./content-safety"

export interface ProposalInput {
  clusterLabel: string
  representativeTraces: readonly string[]
  currentSystemPrompt?: string
  knownTools?: readonly string[]
}

export interface Proposal {
  hypothesis: string
  patch: Patch
  minedFewShot: MinedArtifact[]
}

const SYSTEM =
  "You improve an AI agent by proposing ONE few-shot exemplar that fixes a recurring " +
  "failure. You may only add instructional/context text — never tools, rights, or " +
  "trust boundaries. Reply with STRICT JSON only."

const buildPrompt = (input: ProposalInput): string => {
  const traces = input.representativeTraces.map((t, i) => `${i + 1}. ${t}`).join("\n")
  return [
    `Failure cluster: ${input.clusterLabel}`,
    input.currentSystemPrompt ? `Current system prompt:\n${input.currentSystemPrompt}` : undefined,
    "Representative failing traces:",
    traces,
    'Return STRICT JSON: {"hypothesis": string, "fewShot": string}. ' +
      '"hypothesis" is a one-line root-cause guess; "fewShot" is a single clean ' +
      "exemplar answer (NOT an instruction, no tool calls).",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n\n")
}

interface RawProposal {
  hypothesis: string
  fewShot: string
}

/** Defensive parse of the model reply: any deviation returns undefined (never throws). */
const parseReply = (reply: string): RawProposal | undefined => {
  try {
    const parsed: unknown = JSON.parse(reply)
    if (typeof parsed !== "object" || parsed === null) return undefined
    const record = parsed as Record<string, unknown>
    const { hypothesis, fewShot } = record
    if (typeof hypothesis !== "string" || typeof fewShot !== "string") return undefined
    return { hypothesis, fewShot }
  } catch {
    return undefined
  }
}

const emptyProposal: Proposal = {
  hypothesis: "unparseable proposal",
  patch: { ops: [] },
  minedFewShot: [],
}

export const proposePatch = async (
  input: ProposalInput,
  chat: AplChat,
  opts?: { model?: string },
): Promise<Proposal> => {
  const reply = await chat({ prompt: buildPrompt(input), system: SYSTEM, model: opts?.model })
  const parsed = parseReply(reply)
  if (parsed === undefined) return emptyProposal

  const artifact: MinedArtifact = {
    text: parsed.fewShot,
    sourceTraceRef: "proposal",
    tenantId: "",
    trust: "trusted",
  }
  return {
    hypothesis: parsed.hypothesis,
    patch: { ops: [{ field: "few_shot", value: parsed.fewShot }] },
    minedFewShot: [artifact],
  }
}

export interface ScreenedProposal {
  accepted: boolean
  stage: "autonomy" | "content-safety" | "accepted"
  reasons: string[]
  proposal: Proposal
}

export const proposeAndScreen = async (
  input: ProposalInput,
  chat: AplChat,
  opts?: { model?: string },
): Promise<ScreenedProposal> => {
  const proposal = await proposePatch(input, chat, opts)

  const autonomy = checkAutonomy(proposal.patch, { knownTools: input.knownTools })
  if (!autonomy.allowed) {
    return { accepted: false, stage: "autonomy", reasons: autonomy.violations, proposal }
  }

  const contentReasons: string[] = []
  for (const artifact of proposal.minedFewShot) {
    const screen = screenMinedArtifact(artifact)
    if (!screen.accepted) contentReasons.push(...screen.reasons)
  }
  if (contentReasons.length > 0) {
    return { accepted: false, stage: "content-safety", reasons: contentReasons, proposal }
  }

  return { accepted: true, stage: "accepted", reasons: [], proposal }
}
