import { describe, expect, it } from "vitest"

import { isCalibrationStale, judgeVersionHash } from "./version"

const DAY = 86_400_000

describe("APL judge version + staleness (Phase-3 APL-3.1)", () => {
  it("version hash is deterministic and changes with the model snapshot", () => {
    const base = {
      promptHash: "p1",
      modelSnapshotId: "gpt-4o-2024-11-20",
      conventionVersion: "genai-1",
    }
    expect(judgeVersionHash(base)).toBe(judgeVersionHash({ ...base }))
    expect(judgeVersionHash(base)).not.toBe(
      judgeVersionHash({ ...base, modelSnapshotId: "gpt-4o-2025-03-01" }),
    )
  })

  it("stale on prompt change, model change, or age; fresh otherwise", () => {
    const now = 100 * DAY
    const stored = { promptHash: "p1", modelSnapshotId: "m1", calibratedAtMs: now - 5 * DAY }

    expect(isCalibrationStale(stored, { promptHash: "p1", modelSnapshotId: "m1" }, now).stale).toBe(
      false,
    )
    expect(
      isCalibrationStale(stored, { promptHash: "p2", modelSnapshotId: "m1" }, now).reason,
    ).toBe("judge prompt changed")
    expect(
      isCalibrationStale(stored, { promptHash: "p1", modelSnapshotId: "m2" }, now).reason,
    ).toBe("model snapshot changed")
    const old = { promptHash: "p1", modelSnapshotId: "m1", calibratedAtMs: now - 40 * DAY }
    expect(
      isCalibrationStale(old, { promptHash: "p1", modelSnapshotId: "m1" }, now, 30).stale,
    ).toBe(true)
  })
})
