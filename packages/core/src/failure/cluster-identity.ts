/**
 * APL failure-cluster stability (Phase-3, backlog APL-3.3/3.5) — fixes the
 * failure#1/#3 findings (arrival-order-dependent, non-stable cluster identity).
 *
 * Clusters get a DURABLE identity via their axial LABEL embedding, matched
 * run-over-run: a new cluster whose label is within cosine T of a prior cluster's
 * label carries the prior id (so "renamed" maps to the same series), otherwise it
 * is genuinely new. Greedy best-match, deterministic (ties broken by id order), so
 * the same fail-set yields the same ids across runs. Pure.
 */

export interface ClusterRef {
  id: string
  labelEmbedding: readonly number[]
}

export interface ClusterCandidate {
  /** Temporary id for this run; becomes the durable id if no prior match. */
  tempId: string
  labelEmbedding: readonly number[]
}

export const cosine = (a: readonly number[], b: readonly number[]): number => {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    dot += av * bv
    na += av * av
    nb += bv * bv
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export interface ClusterAssignment {
  tempId: string
  assignedId: string
  carriedOver: boolean
}

/**
 * Assigns each candidate a durable id: the best prior cluster within cosine >=
 * threshold (each prior claimed at most once), else the candidate's own tempId.
 * Deterministic: candidates processed in tempId order, priors compared in id order.
 */
export const matchClusters = (
  prior: readonly ClusterRef[],
  candidates: readonly ClusterCandidate[],
  threshold = 0.9,
): ClusterAssignment[] => {
  const claimed = new Set<string>()
  const ordered = [...candidates].sort((a, b) => (a.tempId < b.tempId ? -1 : 1))
  const priorsOrdered = [...prior].sort((a, b) => (a.id < b.id ? -1 : 1))

  return ordered.map((cand) => {
    let bestId: string | null = null
    let bestSim = threshold
    for (const p of priorsOrdered) {
      if (claimed.has(p.id)) continue
      const sim = cosine(cand.labelEmbedding, p.labelEmbedding)
      if (sim >= bestSim) {
        bestSim = sim
        bestId = p.id
      }
    }
    if (bestId !== null) {
      claimed.add(bestId)
      return { tempId: cand.tempId, assignedId: bestId, carriedOver: true }
    }
    return { tempId: cand.tempId, assignedId: cand.tempId, carriedOver: false }
  })
}

export interface NewClusterInput {
  memberCount: number
  labelEmbedding: readonly number[]
  firstMemberTsMs: number
  priorLabels: readonly (readonly number[])[]
  versionCreatedAtMs: number
}

/**
 * A cluster is NEW (worth a post-deploy alert) only when it (a) clears the minimum
 * member count, (b) is semantically distinct from every prior cluster of the agent
 * (max cosine < T), AND (c) first appeared after the current agent_version shipped.
 */
export const isNewCluster = (
  input: NewClusterInput,
  opts: { minSize?: number; cosineThreshold?: number } = {},
): boolean => {
  const minSize = opts.minSize ?? 5
  const cosineThreshold = opts.cosineThreshold ?? 0.9
  if (input.memberCount < minSize) return false
  if (input.firstMemberTsMs <= input.versionCreatedAtMs) return false
  const maxSim = input.priorLabels.reduce(
    (m, pl) => Math.max(m, cosine(input.labelEmbedding, pl)),
    0,
  )
  return maxSim < cosineThreshold
}
