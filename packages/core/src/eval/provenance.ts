/**
 * APL ground-truth provenance (Eval-Science delta v0.3, FR-EVAL-7/8).
 *
 * Every golden item carries provenance: the rubric version it was labeled under,
 * the labeler (human | model:<id> | hybrid), the label date, optional inter-rater
 * agreement, and the origin (authored | adjudicated | review_capture). A set where
 * ANY item lacks provenance — or an empty set — is flagged `unanchored`, and an
 * unanchored set must NOT back Loop-License / release gates (FR-EVAL-7, mirrors
 * Standard DoD 22). Rubrics are versioned supply-chain artifacts: a rubric version
 * bump forces a re-baseline of every judge whose Judge Card still carries the old
 * version (FR-EVAL-8). Pure + deterministic.
 */

/** Who produced the label. `model:<id>` names the exact labeling model. */
export type Labeler = "human" | `model:${string}` | "hybrid"

/**
 * How the golden item originated. `adjudicated` (third judge / human resolving a
 * disagreement) is the highest-grade material; `review_capture` items come from the
 * FR-HITL-1 review pipeline.
 */
export type Origin = "authored" | "adjudicated" | "review_capture"

/** Provenance carried by every golden item (FR-EVAL-7). */
export interface GoldenProvenance {
  /** Version of the rubric the label was produced under (rubrics live in git, FR-EVAL-8). */
  rubricVersion: string
  labeler: Labeler
  labelDateMs: number
  /** Inter-rater agreement when the item was multi-labeled. */
  agreement?: { raters: number; kappa: number }
  origin: Origin
}

/**
 * FR-EVAL-7: a golden set is `unanchored` when ANY item lacks provenance OR the
 * set is empty. An unanchored set must NOT back Loop-License / release gates —
 * gating on labels of unknown origin is the "green pass on an empty suite" bug in
 * a new coat.
 */
export const isUnanchored = (items: readonly { provenance?: GoldenProvenance }[]): boolean =>
  items.length === 0 || items.some((item) => item.provenance === undefined)

/** True when the set may back a Loop-License / release gate: fully anchored (FR-EVAL-7). */
export const canBackReleaseGate = (items: readonly { provenance?: GoldenProvenance }[]): boolean =>
  !isUnanchored(items)

/** A rubric version bump (rubrics are versioned supply-chain artifacts, FR-EVAL-8). */
export interface RubricChange {
  /** The NEW rubric version now in force. */
  rubricVersion: string
  /** Ids of the judges that use this rubric. */
  judgesUsingRubric: readonly string[]
}

/**
 * FR-EVAL-8: a rubric change must trigger a re-baseline of every judge using that
 * rubric — a new anchor run producing an updated Judge Card. Returns the ids of the
 * judges whose Judge Card still carries the OLD version of the rubric
 * (deduplicated, sorted for a deterministic order). Judges using the rubric but
 * without a card are omitted: they are uncalibrated (FR-JUDGE-6) and need initial
 * calibration, not a re-baseline.
 */
export const rebaselineTargets = (
  change: RubricChange,
  judgeCards: readonly { judgeId: string; rubricVersion: string }[],
): string[] => {
  const using = new Set(change.judgesUsingRubric)
  const stale = new Set<string>()
  for (const card of judgeCards) {
    if (using.has(card.judgeId) && card.rubricVersion !== change.rubricVersion) {
      stale.add(card.judgeId)
    }
  }
  return [...stale].sort()
}
