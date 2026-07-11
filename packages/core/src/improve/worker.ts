/**
 * APL durable improvement sweep (Phase-5, backlog APL-5.3).
 *
 * The pure body of the improvement worker: for every due improvement, resolve an
 * injected A/B decision into a canary event and advance() its status. `advance` is
 * idempotent and guarded, so re-running the sweep with the same resolver after a
 * successful advance is a no-op — that is what makes this safe to run under an
 * at-least-once durable scheduler after a restart.
 *
 * The advisory-lock SCHEDULER that invokes this (single-writer serialization on the
 * Postgres-only substrate) is net-new infra, added by the orchestrator; the store and
 * the resolver are the seams it wires into. Pure — no db/clock/network here.
 */

import type { CanaryEvent } from "./canary"
import type { ImprovementStatus } from "./ledger"
import type { BudgetTracker, LoopBudget, StopReason } from "./loop-budget"

import { advance } from "./canary"
import { createBudgetTracker } from "./loop-budget"

export interface ImprovementRow {
  id: string
  status: ImprovementStatus
}

export interface ImprovementStore {
  due(nowMs: number): Promise<ImprovementRow[]>
  setStatus(id: string, status: ImprovementStatus): Promise<void>
}

/** In-memory store backed by the passed array (mutated in place) — for tests. */
export const inMemoryImprovementStore = (rows: ImprovementRow[]): ImprovementStore => ({
  due: async () => rows,
  setStatus: async (id, status) => {
    const row = rows.find((r) => r.id === id)
    if (row) row.status = status
  },
})

/** Injected decision (e.g. derived from abDecision upstream); null means "not yet". */
export type EventResolver = (row: ImprovementRow) => CanaryEvent | null

export interface SweepResult {
  advanced: number
  skipped: number
  /** Present only when a `tracker` halted the sweep fail-closed; names the breach. */
  stopped?: StopReason
}

/**
 * Advance every due improvement by its resolved event. Idempotent: re-running with the
 * same resolver after an advance yields `advanced: 0` (advance() refuses no-ops and
 * illegal transitions).
 *
 * With a `tracker`, the sweep gains the doctrine §2 fail-block: the budget is checked at
 * the top of each iteration AND again immediately before the point-of-effect write
 * (`setStatus`) — the SHC kill-race lesson — and the sweep stops FAIL-CLOSED (returning
 * `stopped`) on any breach rather than continuing. Without a tracker, behaviour is
 * unchanged (the pure primitive). Prefer `guardedSweep` in production so no sweep runs
 * unbounded.
 */
export const sweepImprovements = async (
  store: ImprovementStore,
  resolve: EventResolver,
  nowMs: number,
  tracker?: BudgetTracker,
): Promise<SweepResult> => {
  const due = await store.due(nowMs)
  let advanced = 0
  let skipped = 0
  for (const row of due) {
    const stopTop = tracker?.shouldStop(nowMs) ?? null
    if (stopTop !== null) return { advanced, skipped, stopped: stopTop }

    const event = resolve(row)
    if (event === null) {
      skipped++
      tracker?.recordIteration()
      continue
    }
    const result = advance(row.status, event)
    if (result.changed) {
      // Re-check the kill/budget at the point-of-effect before the write lands.
      const stopPre = tracker?.shouldStop(nowMs) ?? null
      if (stopPre !== null) return { advanced, skipped, stopped: stopPre }
      await store.setStatus(row.id, result.status)
      advanced++
      if (event === "reject" || event === "ab_rollback") tracker?.recordVerifyFail()
      else tracker?.recordVerifyPass()
    } else {
      skipped++
    }
    // Count the completed iteration last, so maxIterations caps rows processed and the
    // point-of-effect re-check above is about the kill switch, not this row's own count.
    tracker?.recordIteration()
  }
  return { advanced, skipped }
}

/**
 * Fail-closed production entry: a `LoopBudget` is REQUIRED by the signature, so the
 * durable scheduler cannot run an unbounded sweep. Builds a tracker (clock seeded from
 * `nowMs`) and delegates to `sweepImprovements`.
 */
export const guardedSweep = async (
  store: ImprovementStore,
  resolve: EventResolver,
  nowMs: number,
  budget: LoopBudget,
  killSwitch?: () => boolean,
): Promise<SweepResult> => {
  const tracker = createBudgetTracker(budget, nowMs, killSwitch)
  return sweepImprovements(store, resolve, nowMs, tracker)
}
