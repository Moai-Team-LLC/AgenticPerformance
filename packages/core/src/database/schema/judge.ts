import { tenantColumn } from "./_tenant"
import { sql } from "drizzle-orm"
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * APL judge registry (Phase-3, backlog APL-3.1). A judge is a versioned entity:
 * `version` is the content hash over prompt + model_snapshot_id + convention
 * (lib/apl/judge/version.ts). `model_snapshot_id` is a PINNED snapshot, never a
 * floating alias — provider drift under an unchanged alias would otherwise leave a
 * stale calibration "valid". `calibration` holds the stratified report (TPR/TNR,
 * Wilson bounds, per-class counts, verdict→binary mapping).
 */
const aplJudge = pgTable(
  "apl_judge",
  {
    ...tenantColumn,
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    version: text("version").notNull(),
    prompt: text("prompt").notNull(),
    modelSnapshotId: text("model_snapshot_id").notNull(),
    conventionVersion: text("convention_version").notNull(),
    calibration: jsonb("calibration"),
    calibratedAt: timestamp("calibrated_at", { withTimezone: true }),
    /** Judge Card status (FR-JUDGE-5/6): only 'calibrated' may gate (Cycle of Trust). */
    status: text("status").notNull().default("uncalibrated"),
    /** Full Judge Card artifact (FR-JUDGE-5): ECE, Brier, bias battery, anchor sample provenance. */
    card: jsonb("card"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("apl_judge_version_idx").on(table.tenantId, table.version),
    check(
      "apl_judge_status_check",
      sql`${table.status} IN ('calibrated', 'uncalibrated', 'stale')`,
    ),
  ],
)

type AplJudgeInsert = typeof aplJudge.$inferInsert
type AplJudgeSelect = typeof aplJudge.$inferSelect

export { aplJudge, type AplJudgeInsert, type AplJudgeSelect }
