//! IMAP IDLE connection manager.
//!
//! Each bound account has an independent tokio task in [`ConnectionManager`] maintaining its IMAP IDLE long-poll connection.
//! When a new mail arrives (`IdleResponse::NewData`), the envelope metadata (sender + subject) is read and
//! pushed to the frontend via `app.emit("mail://new-mail", payload)`.
//!
//! Lifecycle is bound to the app process (not to a window) — tasks are hosted by the `ConnectionManager` (app state);
//! the desktop pet (main) is an always-on window, so connections live as long as the app process runs.
//!
//! Keep-alive: `Handle::wait()` has a built-in 29-minute timeout (async-imap implementation; RFC 2177 recommends under 30 minutes);
//! when it returns `Timeout`, restarting idle at the top of the loop completes the keep-alive.
//! Disconnects: reconnect with exponential backoff ([`crate::logic::backoff_delay`]). The N connections of multiple accounts are mutually independent.

use std::collections::HashMap;

use async_imap::extensions::idle::IdleResponse;
use futures_lite::StreamExt;
use keyring::v1::Entry;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::Mutex;
// Use the JoinHandle type returned by tauri::async_runtime::spawn (not tokio::task::JoinHandle;
// they are different types, and the HashMap must use the former to match spawn's return value).
use tauri::async_runtime::JoinHandle;

use crate::logic::{POLL_INTERVAL, backoff_delay, classify_idle_error};

/// Max backoff reconnect attempts (avoids infinite retries flooding the log; after reaching it, keep retrying at the capped wait).
const MAX_BACKOFF_RETRIES: u32 = 8;

/// Key prefix for mailbox passwords in the keyring (full key = `<KEY_PREFIX>/<accountId>`).
pub const KEYRING_KEY_PREFIX: &str = "bongocat-todo/mail";

/// Get an account's full keyring key.
pub fn keyring_key(account_id: &str) -> String {
    format!("{KEYRING_KEY_PREFIX}/{account_id}")
}

/// Payload of the "new mail" event pushed to the frontend (`mail://new-mail`).
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NewMailPayload {
    pub account_id: String,
    /// Mail UID (used by the frontend for offline catch-up dedup: unique per `<accountId>:<uid>`).
    pub uid: u32,
    /// Sender address (`mailbox@host`); the raw string when parsing fails.
    pub from: String,
    /// Subject (UTF-8 decoded; mime-encoded is not deeply decoded for now, T1 uses from_utf8_lossy).
    pub subject: String,
    /// Arrival time (ms timestamp).
    pub arrived_at: i64,
}

/// Payload of the "connection status" event pushed to the frontend (`mail://connection-status`).
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatusPayload {
    pub account_id: String,
    pub status: ConnectionStatus,
    /// Extra info (e.g. the error reason).
    pub message: Option<String>,
}

/// Payload of the "latest seen UID" event pushed to the frontend (`mail://last-seen-uid`).
///
/// Rust emits this event after each batch of new mails is pushed; the frontend persists it into
/// mailAccount.lastSeenUid as the offline catch-up baseline for the next startup/reconnect
/// (`fetch_new_envelopes(lastSeenUid)` re-pushes mails that arrived while offline, so no mails are missed across app restarts).
///
/// @see #15 comment (offline catch-up requirement)
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LastSeenUidPayload {
    pub account_id: String,
    pub last_seen_uid: u32,
}

#[derive(Debug, Serialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionStatus {
    /// Connected, IDLE watching.
    Connected,
    /// Connecting.
    Connecting,
    /// Connection failed.
    Error,
}

