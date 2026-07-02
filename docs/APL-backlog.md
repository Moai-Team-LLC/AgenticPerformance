# APL — фазовый бэклог (issue-shaped)

> Выведен из ревью и плана (`APL-plan-and-openq.md`). Каждый айтем — заготовка issue: **Scope / Reuse / Net-new / Acceptance (gate) / Depends**.
> Порядок фаз строго серийный по доверию: реестр → стор+capture → гейт → калиброванные судьи+стабильные кластеры → guarded L1/L2 → eligibility-gated durable L3.
> Легенда приоритета из PRD: `MUST` = MVP · `SHOULD` = быстрый follow-up · `MAY` = опц.

---

## Фаза 0 — Контракт, неймспейс, нормализация, реестр
*Гейт фазы:* миграция применяется; `agent_version` отклоняет UPDATE в БД; оба fixture-трейса нормализуются в один operation-set (post-normalization equivalence); RLS доказана (A не читает строки B).

- **APL-0.1 · Каноническая модель + `apl.*` контракт** `MUST`
  Scope: зафиксировать operation-набор `{invoke_agent, chat, execute_tool}`; имя спана = `{operation} {subject}`; ключевание на `gen_ai.operation.name`+`apl.agent_id`. Идентичность (tenant/product/agent/version) на OTel Resource; per-invocation (`task_id/outcome/human_feedback/decision_reason`) на спане.
  Reuse: `apps/server/src/tracing.ts` (`resourceFromAttributes`). Net-new: `apl.*` спецификация, Resource/span split.
  Acceptance: спецификация атрибутов заморожена; линтер/валидатор отвергает `moai.*` и span-level tenant_id.
  Depends: —. Findings: contract-otel#2/#4, integ#4.

- **APL-0.2 · Normalization-слой (OpenInference ⇆ gen_ai.* → внутр.)** `MUST`
  Scope: вход-адаптеры; определение эквивалентности пост-нормализации (operation-набор + parentage + наличие обяз. атрибутов); выбрать канон и транслировать второе.
  Reuse: `lib/observability/trace.ts` (OpenInference-ключи движка — источник маппинга). Net-new: модуль нормализации.
  Acceptance: OpenInference-трейс `/ask` и `gen_ai.*`-трейс продукта дают эквивалентный нормализованный вид; лишние framework-спаны сохраняются.
  Depends: APL-0.1. Findings: contract-otel#3/#6, sdk#4, integ#3.

- **APL-0.3 · Реестр `agent` + `agent_version` (immutable, canonicalized)** `MUST`
  Scope: таблицы; `prompt_hash` по канонизации + дедуп (`prompt_ref`); детерм. сериализация `tools[]/params/context_strategy`; `model_snapshot_id`; DB-энфорс иммутабельности (`REVOKE UPDATE`+триггер).
  Reuse: `ask-clusters.ts` (append-only дисциплина), `_config.ts`. Net-new: обе таблицы + канонизация.
  Acceptance: смена любого элемента конфига минтит новую версию; UPDATE отклоняется на уровне БД; идентичные промпты хранятся один раз; determinism-тест канонизации (whitespace/порядок tools) зелёный.
  Depends: —. Findings: ingest#5, FR-REG.

- **APL-0.4 · RLS на новых таблицах** `MUST`
  Scope: `tenant_id`+`tenantColumn` + `FORCE ROW LEVEL SECURITY` + policy на GUC (копия `drizzle/0003`).
  Reuse: `drizzle/0003_tenant_isolation.sql`, `_tenant.ts`, `client.ts withTenant`. Net-new: политики на APL-таблицах.
  Acceptance: tenant A не читает agent/version строки B (isolation-тест).
  Depends: APL-0.3. Findings: ingest#3, NFR-TENANT-1.

- **APL-0.5 · Два reference fixture-продукта (conformance-корпус)** `MUST`
  Scope: raw-code TS-loop + framework-shaped, каждый эмитит трейс с ≥1 tool-call.
  Net-new: обе фикстуры. Acceptance: используются как корпус для §6.1-acceptance в APL-0.2.
  Depends: APL-0.1. Findings: contract-otel#6.

---

