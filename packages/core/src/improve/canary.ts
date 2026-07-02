/**
 * APL L3 canary orchestration (Phase-5, backlog APL-5.3/5.4).
 *
 * `advance` is the pure, IDEMPOTENT step function for the improvement state machine
 * — safe to call again after a worker restart (already-at-target is a no-op, illegal
 * transitions are refused), which is what makes a resumable durable workflow possible
 * on the Postgres-only substrate. `abDecision` is the pure promote/rollback rule.
 *
 * The DURABLE WORKER that calls advance() and the TRAFFIC ROUTING that produces the
 * A/B stats are net-new infra (no broker / no rollout code in the engine today) —
 * deferred; these are the decision seams they wire into.
 */

import type { ImprovementStatus } from "./ledger"

import { canTransition } from "./ledger"

export type CanaryEvent = "approve" | "reject" | "start_canary" | "ab_promote" | "ab_rollback"

const EVENT_TARGET: Readonly<Record<CanaryEvent, ImprovementStatus>> = {
  approve: "approved",
  reject: "rejected",
  start_canary: "canary",
  ab_promote: "deployed",
  ab_rollback: "rolled_back",
}

export interface AdvanceResult {
  status: ImprovementStatus
  changed: boolean
  reason?: string
}

/** Idempotent, guarded state advance — resumable after a restart. */
export const advance = (current: ImprovementStatus, event: CanaryEvent): AdvanceResult => {
  const target = EVENT_TARGET[event]
  if (current === target)
    return { status: current, changed: false, reason: "already at target (idempotent)" }
  if (!canTransition(current, target)) {
    return { status: current, changed: false, reason: `illegal transition ${current} -> ${target}` }
  }
  return { status: target, changed: true }
}

export interface ArmStats {
  passRate: number
  n: number
}

export interface AbInput {
  canary: ArmStats
  prod: ArmStats
  minSample?: number
  margin?: number
}

export type AbVerdict = "promote" | "rollback" | "inconclusive"

/**
 * Promote/rollback rule. Requires a minimum sample per arm (no decision on noise) and
 * a margin so a within-noise delta is inconclusive rather than a promote.
 */
export const abDecision = (input: AbInput): { verdict: AbVerdict; reason: string } => {
  const minSample = input.minSample ?? 100
  const margin = input.margin ?? 0.02
  if (input.canary.n < minSample || input.prod.n < minSample) {
    return {
      verdict: "inconclusive",
      reason: `insufficient sample (canary ${input.canary.n}, prod ${input.prod.n}, need >= ${minSample})`,
    }
  }
  const delta = input.canary.passRate - input.prod.passRate
  if (delta < -margin)
    return { verdict: "rollback", reason: `canary worse by ${(-delta).toFixed(3)} > ${margin}` }
  if (delta > margin)
    return { verdict: "promote", reason: `canary better by ${delta.toFixed(3)} > ${margin}` }
  return { verdict: "inconclusive", reason: `within margin (delta ${delta.toFixed(3)})` }
}
