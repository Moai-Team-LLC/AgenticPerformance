import { describe, expect, it } from "vitest"

import type { AplChat } from "../ai"

import { addToVocabulary, axialCode, openCode, type ControlledVocabulary } from "./taxonomy"

describe("APL failure taxonomy (Phase-3 APL-3.4)", () => {
  it("openCode normalizes the chat's first line (trim + lowercase)", async () => {
    const chat: AplChat = async () => "  Tool-Schema Violation\nignored second line"
    expect(await openCode("agent returned invalid args to the tool", chat)).toBe(
      "tool-schema violation",
    )
  })

  it("axialCode matches an existing vocab entry case-insensitively", () => {
    const vocab: ControlledVocabulary = { labels: ["tool-schema violation", "timeout"] }
    const r = axialCode("  Tool-Schema   Violation  ", vocab)
    expect(r.matched).toBe(true)
    expect(r.needsReview).toBe(false)
    expect(r.label).toBe("tool-schema violation") // returns the existing vocab label
  })

  it("axialCode flags a novel label needsReview and does NOT auto-add it", () => {
    const vocab: ControlledVocabulary = { labels: ["timeout"] }
    const r = axialCode("Hallucinated Citation", vocab)
    expect(r.matched).toBe(false)
    expect(r.needsReview).toBe(true)
    expect(r.label).toBe("hallucinated citation")
    expect(vocab.labels).toEqual(["timeout"]) // vocab untouched
  })

  it("addToVocabulary appends a normalized label once (idempotent on re-add)", () => {
    const vocab: ControlledVocabulary = { labels: ["timeout"] }
    const grown = addToVocabulary(vocab, "  Hallucinated  Citation ")
    expect(grown.labels).toEqual(["timeout", "hallucinated citation"])
    const again = addToVocabulary(grown, "hallucinated citation")
    expect(again.labels).toEqual(["timeout", "hallucinated citation"])
  })
})
