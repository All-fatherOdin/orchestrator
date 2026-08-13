# Progressive Disclosure Contract v1

Status: accepted, implemented, and completion-reviewed

Prepared: 2026-08-13

Accepted: 2026-08-13 (`принимаю S6 contract v1`)

Integration plan: `agentic-patterns-integration-plan-v1.md`, Stage 1 S6

## Proposed decision

Adopt S6 as one stateless, read-only source-index and excerpt layer invoked
explicitly beside the existing repository context helper. It exposes exact
structure from current source bytes without changing ordinary context
selection, replacing source with summaries, or making large files always
loaded.

The owner selected the recommended decisions:

1. a separate read-only index/excerpt layer with no queue, API, runtime-context,
   or vendored Context Contract change;
2. one Node/MJS indexer using the installed TypeScript parser;
3. exact path, source SHA-256, parser identity, bytes, lines, and byte/line
   boundaries on every index and excerpt;
4. index-first excerpt selection by one exact closed `entryId`, never fuzzy
   symbol or test-name lookup;
5. one entry, at most 2,000 lines and 65,536 UTF-8 bytes per excerpt, with no
   automatic truncation;
6. AST indexing for `.ts`, `.tsx`, `.mts`, `.js`, `.mjs`, and `.cjs`; exact
   hash-bound line-range fallback only for `.py`; all other extensions are
   unsupported;
7. fail closed on parse, ambiguity, stale hash, UTF-8, path, range, and limit
   failures; Python fallback never guesses symbols;
8. build indexes and excerpts only in memory, with no generated or cached
   index;
9. preserve existing `read-set`, `api-context`, and `smoke-check` behavior and
   never substitute excerpts automatically;
10. require fixed correctness, stale, privacy, fencing, unsupported, limit,
    deterministic-replay, compatibility, and reduction cases.

Acceptance authorizes only the implementation impact map below. It does not
authorize implementation before acceptance, Stage 2, semantic summaries,
model-selected retrieval, Project Map mutation, persistent indexes, automatic
context insertion, or new runtime authority.

## Evidence-backed baseline

Post-S5 `main` Windows run `31710041961` is green. Read-only discovery measured:

| Source | UTF-8 bytes | Lines | Structure |
|---|---:|---:|---|
| `server/index.test.ts` | 815,904 | 21,540 | 298 named tests; 61 top-level declarations |
| `server/change-control-v1/index.ts` | 410,329 | 11,349 | 195 declarations; 74 exports |
| `server/index.ts` | 393,475 | 10,907 | 345 declarations; 159 exports |

All three parse without TypeScript syntax diagnostics. Representative exact
entries reduce bytes by 87.3% to 99.0% relative to full source. Reduction is
capacity evidence only, never a correctness oracle.

The current Python helper implements only `read-set`, `api-context`, and
`smoke-check`. It selects whole paths and has no AST, symbol/test identity,
source hash, byte range, excerpt limit, or stale-source check. None of the
three measured files is automatically selected by a default profile.

The repository runtime families are Node.js sources (TypeScript/TSX and
JavaScript modules) and one small Python helper. A second Python AST contract
would not address the measured large-file problem, so Python receives only an
exact bounded line-range fallback in v1.

## Gap matrix

| Area | Current state | S6 disposition |
|---|---|---|
| Context routing | profiles select whole files | preserve routing; explicit side-channel only |
| Structure | installed parser handles all targets | derive bounded AST index from exact bytes |
| Identity | context source has only path | bind path, source hash, parser and boundaries |
| Selection | names can repeat or drift | exact index-produced `entryId` only |
| Bounds | only `maxSources` exists | one entry, 2,000 lines, 64 KiB |
| Large classes | `ChangeControlStore` is about 4,925 lines | index methods; reject oversized class excerpt |
| Tests | 298 literal-name tests exist | index literal `test`/`it` identities and occurrences |
| Python | one helper, about 290 lines | exact hash-bound line range only |
| Unsupported syntax | not classified | explicit unsupported/parse failure; no guessing |
| Freshness | no index/excerpt handshake | current expected source hash is mandatory |
| Persistence | helper writes nothing | remain in-memory and write-free |
| Evidence | S2 measures whole-source bytes | exact-text correctness plus separate reduction evidence |

## Authority boundary

- Current repository source bytes are the only source truth.
- An index is derived navigation metadata, not source, documentation, Project
  Map memory, behavioral evidence, authorization, or write authority.
- An excerpt is an exact byte slice of one source version. It never replaces
  source and grants no path, mutation, tool, queue, API, or execution authority.
- Existing instructions, source hierarchy, context profiles, Context Contract,
  S2 baseline, queue validation, launch gates, and prompt assembly remain
  authoritative and unchanged.