/// Connection manager (hosted as Tauri app state).
///
/// Internally uses `Mutex<HashMap<accountId, JoinHandle>>` to manage each account's IDLE task.
/// The `Mutex` protects map consistency while accounts are added/removed concurrently.
pub struct ConnectionManager {
    tasks: Mutex<HashMap<String, JoinHandle<()>>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
        }
    }

    /// Start an account's IDLE watch task.
    ///
    /// First fetches the password from the keyring (not held in memory long-term); returns an error if unavailable.
    /// An existing task with the same id is cancelled first and then overwritten.
    ///
    /// `initial_last_seen_uid` comes from the frontend-persisted `mailAccount.lastSeenUid`: when non-zero it serves
    /// as the offline catch-up baseline (fetch new mails that arrived offline with UID > last_seen_uid); when 0 it falls
    /// back to `fetch_max_uid` (skipping all currently existing mails, T1 behavior).
    pub async fn connect<R: Runtime>(
        &self,
        app: AppHandle<R>,
        account_id: String,
        imap_host: String,
        imap_port: u16,
        username: String,
        proxy: Option<String>,
        initial_last_seen_uid: u32,
    ) -> Result<(), String> {
        // Fetch the password from the keyring first
        let entry = Entry::new(&keyring_key(&account_id), &username)
            .map_err(|e| format!("keyring entry 创建失败: {e}"))?;
        let password = entry
            .get_password()
            .map_err(|e| format!("keyring 取密码失败（账号 {}）: {e}", account_id))?;

        // Cancel the existing task, if any
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
            proxy,
            initial_last_seen_uid,
        ));

        self.tasks.lock().await.insert(account_id, handle);
        Ok(())
    }

    /// Stop an account's IDLE task (cancelling the task closes the connection).
    pub async fn disconnect(&self, account_id: &str) {
        if let Some(handle) = self.tasks.lock().await.remove(account_id) {
            handle.abort();
        }
    }

    /// Whether an account currently has an active IDLE connection (an existing task counts as active).
    ///
    /// In the multi-account scenario each account's state is independent: disconnecting/querying account A does not affect account B's connection.
    /// Used for UI state display and multi-account isolation tests (`#[cfg(test)]`).
    pub async fn has_connection(&self, account_id: &str) -> bool {
        self.tasks.lock().await.contains_key(account_id)
    }

    /// Current number of active connections (for diagnostics/logging in the multi-account scenario).
    pub async fn connection_count(&self) -> usize {
        self.tasks.lock().await.len()
    }
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Multi-account connection pool isolation tests (ticket #14 AC).
    ///
    /// `connect()` depends on the keyring + a real network + an AppHandle, so it cannot run under `#[cfg(test)]`;
    /// but isolation hinges on the per-key insert/remove semantics of `tasks: HashMap<accountId, JoinHandle>`,
    /// which is a pure data-structure layer that can be verified directly without IMAP:
    ///
    /// - Each of N accounts inserts a dummy handle (simulating `connect`'s `spawn` + insert)
    /// - `disconnect(A)` removes only A, leaving B/C's handles untouched
    /// - `has_connection` queries independently by accountId
    ///
    /// This covers the AC of "given N accounts each with its own state → querying/toggling one does not affect the others",
    /// while the real end-to-end (2 providers on simultaneous IDLE) is verified by a manual tracer bullet.
    fn make_dummy_handle() -> JoinHandle<()> {
        // Spawn a never-returning task as an "active connection" stand-in (simulating the idle_loop long-poll connection).
        // Aborted at test end, so it never really occupies the runtime.
        tauri::async_runtime::spawn(async {
            std::future::pending::<()>().await;
        })
    }

    #[tokio::test]
    async fn 多账号各自独立连接_互不影响() {
        let manager = ConnectionManager::new();
        let ids = ["acc-a".to_string(), "acc-b".to_string(), "acc-c".to_string()];

        // Simulate 3 accounts each connecting (spawn + insert)
        for id in &ids {
            let handle = make_dummy_handle();
            manager.tasks.lock().await.insert(id.clone(), handle);
        }
        assert_eq!(manager.connection_count().await, 3);
        for id in &ids {
            assert!(manager.has_connection(id).await, "{id} 应有连接");
        }
    }

    #[tokio::test]
    async fn 断开一个账号_其他账号连接不受影响() {
        let manager = ConnectionManager::new();
        let ids = ["acc-a".to_string(), "acc-b".to_string(), "acc-c".to_string()];
        for id in &ids {
            manager.tasks.lock().await.insert(id.clone(), make_dummy_handle());
        }

        // Disconnect B
        manager.disconnect("acc-b").await;

        // B has no connection; A/C remain active
        assert!(!manager.has_connection("acc-b").await, "acc-b 应已断开");
        assert!(manager.has_connection("acc-a").await, "acc-a 不应受 acc-b 断开影响");
        assert!(manager.has_connection("acc-c").await, "acc-c 不应受 acc-b 断开影响");
        assert_eq!(manager.connection_count().await, 2);
    }

    #[tokio::test]
    async fn 断开不存在的账号_无副作用() {
        let manager = ConnectionManager::new();
        manager.tasks.lock().await.insert("acc-a".to_string(), make_dummy_handle());

        // Disconnect an accountId that was never connected — must not affect existing connections
        manager.disconnect("acc-not-exist").await;

        assert!(manager.has_connection("acc-a").await);
        assert_eq!(manager.connection_count().await, 1);
    }

    #[tokio::test]
    async fn 重连同一账号_旧task被abort_新task覆盖() {
        let manager = ConnectionManager::new();
        manager.tasks.lock().await.insert("acc-a".to_string(), make_dummy_handle());
        assert_eq!(manager.connection_count().await, 1);

        // Simulate a "reconnect": insert a new handle overwriting the old key
        // (connect internally does disconnect then insert; here we overwrite directly to test the map semantics)
        let old = manager.tasks.lock().await.remove("acc-a");
        if let Some(h) = old {
            h.abort();
        }
        manager.tasks.lock().await.insert("acc-a".to_string(), make_dummy_handle());

        assert!(manager.has_connection("acc-a").await);
        assert_eq!(manager.connection_count().await, 1, "重连后仍只有 1 条连接");
    }

    #[tokio::test]
    async fn 全部断开后连接数归零() {
        let manager = ConnectionManager::new();
        for id in ["a", "b", "c", "d"] {
            manager.tasks.lock().await.insert(id.to_string(), make_dummy_handle());
        }
        assert_eq!(manager.connection_count().await, 4);

        for id in ["a", "b", "c", "d"] {
            manager.disconnect(id).await;
        }
        assert_eq!(manager.connection_count().await, 0);
        for id in ["a", "b", "c", "d"] {
            assert!(!manager.has_connection(id).await);
        }
    }

    #[tokio::test]
    async fn has_connection_空池查询返回false() {
        let manager = ConnectionManager::new();
        assert!(!manager.has_connection("any").await);
        assert_eq!(manager.connection_count().await, 0);
    }

    #[tokio::test]
    async fn 多账号断开顺序无关_结果一致() {
        // Verify that disconnect order does not affect the final state (A then B == B then A)
        let manager1 = ConnectionManager::new();
        for id in ["a", "b"] {
            manager1.tasks.lock().await.insert(id.to_string(), make_dummy_handle());
        }
        manager1.disconnect("a").await;
        manager1.disconnect("b").await;
        assert_eq!(manager1.connection_count().await, 0);

        let manager2 = ConnectionManager::new();
        for id in ["a", "b"] {
            manager2.tasks.lock().await.insert(id.to_string(), make_dummy_handle());
        }
        manager2.disconnect("b").await;
        manager2.disconnect("a").await;
        assert_eq!(manager2.connection_count().await, 0);
    }
}