## Фаза 1 — SDK + OTLP-ingest + Timescale-стор
*Гейт фазы:* реальный продукт интегрируется ≤1 день (hosted); трейсы с tool-спанами в гипертаблице без per-tool кода (framework-режим); синтетический секрет/PII в captured-сообщении **не** доходит до стора; retention-джоб дропает старое; бенч показывает заявленные числа.

- **APL-1.1 · TS SDK: `wrapAgent` + record-хуки** `MUST`
  Scope: `wrapAgent(agentId, opts)` (открывает `invoke_agent`, ставит `apl.*` + Resource); `recordOutcome(success|fail|escalated|unknown)`, `recordFeedback(thumbs/rubric/correction)`, `recordDecision` (why-trace).
  Net-new: всё (grep `wrapAgent`=0). Acceptance: минимальная интеграция даёт корневой спан + outcome/feedback.
  Depends: APL-0.1. Findings: FR-SDK-1/3/7.

- **APL-1.2 · Инструментация tools по режиму** `MUST`
  Scope: framework-адаптеры (auto через tool-hook) + raw-режим `instrumentTools(toolMap)`/`wrapTool()`. Убрать «без per-tool кода» для raw-пути.
  Net-new: обе ветки. Acceptance: framework-продукт даёт `execute_tool`-спаны без per-tool кода; raw-продукт — через один вызов.
  Depends: APL-1.1. Findings: sdk#1, FR-SDK-2.

- **APL-1.3 · In-process PII/secret redaction span-processor** `MUST`
  Scope: span-processor на regex `guard.ts` + secret-detection (энтропия+key-паттерны) по tool-атрибутам, ДО экспортёра; content-capture default OFF.
  Reuse: `lib/knowledge/guard.ts`. Net-new: span-processor. Acceptance: внедрённый синтетический секрет/PII не покидает процесс нередактированным (тест).
  Depends: APL-1.1. Findings: sdk#3, integ#5, FR-SDK-5.

- **APL-1.4 · OTLP-ресивер → нормализация → TimescaleDB writer** `MUST`
  Scope: ресивер (net-new — движок только экспортит); trace/span-таблицы → `create_hypertable` + compression + `add_retention_policy` (конфиг 30–90д); content-capture default-OFF на уровне стора (зеркалит `ask-telemetry` hash-first).
  Reuse: `deploy` timescale, `ask-telemetry.ts` (privacy-стойка). Net-new: ресивер+writer+гипертаблица.
  Acceptance: трейсы из fixture-продукта лежат в гипертаблице; retention дропает по окну.
  Depends: APL-0.2, APL-0.4. Findings: failure#5, ingest#7, FR-INGEST-1/3.

- **APL-1.5 · Сэмплинг (head + keep-hint) + Collector для tail** `MUST`
  Scope: SDK — head-sampling + always-keep на `recordOutcome('fail')`; явно: «100% на ошибках И медленных» = OTel Collector `tailsamplingprocessor` (required infra). Dev-Collector-конфиг в `deploy/`.
  Reuse: `tracing.ts` `BatchSpanProcessor`. Net-new: Collector-конфиг. Acceptance: error-трейсы удерживаются 100%; dev-collector стартует одной командой.
  Depends: APL-1.4. Findings: sdk#2/#6, FR-SDK-4, G1.

- **APL-1.6 · Бенч-харнесс оверхеда (NFR-PERF-1)** `SHOULD`
  Scope: метрика (CPU-ms/turn + p99-delta), baseline (SDK off), референс-workload, capture ON/OFF.
  Net-new: харнесс. Acceptance: числа опубликованы как артефакт.
  Depends: APL-1.1. Findings: sdk#5.

---

## Фаза 2 — Golden-set + ассерты + tiered CI-гейт
*Гейт фазы:* деплой версии с падением метрики на её frozen golden-set блокируется; новый агент без сьюта = HARD FAIL; тренд по `case_set_hash` (рост сета не выглядит регрессом); improver-съеденные кейсы доказуемо исключены из scoring-сета.

- **APL-2.1 · eval из файлов → БД (`eval_case`/`eval_run`, per-agent)** `MUST`
  Scope: таблицы с `case_set_hash`; per-agent (нет глобального сьюта, R1).
  Reuse: `scripts/eval.ts`, `build-eval-cases.ts`. Net-new: таблицы. Acceptance: кейсы/раны привязаны к `(agent_id, agent_version, case_set_hash)`.
  Depends: APL-0.3. Findings: FR-EVAL-1, eval#7.

