# ADR 0003: Drag-to-Resize Hand-Drawn Windows — Window Layer, 9-Slice Border, and Edge-Hugging Resize Handles

- **Status**: Proposed (move to Accepted after the author's final acceptance)
- **Date**: 2026-11-04
- **Decision driver**: @ChHsiching
- **Relates to**: [issue #19](https://github.com/ChHsiching/bongocat-todo/issues/19), ADR 0001 (todo plugin architecture), docs/research/2026-11-03-issue19-todo-window-resize.md, docs/research/2026-11-04-issue19-round1-verification.md

## Context

issue #19 (filed by fanyxcdoc): the todo panel is fixed at 380×560 with `resizable:false`; it's too small when there are many todos or long titles. The request: support drag-to-resize and remember the size.

Two rounds of primary-source research (tauri/tao/wry source and issues, W3C/MDN/WPT, upstream BongoCat, wired-elements/Excalidraw sources) concluded:

1. Tauri 2 has built-in edge-drag resizing for `decorations:false + resizable:true` (Windows sub-window hit testing / macOS native system behavior / Linux GTK); the upstream main window uses exactly this combination with production proof.
2. The hand-drawn border cannot be hard-stretched as a whole with `preserveAspectRatio="none"`: the author's constraint is "**when stretched horizontally, the top/bottom edge motifs scale proportionally without deformation; vertically anything goes (the left/right edges are straight lines anyway)**", later tightened to "**motifs simply stay at fixed size with no scaling; only the border lines stretch**".
3. The width cap is grounded: W3C's Requirements for Chinese Text Layout gives a body-text line length of 17-40 characters (horizontal-writing cap of 48); at a 17px font size, 720px ≈ 40 characters, taking the upper edge.

## Decision

### D1. Window layer: `resizable:true` + runtime dynamic min/max

- In `tauri.conf.json`, change only `resizable:true` and do **not** configure static min/max — the same `todo` window is reused in two modes, and a static `minHeight>200` would clamp the mini mode's programmatic `setSize(380×130)` (on Windows, size constraints apply to programmatic changes too).
- On panel open, `setMinSize(380×280)` and `setMaxSize(720×8192)` (280 = the measured minimum height that fully shows one todo and is > the mini-mode threshold of 200; no typographic basis for a real height cap); before entering mini, `setResizable(false)` + clear the constraints.
- Size persistence goes through the existing tauri-plugin-pinia (`panelSize`, logical px, converted by the current scaleFactor on reopen), not the official window-state plugin — it fights the "anchored to the cat on every open" positioning and risks restoring `VISIBLE`, dragging hidden windows back on screen.

### D2. Border visuals: 9-slice slicing (the core of this ADR)

**Why 9-slice instead of the hand-drawn-library mainstream "redraw with rough.js on resize"**:

- 9-slice is the cross-platform standard of the stretching family (the CSS `border-image` spec itself is the nine-region model; Apple `resizableImage(withCapInsets:)`; Android NinePatch; Unity 9-slicing).
- The redraw route (confirmed in wired-elements/Excalidraw sources) serves "natural stroke density at any size": every resize clears and rebuilds the SVG DOM and runs rough.js — unfit for a window border resized by continuous dragging (per-frame WebView main-thread cost), and its output is jitter that varies continuously with size rather than a fixed decoration, violating the author's hard "motifs must not deform" constraint.
- This panel's border makes 9-slice nearly free: the original path's four edges **are already straight L segments** (the hand-drawn feel comes from the four corner Q arcs); only the corners need protecting.

Concrete implementation (`PaperPanel/index.vue`):

- Four fixed 30×30 corner SVGs (Q arcs never deform); four straight-edge SVGs stretched one-way with `preserveAspectRatio="none"` + `vector-effect="non-scaling-stroke"` for a constant 2.5px stroke (WPT all green across the three engines for inline SVG); slices overlap 2px at the seams (invisible overprinting of the same opaque color).
- Motifs (waves/dots) = fixed-size overlays anchored to the top-left/top-right corners; they move with the window but never scale.
- The grain texture moves from SVG pattern to a CSS radial-gradient dot grid (sub-pixel radii get quantized away by AA; use whole-pixel radii + reduced opacity, calibrated); the soft shadow moves from feGaussianBlur to CSS `drop-shadow` (decoupled from geometry, no directional distortion); the offset beige paper shadow stays as a bottom layer stretched as a whole (the blurry look masks the deformation — a tradeoff the author approved).
- The implementation vehicle is hand-sliced inline SVG, not CSS `border-image`: in the latter, slice units are SVG source coordinates rather than CSS logical pixels; once an SVG enters an image context, `non-scaling-stroke` still FAILs on WebKit/Firefox (it cannot save stretched-edge strokes); and filters/patterns get cut across regions, requiring a redrawn source.

### D3. Resize handles hugging the visual border (driven by author acceptance feedback)

Native hit zones hug the window's outer edge; the hand-drawn window's ~24px transparent page margin leaves the handles "hanging in the void". Added a generic `ResizeHandles` component: 8 invisible handles inset per-direction to hug the visible border line of the paper; mousedown goes through `startResizeDragging` (Win/Linux; macOS NotSupported silently falls back to the native edge). Insets are calibrated per-pixel against each window's baseline (todo L24/R27/T21/B26; mail L20/R22/T18/B19 — the mail page's root class `bubble-handdrawn` carries its own 8px padding, which must be counted in the calibration).

### D4. Rollout to the mail windows (same author feedback)

mail-list / mail-archive (borderless, transparent, content windows) reuse the full approach: MailPanel (a clone of the old PaperPanel, 400×560) gets the same 9-slice treatment + baseline calibration; a `useResizablePanel` composable carries the shared constraint/restore/persistence logic for single-mode windows; sizes persist in mailSettings. The bubble (a transient notification bubble, 360×60, on screen for seconds) gets no resize — its fixed size is part of its interaction semantics.

## Consequences

- The default 380×560 appearance matches the pre-change baseline (verified via dual-axis vision + pixel-density calibration); borders/decorations don't deform across the 380-720 width range.
- Future hand-drawn windows (e.g. mail cards) should reuse this approach by extracting a `PaperNineSlice` shared component; not extracted this round (single consumer).
- `vector-effect`/edge dragging on macOS 10.13/10.14 and non-GNOME Wayland are unverified on real machines; recorded as QA known issues.
- Test assets banked: `scripts/qa/` (real-mouse e2e + CDP orchestration + Win32 assertions + screenshots) and `docs/screenshots/issue19/before|after` (regression baselines). The `--remote-debugging-port` debug flag needed for QA is **added locally and temporarily only, never committed** (under the same user-data-dir, WebView2 silently kills webviews created later if browserArgs differ — the three windows must share identical args; a pitfall hit this round, see the research report).