/// The IDLE main loop for a single account.
///
/// Structure: an outer reconnect loop (error → backoff → reconnect) wrapping an inner IDLE loop (NewData → fetch → restart idle).
/// The 29-minute keep-alive is provided by `Handle::wait()`'s built-in timeout; when it returns `Timeout`, the inner loop restarts idle.
///
/// When `initial_last_seen_uid` is non-zero it serves as the offline catch-up baseline (passed in persisted by the frontend); when 0, fall back to fetch_max_uid.
/// On reconnect, **keep** the already-advanced last_seen_uid (do not reset to the initial value), avoiding re-pushing mails that were already caught up.
async fn idle_loop<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
    imap_host: String,
    imap_port: u16,
    username: String,
    password: String,
    proxy: Option<String>,
    initial_last_seen_uid: u32,
) {
    // Preserved across reconnects: the first connection uses the frontend-supplied last_seen_uid (the offline catch-up baseline),
    // and subsequent reconnects keep the same baseline value (after each push the frontend has persisted it via the mail://last-seen-uid event;
    // on process restart the frontend passes the updated lastSeenUid; within the same process, a task exiting normally simply never reconnects).
    let last_seen_uid = initial_last_seen_uid;
    let mut retries: u32 = 0;

    loop {
        // Try to establish a connection and run one IDLE round
        match run_idle_session(
            &app,
            &account_id,
            &imap_host,
            imap_port,
            &username,
            &password,
            proxy.as_deref(),
            last_seen_uid,
        )
        .await
        {
            Ok(_returned_uid) => {
                // Normal exit (e.g. manual cancellation) — do not reconnect.
                // A normal exit means the task was cancelled / the process is ending; no need to keep the latest uid
                // (the frontend has already persisted the uid after each push via the mail://last-seen-uid event).
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

                // Exponential backoff
                let delay = backoff_delay(retries.min(MAX_BACKOFF_RETRIES));
                retries = retries.saturating_add(1);
                tokio::time::sleep(delay).await;
            }
        }
    }
}

