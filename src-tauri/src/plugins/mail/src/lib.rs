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
            // rustls 0.23 需要进程级显式安装 crypto provider，否则首次
            // ClientConfig::builder() 会卡住（不报错、不超时、永久挂起）。
            // 用 ring provider（Cargo.toml 已启用 ring feature）。
            // 已安装时 install_default 返回 Err，忽略即可（幂等）。
            let _ = rustls::crypto::ring::default_provider().install_default();
            app.manage(ConnectionManager::new());
            Ok(())
        })
        .build()
}
