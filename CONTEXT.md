# CONTEXT.md

本文件是 `bongocat-todo` fork 的 single-context 词汇表与决策快照。任何 agent 在动手前都应先读这里 + `docs/adr/`。

## 仓库定位

- 本仓库是 [ayangweb/BongoCat](https://github.com/ayangweb/BongoCat)（Tauri 2 + Vue 3 桌宠）的 fork。
- fork 的核心扩展目标：以**插件化方式**新增 todo list 等模块，并持续接收上游更新。
- 同步约定见 `AGENTS.md`；架构决策见 `docs/adr/`。

## 词汇表（Ubiquitous Language）

| 术语 | 含义 |
|------|------|
| **上游（upstream）** | `ayangweb/BongoCat`，只 fetch 用于合并 |
| **插件（plugin）** | 本仓库新增的自包含模块，位于 `src/plugins/<name>/`，通过注册机制挂到 UI |
| **菜单总线（menu bus）** | 一个 pinia store（`menuBus`），插件向其登记菜单项描述数据，`useAppMenu` 消费 |
| **伴随窗口（companion window）** | 贴在桌宠旁边、同风格的独立 Tauri 窗口（如 todo 面板） |
| **缩回-蹦出（tuck-and-pop）** | 伴随窗口的跟随交互：拖动桌宠时面板缩回，松手后蹦出到新位置 |
| **Phase 1** | 菜单/插件架构 + todo 本地 MVP（无同步） |
| **Phase 2** | 轮盘菜单 UI + Android 局域网同步 |
| **软删除（soft delete）** | 删除时不真删，打 `deletedAt` 时间戳，供 Phase 2 同步使用 |

## 上游架构事实（agent 必知）

- **两个静态路由**：`/`（Main 桌宠）和 `/preference`（设置），定义在 `src/router/index.ts`，同一 Vue 应用共享 pinia/i18n/stores。
- **窗口 label 是静态枚举**：`WINDOW_LABEL` 在 `src/constants/index.ts`，main/preference 两个值。
- **窗口配置在 `src-tauri/tauri.conf.json`**：main 是透明无标题栏置顶窗口；preference 是普通窗口。
- **Rust 端窗口逻辑**：`src-tauri/src/plugins/window/` 是自定义 Tauri 插件，`show_window` 通用（不绑 label），新增窗口不需改 Rust。
- **菜单来源**：`useAppMenu.ts` 生成菜单项 → `main/index.vue:142` 的 `handleContextmenu`（右键桌宠）和 `useTray.ts`（托盘）消费。
- **持久化**：所有 store 通过 `@tauri-store/pinia`（`main.ts:15` `saveOnChange: true`）自动落地 JSON，零额外代码。
- **拖拽**：`main/index.vue:139` `appWindow.startDragging()` 是 Tauri 原生拖拽，拖动中前端拿不到实时位置，只有结束后有 `tauri://move` 事件。

## Phase 1 决策快照

详见 `docs/adr/0001-plugin-architecture-for-todo.md`。要点：

- 插件挂 UI 走**共享 store 菜单总线**（姿态 D），侵入点仅 `useAppMenu.ts` 末尾 spread。
- todo 面板是**独立伴随窗口** `WINDOW_LABEL.TODO`，配置照抄 main 的 `decorations:false/skipTaskbar/alwaysOnTop`。
- 跟随交互用**缩回-蹦出**，拖动桌宠时面板缩回，松手蹦到新位置。
- 存储**复用 pinia 持久化**（零新增依赖），数据结构含 4 个 Phase 2 同步预留字段。
- 日期提醒用 `@tauri-apps/plugin-notification`（新增依赖 + 权限）。
- 上游接触点共 8 处，**全部是追加**，不改原有逻辑。

## 上游代码与视觉约定（二次分析产出，to-spec/implement 必读）

### 样式与原子类
- **unocss 配置**（`uno.config.ts`）：`presetWind3()` + `presetIcons()` + `presetAntd()`（来自 `@antdv-next/unocss`）。todo 组件的原子类用 wind3 风格（`flex gap-2 text-sm` 等），暗色/间距/圆角自动继承 antd theme。
- **transformerVariantGroup**：支持 `class="text-4 font-medium"` 这种变体组写法（见 `pro-list/index.vue`）。
- **transformerDirectives**：支持 `--uno` 变量指令。
- **`not-last:mb-4`** 这类变体修饰符可用（见 pro-list）。

### ESLint 规则（`@antfu/eslint-config` 定制）
- **import 必须按字母升序排序**（`perfectionist/sort-imports`，natural order）。
- **Vue 属性每行一个**（`vue/max-attributes-per-line: error`），且**按字母序**（`vue/attributes-order` alphabetical）。
- **大括号风格 1tbs**（`style/brace-style`）。
- **未使用 import 直接报错**（`unused-imports/no-unused-imports: error`）。
- todo 模块代码必须严格遵守，否则 lint 失败。

### Store 写法（pinia setup 风格 + 渐进迁移）
- **setup 风格** `defineStore('name', () => { ... })`，不用 options 风格。
- **字段分组用 `reactive`**（如 `model`、`window`），标量用 `ref`。
- **导出 interface** 声明结构（`export interface XxxStore`）。
- **迁移范式**：旧字段标 `@deprecated`，新结构放 `reactive`，`init()` 里做一次性迁移，`migrated` ref 做幂等标志。todo store 如果未来改结构，照此模式。

### 组件写法
- **`defineProps<{ ... }>()`** 类型化 props，不用 runtime 声明。
- **`<script setup lang="ts">`** 必用。
- **antdv-next 组件优先**（`Flex`、`List`、`Checkbox` 等），不自己造基础组件。
- **`data-tauri-drag-region`** 属性标记可拖拽区域（窗口无标题栏时的拖拽替代）。
- 组件目录扁平：`src/components/<name>/index.vue`（见 `pro-list`、`pro-list-item`、`shortcut`、`update-app`）。

### i18n 结构
- **5 个 JSON 文件**：`src/locales/{zh-CN,zh-TW,en-US,vi-VN,pt-BR}.json`。
- **嵌套结构**：`pages.<page>.<section>.labels.<key>` 或 `composables.<name>.labels.<key>`。
- todo 新增 key 建议：`plugins.todo.labels.<key>`（新建 `plugins` 命名空间，标明是本仓库扩展）。
- **vue-i18n composition 模式**（`legacy: false`），用 `const { t } = useI18n()`。
- antd 自己的 locale 通过 `getAntdLocale()` 单独注入（`App.vue` ConfigProvider），todo 用 antd 组件自动继承。

### antdv-next 集成
- **`App.vue` 已挂 ConfigProvider**，自动处理暗色模式（`generalStore.appearance.isDark`）和语言。
- **HappyProvider** 已挂（happy-work-theme），按钮有水波纹。
- todo 面板作为 preference/main 同应用的子路由，**自动继承**这些 provider，无需重复配置。
- 暗色模式：todo 不用自己处理，用 antd 组件 + unocss 的 `dark:` 变体即可。

### Rust 端窗口逻辑（二次确认）
- `src-tauri/src/plugins/window/src/commands/mod.rs` 的 `show_window_by_label` 是**通用的**——任何 label 只要窗口在 `tauri.conf.json` 声明了就能显示。
- `MAIN_WINDOW_LABEL`/`PREFERENCE_WINDOW_LABEL` 只是 Rust 端常量，**不限制**其他 label。todo 窗口无需改 Rust。

## ⚠️ 视觉原则（不可违反）

**所有本仓库新增的 UI 必须符合 BongoCat 自身的视觉风格，不得默认使用 antd 视觉。**

### BongoCat 的真实视觉调性（基于 README 截图分析）
- **桌宠本体**：极简手绘/简笔画风，线条 2-3px 均匀，边缘圆润，纯白身体 + 淡粉色斑点（`#FFD1D1` 左右），扁平无阴影，治愈系。
- **整体调性**：扁平插画 + 治愈 + 活泼 + 柔和。高饱和但柔和的配色，**不是企业级冷静蓝**。
- **图标策略**：主视觉/导航用 Solar（扁平、圆润、双色、插画感），功能操作用 Lucide（细线、简洁）。主导航是 Solar，这是门面。

### antd 的真实定位（避免再误解）
- antdv-next 在上游只是**工程选择**（表单控件懒得自己写），**不是视觉判决**。
- preference 页面用 antd 是凑合，不代表 todo 面板也该贴 antd。
- todo 面板是**桌宠的伴随功能**，视觉应向桌宠本体靠拢，不是向 antd 表单靠拢。

### 反复犯过的错（警惕）
1. 把「上游 import 了 antdv-next」当成「视觉必须用 antd」——**代码依赖 ≠ 视觉判决**。
2. 没看截图就凭代码推断视觉——**视觉项目必须先看图（README/截图），再读代码**。
3. 把「antd 省事」当成「antd 正确」——**省事不等于正确**。

### 结论
- todo 面板视觉目标：**像那只猫一样**——大圆角（12-16px）、暖/柔配色（粉/橙/米白）、简线条、萌图标、软质感。
- antd 组件**只用于功能性交互逻辑**（Checkbox 状态、DatePicker 选择），**视觉皮肤必须自定义**覆盖默认。
- 此原则适用于本仓库所有后续 UI 模块，不止 todo。

## 设计探索决策（已定稿）

### todo 伴随面板视觉方向 — 已定稿 ✅

经过 v0/v1/v2/v3 四轮迭代，视觉方向**已定稿**。设计稿存于 `docs/designs/todo-panel-exploration/`，定稿版本为 `v3-white-pink-851.html`。

**定稿视觉规范**：
- **整体风格**：整体手绘插画风。所有「形状」走 SVG（边框/checkbox/分隔线/墨点/时钟/爪印），HTML 只做布局和文字。**严禁用 CSS border 表现线条**。
- **纸张**：纯白（`#ffffff`）+ 极淡灰色颗粒纹理。
- **字体**：851 手写杂字体（`851手写杂字体.ttf`，已复制到 `docs/designs/todo-panel-exploration/851.ttf`）。全局应用，标题/正文/标签都用。
- **配色（粉墨水系）**：主墨色 `#4a3a2e`（棕墨），强调色 `#f4a8a0`（桌宠脸颊粉），优先级红 `#d4654a` / 橙 `#f5c26b` / 蓝 `#9bc4e0`。
- **优先级标记**：墨点（不是正圆）。SVG 三层 path：外圈不规则淡色光晕 + 内部涂黑核心 + 笔触高光，模拟「毛笔画小圈涂黑」。
- **checkbox**：手绘不规则方形（四角弧度各不相同，模拟手画），已勾选用粉色填充 + 手绘对勾（带弧度曲线）。
- **时钟**：手绘风。外圈不规则圆（Q 曲线，非 `<circle>`），时针分针带弧度，加中心实心点。
- **分隔线**：手绘波浪（`Q 25 1 50 3 T 98 3`），不是直线。
- **爪印 logo**：SVG 画的 4 圆 + 椭圆（真爪印形状），不用 emoji。
- **文字粗细**：todo title `font-weight: 700 / 17px`（851 在小字号下显细，必须加粗）。

### 工程实现路径

- todo 组件**局部自定义样式**，所有视觉元素用 SVG/手写字体。
- **不动 antd 全局 token**（避免污染 preference 页面）。
- antd 组件**只用于功能性交互逻辑**（如果用到的话），视觉皮肤必须自定义覆盖。

### 设计稿文件清单

定稿文件存放于 `docs/designs/todo-panel-exploration/`：

| 文件 | 说明 |
|------|------|
| `panel.html` | **伴随面板主体**：纯白纸 + 851 手写 + 墨点优先级 + 手绘时钟/checkbox/分隔线/爪印 |
| `mini-input.html` | **迷你输入窗**（快速新建）：跟随光标，三状态（空/输入中/保存成功） |
| `tuck-pop-animation.html` | **缩回-蹦出动效**：可交互演示，调参对比 |
| `851.ttf` | 851 手写杂字体（设计稿用，implement 时按 vite 字体打包流程处理） |

迭代过程中的废弃版本（v0 antd 版 / v1 CSS border 版 / v2 米白纸版）已删除。

**缩回-蹦出动效** — `tuck-pop-animation.html` ✅ 定稿
- 缩回（tuck）：**柔和吸入** `cubic-bezier(0.5, 0, 0.75, 0)` + **220ms 快**。面板缩小 + 移动到桌宠位置 + 淡出，像被猫迅速叼走。
- 蹦出（pop）：**中回弹** `cubic-bezier(0.34, 1.56, 0.64, 1)` + **500ms 中**。从桌宠位置 overshoot 到 scale 1.08 再回弹到 1，像从猫身上活泼地弹出来。
- 节奏对比清晰：缩回快、蹦出带弹性，符合 BongoCat 治愈又活泼的调性。
- 实现机制：transition 声明在基础类上（所有状态共享），animation（蹦出）优先级高于 transition 接管。
