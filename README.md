# APL — Agent Performance Layer (планирование)

Модуль/подсистема наблюдаемости + evals + таксономии ошибок + цикла улучшения агентов поверх движка **AgenticMind** (`/Users/duchenchuk/Desktop/AgenticMind`, локально v0.8.0). Владелец: Moai Team LLC.

## Файлы

| Файл | Что это |
|---|---|
| `APL-PRD-v0.1.md` | Исходный PRD (черновик к ревью). |
| `APL-REVIEW-findings.md` | 49 findings с severity/verdict (✅ verified · ◐ plausible · ○ не в топ-26 · ✗ refuted), WHY + FIX + steelman. Grounded в реальный код. |
| `APL-contradictions.md` | 30 feasibility-противоречий с движком (evidence + note). |
| `APL-plan-and-openq.md` | Ответы на §14 (Q1–Q5) + план Phase 0→5 (north-star, reuse/net-new/gate/risks на фазу, критпуть, топ-риски). |
| `APL-PRD-v0.2-delta.md` | **Готовые к вставке правки** к v0.1 по каждому спорному требованию (`БЫЛО→СТАЛО`/`NEW`), + changelog D1–D26, + новые §15/§16/§17. |
| `APL-PRD-v0.2.md` | **Цельный пересобранный PRD v0.2** (v0.1 + все правки + закрытые Q1–Q5 + план + §15–§17). Готов на согласование. |
| `APL-backlog.md` | Issue-shaped бэклог по фазам: Scope/Reuse/Net-new/Acceptance/Depends на айтем. |

## Код (Phase 0)

Первый слой Phase-0 (реестр APL-0.3/0.4) написан в репо AgenticMind на **локальной ветке `feat/apl-phase0-registry` (не запушено)**: `packages/shared/src/database/schema/apl/` — таблицы `apl_agent` / `apl_agent_prompt` / `apl_agent_version` (immutable, canonical hashing, dedup) + companion `_rls-and-immutability.sql` (RLS как `0003` + append-only триггер) + README с шагами активации. `tsc` зелёный; инертны, пока не подключены в barrel. Откат: `git checkout feat/knowledge-salvage && git branch -D feat/apl-phase0-registry`. (Lint oxlint требует Node 22 — гонять там; tsc = основной гейт.)

## Метод ревью

Workflow: 8 grounded-линз (contract/OTel · SDK · ingest/registry · eval · judge · failure · improve/trust · integ/NFR) → 53 findings → 26 адверсариально верифицировано (22 выжило вкл. 1 Critical, 4 отклонено) → §14-ответы + план на верифицированной базе.

## Вердикт (одной строкой)

Тезис сильный; **позиционирование «тонкий модуль» — главный дефект**. Из ~96 требований: 2 exists / 30 reuse-adapt / 34 net-new / 30 contradiction. APL — смежная подсистема, переиспользующая паттерны AgenticMind.

## Топ-решения v0.2

1. **НЕ ClickHouse** → Postgres/TimescaleDB (иначе Critical: ломает Postgres-only non-goal + выносит трейсы из RLS-тенант-изоляции).
2. **Headless scorecard** (API/MCP); UI + fleet + L3 → enterprise.
3. **`moai.*`→`apl.*`**, идентичность на OTel Resource, **normalization-слой** OpenInference⇆gen_ai.*.
4. **Судья:** стратификация ≥50/класс + Wilson-LB; snapshot-id в версию; независимый gating-судья.
5. **Автономия:** diff-allowlist + контент-гард; **контент-safety на майненых few-shot** (сейчас `feedback-promoter.ts` без гарда = дыра).
6. **Baseline-сьют → MUST**; пустой golden-set = HARD FAIL; нужен OTLP-**ресивер** + 100%-capture на error-path.

## Статус

- ✅ Критический ревью + фесибилити + §14 + план.
- ✅ Цельный **PRD v0.2** (`APL-PRD-v0.2.md`).
- ✅ **Phase 0 в коде — ЗАВЕРШЕНА** на ветке `feat/apl-phase0-registry` (2 коммита, tsc-green, vitest 8/8, не запушено):
  - `8a92474` реестр — `schema/apl/` (`apl_agent`/`apl_agent_prompt`/`apl_agent_version` + RLS + immutability) → #3/#4
  - `9b20070` контракт+нормализация — `lib/apl/` (`contract.ts`, `normalize.ts`, `fixtures.ts`, `normalize.test.ts`) → #1/#2/#5
  - **Phase-0 gate зелёный:** обе фикстуры (gen_ai.* и OpenInference) нормализуются в одинаковый canonical shape.