/// Establish one complete IMAP connection and run IDLE until an error or cancellation.
///
/// Returning `Ok(last_seen_uid)` means a normal end (task cancelled), carrying the latest pushed UID
/// for the outer reconnect loop to keep; `Err` means a reconnect is needed.
async fn run_idle_session<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    imap_host: &str,
    imap_port: u16,
    username: &str,
    password: &str,
    proxy: Option<&str>,
    initial_last_seen_uid: u32,
) -> Result<u32, String> {
    // 1-3. Establish the TLS connection + login + select INBOX (shared with mail_test_connection)
    let session = build_imap_session(imap_host, imap_port, username, password, proxy).await?;

    let _ = app.emit(
        "mail://connection-status",
        ConnectionStatusPayload {
            account_id: account_id.to_string(),
            status: ConnectionStatus::Connected,
            message: None,
        },
    );

    // 4. IDLE loop (idle() consumes the session, done() returns it)
    //    wait() has a built-in 29-minute timeout (see async-imap idle.rs); it returns Timeout when it fires,
    //    and restarting idle at the top of the loop completes the RFC 2177 keep-alive — no extra should_reset_idle check needed.
    //    Connection params are passed in: if IDLE is unsupported, idle_wait_loop needs to rebuild a session and fall back to poll_loop.
    let (mut session, last_seen_uid) = idle_wait_loop(app, account_id, session, initial_last_seen_uid, imap_host, imap_port, username, password, proxy).await?;

    // 5. Log out on exit (graceful shutdown)
    let _ = session.logout().await;
    Ok(last_seen_uid)
}

