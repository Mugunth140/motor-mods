import {
    AlertTriangle,
    Code2,
    Database,
    HardDrive,
    Save,
    Settings as SettingsIcon,
    Sliders,
    Trash2,
    Wand2
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { getDb } from "../db/index";
import { isTauriRuntime } from "../db/runtime";
import { settingsService } from "../db/settingsService";
import { AppSettings, LowStockMethod } from "../types";
import { Badge, Button, ConfirmModal, Input, useToast } from "./ui";

type SettingsTab = "general" | "inventory" | "analytics" | "developer";

export const Settings: React.FC = () => {
    const toast = useToast();

    const [activeTab, setActiveTab] = useState<SettingsTab>("general");
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [clearConfirm, setClearConfirm] = useState(false);
    const [seedConfirm, setSeedConfirm] = useState(false);

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
        { id: "developer", label: "Developer", icon: Code2 },
    ];

    const handleSeedDatabase = async () => {
        setSeedConfirm(false);
        setSeeding(true);
        try {
            if (!isTauriRuntime()) {
                toast.error("Error", "Seeding only works in desktop app");
                setSeeding(false);
                return;
            }

            const db = await getDb();

            // Generate unique ID helper
            const genId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

            // Sample product categories
            const categories = ['Brake Parts', 'Engine Parts', 'Suspension', 'Electrical', 'Filters', 'Transmission'];
            const productNames = [
                'Brake Pad Set', 'Brake Disc', 'Brake Caliper', 'Brake Fluid',
                'Air Filter', 'Oil Filter', 'Fuel Filter', 'Cabin Filter',
                'Spark Plug', 'Ignition Coil', 'Alternator', 'Starter Motor',
                'Shock Absorber', 'Strut Mount', 'Control Arm', 'Ball Joint',
                'Clutch Kit', 'Flywheel', 'Gear Oil', 'Transmission Mount',
                'Battery', 'Headlight Bulb', 'Fuse Box', 'Relay Switch'
            ];

            // Insert sample products
            const insertedProductIds: string[] = [];
            for (let i = 0; i < productNames.length; i++) {
                const id = genId('PROD');
                const name = productNames[i];
                const category = categories[Math.floor(i / 4) % categories.length];
                const price = Math.floor(Math.random() * 5000) + 200;
                const costPrice = Math.floor(price * 0.7);
                const quantity = Math.floor(Math.random() * 100) + 5;
                const reorderLevel = Math.floor(Math.random() * 10) + 5;
                const barcode = `88${String(100000 + i).padStart(10, '0')}`;
                const sku = `SKU-${category.substring(0, 3).toUpperCase()}-${String(i + 1).padStart(4, '0')}`;

                await db.execute(
                    `INSERT INTO products (id, name, category, price, purchase_price, quantity, reorder_level, barcode, sku, fsn_classification, created_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'F', datetime('now'))`,
                    [id, name, category, price, costPrice, quantity, reorderLevel, barcode, sku]
                );
                insertedProductIds.push(id);
            }

            // Insert sample invoices with items
            const customerNames = ['Walking Customer', 'Raj Motors', 'ABC Garage', 'Quick Fix Auto', 'Premier Service'];
            for (let i = 0; i < 15; i++) {
                const invoiceId = genId('INV');
                const customer = customerNames[Math.floor(Math.random() * customerNames.length)];
                const daysAgo = Math.floor(Math.random() * 30);
                const invoiceDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

                // Pick random products from inserted ones
                const shuffled = [...insertedProductIds].sort(() => Math.random() - 0.5);
                const selectedProductIds = shuffled.slice(0, 3);

                // Get product details
                interface ProductRow { id: string; name: string; price: number; purchase_price: number }
                const productsData: ProductRow[] = [];
                for (const prodId of selectedProductIds) {
                    const rows = await db.select<ProductRow[]>(
                        "SELECT id, name, price, purchase_price FROM products WHERE id = $1",
                        [prodId]
                    );
                    if (rows.length > 0) productsData.push(rows[0]);
                }

                let totalAmount = 0;
                const items: { productId: string; name: string; qty: number; price: number; costPrice: number }[] = [];

                for (const prod of productsData) {
                    const qty = Math.floor(Math.random() * 3) + 1;
                    totalAmount += prod.price * qty;
                    items.push({ productId: prod.id, name: prod.name, qty, price: prod.price, costPrice: prod.purchase_price || Math.floor(prod.price * 0.7) });
                }

                await db.execute(
                    `INSERT INTO invoices (id, customer_name, discount_amount, total_amount, created_at, is_return) 
                     VALUES ($1, $2, 0, $3, $4, 0)`,
                    [invoiceId, customer, totalAmount, invoiceDate]
                );

                for (const item of items) {
                    const itemId = genId('ITEM');
                    await db.execute(
                        `INSERT INTO invoice_items (id, invoice_id, product_id, quantity, price, cost_price) 
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [itemId, invoiceId, item.productId, item.qty, item.price, item.costPrice]
                    );
                }

                // Store invoice info for later use in returns
                if (i < 3) {
                    // We'll create returns for first 3 invoices
                    const returnId = genId('RET');
                    const returnNo = `RET-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(i + 1).padStart(3, '0')}`;
                    const returnItem = items[0]; // Return first item only
                    const returnAmount = returnItem.price * 1; // Return quantity of 1

                    await db.execute(
                        `INSERT INTO sales_returns (id, return_no, invoice_id, return_date, reason, total_amount, notes, status, created_at, updated_at) 
                         VALUES ($1, $2, $3, datetime('now'), 'customer_request', $4, 'Sample return for testing', 'completed', datetime('now'), datetime('now'))`,
                        [returnId, returnNo, invoiceId, returnAmount]
                    );

                    // Create return item
                    const returnItemId = genId('RI');
                    await db.execute(
                        `INSERT INTO return_items (id, return_id, product_id, quantity, rate, line_total) 
                         VALUES ($1, $2, $3, 1, $4, $4)`,
                        [returnItemId, returnId, returnItem.productId, returnItem.price]
                    );

                    // Increase product stock (return adds stock back)
                    await db.execute(
                        `UPDATE products SET quantity = quantity + 1 WHERE id = $1`,
                        [returnItem.productId]
                    );
                }
            }

            toast.success("Database Seeded", `Created ${productNames.length} products, 15 invoices, and 3 sample returns`);
        } catch (error) {
            console.error("Seed error:", error);
            toast.error("Seed Failed", error instanceof Error ? error.message : "Could not seed database");
        } finally {
            setSeeding(false);
        }
    };

    const handleClearDatabase = async () => {
        setClearConfirm(false);
        setClearing(true);
        try {
            if (!isTauriRuntime()) {
                throw new Error("Clear only works in desktop app");
            }

            const db = await getDb();

            // Clear all data tables (keep settings and backup_log)
            await db.execute("DELETE FROM return_items");
            await db.execute("DELETE FROM sales_returns");
            await db.execute("DELETE FROM invoice_items");
            await db.execute("DELETE FROM invoices");
            await db.execute("DELETE FROM stock_adjustments");
            await db.execute("DELETE FROM products");

            toast.success("Database Cleared", "All products, invoices, returns, and stock adjustments have been deleted");
        } catch (error) {
            console.error(error);
            toast.error("Clear Failed", error instanceof Error ? error.message : "Could not clear database");
        } finally {
            setClearing(false);
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

                {activeTab === "developer" && (
                    <div className="space-y-8 max-w-2xl">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800 mb-2">Developer Tools</h3>
                            <p className="text-sm text-slate-500 mb-6">These tools are for development and testing purposes only.</p>

                            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mb-6">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-blue-100 rounded-xl text-blue-600">
                                        <Wand2 size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-blue-900 mb-2">Seed Sample Data</h4>
                                        <p className="text-sm text-blue-800 mb-4">
                                            Populate the database with sample products, invoices, and related data for testing all features.
                                        </p>
                                        <Button
                                            onClick={() => setSeedConfirm(true)}
                                            isLoading={seeding}
                                            leftIcon={<Database size={18} />}
                                            className="bg-blue-600 hover:bg-blue-700"
                                        >
                                            Seed Database
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-red-100 rounded-xl text-red-600">
                                        <AlertTriangle size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-red-900 mb-2">Danger Zone</h4>
                                        <p className="text-sm text-red-800 mb-4">
                                            This will permanently delete all products, invoices, sales returns, and stock adjustments. Settings and backups will be preserved.
                                        </p>
                                        <Button
                                            onClick={() => setClearConfirm(true)}
                                            isLoading={clearing}
                                            leftIcon={<Trash2 size={18} />}
                                            className="bg-red-600 hover:bg-red-700"
                                        >
                                            Clear All Data
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Seed Confirmation Modal */}
            <ConfirmModal
                isOpen={seedConfirm}
                onClose={() => setSeedConfirm(false)}
                onConfirm={handleSeedDatabase}
                title="Seed Database?"
                message="This will add sample products, invoices, and related data to your database. Existing data will NOT be deleted. Continue?"
                confirmText="Yes, Seed Data"
                variant="info"
            />

            {/* Clear Confirmation Modal */}
            <ConfirmModal
                isOpen={clearConfirm}
                onClose={() => setClearConfirm(false)}
                onConfirm={handleClearDatabase}
                title="Clear All Data?"
                message="This will PERMANENTLY DELETE all products, invoices, sales returns, and stock adjustments. This action cannot be undone. Are you absolutely sure?"
                confirmText="Yes, Delete Everything"
                variant="danger"
            />
        </div>
    );
};