- ✅ **Phase 1 (ядро) — в коде** на той же ветке (коммит `d605079`, tsc-green, vitest 21/21):
  - `lib/apl/sdk.ts` — `wrapAgent`/`instrumentTools`/`record*` (инъектируемый sink) → #6/#7
  - `lib/apl/redact.ts` — in-process secret+PII редакция (reuse `guard.ts`) → #8
  - `lib/apl/sampling.ts` — head-семплер + keep-hint + модель Collector tail-keep → #10
  - `schema/apl/trace-span.ts` + `_span-hypertable.sql` — `apl_span` (Timescale) + `deploy/otel-collector.apl.yaml` → #9 частично
  - Уточнение контракта: `agent_id`/`agent_version` → на span `invoke_agent` (не Resource).
  - **Отложено (нужна живая инфра):** OTLP-**ресивер**-сервер → writer в `apl_span` (#9), бенч-оверхеда (#11).
- ✅ **Phase 2 (ядро) — в коде** на той же ветке (коммит `a00f7bb`, tsc-green, vitest 37/37):
  - `schema/apl/eval.ts` + `_eval-rls.sql` — `apl_eval_case`/`apl_eval_run` (per-agent, `case_set_hash`, RLS) → #12
  - `lib/apl/eval/baseline.ts` — детерм. baseline-сьют (Q3=MUST); пустой сьют НЕ проходит → #13
  - `lib/apl/eval/gate.ts` — версионный гейт против прод-версии на том же frozen-hash; пустой golden-set = HARD FAIL; cold-start на baseline. Чинит оба бага `harness.ts` → #14
  - `lib/apl/eval/mining.ts` — cap failure-доли + детерм. disjoint train/gate split (no leakage) → #15
  - **Отложено:** out-of-band LLM-judge runner (#16, нужен LLM — в Phase 3).
- ✅ **Phase 3 (ядро) — в коде** на той же ветке (коммит `26018c3`, tsc-green, vitest 54/54):
  - `lib/apl/judge/calibration.ts` — стратиф. (≥50/класс) + **Wilson-LB** на TPR и TNR; чинит judge#1 (pass-on-empty-class) → #18
  - `lib/apl/judge/version.ts` — version-hash пиннит model-snapshot; expiry калибровки → #17
  - `lib/apl/failure/cluster-identity.ts` — durable id кластера (label-embedding carry-forward) + `isNewCluster` → #19/#21
  - `lib/apl/failure/trend.ts` — Poisson significance + volume-floor → #21
  - `lib/apl/scorecard.ts` — headless per-agent read-model → #23 частично
  - `schema/apl/{judge,failure}.ts` + `_phase3-rls.sql` → #17/#19/#22
  - **Отложено:** 4-стадийная LLM-таксономия (#20, нужен LLM), fleet-вид BYPASSRLS (#23, нужна БД).
- ✅ **Phase 4 (ядро) — в коде** на той же ветке (коммит `d539942`, tsc-green, vitest 71/71):
  - `lib/apl/improve/autonomy.ts` — diff-allowlist + контент-гард; «`tools[]` не изменился» ≠ достаточно → #27 (fix improve-trust#2)
  - `lib/apl/improve/content-safety.ts` — screening майненых артефактов (guard + instruction-эвристика) + quarantine + provenance → #26 (fix improve-trust#3, дыра `feedback-promoter.ts`)
  - `lib/apl/improve/ledger.ts` — judge-gated improvement НЕ записывается без полного обоснования + lifecycle → #28 (fix improve-trust#5)
  - `lib/apl/improve/submit.ts` — L1/L2 flow autonomy→content-safety→eval-гейт → #24, #25 частично
  - `schema/apl/improvement.ts` + `_improvement-rls.sql` → #28
  - **Отложено:** L2 LLM-proposer (#25, нужен LLM).
- ✅ **Phase 5 (ядро) — в коде** на той же ветке (коммит `b11fe87`, tsc-green, vitest 81/81 apl / 324 shared):
  - `lib/apl/improve/eligibility.ts` — L3 = code-enforced gate (golden-set≥N + свежая калибровка + независимый судья) → #29
  - `lib/apl/improve/independence.ts` — gating-судья ≠ по провайдеру+авторству+label-set; `partitionCorpus` (sealed/gate/tuning) → #30
  - `lib/apl/improve/canary.ts` — идемпотентный `advance` (resumable) + `abDecision` (min-sample+margin) → #31/#32 частично
  - **Отложено (инфра):** durable-воркер + реальный traffic-routing.
- ✅ **GitHub issues** — https://github.com/AlexDuchDev/apl, 37 issues; #1–32 размечены статусом.

## 🏁 Все 5 фаз (тестируемое ядро) готовы

6 code-коммитов на `feat/apl-phase0-registry` в AgenticMind (**не запушено**), **tsc-green, vitest 81/81 в APL / 324 по всему shared-пакету, 0 регрессий**. Каждый security/методологический finding ревью, закрываемый без живой инфры, — закрыт и покрыт тестами.

**Инфра/LLM-хвосты** (нужна живая БД/LLM/traffic, поэтому чистое ядро готово, а исполнение отложено): #9 OTLP-ресивер+writer, #11 бенч оверхеда, #16 judge-runner, #20 LLM-таксономия, #25 L2-proposer, #31 durable-воркер, #32 traffic-routing.

**Дальше требуется решение владельца:** (а) поднять локальный Postgres/Timescale+Collector — тогда замкну инфра-хвосты (#9, #31, #32) сквозняком; (б) merge ветки в AgenticMind (сейчас всё инертно — не подключено в barrel); (в) подключить схемы в barrel + прогнать `db:generate` + companion-SQL миграции.
