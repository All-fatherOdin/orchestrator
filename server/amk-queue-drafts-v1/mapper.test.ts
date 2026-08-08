import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import symlinkEscapeFixture from "./fixtures/symlink-escape.json";
import validFixture from "./fixtures/valid.json";
import {
  AMK_QUEUE_DRAFT_LIMITS_V1,
  AmkQueueDraftError,
  createAmkQueueDraftSourceFenceV1,
  createAmkQueueDraftTargetDescriptorV1,
  createAmkQueueDraftV1,
  type AmkQueueDraftArtifactV2,
  type AmkQueueDraftMappingInputV1,
  type AmkQueueDraftProjectV1,
  type AmkQueueDraftRequestV1,
  type QueueValidatorV1,
} from "./mapper.ts";

const targetId = `PROJECT-${"a".repeat(64)}`;

function makeInput(targetPath = resolve(".")) {
  const artifact = structuredClone(validFixture.request.artifact) as unknown as AmkQueueDraftArtifactV2;
  const target = createAmkQueueDraftTargetDescriptorV1({
    targetId,
    targetRevision: 7,
    project: {
      ...structuredClone(validFixture.target.project),
      path: targetPath,
    } as AmkQueueDraftProjectV1,
  });
  const source = createAmkQueueDraftSourceFenceV1(artifact);
  const request: AmkQueueDraftRequestV1 = {
    ...structuredClone(validFixture.request),
    contractType: "AmkQueueDraftRequestV1",
    contractVersion: "1.0",
    targetId: target.targetId,
    targetHash: target.targetHash,
    targetWatermark: target.targetWatermark,
    sourceHash: source.sourceHash,
    sourceByteLength: source.sourceByteLength,
    sourceWatermark: source.sourceWatermark,
    artifact,
    mappings: structuredClone(validFixture.request.mappings) as AmkQueueDraftMappingInputV1[],
  };
  return { request, target };
}

function acceptingValidator(onValue?: (value: unknown) => void): QueueValidatorV1 {
  return (value) => {
    onValue?.(value);
    return value;
  };
}

function expectCode(code: string, operation: () => unknown): AmkQueueDraftError {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof AmkQueueDraftError, `expected ${code}`);
  assert.equal(caught.code, code);
  assert.ok(caught.message.length <= AMK_QUEUE_DRAFT_LIMITS_V1.maxErrorMessageCharacters);
  return caught;
}

test("mapping is deterministic, canonical, traceable, and input-immutable", () => {
  const { request, target } = makeInput();
  const beforeRequest = JSON.stringify(request);
  const beforeTarget = JSON.stringify(target);
  let callbackCalls = 0;
  const validateQueue = acceptingValidator((value) => {
    callbackCalls += 1;
    const queue = value as { tasks: unknown[] };
    assert.equal(queue.tasks.length, 2);
  });

  const first = createAmkQueueDraftV1({ request, target, validateQueue });
  const second = createAmkQueueDraftV1({
    request: structuredClone(request),
    target: structuredClone(target),
    validateQueue,
  });

  assert.equal(first.yaml, second.yaml);
  assert.equal(Buffer.compare(Buffer.from(first.yaml), Buffer.from(second.yaml)), 0);
  assert.deepEqual(parse(first.yaml), first.queueDraft);
  assert.equal(callbackCalls, 2);
  assert.equal(JSON.stringify(request), beforeRequest);
  assert.equal(JSON.stringify(target), beforeTarget);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.queueDraft.tasks[0]));

  const [alpha, beta] = first.queueDraft.tasks;
  assert.equal(alpha.key, "task-alpha-one");
  assert.equal(beta.key, "task-beta_two");
  assert.equal(alpha.title, "Implement alpha");
  assert.equal(beta.title, "Implement beta");
  assert.deepEqual(alpha.allowedPaths, ["src/alpha.ts", "tests/alpha.test.ts"]);
  assert.deepEqual(alpha.verificationCommands, ["npm.cmd test -- alpha"]);
  assert.equal(alpha.prompt.includes("Implement the alpha behavior exactly."), true);
  assert.equal(alpha.prompt.includes("Alpha works."), true);
  assert.equal(alpha.prompt.includes("The alpha test passes."), true);
  assert.equal(alpha.prompt.includes(request.sourceWatermark), true);
  assert.equal(alpha.executionGuards[0], "The declared scope is insufficient.");
  assert.deepEqual(alpha.dependsOn, []);
  assert.equal(Object.hasOwn(alpha, "authorization"), false);
  assert.equal(Object.hasOwn(alpha, "preconditions"), false);
  assert.equal(beta.model, "sol");
  assert.equal(beta.effort, "high");
  assert.equal(first.authorizationGranted, false);
  assert.equal(first.wouldMutate, false);
});

