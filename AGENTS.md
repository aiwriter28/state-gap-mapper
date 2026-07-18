# State Gap Mapper continuation guide

## Start here

This repository has two intentional checkouts. Do not infer implementation state from the root
checkout alone.

| Checkout | Branch | Purpose |
| --- | --- | --- |
| `/Users/eric/State Gap Mapper` | `main` | Binding product, design, ADR, and planning artifacts |
| `/Users/eric/State Gap Mapper/.worktrees/state-gap-mapper-build` | `feature/state-gap-mapper-build` | Production application and tests |

For implementation work, change into the implementation worktree first. Then read, in order:

1. `.superpowers/sdd/progress.md` for the canonical completion state and commit ranges.
2. `docs/plans/2026-07-18-state-gap-mapper.md` for the next task contract.
3. `CONTEXT.md`, `DESIGN_DECISIONS.md`, `DESIGN.md`, and `docs/adr/` before changing behavior.
4. `git status --short --branch` and recent commits before editing.

The checklist in the implementation plan can lag actual execution. The progress file is the
authoritative resume point. After completing or reviewing a task, update the progress file in the
same branch before handing off.

## Current snapshot

Last updated on 2026-07-18: Tasks 1 through 10 are complete and review-clean on
`feature/state-gap-mapper-build`; Task 11 is the next implementation task. Always confirm this
against `.superpowers/sdd/progress.md` because the snapshot can become stale.
