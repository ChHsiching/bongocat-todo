# ADR 0002: Phase 2 邮件提醒器与桌宠气泡通知

- **Status**: Accepted
- **Date**: 2026-07-30
- **Decision driver**: @ChHsiching
- **Supersedes**: —（修正 ADR 0001 / CONTEXT.md 中 Phase 2 的旧定义「轮盘菜单 UI + Android 局域网同步」，轮盘已 D7 rejected，Android 同步推迟独立仓库）

## Context

Phase 1（v1.2.0）已发版。Phase 2 原候选方向（轮盘菜单 / Android 同步）经 grilling 后调整为：

- **轮盘菜单** — 已取消（ADR 0001 D7 rejected）。
- **Android 同步** — 推迟到独立仓库。桌宠本体是桌面概念（透明置顶窗口/穿透/托盘），Android 客户端只能是一个独立的 todo app，是从零开始的新工程，不该塞进本 Phase。
- **面板拖拽 + 位置记忆** — Phase 1 末已完成。

确定下来的 Phase 2 真实范围是**邮件提醒器 + 桌宠气泡通知 + todo 提醒双发**。本 ADR 记录该范围的所有架构决策、tradeoff 与技术方案。

## Decision

### D1. 邮件协议走通用 IMAP IDLE 长连接

**决策**：Rust 后端用 `async-imap` crate（`runtime-tokio` feature）+ tokio 异步运行时，对每个账号的 INBOX 建立 IMAP IDLE 长连接，新邮件到达时服务端推送（`IdleResponse::NewData`）。

**理由**：
- 通用性覆盖 Gmail / QQ / 163 / Outlook 等所有支持 IMAP 的邮箱，符合「绑定邮箱」泛指需求。
- IDLE 兼顾实时与省资源（服务端推送，无需轮询）。
- 配合各家「专用密码/授权码」，绕开 Gmail OAuth 应用注册与审核（单人 fork 搞不动 consent screen）。

**被否决的方案**：
- **Gmail API push（只做 Gmail）**：实时性最好但只支持一家；需注册 Google Cloud OAuth 应用 + 审核，单人 fork 维护负担重；扩展到第二家要重做。
- **通用 IMAP + 轮询**：工程量小但延迟最高（最多 60s）、最耗资源，违背选 IDLE 的初衷。

**验证（2026-07-30，docs.rs 权威）**：`async-imap` 的 `extensions::idle` 模块提供 `Handle` / `IdleStream` / `IdleResponse`（`NewData` | `Timeout` | `ManualInterrupt`），API 完全匹配本场景；支持 `runtime-tokio` feature 与 Tauri 2 的 tokio 运行时兼容。

**新依赖（侵入账单）**：
- `async-imap`（IMAP 协议）
- TLS 库（`tokio-native-tls` 或 `rustls`）—— async-imap 自身不处理 TLS，需先建立加密连接再传给 `Client::new()`。这是标准用法，非坑，但 spec 必须写清。

### D2. 凭证走 OS keyring，pinia store 不持密码

**决策**：邮箱密码/授权码用 Rust `keyring` crate 存入 OS 密钥库（Windows Credential Manager / macOS Keychain / Linux Secret Service）。pinia store 里只存**非敏感**的 IMAP 配置（host/port/用户名），**绝不存密码**。

**理由**：
- 现有持久化（`@tauri-store/pinia` 的 `saveOnChange`）落地为**明文 JSON**（`%APPDATA%/com.chhsiching.bongocat-todo/tauri-plugin-pinia/`）。todo 数据明文无碍，但邮箱密码明文落地是安全红线。
- 「密码不进 store」是贯穿整个邮件模块的约束：连接建立时从 keyring 异步取密码，不常驻内存。

**keyring 用法（验证后）**：
```toml
[dependencies]
keyring = { version = "4", features = ["v1"] }
```
```rust
use keyring::v1::Entry;
let entry = Entry::new("bongocat-todo/mail/<accountId>", username)?;
entry.set_password(password)?;
entry.get_password()?;
entry.delete_password()?;
```
> ⚠️ **grill 时曾误说 v3，验证后纠正为 v4 + `v1` feature flag**（API 路径是 `keyring::v1::Entry`，非顶层 `keyring::Entry`）。spec/implement 必须按 v4 写。

**被否决的方案**：
- **手滚 AES + 主密码**：单人项目自搞加密几乎必然出错，且要用户记主密码。
- **tauri-plugin-stronghold**：官方强加密库，但对「存几个邮箱密码」过重（加密 vault 文件 + 启动解锁）。

### D3. IDLE 连接生命周期绑 app 进程（非窗口）

