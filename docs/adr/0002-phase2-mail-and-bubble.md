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

### D5. 邮件功能边界：严格「INBOX 新邮件通知器」

**决策**：只读、只 INBOX、只信封元数据（发件人 + 主题）。零写操作、零正文读取。点击气泡跳 webmail（浏览器）。

**明确排除（防 scope creep）**：
- 已读/未读标记同步（要发 STORE 命令改服务端状态，和 webmail 打架）
- 邮件正文预览（额外 FETCH BODY + MIME/编码深坑，尤其中文邮件）
- 删除/归档（IMAP MOVE/STORE + 状态同步）
- 历史通知记录（另一套持久化）
- 多文件夹监听（每文件夹一条 IDLE，只监听 INBOX）

**理由**：只读信封是 IDLE 推送后单次 FETCH 的免费产物（几乎零成本）；任何「顺便做简易收件箱」的冲动都拒绝，工程量会失控。

### D6. 邮件设置入口：preference 设置窗侧边栏新开一页

**决策**：在 preference 设置窗的侧边栏新增一个「邮件」页面，承载账号列表 + 绑定表单 + 连接状态展示。不新建窗口、不新建路由侵入点。

**理由**：和 todo 的菜单接入方式对齐（todo 也走 preference/菜单，不新建窗口）。

### D7. 桌宠气泡通知：邮件与 todo 共用的共享组件

**决策**：气泡是主干组件，邮件与 todo 到期共用。交互边界：
- **位置**：桌宠正上方（复用 todo 面板的 `availableMonitors` + clamp + 翻边锚点逻辑）。
- **消失**：5 秒自动消失，hover 暂停（鼠标移开继续倒计时）。
- **堆叠**：最多同时显示 3 条，超出进未读队列，前面的消失后后面的顶上来。
- **点击**：邮件 → 打开 webmail；todo → 打开 todo 面板。气泡只做提醒 + 入口，不承载内容。
- **内容**：邮件显示发件人 + 主题；todo 显示标题 + 「已到期」。

**理由**：todo 到期也想用气泡 ⇒ 气泡是被多数据源复用的主干，必须先钉死交互边界，否则邮件先做一版、todo 复用时行为不兼容要返工。

### D8. todo 提醒双发（系统通知 + 气泡），不拆 D6

**决策**：todo 到期时同时触发系统通知（`@tauri-apps/plugin-notification`，ADR 0001 D6 保留）+ 桌宠气泡（纯增量）。现有 `reminderStore` 触发点加一行 emit 气泡事件即可，不碰现有逻辑。

**被否决的方案**：
- **气泡替换系统通知**：丢失系统通知的「历史回看 + 声音 + 锁屏显示」能力；要拆 D6 的依赖/权限/Rust 注册，是负向改动；用户关掉桌宠窗口（虽常驻但万一）就完全收不到提醒。

**理由**：纯增量，符合 Surgical Changes；系统通知管「历史+声音」，气泡管「桌宠在场感」，能力互补。

## 设计稿时机

UI 部分（气泡 UI + 邮件设置界面）需设计稿，**在 spec 之前做**（作为 spec 的 UI 输入）。后端（IMAP/keyring/连接管理）靠 TDD 自闭环，不依赖设计稿。

## Consequences

- **正向**：邮件功能只读、只 INBOX、只信封，工程量可控；气泡共享让 todo 改造近乎零成本（加一行 emit）；凭证不落地明文，安全基线达标。
- **负向**：Rust 侧新增 `async-imap` + TLS 库 + `keyring` 三项依赖 + 长生命周期 task 管理（断线重连/IDLE 超时/多连接池），是 Phase 1 未有的复杂度；多账号的连接池管理是独立 ticket。
- **风险**：IMAP IDLE 路线是最大未知数，靠 D4 的 tracer bullet 最早验证；Rust 长连接 task 在窗口销毁/进程异常时的清理需小心处理。
