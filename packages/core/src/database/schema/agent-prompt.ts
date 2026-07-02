import { tenantColumn } from "./_tenant"
import { sql } from "drizzle-orm"
import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"

/**
 * Content-addressed prompt store. Identical prompts are stored ONCE per tenant
 * (dedup on the canonical sha256), so an agent re-versioned dozens of times does
 * not duplicate its multi-KB prompt across every `apl_agent_version` row
 * (addresses the version-bloat finding). Append-only — enforced in the DB by the
 * companion migration (`_rls-and-immutability.sql`).
 */
const aplAgentPrompt = pgTable(
  "apl_agent_prompt",
  {
    ...tenantColumn,
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** sha256 over the CANONICALISED prompt (trimmed, whitespace-normalised). */
    promptHash: text("prompt_hash").notNull(),
    prompt: text("prompt").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [unique("apl_agent_prompt_tenant_hash_uq").on(table.tenantId, table.promptHash)],
)

type AplAgentPromptInsert = typeof aplAgentPrompt.$inferInsert
type AplAgentPromptSelect = typeof aplAgentPrompt.$inferSelect

export { aplAgentPrompt, type AplAgentPromptInsert, type AplAgentPromptSelect }
