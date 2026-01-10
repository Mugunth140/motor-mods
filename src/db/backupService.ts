import { invoke } from "@tauri-apps/api/core";
import { BackupLog } from "../types";
import { getDb } from "./index";
import { isTauriRuntime } from "./runtime";
import { settingsService } from "./settingsService";

const LAST_BACKUP_KEY = "motormods_last_backup_date";
const BACKUP_LOG_KEY = "motormods_backup_log_v1";

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

export const backupService = {
  async triggerBackup(type: 'auto' | 'manual' = 'manual'): Promise<string> {
    const backupDate = new Date().toISOString();
    let backupFile = `motormods_backup_${backupDate.replace(/[:.]/g, '-')}.db`;
    let fileSize: number | null = null;
    let status: 'success' | 'failed' = 'success';

    try {
      if (isTauriRuntime()) {
        // The Rust command returns the backup filename
        const result = await invoke<string>("backup_database");
        console.log("Backup created:", result);
        backupFile = result;
      }
    } catch (error) {
      console.error("Backup failed:", error);
      status = 'failed';
      // Still log the failed attempt
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

  async getBackupLog(limit: number = 50): Promise<BackupLog[]> {
    if (!isTauriRuntime()) {
      return loadBackupLog().slice(0, limit);
    }

    const db = await getDb();
    return await db.select<BackupLog[]>(
      `SELECT * FROM backup_log ORDER BY backup_date DESC LIMIT ${limit}`
    );
  },

  async checkAndTriggerAutoBackup(): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const lastBackup = localStorage.getItem(LAST_BACKUP_KEY);

    // Check if auto backup is enabled
    const autoBackupEnabled = await settingsService.get('auto_backup_enabled');
    if (!autoBackupEnabled) {
      console.log("Auto backup is disabled");
      return;
    }

    if (lastBackup !== today) {
      console.log("Running daily backup...");
      try {
        await this.triggerBackup('auto');
        localStorage.setItem(LAST_BACKUP_KEY, today);
        console.log("Daily backup complete for", today);

        // Clean up old backups based on retention setting
        await this.cleanupOldBackups();
      } catch (e) {
        console.error("Skipping local storage update due to backup failure", e);
      }
    } else {
      console.log("Backup already done for today.");
    }
  },

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

      const db = await getDb();
      await db.execute(
        "DELETE FROM backup_log WHERE backup_date < $1",
        [cutoffIso]
      );
      console.log(`Cleaned up backups older than ${retentionDays} days`);
    } catch (error) {
      console.error("Failed to cleanup old backups:", error);
    }
  },

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
