# Приёмка исходников этапа 4 — 2026-10-06

Статус: qualified source/fixture acceptance, 2026-10-07. Независимый reviewer
принял реализацию и точное verification evidence без actionable findings.
Workspace Context Budget gate остаётся failed по dirty-source provenance;
это не безусловный all-gates pass.
Сессия начата 2026-10-06; полный regression завершён 2026-10-07 (Europe/Moscow).
Роль: отчёт одной ограниченной реализации в текущей сессии, не статус
установленного приложения. [Контракт](agent-review-stage4-contract-v1.md) ·
[План этапа 3 и переход к этапу 4](agent-review-stage3-plan.md).

## Реализация и границы

`reviewTransportRecovery: once-v1` связан с apply approval, authorization,
persisted queue и replay. Подтверждённый transport 403 допускает одну
дополнительную invocation с новым MCP и тем же замороженным evidence.
Первая попытка не даёт approval и не возвращается в execution budget.

Host-owned immutable transition records ограничивают повтор одним verified
результатом. Marker `retry_started` сохраняется до подготовки MCP, budget и
lineage. Crash после marker считается неоднозначным и не переоткрывает
invocation; до marker можно продолжить сохранённый `retry_reserved`.
GIS продолжает уже учтённый review stage. Whole-change continuation сохраняет
canonical run, verification receipts и handoff без нового executor/gate.
Новый correction cycle допускается только по следующему replayable report с
уникальной invocation/ordinal либо по exact ordinary correction output и
verification. Старый report, подмена счётчика и лишняя pending invocation
не дают нового права или approval по старому closed receipt.

Независимый reviewer `/root/stage4_acceptance_review` при предварительном
просмотре выявил semantic-unavailable + transport failure, окно подготовки
retry и повреждённый final completion output. Эти замечания исправлены и
добавлены соответствующие fixtures. Также закрыты stale/duplicate correction
identity, forged ordinal и replay approval с лишней pending invocation.
Финальный verdict — ACCEPTED с указанным provenance ограничением. Заключение
сохранено в `queues/agent-review-stage4-20261006/independent-source-review.md`.
Первый финальный reviewer turn прервался transport 403 до verdict; read-only
review был возобновлён на тех же frozen runtime bytes и exact completed logs.

Production impact: server/index.ts, server/structured-review.ts,
server/process-stages.ts. Tests: server/index.test.ts,
server/structured-review.test.ts, server/gis-quality.integration.test.ts.
Read-only verification utility: scripts/verify-source-snapshot.mjs.
Utility fixtures: scripts/verify-source-snapshot.test.mjs.
Documentation: этот отчёт, контракт этапа 4, план этапа 3 и docs/NEXT_STEPS.md.
Dependencies, baseline, Project Map, существующие очереди и runtime receipts
не изменялись. Логи этой сессии: queues/agent-review-stage4-20261006/.

## Проверки

Финальные focused Node suites: 23/23, exit 0; Stage 4 production GIS suites:
2/2, exit 0 (пять transport/restart вариантов и отдельная correction fixture).
`npm.cmd run check`, `npm.cmd run build` и context smoke: exit 0; smoke 3/3.
Electron/Node 22 focused suites: 26/26, exit 0, включая existing structured GIS
correction. Полный `npm.cmd test`: exit 0, около 66 минут. Основной runner:
670 tests, 669 pass, 0 fail, 1 штатно skipped live GIS test; оба isolated runner
sections: по 1 pass, 0 fail. Live test не запускался. Только финальные
completed logs являются passing evidence; development attempts не заменяют gates.

Логи относительно корня repository:

- `queues/agent-review-stage4-20261006/focused-runtime-final.log` и
  `queues/agent-review-stage4-20261006/focused-runtime-final-exit.json`:
  точная Node команда, exit 0, 23/23.
- `queues/agent-review-stage4-20261006/gis-runtime-final.log` и
  `queues/agent-review-stage4-20261006/gis-runtime-final-exit.json`:
  точная GIS команда, exit 0, 2/2.
- `queues/agent-review-stage4-20261006/electron-verified.stdout.log`,
  `queues/agent-review-stage4-20261006/electron-verified.stderr.log` и
  `queues/agent-review-stage4-20261006/electron-verified-exit.json`: 26/26,
  exact command, `ELECTRON_RUN_AS_NODE=1`, Node 22.16.0, exit 0.
- `queues/agent-review-stage4-20261006/full-regression.log` и
  `queues/agent-review-stage4-20261006/full-regression-exit.json`: полный
  `npm.cmd test`, Node 24.18.1, timestamps, explicit PYTHON_BIN, exit 0.
