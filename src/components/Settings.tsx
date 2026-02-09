import {
    Cloud,
    Database,
    Edit2,
    HardDrive,
    Key,
    Plus,
    Save,
    Settings as SettingsIcon,
    Sliders,
    Trash2,
    Users
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { isFirestoreSyncEnabled } from "../db/firebase";
import { syncAllProductsToFirestore } from "../db/firestoreSync";
import { productService } from "../db/productService";
import { settingsService } from "../db/settingsService";
import { User, userService } from "../db/userService";
import { AppSettings, LowStockMethod } from "../types";
import { Badge, Button, ConfirmModal, Input, useToast } from "./ui";

type SettingsTab = "general" | "inventory" | "analytics" | "users";

export const Settings: React.FC = () => {
    const toast = useToast();

    const [activeTab, setActiveTab] = useState<SettingsTab>("general");
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);

    // User Management State
    const [users, setUsers] = useState<User[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [userModalOpen, setUserModalOpen] = useState(false);
    const [passwordModalOpen, setPasswordModalOpen] = useState(false);
    const [deleteUserConfirm, setDeleteUserConfirm] = useState<string | null>(null);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [userForm, setUserForm] = useState({ username: "", password: "", name: "", role: "staff" as "admin" | "staff" });
    const [newPassword, setNewPassword] = useState("");
    const [userSaving, setUserSaving] = useState(false);


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

    // Load users when Users tab is selected
    useEffect(() => {
        if (activeTab === "users") {
            setUsersLoading(true);
            userService.getAll()
                .then(setUsers)
                .catch((error) => {
                    console.error(error);
                    toast.error("Error", "Failed to load users");
                })
                .finally(() => setUsersLoading(false));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

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
        { id: "users", label: "Users", icon: Users },
    ];

    const handleSyncToCloud = async () => {
        if (!isFirestoreSyncEnabled()) {
            toast.warning("Firebase Not Configured", "Please configure Firebase in your .env file to enable cloud sync.");
            return;
        }

        setSyncing(true);
        try {
            const products = await productService.getAll();
            if (products.length === 0) {
                toast.info("No Products", "There are no products to sync.");
                setSyncing(false);
                return;
            }

            const result = await syncAllProductsToFirestore(products);
            if (result.success) {
                toast.success("Cloud Sync Complete", `Successfully synced ${result.synced} products to Firestore.`);
            } else {
                toast.warning("Partial Sync", `Synced ${result.synced} products, ${result.failed} failed.`);
            }
        } catch (error) {
            console.error("Cloud sync error:", error);
            toast.error("Sync Failed", error instanceof Error ? error.message : "Could not sync to cloud");
        } finally {
            setSyncing(false);
        }
    };

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
                                    <img
                                        src="/logo.png"
                                        alt="MotorMods Logo"
                                        className="w-20 h-20 rounded-2xl object-contain bg-white p-2 border border-slate-100 shadow-sm"
                                    />
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

                        {/* Store Details Section */}
                        <div className="border-t border-slate-100 pt-8">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="font-bold text-slate-800">Store Details</h4>
                                <Button onClick={handleSave} isLoading={saving} leftIcon={<Save size={16} />} size="sm">
                                    Save
                                </Button>
                            </div>
                            <p className="text-sm text-slate-500 mb-4">These details appear on your printed invoices.</p>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Store Name</label>
                                    <Input
                                        value={settings.store_name}
                                        onChange={(e) => updateSetting("store_name", e.target.value)}
                                        placeholder="Your Business Name"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                                        <Input
                                            type="email"
                                            value={settings.store_email}
                                            onChange={(e) => updateSetting("store_email", e.target.value)}
                                            placeholder="contact@example.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
                                        <Input
                                            type="tel"
                                            value={settings.store_phone}
                                            onChange={(e) => updateSetting("store_phone", e.target.value)}
                                            placeholder="+91 98765 43210"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Address (Optional)</label>
                                    <textarea
                                        value={settings.store_address}
                                        onChange={(e) => updateSetting("store_address", e.target.value)}
                                        placeholder="Shop No, Street, City, State - PIN"
                                        className="w-full min-h-20 px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Cloud Sync Section */}
                        <div className="border-t border-slate-100 pt-8">
                            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-emerald-100 rounded-xl text-emerald-600">
                                        <Cloud size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-emerald-900 mb-2">Cloud Sync</h4>
                                        <p className="text-sm text-emerald-800 mb-4">
                                            Push all local products to Firebase Firestore for PWA access. This syncs your entire inventory to the cloud.
                                        </p>
                                        <Button
                                            onClick={handleSyncToCloud}
                                            isLoading={syncing}
                                            leftIcon={<Cloud size={18} />}
                                            className="bg-emerald-600 hover:bg-emerald-700"
                                        >
                                            {syncing ? "Syncing..." : "Sync Products to Cloud"}
                                        </Button>
                                    </div>
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


                {activeTab === "users" && (
                    <div className="space-y-6 max-w-4xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-800">User Management</h3>
                            <Button
                                onClick={() => {
                                    setEditingUser(null);
                                    setUserForm({ username: "", password: "", name: "", role: "staff" });
                                    setUserModalOpen(true);
                                }}
                                leftIcon={<Plus size={18} />}
                            >
                                Add User
                            </Button>
                        </div>

                        {usersLoading ? (
                            <div className="text-center py-12 text-slate-500">Loading users...</div>
                        ) : users.length === 0 ? (
                            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-100">
                                <Users size={48} className="mx-auto text-slate-300 mb-4" />
                                <p className="text-slate-500">No users found. Add your first user above.</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                                <table className="w-full">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Username</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Name</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Role</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Status</th>
                                            <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {users.map((user) => (
                                            <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 font-medium text-slate-800">{user.username}</td>
                                                <td className="px-6 py-4 text-slate-600">{user.name}</td>
                                                <td className="px-6 py-4">
                                                    <Badge variant={user.role === "admin" ? "info" : "neutral"} size="sm">
                                                        {user.role}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge variant={user.is_active ? "success" : "neutral"} size="sm">
                                                        {user.is_active ? "Active" : "Inactive"}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => {
                                                                setEditingUser(user);
                                                                setUserForm({ username: user.username, password: "", name: user.name, role: user.role });
                                                                setUserModalOpen(true);
                                                            }}
                                                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                            title="Edit User"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEditingUser(user);
                                                                setNewPassword("");
                                                                setPasswordModalOpen(true);
                                                            }}
                                                            className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                                            title="Change Password"
                                                        >
                                                            <Key size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteUserConfirm(user.id)}
                                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Delete User"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>


            {/* User Create/Edit Modal */}
            {userModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 m-4">
                        <h3 className="text-lg font-bold text-slate-800 mb-4">
                            {editingUser ? "Edit User" : "Create New User"}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Username</label>
                                <Input
                                    value={userForm.username}
                                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                                    placeholder="Enter username"
                                    disabled={!!editingUser}
                                />
                            </div>
                            {!editingUser && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                                    <Input
                                        type="password"
                                        value={userForm.password}
                                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                                        placeholder="Enter password"
                                    />
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                                <Input
                                    value={userForm.name}
                                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                                    placeholder="Enter full name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
                                <select
                                    value={userForm.role}
                                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value as "admin" | "staff" })}
                                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                >
                                    <option value="staff">Staff</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <Button variant="secondary" className="flex-1" onClick={() => setUserModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                className="flex-1"
                                isLoading={userSaving}
                                onClick={async () => {
                                    if (!userForm.username || !userForm.name) {
                                        toast.error("Error", "Please fill in all required fields");
                                        return;
                                    }
                                    if (!editingUser && !userForm.password) {
                                        toast.error("Error", "Password is required for new users");
                                        return;
                                    }
                                    setUserSaving(true);
                                    try {
                                        if (editingUser) {
                                            await userService.update(editingUser.id, {
                                                name: userForm.name,
                                                role: userForm.role,
                                            });
                                            toast.success("Success", "User updated successfully");
                                        } else {
                                            await userService.create({
                                                username: userForm.username,
                                                password: userForm.password,
                                                name: userForm.name,
                                                role: userForm.role,
                                            });
                                            toast.success("Success", "User created successfully");
                                        }
                                        setUserModalOpen(false);
                                        const updatedUsers = await userService.getAll();
                                        setUsers(updatedUsers);
                                    } catch (error) {
                                        console.error(error);
                                        toast.error("Error", "Failed to save user");
                                    } finally {
                                        setUserSaving(false);
                                    }
                                }}
                            >
                                {editingUser ? "Update" : "Create"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Change Password Modal */}
            {passwordModalOpen && editingUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 m-4">
                        <h3 className="text-lg font-bold text-slate-800 mb-2">Change Password</h3>
                        <p className="text-sm text-slate-500 mb-4">Set a new password for {editingUser.name}</p>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
                            <Input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new password"
                            />
                        </div>
                        <div className="flex gap-3 mt-6">
                            <Button variant="secondary" className="flex-1" onClick={() => setPasswordModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                className="flex-1"
                                isLoading={userSaving}
                                onClick={async () => {
                                    if (!newPassword) {
                                        toast.error("Error", "Please enter a new password");
                                        return;
                                    }
                                    setUserSaving(true);
                                    try {
                                        await userService.changePassword(editingUser.id, newPassword);
                                        toast.success("Success", "Password changed successfully");
                                        setPasswordModalOpen(false);
                                    } catch (error) {
                                        console.error(error);
                                        toast.error("Error", "Failed to change password");
                                    } finally {
                                        setUserSaving(false);
                                    }
                                }}
                            >
                                Change Password
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete User Confirmation Modal */}
            <ConfirmModal
                isOpen={!!deleteUserConfirm}
                onClose={() => setDeleteUserConfirm(null)}
                onConfirm={async () => {
                    if (!deleteUserConfirm) return;
                    try {
                        await userService.delete(deleteUserConfirm);
                        toast.success("Success", "User deleted successfully");
                        const updatedUsers = await userService.getAll();
                        setUsers(updatedUsers);
                    } catch (error) {
                        console.error(error);
                        toast.error("Error", "Failed to delete user");
                    }
                    setDeleteUserConfirm(null);
                }}
                title="Delete User?"
                message="This will permanently delete this user. They will no longer be able to log in. Continue?"
                confirmText="Yes, Delete"
                variant="danger"
            />

        </div>
    );
};
