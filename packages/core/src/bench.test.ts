import { describe, expect, it } from "vitest"

import { measureOverhead } from "./bench"

describe("APL SDK-overhead benchmark (Phase-1 APL-1.6)", () => {
  it("returns finite numbers with a non-negative per-op overhead", async () => {
    const r = await measureOverhead(50)
    expect(r.iterations).toBe(50)
    expect(Number.isFinite(r.baselineMs)).toBe(true)
    expect(Number.isFinite(r.instrumentedMs)).toBe(true)
    expect(Number.isFinite(r.overheadPerOpMicros)).toBe(true)
    // Absolute magnitude is machine-dependent; only the floor is guaranteed.
    expect(r.overheadPerOpMicros).toBeGreaterThanOrEqual(0)
  })
})
