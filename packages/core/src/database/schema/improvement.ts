import { aplAgent } from "./agent"
import { tenantColumn } from "./_tenant"
import { sql } from "drizzle-orm"
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * APL improvement ledger (Phase-4, backlog APL-4.5). Full trace of "what changed →
 * how it affected score → how to roll back" (FR-IMPROVE-5). The judge-gated-auto
 * invariant (lib/apl/improve/ledger.ts) forbids writing an author='judge-gated' row
 * without patch_diff + eval_run + per-mode delta + judge_version + calibration
 * snapshot + source traces + canary/A-B outcome.
 */
const aplImprovement = pgTable(
  "apl_improvement",
  {
    ...tenantColumn,
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => aplAgent.id, { onDelete: "cascade" }),
    versionFrom: text("version_from").notNull(),
    versionTo: text("version_to").notNull(),
    hypothesis: text("hypothesis").notNull(),
    status: text("status").notNull().default("proposed"),
    author: text("author").notNull(),
    patchDiff: jsonb("patch_diff"),
    evalRunId: uuid("eval_run_id"),
    perModeDelta: jsonb("per_mode_delta"),
    judgeVersion: text("judge_version"),
    calibrationSnapshot: jsonb("calibration_snapshot"),
    sourceTraceRefs: text("source_trace_refs").array(),
    canaryAbOutcome: text("canary_ab_outcome"),
    rollbackOf: uuid("rollback_of"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("apl_improvement_agent_idx").on(table.tenantId, table.agentId, table.createdAt.desc()),
    check(
      "apl_improvement_status_check",
      sql`${table.status} IN ('proposed', 'approved', 'rejected', 'canary', 'deployed', 'rolled_back')`,
    ),
    check(
      "apl_improvement_author_check",
      sql`${table.author} IN ('human', 'claude', 'judge-gated')`,
    ),
  ],
)

type AplImprovementInsert = typeof aplImprovement.$inferInsert
type AplImprovementSelect = typeof aplImprovement.$inferSelect

export { aplImprovement, type AplImprovementInsert, type AplImprovementSelect }
