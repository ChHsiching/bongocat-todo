# ADR 0001: Plugin Architecture for Todo

- **Status**: Accepted
- **Date**: 2026-07-28
- **Decision driver**: @ChHsiching
- **Supersedes**: —

## Context

This fork adds a todo list module to BongoCat (Tauri 2 + Vue 3 desktop pet) in a **plugin-based** way, under two hard constraints:

1. **Continuously receive upstream updates** — changes to upstream files must be minimal and concentrated, or `git merge upstream/master` conflicts spiral out of control.
2. **todo is a long-term flagship feature** — more modules will follow (radial UI, Android sync, etc.), so the architecture must be extensible.

Earlier grilling (see `CONTEXT.md`) confirmed the Phase 1 scope: menu/plugin architecture + local todo MVP (no sync). This ADR records all Phase 1 architecture decisions, tradeoffs, and the intrusion bill.

## Decision

### D1. Plugins attach UI via the shared store menu bus (posture D)

**Decision**: add a pinia store (`menuBus`) as the menu data bus. At startup each plugin registers menu-item **descriptor data** (`{ id, label, icon, action }`) into it; `useAppMenu.getBaseMenu()` spreads that data at the end.

**Rationale**:
- Plugins are self-contained — todo registers itself in `src/plugins/todo/` and touches no upstream files.
- Menu data is decoupled from UI — the native menu, tray menu, and a Phase 2 radial menu **all consume the same data**; register once, consume everywhere.
- A single, tiny intrusion — only ~3 lines in `useAppMenu.ts`.

**Rejected alternatives**:
- Central registry + `definePlugin()`: introduces a new abstraction and 3 surgeries on upstream, violating "minimal and concentrated".
- Monkey-patching: nominally zero intrusion but actually hides the intrusion in runtime and conflicts with upstream behavior, violating Surgical Changes.
- Hard-wiring: todo edits `useAppMenu`/`WINDOW_LABEL`/router, the next module copy-pastes, violating the AGENTS.md plugin principle.

### D2. The todo panel is a standalone companion window

**Decision**: add `WINDOW_LABEL.TODO`, configure a window in `tauri.conf.json` copying main's `decorations:false / skipTaskbar:true / alwaysOnTop:true`, but `transparent:false` (the list must be visible).

**Rationale**:
- Cleanest semantics — todo is a standalone feature, not a setting, and shouldn't be crammed into a preference tab.
- The "quick add" mini input window can reuse the same `WINDOW_LABEL.TODO` (different size).
- The main window's transparency/pass-through logic (`main/index.vue`) is **untouched, not a single line** — it's the highest-risk file.

**Rejected alternatives**:
- A tab inside preference: semantic mismatch (todo isn't a setting) and can't host quick add.
- An in-main overlay component: requires editing `main/index.vue` (upstream core file), and rendering opaque UI in a transparent window fights the `setIgnoreCursorEvents` logic.

### D3. ~~Panel follow via tuck-and-pop~~ — ❌ SUPERSEDED (replaced by simple fade in/out)

> **Status change (2026-07-29)**: this decision was rejected and superseded by the user. After implementation the tuck-and-pop proposal produced 3 regressions (panel vanishing on right-click of the cat / panel positioned off-screen / native scrollbars appearing in the transparent window), the debugging cost was high, and the user rejected it explicitly ("I don't want this animation anymore, just the plainest, simplest fade in/out"). **Actual implementation = simple fade in/out (opacity 200ms ease) + anchored-to-the-cat positioning**; see "D3-actual" below.
>
> The original decision text is preserved below for historical traceability; **do not propose restoring tuck-and-pop**.

**Original decision (deprecated)**: on open the panel positions to the pet's right (edge detection flips sides automatically). While the pet is dragged, the panel plays a "tuck" animation (CSS transform collapsing into the pet's position + fade out); when dragging ends (`tauri://move` stops firing) it reads main's new position and "pops" out to it (spring animation + fade in).

