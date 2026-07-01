# APL PRD — v0.2 delta (правки к v0.1 по итогам ревью)

> Как использовать: это **набор точечных замен** к `APL-PRD-v0.1.md`. Каждый пункт — `БЫЛО → СТАЛО` либо `NEW`.
> Обоснование каждого пункта — в `APL-REVIEW-findings.md` (id вида `dimension#N`) и `APL-plan-and-openq.md`.
> Статус метода: 8 линз × grounded-в-`AgenticMind@0.8.0` → 53 findings → 26 верифицировано (22 выжило, 4 отклонено).

---

## 0. Сводка изменений (changelog)

| # | Раздел | Изменение | Findings |
|---|---|---|---|
| D1 | C3, FR-INGEST-3, NFR-SCALE-1 | Снять мандат **ClickHouse**; трейсы → Postgres/TimescaleDB; ClickHouse = post-MVP адаптер за портом | integ#2 🔴, ingest#1/#3 |
| D2 | FR-CONTRACT-1..3, §3 | Признать **OpenInference** инкумбентом; канон — GenAI через **normalization-слой**; имя спана = `{operation} {model}` | contract-otel#2, sdk#4, integ#3 |
| D3 | FR-CONTRACT-4, C2 | Убрать `OTEL_SEMCONV_STABILITY_OPT_IN` как механизм (no-op); эмитить экспериментальные спаны напрямую | contract-otel#3 |
| D4 | FR-CONTRACT-5, NFR-PORT-1, NG5 | `moai.*` → **`apl.*`**; идентичность на **OTel Resource**, per-invocation на спане | contract-otel#4, integ#4 |
| D5 | FR-SDK-2 | Разбить по режиму интеграции: адаптеры авто-инструментят tools; raw-режим = явный `instrumentTools()` | sdk#1 |
| D6 | FR-SDK-4 | «100% на ошибках/медленных» **требует OTel Collector** (tail-sampling); SDK = head + keep-hint | sdk#2 |
| D7 | FR-SDK-5, NFR-PRIV-1 | Редакция — **in-process span-processor** (гарантия «до экспорта»); Collector/Presidio — опц. апгрейд | sdk#3, integ#5 |
| D8 | FR-INGEST-1 | Явно: OTLP-**ресивер** — net-new (движок только экспортит) | failure#5 |
| D9 | FR-REG-2 | Канонизация `prompt_hash`/`tools[]`/`params`; дедуп промптов; DB-энфорс иммутабельности | ingest#5 |
| D10 | FR-EVAL (NEW baseline), FR-EVAL-4 | Baseline-сьют → **MUST**; cold-start; пустой сьют = HARD FAIL; `case_set_hash` | eval#2, eval#7 |
| D11 | FR-EVAL-3 | Стратифицированный майнинг (не только фейлы); train/gate split; контракт майнинга контента | eval#3/#4 |
| D12 | FR-JUDGE-2 | ≥50/класс + Wilson-LB>0.8 (не точечная); min-N гейт | judge#1, sdk#7 |
| D13 | FR-JUDGE-1/3 | Model-snapshot-id в версию судьи; expiry калибровки; verdict→binary контракт; train/test split | judge#4/#5/#6, eval#6 |
| D14 | FR-IMPROVE-3 (NEW) | Независимость gating-судьи (провайдер+автор+disjoint labels+sealed held-out) | improve-trust#4, judge#3 |
| D15 | FR-IMPROVE-4 | Граница = diff-allowlist + контент-гард (не ярлык); «`tools[]` не изменился» ≠ достаточно | improve-trust#2 |
| D16 | FR-IMPROVE (NEW content-safety) | Гард на **любой** майненый few-shot/промо-артефакт + provenance/quarantine | improve-trust#3 |
| D17 | FR-IMPROVE-5 | Ledger дополнить полями отката/аудита (code-level invariant) | improve-trust#5 |
| D18 | FR-IMPROVE-6 (NEW eligibility) | L3-eligibility как code-enforced проверка (реестр golden-set + свежая калибровка) | improve-trust#6 |
| D19 | FR-FAIL-2 | 4-стадийная таксономия = **net-new** отдельные build-айтемы; controlled vocabulary; стабильность кластеров | failure#1/#2 |
| D20 | FR-FAIL-3 | Операц. определение «новый кластер»; тренд на **значимости** (EWMA/Poisson), не на появлении | failure#3/#4 |
| D21 | FR-FAIL (table) | `failure_cluster` — новая таблица, ключ **(tenant_id, agent_id)**, поиск в партиции агента | failure#7 |
| D22 | FR-SCORE-1/3 | Scorecard = **headless** read-model/API/MCP; fleet — через BYPASSRLS→scrubbed-таблицу | integ#1/#7 |
| D23 | FR-INTEG-2/4 | Адаптеры = per-framework + нормализация; VPC-референс-топология в `deploy/` | integ#3/#7 |
| D24 | NFR-PERF-1 | Определить метрику/baseline/workload + бенч-артефакт | sdk#5 |
| D25 | NFR-REL-1 | L3 = durable resumable Postgres-row state-machine (брокера нет) | integ#6 |
| D26 | C4, §1.1 G1 | Исправить «v1.4.0» → факт (v0.8.0); G1 = ≤1 день против **hosted**; L3 «зажигается постепенно» | ingest#3, sdk#6, improve-trust#6 |

