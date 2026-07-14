import { aplAgent } from "./agent"
import { aplAgentVersion } from "./agent-version"
import { EMBEDDING_DIMENSIONS } from "./_config"
import { tenantColumn } from "./_tenant"
import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core"

/**
 * APL failure clusters (Phase-3, backlog APL-3.3). Keyed (tenant_id, agent_id) —
 * a NEW table, NOT the /ask ask_clusters renamed (which has no agent dimension, so
 * two agents' failures would merge and violate R1/FR-EVAL-1). `label_embedding`
 * gives clusters a durable, run-over-run identity (lib/apl/failure/cluster-identity.ts).
 */
const aplFailureCluster = pgTable(
  "apl_failure_cluster",
  {
    ...tenantColumn,
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => aplAgent.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    labelEmbedding: vector("label_embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    description: text("description"),
    memberCount: integer("member_count").notNull().default(0),
    trend: text("trend").notNull().default("flat"),
    exampleRefs: text("example_refs")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("apl_failure_cluster_agent_idx").on(table.tenantId, table.agentId),
    index("apl_failure_cluster_label_idx").using(
      "diskann",
      table.labelEmbedding.op("vector_cosine_ops"),
    ),
  ],
)

/** An individual failure, triaged into a cluster, carrying cost/latency for FR-FAIL-4. */
const aplFailure = pgTable(
  "apl_failure",
  {
    ...tenantColumn,
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    traceRef: text("trace_ref").notNull(),
    clusterId: uuid("cluster_id").references(() => aplFailureCluster.id, { onDelete: "set null" }),
    agentVersionId: uuid("agent_version_id").references(() => aplAgentVersion.id, {
      onDelete: "set null",
    }),
    severity: text("severity"),
    cost: real("cost"),
    latencyMs: integer("latency_ms"),
    /**
     * Pipeline-stage attribution (FR-FAIL-6), orthogonal to the cluster taxonomy —
     * mirrors PIPELINE_STAGES (lib/apl/failure/stage.ts). NULL = untagged legacy row.
     */
    pipelineStage: text("pipeline_stage"),
    discoveredAt: timestamp("discovered_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("apl_failure_cluster_ref_idx").on(table.tenantId, table.clusterId),
    check(
      "apl_failure_pipeline_stage_check",
      sql`${table.pipelineStage} IN ('retrieval_miss', 'reasoning_error', 'tool_error', 'verification_error') OR ${table.pipelineStage} IS NULL`,
    ),
  ],
)

type AplFailureClusterInsert = typeof aplFailureCluster.$inferInsert
type AplFailureClusterSelect = typeof aplFailureCluster.$inferSelect
type AplFailureInsert = typeof aplFailure.$inferInsert
type AplFailureSelect = typeof aplFailure.$inferSelect

export {
  aplFailure,
  aplFailureCluster,
  type AplFailureClusterInsert,
  type AplFailureClusterSelect,
  type AplFailureInsert,
  type AplFailureSelect,
}
