import { describe, expect, it } from "vitest"

import { caseSetHash, gate } from "./gate"

const score = (passRate: number, total: number, hash = "h1") => ({
  caseSetHash: hash,
  passRate,
  total,
})

describe("APL version gate (Phase-2 APL-2.3)", () => {
  it("caseSetHash is deterministic and order-independent", () => {
    expect(caseSetHash(["a", "b", "c"])).toBe(caseSetHash(["c", "a", "b"]))
    expect(caseSetHash(["a", "b"])).not.toBe(caseSetHash(["a", "b", "c"]))
  })

  it("hard-fails when the mandatory baseline fails", () => {
    const d = gate({ current: score(0.99, 50), prior: score(0.9, 50), baselinePassed: false })
    expect(d.pass).toBe(false)
    expect(d.kind).toBe("baseline-fail")
  })

  it("empty golden set is a HARD FAIL, never a green pass", () => {
    const d = gate({ current: score(1, 0), prior: null, baselinePassed: true })
    expect(d.pass).toBe(false)
    expect(d.kind).toBe("empty-suite")
  })

  it("cold-start (no prior) gates on baseline only", () => {
    const d = gate({ current: score(0.5, 50), prior: null, baselinePassed: true })
    expect(d.pass).toBe(true)
    expect(d.kind).toBe("cold-start")
  })

  it("stays cold-start below the seed threshold even with a prior", () => {
    const d = gate({
      current: score(0.5, 5),
      prior: score(0.9, 5),
      baselinePassed: true,
      minSeedCases: 20,
    })
    expect(d.kind).toBe("cold-start")
  })

  it("blocks when prior was scored on a different frozen set", () => {
    const d = gate({
      current: score(0.95, 50, "h2"),
      prior: score(0.9, 50, "h1"),
      baselinePassed: true,
    })
    expect(d.pass).toBe(false)
    expect(d.kind).toBe("case-set-mismatch")
  })

  it("blocks a regression vs the prior version on the same set", () => {
    const d = gate({ current: score(0.8, 50), prior: score(0.9, 50), baselinePassed: true })
    expect(d.pass).toBe(false)
    expect(d.kind).toBe("regression")
  })

  it("passes within tolerance", () => {
    const d = gate({
      current: score(0.89, 50),
      prior: score(0.9, 50),
      baselinePassed: true,
      tolerance: 0.02,
    })
    expect(d.pass).toBe(true)
    expect(d.kind).toBe("ok")
  })
})
