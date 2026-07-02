import { describe, expect, it } from "vitest"

import { cosine, isNewCluster, matchClusters } from "./cluster-identity"

describe("APL cluster identity + stability (Phase-3 APL-3.3/3.5)", () => {
  it("cosine: 1 for identical, 0 for orthogonal", () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1)
    expect(cosine([1, 0, 0], [0, 1, 0])).toBeCloseTo(0)
  })

  it("carries a prior id for a near-duplicate label, mints a new id for a distinct one", () => {
    const prior = [
      { id: "cluster-schema", labelEmbedding: [1, 0, 0] },
      { id: "cluster-timeout", labelEmbedding: [0, 1, 0] },
    ]
    const out = matchClusters(prior, [
      { tempId: "tmp-a", labelEmbedding: [0.98, 0.02, 0] }, // ~schema
      { tempId: "tmp-b", labelEmbedding: [0, 0, 1] }, // distinct
    ])
    const byTemp = Object.fromEntries(out.map((a) => [a.tempId, a]))
    expect(byTemp["tmp-a"]?.assignedId).toBe("cluster-schema")
    expect(byTemp["tmp-a"]?.carriedOver).toBe(true)
    expect(byTemp["tmp-b"]?.assignedId).toBe("tmp-b")
    expect(byTemp["tmp-b"]?.carriedOver).toBe(false)
  })

  it("is deterministic and claims each prior at most once", () => {
    const prior = [{ id: "c1", labelEmbedding: [1, 0] }]
    const cands = [
      { tempId: "a", labelEmbedding: [1, 0] },
      { tempId: "b", labelEmbedding: [0.99, 0.01] },
    ]
    const first = matchClusters(prior, cands)
    expect(matchClusters(prior, cands)).toEqual(first) // deterministic
    expect(first.filter((a) => a.carriedOver)).toHaveLength(1) // prior claimed once
  })

  it("isNewCluster requires size, novelty, and post-deploy timing", () => {
    const common = { labelEmbedding: [0, 0, 1], priorLabels: [[1, 0, 0]], versionCreatedAtMs: 1000 }
    expect(isNewCluster({ ...common, memberCount: 5, firstMemberTsMs: 2000 })).toBe(true)
    expect(isNewCluster({ ...common, memberCount: 2, firstMemberTsMs: 2000 })).toBe(false) // too small
    expect(isNewCluster({ ...common, memberCount: 5, firstMemberTsMs: 500 })).toBe(false) // before deploy
    expect(
      isNewCluster({ ...common, labelEmbedding: [1, 0, 0], memberCount: 5, firstMemberTsMs: 2000 }),
    ).toBe(false) // matches a prior label
  })
})
