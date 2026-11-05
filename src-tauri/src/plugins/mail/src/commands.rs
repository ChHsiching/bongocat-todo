//! Tauri command layer: the `mail_*` commands called by the frontend + keyring credential CRUD.
//!
//! Command prefix `plugin:mail|<name>` (see COMMANDS in build.rs).
//! Passwords **never** enter the pinia store; they only go through the keyring ([`crate::manager::keyring_key`]).

use tauri::{AppHandle, Runtime, command, Manager};

use crate::manager::{ConnectionManager, KEYRING_KEY_PREFIX, build_imap_session};

/// Test the IMAP connection (saves nothing; only verifies login + INBOX selection).
///
/// The frontend "test and save" button calls this command first, then `mail_store_password` + `mail_connect` on success.
#[command]
pub async fn mail_test_connection(
    imap_host: String,
    imap_port: u16,
    username: String,
    password: String,
    proxy: Option<String>,
) -> Result<(), String> {
    let mut session = build_imap_session(&imap_host, imap_port, &username, &password, proxy.as_deref()).await?;
    let _ = session.logout().await;
    Ok(())
}

/// Start an account's IDLE watch (fetches the password from the keyring, spawns the task).
///
/// `initial_last_seen_uid` comes from the frontend-persisted mailAccount.lastSeenUid:
/// when non-zero it serves as the offline catch-up baseline (fetch new mails that arrived offline with UID > last_seen_uid);
/// when 0 it falls back to the current max INBOX UID (T1 behavior: skip existing mails).
#[command]
pub async fn mail_connect<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
    imap_host: String,
    imap_port: u16,
    username: String,
    proxy: Option<String>,
    initial_last_seen_uid: u32,
) -> Result<(), String> {
    let manager = app.state::<ConnectionManager>();
    manager
        .inner()
        .connect(app.clone(), account_id, imap_host, imap_port, username, proxy, initial_last_seen_uid)
        .await
}

#[command]
pub async fn mail_disconnect<R: Runtime>(
    app: AppHandle<R>,
    account_id: String,
) -> Result<(), String> {
    let manager = app.state::<ConnectionManager>();
    manager.inner().disconnect(&account_id).await;
    Ok(())
}

/// Store the mailbox password in the keyring (key = `bongocat-todo/mail/<accountId>`).
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

/// Delete the mailbox password from the keyring (called when deleting an account).
///
/// keyring v4's v1 API names the deletion method `delete_credential` (not `delete_password`).
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
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keyring 删密码失败: {e}")),
    }
}
