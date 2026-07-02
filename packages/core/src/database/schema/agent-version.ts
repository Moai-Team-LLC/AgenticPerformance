import { aplAgent } from "./agent"
import { aplAgentPrompt } from "./agent-prompt"
import { tenantColumn } from "./_tenant"
import { sql } from "drizzle-orm"
import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"

/**
 * Immutable snapshot of an agent's configuration (glossary §3, FR-REG-2/4).
 *
 * Any change to prompt / tools / model / params / context-strategy mints a NEW
 * row; rows are never edited — enforced in the DB by the companion migration
 * (REVOKE UPDATE + a BEFORE UPDATE trigger), mirroring the append-only discipline
 * of the knowledge state machines.
 *
 * `configHash` = sha256 over (prompt_hash + tools_canonical + model_snapshot_id +
 * params + context_strategy). The (tenant_id, agent_id, config_hash) unique key
 * makes re-registering an identical config idempotent instead of minting a
 * duplicate version, so the version timeline stays clean for trend attribution.
 *
 * `modelSnapshotId` is a PINNED snapshot (e.g. `gpt-4o-2024-11-20`), never a
 * floating alias — provider-side model drift under an unchanged alias would
 * otherwise silently invalidate every downstream comparison (judge-drift finding).
 */
const aplAgentVersion = pgTable(
  "apl_agent_version",
  {
    ...tenantColumn,
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => aplAgent.id, { onDelete: "cascade" }),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => aplAgentPrompt.id, { onDelete: "restrict" }),
    /** Denormalised for trace attribution (emitted as the `apl.agent_version` lineage). */
    promptHash: text("prompt_hash").notNull(),
    /** Deterministically serialised tools[] (sorted keys/order) so the hash is stable. */
    toolsCanonical: jsonb("tools_canonical").notNull(),
    modelSnapshotId: text("model_snapshot_id").notNull(),
    params: jsonb("params")
      .notNull()
      .default(sql`'{}'::jsonb`),
    contextStrategy: jsonb("context_strategy"),
    configHash: text("config_hash").notNull(),
    gitRef: text("git_ref"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    unique("apl_agent_version_config_uq").on(table.tenantId, table.agentId, table.configHash),
    index("apl_agent_version_agent_idx").on(table.tenantId, table.agentId, table.createdAt.desc()),
  ],
)

type AplAgentVersionInsert = typeof aplAgentVersion.$inferInsert
type AplAgentVersionSelect = typeof aplAgentVersion.$inferSelect

export { aplAgentVersion, type AplAgentVersionInsert, type AplAgentVersionSelect }
