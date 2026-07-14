/**
 * APL review capture (v0.3 eval-science delta, FR-HITL-1) — human oversight as
 * label supply.
 *
 * Every human review decision / override is captured as label data and becomes a
 * golden-set candidate with `origin: "review_capture"` provenance (FR-EVAL-7).
 * Human decisions are the highest-grade ground-truth signal the loop produces;
 * dropping them wastes exactly the labels the golden set is starved for. The
 * disjoint-invariant (FR-JUDGE-4) still applies downstream: review-derived items
 * must not land in a judge's own calibration set. Pure.
 */

/** A single captured human review decision (FR-HITL-1: {item, decision, reviewer, rubric_version, timestamp}). */
export interface ReviewCapture {
  itemRef: string
  decision: "approve" | "override" | "reject"
  reviewer: string
  rubricVersion: string
  atMs: number
}

/**
 * Golden-candidate provenance, structurally compatible with the GoldenProvenance
 * shape in eval/provenance (FR-EVAL-7). Deliberately NOT imported from
 * ../eval/provenance to avoid a zone cross-dependency — the field names mirror it
 * exactly and MUST stay in sync (rubricVersion, labeler, labelDateMs, origin).
 */
export interface ReviewCaptureProvenance {
  rubricVersion: string
  labeler: "human"
  labelDateMs: number
  origin: "review_capture"
}

/**
 * Turns a captured human decision into a golden-set candidate: the decision is the
 * label, the reviewer is a human labeler, provenance origin is `review_capture` —
 * so the item is anchored, never `unanchored` (FR-EVAL-7).
 */
export const toGoldenCandidate = (
  c: ReviewCapture,
): { itemRef: string; label: string; provenance: ReviewCaptureProvenance } => ({
  itemRef: c.itemRef,
  label: c.decision,
  provenance: {
    rubricVersion: c.rubricVersion,
    labeler: "human",
    labelDateMs: c.atMs,
    origin: "review_capture",
  },
})
