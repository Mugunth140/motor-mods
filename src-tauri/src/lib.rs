use tauri::{AppHandle, Manager};
use std::fs;
use std::process::Command;
use chrono::Local;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn backup_database(app: AppHandle) -> Result<String, String> {
    // resolve the app data directory
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    
    // Define source and backup paths
    let db_path = app_data_dir.join("motormods.db");
    let backups_dir = app_data_dir.join("backups");
    
    // Ensure backups directory exists
    if !backups_dir.exists() {
        fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
    }

    // Use timestamp format matching frontend expectation
    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let backup_filename = format!("motormods_backup_{}.db", timestamp);
    let backup_path = backups_dir.join(&backup_filename);

    // Perform copy
    match fs::copy(&db_path, &backup_path) {
        Ok(_) => Ok(backup_filename), // Return just the filename
        Err(e) => Err(format!("Failed to backup database: {}", e)),
    }
}

#[tauri::command]
fn print_receipt(text: String) -> Result<(), String> {
    // Minimal implementation for Linux setups using CUPS.
    // If no printer is configured or commands are missing, return a useful error.
    #[cfg(target_os = "linux")]
    {
        let lpstat = Command::new("lpstat").arg("-p").output().map_err(|e| {
            format!("Printing not available (lpstat not found): {e}")
        })?;

        if !lpstat.status.success() {
            let stderr = String::from_utf8_lossy(&lpstat.stderr);
            return Err(format!("Printer status check failed: {stderr}"));
        }

        let stdout = String::from_utf8_lossy(&lpstat.stdout);
        let has_printer = stdout.lines().any(|l| l.starts_with("printer ") || l.contains(" printer "));
        if !has_printer {
            return Err("No printer configured. Please add/connect a printer in system settings (CUPS).".to_string());
        }

        let tmp_path = std::env::temp_dir().join("motormods_receipt.txt");
        fs::write(&tmp_path, text).map_err(|e| format!("Failed to write receipt file: {e}"))?;

        let lp = Command::new("lp")
            .arg(tmp_path.to_string_lossy().to_string())
            .output()
            .map_err(|e| format!("Printing not available (lp not found): {e}"))?;

        if !lp.status.success() {
            let stderr = String::from_utf8_lossy(&lp.stderr);
            return Err(format!("Print failed: {stderr}"));
        }

        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = text;
        Err("Printing is currently supported only on Linux builds.".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, backup_database, print_receipt])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
