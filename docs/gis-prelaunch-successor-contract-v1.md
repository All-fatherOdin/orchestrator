# GIS prelaunch successor v1

Status: implemented; [source/fixture acceptance](gis-prelaunch-successor-acceptance-20261007.md).
Originally written as a proposal before implementation. Role: bounded manual recovery extension;
navigation: [NEXT_STEPS](NEXT_STEPS.md). Evidence: failed precondition run
`muyb7bdj-d1r0c`, original source `muwmmp32-zsowq`, and the
[operational record](gis-prepared-correction-operational-20261007.md).

The owner requested completion after this stop. Preserve the original canonical
records and conservative claim; do not refund, overwrite or delete them.
An approval-bound optional `PreparedCorrectionRecoveryV1.prelaunchSuccessor`
permits exactly one separately reserved successor following the original manual
recovery's proved precondition-only failure. It binds the predecessor run/task,
canonical SHA-256 and original reservation SHA-256. Require terminal failed exit 1,
successful authorization replay, exact original source binding, ordered required
precondition receipts ending in a non-timeout failure, no executor invocation or
attempt, no process progress, review, verification, changed files or publication.
Reject ambiguous evidence, cancelled/time-out attempts, an already-successor
predecessor, missing claims and narrowed runtime constraints. The new task retains
all source and predecessor constraints, zero retries/corrections and one new
executor/verification/review/publication allowance. Source counters remain intact.

The successor owns a distinct deterministic source-local claim file ending in
`-prepared-correction-recovery-prelaunch-v1.json`. Exclusive creation precedes
authority. Its owner includes the predecessor binding. Replay requires the existing
claim and persisted owner evidence; a missing claim is never recreated. A different
owner, concurrent contender or a further successor is refused. This manual opt-in
grants no automatic retry, new recovery chain or failed-native-command retry.

An independent optional approval-bound `mechanicalCompatibility` binds the fresh
GIS manifest path/hash. Compare the original and replacement manifests: only
`mechanicalEvidence[*].sha256` may change, with identical order, paths and all
other values. Every replacement hash must match the actual source file and at
least one hash must differ. Replacement native gates retain the exact original
bytes, hashes and basenames and reside beside the replacement manifest. Preserve
native schemas, scopes, runtime, product root, cells, input/state hashes, native
timeouts and complete assertions. Fence both manifests, gates, mechanical files,
predecessor canonical record and original claim at asynchronous boundaries.

Both closed typed objects are part of the approved apply contract, authorization
evidence and persisted replay through the prepared recovery policy. Defaults and
existing legacy/structured/Stage 4 recovery remain unchanged. No HTTP routes,
provider settings, UI controls, existing queue edits or Project Map mutations.

Implementation slice: `server/gis-correction-recovery.ts`, its unit suite,
`server/index.ts` and the production GIS integration suite. Verify positive
successor with source/original claim unchanged, singleton contender/replay,
tampering and any launched/ambiguous predecessor rejection, manifest-only-hash
compatibility, gate mutation and unchanged siblings/single publication. Run focused
suites, check/build, context smoke, explicit-PYTHON Context Budget, Electron/Node22
focused suites and full `npm.cmd test`, followed by independent read-only source
acceptance. Private evidence belongs in `queues/gis-prelaunch-successor-20261007/`.
Deployment, fresh installed smoke and live bounded recovery follow source acceptance.
Before launch, audit and execute the complete read-only native preconditions with
fresh bindings; failure must stop before consuming the new claim. Full unfinished
writer continuation follows only a closed successful bounded recovery receipt.
