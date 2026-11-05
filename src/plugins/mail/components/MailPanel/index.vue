<script setup lang="ts">
</script>

<template>
  <div class="mail-panel">
    <div class="mail-frame">
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
        viewBox="372 3 30 30"
      >
        <path
          class="fill"
          d="M 372 11.97 L 376 12 Q 384 14 383 20 L 383.07 33 L 372 33 Z"
        />
        <path
          class="ink"
          d="M 372 11.97 L 376 12 Q 384 14 383 20 L 383.07 33"
        />
      </svg>
      <svg
        class="corner corner-bl"
        viewBox="8 530 30 30"
      >
        <path
          class="fill"
          d="M 38 544.20 L 20 544 Q 12 542 13 536 L 13.02 530 L 38 530 Z"
        />
        <path
          class="ink"
          d="M 38 544.20 L 20 544 Q 12 542 13 536 L 13.02 530"
        />
      </svg>
      <svg
        class="corner corner-br"
        viewBox="372 530 30 30"
      >
        <path
          class="fill"
          d="M 385.94 530 L 386 540 Q 384 548 376 548 L 372 547.95 L 372 530 Z"
        />
        <path
          class="ink"
          d="M 385.94 530 L 386 540 Q 384 548 376 548 L 372 547.95"
        />
      </svg>

      <!-- Four edges: line segments stretched one-way (vector-effect keeps the stroke width).
           Note: positioning belongs to the div; the svg fills it at 100% — absolutely positioning
           the <svg> itself with left/right would fall back to the SVG intrinsic size (300×150),
           leaving the line under-drawn and transparent holes at the corners. -->
      <div class="edge edge-top">
        <svg
          preserveAspectRatio="none"
          viewBox="36 3 328 30"
        >
          <path
            class="fill"
            d="M 36 9.12 L 364 11.90 L 364 33 L 36 33 Z"
          />
          <path
            class="ink stretch"
            d="M 36 9.12 L 364 11.90"
          />
        </svg>
      </div>
      <div class="edge edge-bottom">
        <svg
          preserveAspectRatio="none"
          viewBox="36 527 328 33"
        >
          <path
            class="fill"
            d="M 36 544.18 L 364 547.87 L 364 527 L 36 527 Z"
          />
          <path
            class="ink stretch"
            d="M 36 544.18 L 364 547.87"
          />
        </svg>
      </div>
      <div class="edge edge-left">
        <svg
          preserveAspectRatio="none"
          viewBox="8 36 30 494"
        >
          <path
            class="fill"
            d="M 13.95 36 L 38 36 L 38 524 L 13.08 524 Z"
          />
          <path
            class="ink stretch"
            d="M 13.95 36 L 13.08 524"
          />
        </svg>
      </div>
      <div class="edge edge-right">
        <svg
          preserveAspectRatio="none"
          viewBox="372 36 30 494"
        >
          <path
            class="fill"
            d="M 383.09 36 L 385.83 524 L 372 524 L 372 36 Z"
          />
          <path
            class="ink stretch"
            d="M 383.09 36 L 385.83 524"
          />
        </svg>
      </div>

      <div class="mail-center" />
    </div>

    <svg
      class="deco deco-wave"
      viewBox="38 24 46 12"
    >
      <path
        d="M 40 30 Q 50 26 60 30 T 80 30"
        fill="none"
        opacity="0.7"
        stroke="var(--pink)"
        stroke-linecap="round"
        stroke-width="2"
      />
    </svg>

    <div class="panel-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.mail-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

/* Segment layer: paper shadow + soft shadow via double drop-shadow (space-separated! a comma invalidates the whole declaration) */
.mail-frame {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  filter: drop-shadow(2px 4px 0 rgba(240, 232, 222, 0.6)) drop-shadow(2px 4px 3px rgba(0, 0, 0, 0.12));
}

.mail-frame .fill {
  fill: var(--paper);
  stroke: none;
}

.mail-frame .ink {
  fill: none;
  stroke: var(--ink);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.5;
}

.mail-frame .ink.stretch {
  vector-effect: non-scaling-stroke;
}

.corner {
  position: absolute;
  width: 30px;
  height: 30px;
}

/* Baseline-calibrated offsets (converged by measurement: L20/R378/T17.5/B539) */
.corner-tl {
  left: 8px;
  top: 4px;
}
.corner-tr {
  right: -4px;
  top: 4px;
}
.corner-bl {
  left: 8px;
  bottom: -2px;
}
.corner-br {
  right: -4px;
  bottom: -2px;
}

.edge {
  position: absolute;
}

.edge svg {
  display: block;
  width: 100%;
  height: 100%;
}

/* 2px overlap with the corner segments (including calibration offsets) */
.edge-top {
  top: 4px;
  left: 36px;
  right: 24px;
  height: 30px;
}

.edge-bottom {
  bottom: -2px;
  left: 36px;
  right: 24px;
  height: 33px;
}

.edge-left {
  left: 8px;
  top: 32px;
  bottom: 20px;
  width: 30px;
}

.edge-right {
  right: -4px;
  top: 32px;
  bottom: 20px;
  width: 30px;
}

.mail-center {
  position: absolute;
  top: 24px;
  right: 26px;
  bottom: 15px;
  left: 26px;
  background-color: var(--paper);
  background-image:
    radial-gradient(circle 1px at 8px 12px, rgba(196, 181, 160, 0.1) 99%, transparent),
    radial-gradient(circle 0.8px at 28px 6px, rgba(196, 181, 160, 0.08) 99%, transparent),
    radial-gradient(circle 1px at 18px 30px, rgba(196, 181, 160, 0.1) 99%, transparent);
  background-size: 40px 40px;
  background-repeat: repeat;
}

.deco {
  position: absolute;
  z-index: 0;
  pointer-events: none;
}

.deco-wave {
  left: 36px;
  top: 23px;
  width: 46px;
  height: 12px;
}

.panel-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 24px 22px 20px;
}
</style>
