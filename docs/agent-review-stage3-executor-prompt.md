# Промпт исполнителя: этап 3 структурированного review

Статус: подготовленный промпт; выполнение зависит от статуса текущей очереди.

Рабочий репозиторий: C:\Alex\Self\projects\orchestrator.

Задача: выполнить этап 3 — структурированный независимый review и полный
ограниченный handoff доказательств. Сначала прочитай
docs/agent-review-stage3-plan.md и AGENTS.md.
Работай одним ограниченным этапом в этой сессии; не создавай искусственную
YAML-очередь для разработки. Не запускай реализацию, пока текущая очередь
работает: проверь installed API и canonical run из
queues/quality-continuation-20260929/terminal-main-20261006-location.json.
Если run активен, выполни только read-only уточнение контракта и сообщи статус.
Не останавливай очередь, не меняй её YAML или сохранённые run/task записи.

## Grounding и текущая реализация

Прочитай docs/NEXT_STEPS.md, docs/source_of_truth_hierarchy.md,
docs/context_packs/current_status.md, docs/agent-report-tools-v1.md,
docs/process-stages.md. Затем изучи только релевантные участки:
server/index.ts: reviewTask, buildReviewerPrompt, prepareWholeChangeAcceptanceEvidence,
finishAgentReport, executeProcessTaskLifecycle, resumeRun;
server/agent-report.ts, server/agent-report-tools.ts,
server/process-stages.ts, server/gis-quality.ts,
server/review-artifacts.ts и соответствующие тесты.
Используй точные исторические evidence-файлы из plan.txt; не читай целые
мегабайтные run.json в контекст — выбирай нужные типизированные поля.

## Перед первой правкой

Зафиксируй контракт и полный impact map: production, tests, generated files,
manifests/schemas, checksums, documentation, acceptance evidence.
Конкретно перечисли изменяемые файлы и проверочные команды. Установи точный
opt-in flag и его binding в существующей авторизации/replay; не полагайся на
прозу для enforcement. Старые записи без нового opt-in сохраняют поведение;
не синтезируй новые receipts или новые поля для исторических records.
Не расширяй изменения на UI, другие GIS-профили, runtime evidence или recovery
автоматику. Если необходим иной существенный scope, остановись с доказательством
и конкретным предложением; не ослабляй проверки.

## Контракт structured review

1. Независимый reviewer возвращает закрытый machine-readable verdict:
   approved / changes_requested / unavailable. Точная схема должна быть
   зафиксирована до реализации. reason и remarks не создают новой authority.
   Каждый remark содержит существующий evidence ID, точное поле/ссылку,
   категорию проблемы и, для GIS patch, допустимый responseIndex.
2. Host проверяет полную структуру, отсутствие duplicate JSON keys, конечные
   размеры/число remarks, уникальность targets и принадлежность evidence.
   Невалидный ответ не превращается в approval или invented changes_requested.
3. Approval требует successful current CLI termination, валидного verdict,
   связанного с текущим review invocation, и неизменного evidence snapshot.
   Submission не компенсирует nonzero/timeout/cancel/turn.failed/missing terminal.
   Сохрани текущий конечный контракт распознавания reconnect diagnostics;
   не принимай произвольные ошибки как предупреждения.
4. Reviewer имеет только ограниченное чтение host-declared evidence и submission
   verdict в invocation-owned служебное хранилище. Нет executor submit_report,
   native validation/finalization, shell/discovery, project writes или публикации.
   Не переиспользуй executor tool service так, чтобы reviewer получил его authority.
5. Invocation IDs/фаза/ordinal, snapshot hash, verdict/terminal/closed-state hashes
   сохраняются и проверяются при replay. Повтор одинакового submission идемпотентен;
   конфликт отклоняется. Закрытые invocation не переоткрываются при restart.
6. Read/call/byte/time/verdict budgets конечны и не пополняются. Отсутствующий,
   изменённый или чрезмерный evidence выявляется до выдачи reviewer authority.

## Полный handoff

