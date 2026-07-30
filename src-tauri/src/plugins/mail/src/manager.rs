//! IMAP IDLE 连接管理器。
//!
//! 每个绑定账号在 [`ConnectionManager`] 里有一个独立的 tokio task 维护 IMAP IDLE 长连接。
//! 新邮件到达时（`IdleResponse::NewData`）读取信封元数据（发件人 + 主题），
//! 通过 `app.emit("mail://new-mail", payload)` 推给前端。
//!
//! 生命周期绑 app 进程（不绑窗口）—— task 由 `ConnectionManager`（app state）托管，
//! 桌宠（main）是常驻窗口，app 进程在跑就有连接。
//!
//! 保活：`Handle::wait()` 内部自带 29 分钟超时（async-imap 实现，RFC 2177 建议 30 分钟内），
//! 超时返回 `Timeout` 后循环顶部重新 idle 即完成保活。
//! 断线：指数退避重连（[`crate::logic::backoff_delay`]）。多账号的 N 条连接相互独立。

use std::collections::HashMap;

use async_imap::extensions::idle::IdleResponse;
use futures_lite::StreamExt;
use keyring::v1::Entry;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::Mutex;
// 用 tauri::async_runtime::spawn 返回的 JoinHandle 类型（非 tokio::task::JoinHandle，
// 两者是不同类型，HashMap 必须用前者匹配 spawn 的返回值）。
use tauri::async_runtime::JoinHandle;

use crate::logic::backoff_delay;

/// 退避重连的最大尝试次数（避免无限重试刷日志；达到后保持等待上限持续重试）。
const MAX_BACKOFF_RETRIES: u32 = 8;

/// keyring 里存邮箱密码的 key 前缀（完整 key = `<KEY_PREFIX>/<accountId>`）。
pub const KEYRING_KEY_PREFIX: &str = "bongocat-todo/mail";

/// 取某账号在 keyring 里的完整 key。
pub fn keyring_key(account_id: &str) -> String {
    format!("{KEYRING_KEY_PREFIX}/{account_id}")
}

/// 推给前端的「新邮件」事件 payload（`mail://new-mail`）。
#[derive(Debug, Serialize, Clone)]
pub struct NewMailPayload {
    pub account_id: String,
    /// 发件人邮箱（`mailbox@host`）；解析失败时给原始字符串。
    pub from: String,
    /// 主题（UTF-8 解码，mime-encoded 暂不深度解码，T1 用 from_utf8_lossy）。
    pub subject: String,
    /// 到达时间（ms 时间戳）。
    pub arrived_at: i64,
}

/// 推给前端的「连接状态」事件 payload（`mail://connection-status`）。
#[derive(Debug, Serialize, Clone)]
pub struct ConnectionStatusPayload {
    pub account_id: String,
    pub status: ConnectionStatus,
    /// 附加信息（如错误原因）。
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionStatus {
    /// 已连接，IDLE 监听中。
    Connected,
    /// 正在连接。
    Connecting,
    /// 连接失败。
    Error,
}

/// 连接管理器（作为 Tauri app state 托管）。
///
/// 内部用 `Mutex<HashMap<accountId, JoinHandle>>` 管理每个账号的 IDLE task。
/// `Mutex` 保护并发增删账号时的 map 一致性。
pub struct ConnectionManager {
    tasks: Mutex<HashMap<String, JoinHandle<()>>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
        }
    }

    /// 启动某账号的 IDLE 监听 task。
    ///
    /// 先从 keyring 取密码（不在内存长期持有），取不到直接返回错误。
    /// 已存在同名 task 会先取消再覆盖。
    pub async fn connect<R: Runtime>(
        &self,
        app: AppHandle<R>,
        account_id: String,
        imap_host: String,
        imap_port: u16,
        username: String,
    ) -> Result<(), String> {
        // 先从 keyring 取密码
        let entry = Entry::new(&keyring_key(&account_id), &username)
            .map_err(|e| format!("keyring entry 创建失败: {e}"))?;
        let password = entry
            .get_password()
            .map_err(|e| format!("keyring 取密码失败（账号 {}）: {e}", account_id))?;

        // 取消已存在的 task
        self.disconnect(&account_id).await;

        let _ = app.emit(
            "mail://connection-status",
            ConnectionStatusPayload {
                account_id: account_id.clone(),
                status: ConnectionStatus::Connecting,
                message: None,
            },
        );

        let handle = tauri::async_runtime::spawn(idle_loop(
            app,
            account_id.clone(),
            imap_host,
            imap_port,
            username,
            password,
        ));

        self.tasks.lock().await.insert(account_id, handle);
        Ok(())
    }

    /// 断开某账号的 IDLE task（取消 task 即断开连接）。
    pub async fn disconnect(&self, account_id: &str) {
        if let Some(handle) = self.tasks.lock().await.remove(account_id) {
            handle.abort();
        }
    }
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}

