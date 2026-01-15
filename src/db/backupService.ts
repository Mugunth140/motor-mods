import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { BackupFileInfo, BackupLog, BackupResult } from "../types";
import { getDb } from "./index";
import { isTauriRuntime } from "./runtime";
import { settingsService } from "./settingsService";

const LAST_BACKUP_KEY = "motormods_last_backup_date";
const BACKUP_LOG_KEY = "motormods_backup_log_v1";

// ============================================
// LOCAL STORAGE HELPERS (for web dev mode)
// ============================================

const loadBackupLog = (): BackupLog[] => {
  try {
    const raw = localStorage.getItem(BACKUP_LOG_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BackupLog[];
  } catch {
    return [];
  }
};

const saveBackupLog = (logs: BackupLog[]) => {
  localStorage.setItem(BACKUP_LOG_KEY, JSON.stringify(logs));
};

// ============================================
// BACKUP SERVICE
// ============================================

export const backupService = {
  /**
   * Triggers a database backup and logs the result
   */
  async triggerBackup(type: 'auto' | 'manual' = 'manual'): Promise<string> {
    const backupDate = new Date().toISOString();
    let backupFile = `motormods_backup_${backupDate.replace(/[:.]/g, '-')}.db`;
    let fileSize: number | null = null;
    let status: 'success' | 'failed' = 'success';

    try {
      if (isTauriRuntime()) {
        // The Rust command returns a BackupResult object with file info
        const result = await invoke<BackupResult>("backup_database");
        backupFile = result.filename;
        fileSize = result.file_size;
      }
    } catch (error) {
      console.error("Backup failed:", error);
      status = 'failed';
      // Log the failed attempt
      await this.logBackup({
        backup_file: backupFile,
        backup_date: backupDate,
        backup_type: type,
        file_size: fileSize,
        status,
        notes: error instanceof Error ? error.message : 'Backup failed',
      });
      throw error;
    }

    // Log successful backup
    await this.logBackup({
      backup_file: backupFile,
      backup_date: backupDate,
      backup_type: type,
      file_size: fileSize,
      status,
      notes: null,
    });

    return backupFile;
  },

  /**
   * Restores the database from a backup in the backups directory.
   * Closes DB connection, replaces file, reopens connection.
   */
  async restoreFromBackup(backupFilename: string): Promise<string> {
    if (!isTauriRuntime()) {
      throw new Error("Restore is only available in the desktop application");
    }

    // Import closeDatabase to close the connection before restore
    const { closeDatabase } = await import("./index");
    
    // Step 1: Close the frontend database connection
    await closeDatabase();

    // Step 2: Have Rust replace the database file
    const result = await invoke<string>("restore_database", { backupFilename });

    // Step 3: Reopen the database connection by calling getDb
    // This will create a fresh connection to the restored database
    await getDb();

    return result;
  },

  /**
   * Imports and restores from an external backup file path.
   * Closes DB connection, replaces file, reopens connection.
   */
  async importBackup(sourcePath: string): Promise<string> {
    if (!isTauriRuntime()) {
      throw new Error("Import is only available in the desktop application");
    }

    // Import closeDatabase to close the connection before import
    const { closeDatabase } = await import("./index");
    
    // Step 1: Close the frontend database connection
    await closeDatabase();

    // Step 2: Have Rust replace the database file with the external backup
    const result = await invoke<string>("import_backup", { sourcePath });

    // Step 3: Reopen the database connection
    await getDb();

    return result;
  },

  /**
   * Opens a file picker to select an external backup file
   */
  async selectExternalBackup(): Promise<string | null> {
    if (!isTauriRuntime()) {
      throw new Error("File picker is only available in the desktop application");
    }

    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{
        name: "Database Backup",
        extensions: ["db"]
      }],
      title: "Select Backup File to Import"
    });

    if (selected && typeof selected === 'string') {
      return selected;
    }

    return null;
  },

  /**
   * Exports a backup to a user-selected location
   */
  async exportBackup(backupFilename: string): Promise<string | null> {
    if (!isTauriRuntime()) {
      throw new Error("Export is only available in the desktop application");
    }

    const destination = await save({
      defaultPath: backupFilename,
      filters: [{
        name: "Database Backup",
        extensions: ["db"]
      }],
      title: "Export Backup To"
    });

    if (!destination) {
      return null;
    }

    const result = await invoke<string>("export_backup", {
      backupFilename,
      destinationPath: destination
    });

    return result;
  },

  /**
   * Lists all backup files from the filesystem
   */
  async listBackupFiles(): Promise<BackupFileInfo[]> {
    if (!isTauriRuntime()) {
      return [];
    }

    return await invoke<BackupFileInfo[]>("list_backups");
  },

  /**
   * Deletes a specific backup file
   */
  async deleteBackup(backupFilename: string): Promise<string> {
    if (!isTauriRuntime()) {
      throw new Error("Delete is only available in the desktop application");
    }

    return await invoke<string>("delete_backup", { backupFilename });
  },

  /**
   * Gets the backups directory path
   */
  async getBackupsPath(): Promise<string> {
    if (!isTauriRuntime()) {
      return "";
    }

    return await invoke<string>("get_backups_path");
  },

  /**
   * Logs a backup operation to the database
   */
  async logBackup(data: Omit<BackupLog, 'id' | 'created_at'>): Promise<void> {
    if (!isTauriRuntime()) {
      const logs = loadBackupLog();
      const newLog: BackupLog = {
        ...data,
        id: logs.length + 1,
        created_at: new Date().toISOString(),
      };
      logs.unshift(newLog);
      // Keep only last 100 logs
      saveBackupLog(logs.slice(0, 100));
      return;
    }

    const db = await getDb();
    await db.execute(
      `INSERT INTO backup_log (backup_file, backup_date, backup_type, file_size, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [data.backup_file, data.backup_date, data.backup_type, data.file_size, data.status, data.notes]
    );
  },

  /**
   * Gets backup log history from the database
   */
  async getBackupLog(limit: number = 50): Promise<BackupLog[]> {
    if (!isTauriRuntime()) {
      return loadBackupLog().slice(0, limit);
    }

    const db = await getDb();
    return await db.select<BackupLog[]>(
      `SELECT * FROM backup_log ORDER BY backup_date DESC LIMIT ${limit}`
    );
  },

  /**
   * Checks if auto backup should run and triggers it
   */
  async checkAndTriggerAutoBackup(): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const lastBackup = localStorage.getItem(LAST_BACKUP_KEY);

    // Check if auto backup is enabled
    const autoBackupEnabled = await settingsService.get('auto_backup_enabled');
    if (!autoBackupEnabled) {
      return;
    }

    if (lastBackup !== today) {
      try {
        await this.triggerBackup('auto');
        localStorage.setItem(LAST_BACKUP_KEY, today);

        // Clean up old backups based on retention setting
        await this.cleanupOldBackups();
      } catch {
        // Silent fail - backup errors are logged elsewhere
      }
    }
  },

  /**
   * Cleans up old backups based on retention settings
   */
  async cleanupOldBackups(): Promise<void> {
    try {
      const retentionDays = await settingsService.get('backup_retention_days');
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffIso = cutoffDate.toISOString();

      if (!isTauriRuntime()) {
        const logs = loadBackupLog();
        const filtered = logs.filter(log => log.backup_date >= cutoffIso);
        saveBackupLog(filtered);
        console.log(`Cleaned up ${logs.length - filtered.length} old backup logs`);
        return;
      }

      // Clean up database log entries
      const db = await getDb();
      await db.execute(
        "DELETE FROM backup_log WHERE backup_date < $1",
        [cutoffIso]
      );

      // Also clean up actual backup files
      const backupFiles = await this.listBackupFiles();
      for (const file of backupFiles) {
        if (file.modified_at < cutoffIso) {
          try {
            await this.deleteBackup(file.filename);
            console.log(`Deleted old backup: ${file.filename}`);
          } catch (e) {
            console.error(`Failed to delete backup ${file.filename}:`, e);
          }
        }
      }

      console.log(`Cleaned up backups older than ${retentionDays} days`);
    } catch (error) {
      console.error("Failed to cleanup old backups:", error);
    }
  },

  /**
   * Gets information about the last backup
   */
  async getLastBackupInfo(): Promise<{ date: string | null; type: string | null }> {
    const logs = await this.getBackupLog(1);
    if (logs.length === 0) {
      return { date: null, type: null };
    }
    return {
      date: logs[0].backup_date,
      type: logs[0].backup_type,
    };
  },
};
