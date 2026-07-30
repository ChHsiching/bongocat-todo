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
| **缩回-蹦出（tuck-and-pop）** | ~~伴随窗口的跟随交互~~ **已废弃**（ADR 0001 D3 superseded），实际用简单渐隐渐显。保留词条供历史追溯 |
| **Phase 1** | 菜单/插件架构 + todo 本地 MVP（无同步） |
| **Phase 2** | 邮件通知中心 + 桌宠气泡通知 + todo 提醒双发（详见 ADR 0002） |
| **桌宠气泡（bubble）** | 贴桌宠正上方的轻量通知组件，**常驻显示**，用户手动关闭/点击后消失。最多 3 条未处理，超出折入邮件列表。邮件与 todo 到期共用 |
| **邮件提醒器（mail notifier）** | 监听各账号 INBOX 的 IMAP IDLE，新邮件到达时触发气泡。只读信封元数据（发件人+主题），对邮箱**零写操作**、零正文，点击跳 webmail |
| **邮件列表（mail list）** | 桌宠右键菜单独立入口，本地缓存被气泡提醒过的邮件（发件人+主题）。纯本地状态（已读/归档），不碰邮箱服务端。留存规则：默认 24 小时后归档；点击标本地已读 + 5 分钟后归档 |
| **归档邮件（archived mail）** | 桌宠右键菜单独立入口（与邮件列表并列），展示已归档邮件，样式更淡，可再次点击跳转 webmail |
| **软删除（soft delete）** | 删除时不真删，打 `deletedAt` 时间戳，供未来同步使用 |

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
- 跟随交互用**简单渐隐渐显**（原 tuck-and-pop 方案已否决，见 ADR D3 superseded）。
- 存储**复用 pinia 持久化**（零新增依赖），数据结构含 4 个 Phase 2 同步预留字段。
- 日期提醒用 `@tauri-apps/plugin-notification`（新增依赖 + 权限）。
- 上游接触点共 8 处，**全部是追加**，不改原有逻辑。

## Phase 2 决策快照

详见 `docs/adr/0002-phase2-mail-and-bubble.md`。要点：

- **范围**：邮件通知中心 + 桌宠气泡通知 + 邮件列表 + todo 提醒双发。~~轮盘菜单~~已取消（D7 rejected），~~Android 同步~~推迟独立仓库（D5 同步字段不浪费）。
- **邮件协议**：通用 IMAP IDLE 长连接（Rust `async-imap` + tokio），覆盖 Gmail/QQ/163 等，用各家专用密码绕开 OAuth 审核。
- **凭证安全**：OS keyring（Rust `keyring` v4 `v1` feature），pinia store **不持密码**，密码走 `Entry::new(service, username)`，key=`bongocat-todo/mail/<accountId>`。
- **连接生命周期**：Rust 后端 tokio task，绑 **app 进程**（不绑窗口，桌宠开着就有推送）。
- **多账号**：tracer bullet 先单账号打通，多账号紧随其后，两者均为 Phase 2 必交付。数据结构从一开始是数组。
- **邮件边界（D5 superseded）**：从「瞬时通知器」升级为「本地通知中心」——只读信封元数据（发件人+主题）、对邮箱**零写操作**（已读/归档全是本地状态，不碰服务端）、零正文、点击跳 webmail。**放开**本地通知历史。
- **邮件列表（D9）**：桌宠右键菜单两个独立入口（在待办/快速新建下面）——「邮件列表」+「归档邮件」，各自打开伴随窗口。本地缓存被气泡提醒过的邮件。留存规则：默认 24 小时后归档；点击标本地已读 + 5 分钟后归档。归档邮件窗口可再次跳转 webmail。
- **设置入口**：preference 设置窗侧边栏新开一个邮件页（不新建窗口/路由侵入）。
- **气泡通知（D7 改）**：桌宠正上方 / **常驻显示，用户手动关闭/点击后消失** / 最多 3 条未处理，超出折成「还有 N 条，查看邮件列表」/ 邮件→webmail·todo→面板。邮件与 todo 共用气泡组件。
- **todo 提醒**：双发——系统通知（D6 保留）+ 桌宠气泡（纯增量），不拆 `plugin-notification`。
- **设计稿**：spec **之前**做（气泡 UI + 邮件列表 + 邮件设置界面），作为 spec 的 UI 输入；后端（IMAP/keyring/连接管理）靠 TDD 不依赖设计稿。

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