**Original rationale (no longer applicable)**:
- **Perfectly matches Tauri's dragging constraints** — during `startDragging()` the frontend can't get real-time position, so hide it, sidestepping real-time-follow flicker/jank.
- The "pop" spring animation fits BongoCat's cute tone and could become a product signature.
- Minimal intrusion: 1 line in `main/index.vue:139` `handleMouseDown` emitting a drag-started notification.

**Original fallback**: if editing `main/index.vue` were unacceptable, the panel could listen to `tauri://move` itself to detect dragging at the cost of ~100ms latency. Kept as a backstop.

#### D3-actual. Simple fade in/out + anchored-to-the-cat positioning (actual implementation)

**Decision**: window animation uses an opacity transition (fade in on open, fade out on close, 200ms ease), with no drag following. The panel is positioned anchored to the cat (todo panel = centered above the cat; quick add = above-right of the cat), with edge clamp + edge flip.

**Rationale**:
- The user explicitly asked for "the plainest, simplest fade in/out"; tuck-and-pop was overcomplicated.
- `main/index.vue` stays untouched (the only reason original D3 had to touch this file is gone) — intrusion bill item #6 is now **completely untouched**.
- Anchored-to-the-cat positioning satisfies the "companion window" semantics without a complex drag-following state machine.

### D4. Storage reuses pinia persistence

**Decision**: `src/plugins/todo/stores/todo.ts` uses `defineStore('todo', ...)`; `@tauri-store/pinia`'s `saveOnChange: true` persists JSON automatically. Fully isomorphic with upstream stores like `cat`/`general`.

**Rationale**:
- Zero new dependencies, zero new permissions, zero persistence code — exactly like upstream.
- JSON is the most portable intermediate form, giving the most flexibility when Phase 2 adds sync.

**Rejected alternatives**:
- Tauri SQLite: over-engineering for "possible sync", violating Simplicity First; fragments the data layer across modules.
- Manual JSON files: reinventing the wheel, losing reactivity, 10x the code.

### D5. The todo data structure carries Phase 2 sync-reserved fields

**Decision**:

```ts
interface Todo {
  id: string
  title: string
  completed: boolean
  priority: 'low' | 'medium' | 'high'
  dueDate?: number
  // Reserved for Phase 2 sync (auto-assigned by CRUD, not exposed in UI)
  createdAt: number
  updatedAt: number
  deviceId: string
  deletedAt?: number      // soft delete
}
```

**Rationale**:
- Phase 2 sync is a **confirmed requirement** (not speculative); the reservation cost (4 fields + ~20 lines of auto-assignment) is far below the future migration cost (backfill logic + soft-delete retrofit + delete-resurrection handling + tests).
- Soft delete is a physical necessity for any multi-device sync — deleting on device A while device B is unaware resurrects the data.

### D6. Date reminders use the notification plugin

**Decision**: introduce `@tauri-apps/plugin-notification` and add `notification:default` to the capability. Check for due items at app startup + `setInterval` polling every minute.

**Rationale**: in Q4b the user explicitly asked to keep date reminders.

### D7. ~~Phase 1 native Menu, Phase 2 radial upgrade~~ — ❌ REJECTED (radial menu cancelled)

> **Status change (2026-07-30)**: the radial menu proposal was rejected by the user. The native context menu (`menu.popup()`) stays; no radial UI replacement. The original decision text is preserved below for traceability.

**Original decision (deprecated)**: Phase 1 keeps `menu.popup()` at `main/index.vue:142` (Tauri native menu); posture D's store feeds the todo item into it. The radial menu was explicitly listed as a Phase 2 UI upgrade — a `RadialMenu.vue` component would later replace `menu.popup()` with zero plugin-data changes.

**Original rationale (no longer applicable)**: the radial menu was an experience bonus, not a feature; posture D's store-based design made it a purely additive upgrade with almost zero cost to defer.

## Intrusion bill (8 points at planning → updated after T1-T5)

### At planning (spec-stage estimate, 8 points)

