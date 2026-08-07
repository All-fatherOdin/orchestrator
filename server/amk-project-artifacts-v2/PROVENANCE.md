# Agent Memory Kit Project Artifact V2 provenance

Normative upstream repository: `https://github.com/Vellforzi/AI-assisted_System_Design_and_Agent_Memory_Kit.git`
Pinned core commit: `86ffff56a61d51817891af9be569cb4c2923430a` (Agent Memory Kit v5.0.0)

The four schema snapshots below are byte-for-byte copies from that commit.
`normalized UTF-8 LF SHA-256` is computed after replacing CRLF and CR with LF;
it is recorded separately from the original byte hash. Every listed upstream text
file is already UTF-8 LF at the pinned commit.

| Upstream path | Repository path | Upstream bytes / SHA-256 | Repository bytes / SHA-256 | Normalized UTF-8 LF SHA-256 (upstream / repository) | Equality |
| --- | --- | --- | --- | --- | --- |
| `Agent Kit/kit/project_artifact_contract_v2/schemas/task-contract-v3.schema.json` | `schemas/task-contract-v3.schema.json` | `3442` / `4988645351f73821cbbc3cdb08bfedbc0ae6a39741a3ed62320de1a34a8109e3` | `3442` / `4988645351f73821cbbc3cdb08bfedbc0ae6a39741a3ed62320de1a34a8109e3` | `4988645351f73821cbbc3cdb08bfedbc0ae6a39741a3ed62320de1a34a8109e3` / same | byte equal; semantically equal |
| `Agent Kit/kit/project_artifact_contract_v2/schemas/work-item-graph-v1.schema.json` | `schemas/work-item-graph-v1.schema.json` | `1560` / `bc2444ad6b330f23cfbcfc84bebc0be1f1efb48aff87a142ce6e2379a90ecfdb` | `1560` / `bc2444ad6b330f23cfbcfc84bebc0be1f1efb48aff87a142ce6e2379a90ecfdb` | `bc2444ad6b330f23cfbcfc84bebc0be1f1efb48aff87a142ce6e2379a90ecfdb` / same | byte equal; semantically equal |
| `Agent Kit/kit/project_artifact_contract_v2/schemas/verification-receipt-v2.schema.json` | `schemas/verification-receipt-v2.schema.json` | `1057` / `29cff93b520ffdc4caeba25a105af785cffc8baa859967552280ef011254372a` | `1057` / `29cff93b520ffdc4caeba25a105af785cffc8baa859967552280ef011254372a` | `29cff93b520ffdc4caeba25a105af785cffc8baa859967552280ef011254372a` / same | byte equal; semantically equal |
| `Agent Kit/kit/project_artifact_contract_v2/schemas/review-receipt-v1.schema.json` | `schemas/review-receipt-v1.schema.json` | `1526` / `9d59ecfb7e7993e2a2dd5fa97300504269a7711337a546584a961ce8eb4c27b6` | `1526` / `9d59ecfb7e7993e2a2dd5fa97300504269a7711337a546584a961ce8eb4c27b6` | `9d59ecfb7e7993e2a2dd5fa97300504269a7711337a546584a961ce8eb4c27b6` / same | byte equal; semantically equal |
| `Agent Kit/kit/project_artifact_contract_v2/examples/valid/project-artifacts-v2.json` | `fixtures/amk-project-artifacts-v2.json` | `9415` / `c8690183697d9abea1fe9488552ef56372947f1a7bd4de24b85b018643bac6cc` | `5343` / `261b7b614ee7367240e93d3e0367ae86f4c750d39e07e34faacedfc544485933` | `c8690183697d9abea1fe9488552ef56372947f1a7bd4de24b85b018643bac6cc` / `261b7b614ee7367240e93d3e0367ae86f4c750d39e07e34faacedfc544485933` | not byte equal: curated fixture; semantically equal for the four selected `valid` values |
| `Agent Kit/kit/project_artifact_contract_v2/examples/invalid/project-artifacts-v2.json` | `fixtures/amk-project-artifacts-v2.json` | `5393` / `b1bcba8544205014108b028b2c44209c95d016b51a0de482fe77ec9165396a43` | `5343` / `261b7b614ee7367240e93d3e0367ae86f4c750d39e07e34faacedfc544485933` | `b1bcba8544205014108b028b2c44209c95d016b51a0de482fe77ec9165396a43` / `261b7b614ee7367240e93d3e0367ae86f4c750d39e07e34faacedfc544485933` | not byte equal: curated fixture; semantically equal for the four selected `invalid` values |
| `Agent Kit/kit/project_artifact_contract_v2/fixtures/project-artifact-v2-smoke.json` | `fixtures/amk-project-artifacts-v2.json` | `3699` / `6369c07a08e2b28da5f33bd49964aeecbc7e2cab2b9ecbd5b435332a5f1aa872` | `5343` / `261b7b614ee7367240e93d3e0367ae86f4c750d39e07e34faacedfc544485933` | `6369c07a08e2b28da5f33bd49964aeecbc7e2cab2b9ecbd5b435332a5f1aa872` / `261b7b614ee7367240e93d3e0367ae86f4c750d39e07e34faacedfc544485933` | not byte equal: curated fixture; semantically equal for the four selected semantic case IDs and expected reason-code arrays |

The curated fixture intentionally excludes every unsupported AMK schema and its
unneeded examples. It includes only the four selected valid/invalid values and
the four selected upstream semantic expectations. The local test also proves
the applicable supported cross-contract checks: `TaskContractV3` references
must resolve to a valid `WorkItemGraphV1`, and required high/significant-risk
reviews must resolve to a valid accepted `ReviewReceiptV1` with the required
profile. It does not claim validation of unsupported AMK artifacts.

Production imports only these local JSON snapshots and uses the existing AJV
dependency. Python and the upstream checkout are verification oracles only;
they are not production dependencies.