## 🚨 已踩坑清单（T1-T5 实战积累，必读）

> 这些是 T1-T5 实现过程中**反复踩过的坑**，每个都付出过调试代价。新 agent 必读，避免重蹈覆辙。

### 暗色模式：用户明确否决（不要擅自加）
- 设计稿 `panel.html` **只有亮色态**，没有暗色模式。
- T2 第一版擅自加了 `html.dark` 暗色覆盖，被用户严厉否决（"设计稿也没有暗色主题，别自作主张"）。
- **已彻底删除**：`handdrawn.css` 无 `html.dark` 块，`pages/todo/index.vue` 无 `watch(isDark)`。
- 如果未来要做暗色，**必须先和用户确认视觉方向**，不要擅自加。

### 拖拽区 data-tauri-drag-region（proven 模式，照抄别发明）
T2、T5 两次踩坑才对。正确模式（`TodoPanel.panel-header` 是范本）：
- **drag-region 挂整行 div**（不是子元素）
- 装饰子元素（爪印/时钟/spacer）用 `pointer-events: none` 透传到 drag-region
- input/button 天然豁免（不需要额外处理）
- **错误做法**：把整个容器设 `data-tauri-drag-region`（列表项点不了/输入框用不了）；或 drag-region 挂子元素（有 input 兄弟时不可靠）

### 窗口 show 权限：用 showWindow(label)，不要 appWindow.show()
- `appWindow.show()` 需要 `core:window:allow-show` 权限，capability 没有。
- **正确**：用 `showWindow(WINDOW_LABEL.TODO)`（→ `App.vue` handler → Rust `show_window` 命令，权限已有）。

### native date input 在 WebView2 不可用
- `<input type="date">` 在 Windows WebView2 里占位符显示 `yyyy/mm/日`（locale mismatch 四不像），前端无法改文字。
- T5 最终用 **5 个手写数字输入框**（年/月/日 + 时:分）替代，无日历弹层、无 antd DatePicker。
- antd DatePicker 也有问题：弹层小窗溢出 + 企业蓝皮肤难覆盖 + 宽度塌缩看不见。
- **结论**：迷你窗别用 native date input 或 antd DatePicker，用手写输入框。

### locale 文件：新 key 追加末尾，别重排字母序
- 用脚本（python json.dump）重排 labels 字母序会产生 deletion 噪声，破坏上游功能分组顺序。
- **正确**：新 key **追加到末尾**，保留现有顺序。merge upstream 时 diff 干净。

### pre-commit hook 绕过（已知工程债）
- 上游 `package.json` 的 `lint-staged: { "*": "eslint --fix" }` 配太宽，对 `Cargo.lock`/`pnpm-lock.yaml`/`Cargo.toml`/`lib.rs` 报 `File ignored` warning，lint-staged 把 warning 当 failure 中止 commit。
- **绕过**：commit 时用 `SKIP_SIMPLE_GIT_HOOKS=1 git commit ...`。

### Pinia store 必须在 setup 顶层实例化（跨 async 边界会失效）
- T1 踩坑：`setupTodoPlugin()` 在 `onMounted(async)` 回调里调 `useXxxStore()`，报 `code:26 "Must be called at the top of a setup function"`。
- **根因**：Pinia 的 inject 跨 async 边界失效。
- **正确**：store 实例化放 setup 顶层（和上游 store 同位置），异步操作（`$tauri.start()`）可在 onMounted 里。