test("optional graph and receipts validate as compatibility evidence with zero authority", () => {
  const { request, target } = makeInput();
  request.artifact.WorkItemGraphV1 = [{
    schema_version: "1.0",
    graph_id: "WIG-ALPHA",
    task_id: "TASK-Alpha.One",
    items: [
      { id: "WI-ONE", title: "One", behavior: "One", vertical_scope: ["api"], acceptance_claims: ["One"], verification_recipe: ["npm run graph-must-not-map"], context_fit: "fresh_context", status: "verified", blocked_by: [] },
      { id: "WI-TWO", title: "Two", behavior: "Two", vertical_scope: ["ui"], acceptance_claims: ["Two"], verification_recipe: ["npm run edge-must-not-map"], context_fit: "fresh_context", status: "accepted", blocked_by: ["WI-ONE"] },
    ],
    frontier_assertion: { item_ids: ["WI-TWO"], navigation_only: true },
    owner_review: "accepted",
  }];
  request.artifact.VerificationReceiptV2 = [{
    schema_version: "2.0",
    receipt_id: "VR-ALPHA",
    task_id: "TASK-Alpha.One",
    subject_refs: ["WI-ONE"],
    claim_ids: [],
    verifier_type: "project_test",
    verification_level: "integration",
    environment_ref: null,
    status: "passed",
    evidence_refs: ["npm run receipt-must-not-map"],
    verified_at: "2026-08-07T00:00:00Z",
  }];
  request.artifact.ReviewReceiptV1 = [{
    schema_version: "1.0",
    review_id: "REV-ALPHA",
    task_id: "TASK-Alpha.One",
    profile: "fresh_context",
    result_refs: ["diff:alpha"],
    criteria_refs: ["criteria:alpha"],
    intentional_decision_refs: [],
    author_reasoning_included: false,
    mutation_performed: false,
    repair_authorized: false,
    status: "passed",
    findings: [],
    owner_disposition: "accepted",
  }];
  Object.assign(request, createAmkQueueDraftSourceFenceV1(request.artifact));

  const response = createAmkQueueDraftV1({ request, target, validateQueue: acceptingValidator() });
  assert.deepEqual(response.compatibility, {
    workItemGraphCount: 1,
    verificationReceiptCount: 1,
    reviewReceiptCount: 1,
    schedulerAuthority: false,
    verificationAuthority: false,
    reviewAuthority: false,
    executionAuthority: false,
  });
  assert.equal(response.yaml.includes("WI-ONE"), false);
  assert.equal(response.yaml.includes("receipt-must-not-map"), false);
  assert.deepEqual(response.queueDraft.tasks[1].dependsOn, []);
  assert.deepEqual(response.queueDraft.tasks[0].verificationCommands, ["npm.cmd test -- alpha"]);
});

test("relative path normalization is lexical, exact-scope, and platform-neutral", () => {
  const { request, target } = makeInput();
  request.artifact.TaskContractV3[0].scope.project_files = [
    "src\\alpha.ts",
    "tests/./alpha.test.ts",
    "src/**/*.fixture.ts",
  ];
  request.mappings[0].allowedPaths = [
    "src/./alpha.ts",
    "tests\\alpha.test.ts",
    "src/**/*.fixture.ts",
  ];
  Object.assign(request, createAmkQueueDraftSourceFenceV1(request.artifact));
  const response = createAmkQueueDraftV1({ request, target, validateQueue: acceptingValidator() });
  assert.deepEqual(response.queueDraft.tasks[0].allowedPaths, [
    "src/alpha.ts",
    "tests/alpha.test.ts",
    "src/**/*.fixture.ts",
  ]);
});