---

## 1. Ограничения и допущения (§10)

**C3 — БЫЛО:** «Стек фиксирован: TS-first SDK, Postgres+pgvector, ClickHouse, OTel Collector.»
**СТАЛО:** «Стек: TS-first SDK, **Postgres + pgvector + TimescaleDB** (уже в `deploy/docker-compose.yml`, `timescaledb-ha:pg17`), OTel Collector (required для tail-sampling/redaction на self-hosted). **ClickHouse — НЕ в MVP-пути**: только как опциональный `TraceStore`-адаптер за интерфейсом (как предписывает `CONTRIBUTING.md`) для post-MVP scale-тира, если реальный write-объём это потребует.»

**C4 — БЫЛО:** «Tenant-isolation уже присутствует в AgenticMind (v1.4.0) и переиспользуется.»
**СТАЛО:** «Tenant-isolation присутствует в AgenticMind (**фактически v0.8.0**, `drizzle/0003_tenant_isolation.sql`: `FORCE ROW LEVEL SECURITY` + policy на GUC `app.current_tenant`, `client.ts withTenant`) и переиспользуется. **Инвариант:** любая новая APL-таблица наследует ту же RLS-политику; данные, которые нельзя завести под Postgres RLS, не хранятся в отдельном сторе без эквивалентного below-the-app механизма изоляции + isolation-тестов.»

**NEW C6:** «APL — модуль AgenticMind, но существенно расширяет его поверхность (по ревью: из ~96 требований 34 net-new). Позиционирование в маркетинге/доках — “observability & improvement подсистема на движке AgenticMind”, не “тонкая обёртка”.»

## 2. Цели (§1.1)

**G1 — уточнение:** «≤1 день time-to-first-trace **против hosted-endpoint (SaaS)**. Для self-hosted/VPC — отдельный честный onboarding-SLA, включающий bring-up Collector + trace-store + retention (см. §16 VPC reference topology).»

**G4 — уточнение:** «Три уровня автономии; **L3 зажигается постепенно, по мере того как агент проходит code-enforced eligibility** (§ FR-IMPROVE-6-NEW), а не одномоментно на GA.»

---

## 3. Контракт телеметрии (§6.1)

**FR-CONTRACT-1 — БЫЛО:** база = OTel GenAI semconv; собственный формат не вводится.
**СТАЛО:** «Внутренняя каноническая модель APL — OTel GenAI semconv. **Инкумбент в самом движке — OpenInference** (`packages/shared/src/lib/observability/trace.ts`: `openinference.span.kind`, `llm.model_name`, `input.value`), поэтому вводится **normalization-слой** (§15), маппящий И OpenInference (свои спаны движка), И `gen_ai.*` (внешние продукты) во внутреннюю модель. Собственный формат телеметрии не вводится; проприетарен только неймспейс `apl.*` для полей, которым нет стандартного ключа.»

**FR-CONTRACT-2 — БЫЛО:** канонические спаны `invoke_agent` / `chat` / `execute_tool`.
**СТАЛО:** «Канонические **операции** (значения `gen_ai.operation.name`): `invoke_agent` (корень), `chat` (LLM-вызов), `execute_tool` (вызов инструмента). **Имя спана = `{gen_ai.operation.name} {subject}`** (напр. `chat gpt-4o`, `execute_tool get_weather`) — как требует semconv; `chat`/`execute_tool` — НЕ имена спанов. **Приём и агрегация APL ключуют на `gen_ai.operation.name` + `apl.agent_id`, НЕ на raw span-name** (иначе конформные инструменторы с суффиксом модели фрагментируют группировку).»

