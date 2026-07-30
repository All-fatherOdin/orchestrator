# Workspace and Merge Contract v1

Status: accepted contract candidate for Phase 3 implementation

This document defines the normative Phase 3 boundary. The words MUST, MUST
NOT, SHOULD, and MAY are requirements. The machine-readable companion is
`server/change-control-v1/schemas/workspace-merge-v1.schema.json`.

## Canonical state and evidence

Atomically persisted `.orchestrator/runs/<run-id>/run.json` is the canonical
current state of a run. Immutable change-control events are the canonical
transition history. Phase 3 adds three optional, versioned records:

- `WorkspaceAttemptV1` owns the lifecycle and identity of one attempt
  workspace.
- `MergeRequestV1` owns one serialized request to integrate a sealed attempt.
- `MergeReceiptV1` records the terminal or recoverable outcome of that exact
  request.

Git refs, worktree metadata, directories, ownership markers, lock files, and
process observations are evidence. They MUST NOT independently grant mutation
authority or replace canonical records. Each persisted transition contains its
previous and current state so immutable replay can reject invalid edges.

Legacy Phase 1/2 records remain valid without Phase 3 fields. If any Phase 3
record is present it MUST validate in full at version `1.0`. A partial record,
unknown version, missing ownership evidence, or disagreement between canonical
identity and observed evidence fails closed. Absence of Phase 3 state never
implies workspace ownership.

## Attempt identity and mandatory isolation

Every execution attempt MUST own exactly one dedicated Git worktree and one
local branch named:

`orchestrator/attempt/<runId>/<attemptId>`

There is no shared-worktree, detached-HEAD, branchless, or in-place fallback.
Before provisioning, the orchestrator MUST prove:

1. supported Git worktree capability;
2. a clean target worktree and exact repository identity;
3. exact target ref and target/base SHA;
4. normalized attempt path containment beneath the configured owned root;
5. absence of case-fold or reparse/junction escape;
6. acquisition of the required repository/attempt leases.

The owned worktree MUST contain an ownership marker whose run ID, attempt ID,
repository ID, normalized path, branch ref, and creation nonce exactly match
`WorkspaceAttemptV1`. Automatic writes are allowed only inside that verified
worktree. Before every automatic mutation, removal, or recovery step the
orchestrator MUST re-prove canonical identity, marker identity, repository
identity, exact branch ref and HEAD, normalized containment, and the applicable
lease. A mismatch enters `quarantined`; an unreadable or contended resource
enters `recovery_pending`. Unsupported capability fails provisioning explicitly
and MUST NOT silently select a weaker mode.

## WorkspaceAttemptV1 transitions

The schema permits exactly these `(previousState -> state)` pairs:

| Previous | Next states |
|---|---|
| `null` | `provisioning` |
| `provisioning` | `active`, `recovery_pending`, `quarantined` |
| `active` | `sealed`, `cleanup_pending`, `recovery_pending`, `quarantined` |
| `sealed` | `merge_queued`, `replan_required`, `cleanup_pending`, `recovery_pending`, `quarantined` |
| `merge_queued` | `merged`, `replan_required`, `recovery_pending`, `quarantined` |
| `merged` | `cleanup_pending`, `cleaned`, `recovery_pending`, `quarantined` |
| `replan_required` | `cleanup_pending`, `recovery_pending`, `quarantined` |
| `cleanup_pending` | `cleaned`, `recovery_pending`, `quarantined` |
| `recovery_pending` | `active`, `sealed`, `merge_queued`, `merged`, `replan_required`, `cleanup_pending`, `cleaned`, `quarantined` |
| `cleaned`, `quarantined` | none |

`sealedSourceSha` is required from `sealed` onward, except when a provisioning
or active workspace enters recovery/quarantine before sealing. `mergeRequestId`
is required in `merge_queued` and `merged`. `cleanup_pending` is not evidence
that cleanup occurred; `cleaned` requires a clean-removal receipt reference.
`quarantined` is terminal for automation and requires human action.

## Merge serialization and fresh-target policy

A `MergeRequestV1` binds the exact plan revision/base, repository, target ref,
expected target SHA, attempt branch ref, sealed source SHA, verification
commands, and lease identity.

One exclusive lease scoped to `(repositoryId, targetRef)` MUST be held
continuously from fresh-target validation through merge application,
verification, merge-commit creation, receipt persistence, or safe abort. After
acquiring the lease, the orchestrator MUST confirm:

