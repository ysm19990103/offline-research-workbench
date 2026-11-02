use chrono::{Local, TimeZone};
use serde_json::{json, Value};
use workbench::{core::*, reminders::*};

fn document() -> Value {
    json!({"format":"youxu-full-backup","version":2,"createdAt":"2026-11-02T09:00:00+08:00","memory":{"version":2,"startedOn":"2026-11-02","tasks":[{"id":"synthetic-task","title":"Synthetic task","project":"research","completed":false,"sample":false,"dueDate":"2026-11-04"}],"journals":[{"date":"2026-11-02","reflection":"synthetic reflection"}],"moodEntries":[{"date":"2026-11-02","reflection":"synthetic diary","score":8}],"records":[],"resources":[],"reports":[],"workdays":[{"date":"2026-11-02","state":"finished"}],"weeklyReports":[],"sleepReminder":{"enabled":true}},"assets":[]})
}
#[test]
fn persistence_reopens_without_losing_fields() {
    let temp = tempfile::tempdir().unwrap();
    let value = document();
    {
        let mut s = Store::open(temp.path()).unwrap();
        s.write(&value.to_string(), 0, false).unwrap();
    }
    let s = Store::open(temp.path()).unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&s.read().unwrap().payload.unwrap()).unwrap(),
        value
    );
    assert_eq!(s.read().unwrap().revision, 1);
}
#[test]
fn stale_revision_never_overwrites() {
    let temp = tempfile::tempdir().unwrap();
    let mut s = Store::open(temp.path()).unwrap();
    let value = document().to_string();
    s.write(&value, 0, false).unwrap();
    assert!(s.write(&value, 0, false).is_err());
    assert_eq!(s.read().unwrap().revision, 1);
}
#[test]
fn invalid_import_leaves_current_untouched() {
    let temp = tempfile::tempdir().unwrap();
    let mut s = Store::open(temp.path()).unwrap();
    let value = document().to_string();
    s.write(&value, 0, false).unwrap();
    assert!(s.write("{}", 1, true).is_err());
    assert_eq!(s.read().unwrap().payload.unwrap(), value);
    assert!(s.snapshots().unwrap().is_empty());
}
#[test]
fn restore_recovery_is_full_previous_document() {
    let temp = tempfile::tempdir().unwrap();
    let mut s = Store::open(temp.path()).unwrap();
    let original = document();
    s.write(&original.to_string(), 0, false).unwrap();
    let mut new = original.clone();
    new["memory"]["journals"] = json!([]);
    s.write(&new.to_string(), 1, true).unwrap();
    let snapshots = s.snapshots().unwrap();
    assert_eq!(snapshots.len(), 1);
    assert_eq!(snapshots[0].kind, "recovery");
    assert_eq!(
        serde_json::from_str::<Value>(&s.snapshot(&snapshots[0].key).unwrap()).unwrap(),
        original
    );
}
#[test]
fn failed_recovery_write_aborts_restore() {
    let temp = tempfile::tempdir().unwrap();
    let mut s = Store::open(temp.path()).unwrap();
    let original = document().to_string();
    s.write(&original, 0, false).unwrap();
    std::fs::remove_dir(temp.path().join("snapshots")).unwrap();
    std::fs::write(temp.path().join("snapshots"), "block writing").unwrap();
    assert!(s.write(&original, 1, true).is_err());
    assert_eq!(s.read().unwrap().revision, 1);
    assert_eq!(s.read().unwrap().payload.unwrap(), original);
}
#[test]
fn daily_snapshot_is_immutable_and_retains_thirty_dates() {
    let temp = tempfile::tempdir().unwrap();
    let mut s = Store::open(temp.path()).unwrap();
    s.write(&document().to_string(), 0, false).unwrap();
    let first = s.daily("2026-10-01").unwrap();
    let mut changed = document();
    changed["memory"]["journals"] = json!([]);
    s.write(&changed.to_string(), 1, false).unwrap();
    assert_eq!(s.daily("2026-10-01").unwrap(), first);
    for day in 2..=31 {
        s.daily(&format!("2026-10-{day:02}")).unwrap();
    }
    assert_eq!(s.snapshots().unwrap().len(), 30);
    assert!(!temp.path().join("snapshots/daily-2026-10-01.json").exists());
}
#[test]
fn backup_path_traversal_is_rejected() {
    let temp = tempfile::tempdir().unwrap();
    let s = Store::open(temp.path()).unwrap();
    for key in [
        "../workbench.sqlite3",
        "daily-../../outside.json",
        "/etc/passwd",
        "daily-x\\outside.json",
    ] {
        assert!(s.snapshot(key).is_err());
    }
}
#[test]
fn missing_or_corrupt_attachments_are_rejected() {
    let mut value = document();
    value["memory"]["resources"] =
        json!([{"id":"a","taskId":"synthetic-task","mode":"copy","blobId":"asset","size":5}]);
    assert!(validate_document(&value.to_string()).is_err());
    value["assets"] = json!([{"id":"asset","size":5,"data":"YQ=="}]);
    assert!(validate_document(&value.to_string()).is_err());
    value["assets"] = json!([{"id":"asset","size":5,"data":"aGVsbG8="}]);
    assert!(validate_document(&value.to_string()).is_ok());
}
#[test]
fn grants_require_selection_and_never_come_from_json() {
    let temp = tempfile::tempdir().unwrap();
    let mut s = Store::open(temp.path()).unwrap();
    let path = temp.path().join("document.txt");
    std::fs::write(&path, "synthetic").unwrap();
    let path = std::fs::canonicalize(path).unwrap();
    let mut value = document();
    value["memory"]["resources"] =
        json!([{"id":"r","taskId":"synthetic-task","mode":"path","path":path.to_str().unwrap()}]);
    s.write(&value.to_string(), 0, false).unwrap();
    assert!(s.resolve_grant("r", false).is_err());
    s.grant("r", &path, false).unwrap();
    assert_eq!(s.resolve_grant("r", false).unwrap(), path);
    s.write(&value.to_string(), 1, true).unwrap();
    assert!(s.resolve_grant("r", false).is_err());
}
#[test]
fn executable_packages_and_disguised_scripts_cannot_open() {
    let temp = tempfile::tempdir().unwrap();
    let script = temp.path().join("looks-safe.txt");
    std::fs::write(&script, "#!/bin/sh\necho test").unwrap();
    assert!(safe_to_open(&script).is_err());
    let app = temp.path().join("Danger.app");
    std::fs::create_dir(&app).unwrap();
    assert!(safe_to_open(&app).is_err());
    let code = temp.path().join("file.command");
    std::fs::write(&code, "test").unwrap();
    assert!(safe_to_open(&code).is_err());
    let safe = temp.path().join("normal.txt");
    std::fs::write(&safe, "normal").unwrap();
    assert!(safe_to_open(&safe).is_ok());
}
#[cfg(unix)]
#[test]
fn changed_symlink_and_backup_symlinks_are_rejected() {
    use std::os::unix::fs::symlink;
    let temp = tempfile::tempdir().unwrap();
    let mut s = Store::open(temp.path()).unwrap();
    let path = temp.path().join("selected.txt");
    std::fs::write(&path, "test").unwrap();
    let path = std::fs::canonicalize(path).unwrap();
    let mut value = document();
    value["memory"]["resources"] =
        json!([{"id":"r","taskId":"synthetic-task","mode":"path","path":path.to_str().unwrap()}]);
    s.write(&value.to_string(), 0, false).unwrap();
    s.grant("r", &path, false).unwrap();
    let other = temp.path().join("other.txt");
    std::fs::write(&other, "other").unwrap();
    std::fs::remove_file(&path).unwrap();
    symlink(&other, &path).unwrap();
    assert!(s.resolve_grant("r", false).is_err());
    let backup = temp.path().join("snapshots/daily-2026-11-02.json");
    symlink(&other, &backup).unwrap();
    assert!(s.daily("2026-11-02").is_err());
    assert_eq!(std::fs::read_to_string(other).unwrap(), "other");
}
#[test]
fn reminders_update_cancel_and_deduplicate_after_delivery() {
    let mut value = document()["memory"].clone();
    let original_signature = signature(&value);
    value["journals"][0]["reflection"] = json!("diary edit");
    assert_eq!(signature(&value), original_signature);
    let now = Local.with_ymd_and_hms(2026, 11, 2, 8, 0, 0).unwrap();
    let (jobs, ledger) = plan(&value, now, &Ledger::new());
    assert_eq!(jobs.len(), 2);
    assert_eq!(jobs[0].title, "明天截止");
    let day_after = Local.with_ymd_and_hms(2026, 11, 3, 10, 0, 0).unwrap();
    assert_eq!(plan(&value, day_after, &ledger).0.len(), 1);
    value["tasks"][0]["completed"] = json!(true);
    assert_eq!(plan(&value, now, &ledger).0.len(), 1);
    value["sleepReminder"]["enabled"] = json!(false);
    assert!(plan(&value, now, &ledger).0.is_empty());
}
#[test]
fn late_same_day_task_schedules_once_and_leisure_has_no_deadline() {
    let mut value = document()["memory"].clone();
    let now = Local.with_ymd_and_hms(2026, 11, 3, 18, 0, 0).unwrap();
    let (jobs, ledger) = plan(&value, now, &Ledger::new());
    assert_eq!(jobs[0].at, now.timestamp() as f64 + 5.0);
    assert_eq!(
        plan(&value, now + chrono::Duration::seconds(2), &ledger).0[0].at,
        jobs[0].at
    );
    assert_eq!(
        plan(&value, now + chrono::Duration::seconds(10), &ledger)
            .0
            .len(),
        1
    );
    value["tasks"][0]["project"] = json!("leisure");
    assert_eq!(plan(&value, now, &Ledger::new()).0.len(), 1);
}

