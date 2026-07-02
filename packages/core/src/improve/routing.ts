/**
 * APL canary traffic routing (Phase-5, backlog APL-5.4).
 *
 * The pure decision half of a canary rollout: which arm a trace lands in, and —
 * once outcomes accrue — whether the canary should be promoted or rolled back.
 * Assignment is DETERMINISTIC per traceId (same trace always resolves to the same
 * arm for a given ratio) so a resumed/retried trace never flips arms, reusing the
 * shared hash unit from the mining split. The A/B verdict delegates to canary.ts's
 * promote/rollback rule. Real traffic integration (splitting live requests, wiring
 * the ratio) is net-new infra at the product boundary — deferred; this is the seam.
 */

import { hashUnit } from "../eval/mining"
import { abDecision, type ArmStats } from "./canary"

export type Arm = "canary" | "prod"

/**
 * Deterministic arm for a trace. ratio <= 0 sends all traffic to prod, ratio >= 1
 * all to canary; in between, a stable per-trace hash decides (same id → same arm).
 */
export const assignArm = (traceId: string, canaryRatio: number): Arm =>
  canaryRatio <= 0
    ? "prod"
    : canaryRatio >= 1
      ? "canary"
      : hashUnit(traceId) < canaryRatio
        ? "canary"
        : "prod"

export interface Outcome {
  arm: Arm
  pass: boolean
}

/** Per-arm counts + pass rates from observed outcomes (passRate is 0 for an empty arm). */
export const accumulate = (outcomes: readonly Outcome[]): { canary: ArmStats; prod: ArmStats } => {
  const tally: Record<Arm, { n: number; passes: number }> = {
    canary: { n: 0, passes: 0 },
    prod: { n: 0, passes: 0 },
  }
  for (const o of outcomes) {
    const arm = tally[o.arm]
    arm.n += 1
    if (o.pass) arm.passes += 1
  }
  const stats = (t: { n: number; passes: number }): ArmStats => ({
    n: t.n,
    passRate: t.n === 0 ? 0 : t.passes / t.n,
  })
  return { canary: stats(tally.canary), prod: stats(tally.prod) }
}

/** Accumulate outcomes into per-arm stats, then apply the promote/rollback rule. */
export const routeAndDecide = (
  outcomes: readonly Outcome[],
  opts?: { minSample?: number; margin?: number },
): ReturnType<typeof abDecision> => {
  const { canary, prod } = accumulate(outcomes)
  return abDecision({ canary, prod, minSample: opts?.minSample, margin: opts?.margin })
}