- **APL-2.2 · Baseline assert-suite (MUST, закрывает Q3)** `MUST`
  Scope: детерм. сьют из `harness.ts` (schema/tool-call, latency/cost, PII/injection, abstain, citations/groundedness, forbidPhrases); блокирует в PR CI.
  Reuse: `lib/eval/harness.ts`, `guard.ts`, `.github/workflows/ci.yml`. Net-new: baseline-состав + cold-start-политика.
  Acceptance: v1 нового агента гейтится baseline; **пустой golden-set = HARD FAIL** (не passRate=1).
  Depends: APL-2.1. Findings: eval#2, sdk#7, judge#1.

- **APL-2.3 · Версионный гейт (относительно прод-версии на том же frozen-сете)** `MUST`
  Scope: сравнение с сохранённым score предыдущей версии на том же `case_set_hash`; тренд по замороженным поколениям; re-run старого сета рядом с новым.
  Reuse: `harness.ts isRegression` (адаптировать под stored baseline), `selectBestParams` (no-per-mode-regression). Net-new: per-version baseline lookup.
  Acceptance: рост сета не рендерится как регресс; регресс атрибутируется к версии.
  Depends: APL-2.1. Findings: eval#7, FR-EVAL-4.

- **APL-2.4 · Стратифицированный майнинг + train/gate split + контракт майнинга** `MUST`
  Scope: golden-set включает успехи/эскалации/abstain, cap failure-доли; кейсы improver’а исключены из гейта; контракт: `outcome=fail` → 100% content-capture, quarantined, redacted-но-labelable, reference авторит человек.
  Reuse: `build-eval-cases.ts` (≥50/mode). Net-new: split-энфорс + mining-контракт.
  Acceptance: доказано исключение improver-кейсов; fail-трейсы имеют полный контент для разметки.
  Depends: APL-1.4 (content-capture), APL-2.1. Findings: eval#3/#4.

- **APL-2.5 · Out-of-band LLM-judge runner (cost/determinism)** `SHOULD`
  Scope: L2/L3-судья вне PR CI, frozen-сет, pinned `judge_version`, temp-0 + majority-vote-k, cost/latency-бюджет; выделенный eval-runner со scoped-кредами (CI не исполняет произвольных tenant-агентов).
  Net-new: runner. Acceptance: гейт детерминирован в пределах толеранса; бюджет отслеживается (NFR-OBS-1).
  Depends: APL-2.3, APL-3.1. Findings: eval#5.

---

## Фаза 3 — Судьи + таксономия + тренды + headless scorecard
*Гейт фазы:* ни один судья не гейтит без свежей калибровки (≥50/класс, Wilson-LB>0.8, не-stale snapshot); тот же fail-set → стабильные cluster id/labels (determinism-тест); post-deploy регресс даёт significance-gated алерт на конкретную версию; scorecard+diff читаемы по API/MCP; fleet-агрегат не течёт cross-tenant.

- **APL-3.1 · `judge`-таблица + snapshot-версия + expiry** `MUST`
  Scope: `{prompt, model_snapshot_id, calibration(labels,TPR,TNR,label_count,verdict_mapping), version, calibrated_at}`; version-хэш включает snapshot-id+конвенцию; expiry на {смена промпта, смена model-id, возраст>N}.
  Reuse: `judge-calibration.ts`, `calibrate.ts` (+snapshot pin, +staleness). Net-new: таблица+expiry.
  Acceptance: провайдер-рефреш под алиасом инвалидирует калибровку.
  Depends: APL-0.3. Findings: judge#4/#5.

- **APL-3.2 · Статистически-корректная калибровка (стратиф.+Wilson+split)** `MUST`
  Scope: ≥50 pos И ≥50 neg; Wilson-LB>0.8 по обеим; min-N + non-empty-class гейт (убрать tpr=1 на пустом классе); train/test split меток (test залочен); честный human/synthetic split; verdict→binary = только `supported`.
  Reuse: `computeCalibration` (расширить). Net-new: Wilson+min-N+split.
  Acceptance: судья на тонком классе не проходит; test-score на залоченном сплите.
  Depends: APL-3.1. Findings: judge#1/#2/#6, eval#6, sdk#7.

