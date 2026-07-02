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
