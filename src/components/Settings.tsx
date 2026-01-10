import {
    Database,
    HardDrive,
    Save,
    Settings as SettingsIcon,
    Sliders
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { settingsService } from "../db/settingsService";
import { AppSettings, LowStockMethod } from "../types";
import { Badge, Button, Input, useToast } from "./ui";

type SettingsTab = "general" | "inventory" | "analytics";

export const Settings: React.FC = () => {
    const toast = useToast();

    const [activeTab, setActiveTab] = useState<SettingsTab>("general");
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const loadSettings = useCallback(async () => {
        try {
            const data = await settingsService.getAll();
            setSettings(data);
        } catch (error) {
            console.error(error);
            toast.error("Error", "Failed to load settings");
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const handleSave = async () => {
        if (!settings) return;

        setSaving(true);
        try {
            await settingsService.setMultiple(settings);
            toast.success("Settings Saved", "Your preferences have been updated");
        } catch (error) {
            console.error(error);
            toast.error("Error", "Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        if (settings) {
            setSettings({ ...settings, [key]: value });
        }
    };

    const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
        { id: "general", label: "General", icon: SettingsIcon },
        { id: "inventory", label: "Inventory", icon: Sliders },
        { id: "analytics", label: "Analytics", icon: Sliders },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!settings) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <p className="text-slate-500">Failed to load settings</p>
                <Button onClick={loadSettings}>Retry</Button>
            </div>
        );
    }

    return (
        <div className="flex gap-6 h-[calc(100vh-8rem)] animate-in fade-in duration-500">
            {/* Sidebar */}
            <div className="w-64 shrink-0 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden h-fit">
                <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="text-lg font-bold text-slate-800">Settings</h2>
                    <p className="text-sm text-slate-500">Configure your app</p>
                </div>
                <nav className="p-3 space-y-1">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                  w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200
                  ${isActive
                                        ? "bg-indigo-50 text-indigo-700 shadow-sm"
                                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                    }
                `}
                            >
                                <Icon size={18} className={isActive ? "text-indigo-600" : "text-slate-400"} />
                                <span className="font-medium text-sm">{tab.label}</span>
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6 custom-scrollbar">
                {activeTab === "general" && (
                    <div className="space-y-8 max-w-2xl">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800 mb-4">General Settings</h3>
                            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                                <div className="flex items-center gap-5">
                                    <div className="w-20 h-20 bg-linear-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-indigo-200">
                                        M
                                    </div>
                                    <div>
                                        <h4 className="text-xl font-bold text-slate-800">MotorMods</h4>
                                        <p className="text-slate-500 font-medium">Billing & Inventory System</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <Badge variant="info" size="sm">v0.2.0</Badge>
                                            <span className="text-xs text-slate-400">Latest build</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-slate-100 pt-8">
                            <h4 className="font-bold text-slate-800 mb-4">System Information</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                                    <div className="flex items-center gap-2 mb-2 text-slate-500">
                                        <Database size={16} />
                                        <span className="text-sm font-medium">Database Engine</span>
                                    </div>
                                    <p className="font-bold text-slate-800 text-lg">SQLite</p>
                                    <p className="text-xs text-slate-400">Local Storage</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                                    <div className="flex items-center gap-2 mb-2 text-slate-500">
                                        <HardDrive size={16} />
                                        <span className="text-sm font-medium">Runtime</span>
                                    </div>
                                    <p className="font-bold text-slate-800 text-lg">Tauri + React</p>
                                    <p className="text-xs text-slate-400">Desktop Native</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "inventory" && (
                    <div className="space-y-8 max-w-2xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-800">Inventory Settings</h3>
                            <Button onClick={handleSave} isLoading={saving} leftIcon={<Save size={18} />} className="bg-indigo-600 hover:bg-indigo-700">
                                Save Changes
                            </Button>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                <label className="block text-sm font-bold text-slate-700 mb-2">
                                    Low Stock Detection Method
                                </label>
                                <select
                                    value={settings.low_stock_method}
                                    onChange={(e) => updateSetting("low_stock_method", e.target.value as LowStockMethod)}
                                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-medium"
                                >
                                    <option value="reorder_level">Per-Item Reorder Level</option>
                                    <option value="percentage">Global Percentage of Max Stock</option>
                                    <option value="days_supply">Days of Supply</option>
                                </select>
                                <p className="text-sm text-slate-500 mt-2 flex items-start gap-2">
                                    <span className="text-indigo-500 mt-0.5">ℹ️</span>
                                    Determines how the system calculates and alerts you about low stock items.
                                </p>
                            </div>

                            {settings.low_stock_method === "percentage" && (
                                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                    <label className="block text-sm font-bold text-slate-700 mb-4">
                                        Low Stock Percentage Threshold
                                    </label>
                                    <div className="flex items-center gap-6">
                                        <input
                                            type="range"
                                            min={5}
                                            max={50}
                                            value={settings.low_stock_percentage}
                                            onChange={(e) => updateSetting("low_stock_percentage", parseInt(e.target.value))}
                                            className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        />
                                        <div className="w-20 h-10 bg-white rounded-xl border border-slate-200 flex items-center justify-center font-bold text-indigo-600 shadow-sm">
                                            {settings.low_stock_percentage}%
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-500 mt-3">
                                        Alert when stock falls below this percentage of max stock capacity.
                                    </p>
                                </div>
                            )}

                            {settings.low_stock_method === "days_supply" && (
                                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                    <label className="block text-sm font-bold text-slate-700 mb-2">
                                        Days of Supply Threshold
                                    </label>
                                    <div className="flex items-center gap-4">
                                        <Input
                                            type="number"
                                            min={1}
                                            max={30}
                                            value={settings.low_stock_days_supply}
                                            onChange={(e) => updateSetting("low_stock_days_supply", parseInt(e.target.value) || 15)}
                                            className="w-32"
                                        />
                                        <span className="text-slate-600 font-medium">days</span>
                                    </div>
                                    <p className="text-sm text-slate-500 mt-2">
                                        Alert when stock is estimated to run out in less than this many days based on sales history.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "analytics" && (
                    <div className="space-y-8 max-w-2xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-800">Analytics Settings</h3>
                            <Button onClick={handleSave} isLoading={saving} leftIcon={<Save size={18} />} className="bg-indigo-600 hover:bg-indigo-700">
                                Save Changes
                            </Button>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                <label className="block text-sm font-bold text-slate-700 mb-2">
                                    Non-Moving Items Threshold
                                </label>
                                <div className="flex items-center gap-4">
                                    <Input
                                        type="number"
                                        min={30}
                                        max={365}
                                        value={settings.non_moving_threshold_days}
                                        onChange={(e) => updateSetting("non_moving_threshold_days", parseInt(e.target.value) || 120)}
                                        className="w-32"
                                    />
                                    <span className="text-slate-600 font-medium">days</span>
                                </div>
                                <p className="text-sm text-slate-500 mt-2">
                                    Items not sold for this many days will be flagged as non-moving inventory.
                                </p>
                            </div>

                            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6">
                                <h4 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                                    <Sliders size={18} />
                                    FSN Classification Rules
                                </h4>
                                <ul className="space-y-3">
                                    <li className="flex items-center gap-3 text-amber-800 text-sm">
                                        <Badge variant="success" size="sm" className="w-8 justify-center">F</Badge>
                                        <span><strong>Fast-moving:</strong> Sold within the last 30 days</span>
                                    </li>
                                    <li className="flex items-center gap-3 text-amber-800 text-sm">
                                        <Badge variant="warning" size="sm" className="w-8 justify-center">S</Badge>
                                        <span><strong>Slow-moving:</strong> Sold between 31 and {settings.non_moving_threshold_days} days ago</span>
                                    </li>
                                    <li className="flex items-center gap-3 text-amber-800 text-sm">
                                        <Badge variant="danger" size="sm" className="w-8 justify-center">N</Badge>
                                        <span><strong>Non-moving:</strong> Not sold in {settings.non_moving_threshold_days}+ days</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
