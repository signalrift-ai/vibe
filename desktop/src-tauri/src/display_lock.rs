use crate::config::{DISPLAY_LOCK_FINGERPRINT_KEY, DISPLAY_LOCK_PASSWORD_HASH_KEY, DISPLAY_LOCK_STORE_FILENAME};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use serde::{Deserialize, Serialize};
use tauri_plugin_store::StoreExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Pins this installation to a specific physical display (the Interactive Flat Panel the
/// OPS Computer is plugged into) by fingerprinting the connected monitor's EDID. This is an
/// operational safeguard, not tamper-proof DRM: the pairing record is a local JSON file that
/// anyone with file access could remove, reverting the app to `Unpaired` (which runs normally).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LockStatus {
    Unpaired,
    Matched,
    Mismatched,
    DetectionFailed,
}

/// Reads each connected display's EDID via WMI (no elevation required) and returns one
/// fingerprint string per display. Empty on failure or on non-Windows platforms, which is
/// intentional: detection failure is treated as "can't determine," not "mismatched," so a
/// broken PowerShell/WMI call never blocks the app (see `status`).
#[cfg(windows)]
fn current_display_fingerprints() -> Vec<String> {
    use std::process::Command;

    let script = r#"
$result = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID -ErrorAction SilentlyContinue | ForEach-Object {
    $manufacturer = -join ($_.ManufacturerName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ })
    $product = -join ($_.ProductCodeID | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ })
    $serial = -join ($_.SerialNumberID | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ })
    [PSCustomObject]@{ Manufacturer = $manufacturer; Product = $product; Serial = $serial }
})
ConvertTo-Json -InputObject $result -Compress
"#;

    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", script]);
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = match cmd.output() {
        Ok(output) if output.status.success() => output,
        _ => return Vec::new(),
    };

    parse_monitor_json(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(not(windows))]
fn current_display_fingerprints() -> Vec<String> {
    Vec::new()
}

/// `ConvertTo-Json` collapses a single-item array to a bare object rather than a one-element
/// array, so both shapes have to be accepted here regardless of how many displays are attached.
fn parse_monitor_json(json: &str) -> Vec<String> {
    let value: serde_json::Value = match serde_json::from_str(json.trim()) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };

    let entries: Vec<serde_json::Value> = match value {
        serde_json::Value::Array(items) => items,
        object @ serde_json::Value::Object(_) => vec![object],
        _ => Vec::new(),
    };

    entries
        .into_iter()
        .filter_map(|entry| {
            let manufacturer = entry.get("Manufacturer")?.as_str()?.trim().to_string();
            let product = entry.get("Product")?.as_str()?.trim().to_string();
            let serial = entry.get("Serial")?.as_str()?.trim().to_string();
            if manufacturer.is_empty() && product.is_empty() && serial.is_empty() {
                return None;
            }
            Some(format!("{manufacturer}-{product}-{serial}"))
        })
        .collect()
}

fn paired_fingerprint(app: &tauri::AppHandle) -> Option<String> {
    app.store(DISPLAY_LOCK_STORE_FILENAME)
        .ok()?
        .get(DISPLAY_LOCK_FINGERPRINT_KEY)?
        .as_str()
        .map(|value| value.to_string())
}

fn stored_password_hash(app: &tauri::AppHandle) -> Option<String> {
    app.store(DISPLAY_LOCK_STORE_FILENAME)
        .ok()?
        .get(DISPLAY_LOCK_PASSWORD_HASH_KEY)?
        .as_str()
        .map(|value| value.to_string())
}

fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| error.to_string())
}

fn verify_password(password: &str, hash: &str) -> bool {
    let Ok(parsed_hash) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default().verify_password(password.as_bytes(), &parsed_hash).is_ok()
}

pub fn status(app: &tauri::AppHandle) -> LockStatus {
    let Some(paired) = paired_fingerprint(app) else {
        return LockStatus::Unpaired;
    };

    let current = current_display_fingerprints();
    if current.is_empty() {
        return LockStatus::DetectionFailed;
    }

    if current.contains(&paired) {
        LockStatus::Matched
    } else {
        LockStatus::Mismatched
    }
}

#[tauri::command]
pub fn display_lock_status(app: tauri::AppHandle) -> LockStatus {
    status(&app)
}

#[tauri::command]
pub fn display_lock_pair(app: tauri::AppHandle, password: String) -> Result<(), String> {
    if password.trim().is_empty() {
        return Err("Password cannot be empty".into());
    }
    if status(&app) != LockStatus::Unpaired {
        return Err("Display is already paired".into());
    }
    let current = current_display_fingerprints();
    let fingerprint = current.first().ok_or("Could not detect the connected display")?;

    let hash = hash_password(&password)?;
    let store = app.store(DISPLAY_LOCK_STORE_FILENAME).map_err(|error| error.to_string())?;
    store.set(DISPLAY_LOCK_FINGERPRINT_KEY, serde_json::Value::String(fingerprint.clone()));
    store.set(DISPLAY_LOCK_PASSWORD_HASH_KEY, serde_json::Value::String(hash));
    store.save().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn display_lock_repair(app: tauri::AppHandle, password: String) -> Result<(), String> {
    let hash = stored_password_hash(&app).ok_or("No admin password is set")?;
    if !verify_password(&password, &hash) {
        return Err("Incorrect password".into());
    }
    let current = current_display_fingerprints();
    let fingerprint = current.first().ok_or("Could not detect the connected display")?;

    let store = app.store(DISPLAY_LOCK_STORE_FILENAME).map_err(|error| error.to_string())?;
    store.set(DISPLAY_LOCK_FINGERPRINT_KEY, serde_json::Value::String(fingerprint.clone()));
    store.save().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn display_lock_change_password(app: tauri::AppHandle, current_password: String, new_password: String) -> Result<(), String> {
    if new_password.trim().is_empty() {
        return Err("Password cannot be empty".into());
    }
    let hash = stored_password_hash(&app).ok_or("No admin password is set")?;
    if !verify_password(&current_password, &hash) {
        return Err("Incorrect password".into());
    }
    let new_hash = hash_password(&new_password)?;
    let store = app.store(DISPLAY_LOCK_STORE_FILENAME).map_err(|error| error.to_string())?;
    store.set(DISPLAY_LOCK_PASSWORD_HASH_KEY, serde_json::Value::String(new_hash));
    store.save().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn display_lock_unpair(app: tauri::AppHandle, password: String) -> Result<(), String> {
    let hash = stored_password_hash(&app).ok_or("No admin password is set")?;
    if !verify_password(&password, &hash) {
        return Err("Incorrect password".into());
    }
    let store = app.store(DISPLAY_LOCK_STORE_FILENAME).map_err(|error| error.to_string())?;
    store.delete(DISPLAY_LOCK_FINGERPRINT_KEY);
    store.delete(DISPLAY_LOCK_PASSWORD_HASH_KEY);
    store.save().map_err(|error| error.to_string())
}
