#[cfg(target_os = "macos")]
use crate::core::err;
use crate::core::Result;
use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, TimeZone};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Notice {
    pub id: String,
    pub title: String,
    pub body: String,
    pub at: f64,
    pub daily: bool,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct Status {
    pub state: String,
    pub scheduled: usize,
    #[serde(default)]
    pub message: Option<String>,
}
pub type Ledger = BTreeMap<String, f64>;
pub fn deadline_id(task: &Value) -> String {
    format!(
        "workbench.deadline.{:x}",
        Sha256::digest(
            format!(
                "{}:{}",
                task["id"].as_str().unwrap_or(""),
                task["dueDate"].as_str().unwrap_or("")
            )
            .as_bytes()
        )
    )
}
pub fn plan(memory: &Value, now: DateTime<Local>, ledger: &Ledger) -> (Vec<Notice>, Ledger) {
    let mut jobs = vec![];
    let mut next = Ledger::new();
    for task in memory["tasks"].as_array().into_iter().flatten() {
        if task["sample"] == true || task["completed"] == true || task["project"] == "leisure" {
            continue;
        }
        let Some(due) = task["dueDate"]
            .as_str()
            .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        else {
            continue;
        };
        let Some(day) = due.checked_sub_signed(Duration::days(1)) else {
            continue;
        };
        if day < now.date_naive() {
            continue;
        }
        let id = deadline_id(task);
        if let Some(at) = ledger.get(&id) {
            if *at <= now.timestamp() as f64 {
                next.insert(id, *at);
                continue;
            }
        }
        let Some(at) = Local
            .with_ymd_and_hms(day.year(), day.month(), day.day(), 9, 0, 0)
            .earliest()
        else {
            continue;
        };
        let at = at.timestamp().max(now.timestamp() + 5) as f64;
        jobs.push(Notice {
            id,
            title: "明天截止".into(),
            body: task["title"]
                .as_str()
                .unwrap_or("待办事项")
                .chars()
                .take(200)
                .collect(),
            at,
            daily: false,
        });
    }
    jobs.sort_by(|a, b| a.at.total_cmp(&b.at).then(a.id.cmp(&b.id)));
    // Leave room for the daily 22:00 reminder. Refresh on saves and every minute.
    jobs.truncate(59);
    for job in &jobs {
        next.insert(job.id.clone(), job.at);
    }
    if memory["sleepReminder"]["enabled"] == true {
        jobs.push(Notice {
            id: "workbench.sleep".into(),
            title: "22:00，今天就到这里吧。".into(),
            body: "收好今天的进展，留一点时间给休息。".into(),
            at: 0.0,
            daily: true,
        });
    }
    (jobs, next)
}

#[cfg(target_os = "macos")]
pub fn sync(items: &[Notice], request: bool) -> Result<Status> {
    use std::ffi::{c_char, CStr, CString};
    unsafe extern "C" {
        fn wb_sync_notifications(input: *const c_char) -> *mut c_char;
        fn wb_free_string(value: *mut c_char);
    }
    let data = CString::new(
        serde_json::to_string(&serde_json::json!({"items":items,"requestPermission":request}))
            .map_err(err)?,
    )
    .map_err(err)?;
    unsafe {
        let result = wb_sync_notifications(data.as_ptr());
        if result.is_null() {
            return Err("系统通知接口没有返回结果。".into());
        }
        let json = CStr::from_ptr(result).to_string_lossy().into_owned();
        wb_free_string(result);
        serde_json::from_str(&json).map_err(err)
    }
}
#[cfg(not(target_os = "macos"))]
pub fn sync(_items: &[Notice], _request: bool) -> Result<Status> {
    Ok(Status {
        state: "unsupported".into(),
        scheduled: 0,
        message: Some("定时系统通知仅实现于 macOS。".into()),
    })
}
