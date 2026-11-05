# ADR 0002: Phase 2 Mail Notifier and Desktop Pet Bubble Notifications

- **Status**: Accepted
- **Date**: 2026-07-30
- **Decision driver**: @ChHsiching
- **Supersedes**: — (corrects the old Phase 2 definition in ADR 0001 / CONTEXT.md — "radial menu UI + Android LAN sync"; the radial menu was rejected in D7, Android sync postponed to a separate repo)

## Context

Phase 1 (v1.2.0) has shipped. After grilling, the original Phase 2 candidates (radial menu / Android sync) were adjusted to:

- **Radial menu** — cancelled (ADR 0001 D7 rejected).
- **Android sync** — postponed to a separate repository. The pet itself is a desktop concept (transparent always-on-top window / pass-through / tray); an Android client could only be a standalone todo app, a from-scratch project that doesn't belong in this phase.
- **Panel dragging + position memory** — completed at the end of Phase 1.

The settled Phase 2 scope is **mail notifier + desktop pet bubble notifications + dual delivery of todo reminders**. This ADR records all architecture decisions, tradeoffs, and the technical design for that scope.

## Decision

### D1. Mail protocol uses generic IMAP IDLE long connections

**Decision**: the Rust backend uses the `async-imap` crate (`runtime-tokio` feature) + the tokio async runtime, establishing an IMAP IDLE long connection per account INBOX; the server pushes on new mail arrival (`IdleResponse::NewData`).

**Rationale**:
- Generic coverage of every IMAP-capable mailbox — Gmail / QQ / 163 / Outlook etc. — matching the generic "bind a mailbox" requirement.
- IDLE balances latency and resource use (server push, no polling).
- Combined with each provider's "app-specific password/authorization code", it bypasses Gmail OAuth app registration and review (a solo fork can't get through the consent screen).

**Rejected alternatives**:
- **Gmail API push (Gmail only)**: best latency but single-provider; requires registering a Google Cloud OAuth app + review, a heavy maintenance burden for a solo fork; extending to a second provider means a redo.
- **Generic IMAP + polling**: less work but the highest latency (up to 60s) and most resource-hungry, defeating the point of choosing IDLE.

**Verification (2026-07-30, docs.rs authoritative)**: `async-imap`'s `extensions::idle` module provides `Handle` / `IdleStream` / `IdleResponse` (`NewData` | `Timeout` | `ManualInterrupt`); the API matches this scenario exactly, and the `runtime-tokio` feature is compatible with Tauri 2's tokio runtime.

**New dependencies (intrusion bill)**:
- `async-imap` (IMAP protocol, features: `runtime-tokio`)
- `tokio-rustls` + `rustls` + `webpki-roots` (TLS encryption) — async-imap doesn't handle TLS itself; establish the encrypted connection first, then hand it to `Client::new()`.

