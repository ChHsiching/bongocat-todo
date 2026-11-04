# ADR 0001: Plugin Architecture for Todo

- **Status**: Accepted
- **Date**: 2026-07-28
- **Decision driver**: @ChHsiching
- **Supersedes**: —

## Context

本 fork 要在 BongoCat（Tauri 2 + Vue 3 桌宠）基础上以**插件化方式**新增 todo list 模块，同时满足两个硬约束：

1. **持续接收上游更新**——对上游文件的改动必须最小且集中，否则 `git merge upstream/master` 会冲突失控。
2. **todo 是长期主功能**——未来还会有其他模块（轮盘 UI、Android 同步等），架构要可扩展。

前期 grilling（见 `CONTEXT.md`）确认了 Phase 1 范围：菜单/插件架构 + todo 本地 MVP（无同步）。本 ADR 记录 Phase 1 的所有架构决策、tradeoff 与侵入账单。

## Decision

### D1. 插件挂 UI 走共享 store 菜单总线（姿态 D）

**决策**：新增一个 pinia store（`menuBus`）作为菜单数据总线。每个插件启动时向其登记菜单项**描述数据**（`{ id, label, icon, action }`），`useAppMenu.getBaseMenu()` 末尾 spread 这些数据。

**理由**：
- 插件自包含——todo 在 `src/plugins/todo/` 自己登记，不碰任何上游文件。
- 菜单数据与 UI 解耦——原生菜单、托盘菜单、Phase 2 的轮盘**都消费同一份数据**，登记一次多处消费。
- 侵入点唯一且极小——只改 `useAppMenu.ts` 一个文件 ~3 行。

**被否决的方案**：
- 中央注册表 + `definePlugin()`：引入新抽象，对上游做 3 处手术，违反「最小且集中」。
- Monkey-patch：表面零侵入，实际把侵入藏进运行时，与上游行为冲突，违反 Surgical Changes。
- 直接硬挂：todo 改 `useAppMenu`/`WINDOW_LABEL`/router，下一个模块复制粘贴，违反 AGENTS.md 插件化原则。

### D2. todo 面板是独立伴随窗口

**决策**：新增 `WINDOW_LABEL.TODO`，在 `tauri.conf.json` 配置一个窗口，照抄 main 的 `decorations:false / skipTaskbar:true / alwaysOnTop:true`，但 `transparent:false`（要显示列表）。

**理由**：
- 语义最干净——todo 是独立功能，不是设置，不应塞进 preference tab。
- 「快速新建」的迷你输入窗可复用同一 `WINDOW_LABEL.TODO`（不同尺寸）。
- main 窗口的透明/穿透逻辑（`main/index.vue`）**一行都不碰**——这是风险最高的文件。

**被否决的方案**：
- preference 里加 tab：语义错位（todo 不是设置），快速新建无法承载。
- main 内浮层组件：必须改 `main/index.vue`（上游核心文件），且透明窗口里渲染不透明 UI 会和 `setIgnoreCursorEvents` 逻辑打架。

### D3. ~~面板跟随用缩回-蹦出（tuck-and-pop）~~ — ❌ SUPERSEDED（改为简单渐隐渐显）

> **状态变更（2026-07-29）**：本决策已被用户否决并替代。tuck-and-pop 方案实现后出现 3 个回归（右键猫面板消失 / 面板定位到屏外 / 透明窗口冒原生滚动条），调试代价高，用户明确否决（"不想要这个动效了，只需要最普通最简单的渐隐渐显"）。**实际实现 = 简单渐隐渐显（opacity 200ms ease）+ 贴猫定位**，见下方「D3-actual」。
>
> 原决策文本保留如下供历史追溯，**不要重新提议恢复 tuck-and-pop**。

**原决策（已废弃）**：面板打开时定位到桌宠右侧（边缘检测自动翻边）。拖动桌宠时面板做「缩回」动画（CSS transform 收进桌宠位置 + 淡出）；拖动结束后（`tauri://move` 停止触发）读取 main 新位置，面板「蹦出」到新位置（弹性动画 + 淡入）。

