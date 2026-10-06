# Закрытие замечаний приёмки этапа 3 — 2026-10-06

Статус: **этап 3 принят по исходникам**. P1/P2 закрыты, независимый source
review approved, полная машинная регрессия passed (exit 0).
Это текущий отчёт об ограниченном исправлении исходников, а не operational
acceptance установленного приложения.

Навигация: [план этапа 3](agent-review-stage3-plan.md),
[контракт](agent-review-stage3-contract-v1.md),
[историческая исходная приёмка с P1/P2](agent-review-stage3-acceptance-20261006.md).

## Изменения и границы

В `server/index.ts` production recovery теперь получает targets через
`structuredRecoveryReviewTargets`. Source должен иметь `invocation-mcp-v1`
в задаче и в enabled/authorized authorization evidence, статус
`changes_requested`, актуальный closed receipt с той же invocation и
перепроверенный verdict. Все замечания должны иметь host-declared indices.
Targets выводятся из verdict и сравниваются с persisted targets; legacy source
с добавленными targets больше не может передать их structured recovery.
Legacy recovery без нового opt-in сохраняет существующий путь.

В `server/gis-quality.integration.test.ts` добавлена переносимая fixture из пяти
отдельных scopes: one.ts, two.ts, three.ts, four.ts, five.ts. Проверяется
production structured reviewer → changes_requested [3,4] → correction history
→ patch → JSON reload/resume → approved → publication:

- response [0,1,2] побайтно совпадают с архивом до и после публикации;
- response [3,4] получают ожидаемые исправленные summaries;
- сохранившиеся targets [3,4] связаны с реальным closed rejected verdict;
- helper отклоняет legacy source, отсутствующий, чужой и stale receipt,
  а также несовпадающие targets;
- production restart отклоняет подмену correction history targets и
  verdict SHA до дополнительного executor/publication;
- успешное продолжение имеет ровно 2 executor, 2 review и 1 publication;
  fixture coverage и baseline JSON содержат ровно completed=5.

Recovery-source positive/negative helper checks используют source view,
восстановленный из фактического первого rejected review history receipt.
Это не отдельный end-to-end запуск новой recovery queue. Same-run correction,
сериализация, восстановление и публикация проходят production lifecycle.
Native runtime и CLI provider здесь контролируемые fixture doubles; реальный
live GIS pilot ими не доказывается. Это не вводит новых product grouping,
filter, duplicate-record или pagination semantics.

Impact: production `server/index.ts`; tests
`server/gis-quality.integration.test.ts`; этот отчёт и навигация в
`docs/agent-review-stage3-plan.md`, `docs/agent-review-stage3-contract-v1.md`,
`docs/agent-review-stage3-acceptance-20261006.md`.
Новых dependencies, queue/schema contracts и generated product sources нет.
Private verification logs находятся в `queues/agent-review-stage3-fixes-20261006/`.
Project Map и существующие queue/run evidence не изменялись.

## Доказательства

Независимый read-only reviewer `/root/stage3_acceptance_review` повторно
проверил production fix и final fixture, дал **approved** по исходникам и
подтвердил закрытие P1/P2. Сам reviewer не запускал машинные проверки и не
редактировал файлы. Его вывод не заменяет полную регрессию.

- `npm.cmd run check`: passed.
- `npm.cmd run build`: passed, остаётся существующий Vite chunk-size advisory.
- Node 24.18.1:
  `node --import tsx --test --test-name-pattern "structured GIS reviewer correction" server/gis-quality.integration.test.ts`
  — 1/1 passed, 508756.4 ms. Локатор:
  `queues/agent-review-stage3-fixes-20261006/integration-attempt3.log`.
- Electron/Node 22.16.0, `ELECTRON_RUN_AS_NODE=1`, exact executable
  `node_modules/electron/dist/electron.exe`, hidden process with waited exit:
  `--import tsx --test --test-name-pattern "Stage 3|structured review|GIS handoff|review provider|review MCP|structured GIS" server/structured-review.test.ts server/index.test.ts server/gis-quality.integration.test.ts`
  — 13/13 passed, 559095.9 ms. Локаторы:
  `queues/agent-review-stage3-fixes-20261006/electron-focused.stdout.log`,
  `queues/agent-review-stage3-fixes-20261006/electron-focused.stderr.log`.
- Первые два Node 24 attempts сохранены в `integration.log` и
  `integration-attempt2.log` в том же exact каталоге. Это не passing evidence:
  первый выявил ошибку fixture, передававшей post-patch task вместо rejected
  source view, второй — неверное ожидание текста отказа при hash tampering.
  Production проверки не ослаблены; последний тест проверяет точные причины
  отказа и отсутствие нового executor/publication.
- Полная команда `npm.cmd test` на финальных исходниках: exit 0.
  Main: 659 tests, 658 passed, 0 failed, 1 opt-in live test skipped,
  2253526.6 ms. Обе isolated suites прошли 1/1: Phase 4 correlation и
  MergeRequestV1 cross-process target fencing.
  Локатор: `queues/agent-review-stage3-fixes-20261006/full-regression.log`.
  Новый structured GIS fixture прошёл также внутри этого полного прогона.
  Ранее упавший Windows cleanup test здесь прошёл; cleanup implementation
  не изменялся и отдельного утверждения об исправлении его прежнего сбоя нет.
- `git diff --check`: passed. Текущие хеши всех девяти проверяемых production,
  test и script файлов сверены с
  `queues/agent-review-stage3-fixes-20261006/final-source-hashes.json` после
  полной регрессии. Production/test source во время прогонов не менялся.
- Финальный context smoke: passed; `npm.cmd run context-budget:report`:
  outcome pass. Проверены whitespace новых untracked документов и навигационные
  ссылки на этот отчёт; Project Map и measured context sources не изменены.

Deployment, installed read-only smoke, live pilot и operational acceptance
не выполнялись. Они относятся к отдельно авторизованной следующей границе.
Исходная приёмка этапа 3 закрыта. Дальнейшая реализация этапа 4 и deployment
требуют отдельного запроса владельца; этот отчёт сам их не запускает.
