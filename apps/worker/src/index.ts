/**
 * @apl/worker — the L3 improvement sweep. Postgres-native: an hourly timer takes a
 * Postgres advisory lock (single-runner across replicas), runs the pure sweep,
 * releases. The EventResolver is a placeholder pending live canary/A-B traffic
 * (wire abDecision over persisted routing outcomes to drive ab_promote / rollback).
 */

import type { EventResolver } from "@apl/core/improve/worker"

import { createClient } from "@apl/core/database/client"
import { sweepImprovements } from "@apl/core/improve/worker"
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

const runGuarded = async (): Promise<void> => {
  const res = await db.execute(sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`)
  const locked = (res.rows[0] as { locked?: boolean } | undefined)?.locked === true
  if (!locked) return
  try {
    await sweepImprovements(pgImprovementStore(db), resolveEvent, Date.now())
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