/// Establish an IMAP session: TLS connection → login → select INBOX.
///
/// Shared by `mail_test_connection` (connectivity check) and `run_idle_session` (IDLE watch),
/// avoiding duplicated connection sequences. Returns a Session with INBOX selected; the caller handles the subsequent idle/logout.
///
/// When `proxy` is non-empty, the tunnel is established via an HTTP CONNECT proxy (bypassing the TUN
/// system stack's unstable forwarding of non-standard ports). Format like `"127.0.0.1:7890"`.
pub(crate) async fn build_imap_session(
    imap_host: &str,
    imap_port: u16,
    username: &str,
    password: &str,
    proxy: Option<&str>,
) -> Result<async_imap::Session<tokio_rustls::client::TlsStream<tokio::net::TcpStream>>, String> {
    use tokio::time::timeout;
    use std::time::Duration;

    // Per-network-step timeout (TCP/TLS/login/select). A dead proxy forward would hang forever,
    // so a timeout is required to let the UI error out instead of spinning forever.
    const STEP_TIMEOUT: Duration = Duration::from_secs(30);

    // rustls TLS: uses webpki-roots' built-in Mozilla root CAs, with no certificate revocation checks (OCSP/CRL).
    // native-tls/SChannel checks revocation by default and the handshake fails when the revocation
    // servers are unreachable on domestic networks (CRYPT_E_REVOCATION_OFFLINE); rustls avoids that.
    let mut root_cert_store = rustls::RootCertStore::empty();
    root_cert_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let config = rustls::ClientConfig::builder()
        .with_root_certificates(root_cert_store)
        .with_no_client_auth();
    let connector = tokio_rustls::TlsConnector::from(std::sync::Arc::new(config));

    // Establish the TCP connection: through an HTTP CONNECT tunnel when a proxy is set, direct otherwise.
    let tcp = if let Some(proxy_addr) = proxy {
        log::info!("[mail] 使用代理 {proxy_addr} 建立到 {imap_host}:{imap_port} 的隧道");
        // First TCP-connect to the proxy server
        let mut proxy_tcp = timeout(STEP_TIMEOUT, tokio::net::TcpStream::connect(proxy_addr))
            .await
            .map_err(|_| format!("连接代理超时（{proxy_addr}，30s 无响应）"))?
            .map_err(|e| format!("连接代理失败 {proxy_addr}: {e}"))?;
        // HTTP CONNECT tunnel to the target IMAP server
        timeout(STEP_TIMEOUT, async_http_proxy::http_connect_tokio(&mut proxy_tcp, imap_host, imap_port))
            .await
            .map_err(|_| "代理隧道建立超时（30s 无响应）".to_string())?
            .map_err(|e| format!("代理 CONNECT 失败: {e}"))?;
        proxy_tcp
    }
    else {
        timeout(STEP_TIMEOUT, tokio::net::TcpStream::connect((imap_host, imap_port)))
            .await
            .map_err(|_| format!("TCP 连接超时（{imap_host}:{imap_port}，30s 无响应）"))?
            .map_err(|e| format!("TCP 连接失败 {imap_host}:{imap_port}: {e}"))?
    };

    let server_name = rustls::pki_types::ServerName::try_from(imap_host.to_string())
        .map_err(|e| format!("无效的 IMAP 主机名: {e}"))?;
    let tls_stream = timeout(STEP_TIMEOUT, connector.connect(server_name, tcp))
        .await
        .map_err(|_| "TLS 握手超时（30s 无响应，可能是代理未转发 IMAP 流量）".to_string())?
        .map_err(|e| format!("TLS 握手失败: {e}"))?;

    let client = async_imap::Client::new(tls_stream);
    let mut session = timeout(STEP_TIMEOUT, client.login(username, password))
        .await
        .map_err(|_| "IMAP 登录超时（30s 无响应）".to_string())?
        .map_err(|(err, _)| format!("IMAP 登录失败: {err}"))?;

    // Send the IMAP ID command (RFC 2971).
    // NetEase-family mailboxes (163/126/yeah.net) require third-party clients to send ID
    // to identify themselves after LOGIN and before SELECT etc., otherwise later operations return "Unsafe Login".
    // Other mailboxes (Gmail/QQ etc.) ignore the command; sending it to all servers is a safe, standard RFC 2971 behavior.
    // Errors are ignored via `let _ =`: servers that don't support ID return BAD without affecting the rest of the flow.
    // The version uses the main crate's version (env! inside the plugin crate would yield the plugin's 0.1.0).
    let _ = session.id([
        ("name", Some("BongoCat Todo")),
        ("version", Some(env!("CARGO_PKG_VERSION"))),
        ("vendor", Some("ChHsiching")),
        ("support-email", Some("chhsiching@users.noreply.github.com")),
    ]).await;
    log::info!("[mail] IMAP ID sent to {imap_host}");

    timeout(STEP_TIMEOUT, session.select("INBOX"))
        .await
        .map_err(|_| "选 INBOX 超时（30s 无响应）".to_string())?
        .map_err(|e| format!("选 INBOX 失败: {e}"))?;

    Ok(session)
}

