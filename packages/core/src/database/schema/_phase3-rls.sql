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
