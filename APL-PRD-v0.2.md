# Agent Performance Layer (APL) — Требования к разработке

| | |
|---|---|
| **Документ** | Требования к разработке (SRS / PRD-гибрид) |
| **Продукт** | Agent Performance Layer (APL) — подсистема AgenticMind |
| **Версия документа** | v0.2 (пересобрано по итогам ревью v0.1) |
| **Статус** | Draft-to-approve |
| **Владелец** | Moai Team LLC |
| **Целевой стек** | TypeScript-first (+ Python SDK), **Postgres + pgvector + TimescaleDB**, OpenTelemetry (Collector required на self-hosted) |

**Легенда приоритетов (RFC 2119):** `MUST` — обязательно для MVP · `SHOULD` — важно, быстрый follow-up · `MAY` — опционально.

**Что изменилось vs v0.1:** снят мандат ClickHouse (→ Postgres/TimescaleDB); признан OpenInference-инкумбент и введён normalization-слой; `moai.*`→`apl.*` + идентичность на OTel Resource; калибровка судей сделана статистически корректной; граница автономии и контент-safety сделаны механически форсируемыми; baseline-сьют → MUST; scorecard headless; закрыты Q1–Q5. Полный changelog — `APL-PRD-v0.2-delta.md` (D1–D26). Обоснования — `APL-REVIEW-findings.md`.

---

## 1. Назначение и контекст

Moai Team строит множество agentic/workflow-продуктов, где часть процесса исполняется LLM-агентами. Сегодня каждый продукт наблюдается и улучшается вручную и по-своему. APL — переиспользуемый слой, который любой продукт подключает через тонкий SDK и который превращает сырое исполнение агентов в: (1) наблюдаемость/трейсинг, (2) оценку качества на golden set, (3) таксономию ошибок с трендами, (4) циклический процесс улучшения каждого агента.

APL реализуется **как подсистема существующего движка AgenticMind** (why-trace, auditable memory, judge-gated self-improvement), переиспользуя его паттерны (калибровка, кластеризация, tenant-isolation, OTel-плюмбинг). Ревью v0.1 показало: из ~96 требований 2 существуют как есть, 30 переиспользуемы с доработкой, 34 net-new — т.е. APL **существенно расширяет** поверхность движка, а не является тонкой обёрткой; позиционировать соответственно.

### 1.1. Цели (измеримые исходы)
- **G1.** Любой продукт подключается за ≤ 1 день **против hosted-endpoint (SaaS)** (time-to-first-trace). Для self-hosted/VPC — отдельный честный onboarding-SLA, включающий bring-up Collector + trace-store + retention.
- **G2.** Для каждого агента — версионируемый golden set и тренд качества во времени; регрессии блокируются CI-гейтом и не попадают в прод.
- **G3.** Ошибки каждого агента классифицированы в ≤ 10 именованных кластеров с трендами.
- **G4.** Управляемый цикл улучшения с тремя уровнями автономии (ручной → Claude-in-loop → judge-gated авто); **L3 зажигается постепенно по мере прохождения агентом code-enforced eligibility**, а не одномоментно на GA.
- **G5.** Один слой в SaaS- и self-hosted/VPC-режимах поверх мультитенантной изоляции; «одинаковый контракт» — на уровне API/семантики (операционная топология VPC поставляется в `deploy/`).

### 1.2. Не-цели
- **NG1.** APL не заменяет agentic-логику продуктов; инструментирует их извне.
- **NG2.** APL не привязан к фреймворку и не навязывает его.
- **NG3.** APL не строит UI-конструктор агентов и не оркестрирует их. Рендер-консоль (`apps/console`) — отдельное downstream-приложение, вне модуля и вне MVP.
- **NG4.** В MVP нет автономной дообучки/файн-тюнинга; улучшение — на уровне промпта/контекста/few-shot.
- **NG5.** APL не вводит проприетарный формат телеметрии — базируется на OpenTelemetry; проприетарен только неймспейс `apl.*` для полей без стандартного ключа.

---

## 2. Область охвата

**В охвате:** контракт телеметрии + normalization-слой, SDK инструментации, приём/хранение трейсов, реестр агентов и версий, движок оценки (evals) + baseline-сьют, судьи и калибровка, анализ/кластеризация ошибок, цикл улучшения (L1–L3) + safety-envelope, headless scorecard/контрол-плейн, адаптеры под фреймворки и режимы деплоя.

**Вне охвата:** см. §1.2. Вне MVP: L3 judge-gated авто + canary/A-B (Фаза 5), ClickHouse-адаптер, рендер-UI/fleet-вид (enterprise), мультирегиональный деплой, готовые вертикальные пакеты evals.

---

