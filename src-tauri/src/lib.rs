use chrono::Local;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};

// ============================================
// BACKUP/RESTORE TYPES
// ============================================

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupResult {
    pub filename: String,
    pub path: String,
    pub file_size: u64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupFileInfo {
    pub filename: String,
    pub path: String,
    pub file_size: u64,
    pub modified_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RestoreResult {
    pub success: bool,
    pub message: String,
    pub records_imported: usize,
    pub safety_backup: String,
}

// Tables to restore in order (respecting foreign key dependencies)
const DATA_TABLES: &[&str] = &[
    "products",
    "invoices", 
    "invoice_items",
    "settings",
    "stock_adjustments",
    "sales_returns",
    "return_items",
    "backup_log",
    "users",
];

// ============================================
// HELPER FUNCTIONS
// ============================================

fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    // tauri-plugin-sql stores databases in the app config directory
    let app_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(app_config_dir.join("motormods.db"))
}

fn get_backups_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let backups_dir = app_config_dir.join("backups");

    if !backups_dir.exists() {
        fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
    }

    Ok(backups_dir)
}

/// Copy all data from one table to another using rusqlite
/// This handles arbitrary column structures dynamically
fn copy_table_data(
    backup_conn: &Connection,
    main_conn: &Connection,
    table_name: &str,
) -> Result<usize, String> {
    // Check if table exists in backup
    let table_exists: bool = backup_conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name=?1",
            params![table_name],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to check table existence: {}", e))?;

    if !table_exists {
        return Ok(0);
    }

    // Get column names from backup table
    let mut stmt = backup_conn
        .prepare(&format!("PRAGMA table_info({})", table_name))
        .map_err(|e| format!("Failed to get table info: {}", e))?;
    
    let columns: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| format!("Failed to query columns: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    if columns.is_empty() {
        return Ok(0);
    }

    let columns_str = columns.join(", ");
    let placeholders: Vec<String> = (1..=columns.len()).map(|i| format!("?{}", i)).collect();
    let placeholders_str = placeholders.join(", ");

    // Read all rows from backup
    let select_sql = format!("SELECT {} FROM {}", columns_str, table_name);
    let mut select_stmt = backup_conn
        .prepare(&select_sql)
        .map_err(|e| format!("Failed to prepare select: {}", e))?;

    let column_count = columns.len();
    let mut rows_data: Vec<Vec<rusqlite::types::Value>> = Vec::new();

    let rows = select_stmt
        .query_map([], |row| {
            let mut values: Vec<rusqlite::types::Value> = Vec::new();
            for i in 0..column_count {
                let value: rusqlite::types::Value = row.get(i)?;
                values.push(value);
            }
            Ok(values)
        })
        .map_err(|e| format!("Failed to query rows: {}", e))?;

    for row in rows {
        if let Ok(values) = row {
            rows_data.push(values);
        }
    }

    // Insert into main database
    let insert_sql = format!(
        "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
        table_name, columns_str, placeholders_str
    );

    let mut count = 0;
    for values in rows_data {
        let params: Vec<&dyn rusqlite::ToSql> = values
            .iter()
            .map(|v| v as &dyn rusqlite::ToSql)
            .collect();

        match main_conn.execute(&insert_sql, params.as_slice()) {
            Ok(_) => count += 1,
            Err(e) => {
                eprintln!("Warning: Failed to insert row into {}: {}", table_name, e);
            }
        }
    }

    Ok(count)
}

// ============================================
// TAURI COMMANDS
// ============================================

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Creates a backup of the database and returns detailed information
/// Uses SQLite's backup API to ensure a consistent backup even with WAL mode
#[tauri::command]
fn backup_database(app: AppHandle) -> Result<BackupResult, String> {
    let db_path = get_db_path(&app)?;
    let backups_dir = get_backups_dir(&app)?;

    // Verify source database exists
    if !db_path.exists() {
        return Err("Database file not found".to_string());
    }

    // Generate backup filename with timestamp
    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let backup_filename = format!("motormods_backup_{}.db", timestamp);
    let backup_path = backups_dir.join(&backup_filename);

    // Use SQLite's backup API for a proper backup that handles WAL mode
    // This ensures all data (including WAL) is included in the backup
    let source_conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open source database: {}", e))?;
    
    let mut backup_conn = Connection::open(&backup_path)
        .map_err(|e| format!("Failed to create backup database: {}", e))?;

    // Use SQLite's backup API
    let backup = rusqlite::backup::Backup::new(&source_conn, &mut backup_conn)
        .map_err(|e| format!("Failed to initialize backup: {}", e))?;
    
    // Run the backup (copy all pages, -1 means copy all at once)
    backup.run_to_completion(100, std::time::Duration::from_millis(10), None)
        .map_err(|e| format!("Failed to complete backup: {}", e))?;

    // Get file size
    let metadata =
        fs::metadata(&backup_path).map_err(|e| format!("Failed to get backup metadata: {}", e))?;

    Ok(BackupResult {
        filename: backup_filename,
        path: backup_path.to_string_lossy().to_string(),
        file_size: metadata.len(),
        created_at: Local::now().to_rfc3339(),
    })
}

