const COMMANDS: &[&str] = &[
    "mail_test_connection",
    "mail_connect",
    "mail_disconnect",
    "mail_store_password",
    "mail_delete_password",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build()
}
