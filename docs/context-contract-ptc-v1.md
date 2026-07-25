# Context Contract v1 programmatic reduction

The Programmatic Tool Calling (PTC) adapter is an optional post-router reduction stage for Context Contract v1. It is disabled by default and can be enabled with `ORCHESTRATOR_CONTEXT_PTC_V1=1`. The adapter needs no credentials and makes no network call: the default executor is a deterministic in-process implementation.

The existing context router remains the only source-selection path. It invokes the repository helper or its fixed safe fallback, normalizes the selected sources, and produces schema-valid `ContextBundleV1` and `ContextReceiptV1` values before the PTC stage receives anything. PTC never scans a repository and never chooses new sources.

## Boundary

The fixed pipeline permits only:

1. deterministic filtering of structurally empty entries;
2. deterministic evidence joining;
3. priority/path ranking;
4. exact-path deduplication;
5. count aggregation; and
6. schema validation.

Every operation must advertise `readOnly: true` and `approvalSensitive: false`. All six descriptors are checked before the first call executes. An absent, write-capable, or approval-sensitive descriptor produces `PTC_TOOL_DENIED` and returns the untouched router result to the direct path.

Each call carries a stable `call_id` and `{ type: "context_router", request_id }` caller link. Responses with changed linkage stop immediately. Provider output must exactly match the local deterministic operation contract, retain every input evidence reference, use valid uppercase reason codes, preserve empty `changed_paths` and false scope-expansion flags, and pass Context Contract schema and consistency checks.

Only an explicitly retryable adapter error is retried, and then at most once. Invalid linkage, invalid output, evidence loss, semantic metadata conflicts, unsafe tools, and all other errors stop without retry. Adapter metadata records whether the stage was applied or used the direct fallback, its reason codes, completed call receipts, input source paths, retained evidence references, and the mandatory direct-final-validation handoff.

Semantic conflict resolution, approval decisions, citation production, mutations, and final response validation are deliberately not PTC operations. A metadata conflict between duplicate paths returns the original routed bundle for direct handling. The normal prompt/final-response path remains responsible for citations and for checking that the user-visible answer is complete.

## Local use and testing

The default `LocalDeterministicContextPtcExecutor` is both the production-local adapter and a credential-free test double. Tests can supply another `ContextPtcExecutor` to simulate retryable failures, linkage loss, unsafe descriptors, invalid reason codes, or evidence loss without contacting a provider.

Disable the feature by omitting `ORCHESTRATOR_CONTEXT_PTC_V1` or setting it to any value other than `1`. Disabled resolution returns the original router object without adapter metadata.
