# Isolated artifact tasks

Status: implemented, explicit opt-in
Last aligned: 2026-09-28
Audience: queue authors and maintainers
Runtime impact: isolated executor workspace and host publication for opted-in tasks
Authority: implementation contract; current owner authorization and task approval remain required

`IsolatedArtifactsV1` supports artifact-producing tasks on Windows where the
unelevated agent shell cannot enforce several writable subdirectories under a
read-only workspace. It gives the executor a complete disposable writable root;
the canonical project and external repositories remain read-only to the agent.
It never changes the global Codex configuration or disables the sandbox.

Declare `isolatedArtifacts` identically on the task and its
`project.approvedApplyContracts` entry:

```yaml
isolatedArtifacts:
  contractType: IsolatedArtifactsV1
  contractVersion: '1.0'
  inputPaths:
    - inputs
  publishCommands:
    - node "C:/trusted-tools/publish-results.mjs"
```

`inputPaths` contains exact project-relative files or directories. The runner
copies plain files, rejects links and hard links, and records their hashes.
The agent works in the copy; original `allowedPaths` still determines which
artifact changes are eligible for acceptance. `.orchestrator-scratch` is reserved
for disposable runtime temporary files, never published. TEMP/TMP/TMPDIR point
there so native tools do not need writable directories outside the sandbox.

The mode requires enabled apply authorization, `QueueAuthoringContractV1`, a
single-task concurrency limit, no retries/corrections or commits, and enabled
independent review. Managed-workspace bindings, prompt-model bindings and retained
diff adoption cannot be combined with it. Queues without this field are unchanged.

Execution order:

1. Copy inputs into the fresh run/task workspace. Existing stage directories stop
   execution instead of being reused.
2. Run preconditions, executor, required verification and independent review.
   Commands use the stage cwd. `ORCHESTRATOR_ARTIFACT_WORKSPACE` and
   `ORCHESTRATOR_CANONICAL_PROJECT` identify the two roots explicitly.
3. Recheck canonical input hashes and inventory, scope and reviewed artifact
   hashes. Seal the reviewed bytes in a sibling directory outside the agent's
   writable root. Record publication-started before any host publication.
4. Execute exactly the authorization-bound `publishCommands` on the host, with
   canonical project cwd and the sealed artifact directory in the environment.
   Publisher code must live outside the writable stage and validate every input;
   never execute a script or shell command supplied by the agent.
5. Record host command receipts and the canonical changed files. Failures, scope
   violations, timeouts or ambiguous publication stop the task. There is no
   automatic rollback or replay of a partially executed publisher. Inspect its
   persisted receipts and canonical state before preparing recovery.

Publication commands are trusted host code, like existing verification commands;
they must enforce their declared write boundary themselves. The runner additionally
checks the canonical diff. The generic adapter does not invent a domain transaction
or copy arbitrary stage files back into the project.

For GIS quality audits, `scripts/quality-audit-isolated.mjs` is the host publisher.
It validates the pinned gate, exact result-chain publication descriptor and native
evidence, fetches the configured memory `main`, rejects drift, copies only the
owned audit run, and replays the existing native atomic finalizer for each reviewed
sub-batch. It does not copy stage coverage/baseline over canonical state. Results
must be byte-identical to the reviewed dry run; the canonical after-gate runs last.
Historical incomplete artifacts remain intact. A queue pinned to an old GIS HEAD
does not claim present remote freshness.

Validation covers denied/mutated/out-of-scope results, canonical drift, links,
duplicate publication and real executor/verification/reviewer/publication order.
The disposable live CLI smoke is an execution-boundary test, not evidence that
the full GIS audit or the installed desktop build has completed.

On Windows, Node's default child-process pipes can fail with `EPERM` even when
the same Git command works directly in PowerShell. For affected audit tools,
explicitly preload `scripts/sandbox-file-stdio.cjs` with `node --require`.
The adapter captures synchronous child streams in `.orchestrator-scratch` and
propagates itself to nested Node processes through `NODE_OPTIONS`. It preserves
exit codes, spawn errors and timeouts; oversized captured output fails closed
after the child returns. File capture does not impose a live disk-size quota.
It does not alter sandbox permissions or native audit source. Pin its hash in
the queue gate and carry this requirement into recovery runtime constraints.
