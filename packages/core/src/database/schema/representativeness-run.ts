import { aplAgent } from "./agent"
import { tenantColumn } from "./_tenant"
import { sql } from "drizzle-orm"
import { boolean, index, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * APL representativeness runs (Eval-Science delta §5/§7, FR-DRIFT-1). One row per
 * rolling comparison of recent prod traffic vs a frozen golden set
 * (`case_set_hash`): centroid-cosine shift + two-sample AUC + the drifted
 * verdict (drift/representativeness.ts). The time series answers "when did my
 * evals stop representing prod?"; a drifted row is what triggers the
 * "golden set refresh" task into the review pipeline (FR-HITL).
 */
const aplRepresentativenessRun = pgTable(
  "apl_representativeness_run",
  {
    ...tenantColumn,
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => aplAgent.id, { onDelete: "cascade" }),
    caseSetHash: text("case_set_hash").notNull(),
    centroidShift: real("centroid_shift").notNull(),
    auc: real("auc").notNull(),
    drifted: boolean("drifted").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("apl_representativeness_run_agent_idx").on(
      table.tenantId,
      table.agentId,
      table.createdAt.desc(),
    ),
  ],
)

type AplRepresentativenessRunInsert = typeof aplRepresentativenessRun.$inferInsert
type AplRepresentativenessRunSelect = typeof aplRepresentativenessRun.$inferSelect

export {
  aplRepresentativenessRun,
  type AplRepresentativenessRunInsert,
  type AplRepresentativenessRunSelect,
}
