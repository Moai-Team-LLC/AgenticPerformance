/**
 * Postgres client + tenant scoping for @apl/core. Single Postgres (pgvector +
 * TimescaleDB), tenant-isolated by row-level security keyed on the
 * `app.current_tenant` GUC (see the migration companion RLS). `withTenant` sets
 * the GUC transaction-locally so RLS enforces isolation below the app.
 */

import type { NodePgDatabase } from "drizzle-orm/node-postgres"

import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { schema } from "./schema"

export type AplDatabase = NodePgDatabase<typeof schema>

/** Single-tenant sentinel (matches the tenant_id column DEFAULT). */
export const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000000"

export const createClient = (databaseUrl: string): AplDatabase =>
  drizzle(new Pool({ connectionString: databaseUrl }), { schema })

/**
 * Runs `fn` with `app.current_tenant` set to `tenantId` for the duration of a
 * transaction, so every read/write inside is RLS-scoped to that tenant.
 */
export const withTenant = async <T>(
  db: AplDatabase,
  tenantId: string,
  fn: (tx: AplDatabase) => Promise<T>,
): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`)
    return fn(tx as unknown as AplDatabase)
  })