- the target worktree is clean;
- target ref and HEAD equal `expectedTargetSha`;
- the attempt branch equals `sourceRef` and resolves to `sealedSourceSha`;
- the sealed source descends from the authorized plan base;
- all workspace ownership evidence still matches.

Any target movement causes `replan_required`. Version 1 MUST NOT auto-rebase,
merge-forward, cherry-pick, or refresh acceptance criteria. This applies even
after 100 or more intermediate attempt commits: the source is integrated as one
ancestry-preserving merge.

The only integration command is semantically:

`git merge --no-ff --no-commit <sealedSourceSha>`

The recorded verification commands run against that exact pending merge. On
success the orchestrator creates one identified merge commit with two parents,
then atomically persists `MergeReceiptV1`. A conflict, changed target, changed
source, failed verification, or ambiguous Git state MUST NOT be hidden by a
different integration strategy.

## MergeRequestV1 transitions

The schema permits exactly these pairs:

| Previous | Next states |
|---|---|
| `null` | `queued` |
| `queued` | `validating`, `replan_required`, `recovery_pending`, `quarantined` |
| `validating` | `applying`, `replan_required`, `recovery_pending`, `quarantined` |
| `applying` | `verifying`, `replan_required`, `recovery_pending`, `quarantined` |
| `verifying` | `committed`, `replan_required`, `recovery_pending`, `quarantined` |
| `recovery_pending` | `queued`, `validating`, `applying`, `verifying`, `committed`, `replan_required`, `quarantined` |
| `committed`, `replan_required`, `quarantined` | none |

`lease` is required for `validating`, `applying`, `verifying`, and `committed`.
`observedTargetSha` is required after fresh-target validation. `mergeCommitSha`
is required only for `committed`. Transition to `replan_required` requires a
drift assessment reference and releases the merge lease only after a safe
abort or proof that no merge began.

`MergeReceiptV1` is immutable outcome evidence, not another mutable state
machine. Its results are `merged`, `replan_required`, `recovery_pending`, and
`quarantined`. A merged receipt binds the identified merge commit, both
parents, verification evidence, and persisted run/event references. Other
results require a non-empty reason and their corresponding recovery, drift, or
quarantine evidence.

## Cleanup, authority, and quarantine

Automation MAY:

- create the recorded attempt branch and worktree;
- write only inside the verified owned attempt worktree;
- non-force remove a clean, owned worktree;
- delete a merged branch with `git branch -d`;
- abort an owned in-progress merge only when every canonical identity and
  pre/post-operation fingerprint matches.

Without explicit human authority automation MUST NOT run or emulate
`git reset --hard`, `git clean`, `git branch -D`,
`git worktree remove --force`, global `git worktree prune`, deletion of an
unmerged branch, file discard, force ref updates, or remote publication.

Cleanup is bounded and idempotent. Each attempt records a maximum retry count
and retry ordinal. A clean owned workspace may be removed non-force. Dirtiness,
open-handle/antivirus contention, stale worktree metadata, marker mismatch,
reparse escape, an unmerged branch, or an exhausted retry budget retains all
artifacts and transitions to `recovery_pending` or `quarantined`. Cleanup MUST
never remove uncommitted user files or a path not proven process-owned.

## Crash and restart recovery

Recovery re-observes canonical records and Git/filesystem evidence; it never
infers ownership from a directory or branch name alone. It may:

- requeue when the exact target, source, lease epoch, and ownership evidence
  are unchanged;
- safely abort an exactly owned in-progress merge;
- finalize a receipt when the identified merge commit already exists at the
  expected target and has the recorded parents;
- resume bounded cleanup using the next retry ordinal.

If the target moved, recovery records deterministic drift and requires a new
architect replan plus authorization. Conflicting evidence, dirty state,
unknown commit identity, stale metadata that cannot be reconciled
non-destructively, dead-lock evidence without a provably dead owner, or any
ownership disagreement enters `quarantined`.

## Required executable Windows evidence

Implementation may not claim Windows support until temporary-repository tests
exercise:

- spaces and long normalized paths;
- case-insensitive containment and rejection of sibling-prefix paths;
- junction/reparse escape detection;
- preservation of dirty files when non-force cleanup fails;
- cleanup contention and retained retry state;
- stale `.git/worktrees` metadata without global prune;
- crash points before apply, during merge, after commit, and before receipt;
- live versus dead lease owners and monotonic lease epochs;
- an ancestry-preserving merge of 100+ intermediate commits;
- target movement producing `replan_required`.

Tests MUST use newly created temporary repositories and owned roots. Missing
privileges or unsupported filesystem features MUST produce an explicit
fail-closed result; an invariant must not be silently skipped.