**原理由（已不适用）**：
- **完美匹配 Tauri 拖拽约束**——`startDragging()` 期间前端拿不到实时位置，干脆藏起来，绕开了实时跟随的闪烁/卡顿。
- 「蹦出」弹性动画契合 BongoCat 卖萌调性，可成为产品记忆点。
- 侵入极小：`main/index.vue:139` `handleMouseDown` 加 1 行 emit 通知拖拽开始。

**原备选**：若不愿改 `main/index.vue`，面板可自监听 `tauri://move` 检测拖动，代价是 ~100ms 延迟。保留为退路。

#### D3-actual. 简单渐隐渐显 + 贴猫定位（实际实现）

**决策**：窗口动效用 opacity 过渡（打开渐显、关闭渐隐 200ms ease），不跟随拖拽。面板以猫为锚点定位（待办面板 = 猫正上方居中；快速新建 = 猫上方偏右），边缘 clamp + 翻边。

**理由**：
- 用户明确要求"最普通最简单的渐隐渐显"，tuck-and-pop 过复杂。
- 不碰 `main/index.vue`（原 D3 唯一改这个文件的理由消失了）——侵入账单 #6 现在**完全不碰**。
- 贴猫定位满足"伴随窗口"语义，不需要跟随拖拽的复杂状态机。

### D4. 存储复用 pinia 持久化

**决策**：`src/plugins/todo/stores/todo.ts` 用 `defineStore('todo', ...)`，`@tauri-store/pinia` 的 `saveOnChange: true` 自动落地 JSON。和上游 `cat`/`general` 等 store 完全同构。

**理由**：
- 零新增依赖、零新增权限、零持久化代码——完全贴上游。
- JSON 是最通用的中间态，Phase 2 加同步时迁移最灵活。

**被否决的方案**：
- Tauri SQLite：为「可能的同步」过度设计，违反 Simplicity First；与其他模块数据层割裂。
- 手动 JSON 文件：重复造轮子，失去响应式，代码量是 10 倍。

### D5. Todo 数据结构含 Phase 2 同步预留字段

**决策**：

```ts
interface Todo {
  id: string
  title: string
  completed: boolean
  priority: 'low' | 'medium' | 'high'
  dueDate?: number
  // Phase 2 同步预留（CRUD 自动赋值，UI 不暴露）
  createdAt: number
  updatedAt: number
  deviceId: string
  deletedAt?: number      // 软删除
}
```

**理由**：
- Phase 2 同步是**确定需求**（非投机），预留成本（4 字段 + ~20 行自动赋值）远低于将来迁移成本（回填逻辑 + 软删除改造 + 删除复活处理 + 测试）。
- 软删除是任何多端同步的物理必需品——A 设备删除、B 设备不知情会导致数据复活。

### D6. 日期提醒用 notification 插件

**决策**：引入 `@tauri-apps/plugin-notification`，capability 加 `notification:default`。app 启动时检查到期 + `setInterval` 每分钟轮询。

**理由**：Q4b 用户明确要求保留日期提醒。

### D7. ~~菜单 Phase 1 用原生 Menu，Phase 2 升级轮盘~~ — ❌ REJECTED（轮盘取消）

> **状态变更（2026-07-30）**：轮盘菜单方案被用户否决。保留原生右键菜单（`menu.popup()`），不替换为轮盘 UI。原决策文本保留如下供追溯。

**原决策（已废弃）**：Phase 1 保留 `main/index.vue:142` 的 `menu.popup()`（Tauri 原生菜单），姿态 D 的 store 把 todo 项喂进去。轮盘明确列为 Phase 2 UI 升级项，届时加 `RadialMenu.vue` 组件替换 `menu.popup()`，插件数据零改动。

**原理由（已不适用）**：轮盘是体验加分项非功能项；姿态 D 的 store 化让轮盘成为纯增量升级，推迟成本几乎为零。

## 侵入账单（规划时 8 点 → 实际 T1-T5 后更新）

### 规划时（spec 阶段预估，8 点）

