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
