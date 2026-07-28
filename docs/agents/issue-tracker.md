# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues in **`ChHsiching/bongocat-todo`** (the `origin` remote). Use the `gh` CLI for all operations, always with `--repo ChHsiching/bongocat-todo` to avoid ambiguity with the `upstream` remote (`ayangweb/BongoCat`).

> 本仓库是 fork：**只在 origin (`ChHsiching/bongocat-todo`) 建 issue**，绝不往 upstream 建。feature request / bug report 都指本 fork 自己的 backlog。

## Conventions

- **Create an issue**: `gh issue create --repo ChHsiching/bongocat-todo --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --repo ChHsiching/bongocat-todo --comments`.
- **List issues**: `gh issue list --repo ChHsiching/bongocat-todo --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --repo ChHsiching/bongocat-todo --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --repo ChHsiching/bongocat-todo --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --repo ChHsiching/bongocat-todo --comment "..."`

`gh` infers the repo from the sole GitHub push remote when run inside a clone, but本仓库同时配置了 upstream，所以**始终显式带 `--repo`**，不要依赖自动推断。

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

Create a GitHub issue in `ChHsiching/bongocat-todo`.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --repo ChHsiching/bongocat-todo --comments`.