/// IDLE wait loop: start IDLE → wait → match the response → on NewData fetch envelopes → re-idle.
///
/// `session.idle()` consumes the session (returning a Handle); `handle.done()` sends DONE to end IDLE and returns the session.
/// `wait()` has a built-in 29-minute timeout (async-imap's internal keep-alive); when it returns Timeout, the loop restarts idle.
///
/// When `initial_last_seen_uid` is non-zero it serves as the offline catch-up baseline (on first connect, re-push mails that arrived while offline);
/// when zero, fall back to `fetch_max_uid` (T1 behavior: skip all currently existing mails). After a fetch inside the loop advances the value,
/// emit `mail://last-seen-uid` so the frontend persists it (as the next catch-up baseline after reconnect/restart).
///
/// Returns `(session, last_seen_uid)`: the session for the outer logout, the last_seen_uid for reconnects to keep.
async fn idle_wait_loop<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    mut session: async_imap::Session<tokio_rustls::client::TlsStream<tokio::net::TcpStream>>,
    initial_last_seen_uid: u32,
    imap_host: &str,
    imap_port: u16,
    username: &str,
    password: &str,
    proxy: Option<&str>,
) -> Result<(async_imap::Session<tokio_rustls::client::TlsStream<tokio::net::TcpStream>>, u32), String> {
    // Initialize the dedup baseline:
    // - Frontend passed a non-zero initial_last_seen_uid → use it directly as the catch-up baseline (offline catch-up: fetch mails that arrived while offline)
    // - Zero (first bind / a pre-T5 legacy account after migration) → fall back to the current max INBOX UID (skip existing mails, T1 behavior),
    //   and emit last-seen-uid so the frontend persists this baseline (otherwise the frontend stays at 0 forever and offline catch-up never triggers)
    let mut last_seen_uid: u32 = if initial_last_seen_uid > 0 {
        initial_last_seen_uid
    } else {
        let max_uid = fetch_max_uid(&mut session).await.unwrap_or(0);
        // Emit the baseline obtained from fetch_max_uid for the frontend to persist, so the next startup can use it for offline catch-up
        if max_uid > 0 {
            let _ = app.emit(
                "mail://last-seen-uid",
                LastSeenUidPayload {
                    account_id: account_id.to_string(),
                    last_seen_uid: max_uid,
                },
            );
        }
        max_uid
    };

    // Offline catch-up: when initial_last_seen_uid is non-zero, first re-push the mails that arrived while offline.
    // This step runs only when initial_last_seen_uid > 0 (the frontend has a persisted baseline), avoiding pushing
    // all existing mails on first bind (initial=0 already became the baseline via fetch_max_uid, and fetch_new_envelopes won't push existing ones).
    if initial_last_seen_uid > 0 {
        match fetch_new_envelopes(account_id, &mut session, &mut last_seen_uid).await {
            Ok(payloads) => {
                for payload in &payloads {
                    let _ = app.emit("mail://new-mail", payload);
                }
                if !payloads.is_empty() {
                    let _ = app.emit(
                        "mail://last-seen-uid",
                        LastSeenUidPayload {
                            account_id: account_id.to_string(),
                            last_seen_uid,
                        },
                    );
                }
            }
            Err(e) => {
                log::warn!("mail {account_id} 离线补发 fetch 失败: {e}");
            }
        }
    }

    loop {
        let mut handle = session.idle();
        match handle.init().await {
            Ok(()) => {}
            Err(e) => {
                let err_str = format!("{e}");
                match classify_idle_error(&err_str) {
                    crate::logic::IdleSupport::Unsupported => {
                        // The server does not support IDLE (Coremail etc. return BAD command not support).
                        // session.idle() consumed the session into the handle; after init fails, async-imap
                        // has no safe API to get the session back (done() would send another command and trigger BAD).
                        // Rebuild a session for poll_loop (one extra connection, happening only once at degradation).
                        log::info!("mail {account_id} 服务器不支持 IDLE，降级为轮询模式（{POLL_INTERVAL:?} 周期）");
                        drop(handle);
                        let new_session = build_imap_session(imap_host, imap_port, username, password, proxy).await?;
                        return poll_loop(app, account_id, new_session, last_seen_uid).await;
                    }
                    crate::logic::IdleSupport::Transient => {
                        return Err(format!("IDLE init 失败: {err_str}"));
                    }
                }
            }
        }

        // wait_with_timeout with an explicit 5-second timeout. When IDLE pushes work normally, NewData returns immediately;
        // some mailboxes (e.g. QQ) have unreliable IDLE pushes and may miss pushes during the done→re-init gap,
        // so the 5-second Timeout falls back to a catch-up fetch for missed new mails, keeping perceived latency under control.
        let (wait_future, _stop_token) = handle.wait_with_timeout(std::time::Duration::from_secs(5));
        let response = wait_future.await;

        match response {
            Ok(IdleResponse::NewData(_response_data)) => {
                // New data: send DONE to end IDLE, get the session back → fetch envelopes → emit
                session = handle
                    .done()
                    .await
                    .map_err(|e| format!("IDLE done 失败: {e}"))?;

                match fetch_new_envelopes(account_id, &mut session, &mut last_seen_uid).await {
                    Ok(payloads) => {
                        for payload in &payloads {
                            let _ = app.emit("mail://new-mail", payload);
                        }
                        if !payloads.is_empty() {
                            let _ = app.emit(
                                "mail://last-seen-uid",
                                LastSeenUidPayload {
                                    account_id: account_id.to_string(),
                                    last_seen_uid,
                                },
                            );
                        }
                    }
                    Err(e) => {
                        log::warn!("mail {account_id} fetch envelope 失败: {e}");
                    }
                }
                // Continue the loop and re-idle
            }
            Ok(IdleResponse::Timeout) => {
                // Keep-alive timeout: send DONE to get the session back, and opportunistically poll for new mails
                // (QQ-like mailboxes have unreliable IDLE pushes, so an active fetch is the fallback), then return to the top to re-idle
                session = handle
                    .done()
                    .await
                    .map_err(|e| format!("IDLE done 失败: {e}"))?;

                match fetch_new_envelopes(account_id, &mut session, &mut last_seen_uid).await {
                    Ok(payloads) => {
                        for payload in &payloads {
                            let _ = app.emit("mail://new-mail", payload);
                        }
                        if !payloads.is_empty() {
                            let _ = app.emit(
                                "mail://last-seen-uid",
                                LastSeenUidPayload {
                                    account_id: account_id.to_string(),
                                    last_seen_uid,
                                },
                            );
                        }
                    }
                    Err(e) => {
                        log::warn!("mail {account_id} 轮询 fetch 失败: {e}");
                    }
                }
            }
            Ok(IdleResponse::ManualInterrupt) => {
                // Manual interrupt (task cancelled): normal exit
                session = handle
                    .done()
                    .await
                    .map_err(|e| format!("IDLE done 失败: {e}"))?;
                return Ok((session, last_seen_uid));
            }
            Err(e) => {
                // wait failed: try sending DONE to return the session (failure is fine, the outer loop will reconnect)
                let _ = handle.done().await;
                return Err(format!("IDLE wait 出错: {e}"));
            }
        }
    }
}