**决策**：IMAP IDLE 长连接在 Rust 后端以 tokio task 运行，生命周期 = app 进程生命周期。不绑定任何具体窗口——桌宠（main）是 app 主窗口、常驻，app 进程在跑就有连接；设置窗/面板的开关不影响。

**理由**：
- Tauri 2 是「Vue 前端 + Rust 后端」同进程。Rust task 是 app 进程的一部分，窗口只是事件投递目标，不是 task 存活条件。
- 桌宠常驻 ⇒ app 进程常驻 ⇒ 连接常驻。用户无需开任何子窗口即有邮件推送。

**保活**：IDLE 每 29 分钟自动重置（RFC 2177 建议 30 分钟内，防服务端超时）；网络断开后指数退避重连。多账号后是 N 条独立连接，一条断了不影响其他。

**诚实标注的风险**：Rust 侧长生命周期 task 是 Phase 1 未触碰的新复杂度（Phase 1 全是前端 store + 一次性 Rust 命令）。连接池管理、断线重连、IDLE 超时重置需 TDD 覆盖。

### D4. 多账号：tracer bullet 先行，Phase 2 内闭环

**决策**：先以单账号 tracer bullet 打通整条链路（绑定 → IDLE → 推送 → 气泡），验证 IMAP 路线在各目标邮箱上是否成立；多账号紧随其后解禁。**两者均为 Phase 2 必交付**（非下个 Phase）。

**理由**：
- IMAP IDLE 路线是 Phase 2 最大未知数（各家 IDLE 实现是否标准、专用密码流程用户能否走通），必须最早验证。
- 数据结构从一开始设计为**数组**（`accounts: MailAccount[]`），单账号阶段数组长度限制为 1，多账号阶段只放开限制 + 列表 UI + 多连接池，**不返工数据模型**。
- 多连接池管理（一条断不影响其他）是独立复杂度，单独成 ticket 可 TDD 覆盖。

### D5. ~~邮件功能边界：严格「INBOX 新邮件通知器」~~ — 🔶 SUPERSEDED（升级为本地通知中心，见 D5-actual）

> **状态变更（2026-07-30）**：原决策的「零写操作」核心守住，但「零历史记录」被用户需求推翻——见 D9（邮件列表）。邮件功能从「瞬时通知器」升级为「本地通知中心」：放开本地通知历史，但已读/归档全是**本地状态**，不碰邮箱服务端。原决策文本保留如下供追溯。

**原决策（已部分废弃）**：只读、只 INBOX、只信封元数据（发件人 + 主题）。零写操作、零正文读取。点击气泡跳 webmail（浏览器）。

**原排除项（已部分废弃）**：
- ~~已读/未读标记同步~~（要发 STORE 命令改服务端状态，和 webmail 打架）—— **仍排除**（已读只做本地，不碰服务端）
- 邮件正文预览（额外 FETCH BODY + MIME/编码深坑）—— **仍排除**
- 删除/归档（IMAP MOVE/STORE + 状态同步）—— **仍排除**（归档只做本地状态，不碰服务端）
- ~~历史通知记录（另一套持久化）~~ —— **D9 放开**（本地通知历史，见 D9）
- 多文件夹监听（每文件夹一条 IDLE，只监听 INBOX）—— **仍排除**

#### D5-actual. 本地通知中心（对邮箱零写，放开本地历史）

**决策**：邮件功能升级为「本地通知中心」。核心约束不变：只读信封元数据、对邮箱**零写操作**、零正文、点击跳 webmail。**放开**本地通知历史——被气泡提醒过的邮件在本地缓存（发件人+主题），已读/归档全是本地状态，不向邮箱服务端发任何命令。详见 D9。

### D6. 邮件设置入口：preference 设置窗侧边栏新开一页

**决策**：在 preference 设置窗的侧边栏新增一个「邮件」页面，承载账号列表 + 绑定表单 + 连接状态展示。不新建窗口、不新建路由侵入点。

**理由**：和 todo 的菜单接入方式对齐（todo 也走 preference/菜单，不新建窗口）。

### D7. 桌宠气泡通知：邮件与 todo 共用的共享组件（常驻 + 手动关闭）

> **状态变更（2026-07-30）**：「5 秒自动消失 + hover 暂停」被用户推翻，改为「常驻 + 手动关闭」。堆叠策略随之调整（常驻下不能无限堆叠）。

