# Issue #19 Round 1 Decision Verification: 9-Slice Scaling of the Hand-Drawn Window Border

- Research date: 2026-11-04
- Issue: [ChHsiching/bongocat-todo#19](https://github.com/ChHsiching/bongocat-todo/issues/19)
- Research nature: **neutral verification** — for each of the five "9-slice hand-drawn window border scaling" design decisions proposed by the main session, find primary-source support and counter-evidence, and rule each one holds up / needs correction / inconclusive
- Prior document: [2026-11-03 research report](./2026-11-03-issue19-todo-window-resize.md) (window-layer conclusions are not re-verified); current code `src/plugins/todo/components/PaperPanel/index.vue` (a single SVG with viewBox 0 0 360 540, `preserveAspectRatio="none"`)
- Sources: W3C/WHATWG specification text, MDN (including raw BCD data), WPT (web-platform-tests) live results (the 2026-11-04 same-day master run), WebKit Bugzilla / Chromium issue tracker, wired-elements and Excalidraw official repo sources, Apple/Android/Unity official documentation

---

## TL;DR

| #   | Claim                                                                                                | Verdict                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | 9-slice (fixed corners + stretched edges) is the correct model for a resizable decorative border      | **Holds up**, but the wording needs correction: 9-slice is the industry standard of the *stretching family* (Apple/Android/Unity/CSS spec text all agree); the hand-drawn library ecosystem (wired-elements, Excalidraw) is actually mainstream-"redraw with rough.js on resize". Both routes have their niches; for ours (a window border resized by continuous dragging) 9-slice fits better — but that is "choosing 9-slice from within the stretching family", not "the universal practice of the hand-drawn world" |
| C2  | Non-periodic hand-drawn lines use stretch, not repeat (repeat shows seams at joins)                  | **Holds up**. Spec text confirms repeat does no remainder handling and tiles then cuts dead; round scales tiles (jumping as size changes), space leaves gaps. A third treatment (periodicizing the waveform, then repeat) does exist but doesn't fit continuous hand-drawn lines                                                                       |
| C3  | Adding `vector-effect="non-scaling-stroke"` to one-way-stretched border lines is the standard fix    | **Holds up (inline SVG context)**, with an explicit pitfall list. The SVG2 spec text explicitly covers non-uniform scaling; WPT live runs: Chrome all green, Safari/Firefox all green in the inline context; **counter-evidence**: when the SVG is referenced via `<img>`/background-image/border-image (image context), WebKit/Firefox currently FAIL — this directly drives the C5 route choice                                |
| C4  | "todo title lines lose readability past ~600 logical pixels", supporting maxWidth≈720                | **Needs correction**. W3C's Requirements for Chinese Text Layout gives "book body-text line length 17–40 characters, horizontal-writing cap 48, floor 10" — no "600px inflection point" concept. At the local 17px font size, **720px ≈ 40 characters, exactly the clreq book body-text upper edge — grounded**; "readability drops past 600px" should be deleted or downgraded to a rule of thumb                                                               |
| C5  | Implementation vehicle: border-image + SVG source vs hand-sliced 9-region inline SVG                 | **Recommend the hand-sliced three-strip/9-region inline SVG** (keeping yesterday's report direction). border-image + SVG is usable today (an Interop 2023 focus area) but has three hard flaws: slice numbers are in SVG source coordinates, not CSS logical pixels; non-scaling-stroke fails once the SVG becomes an image (C3 counter-evidence); filters/patterns/decorations get cut across regions, forcing a source redesign      |

---

## C1: Is 9-slice the right model?

### Verification process

**(1) Origin and usual domain of 9-slice** (primary official docs):

- **The CSS spec itself is a 9-slice model**. CSS Backgrounds & Borders Level 3 defines `border-image-slice` as: "This property specifies inward offsets ... **dividing it into nine regions: four corners, four edges and a middle**" ([spec §5.2](https://drafts.csswg.org/css-backgrounds-3/#border-image-slice)). That is, the web platform takes 9-slice as the standard layout model for border images.
- **Apple (official UIKit docs)**: `resizableImage(withCapInsets:)` — "you can use this method to create a background image for a button with borders and corners: **when the button is resized, the corners of the image remain unchanged, but the borders and center of the image expand to cover the new size**" ([Apple Developer Documentation](<https://developer.apple.com/documentation/uikit/uiimage/resizableimage(withcapinsets:)>)). The macOS counterpart is `NSImage.capInsets`.
- **Android (official tooling docs)**: Draw 9-patch is the WYSIWYG editor built into Android Studio, which "lets you create bitmap images that automatically resize to accommodate the contents of the view and the size of the screen. You can **scale selected parts of the image horizontally or vertically based on indicators drawn within the image**" ([developer.android.com/studio/write/draw9patch](https://developer.android.com/studio/write/draw9patch)).
- **Unity (official manual)**: the 9-slicing docs state "The four corners (A, C, G and I) do not change in size. The B and H sections stretch or tile horizontally..." ([Unity Manual: 9-slicing](https://docs.unity3d.com/Manual/sprite/9-slice/9-slicing.html), [9-slice a sprite](https://docs.unity3d.com/6000.0/Documentation/Manual/sprite/9-slice/set-sprite-9slicing.html)). Supporting reference: [Wikipedia: 9-slice scaling](https://en.wikipedia.org/wiki/9-slice_scaling).

Conclusion: 9-slice is a mature standard model shared by system UI (iOS bubbles/buttons, Android NinePatch), game UI, and CSS borders, used to "fit one image to any size while protecting the corners from deformation".

**(2) How hand-drawn libraries handle resize** (reading the official repo sources):

- **wired-elements (wiredjs)**: memory confirmed — it takes the "**redraw with rough.js after resize**" route, not 9-slice. Evidence (master branch sources):
  - [`src/wired-base.ts`](https://github.com/rough-stuff/wired-elements/blob/master/src/wired-base.ts): `wiredRender()` compares `canvasSize()` with `lastSize`; on any size change it **clears all svg child nodes**, resets width/height, and re-runs `draw()` (rough.js generates paths for the new size); each instance holds a fixed `seed` (`Math.floor(Math.random() * 2 ** 31)`), keeping output deterministic for a given size and the hand-drawn jitter style stable across resizes.
  - [`src/wired-card.ts`](https://github.com/rough-stuff/wired-elements/blob/master/src/wired-card.ts): uses a `ResizeObserver` to watch its own size (falling back to window resize) and calls `wiredRender()` directly in the callback, **unthrottled**.
  - [`src/wired-lib.ts`](https://github.com/rough-stuff/wired-elements/blob/master/src/wired-lib.ts): calls the roughjs renderer directly (`roughness: 1, bowing: 0.85` etc.).
- **Excalidraw**: same route. In [`packages/element/src/shape.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/shape.ts), `ShapeCache` caches rough.js Drawables per element in a WeakMap; when the element's size (width/height/seed/version) changes, the cache invalidates and regenerates via `RoughGenerator`. Excalidraw's frame (canvas-section container) border is not hand-drawn at all (a plain dashed rectangle), providing no precedent of a "resizable hand-drawn container".
- **papercss**: a pure CSS framework; the hand-drawn feel comes from ordinary CSS borders + irregular border-radius ([Borders & Shadows docs](https://www.getpapercss.com/docs/utilities/borders/)), stretching naturally with the box, with no resize-specific handling whatsoever — showing that "hand-drawn feel" is not strongly bound to either "9-slice" or "redraw".

**(3) Applicability comparison and choice between the two routes**:

| Dimension                | rough.js redraw (wired/Excalidraw route)                                                       | 9-slice stretch (system/game/CSS route)              |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Goal                     | Redistribute hand-drawn strokes at any size, keeping a "freshly drawn" feel                    | Protect corners and decorations from deformation; edges stretch one-way |
| Computation on resize    | JS recomputes paths + DOM rebuild on every size change (wired-card, unthrottled)               | Sliced once; afterwards pure render-layer scaling, zero JS |
| Suitable load            | Leaf-level small components (buttons/cards); layout-driven, non-continuous size changes        | Large continuously-resized containers (windows, bubbles, panels) |
| Pattern fidelity         | Each redraw slightly shifts the pattern (deterministic given a fixed seed)                     | Corners and decorations **strictly unchanged** (exactly the author's constraint) |

Our scenario is "a window border resized every frame while the user continuously drags an edge + the author's hard constraint (top-edge decorations scale proportionally on horizontal stretch; no deformation allowed)": the redraw route would clear and rebuild the SVG DOM and run rough.js every frame during the drag (WebView main-thread cost), and its output is "jitter varying continuously with size" rather than "fixed decoration"; the 9-slice route delegates the proportional constraint to layout (strips locked to aspect ratio) with zero JS during resize. **For us, 9-slice fits better**; the wired/Excalidraw redraw route serves "natural hand-drawn stroke density", and its component shape and constraints both differ from ours.

### Verdict: holds up (wording corrected)

- 9-slice has authoritative origins and cross-platform-consistent practice (four primary docs: Apple/Android/Unity/CSS); as the model for "arbitrarily resizable decorative borders" it is an industry standard, not an off-the-cuff guess.
- **Corrected wording**: one cannot say "the industry standard for hand-drawn UI is 9-slice" — hand-drawn libraries (wired-elements, Excalidraw) are actually redraw-mainstream. The correct statement: "within the **stretching family**, 9-slice is the standard; the redraw family suits leaf components and stroke redistribution, not window borders under continuous resize." When explaining to the author, cite the Apple/Android official docs (system-level precedent is the most persuasive).

---

## C2: Is stretch better than repeat for non-periodic hand-drawn lines?

### Verification process

**(1) Spec semantics** (CSS Backgrounds & Borders Level 3, the four-step algorithm in [§5.6 Drawing the Border Image](https://drafts.csswg.org/css-backgrounds-3/#border-image-process)):

- **repeat does no remainder handling whatsoever**: "If the first keyword is `repeat` or `space`, the top, middle, and bottom images are **not changed any further**"; then "The images are then **tiled to fill** their respective regions". That is, tiles are laid at their current size (after border-image-width scaling) and cut off where the region ends — **no automatic whitespace padding, no remainder stretching** (those are the other two keywords' behaviors, below).
- Under repeat, the first tile is additionally **centered** ("centered horizontally in their respective regions"), cut symmetrically on both sides.
- The other two values for comparison:
  - `round`: "the top, middle and bottom images are **resized in width, so that exactly a whole number of them fit**" — eliminates the remainder by slightly scaling tiles. Side effect: as the window size changes continuously, the tile scale factor jumps at whole-number breakpoints (a "breathing" feel).
  - `space`: "**any partial tiles are discarded** and the extra space distributed before, after, and between the tiles ... This can result in **empty border-image side regions**" — discards fragments and spreads the remaining gap evenly. A border line that must stay continuous gets visibly broken with gaps.
- The `border-image-repeat` property table is at [§5.5](https://drafts.csswg.org/css-backgrounds-3/#border-image-repeat) (the initial value is `stretch`).

**(2) Public precedent/corroboration**:

- MDN's official docs on `repeat`: "The value `repeat` will repeat the image across the border, **potentially clipping it if it doesn't fit perfectly** in the border area"; on `round`: "Image sections **might be stretched** for a proper fit" ([MDN blog: Border images in Interop 2023](https://developer.mozilla.org/en-US/blog/border-images-interop-2023/)).
- Unity 9-slicing's Tiled-Continuous mode explicitly states "The texture doesn't stretch. **The tiles at the edges might use cropped parts of the texture**" ([Unity Manual](https://docs.unity3d.com/6000.0/Documentation/Manual/sprite/9-slice/set-sprite-9slicing.html)) — the game-engine side likewise concedes "tiling = edge cropping".
- No dedicated bug report was found for CSS `border-image-repeat` join artifacts (the phenomenon is normal spec-defined behavior, not a bug); the spec text + MDN + Unity descriptions corroborate one another.

**(3) Does a third treatment exist**: yes — **periodicize the pattern**: design the hand-drawn waveform as a tileable tile with phase-continuous ends, then use repeat/round, or lay an SVG `<pattern>` across the region. Costs: the wavelength is locked to integer multiples of the tile width (no more proportional scaling), and the hand-drawn irregularity gets exposed by the periodic repetition. Inapplicable to our "top-edge decorations must scale proportionally" constraint.

### Verdict: holds up

The fate of a non-periodic continuous hand-drawn line among the four values: repeat cuts and shows seams, round scales tiles and jumps, space leaves gaps and breaks the line — only stretch guarantees continuity and seamlessness; the conclusion stands. Note for Round 2: if some future decoration **is itself discrete/periodic** (a row of dots, dashed stitching), repeat/round is actually the right choice and can be applied per region.

---

## C3: Is non-scaling-stroke the standard fix?

### Verification process

**(1) Exact SVG2 spec semantics** (primary text):

- [SVG2 painting §13.6 Vector effects](https://www.w3.org/TR/SVG2/painting.html#VectorEffects) defines `non-scaling-stroke`: "With the non-scaling-stroke vector effect, stroke outline shall be calculated in the **'host' coordinate space** instead of user coordinate system. More precisely: **the viewport coordinate system of the furthest ancestral SVG viewport**. ... The resulting visual effect of this modification is that **stroke width is not dependent on the transformations of the element (including non-uniform scaling and shear transformations) and zoom level**." — the spec text explicitly names **non-uniform scaling**.
- Introduced by SVG Tiny 1.2 and formalized in SVG2 ([SVG2 coords §8.13](https://www.w3.org/TR/SVG2/coords.html#VectorEffectProperty); property table `none | non-scaling-stroke | non-scaling-size | non-rotation | fixed-position`; the spec notes that the values other than `non-scaling-stroke` and `none` are "at risk of being dropped due to lack of implementations" — i.e., what browsers actually implement is non-scaling-stroke).
- The spec's own example is non-uniform scaling: comparing the stroke widths of three lines under `<g transform="scale(9,1)">` ([coords §8.13.3 example](https://www.w3.org/TR/SVG2/coords.html#VectorEffects)).
- Two spec-level caveats: a) host is "the viewport of the furthest ancestral SVG" — **CSS transforms applied after that viewport are not compensated**; b) "The vector-effect property has **no effect on transformations performed in a 3d rendering context**".

**(2) Compatibility matrix**:

- MDN BCD ([vector-effect entry](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/vector-effect); raw data [mdn/browser-compat-data `svg/global_attributes.json`](https://github.com/mdn/browser-compat-data/blob/main/svg/global_attributes.json)): **Chrome ≤80, Firefox ≤72, Safari ≤13.1** (≤ means at least supported by that version; the exact introduction version was not retro-verified).
- Mapping onto the three target WebViews:
  - Windows WebView2 (Chromium Evergreen): guaranteed since Chrome 80 (2020-02), **no risk**;
  - macOS WKWebView: Safari 13.1 requires macOS 10.15 (2020-03). This project's Tauri default `minimumSystemVersion` is 10.13 — **exact support on 10.13/10.14 unverified** (BCD only marks ≤13.1; WebKit's shapes implementation actually predates this, but there is no authoritative version table); needs QA, or a fallback that doesn't depend on it (the nested-SVG proportional approach);
  - Linux webkit2gtk: same engine as Safari. wpt.fyi provides no webkit2gtk product runs — **no primary verification possible**; by same-era engine inference, modern distros (Ubuntu 22.04's 2.40+, Debian 12's 2.44) far exceed the Safari 13.1-era engine — "inferred, not verified on real machines".
- **WPT live runs** (2026-11-04 same-day master run, [wpt.fyi](https://wpt.fyi/results/svg/painting/reftests/non-scaling-stroke-006.html)) — primary evidence closer to the present than BCD:
  - **Chrome 159 (dev)**: all 15 non-scaling-stroke tests **PASS** (including [006 viewBox + preserveAspectRatio=none](https://github.com/web-platform-tests/wpt/blob/master/svg/painting/reftests/non-scaling-stroke-006.html) and [007 nested SVG](https://github.com/web-platform-tests/wpt/blob/master/svg/painting/reftests/non-scaling-stroke-007.html)).
  - **Safari 255 preview (mac)**: the inline SVG cases (001/002/004/005/**006/007**) PASS; but **003 (svg element wrapped by a CSS transform) FAIL**, `non-scaling-stroke-non-uniform-scale` (SVG referenced inside an `<image>` + preserveAspectRatio=none) FAIL, `non-scaling-stroke-with-none-preserve-aspect-ratio` (also an image context) FAIL, `non-scaling-stroke-precision-loss` FAIL, and `non-scaling-stroke-transform-change-hittest` [1,2] (hit-test region mismatches the visuals after a transform change).
  - **Firefox 161 (nightly)**: all inline cases PASS (including 006/007, non-uniform-scale); **009 (SVG via background-image) / 010 (SVG via `<img>`) FAIL**.
- Bottom line: **inline SVG + `preserveAspectRatio="none"` (non-uniform viewBox stretching) + shapes** is the one scenario with WPT reftest coverage in all three engines, currently all green; **when an SVG is referenced as an image resource** (`<img>`, background-image, border-image), WebKit/Firefox remain unreliable today.

**(3) Known quirks/bugs**:

- **WebKit: long broken on text elements** — [webkit.org/b/139322](https://bugs.webkit.org/show_bug.cgi?id=139322) (opened 2014): vector-effect has no effect on `<text>`, unfixed for years; WebKit SVG maintainer Nikolas Zimmermann explained in the comments that a fix must cover both the legacy engine and LBSE (Layer-Based SVG Engine), linked to [b/258120](https://bugs.webkit.org/show_bug.cgi?id=258120) (LBSE font scaling ignores page zoom). Both bugs are now **RESOLVED FIXED** (fixes landed with the LBSE work, roughly 2022–2023 per the comments; landing versions not individually verified). Unreliable for text on older WebKit; our PaperPanel has only path/circle — unaffected.
- **Chromium (historical)**: [issues.chromium.org/40912001](https://issues.chromium.org/issues/40912001) (2014): non-scaling-stroke not applied on elements with `preserveAspectRatio="none"` — the ancestor of the image-context issue WPT still covers today; the inline context is now all green. Also [issues.chromium.org/41397192](https://issues.chromium.org/issues/41397192) (fails when JS dynamically changes scale, reported 2014; the tracker now requires login, status unverifiable) and blurring under 3D transforms [issues.chromium.org/40806937](https://issues.chromium.org/issues/40806937) (consistent with the spec's "no effect in 3D rendering contexts").
- **Mutually exclusive with dashed strokes**: [purecss.com practical write-up](https://purecss.com/examples/border-draw-button/) (official example): "Leave it off any stroke you are dashing, because **it moves the dash calculation into device pixels and cancels pathLength**" — non-scaling-stroke moves dash math into device pixels, breaking `pathLength` normalization. We have no dashed borders — unaffected.
- **DPI/scaled screens**: fixed stroke widths are established in the viewport coordinate system (CSS pixels); DPR only affects physical-pixel rasterization — 2.5px is still 2.5 CSS px on a 4K/150%-scaled screen, visually consistent with the other elements; **there is no implementation-level "strokes get thinner on 4K" problem**. What actually exists is a design-perception issue: once the whole window is enlarged, a constant-width line looks thin against the enlarged motifs (an inherent property of the 9-slice model; bitmap 9-slice is the same) — if that matters, tune stroke-width at a few discrete size stops.

### Verdict: holds up (the standard fix for the inline SVG context), with an implementation avoidance checklist

The spec explicitly covers non-uniform scaling, and the inline context has all-green WPT coverage across the three engines. When implementing, avoid:

1. **Don't expect it to work in image contexts** — once the SVG is referenced via `<img>`/background-image/**border-image**, WebKit/Firefox currently FAIL (a key basis for C5 rejecting the border-image route as a stroke rescue);
2. Don't wrap it in a container carrying a CSS transform (Safari 003 FAIL);
3. Don't use it on `<text>` (unreliable on old WebKit);
4. Don't combine it with stroke-dasharray/pathLength;
5. Exact support on macOS 10.13/10.14 is unverified; if QA can't cover it, record it as a known risk (or bypass it entirely with the nested-SVG proportional approach).

---

## C4: Is "readability drops past ~600 logical pixels of line width" grounded?

### Verification process

**(1) The authoritative primary source found: W3C Requirements for Chinese Text Layout (clreq)**. Its "page design / line length" section reads ([w3.org/TR/clreq](https://www.w3.org/TR/clreq/)):

> "As a general principle, line length should be set according to the typeface, layout, finished size, and medium, based on actual conditions. Generally, newspapers and periodicals have relatively short line lengths while books have longer ones; as a reference value, **the body-text line length of most books is set in the range of 17 to 40 characters. To avoid frequent line wraps and line-skipping during reading, body-text line length should be no less than 10 characters, and in horizontal writing no longer than 48 characters**, in vertical writing no longer than 55." (translated from the Chinese original)

(The official English on the same page: "the line length of body copy in most books is set in the range of 17 to 40 characters ... should not be less than 10 characters ... For horizontal writing mode, the line length of body copy should not exceed 48 characters.")

This is a formal W3C Working Group Note giving a directly citable range for CJK characters per line: **floor 10 characters, books commonly 17–40, hard horizontal-writing cap 48**.

**(2) Converted to this project** (local code facts: `TodoItem/index.vue` title `font-size: 17px`; CJK glyph width ≈ font size; `PaperPanel` side padding totals 44px):

| Line length                | Characters (17px)                 | Window width (+44px padding) | vs clreq                                                  |
| -------------------------- | --------------------------------- | ---------------------------- | --------------------------------------------------------- |
| 600px content width        | ≈ 35 characters                   | ≈ 644px                      | Upper-middle of the comfort zone                          |
| **maxWidth 720 (window)**  | ≈ 40 characters (676px content)   | 720px                        | **Exactly the top edge of the common book body range (40)** |
| 48-character cap           | 48 characters                     | ≈ 860px                      | clreq hard horizontal-writing cap                         |

**(3) Direct origin of "readability drops past ~600px"**: not found. The clreq text has no "readability drops past X characters/pixels" inflection statement (it only gives ranges and caps); no GB standard or readability research paper giving a 600px/CJK inflection was found either. The Latin typography classics (Bringhurst's 45–75 characters per line etc.) don't cover CJK — not applicable.

### Verdict: needs correction

- **maxWidth≈720 itself is grounded**: at a 17px font size it is ≈ 40 characters, exactly the top edge of the clreq book body line-length range — conservative and compliant; even relaxing to the clreq hard cap of 48 characters (≈ 860px window) stays within the spec's allowance.
- **The specific claim "readability drops past ~600 logical pixels" has no authoritative origin** and should be deleted or rewritten. Suggested phrasing: "Per W3C's Requirements for Chinese Text Layout, horizontal line length should not exceed 48 characters, and book body text commonly runs 17–40; this project's title font size is 17px, so maxWidth 720px corresponds to about 40 characters — the top of the common range."
- Two honesty notes: a) clreq's context is **book body text**; todo titles are short-line list items (mostly single-line, non-wrapping) — citing it is an analogy, not direct applicability; b) if titles are mostly single short lines, the practical benefit of the line-width constraint is bounding the visual width after wrapping and the window's overall visual density, not long-form reading efficiency.

---

## C5: Implementation vehicle pre-research (input for Round 2)

### Route a: CSS border-image + SVG source

**Feasibility basis**:

- border-image was named an [Interop 2023](https://wpt.fyi/interop-2023) focus area in 2023, with cross-browser behavior commitments ([MDN blog](https://developer.mozilla.org/en-US/blog/border-images-interop-2023/)); the current official example on MDN's `border-image-slice` page is itself an SVG source (`border-florid.svg` + percentage slices + px border-image-width).
- Historical bugs fixed: slicing incorrect when an SVG without intrinsic size is used as border-image ([WebKit b/139405](https://bugs.webkit.org/show_bug.cgi?id=139405), RESOLVED FIXED 2015); `fill` requires border-width>0 ([WebKit b/142650](https://bugs.webkit.org/show_bug.cgi?id=142650), RESOLVED FIXED). The 2015 W3C www-style mailing list recorded that year's Blink/WebKit inconsistencies in this scenario ([lists.w3.org 2015-Jun-0143](https://lists.w3.org/Archives/Public/www-style/2015Jun/0143.html)), corresponding to old Blink bugs 492485/493088.

**Three hard flaws (found in this verification)**:

1. **Slice value units are not CSS logical pixels**. Spec text: `<number>` "represent **pixels in the image (if the image is a raster image) or vector coordinates (if the image is a vector image)**" ([spec §5.2](https://drafts.csswg.org/css-backgrounds-3/#border-image-slice)) — for an SVG source the number is in SVG user coordinates; only percentages are "relative to the source image size" (MDN likewise recommends percentages for vector sources: [border-image-slice](https://developer.mozilla.org/en-US/docs/Web/CSS/border-image-slice)). Logical pixels can only be expressed via `border-image-width` (length/number multiples). This is not a bug but the model itself — yet it means "60 logical pixels of corner" must be assembled indirectly from "slice percentage × border-image-width", and as the window resizes the corner's displayed size is decided by border-image-width, with a conversion chain from the source viewBox that is easy to get wrong.
2. **Once inside border-image, the SVG is in an image context and non-scaling-stroke is unavailable** (C3's WPT counter-evidence: Safari/Firefox currently FAIL there). So uneven stroke thickness on one-way-stretched edges **has no vector-effect rescue** in the border-image route — the only fix is redesigning at the source level (drawing each edge's line individually at the correct thickness).
3. **Filters (feGaussianBlur shadows) and patterns (grain texture) need a full redesign once cut into the 9 regions**. Today's PaperPanel is one continuous path (shadow layer + main panel + top waves/dots spanning regions); after slicing, blurs in the stretch zones distort one-way, and decorations straddling a cut line get sliced in half — the source must be redrawn per "each region's responsibility", a workload comparable to hand-slicing, plus a layer of border-image semantics on top.

### Route b: hand-sliced 9-region/three-strip (inline SVG slices + grid/absolute layout)

- Combinations of nested/multiple svgs, each with its own `preserveAspectRatio`, **have platform test coverage**: WPT [non-scaling-stroke-007](https://github.com/web-platform-tests/wpt/blob/master/svg/painting/reftests/non-scaling-stroke-007.html) (a nested `<svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">` containing a vector-effect path) **PASSES** in the Chrome/Safari/Firefox same-day runs; 006 (root svg preserveAspectRatio="none") is likewise all-green across the three engines. A nested svg establishing an independent viewport/viewBox is spec behavior since SVG 1.1 ([SVG2 embedding](https://www.w3.org/TR/SVG2/embedded.html#.EmbeddedSVGContexts)), not a new feature.
- Known caveats (spec behavior, not bugs): nested svg defaults to `overflow: hidden`, so slice content must not exceed its own viewBox; adjacent slices each anti-aliasing can show hairline translucent seams at the joins — the usual countermeasures are overlapping adjacent slices by ~1px or letting fills cross the cut line.
- **Maps directly** onto the author's constraints (horizontal proportional, vertical free) — yesterday's report §5.3's three-strip design (top/bottom strips aspect-locked + middle stretched freely via `preserveAspectRatio="none"`) is an instance of this route, and fits the current reality ("the left/right edges are near-straight lines anyway") even better than a full 9-region grid.
- vector-effect, pattern, and filter can each be controlled per segment (add non-scaling-stroke only on the segment that stretches; the texture can move to a container CSS background per yesterday's suggestion).

### Verdict: recommend route b (hand-sliced three-strip/9-region inline SVG)

Rationale: it maps one-to-one onto the author's constraints; it avoids border-image's three hard flaws (especially non-scaling-stroke failing in image contexts — this alone makes route a unable to fix uneven stretch-zone strokes with vector effects); the inline SVG combination has three-engine WPT corroboration; changes concentrate in the single file `PaperPanel/index.vue`, matching this repo's "minimal upstream changes" architectural constraint. Route a is recorded as a viable alternative (pure CSS and zero layout code are its real advantages), but adopting it requires accepting a redrawn source and giving up vector stroke protection.

Side note (for Round 2, not expanded here): a hand-drawn shadow (feGaussianBlur) distorts one-way in the stretch zones on either route (bitmap 9-slice alike — an inherent cost of the model); if that matters, isolate the shadow as a uniformly-scaled layer of its own, or switch to CSS `filter: drop-shadow`/`box-shadow` (decoupled from border geometry, naturally free of directional issues).

---

## Overall opinion on the five Round 1 decisions

1. **C1 (9-slice model): keep**. Reword as "the industry standard among stretching-family solutions (the Apple/Android/Unity/CSS spec texts are all nine-region models); the hand-drawn libraries' resize-redraw route (confirmed in wired-elements/Excalidraw sources) suits leaf components and stroke redistribution, not continuously-dragged window borders". When reporting to the author, quoting Apple's `resizableImage(withCapInsets:)` and the CSS spec's "nine regions" text is the most persuasive.
2. **C2 (stretch over repeat): keep**. The spec's four-step algorithm confirms repeat does zero remainder handling and cuts dead; round/space each have side effects unfit for continuous lines. Addition: discrete/periodic decorations (dot rows etc.) can use repeat per region in the future.
3. **C3 (non-scaling-stroke): keep, with the avoidance checklist**. The inline SVG context is three-engine WPT all-green; the five pitfalls (image context, CSS-transform containers, text, dash, old macOS versions) go into the implementation notes. "Strokes get thinner on 4K/scaled screens" doesn't hold (viewport coordinates = CSS px, visually constant).
4. **C4 (maxWidth≈720): keep the number, rewrite the rationale**. The basis changes from "readability drops past 600px" (no origin, dropped) to "W3C clreq: horizontal ≤ 48 characters, book body commonly 17–40; at 17px font size, 720px ≈ 40 characters — the top of the range". If the author asks "why not wider": the clreq hard cap of 48 characters ≈ an 860px window can serve as the concession room.
5. **C5 (implementation vehicle): settled on route b** (hand-sliced three-strip inline SVG, i.e. yesterday's §5.3 plan), with border-image demoted to alternative, its three hard flaws noted. Round 2 proceeds per route b with the slice geometry (cut-line choices for the top band y 0–60 / bottom band y 500–540, the 1px anti-seam overlap, the shadow-layer handling).

### Honestly-flagged uncertainties

- Exact vector-effect support on macOS 10.13/10.14 (Safari < 13.1) and across webkit2gtk versions: BCD upper-bound markers + same-engine inference, **not verified on real machines**;
- The specific Safari version where WebKit b/139322's fix landed: bug status RESOLVED FIXED; fix timing inferred from the comments (the LBSE work) as roughly 2022–2023, release notes not checked;
- Chromium's new tracker (issues.chromium.org) requires login, so the current status of the two 2014 bugs could not be checked directly — but the corresponding scenarios are covered by current WPT runs (Chrome 159 all green), so the impact is limited;
- Applying clreq to a todo short-line list is an analogical citation (its original context is book body text); the report is flagged as an analogy.