**FR-CONTRACT-4 — БЫЛО:** экспериментальные спаны включаются через `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental`.
**СТАЛО:** «APL-SDK **эмитит GenAI-экспериментальные спаны напрямую** и фиксирует версию конвенций как значение в конфиге APL. Env-var `OTEL_SEMCONV_STABILITY_OPT_IN` **не используется как механизм** — его читают instrumentation-библиотеки (которых в стеке нет; спаны строятся вручную через `@opentelemetry/api`), т.е. флаг был бы no-op. Константы GenAI брать из `@opentelemetry/semantic-conventions/incubating` (в 1.41.1 есть, 175 `ATTR_GEN_AI`) либо вендорить свой пиннованный набор.»

**FR-CONTRACT-5 — БЫЛО:** namespaced `moai.*`: agent_id, agent_version, product_id, tenant_id, task_id, outcome, human_feedback, decision_reason.
**СТАЛО:** «Неймспейс **`apl.*`** (не `moai.*` — vendor-neutrality/Apache-2.0). **Стабильная идентичность** (`tenant_id`, `product_id`, `agent_id`, `agent_version`) — на **OTel Resource** (`resourceFromAttributes`, как в `apps/server/src/tracing.ts`), НЕ на каждом спане. На спане — только **per-invocation факты**: `apl.task_id`, `apl.outcome`, `apl.human_feedback`, `apl.decision_reason`. Тенант-изоляция при приёме ключуется на Resource-идентичность, не на надежду, что каждый спан несёт правильный атрибут.»

**FR-CONTRACT-2/3 acceptance — БЫЛО:** трейс из LangGraph и из голого кода → идентичная структура дерева.
**СТАЛО:** «…→ **пост-нормализационная эквивалентность**: одинаковый набор операций `{invoke_agent, chat, execute_tool}` + корректный parentage + наличие обязательных `gen_ai.*`+`apl.*` атрибутов. Лишние framework-внутренние спаны **допускаются и сохраняются**. Тест гоняется против двух in-repo fixture-продуктов (§ Phase 0).»

---

## 4. SDK (§6.2)

**FR-SDK-2 — БЫЛО:** авто-инструментация `execute_tool` без ручного кода на каждый инструмент.
**СТАЛО:** «(a) **framework-режим:** авто-`execute_tool` через tool-hook каждого фреймворка (адаптер). (b) **raw/manual-режим:** тонкий `instrumentTools(toolMap)` / `wrapTool()` один раз на продукт (в TS нет runtime monkey-patch произвольных функций). Формулировка “без ручного кода” = **per-tool, не per-product**; для raw-пути одна интеграция SDK обязательна.»

**FR-SDK-4 — БЫЛО:** SDK делает tail-sampling (~5%, 100% на ошибках/медленных).
**СТАЛО:** «SDK делает **head-sampling** + always-keep-hint для спанов, помеченных приложением как ошибка (`recordOutcome('fail')`). **Tail-sampling с гарантией «100% на ошибках И медленных» реализуется OTel Collector (`tailsamplingprocessor`) и требует Collector как обязательный компонент** (latency известна только после завершения трейса; head-семплер решает на старте корня и физически не может гарантировать keep-on-slow).»

**FR-SDK-5 — БЫЛО:** редакция PII на эмите (redaction-процессор коллектора **или** Presidio-сайдкар) до экспорта.
**СТАЛО:** «Авторитетная граница редакции — **in-process span-processor в SDK** (переиспользует regex-набор `guard.ts`: email/phone/card/SSN/IPv4, EN+RU), чтобы «до экспорта» было буквально истинно. Content-capture (`gen_ai.input/output.messages`) **по умолчанию OFF**; при включении — обязательный прогон редакции + secret-detection (энтропия + известные key-паттерны) по атрибутам tool-спанов ДО экспортёра. Collector-processor/Presidio — **опциональный higher-recall апгрейд**, не равнозначная альтернатива. NFR-PRIV-1 переформулировать: “PII редактируется **до persistence**”, с явным заявлением остаточного окна экспозиции на self-hosted.»

## 5. Приём/хранение и реестр (§6.3–6.4)

