<script setup lang="ts">
/**
 * 纸张容器（PaperPanel）：手绘不规则边框 + 纯白底 + 极淡灰颗粒纹理 + 手绘阴影。
 *
 * issue #19 起窗口可拖拽调整大小，边框改为 **9-slice 分片**（角固定 + 边拉伸），
 * 图案（波浪/圆点）固定大小不缩放：
 * - 四角（含手绘 Q 弧线）：固定 30×30 的独立 SVG，任何窗口尺寸下不变形；
 * - 四边：纯直线段（原 path 即 L 段），preserveAspectRatio="none" 单向拉伸，
 *   描边加 vector-effect="non-scaling-stroke" 保持 2.5px 恒定粗细；
 * - 错位米色纸影（原 shadow path）：整体非均匀拉伸——模糊观感掩盖形变（Round 1 既定取舍）；
 * - 柔化阴影：原 feGaussianBlur filter 改容器 CSS drop-shadow（与边框几何解耦、
 *   拉伸无方向性畸变），参数照搬（dx2 dy4 blur3 α0.12，α 源自 SourceAlpha 即黑）；
 * - 纸面颗粒纹理：从 SVG pattern 挪到 CSS radial-gradient 点阵（固定 background-size，
 *   任何长宽比下圆点不变形）；
 * - 波浪/圆点装饰：固定尺寸 overlay，锚定纸片左上/右上角，随窗口移动但不缩放。
 *
 * 切片几何抠自 docs/designs/todo-panel-exploration/panel.html 的原始 path 坐标，
 * 分片按 2px 重叠对接（不透明同色叠印不可见，规避抗锯齿接缝）。
 * 方案依据：docs/research/2026-11-03-issue19-todo-window-resize.md §5、
 * docs/research/2026-11-04-issue19-round1-verification.md（C1/C2/C3/C5）。
 */
</script>

<template>
  <div class="paper-panel">
    <!-- 边框分片层：纸影与柔化阴影都以 drop-shadow 作用于本层合成轮廓
         （跟随 9-slice 几何，任何窗口尺寸都严丝合缝，替代旧的独立拉伸 SVG 纸影——
         那个在拖拽时非均匀拉伸，角部与纸片分家、观感诡异） -->
    <div class="paper-frame">
      <!-- 四角：固定尺寸，viewBox 取原 path 对应角区（含描边余量） -->
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

      <!-- 四边：直线段单向拉伸（vector-effect 保描边粗细）。
           注意：定位交给 div，svg 在 div 内 100% 填充——直接给 <svg> 设 left/right
           绝对定位会回退到 SVG 固有尺寸（300×150），导致边线画不满、角落露透明洞。 -->
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

      <!-- 纸心：白底 + CSS 颗粒点阵（固定 40px tile，圆点不随窗口形变） -->
      <div class="paper-center" />
    </div>

    <!-- 图案 overlay：固定尺寸，锚定角点，不参与缩放 -->
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

/* 分片层：只含纸片几何；纸影与柔化阴影都随本层合成轮廓走（任何尺寸贴合） */
.paper-frame {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  /* 双层投影 = 原视觉的 CSS 化：
     1) 错位米色纸影：原独立 SVG path（#f0e8de@0.6，偏移 2/4 无模糊）→ 0 blur drop-shadow；
     2) 柔化阴影：原 feGaussianBlur（dx2/dy4/blur3/α0.12）→ 3px blur drop-shadow */
  filter: drop-shadow(2px 4px 0 rgba(240, 232, 222, 0.6)) drop-shadow(2px 4px 3px rgba(0, 0, 0, 0.12));
}

/* 分片公共：填充与描边 */
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

/* 单向拉伸的边线：描边宽度恒定（SVG2 vector-effect，inline 场景三引擎 WPT 全绿） */
.paper-frame .ink.stretch {
  vector-effect: non-scaling-stroke;
}

.corner {
  position: absolute;
  width: 30px;
  height: 30px;
}

/* 归位偏移：原设计纸片在 360×540 viewBox 里自带内建边距（左边框在 x≈13.5、
   顶在 y≈9.5、右 ≈346、底 ≈528），9-slice 切片若贴容器 0 位放置会把纸
   撑大 ~6px（默认尺寸与基线漂移）。以下偏移把边框线归位回原始几何：
   左片 +8px、右片 -2px、顶片 +3px（左右均按实测像素校准）、底片 0（实测对齐基线 x=24/353）。 */
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

/* svg 撑满定位 div（div 负责拉伸几何，svg 负责绘制） */
.edge svg {
  display: block;
  width: 100%;
  height: 100%;
}

/* 与角片重叠 2px 对接（同色不透明叠印不可见），left/right 含归位偏移 */
.edge-top {
  top: 3px;
  left: 36px;
  right: 30px;
  height: 30px;
}

.edge-bottom {
  bottom: 0;
  left: 36px;
  right: 30px;
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

/* 纸心：与边片填充重叠 2px；颗粒点阵 = 原 SVG pattern 的 CSS 化
   （4 圆点/40px tile：r0.4@0.18 ×2 + r0.3@0.14 ×2；色值 = --ink-faint #c4b5a0，
   本面板固定亮色板无暗色模式，硬编码可接受） */
.paper-center {
  position: absolute;
  inset: 28px;
  background-color: var(--paper);
  /* 半径取整像素保证栅格化存活：亚像素半径（0.4px 档）+ 低透明度会被 AA 稀释后
     量化成纯白（颗粒完全消失），故用 1px 半径 + 减半透明度近似原 r0.4@0.18 的视觉重量 */
  background-image:
    radial-gradient(circle 1px at 8px 12px, rgba(196, 181, 160, 0.1) 99%, transparent),
    radial-gradient(circle 0.8px at 28px 6px, rgba(196, 181, 160, 0.08) 99%, transparent),
    radial-gradient(circle 1px at 18px 30px, rgba(196, 181, 160, 0.1) 99%, transparent),
    radial-gradient(circle 0.8px at 35px 25px, rgba(196, 181, 160, 0.08) 99%, transparent);
  background-size: 40px 40px;
  background-repeat: repeat;
}

/* 图案 overlay：固定尺寸、固定角点偏移（偏移取原设计坐标），不随窗口缩放 */
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