#[test]
fn ordinary_edits_never_transfer_or_rewrite_attachment_bytes() {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let temp = tempfile::tempdir().unwrap();
    let mut store = Store::open(temp.path()).unwrap();
    let mut value = document();
    let data = STANDARD.encode(vec![0x42; 1024 * 1024]);
    value["memory"]["resources"] = json!([{"id":"r","taskId":"synthetic-task","mode":"copy","blobId":"bytes","size":1024*1024}]);
    value["assets"] = json!([{"id":"bytes","name":"synthetic.bin","mime":"application/octet-stream","size":1024*1024,"data":data}]);
    store.write(&value.to_string(), 0, false).unwrap();
    let state = store.state().unwrap();
    assert!(serde_json::to_string(&state).unwrap().len() < 10000);
    store.db.execute_batch("CREATE TRIGGER guard_asset_insert BEFORE INSERT ON assets BEGIN SELECT RAISE(ABORT,'unexpected attachment insert'); END; CREATE TRIGGER guard_asset_delete BEFORE DELETE ON assets BEGIN SELECT RAISE(ABORT,'unexpected attachment delete'); END; CREATE TRIGGER guard_asset_update BEFORE UPDATE ON assets BEGIN SELECT RAISE(ABORT,'unexpected attachment update'); END;").unwrap();
    let mut memory = state.memory.unwrap();
    memory["journals"][0]["reflection"] = json!("updated without attachment IO");
    store.write_state(&memory.to_string(), 1).unwrap();
    let captured: Value = serde_json::from_str(&store.read().unwrap().payload.unwrap()).unwrap();
    assert_eq!(captured["assets"][0]["data"], data);
    assert_eq!(captured["memory"]["journals"], memory["journals"]);
    assert!(store.write_state(&memory.to_string(), 1).is_err());
}

