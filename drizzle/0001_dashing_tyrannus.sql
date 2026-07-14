CREATE TABLE "apl_representativeness_run" (
	"tenant_id" uuid DEFAULT coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"case_set_hash" text NOT NULL,
	"centroid_shift" real NOT NULL,
	"auc" real NOT NULL,
	"drifted" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apl_retrieval_case" (
	"tenant_id" uuid DEFAULT coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"query" text NOT NULL,
	"relevant_memory_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"relevance_grades" jsonb,
	"provenance" jsonb,
	"case_set_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apl_review_capture" (
	"tenant_id" uuid DEFAULT coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_ref" text NOT NULL,
	"decision" text NOT NULL,
	"reviewer" text NOT NULL,
	"rubric_version" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apl_review_capture_decision_check" CHECK ("apl_review_capture"."decision" IN ('approve', 'override', 'reject'))
);
--> statement-breakpoint
ALTER TABLE "apl_eval_case" ADD COLUMN "rubric_version" text;--> statement-breakpoint
ALTER TABLE "apl_eval_case" ADD COLUMN "labeler" text;--> statement-breakpoint
ALTER TABLE "apl_eval_case" ADD COLUMN "label_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "apl_eval_case" ADD COLUMN "agreement" jsonb;--> statement-breakpoint
ALTER TABLE "apl_eval_case" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "apl_failure" ADD COLUMN "pipeline_stage" text;--> statement-breakpoint
ALTER TABLE "apl_judge" ADD COLUMN "status" text DEFAULT 'uncalibrated' NOT NULL;--> statement-breakpoint
ALTER TABLE "apl_judge" ADD COLUMN "card" jsonb;--> statement-breakpoint
ALTER TABLE "apl_representativeness_run" ADD CONSTRAINT "apl_representativeness_run_agent_id_apl_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."apl_agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apl_retrieval_case" ADD CONSTRAINT "apl_retrieval_case_agent_id_apl_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."apl_agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apl_representativeness_run_agent_idx" ON "apl_representativeness_run" USING btree ("tenant_id","agent_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "apl_retrieval_case_set_idx" ON "apl_retrieval_case" USING btree ("tenant_id","agent_id","case_set_hash");--> statement-breakpoint
CREATE INDEX "apl_review_capture_decided_idx" ON "apl_review_capture" USING btree ("tenant_id","decided_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "apl_eval_case" ADD CONSTRAINT "apl_eval_case_origin_check" CHECK ("apl_eval_case"."origin" IS NULL OR "apl_eval_case"."origin" IN ('authored', 'adjudicated', 'review_capture'));--> statement-breakpoint
ALTER TABLE "apl_failure" ADD CONSTRAINT "apl_failure_pipeline_stage_check" CHECK ("apl_failure"."pipeline_stage" IN ('retrieval_miss', 'reasoning_error', 'tool_error', 'verification_error') OR "apl_failure"."pipeline_stage" IS NULL);--> statement-breakpoint
ALTER TABLE "apl_judge" ADD CONSTRAINT "apl_judge_status_check" CHECK ("apl_judge"."status" IN ('calibrated', 'uncalibrated', 'stale'));

-- Tenant RLS for the eval-science tables (same mechanism as the 0000 policies).
--> statement-breakpoint
ALTER TABLE "apl_retrieval_case" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apl_retrieval_case" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "apl_retrieval_case" USING ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid) WITH CHECK ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid);
--> statement-breakpoint
ALTER TABLE "apl_representativeness_run" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apl_representativeness_run" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "apl_representativeness_run" USING ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid) WITH CHECK ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid);
--> statement-breakpoint
ALTER TABLE "apl_review_capture" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apl_review_capture" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "apl_review_capture" USING ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid) WITH CHECK ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid);