## Command surface

Existing Python helper commands remain unchanged. S6 adds one focused Node/MJS
executable with exactly two read-only commands:

```text
node scripts/source_projection_v1.mjs index --root ROOT --path PATH
node scripts/source_projection_v1.mjs excerpt --root ROOT --path PATH --source-hash HASH --entry-id ID
```

For Python, `excerpt` uses both `--start-line` and `--end-line` instead of
`--entry-id`. JS/TS rejects free ranges; Python rejects entry IDs. The CLI
prints one JSON document, uses bounded private-safe stderr, performs no network
or write, exits non-zero on rejection, and starts no service.

## Closed contracts

One closed Draft 2020-12 schema has a top-level `oneOf` over exactly:

- `SourceIndexV1`;
- `SourceExcerptV1`;
- `SourceProjectionFailureV1`.

All objects are closed. Hashes are lowercase SHA-256, byte ranges are zero-based
half-open, and line ranges are one-based inclusive.

### SourceIndexV1

The index binds contract/index version, normalized relative path, source hash,
bytes and lines, closed language, parser identity/version, parse state, ordered
entries, hard limits, and canonical `indexHash`.

JS/TS entries contain deterministic `entryId`, closed kind, exact qualified
name, occurrence, exported state, optional parent, start/end bytes and lines,
and byte/line counts. Initial kinds cover module functions, classes, class
methods/accessors, interfaces, type aliases, enums, top-level variables,
imports, exports, and literal-name `test`/`it` calls. Entries sort by start byte,
end byte, kind, name, and occurrence. Duplicate identities, invalid bounds,
bad parent links, or unsorted entries fail closed.

Python index output has language `python_line_range`, no AST entries, and
explicit line-range-only support. It makes no Python parsing claim.

### SourceExcerptV1

The excerpt binds exact index/source/parser identity, selected entry or Python
range, boundaries, exact UTF-8 source text, byte/line counts, and canonical
`excerptHash`, with `truncated: false` and `omitted: false`. An oversized entry
fails; callers must select a smaller indexed child such as a method. Equal
bytes and requests produce byte-equal output.

### SourceProjectionFailureV1

Failures expose only contract version, stable reason code, normalized safe path
when available, and fixed public message. They never include source text,
absolute paths, environment values, stacks, raw parser diagnostics, or command
output.

## Stable reason codes

S6 v1 uses exactly:

- `SOURCE_PROJECTION_SCHEMA_INVALID`;
- `SOURCE_PROJECTION_PATH_INVALID`;
- `SOURCE_PROJECTION_PATH_OUTSIDE_ROOT`;
- `SOURCE_PROJECTION_SOURCE_MISSING`;
- `SOURCE_PROJECTION_SYMLINK_ESCAPE`;
- `SOURCE_PROJECTION_EXTENSION_UNSUPPORTED`;
- `SOURCE_PROJECTION_UTF8_INVALID`;
- `SOURCE_PROJECTION_PARSE_FAILED`;
- `SOURCE_PROJECTION_ENTRY_UNKNOWN`;
- `SOURCE_PROJECTION_ENTRY_AMBIGUOUS`;
- `SOURCE_PROJECTION_SOURCE_STALE`;
- `SOURCE_PROJECTION_RANGE_INVALID`;
- `SOURCE_PROJECTION_LIMIT_EXCEEDED`;
- `SOURCE_PROJECTION_REPLAY_INVALID`;
- `SOURCE_PROJECTION_INTERNAL_FAILURE`.

Unknown codes fail schema validation. Messages are fixed and do not echo input.

## Path, privacy, and limits

- Root must be one existing resolved directory.
- Path must be normalized repository-relative UTF-8 with no drive, leading
  separator, `..`, NUL, glob, or empty segment.
- Resolved file and every symlink prefix must remain under root.
- Directories, devices, Git internals, `.env*`, runtime state, logs, databases,
  build output, queues, and current high-risk exclusions are rejected.
- Each file is read once into a bounded buffer; hash, index, and excerpt derive
  from that same buffer.
- Text appears only in a successful excerpt. Indexes and failures contain none.

Hard maxima are: 1,048,576 source bytes; 30,000 source lines; 2,000 entries;
1,048,576 index JSON bytes; one excerpt; 65,536 excerpt bytes; 2,000 excerpt
lines; 512 path bytes; and 512 entry-ID/name bytes. Identity contains no time,
randomness, PID, or absolute path. A complete index that exceeds a limit fails
rather than silently omitting entries.

## Initial acceptance corpus

