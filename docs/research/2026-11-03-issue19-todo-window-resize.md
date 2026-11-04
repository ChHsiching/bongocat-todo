# Issue #19 调研：todo 窗口支持拖拽调整大小并持久化

- 调研日期：2026-11-03
- 对应 issue：[ChHsiching/bongocat-todo#19](https://github.com/ChHsiching/bongocat-todo/issues/19)
- 调研对象：todo 窗口（label `todo`，当前 380×560、`resizable: false`、无边框透明）
- 说明：`docs/research/` 为本次调研新增目录，本文件是该目录第一份报告。
- 资料来源：全部为一手资料——Tauri 官方文档 / docs.rs / tauri、tao、wry 官方仓库的源码与 issue / 上游 ayangweb/BongoCat 仓库（fork 同步点 `44f44bc`）/ MDN 与 caniuse。本地代码事实已按主会话给定并抽查核对（`src-tauri/tauri.conf.json`、`src/pages/todo/index.vue`、`src/plugins/todo/components/PaperPanel/index.vue`）。

---

## TL;DR

**结论：有条件能做，且大部分平台"开箱即用"。** Tauri 2 对 `decorations: false + resizable: true` 的窗口**已内置边缘拖拽 resize**（Windows 由 tauri-runtime-wry 子窗口命中测试实现、Linux 由 GTK 命中测试实现、macOS 由 `Borderless|Resizable` style mask 直接获得系统能力）；上游 BongoCat 的 main 窗口就是 `transparent + decorations:false + resizable（默认 true）` 组合，作者确认"窗口可以拖动边缘调整大小"。真正要做的工程量不在窗口层，而在：**① 手绘 SVG 边框按作者约束改造成三段式（横向等比、纵向自由）；② mini/panel 双形态下的动态 min/max 约束（静态 minHeight 会弄坏 mini 形态）；③ 用户尺寸存 pinia（不引入 window-state 插件）**。

**推荐方案（一句话）**：`resizable: true` + 运行时按形态动态 `setMinSize/setMaxSize` + 尺寸持久化走 tauri-plugin-pinia + PaperPanel 改三段式 SVG（顶部/底部条带锁宽高比、中段自由纵向拉伸）。

---

## 1. 无边框 + 透明窗口 `resizable: true` 的分平台可用性

### 1.1 `resizable` 字段语义

- 官方 WindowConfig 定义：`resizable: bool`——"Whether the window is resizable or not. When resizable is set to false, native window's maximize button is automatically disabled."（设置 false 时同时禁用原生最大化按钮）[来源](https://docs.rs/tauri-utils/latest/tauri_utils/config/struct.WindowConfig.html)
- **默认值为 `true`**（tauri-utils `config.rs` 的 `Default` 实现中 `resizable: true`）[来源](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-utils/src/config.rs)
- 与 `decorations`、`transparent` 无耦合：两者都是独立字段，`decorations: false` 不隐含不可 resize [来源](https://docs.rs/tauri-utils/latest/tauri_utils/config/struct.WindowConfig.html)
- 顺带确认：`app.macOSPrivateApi`（透明窗口在 macOS 需要的开关）自 **Tauri 2.12.1 起为 no-op**（透明 API 始终启用）；本项目在 tauri 2.10.1 上仍需要它，而项目已开启，无需改动 [来源](https://tauri.app/reference/config/)

### 1.2 Windows：可用（Tauri 内置实现），有历史坑已修复

- **实现机制**：Tauri（tauri-runtime-wry）自带 `undecorated_resizing.rs`，对 undecorated + resizable 窗口创建一个覆盖全窗、不绘制的子窗口（`TAURI_DRAG_RESIZE_BORDERS` / `TAURI_DRAG_RESIZE_WINDOW`），用 Win32 命中测试（HTLEFT/HTTOP/…）把边缘点击转成系统 resize。子窗口挖洞区域用 `GetSystemMetricsForDpi(SM_CXFRAME/SM_CYFRAME)` 计算边带宽度（DPI 感知）。本窗口 `shadow: false` 时（本项目即此配置），`only_top=false`，**四条边全部覆盖**；`shadow: true` 时才只留上/下边带（左右交给 DWM 的 1px 白边）[来源](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-runtime-wry/src/undecorated_resizing.rs)
- **历史 bug 与修复状态**（均已包含在 2.x stable，远早于本项目的 tauri 2.10.1）：
  - [tauri#8519](https://github.com/tauri-apps/tauri/issues/8519)（已关闭）：v2 alpha/beta 期 undecorated 窗口完全无法 resize，2024-06 由 [PR #9862](https://github.com/tauri-apps/tauri/pull/9862) 修复进 beta.23。末尾评论里的遗留问题（`unstable` feature + multiwebview、`decorations(false)` 后 JS `setSize` 失效）均与本场景无关。
  - [tao#877](https://github.com/tauri-apps/tao/issues/877)（已关闭）：tao 0.25 期 Win11 上 resize 光标区域漂移且只有右/下方向可用，2024-02 由 [tao PR #878](https://github.com/tauri-apps/tao/pull/878) 修复。
  - [tao#1241](https://github.com/tauri-apps/tao/issues/1241)（已关闭）：`decorations: false` 下连续 resize 性能逐步劣化——已修复。
  - [tao#1359](https://github.com/tauri-apps/tao/issues/1359)（已关闭）：带 shadow 的隐藏 undecorated 窗口首次 resize 高度异常——已修复，且本窗口 shadow:false。
- **仍开放的边缘问题**：
  - [tao#1170](https://github.com/tauri-apps/tao/issues/1170)（开放）：抱怨顶部 resize 边带只有 1px 难以命中——这是针对 tao 直接使用者的；Tauri 走上述 runtime 层实现（`SM_CYFRAME` 边带），但建议 QA 时实测顶部边缘手感。
  - [tauri#16304](https://github.com/tauri-apps/tauri/issues/16304)（开放）：Win10 无边框窗口顶部 1px 边框缺失的讨论，属 `shadow: true` 场景（DWM 1px 白边被 webview 盖住）；本窗口 `shadow: false` 不受影响，且该 issue 中维护者明确确认 undecorated resize 已由 tauri-runtime-wry 实现。
- **透明 + resize 的组合**：未搜到"透明窗口 resize 出现黑边/闪烁"的现行开放 issue（检索了 `transparent window resize` / `transparent resize flicker` / `transparent black resize` 均无命中）。文档中"resize 时性能差"的警告只针对 Acrylic/Blur 等 **window effects**，不针对普通 `transparent: true` [来源](https://v2.tauri.app/reference/javascript/api/namespacewindow/)。透明相关的已知问题集中在**创建瞬间白闪**，解法是 `noRedirectionBitmap`（WindowConfig 平台注释）[来源](https://docs.rs/tauri-utils/latest/tauri_utils/config/struct.WindowConfig.html)。此项标记为**需 Win10/Win11 实机 QA 验证**。

### 1.3 macOS：可用（系统直接支持，且这是唯一不需要 Tauri 特殊处理的平台）

- tao 创建 `decorations: false` 窗口时显式使用 `NSWindowStyleMask::Borderless | Resizable | Miniaturizable`，源码注释即 "Resizable UnownedWindow without a titlebar or borders"；`resizable: false` 才会摘掉 Resizable 位 [来源](https://github.com/tauri-apps/tao/blob/dev/src/platform_impl/macos/window.rs)
- 系统确实会为这种"无边框但 Resizable"的窗口附加 resize 能力（缩放控件 `_NSThemeZoomWidget`）：[tao#1191](https://github.com/tauri-apps/tao/issues/1191)（已关闭）——macOS 15 Sequoia 上 `decorations:false + resizable:true` 窗口因系统每次布局创建 zoom widget 导致空转 100% CPU，该 bug 已修复关闭，但反向证明了这类窗口由系统提供 resize 外观件。
- 用户实证：[tauri#8519](https://github.com/tauri-apps/tauri/issues/8519) 评论（2024-11）"It works fine on MacOS, the issue is on windows"。
- 透明需要 macos-private-api——本项目已开启（见 1.1）。

### 1.4 Linux (X11)：主流桌面可用，个别 DE 有失效案例（开放）

- **实现机制**：tauri-runtime-wry 在 webkit2gtk 的 WebView 上挂 button-press/touch 处理器，条件 `!decorated && resizable && !maximized` 时做 5px × scale_factor 的边缘命中测试，命中则 `gdk_window.begin_resize_drag` [来源](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-runtime-wry/src/undecorated_resizing.rs)
- **失效案例**：[tauri#16266](https://github.com/tauri-apps/tauri/issues/16266)（开放，2026-10）：Astra Linux（fly-wm）X11 上 undecorated 窗口完全没有 resize 边带。Tauri 维护者 FabianLars 回复：GNOME 上 Wayland 与 X11 均正常（fresh tauri app 实测），怀疑 DE 相关。**该 issue 同时实证了 `startResizeDragging` 在 Linux 可用**（作者用合成指针驱动逐像素测试，`startResizeDragging` 能正确触发 `gtk_window_begin_resize_drag` 跟随指针）。
- **历史已修**：[tao#1243](https://github.com/tauri-apps/tao/issues/1243)（GTK_CSD=1 时无法 resize/move，已关闭）、[tao#1380](https://github.com/tauri-apps/tao/issues/1380)（触摸触发 resize，已关闭）。
- **UX 注意**：[tauri#9212](https://github.com/tauri-apps/tauri/issues/9212)（开放，tauri 1.x 期报告，Linux）：认为 5px 边带"太大"，挤占边缘元素（滚动条）点击。todo 窗口只有 380px 宽、内容区有列表滚动，5px 边带占比可观，交互设计时要留意。

### 1.5 Linux (Wayland)：GNOME 下可用（维护者实测）

- 同上 [tauri#16266](https://github.com/tauri-apps/tauri/issues/16266) 中维护者明确表示 GNOME Wayland 实测可 resize（GTK 路径的 `begin_resize_drag` 走 xdg_toplevel resize，由合成器执行）。
- Wayland 下窗口**定位** API 本就不可用（既有限制，与本改动无关）——todo 窗口"贴猫定位"在 Wayland 上现状如何属既有问题，不在本 issue 范围。

### 1.6 平台小结

| 平台                            | decorations:false + transparent:true + resizable:true 能否拖边缘 resize | 依据                                                                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows 10/11                   | 能（四边，Tauri 内置命中测试子窗口；边带=系统 resize 边框宽度）         | [runtime 源码](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-runtime-wry/src/undecorated_resizing.rs)、[wry#1273 维护者说明](https://github.com/tauri-apps/wry/issues/1273)（"wry 本身不管，Tauri 实现了"） |
| macOS                           | 能（系统原生，`Borderless\|Resizable`）                                 | [tao 源码](https://github.com/tauri-apps/tao/blob/dev/src/platform_impl/macos/window.rs)、[tao#1191](https://github.com/tauri-apps/tao/issues/1191)                                                                     |
| Linux X11（GNOME/KDE 等主流）   | 能（GTK 命中测试，5px×DPI 边带）                                        | [tauri#16266 维护者回复](https://github.com/tauri-apps/tauri/issues/16266)                                                                                                                                              |
| Linux X11（个别 DE，如 fly-wm） | **不能**（边带消失，开放 issue）                                        | [tauri#16266](https://github.com/tauri-apps/tauri/issues/16266)                                                                                                                                                         |
| Linux Wayland（GNOME）          | 能                                                                      | [tauri#16266 维护者回复](https://github.com/tauri-apps/tauri/issues/16266)                                                                                                                                              |
| Linux Wayland（其他合成器）     | 未确认（无一手资料，QA 覆盖不到则文档标注即可）                         | —                                                                                                                                                                                                                       |

---

## 2. 原生边缘不可靠时的自定义 resize 把手方案

### 2.1 `startResizeDragging`：存在，名称与提示一致，Windows/Linux 可用、**macOS 不可用**

- **确切 API**（已从官方源码核实，与提示里的名称一致）：`getCurrentWindow().startResizeDragging(direction: ResizeDirection)`，invoke 命令 `plugin:window|start_resize_dragging`；`ResizeDirection` 为 `'North' | 'NorthEast' | 'East' | 'SouthEast' | 'South' | 'SouthWest' | 'West' | 'NorthWest'` [来源](https://github.com/tauri-apps/tauri/blob/dev/packages/api/src/window.ts)
- **所需 capability 权限**：`core:window:allow-start-resize-dragging`（不在 `core:window:default` 内，需在 capability 文件显式加）[来源](https://github.com/tauri-apps/tauri/blob/dev/packages/api/src/window.ts)；权限体系见 [Window Customization 指南](https://v2.tauri.app/learn/window-customization/)
- **版本**：API 由 [PR #8537](https://github.com/tauri-apps/tauri/pull/8537) 加入（2.0 beta 期，api CHANGELOG 归入 `2.0.0-beta.0` 段），权限由 [PR #9490](https://github.com/tauri-apps/tauri/pull/9490) 补齐（beta.16/17 段）——**本项目 tauri 2.10.1 均已包含** [来源](https://github.com/tauri-apps/tauri/blob/dev/packages/api/CHANGELOG.md)
- **平台支持矩阵**：底层是 tao 的 `drag_resize_window`，官方文档注明 "**macOS / iOS / Android:** Always returns an `ExternalError::NotSupported`"（macOS 实现就是无条件返回 `Err(NotSupported)`，direction 参数被丢弃）[来源](https://github.com/tauri-apps/tao/blob/dev/src/window.rs)、[macOS stub 源码](https://github.com/tauri-apps/tao/blob/dev/src/platform_impl/macos/window.rs)。Windows 与 Linux 支持；Linux 上有实证（[tauri#16266](https://github.com/tauri-apps/tauri/issues/16266) 作者实测可用）。
- **对本项目的含义**：macOS 上不能靠 `startResizeDragging` 做把手，但 macOS 原生边缘 resize 本来就可用（§1.3），组合起来三平台均有解：Windows/macOS 走原生边缘，Linux 原生边缘失效的 DE 可加自绘把手兜底（也可不加，先按已知问题记录）。

### 2.2 tauri-plugin-decorum：是标题栏插件，不提供 resize 把手

- 支持 Tauri 2（crates.io 最新 1.1.1）；定位是"自定义标题栏但保留原生行为（Windows Snap Layout、macOS 交通灯 inset、透明 overlay 标题栏等）"；作者声明项目已进入维护模式（无破坏性 API 变更，只收 bugfix/架构改进）[来源](https://github.com/clearlysid/tauri-plugin-decorum)、[docs.rs](https://docs.rs/crate/tauri-plugin-decorum/latest)
- **通读其 README（v1.1.1）没有任何 resize handle 功能**（全文无 "resize" 字样）——它的前提恰恰是 Tauri 已内置 undecorated 边缘 resize，插件只管标题栏/窗口控件。**对本 issue 无必要引入**。

### 2.3 纯自绘把手（cursor 追踪 + `setSize`）作为兜底的代价

- 只在前两者都失败时才值得考虑：失去系统 resize 的跟随手感与磁性吸附；需要自行处理 8 个方向光标、pointer capture、DPI 取整、与 `onResized` 的回环；每帧 IPC `setSize` 在低端机上有抖动风险。**结论：不推荐**，Linux 个别 DE 的问题优先用 `startResizeDragging` 兜底。

---

## 3. 窗口尺寸约束：min/max 对拖拽生效，但**不能静态配置**（本地设计约束）

- `WindowConfig` 提供 `minWidth/minHeight/maxWidth/maxHeight`（logical 像素），设置在窗口本体上（对应 tao 的 min/max inner size），**对用户拖拽 resize 生效**，不只约束 JS `setSize` [来源](https://docs.rs/tauri-utils/latest/tauri_utils/config/struct.WindowConfig.html)
- **关键本地冲突**：同一个 `todo` 窗口双形态复用——`src/pages/todo/index.vue` 中 `classifyByHeight` 以 `height < 200` 判定 mini 形态；`SHOW_TODO_MINI` 会程序化 `setSize(380×130)`。若在 `tauri.conf.json` 静态设置 `minHeight > 200`（为防 panel 形态被拖进 mini 误判），**mini 形态的 `setSize(380×130)` 也会被钳制**（Windows 上尺寸约束经由 `WM_GETMINMAXINFO` 对程序化改动同样生效），mini 形态直接损坏。
- **解法**：运行时动态约束。官方 JS API `setMinSize(size | null)` / `setMaxSize(size | null)` 支持传 `null`/`undefined` **取消约束**（`setMaxSize` 文档原文 "If the `size` argument is undefined, the constraint is unset"）[来源](https://github.com/tauri-apps/tauri/blob/dev/packages/api/src/window.ts)
- **建议数值**（panel 形态激活时设置；进入 mini 前清除）：
  - `minWidth` 380（保持现宽下限，MiniInput/PaperPanel 的 viewBox 基准宽）；`minHeight` **> 200**，建议 240（留缓冲，防止拖拽中掉进 mini 误判，也保证标题区+至少一条 todo 可见）；
  - `maxWidth` 建议 ~600、`maxHeight` 建议 ~800（手绘面板拉太大后视觉密度骤降；具体数值开 ticket 时定，也可不设上限）。
  - mini 形态期间可顺手 `setResizable(false)`，回 panel 再开，彻底避免形态串扰。

---

## 4. 尺寸持久化：推荐自存 pinia，不引入 window-state 插件

### 4.1 tauri-plugin-window-state（官方插件）与本项目架构的冲突

- 插件行为：注册后**所有窗口**在关闭时保存状态、创建时恢复；可用 `StateFlags` 位标志控制保存/恢复哪些维度——`SIZE`、`POSITION`、`MAXIMIZED`、`VISIBLE`、`DECORATIONS`、`FULLSCREEN` 是**独立标志位**，可组合（如 `StateFlags::SIZE` 只管尺寸），默认 `Builder` 用 `StateFlags::all()` [来源](https://docs.rs/tauri-plugin-window-state/latest/tauri_plugin_window_state/struct.StateFlags.html)、[README](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/window-state)
- **对本项目的坑**：
  1. **与"每次打开都程序化定位贴猫"打架**：`SHOW_TODO_FULL` 每次都 `setSize` + 按猫位置 `setPosition`。插件只在窗口创建时恢复一次——恢复出的 position 随后必被贴猫定位覆盖（无意义），恢复出的 size 必被 `setSize(FULL_SIZE)` 覆盖（除非把打开逻辑改成读插件状态，那不如自己存）。"只恢复 size 不恢复 position"技术上可行（`StateFlags::SIZE`），但改变不了"恢复时机 vs 程序化设置时机"的冲突本质。
  2. **`VISIBLE` 默认会被保存/恢复**：本项目 todo/preference/bubble 等窗口全部 `visible: false` 启动、按需 show。若用默认 flags，某次可见状态下退出，下次启动插件可能把窗口直接恢复为可见（基于 StateFlags 含 `VISIBLE` 与默认 `all()` 的推断，**落地前需小规模实测**，但已足够构成风险项）。规避要收敛 flags，而 flags 是 Builder 级全局的，还要考虑对 main（猫）窗口的连带影响。
  3. 数据落在插件自己的文件里，绕开了项目统一的 pinia 持久化链路。
- 结论：**不推荐**。

### 4.2 自存 pinia（tauri-plugin-pinia，已在用）——推荐

- 做法：todo store 增加一个 `panelSize: LogicalSize | null`；`SHOW_TODO_FULL` 时用 `panelSize ?? FULL_SIZE` 替代常量；`onResized`（panel 形态、非程序化 setSize 引起、debounce ~300ms）时写入 `outerSize().toLogical(scaleFactor)`。
- **outerSize/innerSize 口径**：本窗口 `decorations: false` 且无系统边框，`outerSize() == innerSize()`（Windows undecorated 无非客户区；Linux/macOS 无边框窗口同理）；本地现有代码（`classifyByHeight`、贴猫计算）已统一用 `outerSize()`，沿用即可，无需纠结口径。
- **注意 DPI**：现有常量是 `PhysicalSize`；持久化建议存 **logical** 尺寸（换显示器/改缩放后恢复更稳定），打开时再按当前 `scaleFactor` 转物理。
- 完全贴合现有架构：零新依赖、零新权限（`onResized`/`outerSize` 属 `core:window:default` 只读范围，`setSize` 权限项目已具备）[来源](https://github.com/tauri-apps/tauri/blob/dev/packages/api/src/window.ts)

### 4.3 对比结论

| 维度                     | window-state 插件                | 自存 pinia                 |
| ------------------------ | -------------------------------- | -------------------------- |
| 新依赖                   | +1 Rust crate +1 npm 包          | 无                         |
| 与贴猫定位共存           | 冲突（恢复时机错位）             | 天然共存（打开时读 store） |
| 只存 size                | 可（StateFlags::SIZE）但全局配置 | 天然                       |
| 对其他窗口影响           | 默认全局生效，需收敛 flags       | 无                         |
| 与 mini/panel 双形态配合 | 无感知，需 hack                  | 可按形态精确控制           |

---

## 5. 手绘 SVG 边框在任意长宽比下的退化分析（含作者设计约束）

### 5.1 现状退化点确认（`preserveAspectRatio="none"` 非均匀缩放）

本地 `PaperPanel/index.vue`（viewBox 0 0 360 540，`preserveAspectRatio="none"`，absolute inset:0）+ SVG 规范/MDN 推理：

1. **描边粗细不均**：SVG 描边宽度依赖元素坐标系变换，非均匀缩放下 2.5px 的手绘边框会一边粗一边细（MDN 明确 stroke width 依赖变换，包括 non-uniform scaling）[来源](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/vector-effect)
2. **pattern 颗粒圆点变椭圆**：`patternUnits="userSpaceOnUse"` 的 40×40 tile 在用户坐标系里铺排，非均匀缩放时 tile 与 tile 内 `r=0.3~0.4` 的圆点整体被拉伸成椭圆（填充几何不受 `vector-effect` 影响，见 5.3）[来源](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/patternUnits)
3. **顶部装饰漂移变形**：波浪 path（y≈26–36 的 Q 曲线）与右上角圆点（cx 320/330）坐标写死在 viewBox 系——窗口变宽时波长被拉长、圆点变椭圆且离角漂移；变窄时挤压重叠。

### 5.2 作者设计约束（issue #19 处理人给定，作为本节方案排序依据）

> **横向拉伸时，上下边缘条带（手绘波浪、圆点装饰、边框弧线）必须等比均匀放大**（高度随宽度同比例增长，图案不许变形）；纵向拉伸无所谓（左右边缘本来就是近直线，可自由拉伸）。

据此，现状（整体 `preserveAspectRatio="none"`）**不满足**要求——横向拉宽时上下条带图案会被拉扁。

### 5.3 缓解选项对比（按约束重排）

- **c) 9-slice / 三段式 SVG —— 首选推荐**。具体化：
  - **顶部条带**（含波浪、圆点装饰、顶部边框弧线，设计稿约 y 0–60）：`width: 100%` + CSS `aspect-ratio: 360 / 60` 锁定宽高比 → 横向拉宽时**条带整体等比放大**（满足作者约束），内部 viewBox 保持默认 `preserveAspectRatio`（盒子比例= viewBox 比例时缩放天然均匀）；
  - **底部条带**（底部边框弧线，约 y 500–540，比例如 360/40）同理；
  - **中段**（左右边缘，本来就是近直线）：单独一个小 SVG `preserveAspectRatio="none"`，绝对定位在上下条带之间，`inset: bandHeight 0 bandHeight2 0`，纵向自由拉伸；
  - 三段可用 flex column（top 固定比、middle flex:1、bottom 固定比）或纯绝对定位拼装。
  - **CSS `aspect-ratio` 兼容性**（MDN BCD 原始数据）：Chrome/Edge **88+**、Firefox **89+**、Safari/iOS **15+** [来源](https://developer.mozilla.org/en-US/docs/Web/CSS/aspect-ratio)、[BCD 数据](https://github.com/mdn/browser-compat-data/blob/main/css/properties/aspect-ratio.json)、[caniuse](https://caniuse.com/css-aspect-ratio)。对三个 WebView：
    - Windows WebView2（Chromium Evergreen）：≥88，2021 年起即满足，**无风险**；
    - macOS WKWebView：需 macOS 带 Safari 15（约 macOS 10.15/11+）。本项目 bundle 未设 `minimumSystemVersion`，走 Tauri 默认 **10.13**——10.13/10.14 老系统上 `aspect-ratio` 无效。**若要保底老 macOS，用下述嵌套 SVG 等价实现替代 CSS**（或提高最低系统版本，开 ticket 时定）；
    - Linux webkit2gtk：引擎与 Safari 同源，aspect-ratio 随 WebKit 进入（对应 Safari 15 时代的引擎，约 webkit2gtk 2.34 / 2021-09）；Ubuntu 22.04（2.40+）、Debian 12（2.44）均远超。**此版本对应关系为引擎版本推断，未逐一实机验证**（caniuse 不单列 webkit2gtk）。
  - **备选（一句话）**：嵌套 `<svg>` 等价实现——外层布局内嵌多个子 `<svg>` 各持自己的 viewBox（默认 `xMidYMid meet`，均匀缩放），不依赖任何 CSS 新特性，兼容性 100%，效果与 aspect-ratio 锁比一致。
- **b) `vector-effect="non-scaling-stroke"` —— 降级为辅助手段**。MDN：它使描边宽度"not dependent on the transformations of the element (including non-uniform scaling)"，**只固定描边宽度**；不改变几何——波浪仍被拉扁、圆点仍变椭圆、pattern 内填充不受影响（vector-effect 作用于元素描边，pattern 圆点是填充）[来源](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/vector-effect)、[SVG2 规范](https://www.w3.org/TR/SVG2/coords.html#VectorEffectProperty)。**单独使用不满足作者约束**；可在三段式落地后，若仍嫌某段描边不均可作微调（三段式下条带等比缩放，理论上不再需要）。
- **a) 接受轻微拉伸（原作者注释立场）**：不满足作者约束，**否决**（注释立场只覆盖"轻微"拉伸，约束明确禁止图案变形）。
- **d) 按实时尺寸用 rough.js 重生成 path**：最重的方案——新增依赖 + 每次 resize 帧级重算 path；仅当三段式仍不满意时再考虑，**不推荐**。
- **附带建议（可选）**：颗粒纹理可从 SVG pattern 挪到容器 div 的 CSS 背景（固定 `background-size` 的 radial-gradient 点阵），让纹理彻底与 SVG 缩放解耦，中段纵向拉伸时纹理也不变形。

### 5.4 MiniInput（viewBox 0 0 380×130）同款问题

同结构同退化点，但 mini 形态建议直接 `setResizable(false)`（§3），尺寸恒定则无需改造；若未来 mini 也开放 resize，套用同样的三段式方案。

---

## 6. 上游先例（ayangweb/BongoCat）

以下读自本地 `upstream/master` 同步点 `44f44bc`（fork 最后合并的上游提交）的 `src-tauri/tauri.conf.json`：

- **main（猫）窗口**：`transparent: true, decorations: false, skipTaskbar: true, alwaysOnTop: true, shadow: false, acceptFirstMouse: true, maximizable: false`，**未设置 `resizable` → 默认 `true`**。即上游主窗口长期就是"无边框 + 透明 + 可 resize"组合（与 todo 窗口几乎同款配置，todo 还比它多 `resizable: false`）。
- **作者实证**：上游 issue [#171](https://github.com/ayangweb/BongoCat/issues/171)（已关闭，"New requirement: Add size adjustment function"）中作者回复：**"Currently, the window can be resized by dragging its edges. We plan to optimize the drag behavior in future updates."**——上游发布版（Win/macOS/Linux）实际支持拖边缘 resize，且他们把"优化拖拽行为"列为待办，说明该组合在真实用户环境可用但体验有打磨空间。
- **preference 窗口**：`titleBarStyle: "Overlay" + hiddenTitle + minWidth 800 + minHeight 600`——是**有装饰**窗口（macOS 风格 overlay 标题栏）配 min 约束的先例，非透明窗口 resize 先例。
- 上游未搜到透明窗口 resize 相关的其他 issue（`gh search issues --repo ayangweb/BongoCat resize` 仅 #171 一条）。
- **注意**：上游 master 最新已大幅重构为 crates/ workspace（bongocat-app、bongocat-live2d 等），目录结构与本 fork 分叉；以上结论取自 fork 同步点。本报告引用的上游配置对应提交 `44f44bc`（`git show 44f44bc:src-tauri/tauri.conf.json` 可复核）。

---

## 7. 落地建议（供开 ticket 用，不含代码）

### 7.1 推荐实现路径

1. **配置改动**（`src-tauri/tauri.conf.json` todo 窗口）：
   - `resizable: false → true`；
   - **不要**静态设置 `minWidth/minHeight/maxWidth/maxHeight`（会钳死 mini 形态的 380×130，见 §3），改为运行时动态设置。
2. **代码改动点**：
   - `src/pages/todo/index.vue`：
     - `SHOW_TODO_FULL`（panel 打开）：`setMinSize(380×240)`、`setMaxSize(可选 600×800)`、`setResizable(true)`，`setSize(stored ?? FULL_SIZE)`（stored 来自 pinia，logical → physical 换算）；
     - `SHOW_TODO_MINI`（mini 打开）：先 `setResizable(false)` + `setMinSize(null)` + `setMaxSize(null)`，再 `setSize(MINI_SIZE)`；
     - `onResized`：panel 形态下 debounce 写入 pinia（跳过程序化 setSize 引发的事件）；`classifyByHeight` 阈值 200 保持不变（minHeight 240 > 200 已从根上避免误判）；
     - todo store（tauri-plugin-pinia）：新增 `panelSize: LogicalSize | null` 字段。
   - `PaperPanel/index.vue`：按 §5.3 首选方案改三段式（顶部条带 aspect-ratio 360/60 + 底部条带 + 中段 preserveAspectRatio="none"）；若决定保底 macOS 10.13/10.14，改用嵌套 `<svg>` 实现。MiniInput 本期不动（mini 不可 resize）。
   - capability 文件：本期**不需要** `core:window:allow-start-resize-dragging`（三平台原生边缘已够）；仅当决定给 Linux 异常 DE 加自绘把手兜底时再加（注意 macOS 上该 API NotSupported，把手仅对 Linux/Windows 生效）。
3. **风险与 QA 清单**：
   - Windows 10 / 11 实机：透明窗口拖边缘 resize 是否有闪烁/黑边（文献无现行 issue，需实测，见 §1.2）；顶部边缘命中手感（tao#1170 关联项）；
   - Linux：5px 边带与列表滚动条点击的冲突（tauri#9212 同类反馈）；非常规 DE（fly-wm 类）上边带可能失效（tauri#16266 开放中）——决定是否记为 known issue 或加 `startResizeDragging` 把手；
   - macOS：确认 10.13/10.14 是否还在支持范围（决定 aspect-ratio vs 嵌套 SVG）；Sequoia 上无残留 CPU 问题（tao#1191 已修复，2.10.1 已含）；
   - 双形态回归：mini ↔ panel 切换后约束状态正确（mini 下不可拖、panel 下可拖且下限 240）；
   - 持久化回归：调整尺寸 → 关窗重开 → 贴猫位置正确 + 尺寸保持；改系统缩放后恢复尺寸合理（存 logical）。

### 7.2 明确不做（本期）

- 不引入 tauri-plugin-window-state（§4.1 冲突）；
- 不引入 tauri-plugin-decorum（无 resize 把手功能，§2.2）；
- 不做自绘 cursor+setSize 把手（§2.3）；
- 不用 rough.js 动态重绘（§5.3-d）。

### 7.3 诚实标注的不确定项

- 透明窗口 resize 在 Win10/11 的视觉表现：无现行 issue 记录，**未实机验证**；
- webkit2gtk 对 `aspect-ratio` 的确切起始版本：按 WebKit 引擎版本对应**推断**（约 2.34+），未逐一验证；
- window-state 插件恢复 `VISIBLE` 导致隐藏窗口启动可见：基于默认 `StateFlags::all()` 的**推断**（虽不采用该方案，记录备查）；
- 非 GNOME 的 Wayland 合成器（KDE 等）边缘 resize：无一手资料，未确认。
