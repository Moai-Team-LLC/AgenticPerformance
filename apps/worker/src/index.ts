/**
 * @apl/worker — the L3 improvement sweep. Postgres-native: an hourly timer takes a
 * Postgres advisory lock (single-runner across replicas), runs the pure sweep,
 * releases. The EventResolver is a placeholder pending live canary/A-B traffic
 * (wire abDecision over persisted routing outcomes to drive ab_promote / rollback).
 */

import type { LoopBudget } from "@apl/core/improve/loop-budget"
import type { EventResolver } from "@apl/core/improve/worker"

import { createClient } from "@apl/core/database/client"
import { guardedSweep } from "@apl/core/improve/worker"
import { sql } from "drizzle-orm"

import { pgImprovementStore } from "./store"

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined || databaseUrl.length === 0) {
  console.error("[apl-worker] DATABASE_URL is required")
  process.exit(1)
}
const db = createClient(databaseUrl)

const ADVISORY_LOCK_KEY = 4_242_043
const HOUR_MS = 60 * 60 * 1000

// Placeholder — no traffic data flowing yet, so no improvement auto-advances.
const resolveEvent: EventResolver = () => null

/** Positive-number env override, else the default. */
const numEnv = (key: string, fallback: number): number => {
  const value = Number(process.env[key])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

// Doctrine §2 fail-block: the durable sweep runs under an explicit, env-tunable budget
// (fail-closed — guardedSweep requires it) instead of unbounded.
const SWEEP_BUDGET: LoopBudget = {
  maxIterations: numEnv("APL_SWEEP_MAX_ITERATIONS", 500),
  tokenBudget: numEnv("APL_SWEEP_TOKEN_BUDGET", 5_000_000),
  costCapUsd: numEnv("APL_SWEEP_COST_CAP_USD", 25),
  timeoutMs: numEnv("APL_SWEEP_TIMEOUT_MS", 10 * 60 * 1000),
  escalateAfterVerifyFails: numEnv("APL_SWEEP_ESCALATE_AFTER_VERIFY_FAILS", 5),
}
// Kill switch is re-read on every budget check, so flipping it halts an in-flight sweep.
const killSwitch = (): boolean => process.env.APL_SWEEP_KILL === "1"

const runGuarded = async (): Promise<void> => {
  const res = await db.execute(sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`)
  const locked = (res.rows[0] as { locked?: boolean } | undefined)?.locked === true
  if (!locked) return
  try {
    const result = await guardedSweep(
      pgImprovementStore(db),
      resolveEvent,
      Date.now(),
      SWEEP_BUDGET,
      killSwitch,
    )
    if (result.stopped !== undefined) {
      console.warn(
        `[apl-worker] sweep stopped fail-closed: ${result.stopped} (advanced ${result.advanced}, skipped ${result.skipped}) — escalate`,
      )
    }
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`)
  }
}

const timer = setInterval(() => {
  void runGuarded().catch((error: unknown) => {
    console.error("[apl-worker] sweep error:", error)
  })
}, HOUR_MS)

const shutdown = (): void => {
  clearInterval(timer)
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

console.log("[apl-worker] improvement scheduler started (hourly, advisory-locked)")