/// 单账号的 IDLE 主循环。
///
/// 结构：外层重连循环（出错 → 退避 → 重连），内层 IDLE 循环（NewData → fetch → 重启 idle）。
/// 29 分钟保活由 `Handle::wait()` 自带超时实现，超时返回 `Timeout` 后内层循环重启 idle。
async fn idle_loop<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
    imap_host: String,
    imap_port: u16,
    username: String,
    password: String,
) {
    let mut retries: u32 = 0;

    loop {
        // 尝试建立连接并跑一轮 IDLE
        match run_idle_session(
            &app,
            &account_id,
            &imap_host,
            imap_port,
            &username,
            &password,
        )
        .await
        {
            Ok(()) => {
                // 正常退出（如手动取消）—— 不重连
                break;
            }
            Err(err) => {
                let _ = app.emit(
                    "mail://connection-status",
                    ConnectionStatusPayload {
                        account_id: account_id.clone(),
                        status: ConnectionStatus::Error,
                        message: Some(err.clone()),
                    },
                );
                log::warn!("mail {} IDLE 异常退出，准备重连: {err}", account_id);

                // 指数退避
                let delay = backoff_delay(retries.min(MAX_BACKOFF_RETRIES));
                retries = retries.saturating_add(1);
                tokio::time::sleep(delay).await;
            }
        }
    }
}

/// 建立一次完整的 IMAP 连接并跑 IDLE 直到出错或取消。
///
/// 成功返回 `Ok(())` 表示正常结束（task 被取消）；`Err` 表示需要重连。
async fn run_idle_session<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    imap_host: &str,
    imap_port: u16,
    username: &str,
    password: &str,
) -> Result<(), String> {
    // 1. 建立 TLS 连接
    let tls_connector = native_tls::TlsConnector::builder()
        .build()
        .map_err(|e| format!("TLS connector 构建失败: {e}"))?;

    let tcp = tokio::net::TcpStream::connect((imap_host, imap_port))
        .await
        .map_err(|e| format!("TCP 连接失败 {imap_host}:{imap_port}: {e}"))?;

    let tls = tokio_native_tls::TlsConnector::from(tls_connector);
    let tls_stream = tls
        .connect(imap_host, tcp)
        .await
        .map_err(|e| format!("TLS 握手失败: {e}"))?;

    // 2. IMAP 登录
    let client = async_imap::Client::new(tls_stream);
    let mut session = client
        .login(username, password)
        .await
        .map_err(|(err, _)| format!("IMAP 登录失败: {err}"))?;

    // 3. 选 INBOX
    session
        .select("INBOX")
        .await
        .map_err(|e| format!("选 INBOX 失败: {e}"))?;

    let _ = app.emit(
        "mail://connection-status",
        ConnectionStatusPayload {
            account_id: account_id.to_string(),
            status: ConnectionStatus::Connected,
            message: None,
        },
    );

    // 4. IDLE 循环（idle() 消耗 session，done() 归还 session）
    //    wait() 内部自带 29 分钟超时（见 async-imap idle.rs），超时返回 Timeout，
    //    循环顶部重新 idle 即完成 RFC 2177 保活，无需额外的 should_reset_idle 判定。
    let mut session = idle_wait_loop(app, account_id, session).await?;

    // 5. 退出时登出（优雅关闭）
    let _ = session.logout().await;
    Ok(())
}

