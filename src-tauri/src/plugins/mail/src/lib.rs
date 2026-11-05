//! Tauri plugin: mail notification center backend (IMAP IDLE + keyring).
//!
//! Registers the `mail_*` commands (see [`commands`]) + hosts the [`ConnectionManager`] (app state).
//! On app startup, `init()`'s setup registers the ConnectionManager; the frontend spawns the IDLE task by calling `mail_connect`.

use tauri::{
    Manager, Runtime,
    plugin::{Builder, TauriPlugin},
};

mod commands;
mod logic;
mod manager;

pub use manager::{ConnectionManager, ConnectionStatus, LastSeenUidPayload, NewMailPayload};

/// Initialize the mail plugin: register the commands + inject [`ConnectionManager`] into app state.
///
/// Persisted accounts are not auto-reconnected in setup — the T1 tracer bullet has the frontend load
/// the store via `$tauri.start()` and then call `mail_connect` to trigger reconnection (keeping setup lightweight + errors visible to the frontend).
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
            // rustls 0.23 requires an explicit process-wide crypto provider install; otherwise the first
            // ClientConfig::builder() hangs (no error, no timeout, stuck forever).
            // Use the ring provider (the ring feature is already enabled in Cargo.toml).
            // If one is already installed, install_default returns Err; just ignore it (idempotent).
            let _ = rustls::crypto::ring::default_provider().install_default();
            app.manage(ConnectionManager::new());
            Ok(())
        })
        .build()
}
