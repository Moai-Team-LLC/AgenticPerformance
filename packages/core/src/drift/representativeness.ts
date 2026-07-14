/**
 * APL representativeness score (Eval-Science delta §5, FR-DRIFT-1) — answers
 * "when did my evals stop representing prod?".
 *
 * Rolling embedding-distribution distance between recent prod traffic (from OTel
 * traces already in APL) and a golden set: centroid-cosine shift + a two-sample
 * classifier AUC (AUC ~0.5 = same distribution, ->1.0 = drifted). A breach of a
 * declared threshold means the golden set no longer represents prod — the CALLER
 * must auto-open a "golden set refresh" task feeding the review pipeline
 * (FR-HITL) for new labels; this module only computes the verdict. Convention:
 * absent data is NOT representative — an empty side yields max drift, never a
 * silent green. Pure + deterministic; embeddings are injected by the caller
 * (assumed same dimensionality on both sides).
 */

import { cosine } from "../failure/cluster-identity"

export const DEFAULT_SHIFT_THRESHOLD = 0.15
export const DEFAULT_AUC_THRESHOLD = 0.75

/** Mean vector of a cloud ([] -> []). */
export const centroid = (vectors: readonly (readonly number[])[]): number[] => {
  const first = vectors[0]
  if (first === undefined) return []
  const out = new Array<number>(first.length).fill(0)
  for (const v of vectors) {
    for (let i = 0; i < out.length; i += 1) out[i] = (out[i] ?? 0) + (v[i] ?? 0)
  }
  for (let i = 0; i < out.length; i += 1) out[i] = (out[i] ?? 0) / vectors.length
  return out
}

/**
 * 1 - cosine(centroid(prod), centroid(golden)). Either side empty -> 1 (max
 * shift): absent data is NOT representative, so "no prod traffic" or "no golden
 * set" must read as drifted, never as fine.
 */
export const centroidCosineShift = (
  prod: readonly (readonly number[])[],
  golden: readonly (readonly number[])[],
): number => {
  if (prod.length === 0 || golden.length === 0) return 1
  return 1 - cosine(centroid(prod), centroid(golden))
}

/**
 * Deterministic two-sample classifier AUC WITHOUT training: a nearest-centroid
 * classifier scores each point as score(x) = cos(x, centroidA) - cos(x, centroidB),
 * and AUC is the probability a random A-point scores higher than a random B-point
 * (Mann-Whitney U over the scores, ties = 0.5). ~0.5 = same distribution,
 * ->1.0 = drifted / separable. Empty either side -> 1 (max drift, see module doc).
 */
export const twoSampleAuc = (
  a: readonly (readonly number[])[],
  b: readonly (readonly number[])[],
): number => {
  if (a.length === 0 || b.length === 0) return 1
  const centroidA = centroid(a)
  const centroidB = centroid(b)
  const score = (x: readonly number[]): number => cosine(x, centroidA) - cosine(x, centroidB)
  const scoresA = a.map(score)
  const scoresB = b.map(score)
  let u = 0
  for (const sa of scoresA) {
    for (const sb of scoresB) {
      if (sa > sb) u += 1
      else if (sa === sb) u += 0.5
    }
  }
  return u / (scoresA.length * scoresB.length)
}

export interface RepresentativenessResult {
  centroidShift: number
  auc: number
  drifted: boolean
  reason: string
}

/**
 * FR-DRIFT-1 verdict: drifted when EITHER the centroid-cosine shift or the
 * two-sample AUC breaches its declared threshold; `reason` names which. On a
 * breach the caller wires the "golden set refresh" task into the review
 * pipeline (FR-HITL) — representativeness maintenance is a triggered duty,
 * not a calendar habit.
 */
export const representativeness = (
  prod: readonly (readonly number[])[],
  golden: readonly (readonly number[])[],
  opts: { shiftThreshold?: number; aucThreshold?: number } = {},
): RepresentativenessResult => {
  const shiftThreshold = opts.shiftThreshold ?? DEFAULT_SHIFT_THRESHOLD
  const aucThreshold = opts.aucThreshold ?? DEFAULT_AUC_THRESHOLD
  const centroidShift = centroidCosineShift(prod, golden)
  const auc = twoSampleAuc(prod, golden)

  const breaches: string[] = []
  if (centroidShift > shiftThreshold)
    breaches.push(`centroid shift ${centroidShift.toFixed(3)} > ${shiftThreshold}`)
  if (auc > aucThreshold) breaches.push(`two-sample AUC ${auc.toFixed(3)} > ${aucThreshold}`)

  if (breaches.length > 0) {
    return {
      centroidShift,
      auc,
      drifted: true,
      reason: `golden set no longer represents prod: ${breaches.join("; ")}`,
    }
  }
  return {
    centroidShift,
    auc,
    drifted: false,
    reason: `representative: shift ${centroidShift.toFixed(3)} <= ${shiftThreshold}, AUC ${auc.toFixed(3)} <= ${aucThreshold}`,
  }
}
