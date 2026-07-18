# Repository Instructions

Follow the project contracts in `CONTEXT.md`, `DESIGN_DECISIONS.md`, `DESIGN.md`, and `docs/adr/` before changing behavior.

## Continuation protocol

This is the production implementation worktree on `feature/state-gap-mapper-build`. The parent
checkout at `/Users/eric/State Gap Mapper` contains the design baseline and should not be mistaken
for the application checkout.

Before continuing implementation:

1. Read `.superpowers/sdd/progress.md`. It is the canonical completion and review record.
2. Read the next task in `docs/plans/2026-07-18-state-gap-mapper.md`.
3. Inspect `git status --short --branch` and recent commits.
4. Preserve a clean task boundary: test first where the plan requires it, run the full quality
   gate, commit the task, and update `.superpowers/sdd/progress.md` before handoff.

The plan checklist can lag the implementation. Resume from the progress file, not from unchecked
boxes in the plan. Last reconstructed on 2026-07-18: Tasks 1 through 9 are complete and
review-clean; Task 10 is next. Confirm the progress file because this snapshot can become stale.

## Agent skills

### Issue tracker

Engineering issues live in this repository's GitHub Issues; external pull requests are not a triage request surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five standard triage labels without repository-specific aliases. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository with `CONTEXT.md` and root-level ADRs. See `docs/agents/domain.md`.
