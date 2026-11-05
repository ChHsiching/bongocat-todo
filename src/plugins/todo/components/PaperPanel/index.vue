<script setup lang="ts">
/**
 * Paper container (PaperPanel): hand-drawn irregular border + pure white fill + a very faint
 * gray grain texture + a hand-drawn shadow.
 *
 * Since issue #19 the window is drag-resizable, so the border switched to **9-slice slicing**
 * (fixed corners + stretched edges), with the decorations (wave/dots) fixed in size and unscaled:
 * - Four corners (with hand-drawn Q arcs): standalone fixed 30×30 SVGs that keep their shape at any window size;
 * - Four edges: plain line segments (the original path is L segments), stretched one-way with
 *   preserveAspectRatio="none"; strokes add vector-effect="non-scaling-stroke" to keep a constant 2.5px width;
 * - Offset beige paper shadow (the original shadow path): stretched non-uniformly as a whole — the
 *   blurred look masks the distortion (the settled Round 1 tradeoff);
 * - Soft shadow: the original feGaussianBlur filter became a CSS drop-shadow on the container
 *   (decoupled from the border geometry, no directional distortion when stretched), with the
 *   parameters carried over (dx2 dy4 blur3 α0.12, α from SourceAlpha i.e. black);
 * - Paper grain texture: moved from an SVG pattern to a CSS radial-gradient dot matrix (fixed
 *   background-size; dots never distort at any aspect ratio);
 * - Wave/dot decorations: fixed-size overlays anchored to the paper's top-left/top-right corners;
 *   they move with the window but never scale.
 *
 * Slice geometry is lifted from the original path coordinates in
 * docs/designs/todo-panel-exploration/panel.html; slices butt together with a 2px overlap
 * (invisible for opaque same-color overprint, avoiding anti-aliasing seams).
 * Design basis: docs/research/2026-11-03-issue19-todo-window-resize.md §5 and
 * docs/research/2026-11-04-issue19-round1-verification.md (C1/C2/C3/C5).
 */
</script>

<template>
  <div class="paper-panel">
    <!-- Border slice layer: both the paper shadow and the soft shadow are applied as drop-shadows
         on this layer's composite outline (follows the 9-slice geometry, fits perfectly at any window
         size — replaces the old independently stretched SVG paper shadow, which stretched
         non-uniformly while dragging, detaching the corners from the paper with an eerie look) -->
    <div class="paper-frame">
      <!-- Four corners: fixed size; the viewBox takes the corresponding corner region of the original path (with stroke allowance) -->
      <svg
        class="corner corner-tl"
        viewBox="8 3 30 30"
      >
        <path
          class="fill"
          d="M 13.95 33 L 38 33 L 38 9.15 L 22 9 Q 16 8 14 10 Z"
        />
        <path
          class="ink"
          d="M 13.95 33 L 14 10 Q 16 8 22 9 L 38 9.15"
        />
      </svg>
      <svg
        class="corner corner-tr"
        viewBox="332 3 30 30"
      >
        <path
          class="fill"
          d="M 332 11.96 L 336 12 Q 344 14 343 20 L 343.08 33 L 332 33 Z"
        />
        <path
          class="ink"
          d="M 332 11.96 L 336 12 Q 344 14 343 20 L 343.08 33"
        />
      </svg>
      <svg
        class="corner corner-bl"
        viewBox="8 510 30 30"
      >
        <path
          class="fill"
          d="M 38 524.23 L 20 524 Q 12 522 13 516 L 13.02 510 L 38 510 Z"
        />
        <path
          class="ink"
          d="M 38 524.23 L 20 524 Q 12 522 13 516 L 13.02 510"
        />
      </svg>
      <svg
        class="corner corner-br"
        viewBox="332 510 30 30"
      >
        <path
          class="fill"
          d="M 345.94 510 L 346 520 Q 344 528 336 528 L 332 527.95 L 332 510 Z"
        />
        <path
          class="ink"
          d="M 345.94 510 L 346 520 Q 344 528 336 528 L 332 527.95"
        />
      </svg>

      <!-- Four edges: line segments stretched one-way (vector-effect keeps the stroke width).
           Note: positioning belongs to the div; the svg fills it at 100% — absolutely positioning
           the <svg> itself with left/right would fall back to the SVG intrinsic size (300×150),
           leaving the line under-drawn and transparent holes at the corners. -->
      <div class="edge edge-top">
        <svg
          preserveAspectRatio="none"
          viewBox="36 3 288 30"
        >
          <path
            class="fill"
            d="M 36 9.13 L 324 11.88 L 324 33 L 36 33 Z"
          />
          <path
            class="ink stretch"
            d="M 36 9.13 L 324 11.88"
          />
        </svg>
      </div>
      <div class="edge edge-bottom">
        <svg
          preserveAspectRatio="none"
          viewBox="36 507 288 33"
        >
          <path
            class="fill"
            d="M 36 524.20 L 324 527.85 L 324 507 L 36 507 Z"
          />
          <path
            class="ink stretch"
            d="M 36 524.20 L 324 527.85"
          />
        </svg>
      </div>
      <div class="edge edge-left">
        <svg
          preserveAspectRatio="none"
          viewBox="8 36 30 468"
        >
          <path
            class="fill"
            d="M 13.95 36 L 38 36 L 38 504 L 13.02 504 Z"
          />
          <path
            class="ink stretch"
            d="M 13.95 36 L 13.02 504"
          />
        </svg>
      </div>
      <div class="edge edge-right">
        <svg
          preserveAspectRatio="none"
          viewBox="332 36 30 468"
        >
          <path
            class="fill"
            d="M 343.08 36 L 345.92 504 L 332 504 L 332 36 Z"
          />
          <path
            class="ink stretch"
            d="M 343.08 36 L 345.92 504"
          />
        </svg>
      </div>

      <!-- Paper core: white fill + CSS grain dot matrix (fixed 40px tile; dots never distort with the window) -->
      <div class="paper-center" />
    </div>

    <!-- Decoration overlays: fixed size, anchored to corner points, not part of scaling -->
    <svg
      class="deco deco-wave"
      viewBox="38 24 64 12"
    >
      <path
        d="M 40 30 Q 50 26 60 30 T 80 30 T 100 30"
        fill="none"
        opacity="0.7"
        stroke="var(--pink)"
        stroke-linecap="round"
        stroke-width="2"
      />
    </svg>
    <svg
      class="deco deco-dots"
      viewBox="314 26 22 14"
    >
      <circle
        cx="320"
        cy="32"
        fill="none"
        opacity="0.6"
        r="3"
        stroke="var(--pink)"
        stroke-width="1.5"
      />
      <circle
        cx="330"
        cy="36"
        fill="var(--pink)"
        opacity="0.5"
        r="2"
      />
    </svg>

    <div class="paper-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.paper-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