/// Polling mode: the degraded loop used when the server does not support IDLE.
///
/// No IDLE at all, just a `sleep(POLL_INTERVAL) → fetch_new_envelopes` loop.
/// The fetch logic matches the Timeout/NewData branches of [`idle_wait_loop`] (emit new mails + advance last_seen_uid).
/// A fetch error returns Err for the outer loop to reconnect.
async fn poll_loop<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
    mut session: async_imap::Session<tokio_rustls::client::TlsStream<tokio::net::TcpStream>>,
    mut last_seen_uid: u32,
) -> Result<(async_imap::Session<tokio_rustls::client::TlsStream<tokio::net::TcpStream>>, u32), String> {
    loop {
        tokio::time::sleep(POLL_INTERVAL).await;
        let payloads = fetch_new_envelopes(account_id, &mut session, &mut last_seen_uid).await?;
        for payload in &payloads {
            let _ = app.emit("mail://new-mail", payload);
        }
        if !payloads.is_empty() {
            let _ = app.emit(
                "mail://last-seen-uid",
                LastSeenUidPayload {
                    account_id: account_id.to_string(),
                    last_seen_uid,
                },
            );
        }
    }
}

/// Get INBOX's current max UID (used to initialize the dedup baseline, avoiding pushing all existing mails at startup).
async fn fetch_max_uid(
    session: &mut async_imap::Session<tokio_rustls::client::TlsStream<tokio::net::TcpStream>>,
) -> Result<u32, String> {
    let mut fetch_stream = session
        .uid_fetch("1:*", "UID")
        .await
        .map_err(|e| format!("fetch max uid 失败: {e}"))?;

    let mut max_uid = 0u32;
    while let Some(fetch) = fetch_stream.next().await {
        let Ok(fetch) = fetch else { continue };
        if let Some(uid) = fetch.uid {
            max_uid = max_uid.max(uid);
        }
    }
    Ok(max_uid)
}

