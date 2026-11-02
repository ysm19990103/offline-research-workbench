fn main() {
    if std::env::var_os("CARGO_FEATURE_DESKTOP").is_some() {
        if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
            cc::Build::new()
                .file("native/notifications.m")
                .flag("-fobjc-arc")
                .flag("-fblocks")
                .compile("workbench_notifications");
            println!("cargo:rustc-link-lib=framework=Foundation");
            println!("cargo:rustc-link-lib=framework=UserNotifications");
            println!("cargo:rustc-link-lib=objc");
            println!("cargo:rerun-if-changed=native/notifications.m");
        }
        let commands = &[
            "read_document",
            "read_state",
            "write_state",
            "write_document",
            "ensure_daily_backup",
            "list_snapshots",
            "read_snapshot",
            "backup_status",
            "choose_backup_directory",
            "disconnect_backup_directory",
            "choose_resource",
            "open_resource",
            "open_asset",
            "export_document",
            "save_download",
            "sync_notifications",
        ];
        tauri_build::try_build(
            tauri_build::Attributes::new()
                .app_manifest(tauri_build::AppManifest::new().commands(commands)),
        )
        .expect("Tauri build configuration failed");
    }
}
