use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};

pub type Result<T> = std::result::Result<T, String>;
pub const MAX_DOCUMENT: usize = 400 * 1024 * 1024;
pub fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[derive(Serialize)]
pub struct Document {
    pub revision: i64,
    pub payload: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub key: String,
    pub date: String,
    pub created_at: String,
    pub tasks: usize,
    pub assets: usize,
    pub kind: String,
}
#[derive(Serialize)]
pub struct DiskStatus {
    pub state: String,
    pub name: Option<String>,
    pub date: Option<String>,
    pub message: Option<String>,
}

// One versioned JSON document preserves the browser schema without translating or
// dropping journal/report fields. Memory and attachment bytes commit together.
pub struct Store {
    pub db: Connection,
    pub root: PathBuf,
}
impl Store {
    pub fn open(root: &Path) -> Result<Self> {
        fs::create_dir_all(root).map_err(err)?;
        private_dir(root)?;
        let db = Connection::open(root.join("workbench.sqlite3")).map_err(err)?;
        db.busy_timeout(Duration::from_secs(10)).map_err(err)?;
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
          CREATE TABLE IF NOT EXISTS document (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS grants (id TEXT PRIMARY KEY, path TEXT NOT NULL, directory INTEGER NOT NULL);").map_err(err)?;
        fs::create_dir_all(root.join("snapshots")).map_err(err)?;
        private_dir(&root.join("snapshots"))?;
        Ok(Self {
            db,
            root: root.to_path_buf(),
        })
    }
    pub fn read(&self) -> Result<Document> {
        Ok(self
            .db
            .query_row(
                "SELECT revision,payload FROM document WHERE id=1",
                [],
                |r| {
                    Ok(Document {
                        revision: r.get(0)?,
                        payload: Some(r.get(1)?),
                    })
                },
            )
            .optional()
            .map_err(err)?
            .unwrap_or(Document {
                revision: 0,
                payload: None,
            }))
    }
    pub fn write(&mut self, payload: &str, expected: i64, restoring: bool) -> Result<()> {
        validate_document(payload)?;
        let tx = self.db.transaction().map_err(err)?;
        let old: Option<(i64, String)> = tx
            .query_row(
                "SELECT revision,payload FROM document WHERE id=1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(err)?;
        if old.as_ref().map_or(0, |x| x.0) != expected {
            return Err("数据版本已变化，请重新读取后重试；未覆盖现有记录。".into());
        }
        // A failed recovery write must abort the database transaction.
        if restoring {
            if let Some((_, ref previous)) = old {
                let key = format!(
                    "recovery-{}-{}.json",
                    chrono::Local::now().format("%Y-%m-%d"),
                    uuid::Uuid::new_v4()
                );
                atomic_write(&self.root.join("snapshots").join(key), previous.as_bytes())?;
            }
            // Imported absolute paths never inherit authority from an old grant.
            tx.execute("DELETE FROM grants", []).map_err(err)?;
        }
        tx.execute("INSERT INTO document(id,revision,payload) VALUES(1,?1,?2) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload", params![expected+1,payload]).map_err(err)?;
        tx.commit().map_err(err)?;
        Ok(())
    }
    pub fn setting(&self, key: &str) -> Result<Option<String>> {
        self.db
            .query_row("SELECT value FROM settings WHERE key=?1", [key], |r| {
                r.get(0)
            })
            .optional()
            .map_err(err)
    }
    pub fn set(&self, key: &str, value: Option<&str>) -> Result<()> {
        if let Some(value) = value {
            self.db.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key,value]).map_err(err)?;
        } else {
            self.db
                .execute("DELETE FROM settings WHERE key=?1", [key])
                .map_err(err)?;
        }
        Ok(())
    }
    pub fn daily(&self, date: &str) -> Result<String> {
        valid_date(date)?;
        let target = self
            .root
            .join("snapshots")
            .join(format!("daily-{date}.json"));
        let payload = if target.exists() {
            read_document_file(&target)?
        } else {
            let payload = self.read()?.payload.ok_or("工作台尚未初始化。")?;
            validate_document(&payload)?;
            let mut doc: Value = serde_json::from_str(&payload).map_err(err)?;
            doc["createdAt"] = Value::String(chrono::Local::now().to_rfc3339());
            let snapshot = serde_json::to_string(&doc).map_err(err)?;
            atomic_write(&target, snapshot.as_bytes())?;
            snapshot
        };
        // Use a SELECT of the committed document, never copy a live WAL database.
        self.prune_daily()?;
        if let Some(path) = self.setting("backupDirectory")? {
            let folder = PathBuf::from(&path);
            let result: Result<()> = (|| {
                if fs::canonicalize(&folder).map_err(err)? != folder {
                    return Err("备份目录已移动，请重新选择。".into());
                }
                let destination = folder.join(format!("ResearchWorkbench-{date}.json"));
                if destination.exists() {
                    if read_document_file(&destination)? != payload {
                        return Err(
                            "备份目录已有不同内容的同日文件，未覆盖；请选择专用目录。".into()
                        );
                    }
                } else {
                    atomic_write(&destination, payload.as_bytes())?;
                }
                self.set("backupDate", Some(date))?;
                Ok(())
            })();
            match result {
                Ok(()) => self.set("backupError", None)?,
                Err(e) => self.set("backupError", Some(&e))?,
            }
        }
        Ok(payload)
    }
    fn prune_daily(&self) -> Result<()> {
        let mut files: Vec<_> = fs::read_dir(self.root.join("snapshots"))
            .map_err(err)?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .and_then(|x| x.to_str())
                    .is_some_and(|s| s.starts_with("daily-") && s.ends_with(".json"))
            })
            .collect();
        files.sort();
        let remove = files.len().saturating_sub(30);
        for file in files.into_iter().take(remove) {
            fs::remove_file(file).map_err(err)?;
        }
        Ok(())
    }
    pub fn snapshots(&self) -> Result<Vec<BackupInfo>> {
        let mut out = vec![];
        for entry in fs::read_dir(self.root.join("snapshots")).map_err(err)? {
            let entry = entry.map_err(err)?;
            let key = entry.file_name().to_string_lossy().into_owned();
            if !key.ends_with(".json")
                || !(key.starts_with("daily-") || key.starts_with("recovery-"))
            {
                continue;
            }
            let doc = validate_document(&read_document_file(&entry.path())?)?;
            let created = doc["createdAt"].as_str().unwrap_or_default().to_owned();
            out.push(BackupInfo {
                date: created.chars().take(10).collect(),
                created_at: created,
                key: key.clone(),
                tasks: doc["memory"]["tasks"].as_array().unwrap().len(),
                assets: doc["assets"].as_array().unwrap().len(),
                kind: if key.starts_with("daily-") {
                    "daily"
                } else {
                    "recovery"
                }
                .into(),
            });
        }
        out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(out)
    }
    pub fn snapshot(&self, key: &str) -> Result<String> {
        if key.len() > 100
            || key.contains(['/', '\\'])
            || !key.ends_with(".json")
            || !(key.starts_with("daily-") || key.starts_with("recovery-"))
        {
            return Err("备份标识无效。".into());
        }
        read_document_file(&self.root.join("snapshots").join(key))
    }
    pub fn disk_status(&self) -> Result<DiskStatus> {
        let name = self.setting("backupDirectory")?;
        let date = self.setting("backupDate")?;
        let message = self.setting("backupError")?;
        Ok(DiskStatus {
            state: if name.is_none() {
                "unconfigured"
            } else if message.is_some() {
                "error"
            } else if date.is_some() {
                "saved"
            } else {
                "permission"
            }
            .into(),
            name,
            date,
            message,
        })
    }
    pub fn grant(&self, id: &str, path: &Path, directory: bool) -> Result<()> {
        if id.is_empty() || id.len() > 200 {
            return Err("资料标识无效。".into());
        }
        let canonical = fs::canonicalize(path).map_err(err)?;
        if canonical.is_dir() != directory {
            return Err("文件类型已变化，请重新选择。".into());
        }
        self.db.execute("INSERT INTO grants(id,path,directory) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET path=excluded.path,directory=excluded.directory",params![id,canonical.to_string_lossy(),directory]).map_err(err)?;
        Ok(())
    }
    pub fn resolve_grant(&self, id: &str, reveal: bool) -> Result<PathBuf> {
        let (path, directory): (String, bool) = self
            .db
            .query_row("SELECT path,directory FROM grants WHERE id=?1", [id], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .optional()
            .map_err(err)?
            .ok_or("请先通过系统选择框关联或重新定位原件。导入的路径不会自动获得打开权限。")?;
        // A removed resource loses access even if an unused grant remains.
        let document = self.read()?.payload.ok_or("资料不存在。")?;
        let value: Value = serde_json::from_str(&document).map_err(err)?;
        if !value["memory"]["resources"].as_array().is_some_and(|a| {
            a.iter()
                .any(|r| r["id"] == id && r["path"] == path && r["mode"] == "path")
        }) {
            return Err("资料关联已变化，请重新定位原件。".into());
        }
        let path = PathBuf::from(path);
        let canonical = fs::canonicalize(&path)
            .map_err(|_| "原件不存在或无法访问，请重新定位；记录已保留。".to_string())?;
        if canonical != path || canonical.is_dir() != directory {
            return Err("原件位置或类型已变化，请重新定位。".into());
        }
        if !reveal {
            safe_to_open(&canonical)?;
        }
        Ok(canonical)
    }
}