| # | 文件 | 改动 | 性质 |
|---|------|------|------|
| 1 | `src/composables/useAppMenu.ts` | 末尾 spread 插件菜单项（~3 行） | 追加 |
| 2 | `src/constants/index.ts` | `WINDOW_LABEL.TODO = 'todo'`（1 行） | 追加枚举值 |
| 3 | `src/router/index.ts` | `/todo` 路由（~4 行） | 追加 route |
| 4 | `src-tauri/tauri.conf.json` | `app.windows` 数组加窗口配置 | 追加数组项 |
| 5 | `src-tauri/capabilities/default.json` | `notification:default` 权限 | 追加权限 |
| 6 | ~~`src/pages/main/index.vue:139`~~ | ~~`handleMouseDown` 加 1 行 emit~~ | **完全不碰（D3 superseded 后取消）** |
| 7 | `package.json` | `@tauri-apps/plugin-notification` | 追加依赖 |
| 8 | `src/locales/*` × 5 语言 | todo 相关 i18n key | 追加 key |

### 实际（T1-T5 实现后的修正，2026-07-29 回流）

规划时的账单**低估/偏差了 4 处**，实际侵入点有增有减但仍是追加性质：

**接触点 #6 取消（D3 superseded）**：
- 原 D3 要改 `main/index.vue:139` 加 emit 通知拖拽开始。D3 被否决改为渐隐渐显后，**完全不碰 `main/index.vue`**——这是整个 Phase 1 唯一可能碰核心文件的地方，现在也免了。

**遗漏的接触点（T4 发现）**：
- **`src-tauri/Cargo.toml`** + **`src-tauri/src/lib.rs`** —— Tauri 2 插件必须同时改 Rust 侧（`tauri-plugin-notification = "2"` + `.plugin(tauri_plugin_notification::init())`），不只前端 npm 包 + capability。这是 Tauri 2（相比 Tauri 1）的架构变化，规划时按 Tauri 1 经验漏估。

**`App.vue` 侵入超预期（T1/T4/T5 累计 3 处）**：
- 规划时把 `App.vue` 算进"完全不碰"，实际累计改了 3 处（都是追加）：
  - T1：store 实例化提到 setup 顶层 + 调 `setupTodoPlugin({ stores, t })`（修 code:26 bug）
  - T4：传 `windowLabel: appWindow.label`（多窗口门控，避免三窗口三连发通知）
  - T5：加 `reminderStore` 实例化 + 传参
- **教训**：`App.vue` 作为"中央初始化点"，每加一个插件会多一处侵入。模块级长期分支能接受（merge 时统一解冲突），但规划时要认清它不是"零侵入"。

**新增 LISTEN_KEY（T5 发现）**：
- `src/constants/index.ts` 除了 `WINDOW_LABEL.TODO`，还加了 `LISTEN_KEY.SHOW_TODO_FULL` / `LISTEN_KEY.SHOW_TODO_MINI`（迷你窗/主面板切换的专用事件）。

## Phase 2 明确推迟项

- ~~轮盘菜单 UI（`RadialMenu.vue` 替换 `menu.popup()`）~~ — ❌ 已取消（用户否决，D7 rejected）
- ~~面板可拖拽 + 位置记忆~~ — ✅ 已完成（面板支持 `data-tauri-drag-region` 拖拽 + 以猫为锚点自动定位）
- Android 客户端 + 局域网配对 + 同步协议
- 同步冲突解决（依赖 D5 预留的 4 字段）

## Consequences

- **正向**：插件自包含度高，todo 整个模块在 `src/plugins/todo/`；上游 merge 冲突极小且可预测（集中在追加点）。D3 superseded 后完全不碰 `main/index.vue`，最敏感的核心文件零侵入。
- **负向**：菜单总线 store 是新约定，未来模块必须遵守；轮盘 UI 升级时要改 `main/index.vue:142`（Phase 2 再付这个成本）。`App.vue` 作为中央初始化点，每加一个插件会多一处追加侵入（T1-T5 已累计 3 处），merge 上游时需注意。
- **风险**：面板定位用 `availableMonitors` + 一次 setPosition，多显示器/Retina 缩放下坐标可能有坑，Phase 1 先做"打开时贴猫定位"，精确跟随留 Phase 2。
