# AGENTS.md

This repository is a fork of [ayangweb/BongoCat](https://github.com/ayangweb/BongoCat) (a Tauri 2 + Vue 3 desktop pet). On top of it we extend todo list and other modules in a **plugin-based** way while continuously receiving upstream updates.

## Upstream sync conventions

- `upstream` → `ayangweb/BongoCat` (fetch-only, for merging updates)
- `origin` → `ChHsiching/bongocat-todo` (day-to-day push/pull)
- Merge upstream: `git fetch upstream && git merge upstream/master`
- Keep this repo's new code concentrated in standalone directories (`src/plugins/<module>/`, `src/pages/<module>/`); keep changes to upstream files minimal and concentrated (see `docs/adr/0001-plugin-architecture-for-todo.md`).

## Branch strategy

**Module-level long-lived branches** (decided 2026-07-28; solo fork + continuous upstream tracking):

- `master` —— **mirrors upstream**, updated only via `git merge upstream/master`, **no direct development**. It stays cleanly syncable with upstream at all times.
- `<module>` (e.g. `todo`) —— **module-level long-lived branch** carrying every ticket of that module from start to finish (e.g. the `todo` branch holds T1-T5 + the Phase 2 radial-menu UI upgrade, since the radial menu replaced the todo menu's presentation and is tightly coupled to it). Day-to-day development commits directly on this branch.
- Future modules (standalone features such as Android sync) each get their own `<module>` branch; don't pile them into `todo`.
- Consider merging back to `master` (the integration point) only after a whole module is finished.
- **Upstream sync**: on `master` run `git fetch upstream && git merge upstream/master`, then switch to the module branch and `git merge master` to bring the upstream updates in (resolve conflicts on the module branch; `master` stays clean).
- Solo development — no ticket-level feature branches; roll back with `git revert <commit>` (commit messages carrying `Closes #N` keep things traceable).

## Versioning policy

- **The fork's version number is independent of upstream**: this repo's version does not follow upstream ayangweb/BongoCat's `1.x.x`; it tracks the fork's own feature milestones.
- **Single source of truth**: `package.json`'s `version` is the only authority; `src-tauri/tauri.conf.json`'s `version` field is `"../package.json"` (a reference), so editing one place is enough.
- **When merging upstream**: the `version` line in `package.json` will conflict (upstream may bump it) — **keep the fork's version**; don't follow upstream.
- **Minor bumps map to feature milestones**: `1.2.0` = Phase 1 todo module complete; later major features (radial-menu UI, Android sync) each get their own minor bump. Patch is for bugfixes.
- **Release**: `pnpm release` (`.release-it.ts` tags `v${version}`); pushing the tag triggers the multi-platform build in `release.yml`.



## Runtime data location

Persisted store files live at `%APPDATA%/<identifier>/tauri-plugin-pinia/*.json` (Windows) — the identifier comes from `src-tauri/tauri.conf.json` and the directory moves with it. When debugging persistence, read the directory matching the CURRENT identifier, not a remembered path. QA note: `*.dev.json` files are written in dev builds.

## Agent skills

### Issue tracker

Issues are managed via GitHub Issues (repo `ChHsiching/bongocat-todo`) with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five labels: `needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at the repo root + `docs/adr/`. See `docs/agents/domain.md`.

---

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Language conventions

- Code comments, commit messages, and docs are in English (aligned with upstream ayangweb/BongoCat).
- UI strings go through i18n locales (src/locales/*.json); locale values stay in their own language.