**决策**：气泡是主干组件，邮件与 todo 到期共用。交互边界：
- **位置**：桌宠正上方（复用 todo 面板的 `availableMonitors` + clamp + 翻边锚点逻辑）。
- **消失**：**常驻显示，用户手动关闭（点 ×）或点击后消失**。不再自动消失，无倒计时。~~5 秒自动消失 + hover 暂停~~（已废弃）。
- **堆叠**：最多同时显示 **3 条未处理**气泡（未处理 = 用户没点过/没关过）。第 4 条来时，溢出的折成一行提示「还有 N 条，查看邮件列表」，点击进邮件列表（D9）。不再用「未读队列顶替」（常驻模式下无意义）。
- **点击**：邮件 → 打开 webmail（同时标本地已读 + 5 分钟后归档，见 D9）；todo → 打开 todo 面板。气泡只做提醒 + 入口，不承载内容。
- **内容**：邮件显示发件人 + 主题；todo 显示标题 + 「已到期」。
- **动效**：纯渐入渐出（opacity），无位移无缩放。

**理由**：用户反馈「5 秒太短，没看清就没了」。常驻 + 手动关闭让通知不会被错过；3 条上限 + 折入列表防止常驻气泡刷屏。配合 D9 邮件列表，未处理在气泡、已处理/溢出在列表，逻辑自洽。

#### D7.1. 气泡渲染方案：独立伴随窗口（T1 tracer bullet 验证回填）

> **状态（2026-07-31）**：T1（ticket #11）tracer bullet 验证后回填。原 spec #10 标注此项为「待 tracer bullet 验证后回填决策结论」，现回填为 D7.1。

**决策**：气泡用**独立伴随窗口** `WINDOW_LABEL.BUBBLE`（非 main 窗口内渲染），配置照抄 todo 面板（`transparent`/`decorations:false`/`skipTaskbar`/`alwaysOnTop`/`shadow:false`/`visible:false`/`resizable:false`，360×60）。

**理由**：main 窗口是透明置顶且尺寸紧贴桌宠 sprite，透明区域会被 hit-test 穿透（点不到），在 main 内渲染气泡需要扩窗口高度 + 处理 `ignoreCursorEvents` 防穿透，复杂度高于独立窗口。独立窗口定位逻辑直接复用 todo 面板的 `availableMonitors` + clamp + 翻边锚点（锚点 main 窗口、水平居中、垂直正上方），无需额外窗口对齐工程。

**被否决的方案**：
- **main 窗口内渲染**（原 spec 优先项）：main 透明穿透 + 尺寸紧贴 sprite，气泡可点击区域（整气泡 + 右上角 ×）与 main 的拖拽/穿透逻辑冲突，扩窗口尺寸会影响桌宠本身交互。独立窗口隔离干净。

**侵入点**：`WINDOW_LABEL.BUBBLE` + `LISTEN_KEY.SHOW_BUBBLE` + `/bubble` 路由 + `tauri.conf.json` bubble 窗口配置（追加，和 todo 窗口并列）。

### D8. todo 提醒双发（系统通知 + 气泡），不拆 D6

**决策**：todo 到期时同时触发系统通知（`@tauri-apps/plugin-notification`，ADR 0001 D6 保留）+ 桌宠气泡（纯增量）。现有 `reminderStore` 触发点加一行 emit 气泡事件即可，不碰现有逻辑。

**被否决的方案**：
- **气泡替换系统通知**：丢失系统通知的「历史回看 + 声音 + 锁屏显示」能力；要拆 D6 的依赖/权限/Rust 注册，是负向改动；用户关掉桌宠窗口（虽常驻但万一）就完全收不到提醒。

**理由**：纯增量，符合 Surgical Changes；系统通知管「历史+声音」，气泡管「桌宠在场感」，能力互补。

### D9. 邮件列表 + 归档邮件：本地通知历史中心

**决策**：桌宠右键菜单新增**两个独立入口**（在待办/快速新建下面）：「邮件列表」和「归档邮件」。各自打开独立伴随窗口（同 todo 面板的手绘风），都带右上角关闭按钮。

- **邮件列表窗口**：展示所有被气泡提醒过的邮件（本地缓存发件人+主题，不含正文）。点击→跳 webmail（不在 app 内看正文，守住 D5-actual）。
- **归档邮件窗口**：展示已归档的邮件，样式更淡（opacity 0.7 + 已归档标签），可再次点击跳 webmail。

**留存规则**：
- 新邮件到达触发气泡后，自动进入邮件列表（未读状态）。
- **默认留存 24 小时**后自动归档（转入归档邮件窗口，从邮件列表移除）。
- **点击后**标记为本地已读 + **5 分钟后**自动归档。

**状态模型**（本地，不碰邮箱服务端）：
```
MailNotification {
  id, accountId, from, subject, arrivedAt  // 信封元数据
  status: 'unread' | 'read' | 'archived'  // 纯本地状态
  readAt?, archivedAt?                      // 本地时间戳
}
```

