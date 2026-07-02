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

import { advance } from "./canary"

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
}

/**
 * Advance every due improvement by its resolved event. Idempotent: re-running with the
 * same resolver after an advance yields `advanced: 0` (advance() refuses no-ops and
 * illegal transitions).
 */
export const sweepImprovements = async (
  store: ImprovementStore,
  resolve: EventResolver,
  nowMs: number,
): Promise<SweepResult> => {
  const due = await store.due(nowMs)
  let advanced = 0
  let skipped = 0
  for (const row of due) {
    const event = resolve(row)
    if (event === null) {
      skipped++
      continue
    }
    const result = advance(row.status, event)
    if (result.changed) {
      await store.setStatus(row.id, result.status)
      advanced++
    } else {
      skipped++
    }
  }
  return { advanced, skipped }
}
