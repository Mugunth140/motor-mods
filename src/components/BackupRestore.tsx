import {
    AlertTriangle,
    Archive,
    Clock,
    Database,
    Download,

    FileCheck,
    FolderOpen,
    HardDrive,
    History,
    RefreshCcw,
    RotateCcw,
    Save,
    Trash2,
    Upload
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { backupService } from "../db/backupService";
import { isTauriRuntime } from "../db/runtime";
import { settingsService } from "../db/settingsService";
import { AppSettings, BackupFileInfo, BackupLog } from "../types";
import { Badge, Button, Card, ConfirmModal, Input, useToast } from "./ui";

export const BackupRestore: React.FC = () => {
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [backups, setBackups] = useState<BackupLog[]>([]);
    const [backupFiles, setBackupFiles] = useState<BackupFileInfo[]>([]);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);
    const [deletingBackup, setDeletingBackup] = useState<string | null>(null);


    // Restore state
    const [restoreConfirm, setRestoreConfirm] = useState<{ open: boolean; backup: BackupFileInfo | null }>({
        open: false,
        backup: null,
    });

    // Delete confirmation state
    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; backup: BackupFileInfo | null }>({
        open: false,
        backup: null,
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const [logs, files, appSettings] = await Promise.all([
                backupService.getBackupLog(),
                backupService.listBackupFiles(),
                settingsService.getAll()
            ]);
            setBackups(logs);
            setBackupFiles(files);
            setSettings(appSettings);
        } catch (error) {
            console.error(error);
            setLoadError(true);
            toast.error("Error", "Failed to load backup data");
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleManualBackup = async () => {
        setIsBackingUp(true);
        try {
            await backupService.triggerBackup('manual');
            toast.success("Backup Complete", "Database has been backed up successfully");
            loadData();
        } catch (error) {
            console.error(error);
            toast.error("Backup Failed", error instanceof Error ? error.message : "Could not create backup");
        } finally {
            setIsBackingUp(false);
        }
    };

    const handleSaveSettings = async () => {
        if (!settings) return;
        setSavingSettings(true);
        try {
            await settingsService.setMultiple(settings);
            toast.success("Settings Saved", "Backup preferences updated");
        } catch (error) {
            console.error(error);
            toast.error("Error", "Failed to save settings");
        } finally {
            setSavingSettings(false);
        }
    };

    const handleRestore = async () => {
        if (!restoreConfirm.backup) return;
        setRestoreConfirm({ open: false, backup: null });
        setIsRestoring(true);

        try {
            const result = await backupService.restoreFromBackup(restoreConfirm.backup.filename);
            toast.success("Restore Complete", result);
            
            // Give user a moment to see success message, then reload to refresh all data
            toast.info("Refreshing", "Reloading application to apply restored data...");
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } catch (error) {
            console.error(error);
            toast.error("Restore Failed", error instanceof Error ? error.message : "Could not restore backup");
            setIsRestoring(false);
        }
    };

    const handleImportBackup = async () => {
        setIsImporting(true);
        try {
            const filePath = await backupService.selectExternalBackup();
            if (!filePath) {
                setIsImporting(false);
                return; // User cancelled
            }

            const result = await backupService.importBackup(filePath);
            toast.success("Import Complete", result);
            
            // Give user a moment to see success message, then reload to refresh all data
            toast.info("Refreshing", "Reloading application to apply imported data...");
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } catch (error) {
            console.error(error);
            toast.error("Import Failed", error instanceof Error ? error.message : "Could not import backup");
            setIsImporting(false);
        }
    };



    const handleDeleteBackup = async () => {
        if (!deleteConfirm.backup) return;
        const backup = deleteConfirm.backup;
        setDeleteConfirm({ open: false, backup: null });
        setDeletingBackup(backup.filename);

        try {
            await backupService.deleteBackup(backup.filename);
            toast.success("Deleted", "Backup file removed");
            loadData();
        } catch (error) {
            console.error(error);
            toast.error("Delete Failed", error instanceof Error ? error.message : "Could not delete backup");
        } finally {
            setDeletingBackup(null);
        }
    };

    const handleOpenBackupsFolder = async () => {
        try {
            const path = await backupService.getBackupsPath();
            if (path && isTauriRuntime()) {
                // Use the opener plugin to reveal the folder
                const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
                await revealItemInDir(path);
            }
        } catch (error) {
            console.error(error);
            toast.error("Error", "Could not open backups folder");
        }
    };

    const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        if (settings) {
            setSettings({ ...settings, [key]: value });
        }
    };

    const formatFileSize = (bytes: number | null) => {
        if (!bytes) return '-';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (loadError || !settings) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <p className="text-slate-500">Failed to load backup data</p>
                <button
                    onClick={loadData}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 h-[calc(100vh-8rem)] animate-in fade-in duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                {/* Backup Status Card */}
                <Card className="lg:col-span-2 flex flex-col gap-6 min-h-0 overflow-hidden">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Database className="text-teal-600" size={20} />
                                Database Backup
                            </h2>
                            <p className="text-sm text-slate-500">Manage your data safety and recovery points</p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleOpenBackupsFolder}
                                leftIcon={<FolderOpen size={16} />}
                                className="text-slate-600"
                            >
                                Open Folder
                            </Button>
                            <Button
                                onClick={handleManualBackup}
                                isLoading={isBackingUp}
                                leftIcon={<Download size={18} />}
                                className="bg-teal-600 hover:bg-teal-700"
                            >
                                Backup Now
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-teal-50 rounded-xl p-4 border border-teal-100">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-white rounded-lg text-teal-600 shadow-sm">
                                    <History size={20} />
                                </div>
                                <span className="font-semibold text-teal-900">Last Backup</span>
                            </div>
                            <p className="text-lg font-bold text-slate-800">
                                {backups.length > 0
                                    ? new Date(backups[0].backup_date).toLocaleDateString()
                                    : "Never"}
                            </p>
                            <p className="text-xs text-slate-500">
                                {backups.length > 0
                                    ? new Date(backups[0].backup_date).toLocaleTimeString()
                                    : "No backups yet"}
                            </p>
                        </div>

                        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-white rounded-lg text-emerald-600 shadow-sm">
                                    <FileCheck size={20} />
                                </div>
                                <span className="font-semibold text-emerald-900">Total Backups</span>
                            </div>
                            <p className="text-lg font-bold text-slate-800">{backups.length}</p>
                            <p className="text-xs text-slate-500">Stored locally</p>
                        </div>

                        <div className="bg-sky-50 rounded-xl p-4 border border-sky-100">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-white rounded-lg text-sky-600 shadow-sm">
                                    <HardDrive size={20} />
                                </div>
                                <span className="font-semibold text-sky-900">Latest Size</span>
                            </div>
                            <p className="text-lg font-bold text-slate-800">
                                {backups.length > 0
                                    ? formatFileSize(backups[0].file_size)
                                    : "Unknown"}
                            </p>
                            <p className="text-xs text-slate-500">Database backup</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <h3 className="font-bold text-slate-700">Backup History</h3>
                            <Button variant="ghost" size="sm" onClick={loadData} leftIcon={<RefreshCcw size={14} />}>
                                Refresh
                            </Button>
                        </div>

                        <div className="border border-slate-200 rounded-xl overflow-auto flex-1 min-h-0 custom-scrollbar">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 sticky top-0">
                                    <tr>
                                        <th className="p-3 text-left font-semibold text-slate-600">Date & Time</th>
                                        <th className="p-3 text-left font-semibold text-slate-600">Type</th>
                                        <th className="p-3 text-left font-semibold text-slate-600">Size</th>
                                        <th className="p-3 text-left font-semibold text-slate-600">Status</th>
                                        <th className="p-3 text-right font-semibold text-slate-600">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {backupFiles.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-slate-400">
                                                <Archive size={32} className="mx-auto mb-2 opacity-50" />
                                                No backups found
                                            </td>
                                        </tr>
                                    ) : (
                                        backupFiles.map((backup) => {
                                            // Find matching log entry for type/status info
                                            const logEntry = backups.find(b => b.backup_file === backup.filename);
                                            return (
                                                <tr key={backup.filename} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-3 text-slate-800 font-medium">
                                                        {new Date(backup.modified_at).toLocaleString()}
                                                    </td>
                                                    <td className="p-3">
                                                        <Badge variant={logEntry?.backup_type === 'auto' ? 'info' : 'neutral'}>
                                                            {logEntry?.backup_type || 'manual'}
                                                        </Badge>
                                                    </td>
                                                    <td className="p-3 text-slate-600 font-mono text-xs">
                                                        {formatFileSize(backup.file_size)}
                                                    </td>
                                                    <td className="p-3">
                                                        <Badge variant="success">
                                                            Available
                                                        </Badge>
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setRestoreConfirm({ open: true, backup })}
                                                                disabled={isRestoring}
                                                                className="hover:bg-teal-50 hover:text-teal-600"
                                                                leftIcon={<RotateCcw size={14} />}
                                                            >
                                                                Restore
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setDeleteConfirm({ open: true, backup })}
                                                                isLoading={deletingBackup === backup.filename}
                                                                className="hover:bg-red-50 hover:text-red-600"
                                                                leftIcon={<Trash2 size={14} />}
                                                                title="Delete"
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Card>

                {/* Settings Card */}
                <div className="flex flex-col gap-6 overflow-y-auto max-h-full custom-scrollbar">
                    <Card className="flex-1">
                        <div className="border-b border-slate-100 pb-4 mb-4">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Clock className="text-teal-600" size={18} />
                                Auto-Backup Settings
                            </h3>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <label className="font-semibold text-slate-700 block">Enable Auto-Backup</label>
                                    <p className="text-xs text-slate-500">Backup daily automatically</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={settings.auto_backup_enabled}
                                        onChange={(e) => updateSetting("auto_backup_enabled", e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                                </label>
                            </div>

                            {settings.auto_backup_enabled && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                                            Backup Time
                                        </label>
                                        <Input
                                            type="time"
                                            value={settings.auto_backup_time}
                                            onChange={(e) => updateSetting("auto_backup_time", e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                                            Retention Period
                                        </label>
                                        <select
                                            value={settings.backup_retention_days}
                                            onChange={(e) => updateSetting("backup_retention_days", parseInt(e.target.value))}
                                            className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                                        >
                                            <option value={7}>Keep for 7 days</option>
                                            <option value={14}>Keep for 14 days</option>
                                            <option value={30}>Keep for 30 days</option>
                                            <option value={60}>Keep for 60 days</option>
                                            <option value={90}>Keep for 90 days</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            <Button
                                onClick={handleSaveSettings}
                                isLoading={savingSettings}
                                className="w-full bg-slate-800 hover:bg-slate-900"
                                leftIcon={<Save size={18} />}
                            >
                                Save Preferences
                            </Button>
                        </div>
                    </Card>

                    <Card className="bg-amber-50 border-amber-100">
                        <div className="flex gap-3">
                            <AlertTriangle className="text-amber-600 shrink-0" size={24} />
                            <div>
                                <h4 className="font-bold text-amber-900">Restore Warning</h4>
                                <p className="text-sm text-amber-800 mt-1">
                                    Restoring a backup will overwrite all current data. A safety backup
                                    is automatically created before restore, but please ensure you understand
                                    this action cannot be easily undone.
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Upload className="text-teal-600" size={18} />
                            Restore from File
                        </h3>
                        <p className="text-sm text-slate-500 mb-4">
                            Have a backup file (.db) saved externally? Select it to restore your data.
                        </p>
                        <Button
                            variant="secondary"
                            className="w-full"
                            leftIcon={<Upload size={18} />}
                            onClick={handleImportBackup}
                            isLoading={isImporting}
                        >
                            Select Backup File
                        </Button>
                    </Card>
                </div>
            </div>

            {/* Restore Confirmation Modal */}
            <ConfirmModal
                isOpen={restoreConfirm.open}
                onClose={() => setRestoreConfirm({ open: false, backup: null })}
                onConfirm={handleRestore}
                title="Restore Database?"
                message={`Are you sure you want to restore the database from "${restoreConfirm.backup?.modified_at ? new Date(restoreConfirm.backup.modified_at).toLocaleString() : 'selected backup'}"?\n\nA safety backup will be created automatically. The application will restart after restore.`}
                confirmText="Yes, Restore Database"
                variant="danger"
            />

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={deleteConfirm.open}
                onClose={() => setDeleteConfirm({ open: false, backup: null })}
                onConfirm={handleDeleteBackup}
                title="Delete Backup?"
                message={`Are you sure you want to permanently delete the backup from "${deleteConfirm.backup?.modified_at ? new Date(deleteConfirm.backup.modified_at).toLocaleString() : 'selected backup'}"?\n\nThis action cannot be undone.`}
                confirmText="Yes, Delete Backup"
                variant="danger"
            />
        </div>
    );
};
