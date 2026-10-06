# Приёмка исходников этапа 3 — 2026-10-06

Статус: историческая исходная приёмка **changes_requested** до исправления P1/P2.
[Текущие исправления и результаты проверок](agent-review-stage3-fixes-20261006.md).
Это результат проверки исходников, а не статус установленного приложения или очереди.
Навигация: [план этапа 3](agent-review-stage3-plan.md),
[контракт реализации](agent-review-stage3-contract-v1.md).

Проверены реализация `c43fa02` и HEAD
`5a019f40e7de1c2f87761dc6f1d11193016111ed`, включающий отдельное исправление
Context Budget. Формат работы: ограниченная приёмка в текущей сессии, без
управляемой очереди. Независимую семантическую проверку провёл отдельный
read-only reviewer `/root/stage3_acceptance_review` после явного разрешения
владельца. Reviewer не менял файлы и не запускал тесты; проверки ниже выполнял
ведущий агент. Production-код и тесты в рамках этой приёмки не изменялись.

## Замечания, блокирующие приёмку

### P1 — targets recovery не требуют structured verdict источника

В `server/index.ts:10025` structured recovery вызывает
`assertTaskReviewArtifacts(source, sourceTask)` и затем проверяет только
непустой `sourceTask.reviewTargets`. Но `server/index.ts:9678` намеренно
пропускает structured-проверки у legacy-источника, если отсутствуют
`reviewProtocol` и `structuredReviews`. Его сохранённые `reviewTargets`
авторизацией не связаны.

Следствие: legacy source со статусами failed / changes_requested, фазой
verified и подходящими scope/input/artifact receipts может передать добавленные
persisted targets в structured patch без sealed verdict, подтверждающего эти
indices. Это source-level finding; отдельный полный runtime exploit в этой
приёмке не запускался. Хеш source run фиксирует изменённую запись, но не
доказывает происхождение targets из structured reviewer.

Условие закрытия: source должен иметь тот же авторизованный review protocol,
последний current closed receipt с `changes_requested`; targets должны
выводиться из replayed verdict и точно совпадать с сохранёнными targets.
Fixture должна отклонять legacy source с добавленными targets и отсутствующий,
чужой или stale receipt до запуска patch executor. Legacy recovery без нового
opt-in должен сохранить своё прежнее поведение.

### P2 — отсутствует интеграционное доказательство structured GIS correction/restart

Тест `structured GIS targets [3,4] preserve three sibling response objects
exactly` в `server/structured-review.test.ts` проверяет pure helpers. Новый
`Stage 3 actual reviewer process seals verdict, fences terminal failure and
replay` в `server/index.test.ts` проверяет approved reviewer и терминальные
отказы, но не structured `changes_requested` в production GIS lifecycle.
Существующие GIS correction integration fixtures используют legacy reviewer.

Условие закрытия: переносимая integration fixture должна пройти structured
verdict → correction history → patch → сериализацию и восстановление run,
подтвердить exact targets [3,4], byte-for-byte сохранение response [0,1,2],
и отказ до нового executor при подмене targets или receipt. В частности, нужна
проверка production replay mapping в `server/index.ts:10073`. Это пробел
доказательств, а не отдельно воспроизведённый второй runtime defect.

## Проверенные свойства и ограничения доказательств

Независимый reviewer подтвердил согласованность закрытой verdict schema,
terminal-success/current-invocation bindings, immutable snapshot, отдельного
reviewer MCP, идемпотентного submission и closed replay в изученных участках.
Legacy transport сохраняется по opt-in. Эти выводы не закрывают замечания выше.

- Свежий focused run: 13/13 passed — 12 проверок этапа 3 и повтор ранее
  упавшего Windows cleanup test. Команда:
  `node --import tsx --test --test-name-pattern "Stage 3|structured review|GIS handoff|review provider|review MCP|structured GIS|WorkspaceAttemptV1 Windows production cleanup retains dirty/contended artifacts and rejects junction escapes" server/structured-review.test.ts server/index.test.ts`.
  Локатор: `queues/agent-review-stage3-acceptance-20261006/focused-and-cleanup.log`.
- `npm.cmd run check`: passed. `git diff --check`: passed.
- `npm.cmd run context-budget:report` на чистом HEAD: outcome `pass`; только
  ожидаемый unsupported host-source reason. Использован
  `PYTHON_BIN=C:/Users/a.lozovoy/AppData/Local/Programs/Python/Python313/python.exe`.
- Все 8 exact source SHA-256 совпали с
  `queues/agent-review-stage3-20261006/final-source-hashes.json`.
  Это проверка идентичности источников, а не доказательство их корректности.
- Сохранённый Node 22.16.0/Electron focused run: 12/12 passed;
  `queues/agent-review-stage3-20261006/electron-final.stdout.log` и
  `queues/agent-review-stage3-20261006/electron-final.stderr.log`.
  Повторно в этой приёмке не запускался; текущие исходники совпадают с
  зафиксированными SHA-256 той реализации.
- Receipt реального synthetic CLI из
  `queues/agent-review-stage3-20261006/cli-d686e75dc97882e7/evidence.json`
  заново проверен через `replayStructuredReview`; verdict approved.
  SHA-256 текущего exact CLI binary совпал с provider hash этого evidence.
  Новый provider invocation не запускался. Это доказательство synthetic
  transport/closed replay, не семантической приёмки исходников.

Последний завершённый full `npm.cmd test`:
`queues/context-budget-repair-20261006/full-regression.log` — main 658 tests,
656 passed / 1 failed / 1 live opt-in skipped; обе isolated suites passed 1/1.
Context Budget и Stage 3 tests passed. Единственное падение —
`WorkspaceAttemptV1 Windows production cleanup retains dirty/contended
artifacts and rejects junction escapes`, `WorkspaceLifecycleErrorV1`, code
identity, workspace not a Git repository при `server/index.test.ts:16212`.
Свежий narrow rerun этого теста прошёл, но не заменяет failed full gate.

Новый full run
`queues/agent-review-stage3-acceptance-20261006/full-regression.log` запущен
на том же коде и намеренно остановлен после blocking source verdict reviewer.
Его exit 1 означает остановленный, незавершённый прогон; это не новый failed
assertion и не passing regression evidence. Failed full gate выше не закрыт.

Deployment, installed smoke, live pilot, operational acceptance и этап 4
не выполнялись. Для перехода к этапу 4 необходимы закрытие P1/P2,
свежая полная регрессия и повторная независимая приёмка изменённых исходников.
Локальные журналы под `queues/` игнорируются Git и могут отсутствовать в
чистом checkout; их содержимое не выдаётся за переносимые fixtures.
