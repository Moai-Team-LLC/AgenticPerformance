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