pub fn valid_date(value: &str) -> Result<()> {
    if value.len() != 10 || chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_err() {
        return Err("日期无效。".into());
    }
    Ok(())
}
pub fn validate_document(payload: &str) -> Result<Value> {
    if payload.len() > MAX_DOCUMENT {
        return Err("备份超过 400 MB。".into());
    }
    let doc: Value =
        serde_json::from_str(payload).map_err(|_| "JSON 备份格式无效。".to_string())?;
    if doc["format"] != "youxu-full-backup" || doc["version"] != 2 || doc["memory"]["version"] != 2
    {
        return Err("备份版本不受支持。".into());
    }
    let memory = &doc["memory"];
    for name in [
        "tasks",
        "journals",
        "records",
        "resources",
        "reports",
        "workdays",
        "weeklyReports",
    ] {
        let max = if name == "records" { 200000 } else { 50000 };
        if !memory[name].as_array().is_some_and(|a| a.len() <= max) {
            return Err(format!("备份中的 {name} 无效。"));
        }
    }
    valid_date(memory["startedOn"].as_str().ok_or("起始日期缺失。")?)?;
    if !memory["sleepReminder"]["enabled"].is_boolean() || !doc["createdAt"].is_string() {
        return Err("备份设置不完整。".into());
    }
    let tasks = memory["tasks"].as_array().unwrap();
    let mut ids = HashSet::new();
    for task in tasks {
        let id = task["id"]
            .as_str()
            .filter(|s| !s.is_empty() && s.len() <= 800)
            .ok_or("任务标识无效。")?;
        if !ids.insert(id) {
            return Err("任务标识重复。".into());
        }
    }
    let assets = doc["assets"]
        .as_array()
        .filter(|a| a.len() <= 10000)
        .ok_or("资料清单无效。")?;
    let mut asset_ids = HashSet::new();
    let mut total = 0;
    for asset in assets {
        let id = asset["id"].as_str().ok_or("资料标识无效。")?;
        if !asset_ids.insert(id) {
            return Err("资料标识重复。".into());
        }
        let data = asset["data"].as_str().ok_or("资料副本缺失。")?;
        if data.len() > 70 * 1024 * 1024 {
            return Err("单份资料过大。".into());
        }
        let bytes = STANDARD
            .decode(data)
            .map_err(|_| "资料编码无效。".to_string())?;
        total += bytes.len();
        if bytes.len() > 50 * 1024 * 1024
            || total > 200 * 1024 * 1024
            || asset["size"].as_u64() != Some(bytes.len() as u64)
        {
            return Err("资料大小无效。".into());
        }
    }
    let mut resource_ids = HashSet::new();
    for resource in memory["resources"].as_array().unwrap() {
        if !resource_ids.insert(resource["id"].as_str().ok_or("资料标识无效。")?)
            || !ids.contains(resource["taskId"].as_str().ok_or("资料任务无效。")?)
        {
            return Err("资料关联无效。".into());
        }
        match resource["mode"].as_str() {
            Some("copy") => {
                let id = resource["blobId"].as_str().ok_or("资料副本缺失。")?;
                if !assets
                    .iter()
                    .any(|a| a["id"] == id && a["size"] == resource["size"])
                {
                    return Err("资料副本缺失或大小不一致。".into());
                }
            }
            Some("path") => {
                if !resource["path"].is_string() {
                    return Err("资料路径无效。".into());
                }
            }
            _ => return Err("资料类型无效。".into()),
        }
    }
    Ok(doc)
}

