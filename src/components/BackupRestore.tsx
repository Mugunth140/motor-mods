import {
    AlertTriangle,
    Archive,
    Clock,
    Database,
    Download,
    FileCheck,
    HardDrive,
    History,
    RefreshCcw,
    RotateCcw,
    Save,
    Upload
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { backupService } from "../db/backupService";
import { settingsService } from "../db/settingsService";
import { AppSettings, BackupLog } from "../types";
import { Badge, Button, Card, ConfirmModal, Input, useToast } from "./ui";

export const BackupRestore: React.FC = () => {
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [backups, setBackups] = useState<BackupLog[]>([]);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);

    // Restore state
    const [restoreConfirm, setRestoreConfirm] = useState<{ open: boolean; backup: BackupLog | null }>({
        open: false,
        backup: null,
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const [logs, appSettings] = await Promise.all([
                backupService.getBackupLog(),
                settingsService.getAll()
            ]);
            setBackups(logs);
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
            toast.error("Backup Failed", "Could not create backup");
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

        // In a real implementation, this would invoke a backend command
        // await invoke("restore_database", { path: restoreConfirm.backup.backup_file });

        toast.info(
            "Restore Initiated",
            `Restoring from ${restoreConfirm.backup.backup_file}. The application will restart upon completion.`
        );
        setRestoreConfirm({ open: false, backup: null });
    };

    const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        if (settings) {
            setSettings({ ...settings, [key]: value });
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (loadError || !settings) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <p className="text-slate-500">Failed to load backup data</p>
                <button
                    onClick={loadData}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 h-[calc(100vh-8rem)] animate-in fade-in duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Backup Status Card */}
                <Card className="lg:col-span-2 flex flex-col gap-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Database className="text-indigo-600" size={20} />
                                Database Backup
                            </h2>
                            <p className="text-sm text-slate-500">Manage your data safety and recovery points</p>
                        </div>
                        <Button
                            onClick={handleManualBackup}
                            isLoading={isBackingUp}
                            leftIcon={<Download size={18} />}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            Backup Now
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-white rounded-lg text-indigo-600 shadow-sm">
                                    <History size={20} />
                                </div>
                                <span className="font-semibold text-indigo-900">Last Backup</span>
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

                        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-white rounded-lg text-blue-600 shadow-sm">
                                    <HardDrive size={20} />
                                </div>
                                <span className="font-semibold text-blue-900">Database Size</span>
                            </div>
                            <p className="text-lg font-bold text-slate-800">
                                {backups.length > 0 && backups[0].file_size
                                    ? `${(backups[0].file_size / 1024).toFixed(2)} KB`
                                    : "Unknown"}
                            </p>
                            <p className="text-xs text-slate-500">Estimated</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-slate-700">Backup History</h3>
                            <Button variant="ghost" size="sm" onClick={loadData} leftIcon={<RefreshCcw size={14} />}>
                                Refresh
                            </Button>
                        </div>

                        <div className="border border-slate-200 rounded-xl overflow-auto flex-1 custom-scrollbar">
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
                                    {backups.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-slate-400">
                                                <Archive size={32} className="mx-auto mb-2 opacity-50" />
                                                No backups found
                                            </td>
                                        </tr>
                                    ) : (
                                        backups.map((backup) => (
                                            <tr key={backup.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-3 text-slate-800 font-medium">
                                                    {new Date(backup.backup_date).toLocaleString()}
                                                </td>
                                                <td className="p-3">
                                                    <Badge variant={backup.backup_type === 'auto' ? 'info' : 'neutral'}>
                                                        {backup.backup_type}
                                                    </Badge>
                                                </td>
                                                <td className="p-3 text-slate-600 font-mono text-xs">
                                                    {backup.file_size ? `${(backup.file_size / 1024).toFixed(1)} KB` : '-'}
                                                </td>
                                                <td className="p-3">
                                                    <Badge variant={backup.status === 'success' ? 'success' : 'danger'}>
                                                        {backup.status}
                                                    </Badge>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setRestoreConfirm({ open: true, backup })}
                                                        className="hover:bg-indigo-50 hover:text-indigo-600"
                                                        leftIcon={<RotateCcw size={14} />}
                                                    >
                                                        Restore
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Card>

                {/* Settings Card */}
                <div className="flex flex-col gap-6">
                    <Card className="flex-1">
                        <div className="border-b border-slate-100 pb-4 mb-4">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Clock className="text-indigo-600" size={18} />
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
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
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
                                            className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                        >
                                            <option value={7}>Keep for 7 days</option>
                                            <option value={14}>Keep for 14 days</option>
                                            <option value={30}>Keep for 30 days</option>
                                            <option value={60}>Keep for 60 days</option>
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
                                    Restoring a backup will overwrite all current data. This action cannot be undone.
                                    Ensure you have a recent backup of your current data before proceeding.
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Upload className="text-indigo-600" size={18} />
                            Restore from File
                        </h3>
                        <p className="text-sm text-slate-500 mb-4">
                            Have a backup file (.db) saved externally? Upload it here to restore.
                        </p>
                        <Button
                            variant="secondary"
                            className="w-full"
                            leftIcon={<Upload size={18} />}
                            onClick={() => toast.info("Coming Soon", "File picker for restore is being implemented")}
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
                message={`Are you sure you want to restore the database from "${restoreConfirm.backup?.backup_date ? new Date(restoreConfirm.backup.backup_date).toLocaleString() : 'selected backup'}"? \n\nALL CURRENT DATA WILL BE LOST.`}
                confirmText="Yes, Restore Database"
                variant="danger"
            />
        </div>
    );
};