/* Slice layer: contains only the paper geometry; the paper shadow and soft shadow both follow this layer's composite outline (fits at any size) */
.paper-frame {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  /* Double drop-shadow = the original visuals ported to CSS:
     1) offset beige paper shadow: the original standalone SVG path (#f0e8de@0.6, offset 2/4 no blur) → 0 blur drop-shadow;
     2) soft shadow: the original feGaussianBlur (dx2/dy4/blur3/α0.12) → 3px blur drop-shadow */
  filter: drop-shadow(2px 4px 0 rgba(240, 232, 222, 0.6)) drop-shadow(2px 4px 3px rgba(0, 0, 0, 0.12));
}

/* Slice common styles: fill and stroke */
.paper-frame .fill {
  fill: var(--paper);
  stroke: none;
}

.paper-frame .ink {
  fill: none;
  stroke: var(--ink);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.5;
}

/* One-way stretched edge lines: constant stroke width (SVG2 vector-effect; WPT all green across three engines for the inline case) */
.paper-frame .ink.stretch {
  vector-effect: non-scaling-stroke;
}

.corner {
  position: absolute;
  width: 30px;
  height: 30px;
}

/* Calibrated positioning offsets: in the original design the paper carries a built-in margin inside
   the 360×540 viewBox (left border at x≈13.5, top at y≈9.5, right ≈346, bottom ≈528). Placing the
   9-slice pieces flush at container 0 would inflate the paper by ~6px (default size and baseline
   drift). The offsets below calibrate the border lines back to the original geometry:
   left piece +8px, right piece -2px, top piece +3px (both sides calibrated by measured pixels),
   bottom piece 0 (measured aligned to the baseline x=24/353). */
.corner-tl {
  left: 8px;
  top: 3px;
}
.corner-tr {
  right: -2px;
  top: 3px;
}
.corner-bl {
  left: 8px;
  bottom: 0;
}
.corner-br {
  right: -2px;
  bottom: 0;
}

.edge {
  position: absolute;
}

/* svg fills the positioning div (the div handles the stretch geometry, the svg handles the drawing) */
.edge svg {
  display: block;
  width: 100%;
  height: 100%;
}

/* Butts with a 2px overlap onto the corner pieces (invisible for same-color opaque overprint); left/right include the calibrated positioning offsets */
.edge-top {
  top: 3px;
  left: 36px;
  right: 26px;
  height: 30px;
}

.edge-bottom {
  bottom: 0;
  left: 36px;
  right: 26px;
  height: 33px;
}

.edge-left {
  left: 8px;
  top: 31px;
  bottom: 28px;
  width: 30px;
}

.edge-right {
  right: -2px;
  top: 31px;
  bottom: 28px;
  width: 30px;
}

/* Paper core: overlaps the edge fills by 2px; the grain dot matrix = the original SVG pattern
   ported to CSS (4 dots per 40px tile: r0.4@0.18 ×2 + r0.3@0.14 ×2; color = --ink-faint #c4b5a0;
   this panel is fixed to the light palette with no dark mode, so hardcoding is acceptable) */
.paper-center {
  position: absolute;
  inset: 28px;
  background-color: var(--paper);
  /* Round radii to whole pixels so the dots survive rasterization: sub-pixel radii (the 0.4px tier)
     + low alpha get diluted by AA and quantized to pure white (the grain vanishes entirely), so a
     1px radius + halved alpha approximates the original r0.4@0.18 visual weight */
  background-image:
    radial-gradient(circle 1px at 8px 12px, rgba(196, 181, 160, 0.1) 99%, transparent),
    radial-gradient(circle 0.8px at 28px 6px, rgba(196, 181, 160, 0.08) 99%, transparent),
    radial-gradient(circle 1px at 18px 30px, rgba(196, 181, 160, 0.1) 99%, transparent),
    radial-gradient(circle 0.8px at 35px 25px, rgba(196, 181, 160, 0.08) 99%, transparent);
  background-size: 40px 40px;
  background-repeat: repeat;
}

/* Decoration overlays: fixed size, fixed corner offsets (offsets from the original design coordinates), never scale with the window */
.deco {
  position: absolute;
  z-index: 0;
  pointer-events: none;
}

.deco-wave {
  left: 40px;
  top: 24px;
  width: 64px;
  height: 12px;
}

.deco-dots {
  right: 26px;
  top: 26px;
  width: 22px;
  height: 14px;
}

.paper-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 26px 22px 22px;
}
</style>
