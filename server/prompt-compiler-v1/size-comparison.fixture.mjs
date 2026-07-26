/**
 * The two prior designs grew instead of shrinking the equivalent legacy text.
 * Keep the measurements visible so a later regression cannot redefine success.
 */
export const recordedFailedMeasurements = Object.freeze([
  Object.freeze({ compiledBytes: 1_370, legacyBytes: 1_115 }),
  Object.freeze({ compiledBytes: 1_474, legacyBytes: 1_137 }),
]);

const projectVerificationCommands = Object.freeze([
  "node .\\node_modules\\typescript\\bin\\tsc -b --pretty false",
  "node .\\node_modules\\tsx\\dist\\cli.mjs --test server\\index.test.ts electron\\lifecycle.test.cjs",
]);
const taskVerificationCommands = Object.freeze([
  "git diff --check",
  "node --test server\\prompt-compiler-v1\\prompt-compiler-v1.test.mjs",
]);
const mergedVerificationCommands = Object.freeze([
  ...projectVerificationCommands,
  ...taskVerificationCommands,
]);

/**
 * ProjectSettings-shaped input to production buildPrompt(task, project).
 * Splitting the commands across project and task proves the production merge.
 */
export const productionProjectFixture = Object.freeze({
  verificationCommands: projectVerificationCommands,
});

/**
 * Task-shaped input to production buildPrompt(task, project). The prompt owns
 * task-specific goal/success/output semantics; buildPrompt owns its standard
 * completion-report requirement, so that requirement is deliberately absent
 * here and cannot inflate the legacy baseline through duplication.
 */
export const productionTaskFixture = Object.freeze({
  title: "Compact Prompt Compiler representation",
  prompt: [
    "Goal: Redesign only the isolated Compact Prompt Compiler representation test-first.",
    "Success criteria:",
    "- The compact representation is deterministic and self-contained.",
    "- Every protected invariant is present exactly once with unchanged normative strength.",
    "- The compact UTF-8 output is at least 20 percent smaller than the equivalent legacy output.",
    "Output requirements:",
    "- Report the compact and legacy UTF-8 byte counts and ratio.",
  ].join("\n"),
  allowedPaths: Object.freeze(["server/prompt-compiler-v1"]),
  verificationCommands: taskVerificationCommands,
  executionGuards: Object.freeze([
    "Compact output is not at least 20 percent smaller than equivalent legacy output.",
    "A protected invariant is missing, duplicated, weakened, ambiguous, or externally defined.",
    "Legacy and compact renderers receive different semantic inputs.",
    "Proof requires production integration or files outside allowed paths.",
  ]),
  context: Object.freeze({
    provider: "repository-helper",
    fallbackReason: "bounded local fallback",
    bundle: Object.freeze({
      contract_type: "ContextBundleV1",
      contract_version: "1.0",
      bundle_id: "fixture-bundle",
      request_id: "fixture-request",
      profile: "prompt-compiler",
      policy_refs: Object.freeze({
        context_index: "docs/project_map/context_index.yaml",
        retrieval_policy: "docs/project_map/retrieval_policy.yaml",
        retrieval_scoring_policy: "docs/project_map/retrieval_scoring_policy.yaml",
      }),
      sources: Object.freeze([
        Object.freeze({
          path: "AGENTS.md",
          priority: "required",
          authority: "repository",
          status: "selected",
          layer: "governance",
          retrieval_mode: "required",
          inclusion_reason: "Defines repository execution constraints.",
        }),
        Object.freeze({
          path: "server/index.ts",
          priority: "required",
          authority: "production",
          status: "selected",
          layer: "implementation",
          retrieval_mode: "required",
          inclusion_reason: "Defines the current buildPrompt contract.",
        }),
      ]),
      selection: Object.freeze({
        max_sources: 2,
        selected_source_count: 2,
        omitted_source_count: 0,
        missing_required_paths: Object.freeze([]),
        skipped_trigger_only_context: Object.freeze([]),
        skipped_high_risk_context: Object.freeze([]),
        truncated: false,
      }),
      scope_expansion: Object.freeze({
        runtime: false,
        external_system: false,
        data: false,
        project_map_mutated: false,
      }),
    }),
    receipt: Object.freeze({
      contract_type: "ContextReceiptV1",
      contract_version: "1.0",
      receipt_id: "fixture-receipt",
      request_id: "fixture-request",
      bundle_id: "fixture-bundle",
      outcome: "pass",
      reason_codes: Object.freeze([]),
      checks: Object.freeze([]),
      counts: Object.freeze({
        requested_max_sources: 2,
        selected_sources: 2,
        omitted_sources: 0,
      }),
      policy_refs: Object.freeze({
        context_index: "docs/project_map/context_index.yaml",
        retrieval_policy: "docs/project_map/retrieval_policy.yaml",
        retrieval_scoring_policy: "docs/project_map/retrieval_scoring_policy.yaml",
      }),
      tools: Object.freeze({
        requested: Object.freeze([]),
        allowed: Object.freeze([]),
        denied: Object.freeze([]),
      }),
      changed_paths: Object.freeze([]),
      scope_expansion: Object.freeze({
        runtime: false,
        external_system: false,
        data: false,
        project_map_mutated: false,
      }),
    }),
  }),
  authorizationEvidence: Object.freeze({
    contractType: "TaskAuthorizationEvidenceV1",
    enabled: true,
    decision: "authorized",
    reason: "MATCHED_APPROVED_APPLY_CONTRACT",
    intent: "apply",
    technicalPermission: "reversible_local_write",
    sideEffectRisk: "reversible_local_write",
    approvalId: "prompt-compiler-v1-fixture",
    allowedPaths: Object.freeze(["server/prompt-compiler-v1"]),
    verificationCommands: mergedVerificationCommands,
    scopeFingerprint: "prompt-compiler-v1-fixture",
    goalFingerprint: "fixture-goal",
    branch: "fixture-branch",
    authorityFingerprint: "fixture-authority",
    approvalContractFingerprint: "fixture-approval",
  }),
  executorOutcomeContractVersion: 1,
});

/**
 * The single production-equivalent buildPrompt(task, project) invocation used
 * by both benchmark sides. The authorization argument is the exact evidence
 * buildPrompt reads from task.authorizationEvidence.
 */
export const productionBuildPromptFixture = Object.freeze({
  task: productionTaskFixture,
  project: productionProjectFixture,
  authorization: productionTaskFixture.authorizationEvidence,
});