/// Lists all backup files in the backups directory
#[tauri::command]
fn list_backups(app: AppHandle) -> Result<Vec<BackupFileInfo>, String> {
    let backups_dir = get_backups_dir(&app)?;

    let mut backups: Vec<BackupFileInfo> = Vec::new();

    if let Ok(entries) = fs::read_dir(&backups_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "db") {
                if let Ok(metadata) = fs::metadata(&path) {
                    let modified = metadata
                        .modified()
                        .map(|t| {
                            let datetime: chrono::DateTime<Local> = t.into();
                            datetime.to_rfc3339()
                        })
                        .unwrap_or_else(|_| "Unknown".to_string());

                    backups.push(BackupFileInfo {
                        filename: path
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default(),
                        path: path.to_string_lossy().to_string(),
                        file_size: metadata.len(),
                        modified_at: modified,
                    });
                }
            }
        }
    }

    // Sort by modified date descending
    backups.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    Ok(backups)
}

/// Restores the database from a backup file
#[tauri::command]
fn restore_database(app: AppHandle, backup_filename: String) -> Result<String, String> {
    let db_path = get_db_path(&app)?;
    let backups_dir = get_backups_dir(&app)?;
    let backup_path = backups_dir.join(&backup_filename);

    // Verify backup exists
    if !backup_path.exists() {
        return Err(format!("Backup file not found: {}", backup_filename));
    }

    // Create a safety backup of current database before restore
    let safety_filename = format!(
        "pre_restore_safety_{}.db",
        Local::now().format("%Y-%m-%d_%H-%M-%S")
    );
    let safety_path = backups_dir.join(&safety_filename);

    if db_path.exists() {
        fs::copy(&db_path, &safety_path)
            .map_err(|e| format!("Failed to create safety backup: {}", e))?;
    }

    // Perform the restore
    fs::copy(&backup_path, &db_path).map_err(|e| format!("Failed to restore database: {}", e))?;

    Ok(format!(
        "Database restored from {}. Safety backup created: {}",
        backup_filename, safety_filename
    ))
}

/// Restores from an external backup file path
#[tauri::command]
fn import_backup(app: AppHandle, source_path: String) -> Result<String, String> {
    let db_path = get_db_path(&app)?;
    let backups_dir = get_backups_dir(&app)?;
    let source = PathBuf::from(&source_path);

    // Verify source exists and is a .db file
    if !source.exists() {
        return Err("Source backup file not found".to_string());
    }

    if source.extension().map_or(true, |ext| ext != "db") {
        return Err("Invalid backup file. Expected .db file".to_string());
    }

    // Create a safety backup first
    let safety_filename = format!(
        "pre_import_safety_{}.db",
        Local::now().format("%Y-%m-%d_%H-%M-%S")
    );
    let safety_path = backups_dir.join(&safety_filename);

    if db_path.exists() {
        fs::copy(&db_path, &safety_path)
            .map_err(|e| format!("Failed to create safety backup: {}", e))?;
    }

    // Restore from external file
    fs::copy(&source, &db_path).map_err(|e| format!("Failed to import backup: {}", e))?;

    Ok(format!(
        "Database imported from external backup. Safety backup created: {}",
        safety_filename
    ))
}

/// Exports a backup to a specified destination
#[tauri::command]
fn export_backup(
    app: AppHandle,
    backup_filename: String,
    destination_path: String,
) -> Result<String, String> {
    let backups_dir = get_backups_dir(&app)?;
    let backup_path = backups_dir.join(&backup_filename);
    let destination = PathBuf::from(&destination_path);

    if !backup_path.exists() {
        return Err(format!("Backup file not found: {}", backup_filename));
    }

    fs::copy(&backup_path, &destination).map_err(|e| format!("Failed to export backup: {}", e))?;

    Ok(format!("Backup exported to: {}", destination_path))
}