The corpus is exactly the three measured TypeScript files plus
`scripts/ai_context_helper.py` for Python range fallback. Positive cases include
`validateQueue`, `executeTask`, `validateAndProject`, `ChangeControlStore`, at
least two store methods, the managed-workspace replay test, target-fencing test,
and one exact Python range.

Every excerpt is compared byte-for-byte with the source buffer and has its
hashes/bounds recomputed. Reduction is measured separately and cannot compensate
for wrong, missing, stale, truncated, or ambiguous source.

## Compatibility

- Existing helper outputs and exits remain unchanged for equal input.
- Context schemas, provider normalization/fallback, queue fields,
  `contextProfile`, `maxSources`, prompt assembly, S2 baseline, and smoke tests
  remain unchanged.
- Source files are not refactored or annotated; Project Map is not updated.
- No dependency is added: TypeScript is already installed. Python fallback is
  implemented by Node exact UTF-8 line splitting and needs no Python process.

## Exact implementation impact map

Owner acceptance authorizes changes only to:

```text
scripts/source_projection_v1.mjs
scripts/source_projection_v1.test.mjs
scripts/schemas/source-projection-v1.schema.json
scripts/schemas/source-projection-v1.examples.json
package.json
docs/architecture/change-control-plane/progressive-disclosure-contract-v1.md
docs/architecture/change-control-plane/agentic-patterns-integration-plan-v1.md
docs/architecture/change-control-plane/README.md
docs/NEXT_STEPS.md
docs/context_packs/current_status.md
```

The large source files, Python helper, Context Contract, Project Map, S2
baseline, server runtime, UI, Electron, queues, run records, generated output,
and package lock are read-only evidence and outside mutation scope. Any need
for another path, dependency, schema, integration, or artifact requires a
contract revision.

## Implementation and acceptance

After acceptance: add schema/examples and safe single-buffer reader; implement
AST indexing; implement hash-bound excerpts and Python fallback; add replay;
add focused tests; add `test:source-projection`; update only listed status docs;
run gates; conduct a separate completion review.

Focused acceptance must prove closed-schema validation, byte-equal determinism,
recomputable hashes/bounds, exact functions/methods/exports/types/tests,
deterministic duplicate occurrences, index-first selection, stale rejection,
parse/unsupported/UTF-8/path/symlink/range/limit failures, no truncation,
Python range-only behavior, private diagnostics, exact excerpt bytes, unchanged
helper commands, context smoke 3/3, passing S2 baseline, measured reduction,
and zero file/cache/service/network/provider/credential/queue/runtime/ledger or
Project Map mutation.

Required commands:

```powershell
npm.cmd run test:source-projection
npm.cmd run check
npm.cmd run build
& $env:PYTHON_BIN scripts/ai_context_helper.py --root . smoke-check --format json
npm.cmd run test:context-budget
npm.cmd test
git diff --check
```

Full Windows regression gets at least 15 minutes. Focused filesystem tests use
owned temporary roots and remove them.

## Completion review

The separate completion review passed on 2026-08-13 with no unresolved or
deferred acceptance finding. The implementation stays inside the exact accepted
impact map and adds no source mutation, persistence, cache, service, network,
provider, credential, queue, runtime, ledger, or Project Map authority.

Verification evidence:

- `test:source-projection`: 11/11 focused groups passed;
- TypeScript check and production build passed;
- Context Budget v1 baseline: 10/10 passed;
- context helper smoke: 3/3 passed;
- full Windows regression: 348/348 passed, zero failures/skips, 390.81 seconds;
- `git diff --check` passed.

## Stop conditions and non-goals

Stop if identity/range must come from prompts, models, fuzzy names, logs, or
runtime guesses; an excerpt lacks current source hash; bytes can change between
hash and excerpt; path/symlink can escape root; source text can enter index,
failure, log, or persistence; unsupported syntax is guessed; truncation,
summary, or omission appears complete; index becomes persistent, always-loaded,
Project Map state, or selection authority; existing helper/context/queue/S2 or
source files must change; a dependency, API, UI, service, watcher, database,
telemetry, credential, network/provider call, external write, or out-of-map path
is needed; or inherited `main` CI is not green.

Non-goals include semantic summaries, embeddings, vector/fuzzy search, learned
ranking, call/reference graphs, whole-program analysis, type checking, language
server, Python AST, non-code indexing, generated docs, source annotations,
persistence, cache, watcher, API/UI/queue fields, automatic prompt insertion,
context-profile changes, refactoring, telemetry, external systems, Stage 2,
and claims that fewer bytes alone improve quality.

## Owner acceptance

Implementation begins only after exact acceptance, for example:

```text
принимаю S6 contract v1
```

Changing decisions, extensions, Python fallback, identity, limits,
compatibility, corpus, or impact map requires a revision and new acceptance.
