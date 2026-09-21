import assert from "node:assert/strict";
import test from "node:test";
import { commandEventDiagnostic } from "./command-event.ts";

test("command diagnostics distinguish running/null from a terminal receipt", () => {
  const item = { type: "command_execution", id: "detector-1", command: "node detector.mjs", exit_code: null };
  const running = commandEventDiagnostic({ type: "item.started", item: { ...item, status: "in_progress" } });
  assert.match(running!, /\[detector-1\].*running; no terminal receipt/);
  assert.doesNotMatch(running!, /exit null|exit 0|timed.out/i);
  assert.match(commandEventDiagnostic({ type: "item.completed", item })!, /terminal; exit code unavailable/);
  assert.match(commandEventDiagnostic({ type: "item.completed", item: { ...item, exit_code: 0 } })!, /terminal; exit 0/);
});

test("command diagnostics preserve the CLI timeout output and nonzero exit without inventing a timeout", () => {
  const item = { type: "command_execution", status: "failed", command: "node detector.mjs", exit_code: 124,
    aggregated_output: "command timed out after 30000 milliseconds" };
  assert.match(commandEventDiagnostic({ type: "item.completed", item })!, /terminal; exit 124\)\nOUTPUT: command timed out after 30000 milliseconds/);
  const otherFailure = commandEventDiagnostic({ type: "item.completed", item: { ...item, aggregated_output: "invalid input" } });
  assert.doesNotMatch(otherFailure!, /timed out/);
});

test("long command diagnostics retain both ends of output within the persisted log budget", () => {
  const line = commandEventDiagnostic({ type: "item.completed", item: { type: "command_execution",
    id: "i".repeat(1000), command: "c".repeat(4000), exit_code: 1,
    aggregated_output: "FIRST_DIAGNOSTIC" + "x".repeat(10000) + "LAST_DIAGNOSTIC" } })!;
  assert.ok(line.length <= 1600);
  assert.match(line, /FIRST_DIAGNOSTIC/);
  assert.match(line, /LAST_DIAGNOSTIC/);
  assert.equal(commandEventDiagnostic({ item: { type: "agent_message" } }), undefined);
});
