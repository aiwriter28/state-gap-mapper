# Issue tracker: GitHub

Issues and durable engineering work for this repository live as GitHub issues. Use the `gh` CLI and infer the repository from `git remote -v`.

## Conventions

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open`
- Comment: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "..."`
- Close: `gh issue close <number> --comment "..."`

## Pull requests as a triage surface

PRs as a request surface: no. External pull requests are not processed as feature-request issues by the triage workflow.

## Skill mappings

- Publish to the issue tracker: create a GitHub issue.
- Fetch the relevant ticket: run `gh issue view <number> --comments`.
- Wayfinder maps and children: use a parent GitHub issue and linked sub-issues, with native issue dependencies where available.
