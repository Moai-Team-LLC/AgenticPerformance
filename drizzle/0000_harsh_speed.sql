-- APL needs three extensions; the timescale/timescaledb-ha image bundles all binaries.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vectorscale;--> statement-breakpoint
CREATE TABLE "apl_agent_prompt" (
	"tenant_id" uuid DEFAULT coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_hash" text NOT NULL,
	"prompt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apl_agent_prompt_tenant_hash_uq" UNIQUE("tenant_id","prompt_hash")
);
--> statement-breakpoint
CREATE TABLE "apl_agent_version" (
	"tenant_id" uuid DEFAULT coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"prompt_hash" text NOT NULL,
	"tools_canonical" jsonb NOT NULL,
	"model_snapshot_id" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"context_strategy" jsonb,
	"config_hash" text NOT NULL,
	"git_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apl_agent_version_config_uq" UNIQUE("tenant_id","agent_id","config_hash")
);
--> statement-breakpoint
CREATE TABLE "apl_agent" (
	"tenant_id" uuid DEFAULT coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" text NOT NULL,
	"task_description" text NOT NULL,
	"owner" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apl_eval_case" (
	"tenant_id" uuid DEFAULT coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"input" text NOT NULL,
	"reference" jsonb,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"source" text NOT NULL,
	"case_set_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apl_eval_case_source_check" CHECK ("apl_eval_case"."source" IN ('curated', 'mined'))
);
--> statement-breakpoint
CREATE TABLE "apl_eval_run" (
	"tenant_id" uuid DEFAULT coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"case_set_hash" text NOT NULL,
	"judge_version" text,
	"pass_rate" real NOT NULL,
	"total" integer NOT NULL,
	"scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apl_failure" (
	"tenant_id" uuid DEFAULT coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_ref" text NOT NULL,
	"cluster_id" uuid,
	"agent_version_id" uuid,
	"severity" text,
	"cost" real,
	"latency_ms" integer,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apl_failure_cluster" (
	"tenant_id" uuid DEFAULT coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"label" text NOT NULL,
	"label_embedding" vector(1024),
	"description" text,
	"member_count" integer DEFAULT 0 NOT NULL,
	"trend" text DEFAULT 'flat' NOT NULL,
	"example_refs" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apl_improvement" (
	"tenant_id" uuid DEFAULT coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"version_from" text NOT NULL,
	"version_to" text NOT NULL,
	"hypothesis" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"author" text NOT NULL,
	"patch_diff" jsonb,
	"eval_run_id" uuid,
	"per_mode_delta" jsonb,
	"judge_version" text,
	"calibration_snapshot" jsonb,
	"source_trace_refs" text[],
	"canary_ab_outcome" text,
	"rollback_of" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apl_improvement_status_check" CHECK ("apl_improvement"."status" IN ('proposed', 'approved', 'rejected', 'canary', 'deployed', 'rolled_back')),
	CONSTRAINT "apl_improvement_author_check" CHECK ("apl_improvement"."author" IN ('human', 'claude', 'judge-gated'))
);
--> statement-breakpoint
CREATE TABLE "apl_judge" (
	"tenant_id" uuid DEFAULT coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"prompt" text NOT NULL,
	"model_snapshot_id" text NOT NULL,
	"convention_version" text NOT NULL,
	"calibration" jsonb,
	"calibrated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apl_span" (
	"tenant_id" uuid DEFAULT coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid NOT NULL,
	"trace_id" text NOT NULL,
	"span_id" text NOT NULL,
	"parent_span_id" text,
	"operation" text,
	"name" text NOT NULL,
	"agent_id" text,
	"agent_version" text,
	"start_ts" timestamp with time zone NOT NULL,
	"end_ts" timestamp with time zone NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "apl_span_start_ts_span_id_pk" PRIMARY KEY("start_ts","span_id")
);
--> statement-breakpoint
ALTER TABLE "apl_agent_version" ADD CONSTRAINT "apl_agent_version_agent_id_apl_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."apl_agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apl_agent_version" ADD CONSTRAINT "apl_agent_version_prompt_id_apl_agent_prompt_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."apl_agent_prompt"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apl_eval_case" ADD CONSTRAINT "apl_eval_case_agent_id_apl_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."apl_agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apl_eval_run" ADD CONSTRAINT "apl_eval_run_agent_id_apl_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."apl_agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apl_eval_run" ADD CONSTRAINT "apl_eval_run_agent_version_id_apl_agent_version_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."apl_agent_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apl_failure" ADD CONSTRAINT "apl_failure_cluster_id_apl_failure_cluster_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."apl_failure_cluster"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apl_failure" ADD CONSTRAINT "apl_failure_agent_version_id_apl_agent_version_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."apl_agent_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apl_failure_cluster" ADD CONSTRAINT "apl_failure_cluster_agent_id_apl_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."apl_agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apl_improvement" ADD CONSTRAINT "apl_improvement_agent_id_apl_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."apl_agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apl_agent_version_agent_idx" ON "apl_agent_version" USING btree ("tenant_id","agent_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "apl_agent_product_idx" ON "apl_agent" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "apl_eval_case_set_idx" ON "apl_eval_case" USING btree ("tenant_id","agent_id","case_set_hash");--> statement-breakpoint
CREATE INDEX "apl_eval_run_agent_idx" ON "apl_eval_run" USING btree ("tenant_id","agent_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "apl_failure_cluster_ref_idx" ON "apl_failure" USING btree ("tenant_id","cluster_id");--> statement-breakpoint
CREATE INDEX "apl_failure_cluster_agent_idx" ON "apl_failure_cluster" USING btree ("tenant_id","agent_id");--> statement-breakpoint
CREATE INDEX "apl_failure_cluster_label_idx" ON "apl_failure_cluster" USING diskann ("label_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "apl_improvement_agent_idx" ON "apl_improvement" USING btree ("tenant_id","agent_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "apl_judge_version_idx" ON "apl_judge" USING btree ("tenant_id","version");--> statement-breakpoint
CREATE INDEX "apl_span_trace_idx" ON "apl_span" USING btree ("tenant_id","trace_id");--> statement-breakpoint
CREATE INDEX "apl_span_agent_idx" ON "apl_span" USING btree ("tenant_id","agent_id","start_ts" DESC NULLS LAST);
--> statement-breakpoint
-- APL Phase-0 companion migration — tenant RLS + append-only immutability.
--
-- This is NOT a standalone drizzle migration. Like `drizzle/0003_tenant_isolation.sql`,
-- the CREATE TABLE DDL for apl_agent / apl_agent_prompt / apl_agent_version is produced
-- by `bun run db:generate` (once these schema files are wired into the barrel — see
-- README.md). APPEND the statements below to that generated migration file, then run
-- `bun run db:migrate-local`. Kept here (a `.sql`, ignored by the drizzle `**/*.ts`
-- glob) so it does not disturb the numbered migration chain / meta/_journal.json.

-- ── Tenant isolation (same mechanism as drizzle/0003: FORCE RLS on app.current_tenant) ──
ALTER TABLE "apl_agent" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apl_agent" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "apl_agent" USING ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid) WITH CHECK ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid);
--> statement-breakpoint
ALTER TABLE "apl_agent_prompt" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apl_agent_prompt" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "apl_agent_prompt" USING ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid) WITH CHECK ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid);
--> statement-breakpoint
ALTER TABLE "apl_agent_version" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apl_agent_version" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "apl_agent_version" USING ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid) WITH CHECK ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid);
--> statement-breakpoint

-- ── Append-only immutability (FR-REG-4: config change mints a NEW version) ──
-- Trigger is the robust guard (the table owner bypasses REVOKE); REVOKE is defense-in-depth.
CREATE OR REPLACE FUNCTION apl_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'apl: % is append-only; % is not permitted (mint a new agent_version instead)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER apl_agent_version_no_update BEFORE UPDATE ON "apl_agent_version" FOR EACH ROW EXECUTE FUNCTION apl_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER apl_agent_prompt_no_update BEFORE UPDATE ON "apl_agent_prompt" FOR EACH ROW EXECUTE FUNCTION apl_reject_mutation();
--> statement-breakpoint
REVOKE UPDATE ON "apl_agent_version", "apl_agent_prompt" FROM PUBLIC;
--> statement-breakpoint
-- APL Phase-1 companion — turn apl_span into a TimescaleDB hypertable with
-- retention + tenant RLS. Merged into drizzle/0004 (canonical, applied); kept for
-- reference. TimescaleDB must be installed (deploy ships timescale/timescaledb-ha:pg17;
-- 00-extensions.sql creates the extension on fresh init).
--
-- NOTE (verified live on TimescaleDB 2.27): columnstore/compression is intentionally
-- NOT enabled — TS forbids ROW LEVEL SECURITY on a columnstore hypertable, and RLS
-- tenant isolation of the trace store is mandatory (NFR-TENANT-1). Retention bounds
-- storage; compression can return per-tenant-DB / coarser once RLS+columnstore coexist.

CREATE EXTENSION IF NOT EXISTS timescaledb;
--> statement-breakpoint
SELECT create_hypertable('apl_span', by_range('start_ts'), if_not_exists => TRUE);
--> statement-breakpoint
-- Default retention; FR-INGEST-4 makes this a per-tenant/severity policy (Q2). 90d baseline:
SELECT add_retention_policy('apl_span', INTERVAL '90 days', if_not_exists => TRUE);
--> statement-breakpoint

-- Tenant isolation (same mechanism as drizzle/0003).
ALTER TABLE "apl_span" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apl_span" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "apl_span" USING ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid) WITH CHECK ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid);
--> statement-breakpoint
-- APL Phase-2 companion migration — tenant RLS for the eval store.
-- Companion to the drizzle-generated CREATE TABLE for apl_eval_case / apl_eval_run
-- (append after `bun run db:generate`, then `bun run db:migrate-local`). Same
-- mechanism as drizzle/0003_tenant_isolation.sql.

ALTER TABLE "apl_eval_case" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apl_eval_case" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "apl_eval_case" USING ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid) WITH CHECK ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid);
--> statement-breakpoint
ALTER TABLE "apl_eval_run" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apl_eval_run" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "apl_eval_run" USING ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid) WITH CHECK ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid);
--> statement-breakpoint
-- APL Phase-3 companion migration — tenant RLS for judge + failure tables.
-- Companion to the drizzle-generated CREATE TABLE for apl_judge /
-- apl_failure_cluster / apl_failure (append after `bun run db:generate`, then
-- `bun run db:migrate-local`). Same mechanism as drizzle/0003_tenant_isolation.sql.

ALTER TABLE "apl_judge" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apl_judge" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "apl_judge" USING ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid) WITH CHECK ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid);
--> statement-breakpoint
ALTER TABLE "apl_failure_cluster" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apl_failure_cluster" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "apl_failure_cluster" USING ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid) WITH CHECK ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid);
--> statement-breakpoint
ALTER TABLE "apl_failure" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apl_failure" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "apl_failure" USING ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid) WITH CHECK ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid);
--> statement-breakpoint
-- APL Phase-4 companion migration — tenant RLS for the improvement ledger.
-- Companion to the drizzle-generated CREATE TABLE for apl_improvement (append after
-- `bun run db:generate`, then `bun run db:migrate-local`). Same mechanism as
-- drizzle/0003_tenant_isolation.sql.

ALTER TABLE "apl_improvement" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apl_improvement" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "apl_improvement" USING ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid) WITH CHECK ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid);