> ⚠️ **T1 implementation correction (2026-07-31)**: the plan was `tokio-native-tls`; **the implementation switched to `tokio-rustls`**. Reason: native-tls uses SChannel on Windows, which performs certificate revocation checks (OCSP/CRL) by default; on the user's network the revocation servers are unreachable → `CRYPT_E_REVOCATION_OFFLINE` → TLS handshake failure. **rustls doesn't check revocation**, avoiding the problem. `webpki-roots` (bundled Mozilla root CAs) is used instead of the system store.
>
> Cargo.toml dependencies (`src-tauri/src/plugins/mail/Cargo.toml`):
> ```toml
> tokio-rustls = "0.26"
> rustls = { version = "0.23", default-features = false, features = ["ring"] }
> webpki-roots = "0.26"
> ```
>
> ⚠️ **The rustls 0.23 crypto provider must be installed explicitly**: the first `ClientConfig::builder()` call needs a process-wide crypto provider. Without it the process **deadlocks permanently** (no panic, no timeout; even `tokio::time::timeout` can't save it — stuck on an internal lock in provider initialization). Fix: `rustls::crypto::ring::default_provider().install_default()` in the plugin init setup. Idempotent; ignore the Err from repeated calls.

### D2. Credentials go to the OS keyring; the pinia store holds no passwords

**Decision**: mailbox passwords/authorization codes are stored via the Rust `keyring` crate into the OS keystore (Windows Credential Manager / macOS Keychain / Linux Secret Service). The pinia store keeps only **non-sensitive** IMAP config (host/port/username) and **never passwords**.

**Rationale**:
- The existing persistence (`@tauri-store/pinia`'s `saveOnChange`) lands as **plaintext JSON** (`%APPDATA%/com.chhsiching.bongocat-todo/tauri-plugin-pinia/`). Plaintext todo data is harmless; plaintext mailbox passwords are a security red line.
- "Passwords never enter the store" is a constraint throughout the mail module: passwords are fetched asynchronously from the keyring when connections are established, not held in memory.

**keyring usage (verified)**:
```toml
[dependencies]
keyring = { version = "4", features = ["v1"] }
```
```rust
use keyring::v1::Entry;
let entry = Entry::new("bongocat-todo/mail/<accountId>", username)?;
entry.set_password(password)?;
entry.get_password()?;
entry.delete_credential()?;  // ⚠️ not delete_password
```
> ⚠️ **During grilling I misstated v3; verified as v4 + the `v1` feature flag** (the API path is `keyring::v1::Entry`, not top-level `keyring::Entry`). spec/implement must target v4.
>
> ⚠️ **T1 implementation correction (2026-07-31)**: the credential-deletion API is `delete_credential()`, **not** `delete_password()`. The wrong one fails to compile.

**Rejected alternatives**:
- **Hand-rolled AES + master password**: a solo project rolling its own crypto is almost guaranteed to get it wrong, and users would have to remember a master password.
- **tauri-plugin-stronghold**: the official strong-crypto library, but overkill for "storing a few mailbox passwords" (encrypted vault file + unlock at startup).

### D3. IDLE connection lifecycle binds to the app process (not windows)

**Decision**: IMAP IDLE long connections run as tokio tasks in the Rust backend; their lifecycle = the app process lifecycle. They bind to no specific window — the pet (main) is the app's primary, always-present window, so connections exist as long as the process runs; toggles in the settings window/panels don't affect them.

**Rationale**:
- Tauri 2 is a "Vue frontend + Rust backend" single process. Rust tasks are part of the app process; windows are just event-delivery targets, not conditions for task survival.
- The pet is always present ⇒ the app process is always present ⇒ connections are always present. Users get mail push without opening any sub-window.

**Keep-alive**: ~~IDLE auto-resets every 29 minutes (RFC 2177 recommends within 30 minutes to avoid server timeouts)~~; exponential-backoff reconnect after network loss. With multi-account there will be N independent connections; one dropping doesn't affect the others.

> ⚠️ **T1 implementation correction (2026-07-31)**: the planned "29-minute `wait()` timeout" turned out to be unworkable — under Tauri's tokio runtime, `Handle::wait()`'s default timeout **never returns Timeout** (the 29-minute timer future stays Pending forever; the `NewData` path works but the `Timeout` path is completely broken).
>
> The implementation switched to a **`handle.wait_with_timeout(Duration::from_secs(10))` short-cycle loop**: a Timeout fires every 10 seconds, and the Timeout branch runs a fallback `fetch_new_envelopes` to catch mail missed in IDLE push gaps. This is more aggressive than 29 minutes and also works around unreliable IDLE push on some providers (e.g. QQ) — the 10-second fallback keeps perceived latency bounded.
>
> ⚠️ **T4 implementation correction (2026-08-03)**:
> - **Cycle shortened from 10s to 5s**: user feedback said "mail arrives slowly"; `wait_with_timeout` changed from `from_secs(10)` to `from_secs(5)`.
> - **IDLE-to-polling fallback**: Coremail servers don't support the IDLE extension (they return `BAD command not support`), and educational mailboxes are mostly Coremail-hosted. Added `classify_idle_error` to distinguish Unsupported vs Transient; Unsupported degrades to `poll_loop` (5s sleep + fetch, pure polling). The fallback must rebuild via `build_imap_session` (the session was consumed by the idle handle and can't be safely recovered).

**Honestly-flagged risk**: long-lived Rust tasks are a new complexity Phase 1 never touched (Phase 1 was all frontend stores + one-shot Rust commands). Connection pool management, reconnect, and IDLE timeout resets need TDD coverage.

### D4. Multi-account: tracer bullet first, closed within Phase 2 — ✅ done

**Decision**: first run a single-account tracer bullet through the whole chain (bind → IDLE → push → bubble) to validate the IMAP route on the target mailboxes; multi-account unlocks immediately after. **Both are Phase 2 deliverables** (not next phase).

**Rationale**:
- The IMAP IDLE route is Phase 2's biggest unknown (whether each provider's IDLE implementation is standard; whether users can get through the app-specific-password flow) and must be validated earliest.
- The data structure is designed as an **array** from day one (`accounts: MailAccount[]`); the single-account stage caps the length at 1, and the multi-account stage just lifts the cap + adds list UI + a connection pool, **without reworking the data model**.
- Multi-connection pool management (one drop not affecting others) is independent complexity; a separate ticket allows TDD coverage.