**理由**：
- 常驻气泡（D7 改）让用户「不漏看」，但常驻不等于「记得处理过」。邮件列表补上「历史回看」——用户关掉气泡后还能在列表里找回。
- 归档作为**独立右键菜单入口**（而非埋在设置页），和邮件列表并列，语义对等：未处理在「邮件列表」，已处理在「归档邮件」。
- 已读/归档**只做本地状态**：不向邮箱发 STORE 命令，和 webmail/手机的已读状态互不干扰（D5-actual 零写约束守住）。
- 24 小时 + 5 分钟双时限：未点击的留久点（给用户反应时间），点击过的快速归档（已处理不用久留）。

**被否决的方案**：
- **归档放设置页**：语义错位（归档是高频查看项，不是配置），且和邮件列表入口不对等。改为右键菜单独立入口。
- **服务端已读**（IMAP STORE 改邮箱已读状态）：和 webmail 打架，违反 D5-actual 零写约束，工程量翻倍。
- **永久留存**：列表无限增长，违背「轻量通知中心」定位；24h+5min 双时限够用。

**侵入点新增**：
- `src/composables/useAppMenu.ts`：右键菜单加「邮件列表」「归档邮件」两项（追加，和 todo 菜单项并列）。
- `src/constants/index.ts`：`WINDOW_LABEL.MAIL_LIST` / `WINDOW_LABEL.MAIL_ARCHIVE`。
- `src/router/index.ts`：`/mail-list` `/mail-archive` 路由（追加）。
- `src-tauri/tauri.conf.json`：邮件列表 + 归档窗口配置（照抄 todo 面板的伴随窗口配置）。
- 新增 `src/plugins/mail/stores/mailNotification.ts`：本地通知历史 store（复用 pinia 持久化）。

## 设计稿时机

UI 部分（气泡 UI + 邮件列表 + 邮件设置界面）需设计稿，**在 spec 之前做**（作为 spec 的 UI 输入）。后端（IMAP/keyring/连接管理）靠 TDD 自闭环，不依赖设计稿。

> ✅ **已完成（2026-07-31）**：三份设计稿全部定稿，存于 `docs/designs/phase2-exploration/`：
> - `bubble.html` — 桌宠气泡（常驻 + 手动关闭 + 3 条上限折入列表）
> - `mail-list.html` — 邮件列表 + 归档邮件（两个伴随面板）
> - `mail-settings.html` — 邮件设置页（preference 侧边栏，provider logo 自动识别）
>
> 邮箱 logo 文件（10 个，全 RGBA 透明）同目录，清单见 CONTEXT.md「Phase 2 设计稿」段。设计稿完成意味着 `/to-spec` 的 UI 输入已就绪，可进入 spec 环节。

## Consequences

- **正向**：气泡常驻 + 邮件列表形成完整的「通知中心」——未处理在气泡、历史在列表、已处理在归档，逻辑自洽；已读/归档纯本地状态，对邮箱零写，不和服务端打架；气泡共享让 todo 改造近乎零成本；凭证不落地明文，安全基线达标。
- **负向**：Rust 侧新增 `async-imap` + TLS 库 + `keyring` 三项依赖 + 长生命周期 task 管理（断线重连/IDLE 超时/多连接池），是 Phase 1 未有的复杂度；多账号的连接池管理是独立 ticket；邮件列表 + 归档新增一个 store + 列表 UI + 右键菜单项 + 路由/窗口侵入（相比原 Phase 2 多 2-3 个 ticket 量级）。
- **风险**：IMAP IDLE 路线是最大未知数，靠 D4 的 tracer bullet 最早验证；Rust 长连接 task 在窗口销毁/进程异常时的清理需小心处理；本地通知历史的留存时限（24h/5min）需实际使用后调参。

### 实现约定：邮箱 logo 与 provider 自动识别（设计稿产出）

- **provider 自动识别**：用户在添加账号表单输入邮箱后，按域名（`@` 后部分）映射到 `{ logo, imap }`。设计稿 `mail-settings.html` 内置一份域名→logo+IMAP 映射表（gmail/qq/foxmail/163/126/outlook/icloud/proton/yahoo 等），未命中域名用通用信封图标 +「自动识别」。
- **logo 全部 RGBA 透明背景**：暗色模式下白底方块会很难看，所有 PNG logo（foxmail/163/126/qq/proton）必须处理成透明背景。来源均为官方登录页或官网 logo 裁剪，不用 favicon（favicon 常指向错误图标，如 163 favicon 实为网易「易」字、QQ favicon 指向腾讯新闻）。详见 CONTEXT.md「Phase 2 设计稿」段 logo 清单。
- **踩坑警示**：裁剪横长 logo（官网 banner 都是「图标+文字」）只取左侧图标部分；**不要手写 node PNG 编解码器**处理像素（filter 逻辑出错导致马赛克），改用浏览器 canvas `toDataURL`。
