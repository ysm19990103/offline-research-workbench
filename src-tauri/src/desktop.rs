use crate::{
    core::{self, err, BackupInfo, DiskStatus, Document, Result, Store},
    reminders::{self, Status},
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use serde_json::Value;
use std::{fs, path::Path, process::Command, sync::Mutex, time::Duration};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

struct Desktop {
    store: Mutex<Store>,
    notifications: Mutex<()>,
}
fn with_store<T>(app: &AppHandle, f: impl FnOnce(&mut Store) -> Result<T>) -> Result<T> {
    let state = app.state::<Desktop>();
    let mut store = state.store.lock().map_err(|_| "本地存储锁不可用。")?;
    f(&mut store)
}
fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}
fn sync(app: &AppHandle, request: bool) -> Result<Status> {
    let state = app.state::<Desktop>();
    let _lock = state.notifications.lock().map_err(|_| "通知锁不可用。")?;
    let (payload, ledger, revision) = with_store(app, |store| {
        let doc = store.read()?;
        Ok((
            doc.payload,
            store.setting("notificationLedger")?,
            doc.revision,
        ))
    })?;
    let Some(payload) = payload else {
        return Ok(Status {
            state: "notDetermined".into(),
            scheduled: 0,
            message: None,
        });
    };
    let doc: Value = serde_json::from_str(&payload).map_err(err)?;
    let ledger = ledger
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let (items, next) = reminders::plan(&doc["memory"], chrono::Local::now(), &ledger);
    let status = reminders::sync(&items, request)?;
    if status.state == "granted" {
        with_store(app, |store| {
            store.set(
                "notificationLedger",
                Some(&serde_json::to_string(&next).map_err(err)?),
            )?;
            // A save during this call keeps the next reconciliation pending.
            if store.read()?.revision == revision {
                store.set("notificationDirty", None)?;
            }
            Ok(())
        })?;
    }
    Ok(status)
}
#[tauri::command]
async fn read_document(app: AppHandle) -> Result<Document> {
    tauri::async_runtime::spawn_blocking(move || with_store(&app, |s| s.read()))
        .await
        .map_err(err)?
}
#[tauri::command]
async fn write_document(
    app: AppHandle,
    payload: String,
    expected_revision: i64,
    restoring: bool,
) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        with_store(&app, |s| {
            s.write(&payload, expected_revision, restoring)?;
            s.set("notificationDirty", Some("true"))
        })?;
        let handle = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let _ = sync(&handle, false);
        });
        Ok(())
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn ensure_daily_backup(app: AppHandle) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || with_store(&app, |s| s.daily(&today())))
        .await
        .map_err(err)?
}
#[tauri::command]
async fn list_snapshots(app: AppHandle) -> Result<Vec<BackupInfo>> {
    tauri::async_runtime::spawn_blocking(move || with_store(&app, |s| s.snapshots()))
        .await
        .map_err(err)?
}
#[tauri::command]
async fn read_snapshot(app: AppHandle, key: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || with_store(&app, |s| s.snapshot(&key)))
        .await
        .map_err(err)?
}
#[tauri::command]
async fn backup_status(app: AppHandle) -> Result<DiskStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        with_store(&app, |s| {
            s.daily(&today())?;
            s.disk_status()
        })
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn choose_backup_directory(app: AppHandle) -> Result<DiskStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .set_title("选择专用备份目录")
            .blocking_pick_folder()
        else {
            return with_store(&app, |s| s.disk_status());
        };
        let folder = fs::canonicalize(file.into_path().map_err(err)?).map_err(err)?;
        with_store(&app, |s| {
            s.set("backupDirectory", Some(&folder.to_string_lossy()))?;
            s.set("backupDate", None)?;
            s.set("backupError", None)?;
            s.daily(&today())?;
            s.disk_status()
        })
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn disconnect_backup_directory(app: AppHandle) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        with_store(&app, |s| {
            for key in ["backupDirectory", "backupDate", "backupError"] {
                s.set(key, None)?;
            }
            Ok(())
        })
    })
    .await
    .map_err(err)?
}