### D5. ~~Mail feature boundary: strict "INBOX new-mail notifier"~~ — 🔶 SUPERSEDED (upgraded to a local notification center; see D5-actual)

> **Status change (2026-07-30)**: the original decision's "zero write operations" core held, but "zero history" was overturned by user needs — see D9 (mail list). The mail feature upgraded from "ephemeral notifier" to "local notification center": local notification history is now allowed, but read/archived remain purely **local states** that never touch the mail server. The original decision text is preserved below for traceability.

**Original decision (partially deprecated)**: read-only, INBOX-only, envelope metadata only (sender + subject). Zero write operations, zero body fetch. Clicking the bubble jumps to webmail (browser).

**Original exclusions (partially deprecated)**:
- ~~Read/unread flag sync~~ (would send STORE commands changing server state, fighting webmail) — **still excluded** (read stays local, never touching the server)
- Mail body preview (extra FETCH BODY + the MIME/encoding rabbit hole) — **still excluded**
- Delete/archive (IMAP MOVE/STORE + state sync) — **still excluded** (archive stays local, never touching the server)
- ~~Historical notification records (another persistence layer)~~ — **opened up in D9** (local notification history, see D9)
- Multi-folder monitoring (one IDLE per folder; INBOX only) — **still excluded**

#### D5-actual. Local notification center (zero writes to the mailbox, local history allowed)

**Decision**: the mail feature is upgraded to a "local notification center". Core constraints unchanged: read envelope metadata only, **zero write operations** on the mailbox, no body fetch, click jumps to webmail. Local notification history is **allowed** — mail that has been bubble-notified is cached locally (sender + subject); read/archived are purely local states sending no commands to the mail server. See D9.

### D6. Mail settings entry: a new page in the preference window's sidebar

**Decision**: add a "Mail" page to the preference window's sidebar, hosting the account list + binding form + connection status display. No new window, no new route intrusion.

**Rationale**: aligned with todo's menu integration (todo also goes through preference/menu, no new windows).

### D7. Desktop pet bubble notifications: a shared component for mail and todo (persistent + manually closed)

> **Status change (2026-07-30)**: "auto-dismiss after 5 seconds + pause on hover" was overturned by the user in favor of "persistent + manually closed". The stacking policy was adjusted accordingly (no unlimited stacking while persistent).

