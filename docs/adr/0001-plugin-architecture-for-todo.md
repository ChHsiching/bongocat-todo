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

### D3. 面板跟随用缩回-蹦出（tuck-and-pop）

**决策**：面板打开时定位到桌宠右侧（边缘检测自动翻边）。拖动桌宠时面板做「缩回」动画（CSS transform 收进桌宠位置 + 淡出）；拖动结束后（`tauri://move` 停止触发）读取 main 新位置，面板「蹦出」到新位置（弹性动画 + 淡入）。

**理由**：
- **完美匹配 Tauri 拖拽约束**——`startDragging()` 期间前端拿不到实时位置，干脆藏起来，绕开了实时跟随的闪烁/卡顿。
- 「蹦出」弹性动画契合 BongoCat 卖萌调性，可成为产品记忆点。
- 侵入极小：`main/index.vue:139` `handleMouseDown` 加 1 行 emit 通知拖拽开始。

**备选（零侵入版）**：若不愿改 `main/index.vue`，面板可自监听 `tauri://move` 检测拖动，代价是 ~100ms 延迟。保留为退路。

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

### D7. 菜单 Phase 1 用原生 Menu，Phase 2 升级轮盘

**决策**：Phase 1 保留 `main/index.vue:142` 的 `menu.popup()`（Tauri 原生菜单），姿态 D 的 store 把 todo 项喂进去。轮盘明确列为 Phase 2 UI 升级项，届时加 `RadialMenu.vue` 组件替换 `menu.popup()`，插件数据零改动。

**理由**：轮盘是体验加分项非功能项；姿态 D 的 store 化让轮盘成为纯增量升级，推迟成本几乎为零。

## 侵入账单（8 点，全部追加）

| # | 文件 | 改动 | 性质 |
|---|------|------|------|
| 1 | `src/composables/useAppMenu.ts` | 末尾 spread 插件菜单项（~3 行） | 追加 |
| 2 | `src/constants/index.ts` | `WINDOW_LABEL.TODO = 'todo'`（1 行） | 追加枚举值 |
| 3 | `src/router/index.ts` | `/todo` 路由（~4 行） | 追加 route |
| 4 | `src-tauri/tauri.conf.json` | `app.windows` 数组加窗口配置 | 追加数组项 |
| 5 | `src-tauri/capabilities/default.json` | `notification:default` 权限 | 追加权限 |
| 6 | `src/pages/main/index.vue:139` | `handleMouseDown` 加 1 行 emit | 加 1 行 |
| 7 | `package.json` | `@tauri-apps/plugin-notification` | 追加依赖 |
| 8 | `src/locales/*` × 5 语言 | todo 相关 i18n key | 追加 key |

**共同特征**：全部是追加（新枚举值/数组项/route/key），不改上游原有逻辑。最坏情况是 #6（核心文件），但只加 1 行独立 emit。

**完全不碰**：Rust 端窗口逻辑、上游 stores、pinia 体系、live2d、model 加载、preference 页面。

## Phase 2 明确推迟项

- 轮盘菜单 UI（`RadialMenu.vue` 替换 `menu.popup()`）
- Android 客户端 + 局域网配对 + 同步协议
- 同步冲突解决（依赖 D5 预留的 4 字段）
- 面板可拖拽 + 位置记忆

## Consequences

- **正向**：插件自包含度高，todo 整个模块在 `src/plugins/todo/`；上游 merge 冲突极小且可预测（集中在 8 个追加点）。
- **负向**：菜单总线 store 是新约定，未来模块必须遵守；轮盘 UI 升级时要改 `main/index.vue:142`（Phase 2 再付这个成本）。
- **风险**：`tauri://move` 在多显示器/Retina 缩放下坐标可能有坑，Phase 1 先做「打开时定位 + 缩回蹦出」，实时精确定位留 Phase 2 验证。