**FR-INGEST-1 — дополнение:** «Приём по OTLP. **Замечание: OTLP-ресивер — net-new** (сегодня AgenticMind только ЭКСПОРТИРУЕТ спаны через `BatchSpanProcessor`/`OTLPTraceExporter`, ресивера и трейс-стора нет).»

**FR-INGEST-3 — БЫЛО:** поток трейсов хранится в ClickHouse.
**СТАЛО:** «Поток трейсов хранится как **TimescaleDB-гипертаблица в том же Postgres** (`create_hypertable` + native columnar compression + `add_retention_policy`). Это (1) держит RLS-изоляцию, (2) делает FK `trace → (agent_id, agent_version)` **реальным** enforced-ограничением, (3) позволяет FR-INGEST-5 pgvector/diskann-поиск по тем же строкам на `EMBEDDING_DIMENSIONS=1024`. ClickHouse — post-MVP адаптер за `TraceStore`-портом.»

**FR-INGEST-5 — уточнение:** «Семантический поиск по фейл-трейсам через pgvector/diskann (`vector_cosine_ops`, как `chunks.ts`/`ask-clusters.ts`), **в том же Postgres**, dimension = `_config.ts EMBEDDING_DIMENSIONS` (1024) — без отдельного вектор-пространства и без cross-store ETL.»

**FR-REG-2 — дополнение:** «`prompt_hash` = sha256 по **канонизированному** (trim/нормализация whitespace) промпту; distinct-промпты хранятся один раз по хэшу, версии ссылаются (`prompt_ref`). Детерминированная канон-сериализация для `tools[]`/`params`/`context_strategy` (сортировка ключей/элементов), по которой считается хэш и определяется “что есть смена конфига” (FR-REG-4). Иммутабельность энфорсится в БД: `REVOKE UPDATE` + `BEFORE UPDATE`-триггер (по образцу append-only дисциплины `ask-clusters`). `model` хранится как **пиннованный snapshot-id** (не плавающий алиас).»

---

## 6. Evals (§6.5)

**NEW FR-EVAL-0 (MUST) — Baseline-сьют (закрывает Q3):** «У каждого агента есть обязательный **детерминированный baseline assert-suite** (без LLM-судьи), собранный из готовых ассертов `harness.ts`: (1) валидность схемы ответа / tool-call; (2) latency/cost в объявленном бюджете; (3) нет PII/инъекций в выводе (`guard.ts`); (4) abstain на out-of-scope; (5) для grounded-агентов `minCitations≥1`/groundedness≥порог; (6) forbidPhrases. Baseline блокирует в PR CI.»

**FR-EVAL-4 — дополнение (cold-start + анти-vanity):** «Гейт сравнивает против **сохранённого score предыдущей `agent_version` на том же `case_set_hash`** (не против фикс-константы). **Cold-start:** v1 нового агента гейтится baseline-сьютом (FR-EVAL-0), version-diff-гейт активируется только после ≥N seed-кейсов. **Пустой/отсутствующий golden-set = HARD FAIL (блок)**, никогда `passRate=1` (сегодня `harness.ts` возвращает 1 на пустом сьюте — это дыра). Empty-class shortcut в калибровке (tpr/tnr=1) не гейтит ничего.»

**FR-EVAL-3 — дополнение (анти-selection-bias + анти-leakage):** «Golden-set растёт из прода, но **обязан включать успехи + эскалации + abstain**, не только thumbs-down; доля failure-derived кейсов ограничена. **train/gate split:** кейсы, которые видел L2/L3-улучшатель, **исключаются** из scoring-набора гейта. Периодическая ротация held-out. **Контракт майнинга контента:** для `outcome=fail`-трейсов — 100% content-capture (input/output/tool-I/O), quarantined, redacted-но-labelable; reference/rubric авторит человек. Кейс-сет **версионируется `case_set_hash`**; тренд рендерится по замороженным поколениям.»

## 7. Судьи (§6.6)

**FR-JUDGE-1 — дополнение:** «`judge_version`-хэш включает: prompt + **точный model-snapshot-id** + версию конвенций + verdict→binary-маппинг. Калибровка **истекает** при {смена промпта, смена model-id, возраст > N дней}.»