- **APL-3.3 · `failure`/`failure_cluster` (tenant+agent) + стабильность** `MUST`
  Scope: новые таблицы, ключ `(tenant_id, agent_id)`, поиск в партиции агента; пересчёт центроидов+переназначение (или HDBSCAN); durable-id через label-embedding carry-forward (Hungarian); determinism-тест.
  Reuse: `feedback-builder.ts`/`clustering.ts`/`ask-clusters` (harden). Net-new: agent-scoped таблицы+стабильность.
  Acceptance: тот же fail-set → стабильные id между прогонами; два агента тенанта не сливаются.
  Depends: APL-1.4, APL-0.3. Findings: failure#1/#7.

- **APL-3.4 · 4-стадийная таксономия (controlled vocabulary, versioned coding-model)** `MUST`
  Scope: (1) NN-join, (2) LLM open coding, (3) axial → per-agent controlled vocabulary (растёт через ревью), (4) стабильные категории; coding-модель+промпт как versioned entity; бюджет open-coding.
  Net-new: стадии 2–4. Acceptance: категории стабильны run-over-run; бюджет учтён (NFR-OBS-1).
  Depends: APL-3.3. Findings: failure#2.

- **APL-3.5 · Significance-gated тренд + определение «новый кластер»** `MUST`
  Scope: NEW iff (size≥MIN, label-cosine<T ко всем прежним, first-member.ts > version.created_at); алерт по EWMA/Poisson-значимости; подавление ниже мин. недельного объёма; агломерация для ≤10.
  Net-new: значимостный детектор. Acceptance: рутинная фраз-вариативность не спамит алертами; реальный post-deploy регресс алертит.
  Depends: APL-3.3, APL-0.3. Findings: failure#3/#4.

- **APL-3.6 · Per-cluster cost/latency (FR-FAIL-4)** `MUST`
  Scope: cost/latency-колонки на `failure` (Postgres-only). Acceptance: «какой кластер жжёт токены на agent X v3» отвечается джойном в Postgres.
  Depends: APL-3.3. Findings: failure#6.

- **APL-3.7 · Headless scorecard (read-model + API/MCP) + fleet BYPASSRLS** `MUST`(scorecard)/`SHOULD`(fleet→enterprise)
  Scope: материализованный per-agent вид + version-diff → REST/JSON + MCP-тулы; fleet — выделенная BYPASSRLS-роль пишет tenant-scrubbed metrics-таблицу (не raw cross-tenant), isolation-тесты. GUI = отдельный `apps/console` (вне MVP).
  Reuse: `mcp-tokens`/`mcp-scopes`, `client.ts` (BYPASSRLS-паттерн). Net-new: read-models + scrubbed fleet-таблица.
  Acceptance: scorecard читаем по API/MCP; fleet-агрегат доказуемо не отдаёт raw cross-tenant.
  Depends: APL-2.3, APL-3.5. Findings: integ#1/#7.

---

## Фаза 4 — Цикл L1→L2 + контент-safety
*Гейт фазы:* патч, трогающий tools/права/scope, отклоняется diff-allowlist’ом; отравленный few-shot ловится до промо; каждая строка ledger не записывается без полного обоснования; L1→L2 реально улучшает агента через гейт.

- **APL-4.1 · L1 (assisted)** `MUST`
  Scope: scorecard показывает топ-кластер + репрезентативные трейсы; инженер патчит; шип через per-agent гейт.
  Depends: APL-3.7, APL-2.3. Findings: FR-IMPROVE-1.

- **APL-4.2 · L2 (suggested) proposer** `MUST`
  Scope: из кластера LLM предлагает патч (prompt/tool-desc/context/few-shot) + гипотезу; человек ревьюит; шип через гейт.
  Reuse: `feedback-promoter.ts` (mine→artifact loop). Net-new: proposer. Depends: APL-4.1, APL-3.4. Findings: FR-IMPROVE-2.

- **APL-4.3 · Content-safety на майненых артефактах (закрывает живую дыру)** `MUST`
  Scope: любой майненый few-shot/промо-card проходит `guard.ts` injection/exfil/PII + output-leak + judge «инструкция-не-ответ?»; provenance-тег `source_trace_ref`+tenant; quarantine low-trust.
  Reuse: `guard.ts`, `feedback-judge.ts`. Net-new: safety-гейт+provenance. Acceptance: `feedback-promoter`-путь больше не промоутит без гарда; инъекция в примере ловится.
  Depends: APL-4.2. Findings: improve-trust#3, NFR-SEC.

