# APL schema (Agent Performance Layer)

Phase-0 registry for the Agent Performance Layer — the observability + evals +
error-taxonomy + improvement-loop subsystem. This directory adds the **agent /
version registry** only (backlog items APL-0.3 + APL-0.4). It is deliberately
**inert until activated** (see below) so it has zero runtime impact on the current
knowledge engine while under review.

## Tables

| Table               | Purpose                                                                                                                                     | Mutability                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `apl_agent`         | A registered agent (product task run by an LLM).                                                                                            | mutable metadata          |
| `apl_agent_prompt`  | Content-addressed prompt store; identical prompts stored once per tenant (dedup on canonical sha256).                                       | append-only               |
| `apl_agent_version` | Immutable config snapshot; any config change mints a new row (FR-REG-4). `config_hash` makes re-registering an identical config idempotent. | append-only (DB-enforced) |

Design decisions baked in (from the PRD v0.2 review):

- **Same Postgres, same RLS.** Every table spreads `tenantColumn` and gets the same
  `FORCE ROW LEVEL SECURITY` / `app.current_tenant` policy as `drizzle/0003` — so
  tenant isolation is enforced below the app, not per-query.
- **Immutability in the DB**, not by convention: `REVOKE UPDATE` + a `BEFORE UPDATE`
  trigger that raises (the trigger is the real guard — the table owner bypasses REVOKE).
- **Prompt dedup** via `apl_agent_prompt` so re-versioning doesn't duplicate multi-KB prompts.
- **Pinned `model_snapshot_id`** (e.g. `gpt-4o-2024-11-20`), never a floating alias.

## Activate (deliberate, not automatic)

1. Wire the three tables into the schema barrel `packages/shared/src/database/schema.ts`
   (import + `export *` + spread into the `schema` object), following the existing
   knowledge entries.
2. `bun run db:generate` — drizzle-kit picks these up via the `**/*.ts` glob and emits
   a numbered `CREATE TABLE` migration under `drizzle/`.
3. **Append** the contents of `_rls-and-immutability.sql` to that generated migration
   (exactly how `0003_tenant_isolation.sql` layers RLS onto generated tables).
4. `bun run db:migrate-local`.

Until step 1, these files are picked up by `db:generate` only if you run it; the
runtime `schema` object does not include them, so the app is unaffected.

## Not yet here (later phases)

`trace/span` (TimescaleDB hypertable), `eval_case`/`eval_run` (+`case_set_hash`),
`judge` (snapshot-pinned + calibration), `failure`/`failure_cluster` (tenant+agent,
label-embedding), `improvement` (full rollback/audit ledger), `scorecard` read-model.
