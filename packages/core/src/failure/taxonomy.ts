/**
 * APL failure taxonomy (Phase-3, backlog APL-3.4) — LLM-assisted OPEN coding into
 * a human-CONTROLLED vocabulary (grounded-theory open→axial coding).
 *
 * Open coding proposes a short free-text label for one failure via the injected
 * chat port; axial coding then snaps that proposal onto a controlled vocabulary by
 * normalized equality. A proposal that matches nothing is NOT auto-added — it is
 * flagged needsReview so the vocabulary grows only through explicit human review
 * (addToVocabulary), keeping the label space stable and auditable. Pure except for
 * the injected chat (fake in tests — never a real LLM).
 */

import type { AplChat } from "../ai"

/** Collapse to a canonical form: trim, lowercase, single-space runs. */
const normalizeLabel = (raw: string): string => raw.trim().toLowerCase().replace(/\s+/g, " ")

const OPEN_CODE_SYSTEM =
  "You label agent failures for a taxonomy. Reply with ONLY a single short failure " +
  "label (<= 5 words, kebab-case or space-separated, no punctuation, no explanation)."

/**
 * Open coding: ask the chat port for a SHORT (<= 5 word) failure label for the given
 * failure text. Returns the first line, trimmed and lowercased.
 */
export const openCode = async (
  failureText: string,
  chat: AplChat,
  opts: { model?: string } = {},
): Promise<string> => {
  const text = await chat({
    prompt: `Failure:\n${failureText}\n\nLabel:`,
    system: OPEN_CODE_SYSTEM,
    model: opts.model,
  })
  const [firstLine] = text.split("\n")
  return (firstLine ?? "").trim().toLowerCase()
}

/** The human-controlled set of accepted failure labels. */
export interface ControlledVocabulary {
  labels: readonly string[]
}

export interface AxialResult {
  label: string
  matched: boolean
  needsReview: boolean
}

/**
 * Axial coding: normalize a proposed label and snap it onto the controlled
 * vocabulary by normalized equality. A match returns the EXISTING vocab label; a
 * miss returns the normalized proposal flagged needsReview (never auto-added — the
 * vocabulary grows only via addToVocabulary after explicit human review).
 */
export const axialCode = (proposedLabel: string, vocab: ControlledVocabulary): AxialResult => {
  const normalized = normalizeLabel(proposedLabel)
  const existing = vocab.labels.find((label) => normalizeLabel(label) === normalized)
  if (existing !== undefined) {
    return { label: existing, matched: true, needsReview: false }
  }
  return { label: normalized, matched: false, needsReview: true }
}

/**
 * The explicit-review path: append a normalized label to the vocabulary if it is not
 * already present (normalized equality). Returns a new vocabulary — pure.
 */
export const addToVocabulary = (
  vocab: ControlledVocabulary,
  label: string,
): ControlledVocabulary => {
  const normalized = normalizeLabel(label)
  const present = vocab.labels.some((existing) => normalizeLabel(existing) === normalized)
  if (present) return vocab
  return { labels: [...vocab.labels, normalized] }
}
