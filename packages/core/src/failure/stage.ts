/**
 * APL staged failure attribution (eval-science delta v0.3, FR-FAIL-6/7).
 *
 * Adds the ORTHOGONAL pipeline-stage axis to the per-agent controlled-vocabulary
 * taxonomy (FR-FAIL-2): retrieval- and reasoning-failures are different diseases,
 * and an end-to-end metric that mixes them does not direct improvement. Clustering
 * tags the stage; the scorecard renders per-stage dashboards. Per FR-FAIL-7,
 * `retrieval_miss` is linked to a Recall@k failure from the retrieval eval
 * category — retrieval stays a first-class category, never blended into
 * end-to-end task metrics. Pure, deterministic.
 */

/** The pipeline-stage axis (FR-FAIL-6) — a closed, controlled vocabulary. */
export const PIPELINE_STAGES = [
  "retrieval_miss",
  "reasoning_error",
  "tool_error",
  "verification_error",
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]

/** Type guard: is `v` one of the four pipeline stages? */
export const isPipelineStage = (v: unknown): v is PipelineStage =>
  typeof v === "string" && (PIPELINE_STAGES as readonly string[]).includes(v)

/** Deterministic signals a failure carries about where in the pipeline it broke. */
export interface StageSignal {
  /** Links `retrieval_miss` to a Recall@k failure per FR-FAIL-7. */
  retrievalRecallFailed?: boolean
  toolErrored?: boolean
  verificationRejected?: boolean
}

/**
 * Infer the pipeline stage from signals. Deterministic PRECEDENCE (first match
 * wins):
 *   1. `retrieval_miss`      — retrievalRecallFailed (a Recall@k failure, FR-FAIL-7)
 *   2. `tool_error`          — toolErrored
 *   3. `verification_error`  — verificationRejected
 *   4. `reasoning_error`     — the residual (no upstream signal fired)
 *
 * Retrieval outranks everything: an agent that never retrieved the needed
 * material fails downstream too, and blaming the downstream stage would misdirect
 * improvement. `reasoning_error` is never signalled directly — it is what remains
 * when no other stage explains the failure.
 */
export const inferStage = (s: StageSignal): PipelineStage => {
  if (s.retrievalRecallFailed) return "retrieval_miss"
  if (s.toolErrored) return "tool_error"
  if (s.verificationRejected) return "verification_error"
  return "reasoning_error"
}

/** One row of the per-stage scorecard: a stage and how many failures it owns. */
export interface StagedFailure {
  stage: PipelineStage
  count: number
}

/**
 * Roll staged failures up into per-stage counts, sorted by count DESC, for the
 * per-stage scorecard dashboards (FR-FAIL-6). Deterministic: ties keep
 * PIPELINE_STAGES declaration order (stable sort over a fixed base order), and the
 * result is independent of input order. Stages with zero failures are omitted.
 */
export const stageRollup = (failures: readonly { stage: PipelineStage }[]): StagedFailure[] => {
  const counts = new Map<PipelineStage, number>()
  for (const failure of failures) {
    counts.set(failure.stage, (counts.get(failure.stage) ?? 0) + 1)
  }
  return PIPELINE_STAGES.map((stage) => ({ stage, count: counts.get(stage) ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
}
