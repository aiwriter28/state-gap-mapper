# State Gap Mapper continuation guide

## Start here

The application lives at the repository root on `main`: `src/`, `lib/`, `api/`, and `tests/`. There
is no separate implementation checkout.

Before changing behavior, read in order:

1. `CONTEXT.md` for the product vocabulary and invariants.
2. `docs/adr/` for the decisions that constrain the state model, gap engine, and Evidence.
3. `DESIGN_DECISIONS.md` and `DESIGN.md` for the binding visual and interaction system.
4. `git status --short --branch` and recent commits before editing.

Verify with `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build`.

## Current status

Shipped. The application is live and production-verified at
`https://state-gap-mapper-build.vercel.app`, and the source is public at
`https://github.com/aiwriter28/state-gap-mapper`.

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
