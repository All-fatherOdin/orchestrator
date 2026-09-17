import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CoordinationReport } from "./CoordinationReport";
import { coordinationReport } from "../server/coordination-economics";

test("coordination view filters exact task IDs and retains missing data labels", () => {
  const report = coordinationReport({ id: "run", tasks: [
    { id: "first", status: "completed", usage: [{ phase: "executor", attempt: 1, recordedAt: "2026-09-17T10:00:00Z", inputTokens: 123, outputTokens: 0 }] },
    { id: " first ", status: "failed", usage: [{ phase: "executor", attempt: 1, recordedAt: "2026-09-17T10:00:00Z", inputTokens: 999, outputTokens: 0 }] },
  ] });
  const markup = renderToStaticMarkup(<CoordinationReport report={report} taskId="first" />);
  assert.match(markup, /123 · частично/);
  assert.doesNotMatch(markup, /999|статус: failed/);
  assert.match(markup, /Нет данных/);
  assert.match(markup, /0 · частично/);
  assert.match(markup, /Ревьюер/);
  assert.match(markup, /Исправления/);
});