test("existing symlink prefixes cannot escape the selected target root", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "amk-queue-drafts-v1-"));
  const targetRoot = join(fixtureRoot, "target");
  const outsideRoot = join(fixtureRoot, "outside");
  mkdirSync(targetRoot);
  mkdirSync(outsideRoot);
  symlinkSync(outsideRoot, join(targetRoot, "linked"),
    process.platform === "win32" ? "junction" : "dir");

  try {
    const { request, target } = makeInput(targetRoot);
    request.artifact.TaskContractV3[0].scope.project_files[0] =
      symlinkEscapeFixture.scopePath;
    request.mappings[0].allowedPaths[0] = symlinkEscapeFixture.allowedPath;
    Object.assign(request, createAmkQueueDraftSourceFenceV1(request.artifact));
    let callbackCalls = 0;

    expectCode("PATH_INVALID", () => createAmkQueueDraftV1({
      request,
      target,
      validateQueue: acceptingValidator(() => { callbackCalls += 1; }),
    }));
    assert.equal(callbackCalls, 0);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("the validator receives an isolated copy and cannot mutate the result or inputs", () => {
  const { request, target } = makeInput();
  const before = JSON.stringify(request);
  const response = createAmkQueueDraftV1({
    request,
    target,
    validateQueue: (value) => {
      const queue = value as { tasks: Array<{ title: string; allowedPaths: string[] }> };
      queue.tasks[0].title = "callback mutation";
      queue.tasks[0].allowedPaths.push("callback/mutation.ts");
      return queue;
    },
  });
  assert.equal(response.queueDraft.tasks[0].title, "Implement alpha");
  assert.equal(response.queueDraft.tasks[0].allowedPaths.includes("callback/mutation.ts"), false);
  assert.equal(JSON.stringify(request), before);
});

test("the complete draft is delegated once through the validateQueue injection seam", () => {
  const { request, target } = makeInput();
  let calls = 0;
  const validateQueue: QueueValidatorV1 = (value) => {
    calls += 1;
    const queue = value as { tasks: Array<Record<string, unknown>> };
    assert.equal(queue.tasks.length >= 2, true);
    assert.equal(queue.tasks.some((task) => Object.hasOwn(task, "authorization")), false);
    return queue;
  };
  const response = createAmkQueueDraftV1({ request, target, validateQueue });
  assert.equal(response.taskCount, 2);
  assert.equal(calls, 1);
});

test("fail-closed errors cover legacy input, counts, mappings, fencing, paths, and collisions", () => {
  {
    const { request, target } = makeInput();
    (request.artifact as Record<string, unknown>).TaskContractV2 = request.artifact.TaskContractV3;
    delete (request.artifact as Record<string, unknown>).TaskContractV3;
    Object.assign(request, createAmkQueueDraftSourceFenceV1(request.artifact));
    expectCode("REQUEST_INVALID", () => createAmkQueueDraftV1({ request, target, validateQueue: acceptingValidator() }));
  }
  {
    const { request, target } = makeInput();
    request.artifact.TaskContractV3.splice(1);
    request.mappings.splice(1);
    Object.assign(request, createAmkQueueDraftSourceFenceV1(request.artifact));
    expectCode("TASK_COUNT_INVALID", () => createAmkQueueDraftV1({ request, target, validateQueue: acceptingValidator() }));
  }
  {
    const { request, target } = makeInput();
    request.mappings[0].operatorTitle = "Must not override exact AMK title";
    expectCode("MAPPING_INVALID", () => createAmkQueueDraftV1({ request, target, validateQueue: acceptingValidator() }));
  }
  for (const unsafePath of ["C:\\outside.ts", "../outside.ts", "/outside.ts", "//server/share.ts"]) {
    const { request, target } = makeInput();
    request.artifact.TaskContractV3[0].scope.project_files[0] = unsafePath;
    request.mappings[0].allowedPaths[0] = unsafePath;
    Object.assign(request, createAmkQueueDraftSourceFenceV1(request.artifact));
    expectCode("PATH_INVALID", () => createAmkQueueDraftV1({ request, target, validateQueue: acceptingValidator() }));
  }
  {
    const { request, target } = makeInput();
    request.mappings[0].allowedPaths = ["src/not-declared.ts"];
    expectCode("PATH_OUTSIDE_SCOPE", () => createAmkQueueDraftV1({ request, target, validateQueue: acceptingValidator() }));
  }
  {
    const { request, target } = makeInput();
    request.artifact.TaskContractV3[1].task_id = "TASK-Alpha-One";
    request.mappings[1].taskId = "TASK-Alpha-One";
    Object.assign(request, createAmkQueueDraftSourceFenceV1(request.artifact));
    expectCode("TASK_KEY_COLLISION", () => createAmkQueueDraftV1({ request, target, validateQueue: acceptingValidator() }));
  }
  {
    const { request, target } = makeInput();
    request.artifact.VerificationReceiptV2 = [{
      schema_version: "2.0",
      receipt_id: "VR-UNKNOWN",
      task_id: "TASK-Unknown",
      subject_refs: ["subject"],
      claim_ids: [],
      verifier_type: "project_test",
      verification_level: "unit",
      environment_ref: null,
      status: "passed",
      evidence_refs: ["evidence"],
      verified_at: "2026-08-07T00:00:00Z",
    }];
    Object.assign(request, createAmkQueueDraftSourceFenceV1(request.artifact));
    expectCode("COMPATIBILITY_INVALID", () => createAmkQueueDraftV1({ request, target, validateQueue: acceptingValidator() }));
  }
  {
    const { request, target } = makeInput();
    request.targetWatermark = `AMK-TARGET-${"d".repeat(64)}-7`;
    expectCode("TARGET_STALE", () => createAmkQueueDraftV1({ request, target, validateQueue: acceptingValidator() }));
  }
  {
    const { request, target } = makeInput();
    request.sourceWatermark = `AMK-UPLOAD-${"d".repeat(64)}-${request.sourceByteLength}`;
    expectCode("SOURCE_STALE", () => createAmkQueueDraftV1({ request, target, validateQueue: acceptingValidator() }));
  }
});

test("aggregate and byte limits fail before queue validation", () => {
  {
    const { request, target } = makeInput();
    const paths = Array.from({ length: 100 }, (_, index) => `src/generated-${index}.ts`);
    request.artifact.TaskContractV3[0].scope.project_files = paths;
    request.mappings[0].allowedPaths = paths;
    Object.assign(request, createAmkQueueDraftSourceFenceV1(request.artifact));
    expectCode("LIMIT_EXCEEDED", () => createAmkQueueDraftV1({ request, target, validateQueue: acceptingValidator() }));
  }
  {
    const { request, target } = makeInput();
    request.mappings[0].verificationCommands = Array.from(
      { length: 100 },
      (_, index) => `npm.cmd test -- command-${index}`,
    );
    expectCode("LIMIT_EXCEEDED", () => createAmkQueueDraftV1({ request, target, validateQueue: acceptingValidator() }));
  }
  {
    const { request, target } = makeInput();
    request.artifact.VerificationReceiptV2 = Array.from({ length: 99 }, (_, index) => ({
      schema_version: "2.0",
      receipt_id: `VR-LIMIT-${index}`,
      task_id: "TASK-Alpha.One",
      subject_refs: ["subject"],
      claim_ids: [],
      verifier_type: "project_test",
      verification_level: "unit",
      environment_ref: null,
      status: "passed",
      evidence_refs: ["evidence"],
      verified_at: "2026-08-07T00:00:00Z",
    }));
    Object.assign(request, createAmkQueueDraftSourceFenceV1(request.artifact));
    expectCode("LIMIT_EXCEEDED", () => createAmkQueueDraftV1({ request, target, validateQueue: acceptingValidator() }));
  }
  {
    const { request, target } = makeInput();
    request.artifact.TaskContractV3[0].goal = "x".repeat(AMK_QUEUE_DRAFT_LIMITS_V1.maxRequestBytes + 1);
    Object.assign(request, createAmkQueueDraftSourceFenceV1(request.artifact));
    expectCode("REQUEST_TOO_LARGE", () => createAmkQueueDraftV1({ request, target, validateQueue: acceptingValidator() }));
  }
});

test("ordinary queue rejection is redacted and never returns partial YAML", () => {
  const { request, target } = makeInput();
  const privateValue = "PRIVATE_QUEUE_VALIDATOR_VALUE";
  const error = expectCode("QUEUE_VALIDATION_FAILED", () => createAmkQueueDraftV1({
    request,
    target,
    validateQueue: () => { throw new Error(privateValue); },
  }));
  assert.equal(error.message.includes(privateValue), false);
  assert.equal(JSON.stringify(error).includes(privateValue), false);
});