**FR-JUDGE-2 — БЫЛО:** ≥100 меток; TPR и TNR обе > 80%.
**СТАЛО:** «Калибровка на **классово-стратифицированном** наборе: **≥50 позитивов И ≥50 негативов**; критерий — **нижняя граница Wilson-95% по обеим TPR и TNR > 0.8** (не точечная оценка; вынуждает растить n при тонком классе). Явный **min-N + non-empty-class гейт** (сегодня `computeCalibration` даёт tpr=1 на пустом позитив-классе). Долю human vs synthetic в наборе публиковать честно (текущий репо-набор 110/129 синтетичен).»

**FR-JUDGE-3 — дополнение:** «Verdict→binary — **фиксированный контракт**: позитив только `supported` (как `judgeAllowsPromotion`), маппинг хранится с `judge_version`. **train/test split меток:** промпт судьи тюнится только на dev-сплите; TPR/TNR публикуются на **залоченном test-сплите**, не осматриваемом при итерации (≥50/класс — на test-сплит). Оракул калибровки отличен от судьи-под-тестом (правило `eval/README.md` → в ранг FR).»

## 8. Анализ ошибок (§6.7)

**FR-FAIL-2 — дополнение:** «4 стадии = **отдельные net-new build-айтемы** со своими acceptance: (1) NN-embedding join (reuse `feedback-builder.ts`); (2) LLM open coding; (3) axial coding в **per-agent controlled vocabulary**, растущий только через ревью; (4) стабильные именованные категории. Coding-модель+промпт — versioned entity (по образцу `judge_version`). **Стабильность кластеров:** пересчёт центроидов после каждого свипа + переназначение (или HDBSCAN на агента) — не online-greedy с замороженным первым центроидом (текущий `clustering.ts`); durable-идентичность через label-embedding с carry-forward-мэтчем (Hungarian по cosine, “переименован”→тот же id); **determinism-тест**: тот же fail-set → стабильные id/labels между двумя прогонами. Бюджет LLM open-coding (идёт по каждому фейл-трейсу, не по 5%-сэмплу) в NFR-OBS-1.»

**FR-FAIL-3 — БЫЛО:** алерт при появлении нового кластера после деплоя.
**СТАЛО:** «Кластер **новый** iff: (a) прошёл `MIN_CLUSTER_SIZE`, (b) label-embedding cosine < T ко всем прежним кластерам этого агента, (c) первый member по времени позже `agent_version.created_at` (hard-зависимость от реестра версий). Алерт гейтится **статистической значимостью** (EWMA/Poisson-rate change с порогом уверенности), не сырым появлением; при недельном объёме фейлов ниже заявленного минимума trend-алерты подавляются.»

**FR-FAIL-5 — БЫЛО:** «типовая цель 3–7 кластеров.»
**СТАЛО:** «3–7 — **необязывающее наблюдение**, не требование. Для ≤10-бюджета — явная агломерация (merge label-embedding в пределах T, cap N поглощением мелких в “other”).»

**FR-FAIL (table) — дополнение:** «`failure_cluster` — **новая таблица**, ключ **(tenant_id, agent_id)** (НЕ `ask_clusters` переименованный — там `tenantColumn`, но нет `agent_id`; иначе два агента одного тенанта с похожими фразами сольются в один кросс-агентный кластер, ломая FR-EVAL-1/R1). pgvector-поиск фильтруется в партицию агента; проверить diskann-perf с `agent_id`-пре-фильтром.»

## 9. Цикл улучшения (§6.8)

**FR-IMPROVE-3 — дополнение (независимость + анти-reward-hacking):** «Gating-судья L3 **обязан** отличаться от eval/calibration-судьи по **model-провайдеру И авторству промпта**, и быть калиброван на **disjoint held-out** наборе. Eval-корпус делится на tuning-set (виден proposer’у) и **sealed held-out** (виден только gating-судье, ротируется). В каждый per-agent golden-set добавляются adversarial/anti-gaming кейсы. Gating-судья пере-мерится против свежих human-меток на ротирующемся сэмпле **собственных предложений цикла**; авто-мёрдж блокируется при дрейфе калибровки ниже порога.»

**FR-IMPROVE-4 — БЫЛО:** авто-эволюция только промпта/контекста/few-shot; инструменты/права не меняются.
**СТАЛО:** «Граница = **механический diff-allowlist по патчу** (структурно ограничен designated prompt/few-shot полями; отклонить любое изменение, ссылающееся на имена инструментов, секреты, access-глаголы, scope-язык) **+ контент-гард** (расширенные паттерны `guard.ts`) над патченым промптом на инъекции/эксфил. **Явно: “`tools[]` не изменился” — необходимо, но НЕ достаточно** (авто-патч промпта может добавить `“always call delete_record”` при байт-идентичном `tools[]`). DoD тестирует контент диффа, не только массив инструментов.»

