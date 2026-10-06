# План: этап 3 структурированного независимого review

Статус: исходный план от 2026-10-06; реализация добавлена в исходники.
Приёмка не закрыта: существующий Context Budget gate не проходит.

[Промпт исполнителя](agent-review-stage3-executor-prompt.md) · [Контракт этапа 2](agent-report-tools-v1.md)

[Контракт реализации этапа 3 и результаты проверок](agent-review-stage3-contract-v1.md).

Формат: план одного ограниченного этапа в сессии Codex. Документ хранится в docs/ и версионируется. Это документы
подготовки, а не управляемая YAML-очередь и не разрешение менять текущий run.

## Когда начинать

Реализация, сборка, установка и перезапуск — после завершения либо
контролируемой остановки текущего run muwmmp32-zsowq. Перед началом заново
проверить фактический статус через установленное приложение и canonical
run.json. Не использовать устаревший статус из этого документа.

## Подтверждённые проблемы

1. Executor передаёт отчёт через invocation-local MCP, но reviewer всё ещё
   возвращает текстовый VERDICT. Исправления GIS зависят от распознавания
   названий response-N.json в свободном тексте замечаний.
2. Закрытый whole-change handoff содержит native evidence, но не передаёт
   reviewer полный компактный набор host MCP/terminal receipts и точных
   локаторов. Чтение полного run.json приводит к усечённому контексту.
3. Reviewer смешивал успешность native-команд, завершённость writer, прирост
   coverage и текущий pending самой финальной приёмки.
4. Неполный компактный handoff сам стал причиной корректного STOPPED:
   отсутствовали точные response-пути, второй finalizer и нужные поля проверок.
5. Reviewer действительно завершался с кодом 1 при HTTP 403. Это отдельный
   transport failure; его нельзя превращать в содержательный отказ или approval.

## Этап 3: структурированный независимый review

Результат: reviewer читает ограниченный host-owned handoff, возвращает
валидированный структурированный verdict и точные замечания. Host проверяет
идентичность, terminal success, неизменность evidence и допустимость targets.
Ни текстовый ответ, ни факт tool submission сами по себе не дают approval.

## Порядок внутри одного этапа

1. Зафиксировать контракт, совместимость, полный impact map и acceptance fixtures.
2. Сформировать полный immutable handoff с точными локаторами и хешами.
3. Добавить opt-in structured review и invocation-local read/submit интерфейс.
4. Передавать проверенные targets в GIS patch без извлечения индексов из прозы.
5. Проверить отказные сценарии, legacy-путь и same-run continuation.
6. Выполнить независимую приёмку исходников; deployment — отдельная граница.

## Обязательные различия в handoff

- Task review: текущий writer может быть running/verified/review pending;
  публикация ещё запрещена. Это не отсутствие успешного executor receipt.
- Whole-change review: предшественники уже completed/approved/published;
  текущая финальная приёмка остаётся pending до собственного verdict.
- Retained-source audit: статусы исходного run и выбранного writer различаются.
  Failed финальная приёмка не меняет approved опубликованного writer и не
  превращается в успешный run при последующем аудите.
- Native status success не означает completedCoverageCells > 0.
  Calibration/omitted/limitations сохраняются честно; coverage определяется
  отдельными детерминированными утверждениями, читающими все нужные артефакты.

## Приёмка этапа 3

- Корректный approval + terminal success + неизменный полный handoff принимается.
- Nonzero exit, timeout/cancel, turn.failed, неподдерживаемая ошибка, отсутствие
  submission/terminal, повреждённые receipts или stale evidence не дают approval.
- Reconnect-диагностика допускается только по действующему конечному контракту;
  HTTP 403 с terminal failure остаётся unavailable.
- CHANGES_REQUESTED содержит только существующие evidence IDs и допустимые
  response indices; siblings не переписываются.
- Нехватка handoff выявляется до dispatch; reviewer не должен искать пути.
- Restart не переоткрывает invocation и не пополняет budgets.
- Сохраняются legacy review, Stage 1/2 full/patch и WholeChangeAcceptanceV1.

## Доказательства для будущего исполнителя

- queues/quality-continuation-20260929/terminal-main-20261006-location.json
  указывает canonical текущей очереди; статус перечитать перед реализацией.
- queues/gis-terminal-pilot-20261006/pilot-location.json
  указывает run muwkyj7i-jnl0g: writer published/approved, финальная приёмка failed.
- queues/gis-terminal-closed-acceptance-20261006/evidence.json
  — исторически неполный handoff; не использовать как успешную приёмку.
- queues/quality-continuation-20260929/terminal-closed-acceptance-20261006-location.json
  — audit muwlqesb-e4frh: transport accepted, native audit STOPPED из-за локаторов.
- queues/gis-terminal-proof-complete-20261006/evidence.json
  и queues/gis-terminal-proof-complete-20261006/gate.mjs — полный закрытый handoff.
- queues/quality-continuation-20260929/terminal-proof-complete-20261006-location.json
  — audit muwm6og1-xykpw, обе задачи completed/approved на момент подготовки.

## Этап 4 — после отдельной приёмки этапа 3

Ограниченное восстановление reviewer при transport failure: использовать
сохранённый verified результат, сохранять идентичность и бюджеты, запрещать
бесконечные retries и обход независимого review. Отдельно проверить deployment,
read-only installed smoke, live pilot и итоговую operational acceptance.
Не добавлять автоматическое восстановление, глобальные provider-настройки,
новые GIS-профили или исправление coverage в этап 3.

Локальные указатели в queues/ относятся к частным данным этой сессии и могут
отсутствовать в чистом checkout. Они не заменяют переносимые fixtures и новый
контракт: перед реализацией нужно получить именно названные источники либо
сообщить об их отсутствии, не подставляя вымышленные доказательства.