/// IDLE 等待循环：发起 IDLE → wait → 匹配响应 → NewData 时 fetch envelope → 重新 idle。
///
/// `session.idle()` 会消耗 session（返回 Handle），`handle.done()` 发 DONE 结束 IDLE 并归还 session。
/// `wait()` 自带 29 分钟超时（async-imap 内置保活），超时返回 Timeout 后循环重启 idle。
async fn idle_wait_loop<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    mut session: async_imap::Session<tokio_native_tls::TlsStream<tokio::net::TcpStream>>,
) -> Result<async_imap::Session<tokio_native_tls::TlsStream<tokio::net::TcpStream>>, String> {
    loop {
        let mut handle = session.idle();
        handle.init().await.map_err(|e| format!("IDLE init 失败: {e}"))?;

        let (wait_future, _stop_token) = handle.wait();
        let response = wait_future.await;

        match response {
            Ok(IdleResponse::NewData(_response_data)) => {
                // 有新数据：发 DONE 结束 IDLE，拿回 session → fetch envelope → emit
                session = handle
                    .done()
                    .await
                    .map_err(|e| format!("IDLE done 失败: {e}"))?;

                match fetch_latest_envelope(account_id, &mut session).await {
                    Ok(Some(payload)) => {
                        let _ = app.emit("mail://new-mail", payload);
                    }
                    Ok(None) => {
                        // 没取到（可能新数据不是新邮件，如 flag 变化），忽略
                    }
                    Err(e) => {
                        log::warn!("mail {account_id} fetch envelope 失败: {e}");
                    }
                }
                // 继续循环重新 idle
            }
            Ok(IdleResponse::Timeout) => {
                // wait 29 分钟超时（保活）：发 DONE 拿回 session，回顶部重新 idle
                session = handle
                    .done()
                    .await
                    .map_err(|e| format!("IDLE done 失败: {e}"))?;
            }
            Ok(IdleResponse::ManualInterrupt) => {
                // 手动中断（task 取消）：正常退出
                session = handle
                    .done()
                    .await
                    .map_err(|e| format!("IDLE done 失败: {e}"))?;
                return Ok(session);
            }
            Err(e) => {
                // wait 出错：尝试发 DONE 归还 session（失败也无妨，外层会重连）
                let _ = handle.done().await;
                return Err(format!("IDLE wait 出错: {e}"));
            }
        }
    }
}

/// 取 INBOX 里最新一封邮件的信封元数据（发件人 + 主题）。
///
/// 用 `fetch("1:*", "ENVELOPE")` 取所有邮件的 envelope，取最后一封（最新）。
/// 注意：IDLE 的 NewData 不总是新邮件（也可能是 flag 变化），所以这里取「最新一封」
/// 作为「可能的新邮件」推给前端——T1 tracer bullet 的简化策略，精确去重在后续 ticket。
async fn fetch_latest_envelope(
    account_id: &str,
    session: &mut async_imap::Session<tokio_native_tls::TlsStream<tokio::net::TcpStream>>,
) -> Result<Option<NewMailPayload>, String> {
    let mut fetch_stream = session
        .fetch("1:*", "ENVELOPE")
        .await
        .map_err(|e| format!("fetch 失败: {e}"))?;

    let mut latest: Option<(String, String)> = None;

    while let Some(fetch) = fetch_stream.next().await {
        let Ok(fetch) = fetch else { continue };

        if let Some(env) = fetch.envelope() {
            // 发件人：取第一个 address 的 mailbox@host
            let from = env
                .from
                .as_ref()
                .and_then(|addrs| addrs.first())
                .map(|a| {
                    let mailbox = a.mailbox.as_deref().unwrap_or_default();
                    let host = a.host.as_deref().unwrap_or_default();
                    let mailbox = String::from_utf8_lossy(mailbox);
                    let host = String::from_utf8_lossy(host);
                    format!("{mailbox}@{host}")
                })
                .unwrap_or_default();

            // 主题：UTF-8 解码（mime-encoded 暂不深度处理）
            let subject = env
                .subject
                .as_deref()
                .map(|b| String::from_utf8_lossy(b).to_string())
                .unwrap_or_default();

            latest = Some((from, subject));
        }
    }

    Ok(latest.map(|(from, subject)| NewMailPayload {
        account_id: account_id.to_string(),
        from,
        subject,
        arrived_at: chrono_now_ms(),
    }))
}

/// 取当前时间戳（ms）。抽出来便于将来 mock。
fn chrono_now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
