import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { taskFailureGuidance, TaskFailurePanel, PreflightFailurePanel, preflightNextStep, type DiagnosticTask } from "./FailureGuidance.tsx";

const task: DiagnosticTask = { id: "b", key: "b", title: "Вторая задача", status: "blocked", log: [] };
test("blocked dependency identifies the exact predecessor and exposes navigation without execution", () => {
  const predecessor = { ...task, id: "a", key: "a", title: "Первая задача", status: "failed" };
  const blocked = { ...task, dependsOn: ["a"] };
  const result = taskFailureGuidance(blocked, [predecessor, blocked])!;
  assert.deepEqual(result.dependencies?.map(item => item.id), ["a"]);
  assert.deepEqual(result.evidence, ["a: Первая задача (failed)"]);
  const html = renderToStaticMarkup(createElement(TaskFailurePanel, { task: blocked, tasks: [predecessor, blocked], onSelectTask() {}, onShowLog() {} }));
  assert.match(html, /Открыть: Первая задача/);
  assert.match(html, /Показать весь журнал/);
  assert.doesNotMatch(html, /Повторить задачу/);
});
test("successful and running tasks never display old failure evidence", () => {
  for (const status of ["completed", "running", "pending", "cancelled", "skipped"])
    assert.equal(taskFailureGuidance({ ...task, status, authorizationEvidence: { enabled: true, decision: "denied", reason: "OLD" } }, []), undefined);
});
test("authorization denial instructs a fresh approved queue instead of replaying stale authority", () => {
  const guidance = taskFailureGuidance({ ...task, authorizationEvidence: { enabled: true, decision: "denied", reason: "APPROVAL_MISSING" } }, [])!;
  assert.deepEqual(guidance.evidence, ["APPROVAL_MISSING"]);
  assert.match(guidance.next, /повтор использует старые разрешения/);
});
test("verification diagnostics preserve exact failed commands, zero success and timeout semantics", () => {
  const guidance = taskFailureGuidance({ ...task, status: "failed", verificationEvidence: [
    { command: "success", exitCode: 0, timedOut: false, output: "ok" },
    { command: "check", exitCode: 2, timedOut: false, output: "expected 4, got 3" },
    { command: "slow", exitCode: 0, timedOut: true, output: "deadline" },
  ] }, [])!;
  assert.equal(guidance.evidence.length, 2);
  assert.equal(guidance.evidence[0], "check\nКод завершения: 2\nexpected 4, got 3");
  assert.match(guidance.evidence[1], /время проверки истекло/);
});
test("known legacy runner diagnostics and unknown failures remain evidence-bound", () => {
  assert.match(taskFailureGuidance({ ...task, log: ["Stored authorization is stale or mismatched; a fresh contract is required."] }, [])!.reason, /устарело/);
  const unknown = taskFailureGuidance({ ...task, log: ["agent suggests retry"] }, [])!;
  assert.match(unknown.next, /не определён/);
  assert.deepEqual(unknown.evidence, ["Статус: blocked", "agent suggests retry"]);
  assert.match(taskFailureGuidance({ ...task, status: "timed_out" }, [])!.next, /обычный повтор сохраняет прежний лимит/);
});
test("preflight explanations retain exact evidence and handle unrecognized checks conservatively", () => {
  assert.match(preflightNextStep("Pipeline queue 2 Task 1 authorization"), /разрешения/);
  assert.match(preflightNextStep("Command runtime: Node.js"), /инструмент/);
  const html = renderToStaticMarkup(createElement(PreflightFailurePanel, { checks: [{ name: "Custom check", ok: false, detail: "exact <error>" }] }));
  assert.match(html, /Очередь не запущена/);
  assert.match(html, /exact &lt;error&gt;/);
  assert.match(html, /Если причина неясна/);
});