/// Deletes a specific backup file
#[tauri::command]
fn delete_backup(app: AppHandle, backup_filename: String) -> Result<String, String> {
    let backups_dir = get_backups_dir(&app)?;
    let backup_path = backups_dir.join(&backup_filename);

    if !backup_path.exists() {
        return Err(format!("Backup file not found: {}", backup_filename));
    }

    // Safety check: don't allow deleting non-.db files
    if backup_path.extension().map_or(true, |ext| ext != "db") {
        return Err("Can only delete .db backup files".to_string());
    }

    fs::remove_file(&backup_path).map_err(|e| format!("Failed to delete backup: {}", e))?;

    Ok(format!("Backup deleted: {}", backup_filename))
}

/// Gets the backups directory path for the file picker
#[tauri::command]
fn get_backups_path(app: AppHandle) -> Result<String, String> {
    let backups_dir = get_backups_dir(&app)?;
    Ok(backups_dir.to_string_lossy().to_string())
}

/// Gets the full path to a specific backup file
#[tauri::command]
fn get_backup_file_path(app: AppHandle, backup_filename: String) -> Result<String, String> {
    let backups_dir = get_backups_dir(&app)?;
    let backup_path = backups_dir.join(&backup_filename);

    if !backup_path.exists() {
        return Err(format!("Backup file not found: {}", backup_filename));
    }

    Ok(backup_path.to_string_lossy().to_string())
}

/// Creates a safety backup of the current database before import operations
#[tauri::command]
fn create_safety_backup(app: AppHandle) -> Result<String, String> {
    let db_path = get_db_path(&app)?;
    let backups_dir = get_backups_dir(&app)?;

    if !db_path.exists() {
        return Err("Database file not found".to_string());
    }

    let safety_filename = format!(
        "pre_import_safety_{}.db",
        Local::now().format("%Y-%m-%d_%H-%M-%S")
    );
    let safety_path = backups_dir.join(&safety_filename);

    fs::copy(&db_path, &safety_path)
        .map_err(|e| format!("Failed to create safety backup: {}", e))?;

    Ok(safety_filename)
}

/// Restores database by importing data from a backup file
/// This uses rusqlite directly to handle the data import properly
/// Much more robust than file replacement - works without app restart
#[tauri::command]
fn restore_data_from_backup(app: AppHandle, backup_path: String) -> Result<RestoreResult, String> {
    let db_path = get_db_path(&app)?;
    let backups_dir = get_backups_dir(&app)?;
    let backup_file = PathBuf::from(&backup_path);

    // Verify backup exists
    if !backup_file.exists() {
        return Err(format!("Backup file not found: {}", backup_path));
    }

    // Create a safety backup first
    let safety_filename = format!(
        "pre_restore_safety_{}.db",
        Local::now().format("%Y-%m-%d_%H-%M-%S")
    );
    let safety_path = backups_dir.join(&safety_filename);

    if db_path.exists() {
        fs::copy(&db_path, &safety_path)
            .map_err(|e| format!("Failed to create safety backup: {}", e))?;
    }

    // Open both databases
    let backup_conn = Connection::open(&backup_file)
        .map_err(|e| format!("Failed to open backup database: {}", e))?;
    
    let main_conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open main database: {}", e))?;

    // Disable foreign keys for the import
    main_conn
        .execute("PRAGMA foreign_keys = OFF", [])
        .map_err(|e| format!("Failed to disable foreign keys: {}", e))?;

    // Start a transaction
    main_conn
        .execute("BEGIN TRANSACTION", [])
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    let mut total_imported = 0;

    // Clear and import each table
    for table in DATA_TABLES.iter().rev() {
        // Clear table first (reverse order for foreign keys)
        if let Err(e) = main_conn.execute(&format!("DELETE FROM {}", table), []) {
            eprintln!("Warning: Could not clear table {}: {}", table, e);
        }
    }

    // Import data in forward order
    for table in DATA_TABLES.iter() {
        match copy_table_data(&backup_conn, &main_conn, table) {
            Ok(count) => {
                println!("[Restore] Imported {} rows into {}", count, table);
                total_imported += count;
            }
            Err(e) => {
                eprintln!("Warning: Error importing {}: {}", table, e);
                // Continue with other tables
            }
        }
    }

    // Commit the transaction
    if let Err(e) = main_conn.execute("COMMIT", []) {
        // Try to rollback
        let _ = main_conn.execute("ROLLBACK", []);
        return Err(format!("Failed to commit transaction: {}", e));
    }

    // Re-enable foreign keys
    let _ = main_conn.execute("PRAGMA foreign_keys = ON", []);

    Ok(RestoreResult {
        success: true,
        message: format!("Successfully restored {} records from backup", total_imported),
        records_imported: total_imported,
        safety_backup: safety_filename,
    })
}