## 3. Глоссарий
- **Агент** — сущность продукта, исполняющая задачу через LLM внутри детерминированного контура.
- **agent_version** — иммутабельный снапшот конфигурации (канон. `prompt_hash`, инструменты, model-snapshot-id, параметры, context-стратегия).
- **Трейс / спан** — запись исполнения; внутренняя модель — OTel GenAI semconv, к которой приводятся и OpenInference (свои спаны движка), и `gen_ai.*` (внешние продукты) через normalization-слой (§15).
- **Golden set** — курируемый+намайненный набор эталонных кейсов оценки для конкретного агента; версионируется `case_set_hash`.
- **Judge (судья)** — версионируемый LLM-оценщик с записью калибровки (стратифицированной, с Wilson-границей) против человеческих меток.
- **Failure cluster** — именованная категория повторяющейся ошибки конкретного агента, с durable-идентичностью.
- **Why-trace** — записанные точки решения агента (из AgenticMind).
- **Scorecard** — материализованный headless read-model «производительности» агента во времени.
- **Cycle of Trust** — принцип: границы прав и разрушительные действия форсируются **кодом** (diff-allowlist + контент-гард + ledger-инвариант), не промптом.

---

## 4. Заинтересованные стороны и роли
- **Product Engineer** — интегрирует SDK, читает scorecards, применяет патчи (L1/L2).
- **Platform/Ops** — эксплуатирует APL, задаёт границы автономии и политики авто-улучшения.
- **Client Tenant (enterprise)** — потребитель self-hosted/VPC-инсталляции, требует изоляции/аудита.
- **Claude-in-the-loop** — предлагает патчи из кластеров ошибок (L2), проверяется независимым судьёй (L3).
- **Аудитор/комплаенс** — потребитель audit-логов и why-trace (позиционирование под EU AI Act).

---

## 5. Обзор решения (карта из 7 слоёв)
0. **Контракт** — OTel GenAI semconv (внутр. канон) + `apl.*` (Resource-идентичность + per-invocation) + normalization-слой.
1. **SDK** — тонкая обёртка agent loop + per-framework адаптеры.
2. **Приём/хранение** — OTLP-ресивер (net-new); Postgres+pgvector (состояние) + TimescaleDB-гипертаблица (трейсы) в **одном** Postgres.
3. **Реестр** — агенты и иммутабельные версии (DB-enforced).
4. **Оценка** — baseline-сьют + трёхуровневый eval-пайплайн + CI-гейт.
5. **Анализ ошибок** — автотриаж + стабильная семантическая кластеризация + significance-gated тренды.
6. **Улучшение** — L1 ручной → L2 Claude-in-loop → L3 judge-gated авто (внутри механического safety-envelope).
7. **Scorecard/контрол-плейн** — headless read-model/API/MCP (UI/fleet — enterprise).

---

## 6. Функциональные требования

### 6.1. Контракт телеметрии (FR-CONTRACT)
- **FR-CONTRACT-1 (MUST).** Внутренняя каноническая модель — OTel GenAI semconv. Инкумбент в движке — **OpenInference** (`trace.ts`), поэтому вводится normalization-слой (§15), маппящий И OpenInference, И `gen_ai.*` во внутреннюю модель. Собственный формат не вводится; проприетарен только `apl.*`.
- **FR-CONTRACT-2 (MUST).** Канонические **операции** (`gen_ai.operation.name`): `invoke_agent` (корень), `chat` (LLM), `execute_tool` (инструмент). **Имя спана = `{gen_ai.operation.name} {subject}`** (напр. `chat gpt-4o`). Приём/агрегация ключуют на `gen_ai.operation.name` + `apl.agent_id`, **не** на raw span-name.
- **FR-CONTRACT-3 (MUST).** Захватываются стандартные атрибуты: `gen_ai.request.model`, `gen_ai.usage.input_tokens`/`output_tokens`, `gen_ai.response.finish_reasons`, `gen_ai.operation.name`, `gen_ai.provider.name`.
- **FR-CONTRACT-4 (MUST).** APL-SDK эмитит GenAI-экспериментальные спаны **напрямую**; версия конвенций — значение в конфиге APL. `OTEL_SEMCONV_STABILITY_OPT_IN` **не используется** как механизм (no-op без instrumentation-либ). Константы — из `@opentelemetry/semantic-conventions/incubating` или вендорить пиннованный набор.
- **FR-CONTRACT-5 (MUST).** Неймспейс **`apl.*`**. Стабильная идентичность (`tenant_id`, `product_id`, `agent_id`, `agent_version`) — на **OTel Resource**; на спане — только per-invocation: `apl.task_id`, `apl.outcome`, `apl.human_feedback`, `apl.decision_reason`. Тенант-изоляция при приёме ключуется на Resource-идентичность.
- **FR-CONTRACT-6 (MUST).** Trace-context пробрасывается через асинхронные границы. Разделяется: (a) in-process async (Promise-fan-out) — `context.with()`/active-span; (b) cross-process/deferred (server→queue→worker) — через injected `traceparent` + span-links. Требует reproduction-фикстуру в acceptance (§ Phase 0), т.к. in-repo мульти-агентного примера нет.
- **FR-CONTRACT-7 (SHOULD).** Контент-атрибуты (`gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.system_instructions`) — флагом, **по умолчанию OFF**, с обязательной редакцией при включении (см. FR-SDK-5).

