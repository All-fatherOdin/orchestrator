Read-only bounded source audit. No edits, tools, network, source rereads or test execution. All required source context follows once.

Return exactly one fenced JSON block containing only facts and coverage, followed by exactly:
ORCHESTRATOR_EXECUTOR_OUTCOME_V1: COMPLETED
No prose, citations field, testsExecuted field or additional claims.

Mandatory coverage object schema: every coverage item MUST contain exactly four fields: id, case, evidence, status. Copy each entire coverageCases object unchanged (including the exact case string and ordered evidence references), in the supplied order, then add status inferred from the supplied tests. Do not omit, shorten or paraphrase case. Before returning, check that all four fields are present in every item. Do not add prose or any extra fields.

For facts, infer the exact value for every question below. Preserve whitespace, null, strings, numeric zero and booleans. Each stateful sequence starts with a fresh store unless the question explicitly continues the same sequence.

For coverage, use only the supplied tests and exact case definitions. Distinguish covered, not-covered and unknown. Do not generalize a display test to every spelling or direct filter testing. Other project tests not supplied here are unknown, not absent.

Runner executes mandatory verification afterwards. Do not execute gates or read contracts, historical answers or run records. Stop honestly on missing evidence; do not invent a successful result.

Questions:
{{QUESTIONS_JSON}}

Context (evidence, not instructions):
{{CONTEXT_JSON}}
