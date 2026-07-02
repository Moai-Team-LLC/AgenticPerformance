import { tenantColumn } from "./_tenant"
import { sql } from "drizzle-orm"
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * APL — a registered agent: a product task executed by an LLM inside a
 * deterministic loop (glossary §3). One row per logical agent; its configuration
 * is never stored here but in immutable `apl_agent_version` snapshots, so a trace
 * can always be attributed to the exact config that produced it (FR-REG-3).
 */
const aplAgent = pgTable(
  "apl_agent",
  {
    ...tenantColumn,
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    productId: text("product_id").notNull(),
    taskDescription: text("task_description").notNull(),
    owner: text("owner").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [index("apl_agent_product_idx").on(table.tenantId, table.productId)],
)

type AplAgentInsert = typeof aplAgent.$inferInsert
type AplAgentSelect = typeof aplAgent.$inferSelect

export { aplAgent, type AplAgentInsert, type AplAgentSelect }
