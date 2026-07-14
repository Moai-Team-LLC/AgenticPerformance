import { aplAgent } from "./agent"
import { tenantColumn } from "./_tenant"
import { sql } from "drizzle-orm"
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * APL retrieval golden set (eval-science delta §3, FR-EVAL-6). Retrieval-eval is
 * stored as its OWN case set per agent `{query, relevant_memory_ids[],
 * relevance_grade?, provenance}` — a first-class eval category, separate from the
 * end-to-end golden set (apl_eval_case). `relevance_grades` (memory_id → grade)
 * only exists for graded relevance and is what makes NDCG meaningful;
 * `provenance` carries the FR-EVAL-7 label provenance (labeler, rubric_version,
 * origin, …) — cases without it flag the set `unanchored`. `case_set_hash`
 * versions each frozen generation so the retrieval regression gate compares
 * configurations ON THE SAME frozen set.
 */
const aplRetrievalCase = pgTable(
  "apl_retrieval_case",
  {
    ...tenantColumn,
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => aplAgent.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    relevantMemoryIds: text("relevant_memory_ids")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** memory_id → graded relevance; NDCG is only meaningful when present. */
    relevanceGrades: jsonb("relevance_grades"),
    /** FR-EVAL-7 label provenance; absent → set counts as unanchored. */
    provenance: jsonb("provenance"),
    caseSetHash: text("case_set_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("apl_retrieval_case_set_idx").on(table.tenantId, table.agentId, table.caseSetHash),
  ],
)

type AplRetrievalCaseInsert = typeof aplRetrievalCase.$inferInsert
type AplRetrievalCaseSelect = typeof aplRetrievalCase.$inferSelect

export { aplRetrievalCase, type AplRetrievalCaseInsert, type AplRetrievalCaseSelect }