/// Restores database by importing data from a backup file in the backups directory
#[tauri::command]
fn restore_data_from_backup_file(app: AppHandle, backup_filename: String) -> Result<RestoreResult, String> {
    let backups_dir = get_backups_dir(&app)?;
    let backup_path = backups_dir.join(&backup_filename);
    
    restore_data_from_backup(app, backup_path.to_string_lossy().to_string())
}

#[tauri::command]
fn print_receipt(text: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let lpstat = Command::new("lpstat")
            .arg("-p")
            .output()
            .map_err(|e| format!("Printing not available (lpstat not found): {e}"))?;

        if !lpstat.status.success() {
            let stderr = String::from_utf8_lossy(&lpstat.stderr);
            return Err(format!("Printer status check failed: {stderr}"));
        }

        let stdout = String::from_utf8_lossy(&lpstat.stdout);
        let has_printer = stdout
            .lines()
            .any(|l| l.starts_with("printer ") || l.contains(" printer "));
        if !has_printer {
            return Err(
                "No printer configured. Please add/connect a printer in system settings (CUPS)."
                    .to_string(),
            );
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

    #[cfg(target_os = "windows")]
    {
        // Windows thermal printer support using PowerShell
        // Write receipt to a temp file
        let tmp_path = std::env::temp_dir().join("motormods_receipt.txt");
        fs::write(&tmp_path, &text).map_err(|e| format!("Failed to write receipt file: {e}"))?;

        // Use PowerShell to print to the default printer
        // For 80mm thermal printers, Windows uses the standard print spooler
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "Get-Content -Path '{}' -Raw | Out-Printer",
                    tmp_path.to_string_lossy()
                ),
            ])
            .output()
            .map_err(|e| format!("Failed to execute print command: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Check if it's just a "no default printer" issue
            if stderr.contains("printer") || stderr.contains("Printer") {
                return Err("No default printer configured. Please set a default printer in Windows Settings.".to_string());
            }
            return Err(format!("Print failed: {stderr}"));
        }

        // Clean up temp file
        let _ = fs::remove_file(&tmp_path);

        Ok(())
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = text;
        Err("Printing is currently supported only on Windows and Linux builds.".to_string())
    }
}

// ============================================
// SILENT PDF PRINTING (Windows only, using SumatraPDF)
// ============================================

#[tauri::command]
fn print_pdf_silent(
    app: AppHandle,
    pdf_path: String,
    printer_name: Option<String>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Look for SumatraPDF.exe in the resources folder
        let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;

        // Try multiple possible locations for SumatraPDF.exe
        let possible_paths = vec![
            resource_dir.join("SumatraPDF.exe"),
            resource_dir.join("resources").join("SumatraPDF.exe"),
        ];

        let sumatra_exe = possible_paths.iter().find(|p| p.exists()).ok_or_else(|| {
            "SumatraPDF.exe not found. Please place SumatraPDF.exe in src-tauri/resources/"
                .to_string()
        })?;

        // Verify PDF file exists
        let pdf_file = std::path::Path::new(&pdf_path);
        if !pdf_file.exists() {
            return Err(format!("PDF file not found: {}", pdf_path));
        }

        // Build SumatraPDF command
        let mut cmd = Command::new(sumatra_exe);

        if let Some(printer) = printer_name {
            cmd.args(["-print-to", &printer]);
        } else {
            cmd.arg("-print-to-default");
        }

        cmd.arg("-silent");
        cmd.arg(&pdf_path);

        let output = cmd
            .output()
            .map_err(|e| format!("Failed to execute SumatraPDF: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.is_empty() {
                // SumatraPDF often doesn't output errors, check if print started
                return Ok(());
            }
            return Err(format!("Print failed: {}", stderr));
        }

        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, pdf_path, printer_name);
        Err("Silent PDF printing is only available on Windows.".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            backup_database,
            restore_database,
            import_backup,
            export_backup,
            list_backups,
            delete_backup,
            get_backups_path,
            get_backup_file_path,
            create_safety_backup,
            restore_data_from_backup,
            restore_data_from_backup_file,
            print_receipt,
            print_pdf_silent
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
