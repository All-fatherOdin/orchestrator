# Nikolay Evidence Update: 2026-09-04

Status: source-backed planning update; no implementation acceptance

This review supplements the historical 29 July and 18 August reviews. Source:
`C:/Users/Администратор/Downloads/Telegram Desktop/ChatExport_2026-09-04`.
The previous recorded boundary was message 11705. Earlier omissions and later
messages are distinguished below. Message statements are author reports, not
independent verification of the implementation or performance.

## Evidence and planning consequences

| Date / exact source within export | Evidence | Consequence for Orchestrator planning |
|---|---|---|
| 14 June, `messages4.html`, messages 3907-3912 | A wave is a task batch, e.g. CFA.39 with 01, 02, 03 inside. Nikolay estimates only 3-5% of tasks parallelize and 95% of waves block. | Distinguish wave/task identity; concurrency requires dependency evidence, not a throughput target copied from his estimates. |
| 8 July, `messages7.html`, message 7783 | More than 5-6 subagents is rare because of work availability and budget. | Bound useful concurrency by independent work and execution budgets. |
| 26 July, `messages9.html`, messages 9548-9552 | Gates, branching and controlled evaluation are preferred to repeated loops. | Preserve explicit exit, retry and budget limits; do not add open-ended retry loops. |
| 18 August, `messages11.html`, messages 11733-11743 | One feature is one task; a CRUD directory includes tests and testing. A separate agent checks DoD; checks occur at several stages. | Keep implementation and its correctness checks together; distinguish independent review from implementation evidence. |
| 24 August, `messages12.html`, messages 12270, 12309, 12321, 12328 | Executor follows a spec; planner does not supply code snippets. Research covers code, architecture and alternatives. Reported planning produces 20-30 tasks. | Finish bounded investigation before authoring executable tasks; do not turn the reported batch size into a queue minimum. |
| 31 August, `messages12.html`, messages 12900, 12938, 12949-12952, 12961 | Specs and testing are done together with the human in batches; tasks follow finalized architecture research and symbol-level specs. There are stage-specific checklists. | Record unresolved decisions, exact impact and acceptance evidence before dispatch. Preserve human acceptance when the task calls for it. |
| 2 September, `messages12.html`, message 13302 | Branch per wave, task branches from it; waves and tasks may each execute concurrently. | Evaluate this topology separately against existing Phase 3 isolation and merge contracts; branch topology alone does not establish safe concurrency. |
| 2 September, `messages12.html`, message 13303; `messages13.html`, messages 13307, 13312 | Live project search, linked projects, explicit knowledge owners and one shared harness. | Phase 13 must resolve source ownership and project joins before aggregation; search results remain discovery evidence. |
| 2 September, `messages13.html`, messages 13330-13347 | CLI serves tasks, defects, gaps and layered docs; agent uses its manual; separate UI gets data through CLI. Tools and call metrics are per agent; migration away from MCP is gradual. | Review a shared service boundary for CLI/UI/agent adapters; preserve existing authority and capability gates, without mandating a transport migration. |
| 3 September, `messages13.html`, message 13434 | Native provider CLIs or compatible API through OpenRouter; YAML configuration and one-command switching. | Reuse Phase 5 route/configuration lineage; no new provider authority follows from this claim. |

## Inspected screenshots

- `photos/photo_854@02-09-2026_16-54-14.jpg`: project selector includes
  multiple rows labelled CFA with different names. A display abbreviation is
  not sufficient as a unique project join key.
- `photos/photo_855@02-09-2026_17-17-14.jpg`: command builder displays daemon,
  bucket, wave, PVI, doctor/heal and ticket commands. This proves visible
  command vocabulary, not successful execution or the complete state machine.
- `photos/photo_826@31-08-2026_18-18-07.jpg`: an agent transcript distinguishes
  a by-design finding from a defect, and corrects a scout count from 20 to 230.
  These are visible assertions, not independently verified counts. Plan
  fixtures should distinguish rejected findings from completed fixes.

Video attachments were not reviewed in this update.

## Maturity and remaining unknowns

Message 12986 in `messages12.html` is explicitly a pasted agent verdict, not
independent proof of an incubator, reproducible agent evolution or a judge.
In message 13012 on 31 August Nikolay says evolutionary agents are not yet
working. Messages 13286-13287 on 2 September express hope of launching a first
simple agent and obtaining metrics. This is planned/experimental capability;
successful launch and measured improvement are not established here.

The task-size example and branch hierarchy now have direct written evidence.
Canonical storage, worktree mechanics, complete state machines, merge/rebase
rules, exact regression selection, roadmap denominators, gap lifecycle and
quantitative quality claims remain unresolved. Historical reviews retain their
original as-of-date unknowns; this update supersedes only the current summary.
