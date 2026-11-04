# CONTEXT.md

本文件是 `bongocat-todo` fork 的 single-context 词汇表与决策快照。任何 agent 在动手前都应先读这里 + `docs/adr/`。

## 仓库定位

- 本仓库是 [ayangweb/BongoCat](https://github.com/ayangweb/BongoCat)（Tauri 2 + Vue 3 桌宠）的 fork。
- fork 的核心扩展目标：以**插件化方式**新增 todo list 等模块，并持续接收上游更新。
- 同步约定见 `AGENTS.md`；架构决策见 `docs/adr/`。

## 分发渠道（fork 独立于上游）

| 平台 | 渠道 | 包名 | 状态 |
|------|------|------|------|
| **macOS** | Homebrew Cask | `ChHsiching/tap/bongo-cat-todo` | 计划中 |
| **Arch/Manjaro** | AUR | `bongo-cat-todo-bin` | 计划中 |
| **Windows** | GitHub Release（exe） | — | ✅ 已有 |
| **Debian/Ubuntu/Mint** | GitHub Release（deb） | — | ✅ 已有（`dpkg -i` 安装） |
| **Fedora/RHEL** | GitHub Release（rpm） | — | ✅ 已有（`rpm -i` 安装） |
| **Linux 通用** | GitHub Release（AppImage） | — | ✅ 已有 |

- fork 的包名用 `bongo-cat-todo`（Homebrew Cask）/ `bongo-cat-todo-bin`（AUR），与上游 `bongo-cat` 区分。
- Homebrew tap 仓库：`ChHsiching/homebrew-tap`（Casks/bongo-cat-todo.rb，GUI app 用 Cask 不是 Formula）。
- release.yml 发版后自动更新 Homebrew Cask + AUR PKGBUILD（CI 自动化，待实现）。
- 暂不做 PPA/COPR（维护成本高，`.deb`/`.rpm` 手动安装够用）。

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

### Phase 2 邮件模块踩坑（T1 实现，必读）

> 以下 8 个坑都是 T1 实现过程中付出调试代价才发现的，ADR 0002 D1/D2/D3 已更新对应决策。

#### native-tls/SChannel 吊销检查导致 TLS 握手失败 → 用 rustls
- **问题**：`tokio-native-tls` 在 Windows 上走 SChannel，默认做证书吊销检查（OCSP/CRL）。用户网络下吊销服务器不可达 → `CRYPT_E_REVOCATION_OFFLINE` → TLS 握手失败。curl（同样走 SChannel）复现。
- **修复**：改用 `tokio-rustls` + `rustls`（不检查吊销）+ `webpki-roots`（内置 Mozilla 根 CA，不用系统证书库）。
- **详见**：ADR 0002 D1 T1 纠正段。

#### rustls 0.23 crypto provider 必须显式安装（否则永久卡死）
- **坑**：rustls 0.23 首次调 `ClientConfig::builder()` 时需要进程级 crypto provider。**不安装会永久卡死**——不 panic、不超时、`tokio::time::timeout` 都救不了（卡在 provider 初始化的内部锁上）。
- **修复**：插件 init 的 setup 里 `rustls::crypto::ring::default_provider().install_default()`。幂等，重复调用返回 Err 忽略。

#### async-imap IDLE `wait()` 在 Tauri runtime 卡死 → `wait_with_timeout(10s)`
- **坑**：`Handle::wait()` 默认 29 分钟超时，在 Tauri 的 tokio runtime 下**永远不返回 Timeout**（timer future 永久 Pending）。`NewData` 路径正常，但 `Timeout` 路径完全失效。
- **修复**：改用 `handle.wait_with_timeout(Duration::from_secs(10))`，10 秒短周期循环。Timeout 分支做兜底 `fetch_new_envelopes`，补查 IDLE 推送间隙漏掉的新邮件（QQ 邮箱 IDLE 推送不稳定，10 秒兜底保证体感延迟可控）。
- **详见**：ADR 0002 D3 T1 纠正段。

#### keyring v4 删除 API 是 `delete_credential`（不是 `delete_password`）
- **坑**：ADR 0002 D2 原写 `delete_password()`，实际 keyring v4 v1 feature 的 API 是 `delete_credential()`。写错编译失败。

#### Tauri 2 capability 权限要显式 allow
- **坑**：Tauri 2 权限模型要求插件命令在 `src-tauri/capabilities/default.json` 显式 allow。建插件时漏了，导致 `mail_test_connection not allowed`。
- **修复**：`capabilities/default.json` 加 `mail:allow-*` 权限。**新建 Tauri plugin 时必须同时加 capability 权限**。

#### vue-i18n 的 `@` 必须 literal 转义
- **坑**：vue-i18n 把 message 里的 `@` 当 linked-message 语法符（`@:key`）。`addressPlaceholder` 的 `alice@gmail.com` 导致编译失败，启动报 `SyntaxError: Invalid linked format`。
- **修复**：locale 文件的 `@` 改为 `{'@'}`。

#### TUN 透明代理对 993 端口不稳定 → 程序需自带 HTTP CONNECT 代理
- **问题**：国内用户的境外邮箱（Gmail 等）需代理。TUN 透明代理对 993 端口转发不稳定（`stack: system` 已知问题）。
- **修复**：程序内置 HTTP CONNECT 代理支持（`async-http-proxy` crate），设置页提供代理输入框。详见 ADR 0002 D10。

#### WebView2 console.log 不转发到 Tauri stdout（T2 踩坑）
- **问题**：Windows WebView2 的 `console.log` **不会**出现在 `pnpm tauri dev` 的 Rust stdout 里。前端调试时以为日志没输出，实际是被 WebView2 吞了。
- **修复**：前端调试用 `@tauri-apps/plugin-log` 的 `info()` / `error()`，这些会转发到 Tauri 日志系统可见。

#### Rust serde 蛇形/驼峰不匹配是静默 bug（T2 修复 T1 遗留）
- **坑**：Rust struct 字段默认蛇形（`account_id`），前端 JS 读驼峰（`accountId`）。如果 struct 缺 `#[serde(rename_all = "camelCase")]`，前端 `payload.accountId` 会拿到 **`undefined`**——**不报错、不崩溃、静默失败**。
- **修复**：`NewMailPayload` / `ConnectionStatusPayload` 加 `#[serde(rename_all = "camelCase")]`。
- **规则**：**后续新增任何 Rust → 前端 event payload struct，必须加这个属性**。

#### SVG path 写死坐标是布局炸弹（T2 踩坑）
- **坑**：设计稿 `bubble.html` 的气泡 SVG path 坐标是写死的（固定高度）。内容变高时气泡形状不跟着变，文字溢出到气泡外面。`preserveAspectRatio="none"` 会强行拉伸变形。
- **修复**：新增 `bubbleShape.ts` 的 `genBubbleShape(textHeight)`，按内容高度动态生成 path d。
- **规则**：**手绘风 UI 的 SVG 形状不能用写死坐标**，必须根据内容尺寸动态生成 path。T5 邮件列表/归档面板也是手绘风，同样适用。

#### Tauri listen 不 await 是竞态炸弹（T5 踩坑）
- **坑**：`setupMailPlugin` 里 4 个 `listen()` 没 `await`，监听器还没注册完 Rust 就补发 emit `mail://new-mail`，离线补发的邮件被丢弃。正常 IDLE 推送（10 秒后）不暴露这个 bug，但离线补发是「连接后立即 emit」，时序紧得多。
- **修复**：全部加 `await`，确保注册完再 `mailConnect`。
- **规则**：**Tauri `listen` 是异步的（返回 Promise）**，如果有「连接后立即 emit」的场景，必须 await 所有 listen 完成后再建立连接。

#### store 加新字段要做数据迁移（T5 踩坑）
- **坑**：T5 给 mailAccount store 加 `lastSeenUid` 字段，但 T5 前创建的账号持久化 JSON 没这个字段（`undefined`）。`setLastSeenUid` 里 `uid > undefined` 是 `false`（NaN 比较），永远不更新 → 离线补发永不触发。
- **修复**：`migrateLastSeenUid()` 给旧账号补 `lastSeenUid: 0`；`setLastSeenUid` 用 `?? 0` 兜底。
- **规则**：**给已有持久化 store 加新字段时，必须写 migrate 函数给旧数据补默认值**，否则 undefined 参与比较运算会静默 false。

#### `monitors.find(m => ...)` 的 m 闭包泄漏（T5 踩坑）
- **坑**：`mail-list/index.vue` 的 clamp 定位代码 `monitors.find(m => ...)` 里参数名 `m`，在 find 回调外部作用域被误引用 → `ReferenceError`，整个监听回调崩溃，邮件列表窗口打不开。归档窗口用的参数名是 `monitor` 所以没踩。
- **修复**：`m` → `monitor`。
- **教训**：ESLint 抓不到这种「find 回调参数名跨作用域泄漏」，只有运行时 ReferenceError 才暴露。**find/filter 回调参数名要语义化、不与外部变量重名**。

#### inline 二次确认必须有强制反应死区（T5a 踩坑）
- **坑**：inline 二次确认（按钮变形，非弹窗）如果没有死区，用户快速双击会瞬间删除，等于没有二次确认。
- **修复**：进入确认态后先有 **700ms 死区**（按钮变灰禁用 + `cursor: not-allowed` + 点击忽略），死区结束后才变红色高亮可点击，再过 3.3 秒不点自动恢复。
- **规则**：**inline 二次确认必须配死区**，否则防不住误双击。死区内按钮视觉必须明确禁用（灰+not-allowed），不能只是「逻辑上忽略点击但视觉正常」。

#### 气泡布局必须向上扩展（T6 踩坑）
- **坑**：气泡内容多行或多气泡堆叠时，向下扩展会侵入桌宠 sprite 区域（遮挡猫）。原设计有「翻猫下方」分支，但翻下方必然跨猫更糟。
- **修复**：窗口底部锚定 `catY - 8px`，多气泡/多行内容**向上堆叠**；去掉翻下方分支，空间不足时顶部 clamp 到屏幕顶。宽度自适应（`genBubbleShape` 加 width 参数，取 `max(360, 子组件自然宽度)`），长链接撑宽不溢出。
- **规则**：**气泡只向上扩展，不向下、不翻下方**。

#### `ReturnType<typeof useXxxStore>` 在 index.ts 需要 `import type`（T3 踩坑，顺带修了 T1 遗留）
- **坑**：`src/plugins/mail/index.ts` 的 `SetupMailPluginArgs` / `removeAccount` 签名用 `ReturnType<typeof useMailNotificationStore>`，但该 store 只 `export {}`（运行时 re-export）没 `import type`。tsc 报 `Cannot find name 'useMailNotificationStore'`（**静默通过 vite 但 vue-tsc/tsc 报错**）。T1 就埋了这个雷（SetupMailPluginArgs 的 notification/settings 两个字段一直报错），T3 加 removeAccount 签名时暴露。
- **修复**：文件顶部补 `import type { useMailNotificationStore } from './stores/mailNotification'`（settings 同理）。`useMailAccountStore` 一直有 `import type` 所以没踩。
- **规则**：**在 index.ts 这类「re-export + 自身签名引用」的聚合文件里，所有被 `ReturnType<typeof X>` 引用的 store 必须在顶部 `import type { X }`**，光 re-export 不够（re-export 不把名字引入当前模块作用域）。

#### 静态资源（logo/图片）用 public 目录，别用 src/assets（T3 决策）
- **决策**：邮箱 logo 10 个文件放 `public/mail-logos/`（绝对路径 `/mail-logos/xxx`），与项目字体（`public/fonts/`）一致。**不用 `src/assets/`**——后者要 `import logo from '@/assets/...'` + vite hash 文件名，对于按域名动态匹配 logo 的场景（`matchProviderLogo` 返回字符串路径）反而麻烦（import 得静态分析，不能运行时拼路径）。
- **public 原样拷贝**：开发期 `/mail-logos/...` 直接可访问，生产构建同路径不做 hash，`matchProviderLogo` 返回的字符串路径两端（store + img src）一致。

#### PNG logo「白底转透明」误杀内部白色（QQ logo 踩坑）
- **坑**：简单白底转透明（`r>235 && g>235 && b>235 → alpha=0`）会把 logo 内部的白色部分也转透明。QQ 企鹅的白肚皮/眼白和背景白色 RGB 接近，简单阈值把肚皮也清了 → 企鹅变成空心轮廓。
- **正确方法**：**flood fill 重建 alpha**——从图像四角的非 logo 色背景开始扩散，标记「连通到边缘的背景」为透明，被 logo 主体色（黑/红）包围的内部白色（肚皮/眼白）保留不透明。需用浏览器 canvas `getImageData` 逐像素处理（不要手写 node PNG 编解码器）。
- **规则**：logo 有内部白色区域时，不能用简单阈值转透明，必须 flood fill 按连通性区分背景 vs 内部白色。

#### 账号卡片 logo 尺寸偏离设计稿（T3 用户决策）
- **设计稿** `mail-settings.html`：容器 36×36，logo 22×22。
- **用户调整**：放大到容器 48×48（`h-12 w-12`）、logo 32×32（`h-8 w-8`）、`object-contain` 保比例、垂直居中。**不要 `h-full w-full` 撑满容器**（用户明确否决「太难看了盛满容器」）。
- **IMAP 详情行** `pl-15`（60px = 容器 48 + gap 12）对齐文字起始位置。
- **设计稿未改**（仍是 36×36 原值），以实际实现 48×48 为准。

#### Coremail 服务器不支持 IDLE → 轮询降级（T4 踩坑）
- **坑**：Coremail（论客）服务器对 IDLE 命令返回 `BAD command not support`，不实现 IMAP IDLE 扩展。教育邮箱（如 `.edu.cn`）多由 Coremail 教育版 SaaS 托管。
- **修复**：`logic.rs` 新增 `classify_idle_error(err_msg) -> IdleSupport`（Unsupported vs Transient）纯函数 + `manager.rs` 新增 `poll_loop`：IDLE init 失败且判定 Unsupported 时，重建 session 走纯轮询（`POLL_INTERVAL` 5 秒 sleep + fetch 循环）。
- **技术细节**：`session.idle()` 消耗 session 进 handle，init 失败后 async-imap 没有安全 API 拿回 session（`done()` 会再次触发 BAD），所以降级时**重新 `build_imap_session` 建新连接**。

#### 网易系邮箱（163/126）要求 IMAP ID 命令（1.3.1 修复）
- **坑**：网易邮箱（163/126/yeah.net）要求第三方客户端在 LOGIN 后、SELECT 等操作前发送 IMAP ID 命令（RFC 2971）表明身份（name/version/vendor 等），否则后续操作返回 `Unsafe Login` 错误。之前 `build_imap_session` 跳过了 ID 命令直接 select INBOX，导致 163/126 用户全部被拒。
- **修复**：`build_imap_session` 在 login 后、select 前调用 `session.id([("name", ...), ("version", ...), ...])`。用 `let _ =` 忽略返回——不支持 ID 的服务器返回 BAD 也不影响后续流程。
- **ID 命令时序**：163 的要求是**先 LOGIN 后 ID**（不是 LOGIN 前）。LOGIN 本身会成功返回 OK，但不发 ID 的话 SELECT 会被拒。参考：[网易帮助](https://help.mail.163.com/faqDetail.do?code=d7a5dc8471cd0c0e8b4b8f4f8e49998b374173cfe9171305fa1ce630d7f67ac2eda07326646e6eb0)。
- **async-imap 0.11.3** 的 `Session::id()` 方法签名：`id(identification: impl IntoIterator<Item = (&str, Option<&str>)>) -> Result<Option<HashMap<String, String>>>`。

#### build_imap_session 代理覆盖 bug（T4 修复 pre-existing）
- **坑**：`manager.rs` 有重复的 `let tcp = TcpStream::connect(...)`，把代理分支建立的隧道 tcp 覆盖了——**代理路径从未生效过**。
- **修复**：删除重复代码。注意用户实际没用代理（国内邮箱直连），这个 bug 是潜在的。

#### antdv-next Input type="number" 绑定的仍是 string（T4 踩坑）
- **坑**：`<Input type="number">` 的 `v-model:value` 绑定的是 **string**（HTML input value 永远是 string），传给 Rust `u16` 报 `invalid type: string "993", expected u16`。
- **修复**：`handleTestAndSave` 显式 `Number(imapPort.value)` + 范围校验（1-65535）。
- **规则**：**antdv-next Input type="number" 的 v-model 绑定值是 string 不是 number**，传给 Rust 强类型参数前必须显式转换。

#### 教育邮箱 IMAP 地址公网 DNS 无解析（T4 踩坑）
- **坑**：学校给的 IMAP 地址（如 `imap.s.ytu.edu.cn`）**公网 DNS 无解析**（仅学校内网 DNS 有记录）。实际可用地址是 `edu.icoremail.net`（Coremail 教育版 SaaS 通用接入）。
- **修复**：`providers.ts` 新增 `SUFFIX_PATTERNS`（`.edu.cn` / `.edu` → `edu.icoremail.net`）+ `extractEduAbbr`（从域名提取学校简称用于 displayName）。
- **规则**：学校给的地址不一定校外可用，教育邮箱用户需 fallback 到 `edu.icoremail.net`。

#### 右键菜单偶发失效（未解决，已搁置）
- **症状**：右键桌宠弹出原生菜单，偶发无法用鼠标点击（不高亮、无法选中），但**键盘方向键能选中**。完全随机，无明确触发条件。
- **已排除的 6 个方向（不要再试）**：① `setAlwaysOnTop` 没 await ② Win32 `SetForegroundWindow` 前台锁定 hack ③ `handleMouseDown` 的 startDragging 与 menu.popup 竞争 ④ alwaysOnTop 轮询线程 16ms 竞争 ⑤ 鼠标悬停隐藏 setIgnoreCursorEvents ⑥ 鼠标穿透开关。
- **确定事实**：菜单弹出了（可见）+ 键盘能操作（有焦点）+ 鼠标不行（事件被拦截/穿透）+ 与 alwaysOnTop 无关 + 与穿透无关 + 无其他窗口干扰。
- **结论**：Tauri/WebView2 在 Windows 上的底层交互问题，fork 代码层面诊断到极限。等 Tauri 上游修复或将来有更多线索再查。

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
| `TodoItem` | T2（T6 增强） | 单条 todo：checkbox + title + 可点击墨点切换优先级 + dueLabel 含时分。T6 改动：isOverdue/dueLabel 从整天比较改为精确到分钟（今天 10:15 到期、10:16 即显示红色「已逾期 10:15」）；删除按钮 ×叉号 → 手绘垃圾桶（复刻 MailItem） |
| `TodoPanel` | T2（T6 增强） | 主面板：标题 + 新建区（标题+优先级+日期+确认取消）+ 列表 + footer |
| `MiniInput` | T5（T6 复用共享组件） | 迷你快速新建窗（380px 宽），复用 HandDateInput/PriorityPicker |
| `HandDateInput` | T6（共享） | 5 个手写数字框（年/月/日 + 时:分），focus 自动填充当前系统时间，迷你窗 + 主面板复用 |
| `PriorityPicker` | T6 | 三档墨点横排选择器（low=蓝/medium=橙/high=红），v-model，选中加波浪下划线 |

工具函数（`src/plugins/todo/utils/`）：
- `priority.ts`：`PRIORITIES` 数组 + `priorityIndex` + `nextPriority`（循环切换）

## mail 插件组件清单（Phase 2 T1-T3 完成，T4-T6 进行中）

> 位于 `src/plugins/mail/`。Rust 后端在 `src-tauri/src/plugins/mail/`（独立 Tauri plugin crate）。

### Rust 后端（`src-tauri/src/plugins/mail/`）
| 文件 | 说明 |
|------|------|
| `src/lib.rs` | init() + rustls crypto provider install_default + ConnectionManager state |
| `src/commands.rs` | `mail_test_connection` / `mail_connect` / `mail_disconnect` / `mail_store_password` / `mail_delete_password` |
| `src/manager.rs` | ConnectionManager + idle_loop + idle_wait_loop + **poll_loop（T4：Coremail 降级轮询）** + build_imap_session（含 HTTP CONNECT 代理，**T4 修复代理覆盖 bug**）+ fetch_max_uid + fetch_new_envelopes + decode_mime_words + **has_connection / connection_count（T4 多账号查询）** |
| `src/logic.rs` | `should_reset_idle` / `backoff_delay` / **`classify_idle_error`（T4：IDLE 不支持判定）** + `IdleSupport` 枚举 + **`POLL_INTERVAL`(5s)** + `#[cfg(test)]` 测试 |

### 前端（`src/plugins/mail/`）
| 文件 | 说明 |
|------|------|
| `commands.ts` | Rust 命令的 TS 封装 |
| `index.ts` | setupMailPlugin（listen events，**T3：气泡受设置开关控制 bubbleEnabled/unreadOnly**）+ testAndSaveAccount + removeAccount（**T3：级联清 mailNotification**）+ toggleAccountEnabled（**T3 新增**：开关账号建/断连接） |
| `stores/mailAccount.ts` | 账号配置 store（数组，长度限制 1，T4 放开）+ setEnabled（**T3 新增**，开关切换）+ vitest 测试 |
| `stores/mailSettings.ts` | 代理设置 + **T3 通知三开关**（bubbleEnabled 默认 true / bubbleAutoDismiss 默认 false / unreadOnly 默认 false） |
| `utils/providers.ts` | `matchProvider()` provider 识别（含 displayName + webmailUrl + logo 路径）+ `matchProviderLogo()` + `DEFAULT_MAIL_LOGO` + vitest 测试。**T3**：拆 foxmail 独立预设 + 新增 proton / yahoo。**T4**：`SUFFIX_PATTERNS`（`.edu.cn`/`.edu`→`edu.icoremail.net`）+ `extractEduAbbr`（教育邮箱后缀模式匹配） |
| `utils/errors.ts` | `formatConnectionError(rawErr, t)` 纯函数（**T4 新增**）：Rust 技术错误分类为友好提示（TLS/auth/timeout/unsafe login/domain not local/network），只翻译不写长文 + vitest 测试 |
| `utils/bubbleShape.ts` | `genBubbleShape(textHeight)` 按内容高度动态生成气泡 SVG path d（T2 新增） |
| `components/Bubble/index.vue` | **手绘风气泡**（T2 完成，T6 增强）：圆胖 SVG 形状 + 荆南波波黑字体 + 粉墨配色 + 常驻手动关闭 + max 3 折入列表。payload 升级为判别联合 `BubblePayload`（mail/todo），type='todo' 渲染红墨手绘时钟 + 红墨波浪 +「已到期」副标题，点击打开 todo 面板 |
| `components/MailPanel/index.vue` | 邮件面板纸张容器（T5 新增，复刻 PaperPanel，viewBox 400×560） |
| `components/MailItem/index.vue` | 邮件项（T5 新增，T5a 增强）：三态 unread 红墨点 / read 信封+淡化 / archived 半透明+标签 + 归档按钮(手绘箱) + 删除按钮(手绘垃圾桶) + inline 二次确认(700ms 死区+3.3s 确认窗口) + meta 两列网格 + 绝对日期 |
| `stores/mailNotification.ts` | 本地通知历史 store（T5 新增）：unread→read→archived 状态机 + removeByAccount（**T3 新增**，删除账号级联清理）+ vitest 测试 |
| `utils/retention.ts` | 留存规则纯函数（T5 新增）：24h 归档 / 5min 归档 / 30 天清理 + vitest 测试 |
| `utils/timeFormat.ts` | 相对时间格式化（T5）：「2 分钟前」/「昨天」+ `absoluteDate(ts)` 绝对日期 `年.月.日`（T5a 新增） |

> **字体变更（T2，用户口头要求）**：手写字体从 851 换成**荆南波波黑**。font-family 名仍叫 `'Handwriting851'`（历史命名，只换了 `@font-face` src）。气泡 `bubble.css` 和 todo `handdrawn.css` 各自定义 `@font-face`，改字体要改两处。
>
> **新需求备忘（不在现有 ticket 里）**：用户计划设置页加「字体切换」功能，内置多种字体。Phase 2 范围外，暂不建 ticket。

### 接入点
- `src/constants/index.ts`：`WINDOW_LABEL.BUBBLE` / `MAIL_LIST` / `MAIL_ARCHIVE` + `LISTEN_KEY.SHOW_BUBBLE` / `SHOW_MAIL_LIST` / `SHOW_MAIL_ARCHIVE`
- `src/router/index.ts`：`/bubble` / `/mail-list` / `/mail-archive` 路由
- `src/pages/bubble/index.vue`：气泡窗口（独立伴随窗口，定位照抄 todo 面板 clamp+翻边）
- `src/pages/mail-list/index.vue`：邮件列表窗口（T5 新增）
- `src/pages/mail-archive/index.vue`：归档邮件窗口（T5 新增）
- `src/pages/preference/components/mail/index.vue`：邮件设置页（**T3 重写**：账号列表 logo+地址+状态点+IMAP+启用开关+删除 / 添加表单 input-with-icon logo 联动 + 提示区自制 SVG 感叹号三角 + 通知设置三开关，遵循 ProList+ProListItem+Switch）+ 代理）
- `public/mail-logos/`：11 个邮箱 logo（**T3 新增** 10 个 + **T4 新增** `logo-edu.svg` 毕业帽，全 RGBA 透明，域名→logo 映射见 `utils/providers.ts` 的 `logo` 字段）
- `src-tauri/tauri.conf.json`：bubble / mail-list / mail-archive 窗口 + preference minHeight 720
- `src-tauri/capabilities/default.json`：`mail:allow-*` 权限（新建 Tauri plugin 必须加 capability）
- 5 个 locale 文件：`plugins.mail.labels.*` + `providers.*`

> **气泡窗口方案（T1 回填）**：用独立伴随窗口 `WINDOW_LABEL.BUBBLE`（非 main 内渲染）。main 透明穿透 + 尺寸紧贴 sprite，气泡可点击区域与 main 交互冲突。详见 ADR 0002 D7.1。

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

### Phase 2 设计稿 — 已定稿 ✅

设计稿存于 `docs/designs/phase2-exploration/`，三份 HTML 均已定稿，作为 `/to-spec` 的 UI 输入：

| 文件 | 说明 |
|------|------|
| `bubble.html` | **桌宠气泡**：圆胖手绘气泡，贴桌宠正上方，**常驻 + 手动关闭**（非自动消失），最多 3 条 + 溢出折成「还有 N 条，查看邮件列表」，纯渐入渐出，360px 宽，font-weight 600 基线 |
| `mail-list.html` | **邮件列表 + 归档邮件**：两个伴随面板，手绘风 + 右上角关闭按钮。邮件列表（未读/已读）+ 归档邮件（样式更淡），font-weight 600 基线 |
| `mail-settings.html` | **邮件设置页**（preference 侧边栏）：720px 高（侧边栏不滚动），账号列表（provider logo 自动识别）+ 添加账号表单（域名→logo/IMAP 联动）+ 通知设置。遵循 antdv-next preference 规则 |
| `851.ttf` | 851 手写杂字体（复用 todo 设计稿的同款） |

**邮箱 logo 清单**（全部 **RGBA 透明背景**，适配暗色模式；provider 自动识别按邮箱域名映射）：

| 文件 | 适用域名 | 来源 |
|------|---------|------|
| `logo-gmail.svg` | gmail.com / googlemail.com | Iconify logos 集（Google 原色 M） |
| `logo-qq.png` | qq.com | QQ 邮箱官网真实企鹅 |
| `logo-foxmail-icon.png` | foxmail.com | foxmail.com 官网 logo 裁剪，**只留红色 G 图标**（去掉右侧文字） |
| `logo-163-icon.png` | 163.com / yeah.net | mail.163.com 登录页 `.header-163logo` 裁剪出左侧图标 |
| `logo-126-icon.png` | 126.com | mail.126.com 登录页 `.header-126logo` 裁剪出左侧图标 |
| `logo-outlook.svg` | outlook.com / hotmail.com / live.com | simple-icons + 品牌蓝 |
| `logo-icloud.svg` | icloud.com / me.com / mac.com | simple-icons + 品牌蓝 |
| `logo-proton.png` | proton.me / protonmail.com | proton.me favicon（白底转透明） |
| `logo-yahoo.svg` | yahoo.com | simple-icons + 品牌紫 |
| `logo-mail-default.svg` | 未识别域名 | 中性灰信封图标 |

> ⚠️ **logo 处理踩坑**：所有 PNG 必须 RGBA 透明（暗色模式下白底会很难看）。裁剪横长 logo（如 foxmail/163/126 官网 logo 都是「图标+文字」banner）时只取左侧图标部分。**不要手写 node PNG 编解码器**处理像素——filter 逻辑极易出错导致马赛克，改用浏览器 canvas `toDataURL`。