**Decision**: the bubble is a first-class component shared by mail and due todos. Interaction boundaries:
- **Position**: directly above the pet (reusing the todo panel's `availableMonitors` + clamp + edge flip anchor logic).
- **Dismissal**: **persists on screen until the user closes it (×) or clicks it**. No more auto-dismiss, no countdown. ~~Auto-dismiss after 5 seconds + pause on hover~~ (deprecated).
- **Stacking**: at most **3 pending** bubbles at once (pending = the user hasn't clicked/closed them). When the 4th arrives, the overflow folds into a one-line hint "N more, view the mail list" that opens the mail list on click (D9). The old "unread queue replaces" approach is dropped (meaningless in persistent mode).
- **Click**: mail → open webmail (also mark locally read + archive after 5 minutes, see D9); todo → open the todo panel. The bubble only reminds and routes; it hosts no content.
- **Content**: mail shows sender + subject; todo shows title + "Overdue".
- **Animation**: pure fade in/out (opacity), no translate, no scale.

**Rationale**: user feedback: "5 seconds is too short — it's gone before I can read it". Persistent + manually closed means notifications are never missed; the 3-bubble cap + folding into the list prevents persistent bubbles from flooding the screen. Combined with the D9 mail list — pending in bubbles, handled/overflow in the list — the logic is coherent.

#### D7.1. Bubble rendering approach: a standalone companion window (backfilled after T1 tracer-bullet verification)

> **Status (2026-07-31)**: backfilled after tracer-bullet verification in T1 (ticket #11). The original spec #10 marked this item "decision to be backfilled after tracer-bullet verification"; it is now backfilled as D7.1.

**Decision**: bubbles use a **standalone companion window** `WINDOW_LABEL.BUBBLE` (not rendered inside main), configured like the todo panel (`transparent`/`decorations:false`/`skipTaskbar`/`alwaysOnTop`/`shadow:false`/`visible:false`/`resizable:false`, 360×60).

**Rationale**: the main window is transparent, always-on-top, and sized tightly to the pet sprite; its transparent areas are hit-test pass-through (unclickable). Rendering bubbles inside main would require extending the window height + handling `ignoreCursorEvents` against pass-through — more complex than a separate window. The separate window's positioning reuses the todo panel's `availableMonitors` + clamp + edge flip anchoring (anchor at the main window, horizontally centered, directly above), needing no extra alignment work.

**Rejected alternatives**:
- **Render inside the main window** (the original spec's preference): main is transparent pass-through + tightly sized to the sprite; the bubble's clickable area (whole bubble + top-right ×) conflicts with main's drag/pass-through logic, and enlarging the window would affect the pet's own interactions. A separate window isolates cleanly.

**Intrusion points**: `WINDOW_LABEL.BUBBLE` + `LISTEN_KEY.SHOW_BUBBLE` + `/bubble` route + the bubble window config in `tauri.conf.json` (appended, alongside the todo window).

### D8. Dual delivery of todo reminders (system notification + bubble); D6 stays intact

**Decision**: when a todo falls due, fire both the system notification (`@tauri-apps/plugin-notification`, retained from ADR 0001 D6) and the desktop pet bubble (purely additive). The existing `reminderStore` trigger point just adds one line emitting the bubble event; no existing logic is touched.

**Rejected alternatives**:
- **Bubble replaces system notification**: loses the system notification's "history review + sound + lock-screen display"; requires dismantling D6's dependencies/permissions/Rust registration, a net negative; and if the user closes the pet window (it's persistent, but still), reminders would be missed entirely.

**Rationale**: purely additive, per Surgical Changes; the system notification handles "history + sound" while the bubble handles "the pet's presence" — complementary capabilities.

### D9. Mail list + archived mail: the local notification history center

**Decision**: the pet's context menu gains **two standalone entries** (below todo/quick add): "Mail list" and "Archived mail". Each opens its own companion window (hand-drawn like the todo panel), both with top-right close buttons.

- **Mail list window**: shows every bubble-notified mail item (locally cached sender + subject, no body). Click → jump to webmail (no in-app body view, holding the D5-actual line).
- **Archived mail window**: shows archived mail with a faded style (opacity 0.7 + an archived tag); clicking still jumps to webmail.

**Retention rules**:
- After a new mail arrival triggers a bubble, it automatically enters the mail list (unread state).
- **Retained 24 hours by default**, then auto-archived (moved to the archived-mail window, removed from the mail list).
- **After a click**, marked locally read + auto-archived **after 5 minutes**.
- **Archived over 30 days** is auto-cleaned (fully removed from the store). Source: stated in the `mail-list.html` mockup footer; landed in T5.

**State model** (local, never touching the mail server):
```
MailNotification {
  id, accountId, uid, from, subject, arrivedAt  // envelope metadata (uid from IMAP, used for dedup)
  status: 'unread' | 'read' | 'archived'  // purely local state
  readAt?, archivedAt?                      // local timestamps
}
```

> **T5 implementation addendum (2026-08-01)**:
> - `NewMailPayload` (Rust → frontend event) gained a `uid: u32` field so the frontend can dedupe by `<accountId>:<uid>` (offline backfill + IDLE push may double-deliver) and, when a mail bubble is clicked, match by uid to call `markRead` on the store.
> - **Offline backfill path** (`mail://last-seen-uid` event): after each batch of new mail pushes, Rust emits the current last_seen_uid; the frontend listens and persists it via `setLastSeenUid` into the mailAccount store. On app-startup reconnect, the persisted `initial_last_seen_uid` is passed (instead of skipping via fetch_max_uid), and `fetch_new_envelopes` re-pushes mail that arrived offline. **Key constraint for offline backfill**: all frontend `listen`s must be `await`ed before `mailConnect`, otherwise Rust's emitted events are dropped (a race).

**Rationale**:
- Persistent bubbles (D7 revised) mean users "miss nothing", but persistent isn't "remembered as handled". The mail list fills the "history review" gap — after dismissing a bubble, the item is still findable in the list.
- Archive as a **standalone context-menu entry** (not buried in settings), parallel to the mail list with equal semantics: pending in "Mail list", handled in "Archived mail".
- Read/archived are **purely local states**: no STORE commands to the mailbox, never interfering with webmail/phone read states (holding the D5-actual zero-write constraint).
- The 24-hour + 5-minute dual deadlines: unclicked items stay longer (giving the user reaction time); clicked items archive quickly (handled items needn't linger).

**Rejected alternatives**:
- **Archive in the settings page**: semantic mismatch (archive is a frequently-viewed list, not configuration) and unequal to the mail-list entry. Moved to a standalone context-menu entry.
- **Server-side read** (IMAP STORE changing the mailbox read state): fights webmail, violates the D5-actual zero-write constraint, doubles the work.
- **Keep forever**: the list grows unboundedly, betraying the "lightweight notification center" positioning; the 24h+5min dual deadlines suffice.

**New intrusion points**:
- `src/composables/useAppMenu.ts`: "Mail list" and "Archived mail" entries added to the context menu (appended, alongside the todo menu items).
- `src/constants/index.ts`: `WINDOW_LABEL.MAIL_LIST` / `WINDOW_LABEL.MAIL_ARCHIVE`.
- `src/router/index.ts`: `/mail-list` `/mail-archive` routes (appended).
- `src-tauri/tauri.conf.json`: mail list + archive window configs (copying the todo panel's companion window config).
- New `src/plugins/mail/stores/mailNotification.ts`: the local notification history store (reusing pinia persistence).

### D10. HTTP CONNECT proxy support (added during T1 implementation; unplanned in the spec)

**Decision**: the mail module ships built-in HTTP CONNECT proxy support. `build_imap_session`'s `proxy: Option<&str>` parameter: with a proxy, first TCP-connect to the proxy → HTTP CONNECT tunnel → rustls TLS → IMAP. The proxy address persists in the `mailSettings` store, with a proxy input in the settings page.

**Rationale** (a necessary feature discovered during T1 manual verification):
- Users in China need a proxy for overseas mailboxes (Gmail etc.) to reach IMAP. TUN transparent proxies forward port 993 unreliably (a known `stack: system` issue), so the app needs its own proxy support.
- The `async-http-proxy` crate (HTTP CONNECT tunnel) verified working (QQ Mail through proxy 127.0.0.1:7890 succeeded).

**Dependency**: `async-http-proxy = { version = "1", default-features = false, features = ["runtime-tokio"] }`

**Future extensions (not this phase)**: SOCKS5 proxy (`fast-socks5` is in Cargo.toml but unimplemented), auto-detecting system proxy settings.

## Design mockup timing

The UI parts (bubble UI + mail list + mail settings UI) need mockups, **done before the spec** (as the spec's UI input). The backend (IMAP/keyring/connection management) is TDD self-contained and doesn't depend on mockups.

> ✅ **Done (2026-07-31)**: all three mockups are finalized in `docs/designs/phase2-exploration/`:
> - `bubble.html` — desktop pet bubble (persistent + manually closed + overflow beyond the 3-cap folds into the list)
> - `mail-list.html` — mail list + archived mail (two companion panels)
> - `mail-settings.html` — mail settings page (preference sidebar, auto-detected provider logos)
>
> The mailbox logo files (10, all RGBA-transparent) are in the same directory; see the "Phase 2 mockups" section of CONTEXT.md for the inventory. With the mockups done, the UI input for `/to-spec` is ready and the spec stage can begin.

## Consequences

- **Positive**: persistent bubbles + the mail list form a complete "notification center" — pending in bubbles, history in the list, handled in archive, a coherent loop; read/archived are purely local with zero mailbox writes, never fighting the server; sharing the bubble made the todo integration nearly free; credentials never land in plaintext, meeting the security baseline.
- **Negative**: the Rust side gains three dependencies (`async-imap` + TLS libraries + `keyring`) plus long-lived task management (reconnect/IDLE timeouts/multi-connection pool), a complexity Phase 1 never had; the multi-account connection pool is its own ticket; the mail list + archive add a store + list UI + context-menu entries + route/window intrusions (2-3 tickets' worth more than the original Phase 2).
- **Risk**: the IMAP IDLE route is the biggest unknown, validated earliest by D4's tracer bullet; cleanup of long-lived Rust connection tasks on window destruction/process anomalies needs care; the local notification history retention deadlines (24h/5min) need tuning after real use.

### Implementation conventions: mailbox logos and provider auto-detection (mockup outputs)

- **Provider auto-detection**: after the user types an address in the add-account form, the domain (the part after `@`) maps to `{ logo, imap }`. The `mail-settings.html` mockup bundles a domain→logo+IMAP table (gmail/qq/foxmail/163/126/outlook/icloud/proton/yahoo etc.); unmatched domains get the generic envelope icon + "auto-detected".
- **All logos have RGBA-transparent backgrounds**: white background squares look terrible in dark mode, so every PNG logo (foxmail/163/126/qq/proton) must be made transparent. All are cropped from official login pages or site logos — not favicons (favicons often point at the wrong icon; e.g. 163's favicon is actually NetEase's "Yi" character, and QQ's points at Tencent News). See the logo inventory in the "Phase 2 mockups" section of CONTEXT.md.
- **Pitfall warning**: when cropping wide logos (site banners are all "icon + text"), keep only the left icon; **do not hand-write a node PNG codec** for pixel work (filter logic errors produce mosaics) — use the browser canvas `toDataURL` instead.
