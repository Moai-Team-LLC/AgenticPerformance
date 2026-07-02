-- APL Phase-4 companion migration — tenant RLS for the improvement ledger.
-- Companion to the drizzle-generated CREATE TABLE for apl_improvement (append after
-- `bun run db:generate`, then `bun run db:migrate-local`). Same mechanism as
-- drizzle/0003_tenant_isolation.sql.

ALTER TABLE "apl_improvement" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apl_improvement" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "apl_improvement" USING ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid) WITH CHECK ("tenant_id" = coalesce(current_setting('app.current_tenant', true), '00000000-0000-0000-0000-000000000000')::uuid);