// Never interpret a path as a URL, executable, shell fragment, or application bundle.
pub fn safe_to_open(path: &Path) -> Result<()> {
    if !path.is_absolute()
        || path
            .components()
            .any(|c| c.as_os_str().to_string_lossy().contains('\0'))
    {
        return Err("本地路径无效。".into());
    }
    for part in path.components() {
        let name = part.as_os_str().to_string_lossy().to_lowercase();
        if ["app", "bundle", "framework", "plugin", "workflow"]
            .iter()
            .any(|ext| name.ends_with(&format!(".{ext}")))
        {
            return Err("应用或可执行包仅可在 Finder 中显示。".into());
        }
    }
    if path.is_dir() {
        return Ok(());
    }
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ![
        "pdf", "txt", "md", "rtf", "docx", "xlsx", "pptx", "csv", "tsv", "json", "png", "jpg",
        "jpeg", "gif", "webp", "heic", "svg", "mp4", "mov", "m4v", "mp3", "wav",
    ]
    .contains(&ext.as_str())
    {
        return Err("此类型可能执行代码，请使用“在 Finder 显示”后自行打开。".into());
    }
    let mut head = [0u8; 8];
    let read = fs::File::open(path)
        .and_then(|mut f| f.read(&mut head))
        .map_err(err)?;
    let head = &head[..read];
    if head.starts_with(b"#!")
        || head.starts_with(b"MZ")
        || head.starts_with(b"\x7fELF")
        || [
            b"\xcf\xfa\xed\xfe".as_slice(),
            b"\xfe\xed\xfa\xcf",
            b"\xca\xfe\xba\xbe",
        ]
        .iter()
        .any(|magic| head.starts_with(magic))
    {
        return Err("检测到可执行内容，仅可在 Finder 显示。".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if fs::metadata(path).map_err(err)?.permissions().mode() & 0o111 != 0 {
            return Err("带有执行权限的文件仅可在 Finder 显示。".into());
        }
    }
    Ok(())
}
pub fn read_document_file(path: &Path) -> Result<String> {
    if fs::symlink_metadata(path)
        .map_err(err)?
        .file_type()
        .is_symlink()
    {
        return Err("备份文件不能是符号链接。".into());
    }
    if fs::metadata(path).map_err(err)?.len() > MAX_DOCUMENT as u64 {
        return Err("备份超过 400 MB。".into());
    }
    let payload = fs::read_to_string(path).map_err(err)?;
    validate_document(&payload)?;
    Ok(payload)
}
pub fn private_dir(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(err)?;
    }
    Ok(())
}
pub fn atomic_write(target: &Path, bytes: &[u8]) -> Result<()> {
    let parent = target.parent().ok_or("文件位置无效。")?;
    let temp = parent.join(format!(".workbench-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp).map_err(err)?;
        file.write_all(bytes).map_err(err)?;
        file.sync_all().map_err(err)?;
        if fs::read(&temp).map_err(err)? != bytes {
            return Err("文件写入校验失败。".into());
        }
        // Refuse to overwrite a link supplied by another process.
        if fs::symlink_metadata(target).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err("不能覆盖符号链接。".into());
        }
        fs::rename(&temp, target).map_err(err)?;
        #[cfg(unix)]
        {
            fs::File::open(parent)
                .and_then(|f| f.sync_all())
                .map_err(err)?;
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}
