import { describe, expect, it } from "vitest"

import { mrr, ndcg, passCubed, recallAtK, retrievalGate } from "./retrieval"

describe("APL retrieval eval — Recall@k / MRR / NDCG + regression gate (FR-EVAL-6)", () => {
  describe("recallAtK", () => {
    it("computes |top-k ∩ relevant| / |relevant|", () => {
      // top-5 of [a,b,c,d,e,f] hits {a,c} out of relevant {a,c,z} → 2/3
      expect(recallAtK(["a", "b", "c", "d", "e", "f"], ["a", "c", "z"], 5)).toBeCloseTo(2 / 3)
    })

    it("honors the k cutoff — a hit at rank 6 does not count for k=5", () => {
      const retrieved = ["x1", "x2", "x3", "x4", "x5", "a"]
      expect(recallAtK(retrieved, ["a"], 5)).toBe(0)
      expect(recallAtK(retrieved, ["a"], 10)).toBe(1)
    })

    it("empty relevant returns 0, never a green 1 (empty-suite hard-fail philosophy)", () => {
      expect(recallAtK(["a", "b"], [], 5)).toBe(0)
    })

    it("deduplicates — a doc retrieved twice counts once", () => {
      expect(recallAtK(["a", "a", "b"], ["a"], 3)).toBe(1)
    })
  })

  describe("mrr", () => {
    it("first relevant hit at rank 3 contributes 1/3", () => {
      expect(mrr([{ retrieved: ["x", "y", "a"], relevant: ["a"] }])).toBeCloseTo(1 / 3)
    })

    it("a query with no relevant hit contributes 0", () => {
      expect(mrr([{ retrieved: ["x", "y"], relevant: ["a"] }])).toBe(0)
    })

    it("averages across queries: rank-1 hit + no hit → 0.5", () => {
      expect(
        mrr([
          { retrieved: ["a", "x"], relevant: ["a"] },
          { retrieved: ["x", "y"], relevant: ["a"] },
        ]),
      ).toBeCloseTo(0.5)
    })

    it("empty input returns 0", () => {
      expect(mrr([])).toBe(0)
    })
  })

  describe("ndcg", () => {
    const grades = { a: 3, b: 2, c: 1 } as const

    it("perfect ordering scores 1", () => {
      expect(ndcg(["a", "b", "c"], grades, 3)).toBeCloseTo(1)
    })

    it("reversed ordering scores below 1", () => {
      const reversed = ndcg(["c", "b", "a"], grades, 3)
      expect(reversed).toBeLessThan(1)
      expect(reversed).toBeGreaterThan(0)
    })

    it("returns 0 when no graded docs exist (NDCG needs graded relevance)", () => {
      expect(ndcg(["a", "b"], {}, 5)).toBe(0)
      expect(ndcg(["a", "b"], { a: 0, b: 0 }, 5)).toBe(0)
    })

    it("honors the k cutoff", () => {
      // only rank 1 counts at k=1: retrieving b first is worse than a first
      expect(ndcg(["a"], grades, 1)).toBeCloseTo(1)
      expect(ndcg(["b", "a"], grades, 1)).toBeCloseTo(2 / 3)
    })
  })

  describe("retrievalGate", () => {
    it("blocks a Recall@5 regression beyond tolerance", () => {
      const d = retrievalGate({
        current: { recallAt5: 0.7, n: 50 },
        prior: { recallAt5: 0.8, n: 50 },
      })
      expect(d.pass).toBe(false)
      expect(d.reason).toContain("retrieval regression")
    })

    it("passes within tolerance (default 0.02)", () => {
      const d = retrievalGate({
        current: { recallAt5: 0.79, n: 50 },
        prior: { recallAt5: 0.8, n: 50 },
      })
      expect(d.pass).toBe(true)
    })

    it("empty case set (n=0) is a HARD FAIL, never a green gate", () => {
      const d = retrievalGate({ current: { recallAt5: 1, n: 0 }, prior: null })
      expect(d.pass).toBe(false)
      expect(d.reason).toContain("HARD FAIL")
    })

    it("cold start (no prior) passes and records the baseline", () => {
      const d = retrievalGate({ current: { recallAt5: 0.6, n: 50 }, prior: null })
      expect(d.pass).toBe(true)
      expect(d.reason).toContain("cold start")
    })
  })

  describe("passCubed (pass^3 for release-critical changes)", () => {
    it("true only when the last 3 gate decisions are all passes", () => {
      expect(passCubed([true, true, true])).toBe(true)
      expect(passCubed([false, true, true, true])).toBe(true)
      expect(passCubed([true, false, true])).toBe(false)
      expect(passCubed([false, true, true])).toBe(false)
    })

    it("fewer than 3 recorded runs is never a pass", () => {
      expect(passCubed([])).toBe(false)
      expect(passCubed([true, true])).toBe(false)
    })
  })
})