| # | File | Change | Nature |
|---|------|------|------|
| 1 | `src/composables/useAppMenu.ts` | Spread plugin menu items at the end (~3 lines) | Additive |
| 2 | `src/constants/index.ts` | `WINDOW_LABEL.TODO = 'todo'` (1 line) | Added enum value |
| 3 | `src/router/index.ts` | `/todo` route (~4 lines) | Added route |
| 4 | `src-tauri/tauri.conf.json` | Window config appended to the `app.windows` array | Added array item |
| 5 | `src-tauri/capabilities/default.json` | `notification:default` permission | Added permission |
| 6 | ~~`src/pages/main/index.vue:139`~~ | ~~1-line emit in `handleMouseDown`~~ | **Completely untouched (cancelled after D3 was superseded)** |
| 7 | `package.json` | `@tauri-apps/plugin-notification` | Added dependency |
| 8 | `src/locales/*` × 5 languages | todo-related i18n keys | Added keys |

### Actual (corrections after T1-T5 implementation, written back 2026-07-29)

The planning bill **underestimated/deviated in 4 places**; actual touch points went both up and down but all remained additive:

**Touch point #6 cancelled (D3 superseded)**:
- Original D3 needed `main/index.vue:139` edited to emit drag-start notifications. After D3 was rejected in favor of fade in/out, **`main/index.vue` is completely untouched** — this was the only place all of Phase 1 could have touched a core file, and now it doesn't.

**Missed touch points (found in T4)**:
- **`src-tauri/Cargo.toml`** + **`src-tauri/src/lib.rs`** — a Tauri 2 plugin requires Rust-side edits too (`tauri-plugin-notification = "2"` + `.plugin(tauri_plugin_notification::init())`), not just the frontend npm package + capability. This is a Tauri 2 (vs Tauri 1) architectural change missed at planning due to Tauri 1 experience.

**`App.vue` intrusion exceeded expectations (3 cumulative spots across T1/T4/T5)**:
- Planning counted `App.vue` as "completely untouched"; in practice 3 spots were edited cumulatively (all additive):
  - T1: store instantiation moved to the top of setup + calling `setupTodoPlugin({ stores, t })` (fixing the code:26 bug)
  - T4: passing `windowLabel: appWindow.label` (multi-window gating to avoid triple-firing notifications across three windows)
  - T5: adding `reminderStore` instantiation + parameter passing
- **Lesson**: as the "central initialization point", `App.vue` gains one more intrusion per added plugin. Module-level long-lived branches can absorb this (conflicts resolved together at merge), but planning must not count it as "zero intrusion".

**New LISTEN_KEYs (found in T5)**:
- Besides `WINDOW_LABEL.TODO`, `src/constants/index.ts` also gained `LISTEN_KEY.SHOW_TODO_FULL` / `LISTEN_KEY.SHOW_TODO_MINI` (dedicated events for mini-window/main-panel switching).

## Explicitly deferred to Phase 2

- ~~Radial menu UI (`RadialMenu.vue` replacing `menu.popup()`)~~ — ❌ cancelled (user rejected, D7 rejected)
- ~~Panel dragging + position memory~~ — ✅ done (the panel supports `data-tauri-drag-region` dragging + automatic anchored-to-the-cat positioning)
- Android client + LAN pairing + sync protocol
- Sync conflict resolution (depends on the 4 fields reserved in D5)

## Consequences

- **Positive**: plugins are highly self-contained — the whole todo module lives in `src/plugins/todo/`; upstream merge conflicts are tiny and predictable (concentrated at append points). After D3 was superseded, `main/index.vue` is completely untouched — zero intrusion into the most sensitive core file.
- **Negative**: the menu bus store is a new convention future modules must follow; a radial UI upgrade would touch `main/index.vue:142` (a cost deferred to Phase 2). As the central initialization point, `App.vue` gains one more additive intrusion per plugin (3 cumulative through T1-T5); watch it when merging upstream.
- **Risk**: panel positioning uses `availableMonitors` + a one-shot setPosition; coordinates may be tricky under multi-monitor/Retina scaling. Phase 1 ships "anchored to the cat on open"; precise following is left to Phase 2.