**NEW FR-IMPROVE-4b (content-safety на майненых артефактах):** «Перед тем как любой майненый трейс станет few-shot или promoted-card, он **обязан** пройти те же `guard.ts` injection/exfil/PII-гейты, что и вход агента, + output-leak-чек, + **отдельное judge-измерение “это инструкция, а не ответ?”**. Каждый пример provenance-тегируется `source_trace_ref` + tenant; примеры из low-trust/анонимного трафика — в quarantine. (Сегодня `feedback-promoter.ts` промоутит в `knowledge_cards` через ОДИН grounding-судья и **0 guard-вызовов** — это живой stored-injection-канал, который надо закрыть.)»

**FR-IMPROVE-5 — БЫЛО:** improvement фиксирует version_from→to, hypothesis, eval_delta, status, author.
**СТАЛО:** «+ `patch_diff` (structured, field-scoped), `eval_run_id` + **per-failure-mode дельта** (не только агрегат), `judge_id`+`judge_version`+**снапшот калибровки (TPR/TNR, label_count) на момент решения**, `source_trace_refs` майненого контента, canary/A-B исход, `rollback_of`. **Code-level invariant:** запись с `author=judge-gated` **не записывается** без всех этих полей (по образцу `guard-events.ts`, всегда хранящего actor+reason+hash).»

**NEW FR-IMPROVE-6b (L3-eligibility, реформулирует A2 из допущения в критерий):** «Агент L3-eligible **только** при code-enforced проверке: (i) per-agent golden-set ≥ N кейсов, покрывающих его именованные кластеры; (ii) per-agent судья со **свежей стратифицированной** калибровкой ≥ порога. Eligibility видна на scorecard; L3 зажигается постепенно, не на GA.»

## 10. Scorecard/контрол-плейн (§6.9)

**FR-SCORE-1 — дополнение:** «Scorecard — **headless read-model** (материализованный per-agent вид) + version-diff, экспонируется как **REST/JSON + MCP-тулы** (reuse `mcp-tokens`/`mcp-scopes`). Любой рендер-UI — отдельное downstream-приложение (`apps/console`) со своим auth/RBAC, вне модуля AgenticMind и вне MVP (снимает конфликт с ROADMAP-non-goal “no frontend/headless substrate”).»

**FR-SCORE-3 — дополнение:** «Fleet-вид требует cross-tenant чтения, что `FORCE RLS` запрещает → реализуется **выделенной `BYPASSRLS`-агрегат-ролью, пишущей tenant-scrubbed fleet-metrics таблицу** (никогда raw cross-tenant span-доступ), с isolation-тестами. Fleet-вид → enterprise-edition.»

## 11. Интеграция/деплой (§6.10)

**FR-INTEG-2 — БЫЛО:** тонкие адаптеры; всё, что эмитит OTel GenAI, интегрируется маппингом.
**СТАЛО:** «**Per-framework адаптер с normalization-слоем** (§15) — не тонкий field-map: LangGraph/CrewAI эмитят OpenInference/OpenLLMetry, OpenAI Agents SDK — свой формат, Claude Agent SDK не имеет native GenAI-эмиттера. MVP: **один reference-адаптер (raw/manual TS)** + собственный движок AgenticMind (через OpenInference→нормализация); остальные фреймворки — follow-up с conformance-тестами.»

**FR-INTEG-4 — дополнение:** «SaaS и self-hosted/VPC — один контракт **на уровне API/семантики**; операционно VPC-режим требует референс-топологии (Collector с redaction+tail-sampling процессорами, trace-store, retention-job), поставляемой в `deploy/`. “Identical contract” не заявляется, пока VPC-топология не упакована.»

## 12. NFR (§7)

**NFR-PERF-1 — дополнение:** «Определить конкретно: метрика = добавленные CPU-ms/turn + добавленная p99-latency; baseline = SDK выключен; референс-workload; варианты content-capture ON/OFF. **Бенч-харнесс — acceptance-артефакт**, не прозаическое утверждение. (`<1% от end-to-end latency` тривиально-истинно для I/O-bound агента и бессмысленно; мерить CPU-оверхед сериализации атрибутов.)»

