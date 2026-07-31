//! Tauri 命令层：前端调用的 `mail_*` 命令 + keyring 凭证 CRUD。
//!
//! 命令前缀 `plugin:mail|<name>`（见 build.rs 的 COMMANDS）。
//! 密码**绝不**进 pinia store，只走 keyring（[`crate::manager::keyring_key`]）。

use tauri::{AppHandle, Runtime, command, Manager};

use crate::manager::{ConnectionManager, KEYRING_KEY_PREFIX, build_imap_session};

/// 测试 IMAP 连接（不保存任何东西，仅验证能登录 + 选 INBOX）。
///
/// 前端「测试并保存」按钮先调本命令，成功后才调 `mail_store_password` + `mail_connect`。
#[command]
pub async fn mail_test_connection(
    imap_host: String,
    imap_port: u16,
    username: String,
    password: String,
) -> Result<(), String> {
    // 复用 build_imap_session：TLS 连接 + 登录 + 选 INBOX，成功即登出返回，不持有任何状态
    let mut session = build_imap_session(&imap_host, imap_port, &username, &password).await?;
    let _ = session.logout().await;
    Ok(())
}

/// 启动某账号的 IDLE 监听（从 keyring 取密码，spawn task）。
#[command]
pub async fn mail_connect<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
    imap_host: String,
    imap_port: u16,
    username: String,
) -> Result<(), String> {
    let manager = app.state::<ConnectionManager>();
    // connect 需要 owned AppHandle（spawn 的 task 持有它），clone 一份传走，
    // 避免与上面的 `.state()` 借用冲突。
    manager
        .inner()
        .connect(app.clone(), account_id, imap_host, imap_port, username)
        .await
}

/// 断开某账号的 IDLE 监听（取消 task）。
#[command]
pub async fn mail_disconnect<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
) -> Result<(), String> {
    let manager = app.state::<ConnectionManager>();
    manager.inner().disconnect(&account_id).await;
    Ok(())
}

/// 存邮箱密码到 keyring（key = `bongocat-todo/mail/<accountId>`）。
#[command]
pub async fn mail_store_password(
    account_id: String,
    username: String,
    password: String,
) -> Result<(), String> {
    let key = format!("{KEYRING_KEY_PREFIX}/{account_id}");
    let entry = keyring::v1::Entry::new(&key, &username)
        .map_err(|e| format!("keyring entry 创建失败: {e}"))?;
    entry
        .set_password(&password)
        .map_err(|e| format!("keyring 存密码失败: {e}"))
}

/// 从 keyring 删邮箱密码（删除账号时调用）。
///
/// keyring v4 v1 API 的删除方法名是 `delete_credential`（非 `delete_password`）。
#[command]
pub async fn mail_delete_password(
    account_id: String,
    username: String,
) -> Result<(), String> {
    let key = format!("{KEYRING_KEY_PREFIX}/{account_id}");
    let entry = keyring::v1::Entry::new(&key, &username)
        .map_err(|e| format!("keyring entry 创建失败: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        // 已不存在视为成功（幂等删除）
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keyring 删密码失败: {e}")),
    }
}
