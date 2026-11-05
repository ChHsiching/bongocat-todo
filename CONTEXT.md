# CONTEXT.md

This file is the single-context glossary and decision snapshot for the `bongocat-todo` fork. Any agent should read this plus `docs/adr/` before starting work.

## Repository positioning

- This repository is a fork of [ayangweb/BongoCat](https://github.com/ayangweb/BongoCat) (a Tauri 2 + Vue 3 desktop pet).
- The fork's core extension goal: add todo list and other modules in a **plugin-based** way while continuously receiving upstream updates.
- Sync conventions live in `AGENTS.md`; architecture decisions in `docs/adr/`.

## Distribution channels (fork-specific, independent of upstream)

| Platform | Channel | Package name | Status |
|------|------|------|------|
| **macOS** | Homebrew Cask | `ChHsiching/tap/bongo-cat-todo` | Planned |
| **Arch/Manjaro** | AUR | `bongo-cat-todo-bin` | Planned |
| **Windows** | GitHub Release (exe) | — | ✅ Available |
| **Debian/Ubuntu/Mint** | GitHub Release (deb) | — | ✅ Available (install via `dpkg -i`) |
| **Fedora/RHEL** | GitHub Release (rpm) | — | ✅ Available (install via `rpm -i`) |
| **Linux (generic)** | GitHub Release (AppImage) | — | ✅ Available |

- The fork's package names are `bongo-cat-todo` (Homebrew Cask) / `bongo-cat-todo-bin` (AUR), distinct from upstream's `bongo-cat`.
- Homebrew tap repository: `ChHsiching/homebrew-tap` (Casks/bongo-cat-todo.rb; a GUI app uses a Cask, not a Formula).
- release.yml auto-updates the Homebrew Cask + AUR PKGBUILD after each release (CI automation, to be implemented).
- No PPA/COPR for now (high maintenance cost; manual `.deb`/`.rpm` install is sufficient).

## Glossary (Ubiquitous Language)

| Term | Meaning |
|------|------|
| **Upstream** | `ayangweb/BongoCat`, fetch-only, used for merging |
| **Plugin** | Self-contained module added by this repo, located in `src/plugins/<name>/`, attached to the UI through a registration mechanism |
| **Menu bus** | A pinia store (`menuBus`); plugins register menu-item descriptor data into it, `useAppMenu` consumes it |
| **Companion window** | A standalone Tauri window anchored next to the desktop pet in the same style (e.g. the todo panel) |
| **Tuck-and-pop** | ~~Follow interaction for companion windows~~ **Deprecated** (superseded by ADR 0001 D3); the actual implementation uses simple fade in/out. Entry kept for historical traceability |
| **Phase 1** | Menu/plugin architecture + local todo MVP (no sync) |
| **Phase 2** | Mail notification center + desktop pet bubble notifications + dual delivery of todo reminders (see ADR 0002) |
| **Bubble** | Lightweight notification component pinned right above the desktop pet; **persists on screen** until the user dismisses/clicks it. At most 3 pending; the overflow folds into the mail list. Shared by mail and due todos |
| **Mail notifier** | Monitors each account's INBOX via IMAP IDLE and triggers bubbles on new mail arrival. Reads envelope metadata only (sender + subject), **zero write operations** on the mailbox, no body fetch; clicking jumps to webmail |
| **Mail list** | Standalone entry in the desktop pet's context menu; locally caches mail that has been bubble-notified (sender + subject). Purely local state (read/archived), never touching the mail server. Retention: auto-archive after 24 hours by default; on click, mark locally read + archive after 5 minutes |
| **Archived mail** | Standalone entry in the desktop pet's context menu (alongside the mail list); shows archived mail with a faded style; clicking still jumps to webmail |
| **Soft delete** | Deletion doesn't actually remove the record; a `deletedAt` timestamp is stamped for future sync |

## Upstream architecture facts (agents must know)

- **Two static routes**: `/` (Main desktop pet) and `/preference` (settings), defined in `src/router/index.ts`; one Vue app sharing pinia/i18n/stores.
- **Window labels are a static enum**: `WINDOW_LABEL` in `src/constants/index.ts`, with main/preference values.
- **Window config lives in `src-tauri/tauri.conf.json`**: main is a transparent, titlebar-less, always-on-top window; preference is a normal window.
- **Rust-side window logic**: `src-tauri/src/plugins/window/` is a custom Tauri plugin; `show_window` is generic (not label-bound), so new windows need no Rust changes.
- **Menu source**: `useAppMenu.ts` generates menu items → consumed by `handleContextmenu` in `main/index.vue:142` (right-click on the pet) and `useTray.ts` (tray).
- **Persistence**: every store lands as JSON automatically via `@tauri-store/pinia` (`main.ts:15` `saveOnChange: true`), zero extra code.
- **Dragging**: `main/index.vue:139` `appWindow.startDragging()` is Tauri native dragging; the frontend cannot get real-time position during a drag, only the `tauri://move` event after it ends.

## Phase 1 decision snapshot

See `docs/adr/0001-plugin-architecture-for-todo.md` for details. Key points:

- Plugins attach UI through the **shared store menu bus** (posture D); the only intrusion is a spread at the end of `useAppMenu.ts`.
- The todo panel is a **standalone companion window** `WINDOW_LABEL.TODO`, copying main's `decorations:false/skipTaskbar/alwaysOnTop` config.
- Follow interaction uses **simple fade in/out** (the original tuck-and-pop proposal was rejected; see ADR D3 superseded).
- Storage **reuses pinia persistence** (zero new dependencies); the data structure carries 4 Phase 2 sync-reserved fields.
- Date reminders use `@tauri-apps/plugin-notification` (new dependency + permission).
- 8 upstream touch points in total, **all additive**, no existing logic changed.

## Phase 2 decision snapshot

See `docs/adr/0002-phase2-mail-and-bubble.md` for details. Key points:

- **Scope**: mail notification center + desktop pet bubble notifications + mail list + dual delivery of todo reminders. ~~Radial menu~~ cancelled (D7 rejected); ~~Android sync~~ postponed to a separate repo (the D5 sync fields are not wasted).
- **Mail protocol**: generic IMAP IDLE long connections (Rust `async-imap` + tokio), covering Gmail/QQ/163 etc., using each provider's app-specific passwords to bypass OAuth review.
- **Credential security**: OS keyring (Rust `keyring` v4 `v1` feature); the pinia store **never holds passwords**; passwords go through `Entry::new(service, username)` with key=`bongocat-todo/mail/<accountId>`.
- **Connection lifecycle**: Rust backend tokio task, bound to the **app process** (not to windows; push works as long as the pet is running).
- **Multi-account**: tracer bullet with a single account first, multi-account immediately after; both are Phase 2 deliverables. The data structure is an array from day one.
- **Mail boundary (D5 superseded)**: upgraded from 'ephemeral notifier' to 'local notification center' — read envelope metadata only (sender + subject), **zero write operations** on the mailbox (read/archived are purely local states, never touching the server), no body fetch, click jumps to webmail. Local notification history is **allowed**.
- **Mail list (D9)**: two standalone entries in the desktop pet's context menu (below todo/quick add) — 'Mail list' + 'Archived mail', each opening its own companion window. Locally caches mail that has been bubble-notified. Retention: auto-archive after 24 hours by default; on click, mark locally read + archive after 5 minutes. The archived-mail window can still jump to webmail.
- **Settings entry**: a new mail page in the preference window's sidebar (no new window/route intrusion).
- **Bubble notification (D7 revised)**: right above the desktop pet / **persists on screen, disappears when the user dismisses/clicks it** / at most 3 pending; the overflow folds into 'N more, view the mail list' / mail → webmail, todo → panel. Mail and todo share the bubble component.
- **Todo reminders**: dual delivery — system notification (D6 retained) + desktop pet bubble (purely additive); `plugin-notification` is not split.
- **Design mockups**: done **before** the spec (bubble UI + mail list + mail settings UI) as the spec's UI input; the backend (IMAP/keyring/connection management) relies on TDD and does not depend on mockups.

## Upstream code and visual conventions (from second-pass analysis; required reading for to-spec/implement)

### Styles and atomic utilities
- **UnoCSS config** (`uno.config.ts`): `presetWind3()` + `presetIcons()` + `presetAntd()` (from `@antdv-next/unocss`). todo components use wind3-style atomic utilities (`flex gap-2 text-sm` etc.); dark mode/spacing/radius automatically inherit the antd theme.
- **transformerVariantGroup**: supports variant-group syntax like `class="text-4 font-medium"` (see `pro-list/index.vue`).
- **transformerDirectives**: supports `--uno` variable directives.
- Variant modifiers like **`not-last:mb-4`** are available (see pro-list).

### ESLint rules (customized `@antfu/eslint-config`)
- **Imports must be sorted alphabetically ascending** (`perfectionist/sort-imports`, natural order).
- **One Vue attribute per line** (`vue/max-attributes-per-line: error`), **alphabetically ordered** (`vue/attributes-order` alphabetical).
- **1tbs brace style** (`style/brace-style`).
- **Unused imports are hard errors** (`unused-imports/no-unused-imports: error`).
- todo module code must follow these strictly or lint fails.

### Store conventions (pinia setup style + gradual migration)
- **Setup style** `defineStore('name', () => { ... })`, not options style.
- **Group fields with `reactive`** (e.g. `model`, `window`); scalars use `ref`.
- **Export an interface** declaring the shape (`export interface XxxStore`).
- **Migration pattern**: mark old fields `@deprecated`, put the new structure in `reactive`, do a one-shot migration in `init()`, use a `migrated` ref as the idempotence flag. If the todo store ever changes shape, follow this pattern.

### Component conventions
- **`defineProps<{ ... }>()`** typed props, not runtime declarations.
- **`<script setup lang="ts">`** is mandatory.
- **Prefer antdv-next components** (`Flex`, `List`, `Checkbox`, etc.); don't build basic components yourself.
- The **`data-tauri-drag-region`** attribute marks draggable regions (drag replacement for titlebar-less windows).
- Flat component directories: `src/components/<name>/index.vue` (see `pro-list`, `pro-list-item`, `shortcut`, `update-app`).

### i18n structure
- **5 JSON files**: `src/locales/{zh-CN,zh-TW,en-US,vi-VN,pt-BR}.json`.
- **Nested structure**: `pages.<page>.<section>.labels.<key>` or `composables.<name>.labels.<key>`.
- Suggested namespace for new todo keys: `plugins.todo.labels.<key>` (a new `plugins` namespace marking this repo's extensions).
- **vue-i18n composition mode** (`legacy: false`); use `const { t } = useI18n()`.
- antd's own locale is injected separately via `getAntdLocale()` (`App.vue` ConfigProvider); todo inherits it automatically when using antd components.

### antdv-next integration
- **`App.vue` already mounts ConfigProvider**, automatically handling dark mode (`generalStore.appearance.isDark`) and language.
- **HappyProvider** is mounted (happy-work-theme); buttons get the ripple effect.
- As a sub-route of the same app as preference/main, the todo panel **automatically inherits** these providers; no repeated setup.
- Dark mode: todo doesn't handle it itself — antd components + unocss `dark:` variants suffice.

### Rust-side window logic (second-pass confirmation)
- `show_window_by_label` in `src-tauri/src/plugins/window/src/commands/mod.rs` is **generic** — any label works as long as the window is declared in `tauri.conf.json`.
- `MAIN_WINDOW_LABEL`/`PREFERENCE_WINDOW_LABEL` are just Rust-side constants and **do not restrict** other labels. The todo window needs no Rust changes.

## ⚠️ Visual principles (non-negotiable)

**All UI added by this repo must match BongoCat's own visual style; do not default to antd visuals.**

### BongoCat's actual visual tone (based on README screenshot analysis)
- **The pet itself**: minimalist hand-drawn/stick style, uniform 2-3px lines, rounded edges, pure white body + light pink spots (around `#FFD1D1`), flat with no shadows, healing vibe.
- **Overall tone**: flat illustration + healing + lively + soft. Saturated yet soft colors, **not corporate calm blue**.
- **Icon strategy**: Solar for main visuals/navigation (flat, rounded, duotone, illustrative); Lucide for functional actions (thin lines, minimal). Primary navigation is Solar — that's the storefront.

### antd's actual role (to avoid repeat misunderstandings)
- In upstream, antdv-next is merely an **engineering choice** (avoiding hand-written form controls), **not a visual verdict**.
- The preference page settling for antd doesn't mean the todo panel should also stick to antd.
- The todo panel is a **companion feature of the pet**; its visuals should lean toward the pet itself, not toward antd forms.

### Repeatedly-made mistakes (beware)
1. Treating 'upstream imports antdv-next' as 'visuals must use antd' — **a code dependency is not a visual verdict**.
2. Inferring visuals from code without looking at screenshots — **for visual work, look at images first (README/screenshots), then read code**.
3. Treating 'antd is convenient' as 'antd is correct' — **convenient is not correct**.

### Conclusion
- The todo panel's visual goal: **look like the cat** — large radii (12-16px), warm/soft palette (pink/orange/off-white), simple lines, cute icons, soft texture.
- antd components are **only for functional interaction logic** (Checkbox state, DatePicker selection); **visual skin must be customized** to override defaults.
- This principle applies to every future UI module in this repo, not just todo.

## 🚨 Pitfall log (accumulated during T1-T5; required reading)

> These pitfalls were **repeatedly hit** during T1-T5 implementation; each cost debugging time. New agents must read this to avoid repeating them.

### Dark mode: explicitly rejected by the user (do not add it on your own)
- The mockup `panel.html` **has a light theme only**, no dark mode.
- T2's first version added an `html.dark` dark override unilaterally and was firmly rejected by the user ('The mockup has no dark theme either; don't act on your own initiative').
- **Fully removed**: no `html.dark` block in `handdrawn.css`, no `watch(isDark)` in `pages/todo/index.vue`.
- If dark mode is ever wanted, **confirm the visual direction with the user first**; do not add it unilaterally.

### Drag region data-tauri-drag-region (proven pattern; copy it, don't reinvent)
It took two hits (T2, T5) to get right. Correct pattern (`TodoPanel.panel-header` is the reference):
- **Put drag-region on the whole-row div** (not on child elements)
- Decorative children (paw/clock/spacer) use `pointer-events: none` so clicks pass through to the drag region
- input/button are naturally exempt (no extra handling needed)
- **Wrong**: setting `data-tauri-drag-region` on the whole container (list items unclickable / inputs unusable); or putting drag-region on a child (unreliable when an input sibling exists)

### Window show permission: use showWindow(label), not appWindow.show()
- `appWindow.show()` requires the `core:window:allow-show` permission, which the capability file doesn't grant.
- **Correct**: use `showWindow(WINDOW_LABEL.TODO)` (→ `App.vue` handler → Rust `show_window` command; the permission already exists).

### Native date input is unusable in WebView2
- `<input type="date">` in Windows WebView2 shows the placeholder as `yyyy/mm/day` (a locale-mismatch chimera), and the frontend cannot change the text.
- T5 ended up replacing it with **5 hand-written digit inputs** (year/month/day + hour:minute), no calendar popup, no antd DatePicker.
- antd DatePicker also has issues: popup overflow from the mini window + corporate-blue skin hard to override + width collapse making it invisible.
- **Conclusion**: for the mini window, don't use native date input or antd DatePicker; use hand-written inputs.

### Locale files: append new keys at the end; don't re-sort alphabetically
- Re-sorting labels alphabetically with a script (python json.dump) creates deletion noise and destroys upstream's functional grouping order.
- **Correct**: **append** new keys **at the end**, preserving existing order. Diffs stay clean when merging upstream.

### Pre-commit hook bypass (known engineering debt)
- Upstream's `package.json` has an overly broad `lint-staged: { "*": "eslint --fix" }`; it emits `File ignored` warnings for `Cargo.lock`/`pnpm-lock.yaml`/`Cargo.toml`/`lib.rs`, and lint-staged treats warnings as failures, aborting the commit.
- **Bypass**: commit with `SKIP_SIMPLE_GIT_HOOKS=1 git commit ...`.

### Pinia stores must be instantiated at the top of setup (breaks across async boundaries)
- T1 pitfall: `setupTodoPlugin()` called `useXxxStore()` inside an `onMounted(async)` callback, raising `code:26 "Must be called at the top of a setup function"`.
- **Root cause**: Pinia's inject stops working across async boundaries.
- **Correct**: instantiate stores at the top of setup (same position as upstream stores); async operations (`$tauri.start()`) can stay in onMounted.

### Tauri window config: check for duplicate keys when editing
- T2 pitfall: when switching the todo window to `transparent: true`, the original `false` was added but the old one not removed; both keys coexisted, the latter overrode the former, and transparency never took effect.
- **Lesson**: when editing window config in `tauri.conf.json`, always verify no duplicate keys remain.

### Kill leftover WebView2 processes before restarting pnpm tauri dev
- When restarting `pnpm tauri dev`, leftover `msedgewebview2.exe` processes make the new exe exit immediately (exit code -1, no Rust panic log).
- **Fix**: run `taskkill //F //IM msedgewebview2.exe` before restarting (a Windows Tauri/WebView2 environment issue, not a code issue).

### git reset can lose doc write-back commits (single-context lesson)
- In the T3 session, `git reset --hard 5aaa70a` while redoing the animation also lost the previous round's doc write-back commits (CONTEXT.md pitfall list + ADR intrusion-bill updates).
- **Lesson**: before resetting, check whether non-functional commits (docs/config) exist after the reset point; merge doc write-backs into a stable baseline ASAP instead of leaving them dangling at the tip of a feature branch where a reset can wipe them.

### Vue multi-arg emit cannot be unpacked via `$event[0]/$event[1]` (real bug caught in T6 code review)
- **Wrong**: `@change-priority="emit('changePriority', $event[0], $event[1])"`
- **Why**: the Vue 3.5+ compiler treats `emit(...)` as an inline statement and compiles the handler into a **single-argument** arrow `$event => ...`; `$event` binds only the **first** emit argument (the id string), so `$event[0]/$event[1]` index into string characters → clicking the ink dot to cycle priority silently breaks (updateTodo can't find the id).
- **Correct**: `@change-priority="(id, priority) => emit('changePriority', id, priority)"` (named arrow, multiple parameters declared explicitly)
- **Lesson**: always forward multi-arg emits with a named arrow; never use `$event` array indexing.

### Reliable workaround for eslint --fix segfaults on Windows
- `pnpm lint` / `npx eslint` occasionally segfault on Windows with large directory trees (exit 0xC0000005).
- **Reliable workaround**: `node --max-old-space-size=4096 ./node_modules/eslint/bin/eslint.js <path>` (no `--fix`; edit manually).
- More stable than `npx eslint <file>` (npx itself also crashes).

### Upstream release.yml's Node version is outdated (fixed in T-CI; do not revert)
- **Problem**: upstream `release.yml` uses `setup-node@v4` + `node-version: 20`. GitHub runners now default to Node 24, crashing `pnpm install` (`ERR_UNKNOWN_BUILTIN_MODULE`). **This is an upstream workflow bug — upstream itself cannot pass it right now**.
- **Fix** (`ee93b40`): `setup-node@v4→@v5`, `node 20→24`, 6 replacements total, structure unchanged.
- **Do not revert**: future upstream merges will conflict on these lines — **keep ours per the versioning policy** (upstream's is broken too).

### No direct development on master; every commit goes through a branch + no-ff merge (repeatedly hit!)
- **Happened twice**: the T-CI session and the Phase 1 wrap-up both committed directly on master (violating the AGENTS.md branch strategy).
- **Lesson**: for **any** commit — even a one-parameter or one-line doc change — first `git checkout -b <branch>`, commit on the branch, then `git checkout master && git merge --no-ff <branch>`.
- **Fixing pushed violations is costly** (requires force-pushing origin back). Before committing, check `git branch --show-current`; if it's master, **stop and create a branch first**.

### Changing the identifier moves the tauri-store data directory (data-"loss" illusion)
- tauri-store/pinia's persistence path is based on the app identifier (`identifier` in `tauri.conf.json`).
- After T-CI changed the identifier from `com.ayangweb.BongoCat` to `com.chhsiching.bongocat-todo`, the storage directory moved from `%APPDATA%/com.ayangweb.BongoCat/` to `%APPDATA%/com.chhsiching.bongocat-todo/`.
- **Symptom**: persistence data written manually into the old directory isn't read (empty panel), because the app actually reads the new directory.
- **Diagnosis**: after an identifier change, look for data files in the directory matching the **new identifier**, not the old upstream one.
- **Windows path**: `%APPDATA%/<identifier>/tauri-plugin-pinia/<store-id>.dev.json` (`.dev` suffix in dev mode).

### Phase 2 mail module pitfalls (T1 implementation; required reading)

> The 8 pitfalls below were each discovered only at debugging cost during T1 implementation; ADR 0002 D1/D2/D3 have recorded the corresponding decision updates.

#### native-tls/SChannel revocation checks break the TLS handshake → use rustls
- **Problem**: `tokio-native-tls` uses SChannel on Windows, which performs certificate revocation checks (OCSP/CRL) by default. On the user's network the revocation servers are unreachable → `CRYPT_E_REVOCATION_OFFLINE` → TLS handshake failure. curl (also SChannel-based) reproduces it.
- **Fix**: switch to `tokio-rustls` + `rustls` (no revocation checks) + `webpki-roots` (bundled Mozilla root CAs, not the system store).
- **Details**: the T1 correction section of ADR 0002 D1.

#### The rustls 0.23 crypto provider must be installed explicitly (or it deadlocks forever)
- **Pitfall**: rustls 0.23 requires a process-wide crypto provider on the first `ClientConfig::builder()` call. **Without it the process deadlocks permanently** — no panic, no timeout; even `tokio::time::timeout` cannot save it (stuck on an internal lock in provider initialization).
- **Fix**: in the plugin init setup, `rustls::crypto::ring::default_provider().install_default()`. Idempotent; ignore the Err returned by repeated calls.

#### async-imap IDLE `wait()` hangs under the Tauri runtime → `wait_with_timeout(10s)`
- **Pitfall**: `Handle::wait()` defaults to a 29-minute timeout, but under Tauri's tokio runtime it **never returns Timeout** (the timer future stays Pending forever). The `NewData` path works; the `Timeout` path is completely broken.
- **Fix**: use `handle.wait_with_timeout(Duration::from_secs(10))` in a short 10-second loop. The Timeout branch runs a fallback `fetch_new_envelopes` to catch mail missed in IDLE push gaps (QQ Mail's IDLE push is unreliable; the 10-second fallback keeps perceived latency bounded).
- **Details**: the T1 correction section of ADR 0002 D3.

#### The keyring v4 delete API is `delete_credential` (not `delete_password`)
- **Pitfall**: ADR 0002 D2 originally said `delete_password()`; the actual keyring v4 v1-feature API is `delete_credential()`. Writing the wrong one fails to compile.

#### Tauri 2 capability permissions must be explicitly allowed
- **Pitfall**: Tauri 2's permission model requires plugin commands to be explicitly allowed in `src-tauri/capabilities/default.json`. We missed it when creating the plugin, resulting in `mail_test_connection not allowed`.
- **Fix**: add `mail:allow-*` permissions to `capabilities/default.json`. **Always add capability permissions when creating a Tauri plugin**.

#### `@` must be literal-escaped in vue-i18n
- **Pitfall**: vue-i18n treats `@` in messages as linked-message syntax (`@:key`). `alice@gmail.com` in `addressPlaceholder` broke compilation, with `SyntaxError: Invalid linked format` at startup.
- **Fix**: change `@` to `{'@'}` in locale files.

#### TUN transparent proxies are unstable for port 993 → the app needs built-in HTTP CONNECT proxy support
- **Problem**: users in China need a proxy for overseas mailboxes (Gmail etc.). TUN transparent proxies forward port 993 unreliably (a known `stack: system` issue).
- **Fix**: built-in HTTP CONNECT proxy support (`async-http-proxy` crate) with a proxy input in the settings page. See ADR 0002 D10.

#### WebView2 console.log is not forwarded to Tauri stdout (T2 pitfall)
- **Problem**: Windows WebView2's `console.log` **never** appears in `pnpm tauri dev`'s Rust stdout. During frontend debugging it looks like logging is missing; WebView2 actually swallows it.
- **Fix**: for frontend debugging use `@tauri-apps/plugin-log`'s `info()` / `error()`; those are forwarded to the Tauri logging system and are visible.

#### Rust serde snake_case/camelCase mismatch is a silent bug (T2 fixed a T1 leftover)
- **Pitfall**: Rust struct fields default to snake_case (`account_id`) while frontend JS reads camelCase (`accountId`). If the struct lacks `#[serde(rename_all = "camelCase")]`, frontend `payload.accountId` gets **`undefined`** — **no error, no crash, silent failure**.
- **Fix**: add `#[serde(rename_all = "camelCase")]` to `NewMailPayload` / `ConnectionStatusPayload`.
- **Rule**: **every new Rust → frontend event payload struct must carry this attribute**.

#### Hard-coded SVG path coordinates are a layout bomb (T2 pitfall)
- **Pitfall**: the bubble SVG path in the `bubble.html` mockup has hard-coded coordinates (fixed height). When content grows taller, the bubble shape doesn't follow and text overflows outside. `preserveAspectRatio="none"` would force ugly stretching.
- **Fix**: added `genBubbleShape(textHeight)` in `bubbleShape.ts` to generate the path d dynamically from content height.
- **Rule**: **hand-drawn SVG shapes cannot use hard-coded coordinates**; the path must be generated dynamically from content size. The T5 mail list/archive panels are also hand-drawn; the same applies.

#### Not awaiting Tauri listen is a race-condition bomb (T5 pitfall)
- **Pitfall**: the 4 `listen()` calls in `setupMailPlugin` weren't awaited; Rust replayed `mail://new-mail` before the listeners finished registering, so offline-backfill mails were dropped. Regular IDLE pushes (10 seconds later) don't expose this; offline backfill emits 'immediately after connect', a much tighter window.
- **Fix**: await them all, ensuring registration completes before `mailConnect`.
- **Rule**: **Tauri `listen` is asynchronous (returns a Promise)**; whenever a scenario emits 'immediately after connect', await all listens before establishing the connection.

#### Adding new fields to a store requires data migration (T5 pitfall)
- **Pitfall**: T5 added `lastSeenUid` to the mailAccount store, but accounts created before T5 lack the field in their persisted JSON (`undefined`). In `setLastSeenUid`, `uid > undefined` is `false` (NaN comparison), so it never updates → offline backfill never triggers.
- **Fix**: `migrateLastSeenUid()` backfills `lastSeenUid: 0` for old accounts; `setLastSeenUid` falls back with `?? 0`.
- **Rule**: **when adding fields to an existing persisted store, write a migrate function to backfill defaults for old data**; otherwise undefined silently evaluates false in comparisons.

#### Closure leak of `m` in `monitors.find(m => ...)` (T5 pitfall)
- **Pitfall**: in `mail-list/index.vue`'s clamp positioning code, the `monitors.find(m => ...)` parameter `m` was mistakenly referenced outside the find callback's scope → `ReferenceError`, crashing the whole listener callback so the mail-list window never opens. The archive window used the parameter name `monitor` and was unaffected.
- **Fix**: `m` → `monitor`.
- **Lesson**: ESLint cannot catch this 'find-callback parameter leaking across scopes'; only a runtime ReferenceError exposes it. **Use semantic names for find/filter callback parameters and never shadow outer variables**.

#### Inline double-confirmation needs a mandatory reaction dead zone (T5a pitfall)
- **Pitfall**: an inline double-confirmation (button morph, not a dialog) without a dead zone lets a fast double-click delete instantly — equivalent to no confirmation at all.
- **Fix**: after entering the confirm state there is a **700ms dead zone** first (button greyed out and disabled + `cursor: not-allowed` + clicks ignored); only after the dead zone does it turn red-highlighted and clickable, and it auto-reverts after another 3.3 seconds without a click.
- **Rule**: **inline double-confirmation must pair with a dead zone**, otherwise accidental double-clicks get through. During the dead zone the button must look clearly disabled (grey + not-allowed), not merely 'logically ignoring clicks while looking normal'.

#### Bubble layout must expand upward (T6 pitfall)
- **Pitfall**: with multi-line content or stacked bubbles, expanding downward intrudes into the pet sprite area (covering the cat). The original design had a 'flip below the cat' branch, but flipping below necessarily crosses the cat — worse.
- **Fix**: anchor the window bottom at `catY - 8px`; multiple bubbles/lines of content **stack upward**; drop the flip-below branch and clamp the top to the screen top when space runs out. Width is adaptive (`genBubbleShape` takes a width parameter, `max(360, natural width of children)`), so long links widen without overflow.
- **Rule**: **bubbles only expand upward — never downward, never flip below**.

#### `ReturnType<typeof useXxxStore>` in index.ts needs `import type` (T3 pitfall; also fixed a T1 leftover)
- **Pitfall**: the `SetupMailPluginArgs` / `removeAccount` signatures in `src/plugins/mail/index.ts` use `ReturnType<typeof useMailNotificationStore>`, but that store is only `export {}`-ed (runtime re-export) without `import type`. tsc reports `Cannot find name 'useMailNotificationStore'` (**silently passes vite but fails vue-tsc/tsc**). T1 planted this mine (the notification/settings fields of SetupMailPluginArgs kept erroring); it surfaced when T3 added the removeAccount signature.
- **Fix**: add `import type { useMailNotificationStore } from './stores/mailNotification'` at the top of the file (same for settings). `useMailAccountStore` always had `import type`, so it was unaffected.
- **Rule**: **in aggregate files like index.ts that 're-export + reference in their own signatures', every store referenced by `ReturnType<typeof X>` must be `import type { X }`-ed at the top**; a re-export alone is insufficient (re-exporting doesn't bring the name into the current module scope).

#### Static assets (logos/images) belong in public/, not src/assets (T3 decision)
- **Decision**: the 10 mailbox logos live in `public/mail-logos/` (absolute paths `/mail-logos/xxx`), consistent with the project fonts (`public/fonts/`). **Not `src/assets/`** — the latter requires `import logo from '@/assets/...'` + vite-hashed filenames, which is worse for domain-based dynamic logo matching (`matchProviderLogo` returns string paths; imports must be statically analyzable and can't assemble paths at runtime).
- **public is copied verbatim**: during dev `/mail-logos/...` is directly accessible; production builds keep the same path without hashing, so both ends of `matchProviderLogo`'s string path (store + img src) agree.

#### PNG logo 'white-background to transparent' kills internal whites (QQ logo pitfall)
- **Pitfall**: naive white-to-transparent conversion (`r>235 && g>235 && b>235 → alpha=0`) also makes the logo's internal whites transparent. The QQ penguin's white belly/eye whites are close in RGB to the background white, so the naive threshold wiped the belly too → hollow penguin outline.
- **Correct approach**: **flood-fill alpha reconstruction** — start from non-logo-colored background at the four corners, mark 'background connected to the edges' as transparent, and keep the internal whites surrounded by the logo's dominant colors (black/red) opaque. Do it per-pixel with the browser canvas `getImageData` (don't hand-write a node PNG codec).
- **Rule**: when a logo has internal white regions, naive thresholding doesn't work; flood fill must separate background from internal whites by connectivity.

#### Account-card logo size deviates from the mockup (T3 user decision)
- **Mockup** `mail-settings.html`: container 36×36, logo 22×22.
- **User adjustment**: enlarge to container 48×48 (`h-12 w-12`), logo 32×32 (`h-8 w-8`), `object-contain` to keep aspect, vertically centered. **Not `h-full w-full` filling the container** (the user explicitly rejected 'it's ugly filled to the container').
- **IMAP detail row** uses `pl-15` (60px = 48 container + 12 gap) to align with the text start.
- **The mockup was not updated** (still the original 36×36); the implemented 48×48 is authoritative.

#### Coremail servers don't support IDLE → polling fallback (T4 pitfall)
- **Pitfall**: Coremail servers reply `BAD command not support` to the IDLE command — the IMAP IDLE extension is not implemented. Educational mailboxes (e.g. `.edu.cn`) are mostly hosted by Coremail's education SaaS.
- **Fix**: added the pure function `classify_idle_error(err_msg) -> IdleSupport` (Unsupported vs Transient) in `logic.rs` plus `poll_loop` in `manager.rs`: when IDLE init fails and is classified Unsupported, rebuild the session and switch to pure polling (`POLL_INTERVAL` 5-second sleep + fetch loop).
- **Technical detail**: `session.idle()` consumes the session into a handle; after init failure async-imap has no safe API to recover the session (`done()` triggers BAD again), so the fallback **rebuilds a new connection via `build_imap_session`**.

#### NetEase mailboxes (163/126) require the IMAP ID command (fixed in 1.3.1)
- **Pitfall**: NetEase mailboxes (163/126/yeah.net) require third-party clients to send the IMAP ID command (RFC 2971) identifying themselves (name/version/vendor etc.) after LOGIN and before SELECT and other operations; otherwise subsequent operations return `Unsafe Login`. `build_imap_session` previously skipped the ID command and selected INBOX directly, so all 163/126 users were rejected.
- **Fix**: `build_imap_session` now calls `session.id([("name", ...), ("version", ...), ...])` after login and before select. The return value is ignored with `let _ =` — servers without ID support return BAD without breaking the flow.
- **ID command ordering**: 163 requires **LOGIN first, then ID** (not before LOGIN). LOGIN itself returns OK, but SELECT is rejected unless ID was sent. Reference: [NetEase help](https://help.mail.163.com/faqDetail.do?code=d7a5dc8471cd0c0e8b4b8f4f8e49998b374173cfe9171305fa1ce630d7f67ac2eda07326646e6eb0).
- The `Session::id()` signature in **async-imap 0.11.3**: `id(identification: impl IntoIterator<Item = (&str, Option<&str>)>) -> Result<Option<HashMap<String, String>>>`.

#### build_imap_session proxy-override bug (T4 fixed a pre-existing one)
- **Pitfall**: `manager.rs` had a duplicated `let tcp = TcpStream::connect(...)` that overwrote the tunnel TCP stream established by the proxy branch — **the proxy path never worked**.
- **Fix**: remove the duplicate code. Note the user doesn't actually use a proxy (domestic mailboxes connect directly); this bug was latent.

#### antdv-next Input type="number" still binds a string (T4 pitfall)
- **Pitfall**: `<Input type="number">`'s `v-model:value` binds a **string** (HTML input values are always strings); passing it to a Rust `u16` fails with `invalid type: string "993", expected u16`.
- **Fix**: `handleTestAndSave` explicitly does `Number(imapPort.value)` + range validation (1-65535).
- **Rule**: **antdv-next Input type="number" binds a string, not a number**; convert explicitly before passing to strongly-typed Rust parameters.

#### Educational mailbox IMAP addresses don't resolve on public DNS (T4 pitfall)
- **Pitfall**: school-provided IMAP addresses (e.g. `imap.s.ytu.edu.cn`) **don't resolve via public DNS** (records exist only on the school's internal DNS). The actually usable address is `edu.icoremail.net` (the generic Coremail education-SaaS access point).
- **Fix**: added `SUFFIX_PATTERNS` to `providers.ts` (`.edu.cn` / `.edu` → `edu.icoremail.net`) + `extractEduAbbr` (extracts the school abbreviation from the domain for displayName).
- **Rule**: school-provided addresses aren't necessarily usable off-campus; educational-mailbox users need the `edu.icoremail.net` fallback.

#### Context menu intermittently fails (unresolved, shelved)
- **Symptom**: right-clicking the pet pops the native menu, which sometimes can't be clicked with the mouse (no highlight, no selection), but **keyboard arrow keys can select**. Fully random, no clear trigger.
- **6 directions already ruled out (don't retry)**: (1) `setAlwaysOnTop` not awaited; (2) Win32 `SetForegroundWindow` foreground-lock hack; (3) startDragging vs menu.popup race in `handleMouseDown`; (4) alwaysOnTop polling thread 16ms race; (5) mouse-hover hide setIgnoreCursorEvents; (6) mouse pass-through toggle.
- **Established facts**: the menu pops (visible) + keyboard works (has focus) + mouse doesn't (events intercepted/passing through) + unrelated to alwaysOnTop + unrelated to pass-through + no other windows interfering.
- **Conclusion**: a low-level Tauri/WebView2 interaction problem on Windows; diagnosis at the fork level is exhausted. Wait for an upstream Tauri fix or more clues.

## todo plugin component inventory (Phase 1 complete; all T1-T6 components)

> Located in `src/plugins/todo/components/`, flat directories `<Name>/index.vue`. Import directly when reusing.

| Component | Origin | Description |
|------|------|------|
| `PaperPanel` | T2 | Paper container + very light gray grain texture; the panel's main container |
| `PawLogo` | T2 | SVG 4 circles + ellipse, a true paw print |
| `HandCheckbox` | T2 | Hand-drawn irregular square + pink fill + hand-drawn checkmark |
| `InkDot` | T2 (clickable added in T6) | Three-layer path ink dot, recolored by priority; `clickable` mode renders a button for click-to-toggle |
| `HandClock` | T2 | Q-curve outer ring + curved hour/minute hands + center dot |
| `WaveDivider` | T2 | Hand-drawn wavy divider (`Q 25 1 50 3 T 98 3`) |
| `TodoItem` | T2 (enhanced in T6) | Single todo: checkbox + title + clickable ink dot to toggle priority + dueLabel including hour:minute. T6 changes: isOverdue/dueLabel moved from whole-day comparison to minute precision (due today 10:15 shows red 'Overdue 10:15' at 10:16); delete button × mark → hand-drawn trash can (mirroring MailItem) |
| `TodoPanel` | T2 (enhanced in T6) | Main panel: header + compose area (title + priority + date + confirm/cancel) + list + footer |
| `MiniInput` | T5 (reuses shared components in T6) | Mini quick-add window (380px wide), reusing HandDateInput/PriorityPicker |
| `HandDateInput` | T6 (shared) | 5 hand-written digit inputs (year/month/day + hour:minute); auto-fills current system time on focus; shared by the mini window and the main panel |
| `PriorityPicker` | T6 | Three-level ink-dot row selector (low=blue/medium=orange/high=red), v-model, selected gets a wavy underline |

Utility functions (`src/plugins/todo/utils/`):
- `priority.ts`: `PRIORITIES` array + `priorityIndex` + `nextPriority` (cycle toggle)

## mail plugin component inventory (Phase 2 T1-T3 complete; T4-T6 in progress)

> Located in `src/plugins/mail/`. The Rust backend lives in `src-tauri/src/plugins/mail/` (a standalone Tauri plugin crate).

### Rust backend (`src-tauri/src/plugins/mail/`)
| File | Description |
|------|------|
| `src/lib.rs` | init() + rustls crypto provider install_default + ConnectionManager state |
| `src/commands.rs` | `mail_test_connection` / `mail_connect` / `mail_disconnect` / `mail_store_password` / `mail_delete_password` |
| `src/manager.rs` | ConnectionManager + idle_loop + idle_wait_loop + **poll_loop (T4: Coremail polling fallback)** + build_imap_session (with HTTP CONNECT proxy; **T4 fixed the proxy-override bug**) + fetch_max_uid + fetch_new_envelopes + decode_mime_words + **has_connection / connection_count (T4 multi-account queries)** |
| `src/logic.rs` | `should_reset_idle` / `backoff_delay` / **`classify_idle_error` (T4: IDLE-unsupported detection)** + `IdleSupport` enum + **`POLL_INTERVAL`(5s)** + `#[cfg(test)]` tests |

### Frontend (`src/plugins/mail/`)
| File | Description |
|------|------|
| `commands.ts` | TS wrappers for the Rust commands |
| `index.ts` | setupMailPlugin (listen events; **T3: bubbles gated by the settings toggles bubbleEnabled/unreadOnly**) + testAndSaveAccount + removeAccount (**T3: cascades a mailNotification cleanup**) + toggleAccountEnabled (**added in T3**: toggling an account connects/disconnects) |
| `stores/mailAccount.ts` | Account config store (array, length capped at 1, lifted in T4) + setEnabled (**added in T3**, enable toggle) + vitest tests |
| `stores/mailSettings.ts` | Proxy settings + **the T3 three notification toggles** (bubbleEnabled default true / bubbleAutoDismiss default false / unreadOnly default false) |
| `utils/providers.ts` | `matchProvider()` provider detection (with displayName + webmailUrl + logo path) + `matchProviderLogo()` + `DEFAULT_MAIL_LOGO` + vitest tests. **T3**: split foxmail into its own preset + added proton / yahoo. **T4**: `SUFFIX_PATTERNS` (`.edu.cn`/`.edu`→`edu.icoremail.net`) + `extractEduAbbr` (educational-mailbox suffix pattern matching) |
| `utils/errors.ts` | `formatConnectionError(rawErr, t)` pure function (**added in T4**): classifies Rust technical errors into friendly hints (TLS/auth/timeout/unsafe login/domain not local/network), translation only, no long copy + vitest tests |
| `utils/bubbleShape.ts` | `genBubbleShape(textHeight)` generates the bubble SVG path d dynamically from content height (added in T2) |
| `components/Bubble/index.vue` | **Hand-drawn bubble** (T2 done, T6 enhanced): chubby SVG shape + Jingnan Bobo Hei font + pink-ink palette + persistent until manually closed + overflow beyond 3 folds into the list. Payload upgraded to the discriminated union `BubblePayload` (mail/todo); type='todo' renders a red-ink hand-drawn clock + red-ink waves + an 'Overdue' subtitle, and clicking opens the todo panel |
| `components/MailPanel/index.vue` | Mail panel paper container (added in T5, a PaperPanel replica, viewBox 400×560) |
| `components/MailItem/index.vue` | Mail item (added in T5, enhanced in T5a): three states — unread red ink dot / read envelope + faded / archived translucent + tag — plus archive button (hand-drawn box) + delete button (hand-drawn trash can) + inline double-confirmation (700ms dead zone + 3.3s confirm window) + two-column meta grid + absolute date |
| `stores/mailNotification.ts` | Local notification history store (added in T5): unread→read→archived state machine + removeByAccount (**added in T3**, cascading cleanup on account deletion) + vitest tests |
| `utils/retention.ts` | Retention rule pure functions (added in T5): 24h archive / 5min archive / 30-day cleanup + vitest tests |
| `utils/timeFormat.ts` | Relative time formatting (T5): '2 minutes ago' / 'yesterday' + `absoluteDate(ts)` absolute date `year.month.day` (added in T5a) |

> **Font change (T2, user's verbal request)**: the handwriting font switched from 851 to **Jingnan Bobo Hei**. The font-family name is still `'Handwriting851'` (historical naming; only the `@font-face` src changed). `bubble.css` (bubble) and `handdrawn.css` (todo) each define their own `@font-face`, so a font change means editing both.
>
> **Requirement memo (not in existing tickets)**: the user plans a 'font switcher' in the settings page with several bundled fonts. Out of Phase 2 scope; no ticket yet.

### Integration points
- `src/constants/index.ts`: `WINDOW_LABEL.BUBBLE` / `MAIL_LIST` / `MAIL_ARCHIVE` + `LISTEN_KEY.SHOW_BUBBLE` / `SHOW_MAIL_LIST` / `SHOW_MAIL_ARCHIVE`
- `src/router/index.ts`: `/bubble` / `/mail-list` / `/mail-archive` routes
- `src/pages/bubble/index.vue`: bubble window (standalone companion window; positioning copies the todo panel's clamp + edge flip)
- `src/pages/mail-list/index.vue`: mail list window (added in T5)
- `src/pages/mail-archive/index.vue`: archived mail window (added in T5)
- `src/pages/preference/components/mail/index.vue`: mail settings page (**rewritten in T3**: account list with logo + address + status dot + IMAP + enable toggle + delete / add-account form with input-with-icon logo linkage + hint area with a hand-made SVG exclamation triangle + the three notification toggles, following ProList+ProListItem+Switch) + proxy
- `public/mail-logos/`: 11 mailbox logos (**10 added in T3** + **`logo-edu.svg` graduation cap added in T4**, all RGBA-transparent; domain→logo mapping in the `logo` field of `utils/providers.ts`)
- `src-tauri/tauri.conf.json`: bubble / mail-list / mail-archive windows + preference minHeight 720
- `src-tauri/capabilities/default.json`: `mail:allow-*` permissions (capabilities are mandatory for new Tauri plugins)
- 5 locale files: `plugins.mail.labels.*` + `providers.*`

> **Bubble window approach (backfilled at T1)**: a standalone companion window `WINDOW_LABEL.BUBBLE` (not rendered inside main). main is transparent pass-through and sized tightly to the sprite; the bubble's clickable area would conflict with main's interactions. See ADR 0002 D7.1.

## Design exploration decisions (finalized)

### todo companion panel visual direction — finalized ✅

After four iterations (v0/v1/v2/v3), the visual direction **is finalized**. Mockups live in `docs/designs/todo-panel-exploration/`; the final version is `v3-white-pink-851.html`.

**Finalized visual spec**:
- **Overall style**: fully hand-drawn illustration. All 'shapes' are SVG (borders/checkboxes/dividers/ink dots/clock/paw); HTML only does layout and text. **Never use CSS borders for strokes**.
- **Paper**: pure white (`#ffffff`) + a very light gray grain texture.
- **Font**: the 851 handwriting font (`851手写杂字体.ttf`, copied to `docs/designs/todo-panel-exploration/851.ttf`). Applied globally to titles/body/labels.
- **Palette (pink ink family)**: main ink `#4a3a2e` (brown ink), accent `#f4a8a0` (the pet's cheek pink), priority red `#d4654a` / orange `#f5c26b` / blue `#9bc4e0`.
- **Priority marker**: an ink dot (not a perfect circle). SVG three-layer path: irregular pale outer halo + solid black core + brush-stroke highlight, simulating 'a brush drawing a small filled circle'.
- **Checkbox**: hand-drawn irregular square (each corner's radius differs, like hand drawing); checked state uses a pink fill + hand-drawn checkmark (a curved stroke).
- **Clock**: hand-drawn style. Irregular outer circle (Q curves, not `<circle>`), curved hour/minute hands, plus a solid center dot.
- **Dividers**: hand-drawn waves (`Q 25 1 50 3 T 98 3`), not straight lines.
- **Paw logo**: 4 circles + ellipse drawn in SVG (a true paw shape), no emoji.
- **Font weight**: todo title `font-weight: 700 / 17px` (851 looks thin at small sizes; bold is required). **Global baseline `font-weight: 600`**, headings 700. **De-emphasize hierarchy with color** (`--ink-soft`/`--ink-faint`), **not with thin weights** — 851's default normal is too thin and looks awful.

### Engineering implementation path

- todo components use **locally scoped custom styles**; all visual elements use SVG/the handwriting font.
- **Don't touch antd global tokens** (avoid polluting the preference page).
- antd components are **only for functional interaction logic** (if used at all); visual skins must be custom overrides.

### Mockup file inventory

Final files live in `docs/designs/todo-panel-exploration/`:

| File | Description |
|------|------|
| `panel.html` | **Companion panel body**: pure white paper + 851 handwriting + ink-dot priorities + hand-drawn clock/checkbox/dividers/paw |
| `mini-input.html` | **Mini input window** (quick add): follows the cursor, three states (empty/typing/saved) |
| `tuck-pop-animation.html` | ~~Tuck-and-pop animation~~ **Deprecated** (the tuck-and-pop proposal was rejected by the user in favor of simple fade in/out; see ADR D3). Kept as a historical reference. |
| `851.ttf` | The 851 handwriting font (for mockups; handle via vite's font pipeline when implementing) |

Deprecated iterations (v0 antd version / v1 CSS border version / v2 off-white paper version) have been deleted.

**Window animation** — ❌ tuck-and-pop rejected, ✅ simple fade in/out (actual implementation)
- **Tuck-and-pop (deprecated)**: the original proposal was overcomplicated with a high debugging cost (3 regressions: panel vanishing on right-click of the cat / panel positioned off-screen / native scrollbars appearing in the transparent window); the user rejected it explicitly ('I don't want this animation anymore, just the plainest, simplest fade in/out'). The mockup `tuck-pop-animation.html` is kept as a historical reference; **do not propose restoring it**.
- **Fade in/out (actual implementation, T3)**: opacity transition 200ms ease. Fade in on open, fade out on close (close runs the 200ms fade before hideWindow). The two windows (todo panel + quick add) share the same fade state.
- **Panel positioning**: anchored to the cat (todo panel = centered above the cat; quick add = above-right of the cat), with edge clamp + edge flip so it never leaves the screen.

### Phase 2 mockups — finalized ✅

Mockups live in `docs/designs/phase2-exploration/`; all three HTML files are finalized as UI input for `/to-spec`:

| File | Description |
|------|------|
| `bubble.html` | **Desktop pet bubble**: chubby hand-drawn bubble pinned right above the pet, **persistent + manually closed** (no auto-dismiss), at most 3 + overflow folded into 'N more, view the mail list', pure fade in/out, 360px wide, font-weight 600 baseline |
| `mail-list.html` | **Mail list + archived mail**: two companion panels, hand-drawn style + top-right close buttons. Mail list (unread/read) + archived mail (faded style), font-weight 600 baseline |
| `mail-settings.html` | **Mail settings page** (preference sidebar): 720px tall (sidebar doesn't scroll), account list (auto-detected provider logos) + add-account form (domain→logo/IMAP linkage) + notification settings. Follows the antdv-next preference rules |
| `851.ttf` | The 851 handwriting font (same as the todo mockups) |

**Mailbox logo inventory** (all **RGBA transparent backgrounds**, dark-mode friendly; provider auto-detection maps by mailbox domain):

| File | Applicable domains | Source |
|------|---------|------|
| `logo-gmail.svg` | gmail.com / googlemail.com | Iconify logos set (Google's original-color M) |
| `logo-qq.png` | qq.com | The real penguin from QQ Mail's official site |
| `logo-foxmail-icon.png` | foxmail.com | Cropped from foxmail.com's official logo, **keeping only the red G icon** (dropping the text on the right) |
| `logo-163-icon.png` | 163.com / yeah.net | Left icon cropped from `.header-163logo` on mail.163.com's login page |
| `logo-126-icon.png` | 126.com | Left icon cropped from `.header-126logo` on mail.126.com's login page |
| `logo-outlook.svg` | outlook.com / hotmail.com / live.com | simple-icons + brand blue |
| `logo-icloud.svg` | icloud.com / me.com / mac.com | simple-icons + brand blue |
| `logo-proton.png` | proton.me / protonmail.com | proton.me favicon (white background made transparent) |
| `logo-yahoo.svg` | yahoo.com | simple-icons + brand purple |
| `logo-mail-default.svg` | Unrecognized domains | Neutral gray envelope icon |

> ⚠️ **Logo processing pitfalls**: every PNG must be RGBA-transparent (white backgrounds look terrible in dark mode). When cropping wide logos (foxmail/163/126 official logos are all 'icon + text' banners), keep only the left icon. **Do not hand-write a node PNG codec** for pixel work — filter logic is error-prone and produces mosaics; use the browser canvas `toDataURL` instead.
