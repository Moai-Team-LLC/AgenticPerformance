# Contributing to AgenticPerformance

Thanks for your interest. AgenticPerformance (the **Agent Performance Layer**,
APL) is the reference implementation of the
[Agentic Product Standard](https://github.com/Moai-Team-LLC/agentic-product-standard)
*Evals & observability* surface — it turns agent execution into traces, evals,
error clusters, and a governed improvement loop.

## Development

A Bun + workspaces monorepo. Requires [Bun](https://bun.sh) ≥ 1.3.

```bash
bun install          # install dependencies
bun run tsc          # type-check core + apps (strict; this is the gate)
bun run test         # vitest suite
```

Packages: `@apl/core` (all the logic + Drizzle schema), `@apl/ingest` (the OTLP
trace server), `@apl/worker` (the improvement scheduler). The DB layer needs
Postgres with the `vector`, `vectorscale`, `pg_trgm`, and `timescaledb`
extensions; `bun run db:generate` / `db:migrate-local` manage migrations.

## Pull requests

- Keep changes small and focused — one concern per PR.
- Add or update tests for any behavior change; `bun run test` must pass.
- `bun run tsc` must be clean (strict TS: `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax` — the gate is the type-checker, not a linter).
- Match the surrounding style; prefer the minimum that solves the problem.

## Commit messages

This repo follows [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): description` — e.g. `feat(eval): …`, `fix(ingest): …`,
`docs(readme): …`. Allowed types: `feat`, `fix`, `docs`, `refactor`, `perf`,
`test`, `build`, `ci`, `chore`.

## Scope

AgenticPerformance owns the *performance / quality* plane — telemetry contract,
the SDK, trace ingest & store, the agent/version registry, evals + the CI gate,
judge calibration, failure clustering, the improvement loop, and the scorecard.
Agent *runtime / operations* (manifests, scheduling, fleet health) belong to
[AgenticOps](https://github.com/Moai-Team-LLC/AgenticOps); *knowledge / judgment*
to [AgenticMind](https://github.com/Moai-Team-LLC/AgenticMind);
and *correctness / conformance* to
the Standard. Please keep contributions on the performance plane.
