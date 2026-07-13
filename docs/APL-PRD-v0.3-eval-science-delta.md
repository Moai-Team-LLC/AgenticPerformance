# APL — Eval-Science delta (v0.3): measurement science

**Что это.** Дельта к [`APL-PRD-v0.2.md`](APL-PRD-v0.2.md), вносящая *measurement science* из **[Agentic Product Standard v3.1](https://github.com/Moai-Team-LLC/agentic-product-standard) Part V** (Judge calibration, Retrieval evaluation, Ground-truth discipline, Drift monitoring, Human oversight). APL — reference implementation слоёв оценки/наблюдаемости стандарта; эти требования делают *откалиброванность судей, происхождение golden-set и дрейф* явными и нормативными, а не подразумеваемыми.

**Формат** — расширения существующих FR + два новых блока (FR-DRIFT, FR-HITL). **Спек-стадия** (design-doc, не код). **Канонические термины** (Judge Card, ECE, Brier, swap-consistency, Recall@k, MRR, provenance, unanchored, representativeness, gold probe) — по глоссарию стандарта, **без синонимов**. Источник: гэп-анализ vs классическая ML-оценка (`eval-science-gap-closure-spec.md`).

Многое уже покрыто v0.2 (калибровка точности TPR/TNR + Wilson-LB + staleness в FR-JUDGE; golden-set с `case_set_hash`/`source_trace_ref`; независимый откалиброванный gating-судья в FR-IMPROVE-3). Ниже — только *net-new* поверх этого.

---

## 1. Judge Card — расширяет FR-JUDGE (§6.6)

Сегодня `judge` несёт калибровку **точности** (TPR/TNR, Wilson-LB, snapshot, staleness). Стандарт v3.1 требует ещё и **confidence-калибровку** + bias-battery, оформленные версионируемым артефактом **Judge Card**.

**FR-JUDGE-5 (MUST) — Judge Card.** Каждый судья несёт версионируемый Judge Card:

```yaml
judge_id: citation-enforcer-v3
rubric_version: 2.1              # рубрика — версионируемый артефакт, §4
model: <family/version>
anchored_accuracy: 0.87          # vs ground-truth anchor sample (= контур TPR/TNR, FR-JUDGE-2)
ece: 0.06                        # Expected Calibration Error
brier: 0.11
bias_battery:
  swap_consistency: 0.94         # (A,B) vs (B,A); флип с порядком = position bias
  self_preference: pass          # тест cross-family
  verbosity: pass
anchor_sample: {n: 120, window: 90d, source: adjudicated}
last_calibrated: 2026-07-01
status: calibrated | uncalibrated | stale
```

- **status:** `uncalibrated` — нет anchor sample или ниже declared-порогов (включая существующий Wilson-LB>0.8 из FR-JUDGE-2); `stale` — `last_calibrated` старше declared recency-окна (= существующий expiry FR-JUDGE-1).
- **Confidence-сигнал для гейтинга** = self-consistency (k=3–5) или swap-consistency; **никогда** raw verbalized confidence (систематически overconfident).
- Reuse: `judge-calibration.ts` / `calibrate.ts` (расширить на ECE/Brier/swap). Net-new: поля bias-battery + status + anchor_sample-провенанс (модель данных — §7).

**FR-JUDGE-6 (MUST) — инвариант Cycle of Trust.** Судья со `status != calibrated` **НЕ** гейтит L3-переходы, auto-apply (FR-IMPROVE-3) и release-гейты — зеркалит Standard Canon 5 *calibration invariant* и eval-анти-паттерн «flaky graders in release gates». Низкоуверенный вердикт → **abstain → эскалация** (FR-HITL), а не проходит. Усиливает критерий приёмки FR-JUDGE и eligibility FR-IMPROVE-6.

## 2. Staged failure attribution — расширяет FR-FAIL (§6.7)

**FR-FAIL-6 (MUST) — стадийная атрибуция.** К per-agent controlled-vocabulary таксономии (FR-FAIL-2) добавляется **ортогональная ось стадии пайплайна**: `retrieval_miss | reasoning_error | tool_error | verification_error`. Кластеризация тегирует стадию; scorecard даёт per-stage дашборды. Retrieval- и reasoning-фейлы — разные болезни; end-to-end-метрика, смешивающая их, не направляет улучшение.

**FR-FAIL-7 (SHOULD) — retrieval как first-class категория.** Retrieval-метрики (§3) — отдельная eval-категория, не смешанная с end-to-end task-метриками. APL принимает retrieval-eval из harness AgenticMind (адаптер по образцу приёма AgenticOps-runs) и связывает стадию `retrieval_miss` с провалом Recall@k.

## 3. Retrieval evaluation — новое, ложится в FR-EVAL (§6.5)

**FR-EVAL-6 (MUST).** Для агентов с memory/retrieval APL хранит retrieval-eval отдельным case-set: `{query, relevant_memory_ids[], relevance_grade?, provenance}` (provenance — §4). Метрики: **Recall@k (k=1,3,5,10), MRR**; NDCG — только при graded relevance. **Retrieval regression gate:** смена embedding-модели / chunking / index-параметров обязана пройти гейт (стартовый бар: без регресса Recall@5; `pass^3` для release-critical) до деплоя — *отдельно* от общего eval-гейта (FR-EVAL-4). Harness — на стороне AgenticMind; APL держит контракт, ingestion и per-stage дашборд. Позиционирование: citations доказывают, что ответ заземлён в извлечённом; Recall@k доказывает, что нужное было извлекаемо — аудит требует обоих.

## 4. Ground-truth provenance — расширяет FR-EVAL (§6.5) + модель данных (§8)

**FR-EVAL-7 (MUST) — провенанс golden-айтема.** Каждый golden-айтем несёт:

```yaml
label: ...
rubric_version: 2.1
labeler: human | model:<id> | hybrid
label_date: 2026-06-14
agreement: {raters: 2, kappa: 0.78}       # при multi-labeled
origin: authored | adjudicated | review_capture   # review_capture → §6
```

Сеты без провенанса → флаг **`unanchored`**; unanchored-сет **НЕ** бэкает Loop License / release-гейт (зеркалит Standard DoD 22). Расширяет существующие `case_set_hash` / `source_trace_ref`. Adjudicated-айтемы (третий судья / человек по расхождению) — материал высшего сорта.

**FR-EVAL-8 (MUST) — рубрики как supply-chain артефакты.** Файлы рубрик — в git, версионируются; смена рубрики обязана триггерить **re-baseline каждого судьи**, её использующего (новый anchor-ран → обновлённый Judge Card). Интегрируется с Standard *Instruction Supply Chain* (рубрики = инструкции: provenance + eval-before-deploy + regression-on-update).

**FR-JUDGE-7 (SHOULD) — квалификация + gold probes.** Судья входит в ротацию только после **gold-question exam** по своей рубрике. Continuous QA: **2–5% judge-вызовов — gold probes**; тренд probe-accuracy трекается, алерт на спад (двойное назначение — детекция judge-drift, §5). Совместимо с disjoint-инвариантом FR-JUDGE-4 (gold-probe-сет disjoint от calibration/taxonomy).

## 5. Drift monitoring — новое (FR-DRIFT)

**FR-DRIFT-1 (MUST) — representativeness score.** Rolling-метрика: embedding-distribution distance между недавним прод-трафиком (из OTel-трейсов, уже в APL) и каждым golden-set — centroid-cosine shift + two-sample classifier AUC (AUC≈0.5 = то же распределение, →1.0 = дрейф). Пробой declared-порога → авто-открытие таски «golden set refresh» (→ review-пайплайн §6 за новыми лейблами). Отвечает на «**когда мои evals перестали представлять прод?**» — превращает поддержку golden-set из календарной привычки в триггерную обязанность.

**FR-DRIFT-2 (SHOULD) — behavior drift.** Мониторинг tool-call mix per agent из существующих OTel-данных; алерт на значимый сдвиг (significance-гейт как FR-FAIL-3). Для агентов автономии ≥ L2. *(Provider drift — canary hosted-моделей — реализуется в AgenticGateway (Layer 1); APL принимает результаты канареек как eval-сигнал и триггерит eval regression gate.)*

## 6. Human oversight / review pipeline — новое (FR-HITL)

**FR-HITL-1 (MUST) — review capture.** Каждое human-решение ревью/оверрайд захватывается как лейбл-дата `{item, decision, reviewer, rubric_version, timestamp}` → `origin: review_capture` golden-кандидаты (§4). Расширяет существующее переиспользование human-аннотаций (FR-JUDGE-4), сохраняя disjoint-инвариант.

**FR-HITL-2 (MUST) — стратификация.** Review→golden пайплайн со **stratified sampling** (declared escalation:random ratio): если к человеку попадают только эскалации/трудные кейсы, review-derived golden-дата перекошена в трудную сторону — берём эскалации **плюс** случайную выборку рутинного трафика.

**FR-HITL-3 (SHOULD) — reviewer ops дашборд.** Queue age, SLA-compliance, override-rate, reviewer–judge agreement. **Sampling schedule как trust-инструмент**: интенсивность надзора падает с заслуженным доверием (100% ревью → 10% аудит → 2% spot-checks) и **авто-эскалируется** на регрессе — это операционализирует Cycle of Trust и питает *human-oversight plan* Loop License стандарта (сэмплинг/SLA/re-escalation).

## 7. Data-model дельта (§8)

- `judge`: + `ece, brier, swap_consistency, self_preference, verbosity, anchored_accuracy, anchor_sample, status`.
- `golden_item` / `annotation`: + `rubric_version, labeler, label_date, agreement(kappa), origin`; сет-уровень — флаг `unanchored`.
- `failure`: + `pipeline_stage`.
- Net-new сущности: `retrieval_case` (retrieval golden), `representativeness_run`, `review_capture`.

## 8. Критерии приёмки (дельта)

- [ ] Judge Card схема (YAML + JSON Schema) в спеке; status-правила; инвариант `status != calibrated → не гейтит` (расширяет FR-JUDGE / FR-IMPROVE-6 eligibility).
- [ ] Staged taxonomy: кластеризация эмитит `pipeline_stage`; per-stage дашборды.
- [ ] Retrieval-контракт + ingestion + категория Recall@k/MRR; retrieval regression gate (harness — AgenticMind).
- [ ] Provenance-схема в golden-модели; `unanchored` завязан на Loop-License-чек.
- [ ] Судья: gold-question exam + gold probes; rubric-change → re-baseline.
- [ ] Representativeness-метрика + refresh-триггер + behavior-drift-монитор.
- [ ] Review-capture схема + стратифицированный пайплайн + reviewer-дашборд.
- [ ] Глоссарий APL пополнен каноническими терминами (без синонимов).

---

*Соответствует Standard v3.1 §Part V; концерны AAL/Evidence — контрол «Calibrated verification» (evidence = текущие Judge Cards). Значения порогов (ECE, k, ratio) — прагматичные стартовые, задаются эмпирически с первого измерительного прогона (threshold philosophy стандарта: нормируется, ЧТО пороги существуют и объявлены, не их значения).*
