# AGENTS.md

本仓库是 [ayangweb/BongoCat](https://github.com/ayangweb/BongoCat)（Tauri 2 + Vue 3 桌面宠物）的 fork，在此基础上以**插件化方式**扩展 todo list 等模块，并持续接收上游更新。

## 上游同步约定

- `upstream` → `ayangweb/BongoCat`（只 fetch，用于合并更新）
- `origin` → `ChHsiching/bongocat-todo`（日常 push/pull）
- 合并上游：`git fetch upstream && git merge upstream/master`
- 本仓库的新增代码尽量集中在独立目录（`src/plugins/<module>/`、`src/pages/<module>/`），对上游文件的改动保持最小且集中（详见 `docs/adr/0001-plugin-architecture-for-todo.md`）。

## 分支策略

**模块级长期分支**（2026-07-28 定，单人 fork + 持续接收上游）：

- `master` —— **镜像上游**，只通过 `git merge upstream/master` 更新，**不直接开发**。保持随时能干净同步上游。
- `<module>`（如 `todo`）—— **模块级长期分支**，承载该模块从始至终的所有 ticket（如 `todo` 分支含 T1-T5 + Phase 2 轮盘 UI 升级，因轮盘替换 todo 菜单呈现、强耦合）。日常开发在此分支上直接 commit。
- 未来新模块（Android 同步等独立功能）各自开 `<module>` 分支，不堆进 `todo`。
- 整个模块完成后再考虑 merge 回 `master`（整合点）。
- **上游同步**：在 `master` 上 `git fetch upstream && git merge upstream/master`，再切到模块分支 `git merge master` 把上游更新带进来（冲突在模块分支解，master 始终干净）。
- 单人开发，不需要 ticket 级 feature 分支；回滚靠 `git revert <commit>`（commit message 带 `Closes #N` 可追溯）。

## Agent skills

### Issue tracker

Issues 通过 GitHub Issues 管理（仓库 `ChHsiching/bongocat-todo`），使用 `gh` CLI。详见 `docs/agents/issue-tracker.md`。

### Triage labels

使用默认五标签：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`。详见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文（single-context）：根目录一个 `CONTEXT.md` + `docs/adr/`。详见 `docs/agents/domain.md`。

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
