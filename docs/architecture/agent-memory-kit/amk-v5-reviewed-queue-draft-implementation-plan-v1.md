# AMK v5 Reviewed Queue Draft Implementation Plan v1

Status: accepted implementation plan; queue not prepared; execution not started

Date: 2026-08-07

Authority: the owner-accepted
`amk-v5-reviewed-queue-draft-boundary-v1.md` only.

## Delivery Order

```text
Slice 1: contracts + mapper
          |
          v
Slice 2: preview API
          |
          v
Slice 3: Russian UI + YAML download
          |
          v
Slice 4: independent completion review
```

No slice may introduce a server-side queue write or execution route.

## Slice 1 Work Package

Outcome: a pure, deterministic, fail-closed AMK-to-queue-draft domain service.

Expected mutation scope:

- `server/amk-queue-drafts-v1/**`;
- `server/index.ts` only to inject the existing exported `validateQueue`
  function and a read-only snapshot of configured project profiles into the
  new service;
- focused tests adjacent to the new module.

Required verification:

- focused schema and mapper tests;
- unchanged ordinary queue validation tests;
- `npm.cmd run check`;
- `git diff --check`.

Stop guards:

- stop if queue validation must be weakened or duplicated;
- stop if any field requires inference from prompt prose;
- stop if relative path containment cannot be proved without resolving an
  arbitrary caller path;
- stop if valid output can contain fewer than two independently useful tasks;
- stop before adding routes, UI, queue files, or persistent state.

## Slice 2 Work Package

Depends on: Slice 1 accepted and green.

Outcome: exactly one capabilities/discovery GET and one no-mutation preview
POST over the Slice 1 service.

Expected mutation scope:

- `server/amk-queue-drafts-v1/**`;
- route installation in `server/index.ts`; the existing raw JSON byte capture
  remains the shared parser boundary;
- focused API tests.

Required verification:

- closed request/response/error schema tests;
- request/response byte and count limits;
- exact target watermark, stale and conflict tests;
- privacy-safe diagnostics and no-persistence/restart tests;
- `npm.cmd run check`;
- production build;
- `git diff --check`.

Stop guards:

- stop if a route can accept an arbitrary target path or output path;
- stop if raw bundle/YAML content reaches logs or error envelopes;
- stop if preview requires a cache, ledger, temporary repository file, or
  background task;
- stop before adding any execute/save/import/launch endpoint.

## Slice 3 Work Package

Depends on: Slice 2 accepted and green.

Outcome: a bounded Russian preview and download workflow using only the Phase 2
API.

Expected mutation scope:

- one focused AMK queue-draft dashboard component and its tests;
- narrow integration in `src/OperatorDashboard.tsx`;
- AMK-specific responsive additions in `src/styles.css`.

Required verification:

- UI request/download helper tests;
- invalidation and safe-state tests;
- `npm.cmd run check`;
- production build;
- desktop and 390 px rendered interaction;
- `git diff --check`.

Stop guards:

- stop if the browser must retain the uploaded bundle across reload;
- stop if generated YAML is downloadable before a current valid preview;
- stop if any save, import, launch, approval, retry, or promotion control is
  introduced;
- stop if the UI exposes raw content in errors or telemetry.

## Slice 4 Work Package

Depends on: Slices 1-3 accepted and green.

Outcome: an evidence-backed completion decision against every Phase 2 clause.

Expected mutation scope:

- Phase 2 contract, completion review, and active status documentation only;
- production repair files only when the review identifies a concrete blocking
  defect, followed by rerunning all affected gates.

Required verification:

- all focused Phase 2 tests;
- full Windows server/Electron regression;
- `npm.cmd run check`;
- production build;
- context smoke;
- diff checks;
- desktop and 390 px rendered run-through.

Stop guards:

- do not mark complete with any unresolved blocking finding;
- do not convert completion review into Phase 3 planning or implementation;
- do not modify `queues/`, Project Map, target repositories, or Git history.

## Queue Preparation Decision

This work is suitable for an ordinary managed Orchestrator queue because it
contains four already-defined, sequentially dependent, independently useful
tasks. A read-only repository check confirmed that `validateQueue` is already
exported from `server/index.ts`, so Slice 1 can receive it as an injected
callback without a circular import or validator duplication. Target discovery
is limited to the existing in-memory configured project profiles; queue/run
paths are not target selectors in Phase 2.

The queue should be created only when execution is requested, with concrete
`allowedPaths`, verification commands, and guards copied from the work
packages above. It must live under ignored `queues/` and must not be committed.