#[derive(Serialize)]
struct LinkedPath {
    path: String,
    name: String,
    directory: bool,
}
#[tauri::command]
async fn choose_resource(
    app: AppHandle,
    resource_id: String,
    directory: bool,
) -> Result<Option<LinkedPath>> {
    tauri::async_runtime::spawn_blocking(move || {
        let picker = app
            .dialog()
            .file()
            .set_title("选择要关联的原文件或资料目录");
        let selected = if directory {
            picker.blocking_pick_folder()
        } else {
            picker.blocking_pick_file()
        };
        let Some(file) = selected else {
            return Ok(None);
        };
        let path = fs::canonicalize(file.into_path().map_err(err)?).map_err(err)?;
        with_store(&app, |s| s.grant(&resource_id, &path, directory))?;
        Ok(Some(LinkedPath {
            path: path.to_string_lossy().into_owned(),
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            directory,
        }))
    })
    .await
    .map_err(err)?
}
fn open_path(path: &Path, reveal: bool) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("/usr/bin/open");
        if reveal {
            command.arg("-R");
        }
        let result = command.arg("--").arg(path).status().map_err(err)?;
        if !result.success() {
            return Err("系统未能打开原件，请检查文件权限和默认应用。".into());
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (path, reveal);
        Err("原文件打开仅实现于 macOS。".into())
    }
}
#[tauri::command]
async fn open_resource(app: AppHandle, resource_id: String, reveal: bool) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = with_store(&app, |s| s.resolve_grant(&resource_id, reveal))?;
        open_path(&path, reveal)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn open_asset(app: AppHandle, resource_id: String) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = with_store(&app, |s| {
            let payload = s.read()?.payload.ok_or("资料不存在。")?;
            let doc: Value = serde_json::from_str(&payload).map_err(err)?;
            let resource = doc["memory"]["resources"]
                .as_array()
                .and_then(|a| {
                    a.iter()
                        .find(|r| r["id"] == resource_id && r["mode"] == "copy")
                })
                .ok_or("资料不存在。")?;
            let asset = doc["assets"]
                .as_array()
                .and_then(|a| a.iter().find(|a| a["id"] == resource["blobId"]))
                .ok_or("资料副本缺失。")?;
            let ext = Path::new(resource["name"].as_str().unwrap_or(""))
                .extension()
                .and_then(|s| s.to_str())
                .filter(|s| s.len() < 10 && s.chars().all(|c| c.is_ascii_alphanumeric()))
                .unwrap_or("bin");
            let directory = s.root.join("preview");
            fs::create_dir_all(&directory).map_err(err)?;
            core::private_dir(&directory)?;
            let path = directory.join(format!("{}.{}", uuid::Uuid::new_v4(), ext));
            core::atomic_write(
                &path,
                &STANDARD
                    .decode(asset["data"].as_str().ok_or("资料内容无效。")?)
                    .map_err(err)?,
            )?;
            core::safe_to_open(&path)?;
            Ok(path)
        })?;
        open_path(&path, false)
    })
    .await
    .map_err(err)?
}
fn safe_filename(name: &str) -> String {
    Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty() && s.len() < 240)
        .unwrap_or("workbench-export.json")
        .to_string()
}
#[tauri::command]
async fn export_document(app: AppHandle, payload: String, filename: String) -> Result<bool> {
    tauri::async_runtime::spawn_blocking(move || {
        core::validate_document(&payload)?;
        let Some(file) = app
            .dialog()
            .file()
            .set_title("导出完整备份")
            .set_file_name(safe_filename(&filename))
            .add_filter("JSON 备份", &["json"])
            .blocking_save_file()
        else {
            return Ok(false);
        };
        core::atomic_write(&file.into_path().map_err(err)?, payload.as_bytes())?;
        Ok(true)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn save_download(app: AppHandle, filename: String, data: String) -> Result<bool> {
    tauri::async_runtime::spawn_blocking(move || {
        if data.len() > core::MAX_DOCUMENT {
            return Err("导出文件过大。".into());
        }
        let bytes = STANDARD.decode(data).map_err(err)?;
        let Some(file) = app
            .dialog()
            .file()
            .set_title("保存导出文件")
            .set_file_name(safe_filename(&filename))
            .blocking_save_file()
        else {
            return Ok(false);
        };
        core::atomic_write(&file.into_path().map_err(err)?, &bytes)?;
        Ok(true)
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn sync_notifications(app: AppHandle, request_permission: bool) -> Result<Status> {
    tauri::async_runtime::spawn_blocking(move || sync(&app, request_permission))
        .await
        .map_err(err)?
}

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("local-navigation")
                .on_navigation(|_, url| {
                    url.scheme() == "tauri" && url.host_str() == Some("localhost")
                        || url.scheme() == "http" && url.host_str() == Some("tauri.localhost")
                })
                .build(),
        )
        // Stable application identifier + single instance prevent concurrent timers.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            app.manage(Desktop {
                store: Mutex::new(Store::open(&root).map_err(std::io::Error::other)?),
                notifications: Mutex::new(()),
            });
            // No remote content is configured; IPC capabilities apply only to the local main window.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("有序 · 工作台");
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                let _ = with_store(&handle, |s| {
                    if s.read()?.payload.is_some() {
                        s.daily(&today())?;
                    }
                    Ok(())
                });
                let _ = sync(&handle, false);
                std::thread::sleep(Duration::from_secs(60));
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_document,
            write_document,
            ensure_daily_backup,
            list_snapshots,
            read_snapshot,
            backup_status,
            choose_backup_directory,
            disconnect_backup_directory,
            choose_resource,
            open_resource,
            open_asset,
            export_document,
            save_download,
            sync_notifications
        ])
        .run(tauri::generate_context!())
        .expect("无法启动本地工作台");
}