Host формирует snapshot из канонических записей и запечатанных артефактов,
а не из заявлений executor. Все mandatory файлы имеют точные locators,
размеры и SHA-256; до dispatch проверить наличие, формат и bindings.
Включи все требуемые response/bundle/baseline/validation файлы, оба native
finalizer, их checks и verification level, native process receipts, host
verification/publication receipts, executor full/patch submitted receipts,
closed tool states и terminal evidence. Native receipt.json и host MCP receipts
— разные артефакты; их расположение должно быть явно задано.
Закрой передачу WholeChangeAcceptanceV1, сохранив его writer coverage,
ordered predecessors, tracked/untracked evidence и независимость review.
Различай task review, final whole-change review и retained-source audit по
правилам plan.txt. Pending самой проверки — ожидаемое состояние, а не дефект.
Успешный native запуск с zero completed coverage и честными limitations
не должен автоматически считаться failed, но coverage completion не заявлять.
Точные aggregate/cross-artifact claims подтверждай отдельным executable assertion,
читающим все перечисленные артефакты; producer success и хеш сами не доказывают totals.

## GIS correction

Передавай валидированные targets структурированно до подготовки patch.
Не извлекай их regex из свободного текста VERDICT и не угадывай по basename.
Некорректные/несуществующие/повторные targets отклоняй до эффекта.
Untargeted responses сохраняй byte-for-byte с доказательством хешей.
Не повторяй полный анализ после transport failure reviewer, не сбрасывай
existing correction/review budgets и не создавай автоматическую recovery chain.

## Обязательные acceptance fixtures

- Valid approval: current invocation, terminal exit 0, complete immutable evidence.
- Submitted verdict + CLI nonzero/timeout/cancel/failed/missing terminal: no approval.
- Generic error и repeated/regressing reconnect: отказ; конечная допустимая
  reconnect sequence + один terminal completion принимается по текущему контракту.
- Missing response/second finalizer/verification-level locator: pre-dispatch failure.
- Stale/changed evidence, чужой invocation, повреждённые receipts: no effects.
- Source run failed, writer completed/approved/published: сохранить оба статуса.
- Final acceptance pending при approved closed predecessors: не ложный отказ.
- Calibration selected=5/completed=0/returned=5, dispositions limitation:
  native success отдельно от coverage; никаких заявлений о completed cells.
- Targeted changes_requested для responses 3 и 4 из пяти: меняются ровно 3/4,
  ответы 0/1/2 побайтно прежние; malformed/duplicate/outside targets запрещены.
- Lost acknowledgement/concurrent identical submission/restart: один verdict,
  без повторного анализа, переоткрытия invocation или пополнения budgets.
- Legacy review и Stage 1/2 full/patch/restart остаются совместимыми.
Grouping/filter/pagination семантику не выдумывать: для handoff это не бизнес-
агрегация. Если вводишь totals по evidence, заранее определи exact inputs/outputs,
duplicates, missing versus zero и полный набор читаемых файлов по AGENTS.md.

## Проверки и доставка

Запусти релевантные существующие и новые тесты, npm run check и git diff --check.
В базовую регрессию включи server/agent-report.test.ts,
server/agent-report-tools.test.ts, server/gis-quality.test.ts,
server/gis-quality.integration.test.ts, server/review-artifacts.test.ts,
server/whole-change-evidence.test.ts и релевантные index tests.
Во время тестов не меняй source: loaded-implementation fence правильно
отклоняет такие прогоны. Проверь нужный Node 22/Electron Windows сценарий.
Не заменяй authoritative failed check более узкой проверкой.
Результат должен включать контракт, impact map, реализацию, тесты и независимую
приёмку с точными evidence locators и перечнем ограничений.
Никакие текущие queues/run данные, Project Map или сторонние изменения не
стейджить и не менять. Commit/push и deployment выполнять только в явно
авторизованной части последующей сессии. После отдельно разрешённой установки:
restart, canonical read-only installed smoke и отдельный live pilot обязательны;
mock/CLI tests не подменяют их. Не запускать большую очередь для приёмки этапа.
