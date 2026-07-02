import { aplAgent } from "./agent"
import { aplAgentVersion } from "./agent-version"
import { tenantColumn } from "./_tenant"
import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

/**
 * APL evaluation store (Phase-2, backlog APL-2.1).
 *
 * Golden set is PER AGENT (FR-EVAL-1 / R1) — no global suite. `case_set_hash`
 * versions each frozen generation of the set so a score trend is comparable over
 * time (FR-EVAL-4/5): a run is scored against a specific frozen set, and the
 * version gate compares the new agent_version to the prior one ON THE SAME HASH.
 */
const aplEvalCase = pgTable(
  "apl_eval_case",
  {
    ...tenantColumn,
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => aplAgent.id, { onDelete: "cascade" }),
    input: text("input").notNull(),
    /** Reference answer / rubric (shape is agent-specific). */
    reference: jsonb("reference"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** curated (hand-seeded) | mined (grown from prod). */
    source: text("source").notNull(),
    caseSetHash: text("case_set_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("apl_eval_case_set_idx").on(table.tenantId, table.agentId, table.caseSetHash),
    check("apl_eval_case_source_check", sql`${table.source} IN ('curated', 'mined')`),
  ],
)

/**
 * One eval run of an agent_version against a frozen case set. `pass_rate` + `total`
 * feed the version gate; `total = 0` must be a HARD FAIL upstream, never a green
 * pass (the knowledge harness's passRate=1-on-empty is the bug this design avoids).
 */
const aplEvalRun = pgTable(
  "apl_eval_run",
  {
    ...tenantColumn,
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => aplAgent.id, { onDelete: "cascade" }),
    agentVersionId: uuid("agent_version_id")
      .notNull()
      .references(() => aplAgentVersion.id, { onDelete: "cascade" }),
    caseSetHash: text("case_set_hash").notNull(),
    judgeVersion: text("judge_version"),
    passRate: real("pass_rate").notNull(),
    total: integer("total").notNull(),
    scores: jsonb("scores")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("apl_eval_run_agent_idx").on(table.tenantId, table.agentId, table.createdAt.desc()),
  ],
)

type AplEvalCaseInsert = typeof aplEvalCase.$inferInsert
type AplEvalCaseSelect = typeof aplEvalCase.$inferSelect
type AplEvalRunInsert = typeof aplEvalRun.$inferInsert
type AplEvalRunSelect = typeof aplEvalRun.$inferSelect

export {
  aplEvalCase,
  aplEvalRun,
  type AplEvalCaseInsert,
  type AplEvalCaseSelect,
  type AplEvalRunInsert,
  type AplEvalRunSelect,
}
