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

Last updated on 2026-07-18: Tasks 1 through 13 are complete. The implementation is integrated into
`main`, deployed at `https://state-gap-mapper-build.vercel.app`, live-verified, and published to the
public GitHub repository. Task 14, the README, demo video, Devpost package, and final submission,
is next. Always confirm this against `.superpowers/sdd/progress.md` because the snapshot can become
stale.
## Claude compatibility

`CLAUDE.md` is a symlink to this file. Edit `AGENTS.md` only; the symlink keeps Claude and Codex on
the same continuation instructions. References to "claw.md" in conversation mean `CLAUDE.md`.

## Agent skills

### Issue tracker

Engineering issues live in this repository's GitHub Issues; external pull requests are not a triage request surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five standard triage labels without repository-specific aliases. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository with `CONTEXT.md` and root-level ADRs. See `docs/agents/domain.md`.