**NFR-PORT-1 — БЫЛО:** vendor-neutrality; нет lock-in формата.
**СТАЛО:** «Портируемо на **транспортном (OTLP) уровне**; на **семантическом уровне** APL требует `apl.*`-атрибутов (это нормально и не скрывается). Где есть стандартные ключи — использовать их (маппить `agent_id`/`agent_version` на emerging `gen_ai.agent.*`, tenant — на Resource); `apl.*` только для реально кастомных полей.»

**NFR-REL-1 — дополнение:** «L3-оркестрация (propose→eval→judge→canary→A/B→promote/rollback) = **durable resumable Postgres-row state-machine** (`improvement` как реальная state-machine, идемпотентные resumable-шаги), т.к. единственный durable-примитив сегодня — суточный advisory-lock sweep, брокера нет. Каждый шаг переживает рестарт воркера. Проверяется restart-тестом.»

## 13. Модель данных (§8) — правки

- `moai.*` → `apl.*` во всех атрибутах; идентичность на Resource (см. D4).
- `agent_version`: `prompt_ref` (дедуп по хэшу) вместо инлайн-дубля; `model_snapshot_id`; `tools_canonical`.
- `trace/span`: живёт в TimescaleDB-гипертаблице того же Postgres; FK на `agent_version` реален.
- `judge`: + `model_snapshot_id`, `label_count`, `verdict_binary_mapping`, `calibrated_at`, `dev/test split ref`.
- `failure_cluster`: ключ `(tenant_id, agent_id)`, + `label_embedding` (для carry-forward).
- `improvement`: + `patch_diff`, `eval_run_id`, `per_mode_delta`, `judge_version`, `calibration_snapshot`, `source_trace_refs`, `canary_ab_outcome`, `rollback_of`.
- `eval_case`/`eval_run`: + `case_set_hash`.

## 14. Интерфейсы (§9) — improvement-webhook (закрывает Q5)

«**Исходящее, at-least-once, HMAC-подписанное** событие на каждый переход `improvement` (`proposed/approved/rejected/deployed/canary_started/rolled_back`). `X-APL-Signature: sha256=<hmac>` над raw-body, `event.id` для идемпотентности. Ретраи exp-backoff (1m,5m,30m,2h,6h) до 24ч → dead-letter Postgres-таблица с replay. Payload = проекция ledger (см. FR-IMPROVE-5), **без контента, только redacted trace_refs**. SLA emit ≤60с (p95) после commit транзакции. **Не блокирующий** пайплайн: апрув L1/L2 постится обратно `POST /improvements/{id}/decision`.»

## 15. NEW §15 — Normalization contract

«Модуль нормализации: вход-адаптеры (OpenInference | `gen_ai.*` | framework-specific) → внутренняя модель APL. Определяет: (1) маппинг span-kind/атрибутов; (2) правило имени операции (`gen_ai.operation.name`); (3) эквивалентность = набор операций + parentage + наличие обяз. атрибутов (пост-нормализация); (4) какой ключ канонический при коллизии. AgenticMind-движок (OpenInference `trace.ts`/`ask.ts`) проходит через тот же слой — решить, что канон, и транслировать второе.»

## 16. NEW §16 — Safety envelope (Cycle of Trust, механически)

«Cycle of Trust форсируется кодом на трёх границах: (1) **patch diff-allowlist** (FR-IMPROVE-4) — структурное ограничение полей + отказ на tool/secret/scope-язык; (2) **контент-гард** (`guard.ts`) на любом машинно-сгенерированном/майненом промпте и few-shot (FR-IMPROVE-4b); (3) **ledger-инвариант** (FR-IMPROVE-5) — авто-мёрдж не записывается без полного обоснования. Плюс VPC reference topology (Collector redaction + tail-sampling) и BYPASSRLS-fleet-роль с isolation-тестами.»

## 17. §12 План и §14 Открытые вопросы

- §12 (фазовый план) — **заменён** на план в `APL-plan-and-openq.md` (north-star + Phase 0→5, reuse/net-new/gate/risks на фазу).
- §14 Q1–Q5 — **закрыты** (ответы в `APL-plan-and-openq.md`; кратко отражены в D-правках: Q1→FR-IMPROVE-6b/4b, Q2→FR-INGEST-3/retention, Q3→FR-EVAL-0, Q4→open-core/enterprise split, Q5→§14 webhook).
