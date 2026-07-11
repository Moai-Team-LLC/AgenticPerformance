# AgenticPerformance

[![Agentic Product Standard: Evals & observability](https://img.shields.io/badge/Agentic_Product_Standard-Evals_%26_observability-1E607A)](https://github.com/Moai-Team-LLC/agentic-product-standard/blob/main/SCORECARD.md)
[![CI](https://github.com/Moai-Team-LLC/AgenticPerformance/actions/workflows/ci.yml/badge.svg)](https://github.com/Moai-Team-LLC/AgenticPerformance/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue)](LICENSE)

**The Agent Performance Layer (APL)** — the reference implementation of the
[Agentic Product Standard](https://github.com/Moai-Team-LLC/agentic-product-standard)'s
*Evals & observability* surface.

**Open-source observability, evaluation, error-taxonomy, and improvement loop for
agentic products.** APL instruments any LLM-agent system — LangGraph, CrewAI, the
OpenAI/Claude Agent SDKs, or a raw agent loop — over OpenTelemetry, and turns raw
execution into: (1) traces you can reason about, (2) per-agent golden-set evals
with a CI gate, (3) named failure clusters with trends, and (4) a governed
improvement loop with three autonomy levels and hard safety boundaries.

APL is **engine-agnostic**: it does not require any particular agent framework or
runtime. It is a separate product from — but a natural companion to — the
[AgenticMind](https://github.com/Moai-Team-LLC/AgenticMind) engine, which is APL's
first-class reference adopter. Apache-2.0 core; enterprise features (SSO/RBAC,
audit, fleet view, on-prem) are a separate edition.

## 🌐 The AgenticProduct ecosystem

One standard and five reference implementations you can run — together they close the loop every production agent needs: **run → remember → measure**, with security as a cross-cutting assurance plane.

|  | Project | Role |
|---|---|---|
| 📐 | [agentic-product-standard](https://github.com/Moai-Team-LLC/agentic-product-standard) | The contract — principles, the autonomy ladder, the harness layers, and eval discipline (plus a Claude Code skill set). |
| ⚙️ | [AgenticOps](https://github.com/Moai-Team-LLC/AgenticOps) | Runtime & operations — deployable manifests, scheduling, a durable backlog, a bounded runner, and fleet health. |
| 🧠 | [AgenticMind](https://github.com/Moai-Team-LLC/AgenticMind) | Knowledge & memory — auditable, self-improving, citation-enforced, over MCP; Postgres-only. |
| 📈 | **AgenticPerformance** (this repo) | Evals & observability — OTel traces, golden-set evals with a CI gate, failure clusters, and the improvement loop. |
| 🌉 | [AgenticGateway](https://github.com/Moai-Team-LLC/AgenticGateway) | Model & cost plane — one key, measured routing, ceilings, cache, evidence. |
| 🛡️ | [AgenticAssurance](https://github.com/Moai-Team-LLC/AgenticAssurance) | Security & assurance — red-teams any agent (OWASP Agentic + MITRE ATLAS), a toxic-flow graph, and SARIF output. |

**How they compose.** **AgenticOps** runs the fleet, **AgenticMind** gives agents auditable knowledge & memory, and **AgenticPerformance** measures every run with traces and evals — closing the **run → remember → measure** loop. **AgenticGateway** is the model plane every LLM call in that loop passes through — one key, eval-measured routing, cost ceilings — and **AgenticAssurance** red-teams any agent in the loop, with the whole stack conforming to the **[agentic-product-standard](https://github.com/Moai-Team-LLC/agentic-product-standard)**.

> Status: `@apl/core` + `@apl/ingest` (OTLP server) + `@apl/worker` are built and
> tested (**122 tests**, `tsc` clean); the migration applies to a fresh Postgres and
> `POST /v1/traces` is verified end-to-end. A published `@apl/sdk` is next.

## The 7 layers

0. **Contract** — OTel GenAI semconv + namespaced `apl.*`, with a normalization
   layer that maps both OpenInference and `gen_ai.*` into one canonical model.
1. **SDK** — a thin `wrapAgent` / `instrumentTools` wrapper + `record*` hooks.
2. **Ingest & store** — OTLP → normalize → a Postgres/TimescaleDB trace store
   (one datastore, tenant-isolated by row-level security).
3. **Registry** — agents and immutable, content-addressed `agent_version`s.
4. **Evaluation** — a mandatory deterministic baseline suite + per-agent golden
   set + a version gate (blocks regression vs the prior version on a frozen set).
5. **Error analysis** — auto-triage → stable, run-over-run failure clusters →
   significance-gated trends.
6. **Improvement** — L1 assisted → L2 suggested → L3 judge-gated auto, inside a
   mechanically-enforced safety envelope (diff allowlist + content guard + a
   fully-justified, rollback-able improvement ledger).
7. **Scorecard** — a headless per-agent read model exposed as API/MCP.

## Layout

```
packages/core        @apl/core — all the logic (contract, SDK, ingest, eval,
                     judge, failure, improve, scorecard, adapters) + Drizzle schema.
  src/vendor/        the ~4 primitives vendored from AgenticMind (PII/injection
                     guard, calibration math, tenant RLS helper, chat seam).
apps/ingest          @apl/ingest — OTLP/JSON server (POST /v1/traces → apl_span).
apps/worker          @apl/worker — the advisory-locked improvement scheduler.
docs/                the PRD (v0.1 → v0.2), the review findings, the phased
                     backlog, and the design decisions.
```

## Quickstart (~5 minutes to your first trace)

Requires [Bun](https://bun.sh) ≥ 1.3 and Docker.

```bash
git clone https://github.com/Moai-Team-LLC/AgenticPerformance
cd AgenticPerformance
bun install
cp .env.example .env.local

docker compose up -d            # Postgres (pgvector + vectorscale + TimescaleDB) on :5439
bun run db:migrate-local        # creates the 10 apl_* tables, RLS, hypertable, retention

bun run ingest                  # the OTLP/JSON trace server on :4319
```

Send a sample agent trace and look at it:

```bash
curl -s -X POST http://localhost:4319/v1/traces \
  -H 'content-type: application/json' \
  --data-binary @examples/otlp-sample.json
# → {"ok":true,"written":3}

docker compose exec db psql -U postgres -c \
  "SELECT operation, name, agent_id, agent_version FROM apl_span ORDER BY start_ts;"
```

You now have an `invoke_agent` → `chat` + `execute_tool` trace in the store —
attributed to an agent + version, tenant-isolated by RLS, with a 90-day retention
policy. From here: wrap your own agent with the SDK (`@apl/core/sdk`), or pipe an
existing OTel Collector at `/v1/traces` (see `deploy/otel-collector.apl.yaml` for
the reference tail-sampling + redaction config). Going beyond localhost? See
[Production deployment](#production-deployment).

## Develop

```
bun install
bun run tsc        # typecheck core + apps (strict)
bun run test       # vitest (122 tests)
```

## Production deployment

The repo ships a full Docker stack behind the compose `full` profile —
TimescaleDB + a one-shot migration + the ingest server on `:4319` + the
improvement worker:

```bash
docker compose --profile full up -d --build
```

Production checklist:

- **Auth (required).** Set `APL_INGEST_TOKEN` to enable Bearer auth on
  `POST /v1/traces`. Without it the ingest endpoint is open — dev only.
  Clients and the Collector must send `Authorization: Bearer <token>`.
  The comparison is constant-time.
- **TLS (required).** The ingest server speaks plain HTTP; run it behind a
  TLS-terminating reverse proxy (Caddy, nginx, or your cloud LB). The Bearer
  token travels in a header, so plaintext HTTP outside localhost is not
  acceptable.
- **Collector.** Point an OTel Collector at `/v1/traces` using
  [`deploy/otel-collector.apl.yaml`](deploy/otel-collector.apl.yaml) — tail
  sampling keeps 100% of errors and slow traces, with defence-in-depth
  redaction. Set `APL_INGEST_ENDPOINT` to the ingest server's URL.
- **Data posture.** Every table is tenant-isolated by row-level security;
  `apl_span` carries a 90-day retention policy; content capture is off by
  default.
- **Payload cap.** `APL_MAX_BODY_BYTES` caps ingest request bodies
  (default 5 MB).

## Design decisions (why it is the way it is)

APL began as a rigorously-reviewed spec. Key locked decisions live in
`docs/APL-PRD-v0.2.md` and `docs/APL-plan-and-openq.md`; the adversarial review
that shaped them is in `docs/APL-REVIEW-findings.md`. Highlights: Postgres-only
(no second datastore — RLS tenant isolation is mandatory for the trace store);
statistically-sound judge calibration (stratified ≥50/class + Wilson lower bound,
not point estimates); mechanically-enforced autonomy boundary (a patch that
smuggles a tool call in prompt text is rejected even if `tools[]` is unchanged);
content-safety on every mined artifact; and an empty golden set is a hard-fail,
never a green gate.

## Provenance & license

Apache-2.0. A handful of small primitives were vendored (clean-room) from the
Apache-2.0 [AgenticMind](https://github.com/Moai-Team-LLC/AgenticMind) engine and
are marked in `packages/core/src/vendor/`. APL is intended as a reference
implementation of the observability/improvement layer described in the
[Agentic Product Standard](https://github.com/Moai-Team-LLC/agentic-product-standard).