**Критерии приёмки:** трейс агента с ≥1 tool-call из продукта на LangGraph и из голого кода даёт **пост-нормализационную эквивалентность** — одинаковый набор операций `{invoke_agent, chat, execute_tool}` + корректный parentage + наличие обязательных `gen_ai.*`+`apl.*`; лишние framework-спаны допускаются и сохраняются; multi-agent сценарий — одно связное дерево (проверяется на 2 in-repo fixture-продуктах).

### 6.2. SDK инструментации (FR-SDK)
- **FR-SDK-1 (MUST).** TS SDK; HOF-обёртка `wrapAgent(agentId, opts)`, открывающая `invoke_agent`, ставящая `apl.*` + Resource-идентичность.
- **FR-SDK-2 (MUST).** Инструментация инструментов по режиму: (a) framework — авто `execute_tool` через tool-hook фреймворка; (b) raw/manual — тонкий `instrumentTools(toolMap)`/`wrapTool()` один раз на продукт (в TS нет monkey-patch произвольных функций). «Без ручного кода» = per-tool, не per-product.
- **FR-SDK-3 (MUST).** Хуки: `recordOutcome(success|fail|escalated|unknown)`, `recordFeedback(thumbs/rubric/correction)`, `recordDecision` (why-trace).
- **FR-SDK-4 (MUST).** Сэмплинг: SDK делает head-sampling + always-keep-hint на `recordOutcome('fail')`. **Гарантия «100% на ошибках И медленных» реализуется OTel Collector `tailsamplingprocessor`** (required infra; latency известна только после завершения трейса).
- **FR-SDK-5 (MUST).** Редакция PII — **in-process span-processor** (regex `guard.ts`), до экспорта. Content-capture default OFF; при включении — обязательная редакция + secret-detection (энтропия + key-паттерны) по tool-атрибутам до экспортёра. Collector-processor/Presidio — опц. higher-recall апгрейд.
- **FR-SDK-6 (SHOULD).** Python-SDK с паритетом ключевой поверхности.
- **FR-SDK-7 (SHOULD).** Захват why-trace через `recordDecision`.
- **FR-SDK-8 / NFR-PERF-1 (MAY→уточнено).** Оверхед: см. NFR-PERF-1 (определённая метрика + бенч-артефакт).

**Критерии приёмки:** интеграция в новый продукт (install → `wrapAgent` → `agent_id` → endpoint) ≤ 1 день против hosted; трейсы с tool-спанами появляются без per-tool кода в framework-режиме; синтетический секрет/PII в captured-сообщении не доходит до хранилища.

### 6.3. Приём и хранение (FR-INGEST)
- **FR-INGEST-1 (MUST).** Приём по OTLP (совместимость с OTel Collector). *Замечание: OTLP-ресивер — net-new (движок только экспортирует спаны).*
- **FR-INGEST-2 (MUST).** Состояние (реестр, golden sets, eval-раны, калибровки, scorecards, эмбеддинги фейлов) — Postgres+pgvector.
- **FR-INGEST-3 (MUST).** Поток трейсов — **TimescaleDB-гипертаблица в том же Postgres** (`create_hypertable` + columnar compression + `add_retention_policy`): держит RLS, делает FK `trace→(agent_id, agent_version)` реальным, позволяет FR-INGEST-5 по тем же строкам. ClickHouse — post-MVP адаптер за `TraceStore`-портом.
- **FR-INGEST-4 (MUST).** Ретеншн настраиваем как **энфорсимая per-tenant/per-severity политика** (не диапазон): дефолты — метаданные SaaS 30д / VPC 90д; контент (opt-in) SaaS 7д / VPC 30д (override в [7д, 180д]); error-path трейсы 100% + 90д.
- **FR-INGEST-5 (SHOULD).** Семантический поиск по фейл-трейсам — pgvector/diskann (`vector_cosine_ops`) в том же Postgres, dimension = `EMBEDDING_DIMENSIONS` (1024).

### 6.4. Реестр агентов и версий (FR-REG)
- **FR-REG-1 (MUST).** `agent`: `id`, `product_id`, `task_description`, `owner`, `tenant_id`.
- **FR-REG-2 (MUST).** `agent_version` — иммутабельный снапшот: `prompt_ref` (дедуп по канон. `prompt_hash`), `tools_canonical`, `model_snapshot_id`, `params`, `context_strategy`, `git_ref`, `created_at`. `prompt_hash` = sha256 по канонизированному промпту; детерм. канон-сериализация `tools[]`/`params`/`context_strategy`.
- **FR-REG-3 (MUST).** Каждый трейс, eval-ран, improvement привязан к `(agent_id, agent_version)`.
- **FR-REG-4 (MUST).** Смена любого элемента конфига минтит новую версию; редактирование запрещено — энфорс в БД (`REVOKE UPDATE` + `BEFORE UPDATE`-триггер).