- **APL-4.4 · Diff-allowlist + контент-гард границы автономии** `MUST`
  Scope: allowlist по диффу (только designated поля; отказ на tool/secret/scope-язык) + контент-гард промпта; DoD тестирует контент диффа, не `tools[]`.
  Reuse: `guard.ts`. Net-new: allowlist-энфорс. Acceptance: патч с `«call delete_record»` отклонён при неизменном `tools[]`.
  Depends: APL-4.2. Findings: improve-trust#2, R3.

- **APL-4.5 · Improvement ledger со всеми rollback/audit-полями (code-level invariant)** `MUST`
  Scope: + patch_diff, eval_run_id, per-mode дельта, judge_version+снапшот калибровки, source_trace_refs, canary/AB, rollback_of; запись `author=judge-gated` невозможна без них.
  Reuse: `guard-events.ts` (actor+reason+hash-паттерн). Net-new: инвариант. Acceptance: неполная строка отвергается на записи.
  Depends: APL-3.1. Findings: improve-trust#5, NFR-PRIV-2.

---

## Фаза 5 — L3 judge-gated авто + canary/A-B (durable, opt-in, eligibility-gated)
*Гейт фазы:* L3 активен только на eligible-агентах; gating-судья доказуемо независим (провайдер+автор+disjoint labels) и блокирует на дрейфе; in-flight improvement переживает рестарт (resumability-тест); авто-мёрдж, трогающий tools/права, отклонён; canary-регресс авто-откат, решение реконструируемо из ledger.

- **APL-5.1 · Code-enforced L3-eligibility** `SHOULD`
  Scope: агент eligible iff (i) per-agent golden-set≥N по его кластерам, (ii) свежая стратиф. калибровка per-agent судьи ≥ порога; eligibility на scorecard; A2 из допущения → критерий.
  Net-new: eligibility-чек. Depends: APL-3.2, APL-2.4, APL-3.7. Findings: improve-trust#6.

- **APL-5.2 · Независимый gating-судья + sealed held-out** `SHOULD`
  Scope: gating-судья ≠ eval/calibration-судья по провайдеру И авторству; disjoint held-out (ротируется, виден только ему); adversarial/anti-gaming кейсы; пере-мер TPR/TNR на собств. предложениях, блок на дрейфе.
  Reuse: Phase-3 judge-инфра (отдельный инстанс). Net-new: independence + sealed set. Depends: APL-3.2. Findings: improve-trust#4, judge#3, R2.

- **APL-5.3 · Durable resumable improvement state-machine** `SHOULD`
  Scope: `improvement` как реальная state-machine в строках, продвигаемая идемпотентным resumable-воркером (расширить Postgres advisory-lock паттерн) — или workflow-движок; сказать что именно.
  Reuse: `apps/worker/src/index.ts` (advisory-lock scheduling). Net-new: resumable SM. Acceptance: рестарт воркера между canary и A/B не оставляет half-applied.
  Depends: APL-4.5. Findings: integ#6, NFR-REL-1.

- **APL-5.4 · Canary + A/B (routing/compare/promote/rollback)** `SHOULD`
  Scope: доля трафика на version_to, сравнение на held-out + live outcomes, авто-promote/rollback; каждое решение в ledger.
  Net-new: весь canary/AB (0 в репо). Acceptance: canary-регресс авто-откатывается; решение в ledger.
  Depends: APL-5.2, APL-5.3. Findings: FR-IMPROVE-3.

---

## Post-MVP / follow-up
- Python-SDK паритет (`FR-SDK-6`, SHOULD).
- ClickHouse `TraceStore`-адаптер за портом (только если write-объём реально упрётся в Postgres/Timescale).
- `apps/console` — рендер-UI поверх headless API (enterprise).
- Инструментация → DoD-требование в Agentic Product Standard ([[agentic-standard-ecosystem]]).
- Экспорт scorecard/метрик в Datadog/Grafana/Phoenix (`FR-SCORE-4`, MAY).