### Tauri 窗口配置：改 key 时检查无重复
- T2 踩坑：todo 窗口改 `transparent: true` 时只加没删原 `false`，两个 key 共存后者覆盖前者，透明不生效。
- **教训**：改 `tauri.conf.json` 窗口配置时务必检查 key 没有重复。

### pnpm tauri dev 重启前杀残留 WebView2 进程
- `pnpm tauri dev` 重启时残留的 `msedgewebview2.exe` 进程会导致新 exe 启动即退出（exit code -1，无 Rust panic 日志）。
- **解决**：重启前 `taskkill //F //IM msedgewebview2.exe`（Windows Tauri/WebView2 环境问题，非代码问题）。

### git reset 会丢文档回流 commit（single-context 教训）
- T3 会话 `git reset --hard 5aaa70a` 重做动效时，连带丢掉了上一轮的文档回流 commit（CONTEXT.md 踩坑清单 + ADR 侵入账单更新）。
- **教训**：reset 前先确认 reset 点之后是否有非功能 commit（文档/配置）；文档回流应尽快 merge 到稳定基线，不要长期挂在 feature 分支末端容易被 reset。

### Vue multi-arg emit 不能用 `$event[0]/$event[1]` 解包（T6 code-review 抓的真 bug）
- **错误写法**：`@change-priority="emit('changePriority', $event[0], $event[1])"`
- **原因**：Vue 3.5+ 编译器把 `emit(...)` 判为 inline statement，handler 编译成**单参**箭头 `$event => ...`，`$event` 只绑 emit 的**第一个参数**（id 字符串），`$event[0]/$event[1]` 变成索引字符串字符 → 点击墨点循环优先级会静默失效（updateTodo 找不到 id）。
- **正确写法**：`@change-priority="(id, priority) => emit('changePriority', id, priority)"`（命名箭头，多参数显式声明）
- **教训**：以后 multi-arg emit 透传一律用命名箭头，别用 `$event` 数组索引。

### eslint --fix 在 Windows segfault 的可靠绕过
- `pnpm lint` / `npx eslint` 在大目录树 + Windows 上偶发段错误（exit 0xC0000005）。
- **可靠绕过**：`node --max-old-space-size=4096 ./node_modules/eslint/bin/eslint.js <path>`（不带 `--fix`，手动改）。
- 比 `npx eslint <file>` 更稳定（npx 本身也会崩）。

### 上游 release.yml 的 Node 版本已过时（T-CI 修复，勿回退）
- **问题**：上游 `release.yml` 用 `setup-node@v4` + `node-version: 20`。GitHub runner 现默认 Node 24，导致 `pnpm install` 崩溃（`ERR_UNKNOWN_BUILTIN_MODULE`）。**这是上游 workflow 本身的问题，上游自己现在也跑不通**。
- **修复**（`ee93b40`）：`setup-node@v4→@v5`、`node 20→24`，共 6 处替换，结构不变。
- **勿回退**：未来 merge 上游时这一行会冲突，**按版本号策略保留我们的**（上游的也是坏的）。

### master 不直接开发，任何 commit 都走分支 + no-ff merge（反复踩！）
- **已发生 2 次**：T-CI 会话 + Phase 1 收尾，都在 master 上直接 commit 了（违反 AGENTS.md 分支策略）。
- **教训**：**任何** commit——哪怕只是改一个参数、一行文档——都先 `git checkout -b <branch>`，在分支上 commit，再 `git checkout master && git merge --no-ff <branch>`。
- **已 push 的违规 commit 修正成本高**（要 force push 回退 origin）。commit 前先看 `git branch --show-current` 是不是 master，是的话**停下来先建分支**。

### identifier 改变会导致 tauri-store 数据目录变化（数据"丢失"假象）
- tauri-store/pinia 的持久化路径基于 app identifier（`tauri.conf.json` 的 `identifier`）。
- T-CI 把 identifier 从 `com.ayangweb.BongoCat` 改成 `com.chhsiching.bongocat-todo` 后，存储目录从 `%APPDATA%/com.ayangweb.BongoCat/` 变成了 `%APPDATA%/com.chhsiching.bongocat-todo/`。
- **症状**：手动往旧目录写持久化数据，app 读不到（面板空），因为 app 实际从新目录读。
- **排查**：identifier 变更后，查数据文件要找**新 identifier 对应的目录**，不是旧上游的。
- **Windows 路径**：`%APPDATA%/<identifier>/tauri-plugin-pinia/<store-id>.dev.json`（dev 模式带 `.dev` 后缀）。