**Критерии приёмки:** по любому трейсу восстанавливается точная конфигурация; тренд качества по версиям; регрессия атрибутируется к версии; UPDATE `agent_version` отклоняется на уровне БД.

### 6.5. Движок оценки (FR-EVAL)
- **FR-EVAL-0 (MUST) — Baseline-сьют.** У каждого агента — обязательный **детерминированный** baseline assert-suite (без LLM-судьи), из ассертов `harness.ts`: (1) валидность схемы/tool-call; (2) latency/cost в бюджете; (3) нет PII/инъекций в выводе (`guard.ts`); (4) abstain на out-of-scope; (5) для grounded — `minCitations≥1`/groundedness; (6) forbidPhrases. Блокирует в PR CI.
- **FR-EVAL-1 (MUST).** Golden set — на каждого агента; единый глобальный сьют не используется.
- **FR-EVAL-2 (MUST).** Три уровня: (a) детерм. ассерты; (b) откалиброванный LLM-judge (качество/faithfulness); (c) ротирующийся human-сэмпл как ground truth.
- **FR-EVAL-3 (MUST).** Golden set засевается вручную и растёт из прода, но **обязан включать успехи + эскалации + abstain** (не только фейлы); доля failure-derived ограничена; **train/gate split** (кейсы improver’а исключены из scoring-сета гейта); контракт майнинга: `outcome=fail` → 100% content-capture, quarantined, redacted-но-labelable, reference авторит человек. Кейс-сет версионируется `case_set_hash`.
- **FR-EVAL-4 (MUST).** CI-гейт на каждую смену `agent_version` сравнивает против **сохранённого score предыдущей версии на том же `case_set_hash`**. Cold-start: v1 гейтится baseline-сьютом (FR-EVAL-0), version-diff активируется после ≥N seed-кейсов. **Пустой/отсутствующий golden set = HARD FAIL**, никогда `passRate=1`.
- **FR-EVAL-5 (SHOULD).** 100% прод-трафика (при включённом capture) пригодно для пополнения eval-сета; тренд рендерится по замороженным поколениям `case_set_hash`.

**Критерии приёмки:** версия с падением метрики на её frozen golden-set блокируется автоматически; новый агент без сьюта HARD-FAIL; рост сета не выглядит как регресс.

### 6.6. Судьи и калибровка (FR-JUDGE)
- **FR-JUDGE-1 (MUST).** Judge — версионируемая сущность; `judge_version`-хэш включает prompt + **model-snapshot-id** + версию конвенций + verdict→binary-маппинг. Калибровка истекает при {смена промпта, смена model-id, возраст > N дней}.
- **FR-JUDGE-2 (MUST).** Калибровка на классово-стратифицированном наборе: **≥50 позитивов И ≥50 негативов**; критерий — **нижняя граница Wilson-95% по обеим TPR и TNR > 0.8** (не точечная). Явный min-N + non-empty-class гейт. Долю human/synthetic публиковать честно.
- **FR-JUDGE-3 (MUST).** При изменении промпта/модели калибровка перезапускается; TPR/TNR публикуются на **залоченном test-сплите** (промпт тюнится только на dev-сплите); ≥50/класс — на test-сплите. Verdict→binary — фикс-контракт (позитив только `supported`), хранится с `judge_version`.
- **FR-JUDGE-4 (SHOULD).** Human-аннотации переиспользуются для калибровки и таксономии, но **с инвариантом непересечения** (calibration-set не seed’ит кластеры/few-shot; disjoint от taxonomy-set), энфорс на build (как unique-id в `build-eval-cases.ts`).

**Критерии приёмки:** судья без валидной свежей калибровки (стратиф. ≥50/класс, Wilson-LB>0.8, не-stale snapshot) не допускается к гейтингу и авто-улучшению.

### 6.7. Анализ ошибок (FR-FAIL)
- **FR-FAIL-1 (MUST).** Автотриаж: упавший ассерт, низкий score судьи, human thumbs-down, эскалация → в пайплайн ошибок. *Зависимость: FR-INGEST (стор трейсов) + 100%-capture на error-path.*
- **FR-FAIL-2 (MUST).** Таксономия = 4 отдельных build-айтема: (1) NN-embedding join; (2) LLM open coding; (3) axial coding в **per-agent controlled vocabulary** (растёт через ревью); (4) стабильные именованные категории. Coding-модель+промпт — versioned entity. **Стабильность:** пересчёт центроидов + переназначение (или HDBSCAN на агента), durable-id через label-embedding carry-forward (Hungarian), determinism-тест.
- **FR-FAIL-3 (MUST).** Кластер **новый** iff (a) прошёл `MIN_CLUSTER_SIZE`, (b) label-cosine < T ко всем прежним кластерам агента, (c) первый member по времени > `agent_version.created_at`. Алерт гейтится **статистической значимостью** (EWMA/Poisson-rate change); при объёме ниже минимума trend-алерты подавляются.
- **FR-FAIL-4 (MUST).** Cost/latency-телеметрия per agent / per version / per cluster — из колонок на `failure` (Postgres-only).
- **FR-FAIL-5 (SHOULD).** «3–7 кластеров» — необязывающее наблюдение; для ≤10-бюджета — агломерация (merge в пределах T, cap N поглощением мелких в «other»).