#[test]
fn early_desktop_schema_migrates_and_recovery_retains_attachments() {
    let temp = tempfile::tempdir().unwrap();
    let mut value = document();
    value["memory"]["resources"] =
        json!([{"id":"r","taskId":"synthetic-task","mode":"copy","blobId":"bytes","size":5}]);
    value["assets"] = json!([{"id":"bytes","name":"synthetic.txt","mime":"text/plain","size":5,"data":"aGVsbG8="}]);
    {
        let store = Store::open(temp.path()).unwrap();
        store
            .db
            .execute(
                "INSERT INTO document(id,revision,payload) VALUES(1,7,?1)",
                [value.to_string()],
            )
            .unwrap();
    }
    let mut store = Store::open(temp.path()).unwrap();
    assert_eq!(store.state().unwrap().revision, 7);
    assert_eq!(
        serde_json::from_str::<Value>(&store.read().unwrap().payload.unwrap()).unwrap(),
        value
    );
    let raw: String = store
        .db
        .query_row("SELECT payload FROM document WHERE id=1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&raw).unwrap()["assets"],
        json!([])
    );
    store.write(&document().to_string(), 7, true).unwrap();
    let recovery = store
        .snapshots()
        .unwrap()
        .into_iter()
        .find(|s| s.kind == "recovery")
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&store.snapshot(&recovery.key).unwrap()).unwrap()["assets"],
        value["assets"]
    );
}
