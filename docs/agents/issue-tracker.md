# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues in **`ChHsiching/bongocat-todo`** (the `origin` remote). Use the `gh` CLI for all operations, always with `--repo ChHsiching/bongocat-todo` to avoid ambiguity with the `upstream` remote (`ayangweb/BongoCat`).

> This repository is a fork: **create issues only on origin (`ChHsiching/bongocat-todo`)**, never on upstream. Feature requests / bug reports all go to this fork's own backlog.

## Conventions

- **Create an issue**: `gh issue create --repo ChHsiching/bongocat-todo --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --repo ChHsiching/bongocat-todo --comments`.
- **List issues**: `gh issue list --repo ChHsiching/bongocat-todo --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --repo ChHsiching/bongocat-todo --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --repo ChHsiching/bongocat-todo --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --repo ChHsiching/bongocat-todo --comment "..."`

`gh` infers the repo from the sole GitHub push remote when run inside a clone, but this repo also has `upstream` configured, so **always pass `--repo` explicitly**; don't rely on auto-inference.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

Create a GitHub issue in `ChHsiching/bongocat-todo`.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --repo ChHsiching/bongocat-todo --comments`.