**Критерии приёмки:** список именованных стабильных кластеров с количеством/трендом/репрезентативными трейсами; тот же fail-set → стабильные id между прогонами; post-deploy регресс даёт significance-gated алерт на конкретную версию.

### 6.8. Цикл улучшения (FR-IMPROVE)
- **FR-IMPROVE-1 (MUST) — L1 (Assisted).** Scorecard показывает топ-кластер + трейсы; инженер патчит и шипит через eval-гейт.
- **FR-IMPROVE-2 (MUST) — L2 (Suggested).** По кластеру LLM предлагает патч (prompt/tool-desc/context/few-shot) + гипотезу; инженер ревьюит; шип через гейт.
- **FR-IMPROVE-3 (SHOULD) — L3 (Judge-gated авто).** propose → полный eval → **независимый откалиброванный судья** → авто-мёрдж в canary → A/B против прода → промоут/откат. **Независимость обязательна:** gating-судья ≠ eval/calibration-судья по model-провайдеру И авторству промпта, калиброван на **disjoint held-out**; eval-корпус делится на tuning-set (виден proposer’у) и **sealed held-out** (виден только gating-судье, ротируется); в golden-set добавляются adversarial/anti-gaming кейсы; gating-судья пере-мерится на собственных предложениях, блок на дрейфе.
- **FR-IMPROVE-4 (MUST) — Граница автономии.** Форсируется **кодом**: (a) **diff-allowlist** (структурно ограничен designated prompt/few-shot полями; отказ на любое изменение, ссылающееся на имена инструментов, секреты, access-глаголы, scope-язык) + (b) **контент-гард** (`guard.ts`) над патченым промптом. Явно: «`tools[]` не изменился» — необходимо, но НЕ достаточно. Инструменты с сайд-эффектами, права, границы доверия авто-патчами не изменяются никогда.
- **FR-IMPROVE-4b (MUST) — Content-safety на майненых артефактах.** Перед тем как майненый трейс станет few-shot/promoted-card — обязательный прогон `guard.ts` injection/exfil/PII + output-leak + judge-измерение «это инструкция, а не ответ?»; provenance-тег `source_trace_ref`+tenant; quarantine low-trust/анонимного трафика.
- **FR-IMPROVE-5 (MUST) — Ledger.** `improvement`: `version_from→version_to`, `hypothesis`, `patch_diff` (structured, field-scoped), `eval_run_id` + **per-failure-mode дельта**, `judge_id`+`judge_version`+**снапшот калибровки** (TPR/TNR, label_count), `source_trace_refs`, `canary_ab_outcome`, `status`, `author` (human/claude/judge-gated), `rollback_of`. Запись `author=judge-gated` невозможна без всех полей (code-level invariant, по образцу `guard-events.ts`).
- **FR-IMPROVE-6 (MUST) — Конфиг автономии + eligibility.** Оператор конфигурирует допустимые типы патчей/агентов (L3 opt-in на агента). Агент **L3-eligible** только при code-enforced проверке: (i) per-agent golden-set ≥ N по его кластерам; (ii) per-agent судья со свежей стратиф. калибровкой ≥ порога. Eligibility видна на scorecard.

**Критерии приёмки:** патч, трогающий инструменты/права/scope, отклоняется diff-allowlist’ом; отравленный few-shot ловится гардом до промо; журнал improvements даёт полную трассируемость «что изменилось → как повлияло на score» + откат.

### 6.9. Scorecard и контрол-плейн (FR-SCORE)
- **FR-SCORE-1 (MUST).** Per-agent headless read-model: текущая версия, кривая score (по frozen `case_set_hash`), топ-кластеры и тренды, cost/latency/token бюджеты vs факт, % эскалации, % успешных tool-call, L3-eligibility, ожидающие апрува улучшения. Экспонируется как REST/JSON + MCP-тулы.
- **FR-SCORE-2 (MUST).** Diff между версиями: что изменилось и как повлияло на метрику.
- **FR-SCORE-3 (SHOULD → enterprise).** Fleet-вид — через выделенную **BYPASSRLS-агрегат-роль**, пишущую tenant-scrubbed metrics-таблицу (никогда raw cross-tenant span-доступ), с isolation-тестами.
- **FR-SCORE-4 (MAY).** Экспорт scorecard/метрик во внешние бэкенды (Datadog/Grafana/Phoenix) через OTel-совместимый выход.