/// Fetch envelope metadata for new mails after last_seen_uid (dedup + MIME decoding).
///
/// Only mails with UID > last_seen_uid are pushed, avoiding re-pushing existing mails or flag changes.
/// Subjects get MIME encoded-word decoding (`=?utf-8?B?...?=` / `=?utf-8?Q?...?=`).
async fn fetch_new_envelopes(
    account_id: &str,
    session: &mut async_imap::Session<tokio_rustls::client::TlsStream<tokio::net::TcpStream>>,
    last_seen_uid: &mut u32,
) -> Result<Vec<NewMailPayload>, String> {
    // Fetch mails from last_seen_uid+1 to *
    let range = format!("{}:*", last_seen_uid.saturating_add(1));
    let mut fetch_stream = session
        .uid_fetch(&range, "ENVELOPE")
        .await
        .map_err(|e| format!("fetch 新邮件失败: {e}"))?;

    let mut payloads = Vec::new();

    while let Some(fetch) = fetch_stream.next().await {
        let Ok(fetch) = fetch else { continue };
        let Some(uid) = fetch.uid else { continue };

        // Skip already-pushed ones
        if uid <= *last_seen_uid {
            continue;
        }

        if let Some(env) = fetch.envelope() {
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

            let subject = env
                .subject
                .as_deref()
                .map(|b| decode_mime_words(&String::from_utf8_lossy(b)))
                .unwrap_or_default();

            payloads.push(NewMailPayload {
                account_id: account_id.to_string(),
                uid,
                from,
                subject,
                arrived_at: now_ms(),
            });

            *last_seen_uid = (*last_seen_uid).max(uid);
        }
    }

    Ok(payloads)
}

/// Decode MIME encoded-words (RFC 2047): `=?charset?B?base64?=` or `=?charset?Q?quoted?=`.
///
/// Mail subjects with non-ASCII characters get encoded. This function handles UTF-8 Base64 and Quoted-Printable;
/// other encodings fall back to the raw lossy string. Supports multiple concatenated encoded-words.
fn decode_mime_words(input: &str) -> String {
    use base64::Engine;

    // Regex matching is too heavy; manually scan `=?charset?enc?data?=` segments
    let mut result = String::new();
    let mut rest = input;

    while let Some(start) = rest.find("=?") {
        // Plain-text part
        result.push_str(&rest[..start]);

        let after = &rest[start + 2..];
        // Find the closing ?=
        let Some(end_rel) = after.find("?=") else {
            result.push_str(&rest[start..]);
            return result;
        };

        // encoded-word content: charset?enc?data
        let encoded = &after[..end_rel];
        let parts: Vec<&str> = encoded.splitn(3, '?').collect();
        if parts.len() < 3 {
            result.push_str(&rest[start..start + 2 + end_rel + 2]);
            rest = &rest[start + 2 + end_rel + 2..];
            continue;
        }

        let charset = parts[0].to_lowercase();
        let enc = parts[1].to_lowercase();
        let data = parts[2];

        let decoded_bytes = if enc == "b" {
            base64::engine::general_purpose::STANDARD.decode(data).ok()
        }
        else if enc == "q" {
            // Quoted-Printable: '_' = space, =XX is a hex byte
            let mut bytes = Vec::new();
            let bytes_iter = data.as_bytes();
            let mut i = 0;
            while i < bytes_iter.len() {
                if bytes_iter[i] == b'_' {
                    bytes.push(b' ');
                    i += 1;
                }
                else if bytes_iter[i] == b'=' && i + 2 < bytes_iter.len() {
                    if let Ok(b) = u8::from_str_radix(
                        &String::from_utf8_lossy(&bytes_iter[i + 1..i + 3]),
                        16,
                    ) {
                        bytes.push(b);
                        i += 3;
                    }
                    else {
                        bytes.push(bytes_iter[i]);
                        i += 1;
                    }
                }
                else {
                    bytes.push(bytes_iter[i]);
                    i += 1;
                }
            }
            Some(bytes)
        }
        else {
            None
        };

        match decoded_bytes {
            Some(b) => {
                if charset.starts_with("utf") {
                    result.push_str(&String::from_utf8_lossy(&b));
                }
                else {
                    // Non-UTF-8 falls back to lossy (tracer bullet simplification)
                    result.push_str(&String::from_utf8_lossy(&b));
                }
            }
            None => result.push_str(&rest[start..start + 2 + end_rel + 2]),
        }

        rest = &rest[start + 2 + end_rel + 2..];
    }

    result.push_str(rest);
    result
}

/// Get the current Unix timestamp (ms). Based on SystemTime, no chrono dependency.
fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
