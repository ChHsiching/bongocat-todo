//! Tauri plugin: 邮件通知中心后端（IMAP IDLE + keyring）。
//!
//! 注册 `mail_*` 命令（见 [`commands`]）+ 托管 [`ConnectionManager`]（app state）。
//! app 启动时 `init()` 的 setup 注册 ConnectionManager，前端调 `mail_connect` 时 spawn IDLE task。

use tauri::{
    Manager, Runtime,
    plugin::{Builder, TauriPlugin},
};

mod commands;
mod logic;
mod manager;

pub use manager::{ConnectionManager, ConnectionStatus, NewMailPayload};

/// 初始化邮件插件：注册命令 + 把 [`ConnectionManager`] 注入 app state。
///
/// 不在 setup 里自动重连已持久化账号——T1 tracer bullet 由前端 `$tauri.start()` 加载
/// store 后主动调 `mail_connect` 触发重连（保持 setup 轻量 + 错误可由前端感知）。
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("mail")
        .invoke_handler(tauri::generate_handler![
            commands::mail_test_connection,
            commands::mail_connect,
            commands::mail_disconnect,
            commands::mail_store_password,
            commands::mail_delete_password,
        ])
        .setup(|app, _api| {
            app.manage(ConnectionManager::new());
            Ok(())
        })
        .build()
}