### 6.10. Интеграция, адаптеры, деплой (FR-INTEG)
- **FR-INTEG-1 (MUST).** Мультитенантность с первого дня по `product_id`/`tenant_id` (RLS AgenticMind, копия `drizzle/0003` на все APL-таблицы).
- **FR-INTEG-2 (MUST).** **Per-framework адаптер с normalization-слоем** (не тонкий field-map): LangGraph/CrewAI (OpenInference/OpenLLMetry), OpenAI Agents SDK (свой формат), Claude Agent SDK (нет native GenAI-эмиттера), raw/manual. MVP: один reference-адаптер (raw TS) + собственный движок (OpenInference→нормализация); остальные — follow-up с conformance-тестами.
- **FR-INTEG-3 (MUST).** Модель-агностичность: провайдер/модель фиксируются атрибутами.
- **FR-INTEG-4 (MUST).** Два режима: SaaS и self-hosted/VPC. Контракт одинаков на уровне API/семантики; VPC-режим требует референс-топологии (Collector с redaction+tail-sampling, trace-store, retention-job) в `deploy/`.
- **FR-INTEG-5 (SHOULD).** Инструментация как DoD-требование в Agentic Product Standard.

---

## 7. Нефункциональные требования (NFR)
- **NFR-PERF-1 (MUST).** Оверхед определён конкретно: метрика = добавленные CPU-ms/turn + добавленная p99-latency; baseline = SDK off; референс-workload; варианты content-capture ON/OFF. Бенч-харнесс — acceptance-артефакт.
- **NFR-SCALE-1 (MUST).** Хранилище масштабируется через TimescaleDB (гипертаблицы/compression) + настраиваемый сэмплинг; ClickHouse-адаптер — post-MVP scale-тир за портом.
- **NFR-REL-1 (SHOULD).** Пайплайны переживают рестарт без потери состояния; L3-оркестрация — durable resumable Postgres-row state-machine (брокера нет; расширяет advisory-lock-паттерн), проверяется restart-тестом.
- **NFR-SEC-1 (MUST).** Границы прав/разрушительные действия форсируются кодом (Cycle of Trust, §16); авто-улучшение — только внутри safety-envelope (FR-IMPROVE-4/4b).
- **NFR-SEC-2 (MUST).** Секреты/креды инструментов не хранятся агентом и не попадают в трейсы (secret-detection на emit); scoped-доступ.
- **NFR-PRIV-1 (MUST).** PII редактируется **до persistence** (in-process span-processor); управляемый content-capture (default OFF); остаточное окно экспозиции на self-hosted заявлено честно.
- **NFR-PRIV-2 (SHOULD).** Аудируемость: why-trace + audit-лог + полный improvement-ledger достаточны для регуляторного разбора (EU AI Act).
- **NFR-TENANT-1 (MUST).** Изоляция тенантов; кросс-тенантная утечка невозможна на уровне хранилища и запросов (RLS на все APL-таблицы; fleet-агрегация только через scrubbed-таблицу).
- **NFR-PORT-1 (MUST).** Портируемо на **транспортном (OTLP)** уровне; на семантическом уровне требует `apl.*` (это нормально и заявлено). Где есть стандартные ключи — использовать (`agent_id`/`agent_version`→emerging `gen_ai.agent.*`, tenant→Resource).
- **NFR-OBS-1 (SHOULD).** Наблюдаемость самого APL (здоровье ingestion, лаги пайплайнов, стоимость судейских/coding-прогонов).
- **NFR-DX-1 (MUST).** Time-to-first-trace ≤ 1 день против hosted; документация интеграции/адаптеров + one-command dev Collector.

---

## 8. Модель данных (обязательные сущности)
```
agent            id, product_id, task_description, owner, tenant_id
agent_version    id, agent_id, prompt_ref(hash-dedup), prompt_hash(canon),
                 tools_canonical, model_snapshot_id, params, context_strategy,
                 git_ref, created_at, tenant_id            (иммутабельно, DB-enforced)
trace/span       OTel-совместимые (внутр. модель); TimescaleDB-гипертаблица;
                 FK -> (agent_id, agent_version) (реальный); tenant_id (RLS)
eval_case        input, reference/rubric, tags, source(curated|mined),
                 agent_id, case_set_hash, tenant_id
eval_run         scores, judge_version, agent_version, case_set_hash, ts, tenant_id
judge            prompt, model_snapshot_id, calibration(human_labels, TPR, TNR,
                 label_count, verdict_binary_mapping, dev/test split), version,
                 calibrated_at, tenant_id
failure          trace_ref(FK), cluster_id, severity, cost, latency_ms,
                 agent_version_id, discovered_at, tenant_id
failure_cluster  tenant_id, agent_id, label, label_embedding, description,
                 member_count, trend, example_refs
annotation       trace_ref, human_label, purpose(calibration|taxonomy)   (disjoint-инвариант)
improvement      version_from, version_to, patch_diff, hypothesis, eval_run_id,
                 per_mode_delta, judge_version, calibration_snapshot,
                 source_trace_refs, canary_ab_outcome,
                 status(proposed|approved|rejected|canary|deployed|rolled_back),
                 author, rollback_of, tenant_id
scorecard        agent_id -> материализованный headless read-model
```

---

