# Recovery evidence and audit-time guards

`scripts/evidence-guards.mjs` provides reusable Node.js guards extracted from
the local recovery/import and GIS audit-time incidents. It has no GIS-specific
paths, field names, schemas, or dependencies. Existing core
`RecoveryRetainedDiffV1` hash/replay checks remain in place; they do not import
external evidence or authorize replacement of an existing scope.

These commands are explicit opt-ins, not new queue fields or automatic
interception of every file write. Local queues and other projects are unchanged.
An executor that bypasses the helper is not protected by it. Keep immutable
inputs outside writing tasks' `allowedPaths`, and declare every external
repository in `externalReadRoots` as required by the queue contract.

## Import without replacement

Create an exact manifest with independently checked hashes:

```json
{
  "contractType": "RecoveryEvidenceImportV1",
  "contractVersion": "1.0",
  "sourceRoot": "C:/evidence/prepared",
  "targetRoot": "C:/project/reports/run-045",
  "files": [
    {
      "source": "scope.json",
      "destination": "duplicate-scope.json",
      "sourceSha256": "<64 lowercase hex characters>",
      "existingDestinationSha256": "<pinned original destination SHA-256>"
    },
    {
      "source": "detector.json",
      "destination": "supplied-detector.json",
      "sourceSha256": "<64 lowercase hex characters>"
    }
  ]
}
```

```powershell
node scripts/evidence-guards.mjs import C:/evidence/import.json <manifest-sha256>
```

The manifest SHA-256 is mandatory and covers its exact bytes. Put its literal
value in the authorized command; do not compute it from an untrusted edited
manifest as part of the same gate. The helper validates the entire source and
destination list before any write. A missing destination receives the verified
source bytes. An existing destination is never replaced: its exact hash must
match `existingDestinationSha256`, or `sourceSha256` if no separate hash is set.
A separately pinned richer original scope is preserved, not normalized or
merged. Compatibility of different source/destination JSON remains an explicit
authoring decision; the helper does not infer semantic equivalence.

A different pinned destination hash requires that destination to already
exist. Missing it is an error, not permission to reconstruct it from the shorter
source. Duplicate/aliased paths, traversal, links/junctions, directories, and
unexpected fields fail closed. Root and parent directories must already exist.

Files are staged beside the destination and published by an exclusive atomic
hard link. Concurrent imports cannot overwrite each other. Temporary staging
files use `.orchestrator-import-<uuid>.tmp`; include the destination directory
and these temporary writes in an apply task's scope. No fallback to overwriting
copy/rename is allowed if the filesystem does not support hard links.

Limits: 64 entries, 16 MiB per file, 64 MiB source bytes and 64 MiB existing
destination bytes. Batch publication is not a multi-file transaction: an IO
failure can leave an already published prefix, which a matching retry preserves.
A process crash can leave a staging file; the helper does not sweep or delete
files from previous attempts. Its JSON stdout records imported/preserved paths
and hashes and is retained by the runner when invoked as a machine gate.

## Audit time

Generate completion timestamps from the clock rather than writing guessed or
rounded times:

```powershell
node scripts/evidence-guards.mjs now
```

After the completion and state inputs are fixed, declare their exact hashes and
JSON pointers. Time fields are not guessed from filenames:

```json
{
  "contractType": "AuditTimeGuardV1",
  "contractVersion": "1.0",
  "root": "C:/project",
  "completion": {
    "path": "reports/completion.json",
    "sha256": "<completion SHA-256>",
    "pointer": "/finishedAt"
  },
  "states": [
    {
      "path": "state/coverage.json",
      "sha256": "<coverage SHA-256>",
      "pointer": "/updatedAt"
    },
    {
      "path": "state/baseline.json",
      "sha256": "<baseline SHA-256>",
      "pointer": "/updatedAt"
    }
  ]
}
```

```powershell
node scripts/evidence-guards.mjs check-time C:/evidence/time.json <manifest-sha256>
node scripts/evidence-guards.mjs finalize C:/evidence/time.json <manifest-sha256> -- C:/runtime/node.exe scripts/finalizer.mjs <finalizer-arguments>
```

`check-time` is read-only. `finalize` checks first and launches the explicit
executable only on success, without a shell and with cwd set to the manifest
root. A nonzero finalizer exit also fails the wrapper. The wrapper neither adds
nor guesses the finalizer's arguments; bind the exact checked input files in
those arguments and the task contract.

Completion must be a valid UTC ISO timestamp, no later than the observed system
clock and no earlier than **every** selected state timestamp. Equality is valid.
Missing fields, impossible calendar dates, timezone offsets, stale hashes,
duplicate references, and future or regressing times fail. A backward system
clock causes refusal; the guard never advances or rewrites a timestamp to force
acceptance. Up to 32 state references are supported, with the same file/total
byte bounds as imports.

The wrapper is a precondition, not a transaction or a filesystem lock. Another
writer can change state after the check. The domain finalizer must own its
atomic read/check/write or compare-and-swap boundary and validate its output.
Passing this guard does not prove audit findings, counts, or finalization.

Import/finalize have write effects and belong only in an authorized apply task
with complete paths and matching machine commands. Do not put them in a
read-only precondition or review task. Do not substitute these generic guards
for the project's existing semantic acceptance gates.

## Verification

```powershell
node --test scripts/evidence-guards.test.mjs
```

Coverage includes preserving a richer scope, rejecting a changed source or
destination before any import, concurrent publication, retry preservation,
unsafe paths, equality/progression/rollback/future times, missing fields, stale
state hashes, and refusing to launch a finalizer after a failed guard.
