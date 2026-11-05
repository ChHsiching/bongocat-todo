# Issue #19 research: drag-to-resize and size persistence for the todo window

- Research date: 2026-11-03
- Issue: [ChHsiching/bongocat-todo#19](https://github.com/ChHsiching/bongocat-todo/issues/19)
- Subject: the todo window (label `todo`, currently 380×560, `resizable: false`, borderless and transparent)
- Note: `docs/research/` is a new directory created for this research; this file is its first report.
- Sources: all primary — official Tauri docs / docs.rs / source and issues of the official tauri, tao, and wry repos / the upstream ayangweb/BongoCat repo (fork sync point `44f44bc`) / MDN and caniuse. Local code facts were taken from the main session and spot-checked (`src-tauri/tauri.conf.json`, `src/pages/todo/index.vue`, `src/plugins/todo/components/PaperPanel/index.vue`).

---

## TL;DR

**Verdict: feasible with conditions, and "works out of the box" on most platforms.** Tauri 2 **has built-in edge-drag resizing** for `decorations: false + resizable: true` windows (Windows via tauri-runtime-wry sub-window hit testing, Linux via GTK hit testing, macOS getting the system capability directly from the `Borderless|Resizable` style mask); upstream BongoCat's main window is exactly the `transparent + decorations:false + resizable (default true)` combination, and the author confirmed "the window can be resized by dragging its edges". The real engineering work is not in the window layer but in: **(1) reworking the hand-drawn SVG border into a three-section layout per the author's constraint (proportional horizontally, free vertically); (2) dynamic min/max constraints under the mini/panel dual modes (a static minHeight would break mini mode); (3) persisting the user's size in pinia (no window-state plugin)**.

**Recommended approach (one sentence)**: `resizable: true` + runtime mode-based dynamic `setMinSize/setMaxSize` + size persistence via tauri-plugin-pinia + a three-section PaperPanel SVG (top/bottom bands lock aspect ratio; the middle stretches freely vertically).

---

## 1. Per-platform availability of `resizable: true` on borderless + transparent windows

### 1.1 Semantics of the `resizable` field

- Official WindowConfig definition: `resizable: bool` — "Whether the window is resizable or not. When resizable is set to false, native window's maximize button is automatically disabled." (setting false also disables the native maximize button) [source](https://docs.rs/tauri-utils/latest/tauri_utils/config/struct.WindowConfig.html)
- **Defaults to `true`** (`resizable: true` in the `Default` implementation in tauri-utils `config.rs`) [source](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-utils/src/config.rs)
- No coupling with `decorations` or `transparent`: both are independent fields; `decorations: false` does not imply non-resizable [source](https://docs.rs/tauri-utils/latest/tauri_utils/config/struct.WindowConfig.html)
- Also confirmed: `app.macOSPrivateApi` (the switch transparent windows need on macOS) is a **no-op since Tauri 2.12.1** (the transparency API is always enabled); this project on tauri 2.10.1 still needs it, and it is already on, so no change is required [source](https://tauri.app/reference/config/)

### 1.2 Windows: works (Tauri built-in), historical bugs fixed

- **Mechanism**: Tauri (tauri-runtime-wry) ships `undecorated_resizing.rs`, which creates a full-window, non-painting child window for undecorated + resizable windows (`TAURI_DRAG_RESIZE_BORDERS` / `TAURI_DRAG_RESIZE_WINDOW`) and converts edge clicks into system resizes via Win32 hit testing (HTLEFT/HTTOP/…). The child window's hole regions compute border-band widths with `GetSystemMetricsForDpi(SM_CXFRAME/SM_CYFRAME)` (DPI-aware). When the window has `shadow: false` (this project's config), `only_top=false` and **all four edges are covered**; only with `shadow: true` are just the top/bottom bands kept (left/right left to DWM's 1px white edge) [source](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-runtime-wry/src/undecorated_resizing.rs)
- **Historical bugs and fix status** (all included in 2.x stable, long before this project's tauri 2.10.1):
  - [tauri#8519](https://github.com/tauri-apps/tauri/issues/8519) (closed): during v2 alpha/beta, undecorated windows couldn't resize at all; fixed into beta.23 by [PR #9862](https://github.com/tauri-apps/tauri/pull/9862) in 2024-06. The leftover issues in the trailing comments (`unstable` feature + multiwebview, JS `setSize` failing after `decorations(false)`) are irrelevant to this scenario.
  - [tao#877](https://github.com/tauri-apps/tao/issues/877) (closed): during tao 0.25, the resize cursor regions drifted on Win11 and only right/bottom directions worked; fixed by [tao PR #878](https://github.com/tauri-apps/tao/pull/878) in 2024-02.
  - [tao#1241](https://github.com/tauri-apps/tao/issues/1241) (closed): progressive degradation during continuous resizes under `decorations: false` — fixed.
  - [tao#1359](https://github.com/tauri-apps/tao/issues/1359) (closed): abnormal height on the first resize of a hidden undecorated window with shadow — fixed; and this window has shadow:false anyway.
- **Still-open edge cases**:
  - [tao#1170](https://github.com/tauri-apps/tao/issues/1170) (open): complains the top resize band is only 1px and hard to hit — that's for direct tao users; Tauri goes through the runtime-layer implementation above (`SM_CYFRAME` band), but QA should still feel out the top edge on real hardware.
  - [tauri#16304](https://github.com/tauri-apps/tauri/issues/16304) (open): a discussion about the missing top 1px border of borderless windows on Win10 — a `shadow: true` scenario (the DWM 1px white edge is covered by the webview); this window's `shadow: false` is unaffected, and in that issue the maintainer explicitly confirms undecorated resize is implemented by tauri-runtime-wry.
- **Transparent + resize combined**: no currently open issue found for "transparent window resize showing black edges/flicker" (searched `transparent window resize` / `transparent resize flicker` / `transparent black resize` — no hits). The doc warning about "poor resize performance" targets **window effects** like Acrylic/Blur, not plain `transparent: true` [source](https://v2.tauri.app/reference/javascript/api/namespacewindow/). Known transparency issues center on a **white flash at creation**; the fix is `noRedirectionBitmap` (WindowConfig platform notes) [source](https://docs.rs/tauri-utils/latest/tauri_utils/config/struct.WindowConfig.html). Flagged as **needing QA verification on real Win10/Win11 machines**.

### 1.3 macOS: works (system-native support; the only platform needing no special Tauri handling)

- When creating a `decorations: false` window, tao explicitly uses `NSWindowStyleMask::Borderless | Resizable | Miniaturizable`; the source comment is literally "Resizable UnownedWindow without a titlebar or borders"; only `resizable: false` strips the Resizable bit [source](https://github.com/tauri-apps/tao/blob/dev/src/platform_impl/macos/window.rs)
- The system indeed attaches resize capability (the zoom widget `_NSThemeZoomWidget`) to such "borderless yet Resizable" windows: [tao#1191](https://github.com/tauri-apps/tao/issues/1191) (closed) — on macOS 15 Sequoia, `decorations:false + resizable:true` windows spun at 100% CPU because the system created a zoom widget on every layout; the bug is fixed and closed, but it conversely proves the system supplies the resize affordance for this window kind.
- User evidence: an [tauri#8519](https://github.com/tauri-apps/tauri/issues/8519) comment (2024-11): "It works fine on MacOS, the issue is on windows".
- Transparency needs macos-private-api — this project already has it on (see 1.1).

### 1.4 Linux (X11): works on mainstream desktops; isolated DE failures (open)

- **Mechanism**: tauri-runtime-wry attaches button-press/touch handlers on the webkit2gtk WebView; when `!decorated && resizable && !maximized`, it does 5px × scale_factor edge hit testing and calls `gdk_window.begin_resize_drag` on a hit [source](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-runtime-wry/src/undecorated_resizing.rs)
- **Failure case**: [tauri#16266](https://github.com/tauri-apps/tauri/issues/16266) (open, 2026-10): on Astra Linux (fly-wm) X11, undecorated windows have no resize bands at all. Tauri maintainer FabianLars replied that both Wayland and X11 on GNOME are fine (tested with a fresh tauri app) and suspects it's DE-specific. **The same issue also proves `startResizeDragging` works on Linux** (the author drove a synthetic pointer pixel by pixel; `startResizeDragging` correctly triggered `gtk_window_begin_resize_drag` following the pointer).
- **Historical, fixed**: [tao#1243](https://github.com/tauri-apps/tao/issues/1243) (cannot resize/move with GTK_CSD=1, closed), [tao#1380](https://github.com/tauri-apps/tao/issues/1380) (touch triggering resize, closed).
- **UX note**: [tauri#9212](https://github.com/tauri-apps/tauri/issues/9212) (open, reported in the tauri 1.x era, Linux): considers the 5px band "too large", stealing clicks from edge elements (scrollbars). The todo window is only 380px wide with a scrollable list; a 5px band is a noticeable share — keep it in mind for interaction design.

### 1.5 Linux (Wayland): works under GNOME (maintainer-tested)

- In the same [tauri#16266](https://github.com/tauri-apps/tauri/issues/16266), the maintainer explicitly states resizing works on GNOME Wayland in his testing (the GTK path's `begin_resize_drag` goes through xdg_toplevel resize, executed by the compositor).
- Window **positioning** APIs are already unusable under Wayland (a pre-existing limitation, unrelated to this change) — how the todo window's "anchored to the cat" positioning currently behaves on Wayland is an existing issue, out of scope here.

### 1.6 Platform summary

| Platform | Edge-drag resize with decorations:false + transparent:true + resizable:true? | Evidence |
| ------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows 10/11 | Yes (all four edges; Tauri built-in hit-test sub-window; band = system resize border width) | [runtime source](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-runtime-wry/src/undecorated_resizing.rs), [wry#1273 maintainer note](https://github.com/tauri-apps/wry/issues/1273) ("wry itself doesn't handle it; Tauri implemented it") |
| macOS | Yes (system native, `Borderless\|Resizable`) | [tao source](https://github.com/tauri-apps/tao/blob/dev/src/platform_impl/macos/window.rs), [tao#1191](https://github.com/tauri-apps/tao/issues/1191) |
| Linux X11 (GNOME/KDE and other mainstream) | Yes (GTK hit testing, 5px×DPI band) | [tauri#16266 maintainer reply](https://github.com/tauri-apps/tauri/issues/16266) |
| Linux X11 (isolated DEs, e.g. fly-wm) | **No** (bands vanish, open issue) | [tauri#16266](https://github.com/tauri-apps/tauri/issues/16266) |
| Linux Wayland (GNOME) | Yes | [tauri#16266 maintainer reply](https://github.com/tauri-apps/tauri/issues/16266) |
| Linux Wayland (other compositors) | Unconfirmed (no primary data; a doc note suffices if QA can't cover it) | — |

---

## 2. Custom resize handles for when the native edge is unreliable

### 2.1 `startResizeDragging`: exists, named as suggested; works on Windows/Linux, **not macOS**

- **Exact API** (verified against official source; the name matches the suggestion): `getCurrentWindow().startResizeDragging(direction: ResizeDirection)`, invoke command `plugin:window|start_resize_dragging`; `ResizeDirection` is `'North' | 'NorthEast' | 'East' | 'SouthEast' | 'South' | 'SouthWest' | 'West' | 'NorthWest'` [source](https://github.com/tauri-apps/tauri/blob/dev/packages/api/src/window.ts)
- **Required capability permission**: `core:window:allow-start-resize-dragging` (not in `core:window:default`; must be added explicitly in the capability file) [source](https://github.com/tauri-apps/tauri/blob/dev/packages/api/src/window.ts); for the permission system see the [Window Customization guide](https://v2.tauri.app/learn/window-customization/)
- **Version**: the API was added by [PR #8537](https://github.com/tauri-apps/tauri/pull/8537) (during 2.0 beta; the api CHANGELOG files it under the `2.0.0-beta.0` section), and the permission by [PR #9490](https://github.com/tauri-apps/tauri/pull/9490) (beta.16/17 section) — **both are included in this project's tauri 2.10.1** [source](https://github.com/tauri-apps/tauri/blob/dev/packages/api/CHANGELOG.md)
- **Platform support matrix**: the underlying call is tao's `drag_resize_window`; official docs note "**macOS / iOS / Android:** Always returns an `ExternalError::NotSupported`" (the macOS implementation unconditionally returns `Err(NotSupported)` and discards the direction argument) [source](https://github.com/tauri-apps/tao/blob/dev/src/window.rs), [macOS stub source](https://github.com/tauri-apps/tao/blob/dev/src/platform_impl/macos/window.rs). Windows and Linux are supported; Linux has real-world evidence (the [tauri#16266](https://github.com/tauri-apps/tauri/issues/16266) author tested it working).
- **Implication for this project**: on macOS you can't build handles on `startResizeDragging`, but macOS native edge resizing already works (§1.3); combined, all three platforms have an answer: Windows/macOS use the native edge, and Linux DEs where the native edge fails can add self-drawn handles as a fallback (or skip them and just record a known issue).

### 2.2 tauri-plugin-decorum: a titlebar plugin; provides no resize handles

- Supports Tauri 2 (latest 1.1.1 on crates.io); positioned as "custom titlebars while keeping native behavior (Windows Snap Layout, macOS traffic-light insets, transparent overlay titlebars, etc.)"; the author declares the project in maintenance mode (no breaking API changes, bugfix/architecture improvements only) [source](https://github.com/clearlysid/tauri-plugin-decorum), [docs.rs](https://docs.rs/crate/tauri-plugin-decorum/latest)
- **Reading its README (v1.1.1) end to end, there is no resize-handle feature at all** (the word "resize" never appears) — its premise is precisely that Tauri already ships undecorated edge resizing; the plugin only manages titlebars/window controls. **Unnecessary for this issue**.

### 2.3 The cost of purely self-drawn handles (cursor tracking + `setSize`) as a fallback

- Worth considering only if both of the above fail: you lose the system resize's follow feel and snap; you must handle 8 direction cursors, pointer capture, DPI rounding, and the feedback loop with `onResized` yourself; per-frame IPC `setSize` risks jitter on low-end machines. **Verdict: not recommended** — for the isolated Linux DE problem, fall back to `startResizeDragging` first.

---

## 3. Window size constraints: min/max apply to dragging, but **cannot be configured statically** (a local design constraint)

- `WindowConfig` provides `minWidth/minHeight/maxWidth/maxHeight` (logical pixels), set on the window itself (mapping to tao's min/max inner size); they **apply to user drag-resizing**, not just JS `setSize` [source](https://docs.rs/tauri-utils/latest/tauri_utils/config/struct.WindowConfig.html)
- **The key local conflict**: the same `todo` window is reused in two modes — `classifyByHeight` in `src/pages/todo/index.vue` treats `height < 200` as mini mode, and `SHOW_TODO_MINI` programmatically calls `setSize(380×130)`. If `minHeight > 200` were set statically in `tauri.conf.json` (to keep panel mode from being dragged into the mini misjudgment zone), **mini mode's `setSize(380×130)` would also be clamped** (on Windows, size constraints apply to programmatic changes via `WM_GETMINMAXINFO`), outright breaking mini mode.
- **Solution**: runtime dynamic constraints. The official JS APIs `setMinSize(size | null)` / `setMaxSize(size | null)` accept `null`/`undefined` to **clear the constraint** (`setMaxSize` docs literally: "If the `size` argument is undefined, the constraint is unset") [source](https://github.com/tauri-apps/tauri/blob/dev/packages/api/src/window.ts)
- **Suggested values** (set when panel mode activates; cleared before entering mini):
  - `minWidth` 380 (keep the current width floor, the viewBox reference width of MiniInput/PaperPanel); `minHeight` **> 200**, suggest 240 (headroom so a drag can't drop into the mini misjudgment zone, and the header + at least one todo stay visible);
  - `maxWidth` ~600 and `maxHeight` ~800 suggested (a hand-drawn panel loses visual density when stretched too large; pin exact values when opening the ticket, or skip the caps).
  - While in mini mode, also `setResizable(false)` and re-enable on returning to panel, fully avoiding cross-mode interference.

---

## 4. Size persistence: store it ourselves in pinia; skip the window-state plugin

### 4.1 Conflicts between tauri-plugin-window-state (official plugin) and this project's architecture

- Plugin behavior: once registered, **all windows** save state on close and restore on create; `StateFlags` bit flags control which dimensions are saved/restored — `SIZE`, `POSITION`, `MAXIMIZED`, `VISIBLE`, `DECORATIONS`, `FULLSCREEN` are **independent bits** and composable (e.g. `StateFlags::SIZE` manages size only); the default `Builder` uses `StateFlags::all()` [source](https://docs.rs/tauri-plugin-window-state/latest/tauri_plugin_window_state/struct.StateFlags.html), [README](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/window-state)
- **Pitfalls for this project**:
  1. **Fights the "programmatically position anchored to the cat on every open" design**: `SHOW_TODO_FULL` always does `setSize` + `setPosition` based on the cat. The plugin restores only once at window creation — the restored position is immediately overwritten by the cat anchoring (pointless), and the restored size is immediately overwritten by `setSize(FULL_SIZE)` (unless the open logic is rewritten to read plugin state, at which point you might as well store it yourself). "Restore size only, not position" is technically possible (`StateFlags::SIZE`) but doesn't change the essential conflict of "restore timing vs programmatic-set timing".
  2. **`VISIBLE` is saved/restored by default**: this project's todo/preference/bubble windows all start `visible: false` and show on demand. With default flags, exiting while a window is visible may cause the plugin to restore it visible at next startup (inferred from `VISIBLE` being in StateFlags and the default `all()` — **needs a small real test before landing**, but already enough to count as a risk). Avoiding it means narrowing the flags, but flags are Builder-level globals, and the knock-on effect on the main (cat) window must also be considered.
  3. Data lands in the plugin's own file, bypassing the project's unified pinia persistence pipeline.
- Verdict: **not recommended**.

### 4.2 Store it ourselves in pinia (tauri-plugin-pinia, already in use) — recommended

- Approach: add `panelSize: LogicalSize | null` to the todo store; on `SHOW_TODO_FULL`, use `panelSize ?? FULL_SIZE` instead of the constant; on `onResized` (panel mode, not caused by programmatic setSize, debounced ~300ms), write `outerSize().toLogical(scaleFactor)`.
- **outerSize/innerSize parity**: this window is `decorations: false` with no system frame, so `outerSize() == innerSize()` (Windows undecorated has no non-client area; likewise borderless windows on Linux/macOS); existing local code (`classifyByHeight`, the cat-anchoring math) already uniformly uses `outerSize()` — keep it and don't agonize over the distinction.
- **Mind DPI**: existing constants are `PhysicalSize`; persist **logical** sizes for steadier restoration across monitor/DPI changes, converting to physical via the current `scaleFactor` on open.
- Fits the existing architecture exactly: zero new dependencies, zero new permissions (`onResized`/`outerSize` are within `core:window:default`'s read-only scope; the `setSize` permission is already granted) [source](https://github.com/tauri-apps/tauri/blob/dev/packages/api/src/window.ts)

### 4.3 Comparison

| Dimension | window-state plugin | Self-stored pinia |
| ------------------------ | -------------------------------- | -------------------------- |
| New dependencies | +1 Rust crate +1 npm package | None |
| Coexistence with cat-anchored positioning | Conflicts (restore-timing mismatch) | Natural (reads the store on open) |
| Size only | Possible (`StateFlags::SIZE`) but global config | Natural |
| Impact on other windows | Global by default; flags need narrowing | None |
| Fit with the mini/panel dual modes | Unaware; needs hacks | Precise per-mode control |

---

## 5. Degradation analysis of the hand-drawn SVG border at arbitrary aspect ratios (with the author's design constraints)

### 5.1 Confirmed degradation points in the current state (`preserveAspectRatio="none"` non-uniform scaling)

Local `PaperPanel/index.vue` (viewBox 0 0 360 540, `preserveAspectRatio="none"`, absolute inset:0) + SVG spec/MDN reasoning:

1. **Uneven stroke width**: SVG stroke width depends on the element's coordinate transforms; under non-uniform scaling a 2.5px hand-drawn border ends up thick on one side and thin on the other (MDN states stroke width depends on transforms, including non-uniform scaling) [source](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/vector-effect)
2. **Pattern grain dots become ellipses**: a `patternUnits="userSpaceOnUse"` 40×40 tile tiles in user-space coordinates; under non-uniform scaling the tile and its `r=0.3~0.4` dots get stretched into ellipses wholesale (fill geometry is unaffected by `vector-effect`; see 5.3) [source](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/patternUnits)
3. **Top decorations drift and deform**: the wave path (Q curves at y≈26–36) and the top-right dots (cx 320/330) have coordinates hard-coded in the viewBox system — widening the window stretches the wavelength and turns the dots into ellipses drifting from the corner; narrowing squeezes them into overlap.

### 5.2 The author's design constraints (given by the issue #19 handler; the ranking basis for this section)

> **When stretched horizontally, the top/bottom edge bands (hand-drawn waves, dot decorations, border arcs) must scale proportionally and uniformly** (height grows in step with width; motifs must not deform); vertical stretching doesn't matter (the left/right edges are near-straight lines anyway and can stretch freely).

By this standard, the current state (whole-element `preserveAspectRatio="none"`) **fails** — widening flattens the top/bottom band motifs.

### 5.3 Mitigation options compared (re-ranked by the constraints)

- **c) 9-slice / three-section SVG — the recommended first choice**. Concretely:
  - **Top band** (waves, dot decorations, top border arcs; roughly y 0–60 in the mockup): `width: 100%` + CSS `aspect-ratio: 360 / 60` to lock the ratio → widening scales **the whole band proportionally** (satisfying the author's constraint), with the inner viewBox keeping the default `preserveAspectRatio` (scaling is naturally uniform when the box ratio equals the viewBox ratio);
  - **Bottom band** (bottom border arcs, roughly y 500–540; a ratio like 360/40) likewise;
  - **Middle section** (the left/right edges, already near-straight lines): a separate small SVG with `preserveAspectRatio="none"`, absolutely positioned between the bands via `inset: bandHeight 0 bandHeight2 0`, stretching freely vertically;
  - The three sections can be assembled with flex column (top fixed ratio, middle flex:1, bottom fixed ratio) or pure absolute positioning.
  - **CSS `aspect-ratio` compatibility** (raw MDN BCD data): Chrome/Edge **88+**, Firefox **89+**, Safari/iOS **15+** [source](https://developer.mozilla.org/en-US/docs/Web/CSS/aspect-ratio), [BCD data](https://github.com/mdn/browser-compat-data/blob/main/css/properties/aspect-ratio.json), [caniuse](https://caniuse.com/css-aspect-ratio). For the three WebViews:
    - Windows WebView2 (Chromium Evergreen): ≥88, satisfied since 2021, **no risk**;
    - macOS WKWebView: needs a macOS with Safari 15 (roughly macOS 10.15/11+). This project's bundle sets no `minimumSystemVersion` and takes Tauri's default **10.13** — on 10.13/10.14 `aspect-ratio` doesn't work. **To keep old macOS covered, replace the CSS with the nested-SVG equivalent below** (or raise the minimum system version; decide when opening the ticket);
    - Linux webkit2gtk: same engine family as Safari; aspect-ratio arrived with WebKit (the engine generation corresponding to Safari 15, roughly webkit2gtk 2.34 / 2021-09); Ubuntu 22.04 (2.40+) and Debian 12 (2.44) far exceed it. **This version mapping is inferred from engine versions, not verified machine by machine** (caniuse doesn't list webkit2gtk separately).
  - **Fallback (one sentence)**: the nested-`<svg>` equivalent — the outer layout embeds multiple child `<svg>` elements each with its own viewBox (default `xMidYMid meet`, uniform scaling); depends on no new CSS feature, 100% compatible, same effect as the aspect-ratio lock.
- **b) `vector-effect="non-scaling-stroke"` — demoted to an auxiliary tool**. MDN: it makes stroke width "not dependent on the transformations of the element (including non-uniform scaling)" and **only pins stroke width**; it changes no geometry — waves still flatten, dots still become ellipses, and pattern fills are unaffected (vector-effect applies to element strokes; pattern dots are fills) [source](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/vector-effect), [SVG2 spec](https://www.w3.org/TR/SVG2/coords.html#VectorEffectProperty). **Alone it fails the author's constraint**; after the three-section layout lands it can fine-tune any remaining uneven stroke (with bands scaling proportionally, it should theoretically be unneeded).
- **a) Accept slight stretching (the original author's comment position)**: fails the author's constraint, **rejected** (the comment position only covers "slight" stretching; the constraint flatly forbids motif deformation).
- **d) Regenerate the path with rough.js at live size**: the heaviest option — a new dependency + per-frame path recomputation on every resize; consider only if the three-section layout still disappoints, **not recommended**.
- **Side suggestion (optional)**: move the grain texture from SVG pattern to the container div's CSS background (a fixed-`background-size` radial-gradient dot grid), fully decoupling the texture from SVG scaling so it doesn't deform when the middle section stretches vertically.

### 5.4 MiniInput (viewBox 0 0 380×130) has the same problem

Same structure, same degradation points; but mini mode is best simply `setResizable(false)` (§3) — with a constant size there's nothing to rework; if mini ever becomes resizable, apply the same three-section approach.

---

## 6. Upstream precedent (ayangweb/BongoCat)

The following is read from `src-tauri/tauri.conf.json` at local `upstream/master` sync point `44f44bc` (the last upstream commit the fork merged):

- **The main (cat) window**: `transparent: true, decorations: false, skipTaskbar: true, alwaysOnTop: true, shadow: false, acceptFirstMouse: true, maximizable: false`, **no `resizable` set → defaults to `true`**. That is, the upstream main window has long been the "borderless + transparent + resizable" combination (nearly the same config as the todo window, which merely adds `resizable: false`).
- **Author's own words**: in upstream issue [#171](https://github.com/ayangweb/BongoCat/issues/171) (closed, "New requirement: Add size adjustment function") the author replied: **"Currently, the window can be resized by dragging its edges. We plan to optimize the drag behavior in future updates."** — upstream releases (Win/macOS/Linux) actually support edge-drag resizing, and they've listed "optimize the drag behavior" as a TODO, showing the combination works for real users but has room for polish.
- **The preference window**: `titleBarStyle: "Overlay" + hiddenTitle + minWidth 800 + minHeight 600` — a precedent for a **decorated** window (macOS-style overlay titlebar) with min constraints, not a transparent-window resize precedent.
- No other upstream issue about transparent-window resizing was found (`gh search issues --repo ayangweb/BongoCat resize` returns only #171).
- **Note**: upstream master has since been heavily restructured into a crates/ workspace (bongocat-app, bongocat-live2d, etc.) and its directory layout diverges from this fork; the conclusions above are taken from the fork's sync point. The upstream config cited here corresponds to commit `44f44bc` (recheckable via `git show 44f44bc:src-tauri/tauri.conf.json`).

---

## 7. Implementation recommendations (for opening a ticket; no code)

### 7.1 Recommended path

1. **Config changes** (the todo window in `src-tauri/tauri.conf.json`):
   - `resizable: false → true`;
   - **Do not** set `minWidth/minHeight/maxWidth/maxHeight` statically (it would clamp mini mode's 380×130; see §3); set them dynamically at runtime instead.
2. **Code changes**:
   - `src/pages/todo/index.vue`:
     - `SHOW_TODO_FULL` (panel open): `setMinSize(380×240)`, `setMaxSize(optional 600×800)`, `setResizable(true)`, `setSize(stored ?? FULL_SIZE)` (stored comes from pinia, logical → physical conversion);
     - `SHOW_TODO_MINI` (mini open): first `setResizable(false)` + `setMinSize(null)` + `setMaxSize(null)`, then `setSize(MINI_SIZE)`;
     - `onResized`: debounced write to pinia in panel mode (skip events caused by programmatic setSize); keep the `classifyByHeight` threshold at 200 (minHeight 240 > 200 already rules out misclassification at the root);
     - todo store (tauri-plugin-pinia): add a `panelSize: LogicalSize | null` field.
   - `PaperPanel/index.vue`: rework into three sections per §5.3's first choice (top band aspect-ratio 360/60 + bottom band + middle preserveAspectRatio="none"); if covering macOS 10.13/10.14 matters, use the nested `<svg>` implementation instead. MiniInput is untouched this round (mini isn't resizable).
   - Capability file: **not needed** this round (`core:window:allow-start-resize-dragging`; the native edge suffices on all three platforms); add it only if self-drawn handles are decided as a fallback for broken Linux DEs (note the API is NotSupported on macOS — handles would only work on Linux/Windows).
3. **Risk and QA checklist**:
   - Real Windows 10/11 machines: whether edge-drag resizing of a transparent window flickers/shows black edges (no current issue in the literature; needs hands-on testing, see §1.2); the feel of top-edge hit testing (tao#1170-related);
   - Linux: conflicts between the 5px band and list scrollbar clicks (similar feedback in tauri#9212); the band may fail on unusual DEs (fly-wm-like; tauri#16266 open) — decide between recording a known issue or adding `startResizeDragging` handles;
   - macOS: confirm whether 10.13/10.14 are still in the support matrix (decides aspect-ratio vs nested SVG); no residual CPU issue on Sequoia (tao#1191 fixed, included in 2.10.1);
   - Dual-mode regression: constraint state is correct after mini ↔ panel switching (not draggable in mini; draggable in panel with a floor of 240);
   - Persistence regression: resize → close and reopen → correct cat-anchored position + size retained; size restores sensibly after changing system scaling (stored as logical).

### 7.2 Explicitly out of scope (this round)

- No tauri-plugin-window-state (§4.1 conflicts);
- No tauri-plugin-decorum (no resize-handle feature, §2.2);
- No self-drawn cursor+setSize handles (§2.3);
- No rough.js dynamic redraw (§5.3-d).

### 7.3 Honestly-flagged uncertainties

- Visual behavior of transparent-window resizing on Win10/11: no current issue on record, **not verified on real machines**;
- The exact webkit2gtk version where `aspect-ratio` landed: **inferred** from WebKit engine versions (roughly 2.34+), not verified individually;
- The window-state plugin restoring `VISIBLE` making hidden windows appear at startup: **inferred** from the default `StateFlags::all()` (recorded for reference even though we're not adopting that approach);
- Edge resizing on non-GNOME Wayland compositors (KDE etc.): no primary data, unconfirmed.