## 9. Интерфейсы и контракты
- **SDK API (TS/Python):** `wrapAgent(agentId, opts)`, `instrumentTools(toolMap)`/`wrapTool()`, `recordOutcome()`, `recordFeedback()`, `recordDecision()`.
- **Ingestion:** OTLP endpoint (совместим с OTel Collector); OTLP-ресивер — net-new.
- **Export:** OTel-совместимый выход во внешние бэкенды (опция).
- **Improvement webhook/API:** исходящее, at-least-once, HMAC-подписанное событие на каждый переход `improvement`. `X-APL-Signature: sha256=<hmac>` над raw-body, `event.id` для идемпотентности; ретраи exp-backoff (1m,5m,30m,2h,6h) до 24ч → dead-letter Postgres-таблица с replay. Payload = проекция ledger (FR-IMPROVE-5), **без контента, только redacted trace_refs**. SLA emit ≤60с (p95) после commit. Не блокирует пайплайн: апрув L1/L2 постится обратно `POST /improvements/{id}/decision`.
- **Config:** политики сэмплинга, границы автономии, whitelist типов авто-патчей, версия OTel-конвенций, retention per-tenant/severity.

---

## 10. Ограничения и допущения
- **C1.** Реализация — подсистема AgenticMind (Apache-2.0 core).
- **C2.** OTel GenAI conventions экспериментальны → APL эмитит их напрямую и вендорит/пиннует версию; env-var-opt-in не механизм.
- **C3.** Стек: TS-first SDK, Postgres+pgvector+**TimescaleDB**, OTel Collector (required на self-hosted). **ClickHouse не в MVP-пути** — только опц. `TraceStore`-адаптер за интерфейсом (post-MVP scale-тир).
- **C4.** Tenant-isolation присутствует (факт. **v0.8.0**, `drizzle/0003` FORCE RLS на GUC `app.current_tenant`) и переиспользуется; инвариант: любая новая таблица наследует ту же RLS.
- **C6.** APL существенно расширяет поверхность движка (34 net-new из ~96) — позиционировать как подсистему, не тонкую обёртку.
- **A1.** Продукты способны обернуть agent loop и пробросить trace-context (в т.ч. multi-agent).
- **A2 (реформулировано в критерий).** L3 включается только на агентах, прошедших eligibility (FR-IMPROVE-6): зрелый golden-set + свежая калибровка судьи.

---

## 11. Критерии приёмки уровня системы (Definition of Done)
- [ ] Трейсы из ≥ 2 продуктов на разных фреймворках дают пост-нормализационную эквивалентность (набор операций + parentage + обяз. атрибуты); лишние framework-спаны сохранены.
- [ ] Multi-agent сценарий — одно связное дерево (нет orphan-спанов); есть reproduction-фикстура.
- [ ] Реестр версий: по трейсу восстанавливается конфиг; UPDATE `agent_version` отклоняется в БД; тренд score по версиям.
- [ ] Baseline-сьют MUST у каждого агента; golden set на агента; CI-гейт блокирует деплой-регрессию; пустой сьют = HARD FAIL.
- [ ] Каждый активный судья имеет свежую стратифицированную калибровку (≥50/класс, Wilson-LB>0.8, не-stale snapshot).
- [ ] Ошибки сведены в стабильные именованные кластеры (determinism-тест); significance-gated алерт на post-deploy всплеск, привязанный к версии.
- [ ] Цикл L1→L2 работает; L3 доступен как eligibility-gated opt-in, не трогает инструменты/права (diff-allowlist), майненые артефакты проходят контент-гард.
- [ ] Scorecard per-agent headless (API/MCP); fleet-агрегат не отдаёт raw cross-tenant; журнал improvements трассируем + откат.
- [ ] Мультитенантная изоляция подтверждена на всех APL-таблицах; PII редактируется до persistence; синтетический секрет/PII не доходит до стора.
- [ ] Time-to-first-trace ≤ 1 день против hosted; VPC-топология упакована в `deploy/`.
- [ ] Бенч-харнесс оверхеда опубликован (метрика/baseline/workload).

---

## 12. План поставки по фазам
Полный план (north-star, задачи, reuse/net-new/gate/risks на фазу, критпуть, топ-риски) — `APL-plan-and-openq.md`. Бэклог с зависимостями — `APL-backlog.md`. Кратко:

- **Фаза 0 — Контракт, неймспейс, нормализация, реестр.** *Гейт:* fixture-трейсы нормализуются в один operation-set; `agent_version` отклоняет UPDATE; RLS доказана.
- **Фаза 1 — SDK + OTLP-ресивер + TimescaleDB-стор.** *Гейт:* трейсы из одного реального продукта ≤1 день (hosted); секрет/PII не доходит до стора.
- **Фаза 2 — Baseline + golden-set + tiered CI-гейт.** *Гейт:* регрессия блокируется; пустой сьют = HARD FAIL.
- **Фаза 3 — Судьи + таксономия + тренды + headless scorecard.** *Гейт:* ни один судья не гейтит без свежей калибровки; кластеры стабильны; scorecard по API/MCP.
- **Фаза 4 — L1→L2 + content-safety + ledger.** *Гейт:* патч на tools/права отклонён; отравленный few-shot пойман; ledger-инвариант.
- **Фаза 5 — L3 judge-gated авто + canary/A-B (durable, opt-in, eligibility-gated).** *Гейт:* только eligible-агенты; независимый судья; resumability; авто-откат.
- **После:** инструментация → DoD в Agentic Product Standard; Python-SDK; ClickHouse-адаптер (если объём упрётся); `apps/console` (enterprise).