## todo 插件组件清单（Phase 1 完成，T1-T6 全部组件）

> 位于 `src/plugins/todo/components/`，扁平目录 `<Name>/index.vue`。复用时直接 import。

| 组件 | 来源 | 说明 |
|------|------|------|
| `PaperPanel` | T2 | 纸张容器 + 极淡灰颗粒纹理，面板主容器 |
| `PawLogo` | T2 | SVG 4 圆 + 椭圆真爪印 |
| `HandCheckbox` | T2 | 手绘不规则方形 + 粉色填充 + 手绘对勾 |
| `InkDot` | T2（T6 加 clickable） | 三层 path 墨点，按 priority 变色；`clickable` 模式渲染 button 可点击切换 |
| `HandClock` | T2 | Q 曲线外圈 + 弧度时分针 + 中心点 |
| `WaveDivider` | T2 | 手绘波浪分隔线（`Q 25 1 50 3 T 98 3`） |
| `TodoItem` | T2（T6 增强） | 单条 todo：checkbox + title + 可点击墨点切换优先级 + dueLabel 含时分 |
| `TodoPanel` | T2（T6 增强） | 主面板：标题 + 新建区（标题+优先级+日期+确认取消）+ 列表 + footer |
| `MiniInput` | T5（T6 复用共享组件） | 迷你快速新建窗（380px 宽），复用 HandDateInput/PriorityPicker |
| `HandDateInput` | T6（共享） | 5 个手写数字框（年/月/日 + 时:分），focus 自动填充当前系统时间，迷你窗 + 主面板复用 |
| `PriorityPicker` | T6 | 三档墨点横排选择器（low=蓝/medium=橙/high=红），v-model，选中加波浪下划线 |

工具函数（`src/plugins/todo/utils/`）：
- `priority.ts`：`PRIORITIES` 数组 + `priorityIndex` + `nextPriority`（循环切换）

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
- **文字粗细**：todo title `font-weight: 700 / 17px`（851 在小字号下显细，必须加粗）。**全局基线 `font-weight: 600`**，标题 700。**主次用颜色弱化**（`--ink-soft`/`--ink-faint`），**不要用细字重区分主次**——851 默认 normal 太细特别丑。

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
| `tuck-pop-animation.html` | ~~缩回-蹦出动效~~ **已废弃**（tuck-and-pop 方案被用户否决，改为简单渐隐渐显，见 ADR D3）。保留作历史参考。 |
| `851.ttf` | 851 手写杂字体（设计稿用，implement 时按 vite 字体打包流程处理） |

迭代过程中的废弃版本（v0 antd 版 / v1 CSS border 版 / v2 米白纸版）已删除。

**窗口动效** — ❌ tuck-and-pop 已否决，✅ 简单渐隐渐显（实际实现）
- **tuck-and-pop（已废弃）**：原方案过复杂、调试代价高（3 个回归：右键猫面板消失 / 面板定位到屏外 / 透明窗口冒原生滚动条），用户明确否决（"不想要这个动效了，只需要最普通最简单的渐隐渐显"）。设计稿 `tuck-pop-animation.html` 保留作历史参考，**不要重新提议恢复**。
- **渐隐渐显（实际实现，T3）**：opacity 过渡 200ms ease。打开渐显、关闭渐隐（关闭先跑 200ms 渐隐再 hideWindow）。两个窗口（待办面板 + 快速新建）共用同一套 fade 状态。
- **面板定位**：以猫为锚点（待办面板 = 猫正上方居中；快速新建 = 猫上方偏右），边缘 clamp + 翻边，不超出屏幕。