- `queues/agent-review-stage4-20261006/check-verified.log`,
  `queues/agent-review-stage4-20261006/build-verified.log`,
  `queues/agent-review-stage4-20261006/context-smoke-verified.log` и
  `queues/agent-review-stage4-20261006/static-gates.json`: команды и exit codes.
- `queues/agent-review-stage4-20261006/source-frozen-hashes.json`: SHA256 всех
  восьми production/test/utility файлов перед итоговыми gates.
  `queues/agent-review-stage4-20261006/source-hashes-final-check.json`
  подтверждает неизменность всех восьми файлов после полного regression.

Context Budget CLI в текущей рабочей копии отвергает dirty measured
`docs/NEXT_STEPS.md` с `CONTEXT_BUDGET_SOURCE_CHANGED`; byte envelopes не
нарушены, прирост navigation остаётся advisory. Этот отказ сохраняется как
workspace gate failure. Отдельная проверка чистого Git snapshot тех же source
bytes будет отражена со своей командой, commit identity и executable inventory
assertion; она не превращает исходный workspace gate в passed.
Точный workspace log:
`queues/agent-review-stage4-20261006/context-budget-workspace-verified.log`;
exit 1 и interpreter:
`queues/agent-review-stage4-20261006/context-budget-workspace-exit.json`.
Во всех context gates PYTHON_BIN явно задан как
`C:/Users/a.lozovoy/AppData/Local/Programs/Python/Python313/python.exe`.

Final snapshot command: `node scripts/verify-source-snapshot.mjs SOURCE_ROOT
SNAPSHOT_ROOT`, затем `npm.cmd run context-budget:report -- --root SNAPSHOT_ROOT`.
Exact resolved roots и commit identity записываются в
`queues/agent-review-stage4-20261006/context-snapshot-location.json`;
final outcomes — в
`queues/agent-review-stage4-20261006/snapshot-equality-verified.log`,
`queues/agent-review-stage4-20261006/context-budget-snapshot-verified.log` и
`queues/agent-review-stage4-20261006/context-snapshot-verified-exit.json`.
Snapshot содержит все tracked и untracked source bytes и не включает ignored
queues. Commit существует только в отдельном временном checkout; основной
worktree и index не коммитились. Snapshot equality: pass; Context Budget:
exit 0, pass-with-warnings (navigation growth advisory и unsupported host-owned
sources), не безусловный envelope pass для неподдерживаемых host sources.
Executable equality assertion связывает все 373 source files, включая новые
untracked docs/scripts, с clean snapshot commit из указанного locator.
Последние doc lifecycle edits включены в повторную final snapshot проверку.

`queues/agent-review-stage4-20261006/diff-check-verified.log` — `git diff --check`;
`queues/agent-review-stage4-20261006/untracked-whitespace-verified.json` —
отдельная проверка всех четырёх новых untracked files;
`queues/agent-review-stage4-20261006/document-links-verified.log` — проверка
local links четырёх изменённых/новых документов. Outcomes: pass.

## История verification attempts

- `queues/agent-review-stage4-20261006/focused-attempt1.log` и
  `queues/agent-review-stage4-20261006/focused-attempt4.log` остановлены во время разработки;
  это незавершённые прогоны, не passing evidence.
- `queues/agent-review-stage4-20261006/focused-attempt2.log` выявил ошибку чтения отсутствующего будущего transition
  файла; исправлен ENOENT handling.
- `queues/agent-review-stage4-20261006/focused-attempt3.log` выявил некорректную budget policy в fixture; используется
  существующий accepted policy envelope с cap одного reviewer.
- `queues/agent-review-stage4-20261006/gis-attempt1.log` остановился на authority/runtime binding: integration test
  (process.argv[1]) был изменён во время прогона.
  `queues/agent-review-stage4-20261006/gis-attempt2.log` остановлен до
  следующей правки production; final GIS gate выполнен полностью заново.
- `queues/agent-review-stage4-20261006/focused-attempt5.log` содержит failed whole-change fixture: запрет whole-task
  retry ещё не был добавлен в фактическую condition. Исправление проверено
  `queues/agent-review-stage4-20261006/whole-change-attempt2.log` (1/1), но этот narrow run не заменяет новый полный
  focused gate.
- `queues/agent-review-stage4-20261006/context-budget.log`: отсутствовало child-process safe.directory environment;
  `queues/agent-review-stage4-20261006/context-budget-final.log`: корректный отказ dirty measured navigation.
- Остальные development logs и ранний snapshot являются historical attempts
  до final source freeze; passing evidence — только перечисленные completed
  final logs. Первый прямой запуск Electron не был waited process gate;
  final Electron evidence получен через hidden Start-Process и WaitForExit.

Deployment, установка, installed smoke, live provider/GIS pilot и operational
acceptance не выполнялись и этой приёмкой не подтверждаются.