---

## 13. Риски и анти-паттерны (как ограничения)
- **R1.** Глобальный eval-сьют вместо golden-set на агента → метрика бессмысленна. *Запрещено (FR-EVAL-1).*
- **R2.** Авто-улучшение без независимого откалиброванного судьи → самоулучшение в шум. *Запрещено (FR-JUDGE-2, FR-IMPROVE-3 независимость).*
- **R3.** Авто-патчи, трогающие инструменты/права/границы доверия. *Запрещено механически (FR-IMPROVE-4 diff-allowlist).*
- **R4.** Пропуск version-реестра → нечему атрибутировать. *Запрещено (FR-REG, DB-enforced).*
- **R5/R6.** 100% инструментация на масштабе / vanity-метрика без трендов по кластерам. *Митигируется сэмплингом (FR-SDK-4) + significance-gated трендами (FR-FAIL-3).*
- **R7.** Сломанная span lineage через async → рассыпавшиеся трейсы. *Митигируется FR-CONTRACT-6 (+ фикстура).*
- **R8 (NEW).** Отравленный прод-трейс становится durable few-shot/card. *Запрещено (FR-IMPROVE-4b content-safety).*
- **R9 (NEW).** Трейсы вне RLS-механизма (отдельный стор) → cross-tenant утечка. *Запрещено (FR-INGEST-3 в том же Postgres; ClickHouse только за портом с изоляцией).*
- **R10 (NEW).** Reward-hacking судьи (общая идентичность с оптимизируемым). *Митигируется FR-IMPROVE-3 (провайдер+автор+sealed held-out).*

---

## 14. Открытые вопросы — ЗАКРЫТЫ (решения)
- **Q1 (L3-автономия).** GA: авто-применять **только `few_shot_append`** из прошедших трейсов (`outcome=success` ∧ `supported`), в field-scoped `few_shot[]`; system-prompt/context — L2. Граница = diff-allowlist + контент-гард. → FR-IMPROVE-4/4b/6.
- **Q2 (ретеншн).** Трейсы в Postgres/Timescale; энфорсимая per-tenant/severity политика; content default OFF; error-path 100%+90д. → FR-INGEST-3/4.
- **Q3 (baseline-сьют).** MUST (не open); детерм. ассерты из `harness.ts`; пустой golden-set = HARD FAIL. → FR-EVAL-0.
- **Q4 (open-core vs enterprise).** Open-core: контракт+SDK+ingest+реестр+eval+baseline+judge-калибровка+кластеры+ledger-схема+single-tenant scorecard-API+L1/L2. Enterprise: SSO/SAML+RBAC, audit+EU-AI-Act отчётность, fleet-вид, `apps/console`, L3+canary/A-B, VPC/on-prem.
- **Q5 (improvement-webhook).** Исходящее at-least-once HMAC-событие = проекция ledger; не блокирует пайплайн; `improvement` = durable Postgres-row state-machine. → §9.

---

## 15. Normalization contract (NEW)
Модуль нормализации: вход-адаптеры (OpenInference | `gen_ai.*` | framework-specific) → внутренняя модель APL. Определяет: (1) маппинг span-kind/атрибутов; (2) правило имени операции (`gen_ai.operation.name`); (3) эквивалентность = набор операций + parentage + наличие обяз. атрибутов (пост-нормализация); (4) канонический ключ при коллизии. Собственный движок AgenticMind (OpenInference `trace.ts`/`ask.ts`) проходит через тот же слой.

## 16. Safety envelope (Cycle of Trust, механически) (NEW)
Cycle of Trust форсируется кодом на трёх границах: (1) **patch diff-allowlist** (FR-IMPROVE-4) — структурное ограничение полей + отказ на tool/secret/scope-язык; (2) **контент-гард** (`guard.ts`) на любом машинно-сгенерированном/майненом промпте и few-shot (FR-IMPROVE-4b); (3) **ledger-инвариант** (FR-IMPROVE-5) — авто-мёрдж не записывается без полного обоснования. Инфраструктурно: VPC reference topology (Collector redaction + tail-sampling) и BYPASSRLS-fleet-роль с isolation-тестами.

## 17. L3 eligibility (NEW)
Агент L3-eligible только при code-enforced проверке: (i) per-agent golden-set ≥ N кейсов, покрывающих его именованные кластеры; (ii) per-agent судья со свежей стратифицированной калибровкой ≥ порога; (iii) независимый gating-судья доступен (провайдер+авторство отличны, sealed held-out). Eligibility видна на scorecard; L3 зажигается постепенно, не на GA.
