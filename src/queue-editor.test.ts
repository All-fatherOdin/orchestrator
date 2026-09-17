import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "yaml";
import { inspectQueue, patchQueueFields, editQueueTaskOrder } from "./queue-editor.ts";

const source = `# Owner's queue\nproject:\n  path: C:/project\n  approvedApplyContracts: [{approvalId: keep}]\ncustomRoot: {keep: true}\ntasks:\n  # First task comment\n  - key: first\n    title: First\n    prompt: Inspect\n    allowedPaths: []\n    authorization: {enabled: true, intent: review}\n    customTask: keep\n  # Second task comment\n  - key: second\n    title: Second\n    prompt: Report\n    dependsOn: [first]\n    allowedPaths: []\n`;
test("field edits retain comments, authorization, unknown data and the sibling task", () => {
  const original = parse(source);
  const edited = patchQueueFields(source, ["tasks", 0], { title: "New title", prompt: "Line one\nLine two\n" });
  assert.match(edited, /# Owner's queue/);
  assert.match(edited, /# First task comment/);
  assert.match(edited, /# Second task comment/);
  const value = parse(edited);
  assert.deepEqual(value.tasks[0], { ...original.tasks[0], title: "New title", prompt: "Line one\nLine two\n" });
  assert.deepEqual(value.tasks[1], original.tasks[1]);
  assert.deepEqual(value.project, original.project);
  assert.deepEqual(value.customRoot, original.customRoot);
  const project = parse(patchQueueFields(edited, ["project"], { path: "C:/next" }));
  assert.deepEqual(project.project.approvedApplyContracts, original.project.approvedApplyContracts);
});
test("task moves retain nodes and comments while deletion does not silently rewrite dependencies", () => {
  const moved = editQueueTaskOrder(source, [1, 0]);
  assert.match(moved, /# First task comment/); assert.match(moved, /# Second task comment/);
  assert.deepEqual(parse(moved).tasks.map((task: {key:string}) => task.key), ["second", "first"]);
  const removed = editQueueTaskOrder(source, [1]);
  assert.deepEqual(parse(removed).tasks[0].dependsOn, ["first"]);
  assert.ok(inspectQueue(removed).issues.some(issue => issue.message.includes("не найдена")));
});
test("missing values are distinct from empty read-only scope and zero retry budget", () => {
  const result = inspectQueue(source);
  assert.equal(result.editable, true);
  assert.equal(result.issues.some(issue => issue.path.endsWith("allowedPaths")), false);
  const zero = patchQueueFields(source, ["tasks", 0], { maxRetries: 0 });
  assert.equal(parse(zero).tasks[0].maxRetries, 0);
  assert.equal(inspectQueue(zero).issues.some(issue => issue.path.endsWith("maxRetries")), false);
  const absent = patchQueueFields(zero, ["tasks", 0], { allowedPaths: undefined });
  assert.ok(inspectQueue(absent).issues.some(issue => issue.path === "tasks[0].allowedPaths" && issue.level === "hint"));
  const invalid = patchQueueFields(source, ["tasks", 0], { title: null, maxRetries: null });
  assert.equal(inspectQueue(invalid).editable, false);
});
test("all missing fields and exact unknown, duplicate, self and cyclic dependencies are explained", () => {
  const value = parse(source);
  value.tasks[0].title = ""; value.tasks[0].prompt = "";
  value.tasks[0].dependsOn = ["second", "first", " second", "missing", "missing"];
  const first = patchQueueFields(source, ["tasks", 0], value.tasks[0]);
  const result = inspectQueue(first);
  assert.ok(result.issues.some(issue => issue.path === "tasks[0].title"));
  assert.ok(result.issues.some(issue => issue.path === "tasks[0].prompt"));
  for (const word of ["повторяющиеся", "самой себя", "« second»", "«missing»", "Цикл зависимостей"])
    assert.ok(result.issues.some(issue => issue.message.includes(word)), word);
  const duplicate = patchQueueFields(source, ["tasks", 1], { key: "first" });
  assert.equal(inspectQueue(duplicate).issues.filter(issue => issue.message.includes("повторяется в задачах")).length, 2);
});
test("invalid YAML/types and alias edits cannot erase the supplied source", () => {
  for (const input of ["[invalid", "42", "tasks: {}", "tasks: [null]", "project: {path: C:/x}\ntasks: [{title: X, prompt: X, dependsOn: nope}]"])
    assert.equal(inspectQueue(input).editable, false, input);
  assert.match(inspectQueue("tasks: [").issues[0].message, /Строка 1/);
  assert.throws(() => patchQueueFields("[invalid", ["project"], { path: "new" }));
  assert.throws(() => patchQueueFields("template: &task {title: X}\ntasks: [*task]", ["tasks", 0], { title: "new" }), /ссылку YAML/);
  assert.equal(inspectQueue("queues: [{file: queues/one.yaml}]").pipeline, true);
});
