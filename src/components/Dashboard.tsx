import {
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    BarChart3,
    Calendar,
    DollarSign,
    Package,
    RotateCcw,
    ShoppingCart,
    TrendingUp
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { invoiceService } from "../db/invoiceService";
import { returnsService } from "../db/returnsService";
import { useInvoices, useProducts } from "../hooks";
import { Invoice } from "../types";
import { Card } from "./ui";

interface DashboardProps {
    onNavigate: (tab: string) => void;
}

interface DashboardStats {
    todaySales: number;
    todayInvoices: number;
    yesterdaySales: number;
    yesterdayInvoices: number;
    thisWeekSales: number;
    thisMonthSales: number;
    lastMonthSales: number;
    totalProducts: number;
    lowStockCount: number;
    outOfStockCount: number;
    inventoryValue: number;
    inventoryCostValue: number;
    todayReturns: number;
    todayReturnAmount: number;
}

// Simple animated counter component
const AnimatedCounter: React.FC<{ value: number; prefix?: string; suffix?: string; decimals?: number }> = ({
    value, prefix = "", suffix = "", decimals = 0
}) => {
    const [displayValue, setDisplayValue] = useState(0);
    const previousValueRef = React.useRef(0);

    useEffect(() => {
        const duration = 1000;
        const startTime = Date.now();
        const startValue = previousValueRef.current;
        let animationId: number;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Easing function for smooth animation
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const newValue = startValue + (value - startValue) * easeOut;
            setDisplayValue(newValue);

            if (progress < 1) {
                animationId = requestAnimationFrame(animate);
            } else {
                previousValueRef.current = value;
            }
        };

        animationId = requestAnimationFrame(animate);
        
        // Cleanup: cancel animation on unmount or value change
        return () => {
            if (animationId) {
                cancelAnimationFrame(animationId);
            }
        };
    }, [value]);

    return (
        <span>
            {prefix}
            {decimals > 0 ? displayValue.toFixed(decimals) : Math.round(displayValue).toLocaleString()}
            {suffix}
        </span>
    );
};

// Simple bar chart component
const SimpleBarChart: React.FC<{
    data: { label: string; value: number; color?: string }[];
    height?: number;
    animated?: boolean;
}> = ({ data, height = 120, animated = true }) => {
    const [animationProgress, setAnimationProgress] = useState(animated ? 0 : 1);

    useEffect(() => {
        if (!animated) return;

        const duration = 800;
        const startTime = Date.now();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            setAnimationProgress(easeOut);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [animated, data]);

    const maxValue = Math.max(...data.map(d => d.value), 1);

    return (
        <div className="flex items-end justify-between gap-2" style={{ height }}>
            {data.map((item, index) => {
                const barHeight = (item.value / maxValue) * height * animationProgress;
                return (
                    <div key={index} className="flex flex-col items-center flex-1 gap-1">
                        <div
                            className="w-full rounded-t-lg transition-all duration-300"
                            style={{
                                height: barHeight,
                                backgroundColor: item.color || '#6366f1',
                                minHeight: item.value > 0 ? 4 : 0
                            }}
                        />
                        <span className="text-xs text-slate-500 font-medium truncate w-full text-center">
                            {item.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

// Donut chart for category distribution
const DonutChart: React.FC<{
    data: { label: string; value: number; color: string }[];
    size?: number;
}> = ({ data, size = 140 }) => {
    const [animationProgress, setAnimationProgress] = useState(0);
    const total = data.reduce((sum, d) => sum + d.value, 0);
    const strokeWidth = 24;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;

    useEffect(() => {
        const duration = 1000;
        const startTime = Date.now();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            setAnimationProgress(easeOut);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [data]);

    let currentOffset = 0;

    return (
        <div className="flex flex-col items-center gap-3">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="transform -rotate-90">
                    {data.map((item, index) => {
                        const percentage = total > 0 ? (item.value / total) * 100 : 0;
                        const strokeDasharray = `${(percentage * animationProgress / 100) * circumference} ${circumference}`;
                        const strokeDashoffset = -currentOffset * circumference / 100;
                        currentOffset += percentage * animationProgress;

                        return (
                            <circle
                                key={index}
                                cx={size / 2}
                                cy={size / 2}
                                r={radius}
                                fill="none"
                                stroke={item.color}
                                strokeWidth={strokeWidth}
                                strokeDasharray={strokeDasharray}
                                strokeDashoffset={strokeDashoffset}
                                className="transition-all duration-300"
                            />
                        );
                    })}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                        <div className="text-xl font-bold text-slate-800">{total}</div>
                        <div className="text-xs text-slate-500">Total</div>
                    </div>
                </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
                {data.map((item, index) => (
                    <div key={index} className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-xs text-slate-600">{item.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
    const { products, loading: productsLoading } = useProducts();
    const { invoices, loading: invoicesLoading } = useInvoices();
    const [returnStats, setReturnStats] = useState({ todayReturns: 0, todayAmount: 0 });
    const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
    const [profitStats, setProfitStats] = useState({
        todayProfit: 0,
        todayRevenue: 0,
        todayCost: 0,
        thisMonthProfit: 0,
        thisMonthRevenue: 0,
        thisMonthCost: 0,
        yesterdayProfit: 0,
        lastMonthProfit: 0,
    });

    // Load profit stats
    useEffect(() => {
        const loadProfitStats = async () => {
            try {
                const stats = await invoiceService.getProfitStats();
                setProfitStats(stats);
            } catch (error) {
                console.error("Failed to load profit stats:", error);
            }
        };
        loadProfitStats();
    }, [invoices]);

    // Load return stats
    useEffect(() => {
        const loadReturnStats = async () => {
            try {
                const stats = await returnsService.getStats();
                setReturnStats(stats);
            } catch (error) {
                console.error("Failed to load return stats:", error);
            }
        };
        loadReturnStats();
    }, []);

    // Get recent invoices
    useEffect(() => {
        const loadRecentInvoices = async () => {
            try {
                const all = await invoiceService.getAll();
                setRecentInvoices(all.slice(0, 5));
            } catch (error) {
                console.error("Failed to load recent invoices:", error);
            }
        };
        loadRecentInvoices();
    }, [invoices]);

    // Calculate stats
    const stats = useMemo<DashboardStats>(() => {
        const now = new Date();
        const today = now.toDateString();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString();

        // Calculate week start (Sunday)
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);

        // Calculate month start
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

        // Invoice stats
        let todaySales = 0;
        let todayInvoices = 0;
        let yesterdaySales = 0;
        let yesterdayInvoices = 0;
        let thisWeekSales = 0;
        let thisMonthSales = 0;
        let lastMonthSales = 0;

        for (const inv of invoices) {
            const invDate = new Date(inv.created_at);
            const invDateStr = invDate.toDateString();
            const amount = inv.total_amount || 0;

            if (invDateStr === today) {
                todaySales += amount;
                todayInvoices++;
            }
            if (invDateStr === yesterday) {
                yesterdaySales += amount;
                yesterdayInvoices++;
            }
            if (invDate >= weekStart) {
                thisWeekSales += amount;
            }
            if (invDate >= monthStart) {
                thisMonthSales += amount;
            }
            if (invDate >= lastMonthStart && invDate <= lastMonthEnd) {
                lastMonthSales += amount;
            }
        }

        // Product stats
        const totalProducts = products.length;
        const lowStockCount = products.filter(p => p.quantity > 0 && p.quantity <= (p.reorder_level || 5)).length;
        const outOfStockCount = products.filter(p => p.quantity <= 0).length;
        const inventoryValue = products.reduce((sum, p) => sum + (p.price * p.quantity), 0);
        const inventoryCostValue = products.reduce((sum, p) => sum + ((p.purchase_price ?? 0) * p.quantity), 0);

        return {
            todaySales,
            todayInvoices,
            yesterdaySales,
            yesterdayInvoices,
            thisWeekSales,
            thisMonthSales,
            lastMonthSales,
            totalProducts,
            lowStockCount,
            outOfStockCount,
            inventoryValue,
            inventoryCostValue,
            todayReturns: returnStats.todayReturns,
            todayReturnAmount: returnStats.todayAmount,
        };
    }, [invoices, products, returnStats]);

    // Calculate percentage change
    const getChangePercent = (current: number, previous: number): { value: string; positive: boolean } => {
        if (previous === 0) {
            return current > 0 ? { value: "+100%", positive: true } : { value: "0%", positive: true };
        }
        const change = ((current - previous) / previous) * 100;
        const sign = change >= 0 ? "+" : "";
        return {
            value: `${sign}${change.toFixed(0)}%`,
            positive: change >= 0,
        };
    };

    const profitChange = getChangePercent(profitStats.todayProfit, profitStats.yesterdayProfit);
    const monthProfitChange = getChangePercent(profitStats.thisMonthProfit, profitStats.lastMonthProfit);

    const salesChange = getChangePercent(stats.todaySales, stats.yesterdaySales);
    const invoiceChange = getChangePercent(stats.todayInvoices, stats.yesterdayInvoices);
    const monthChange = getChangePercent(stats.thisMonthSales, stats.lastMonthSales);

    // Low stock items
    const lowStockItems = useMemo(() => {
        return products
            .filter(p => p.quantity > 0 && p.quantity <= (p.reorder_level || 5))
            .sort((a, b) => a.quantity - b.quantity)
            .slice(0, 5);
    }, [products]);

    // Category distribution for chart
    const categoryData = useMemo(() => {
        const categoryMap = new Map<string, number>();
        for (const p of products) {
            const cat = p.category || "Uncategorized";
            categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
        }
        const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
        return Array.from(categoryMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([label, value], index) => ({
                label,
                value,
                color: colors[index % colors.length]
            }));
    }, [products]);

    // Weekly sales data for bar chart
    const weeklySalesData = useMemo(() => {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const now = new Date();
        const weekData = new Array(7).fill(0);

        for (const inv of invoices) {
            const invDate = new Date(inv.created_at);
            const diffDays = Math.floor((now.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays < 7) {
                const dayIndex = invDate.getDay();
                weekData[dayIndex] += inv.total_amount || 0;
            }
        }

        // Reorder to start from current day - 6 to current day
        const todayIndex = now.getDay();
        const result = [];
        for (let i = 6; i >= 0; i--) {
            const index = (todayIndex - i + 7) % 7;
            result.push({
                label: days[index],
                value: weekData[index],
                color: index === todayIndex ? '#6366f1' : '#94a3b8'
            });
        }

        return result;
    }, [invoices]);

    // Stock health data
    const stockHealthData = useMemo(() => {
        const healthy = products.filter(p => p.quantity > (p.reorder_level || 5)).length;
        const low = products.filter(p => p.quantity > 0 && p.quantity <= (p.reorder_level || 5)).length;
        const out = products.filter(p => p.quantity <= 0).length;

        return [
            { label: "Healthy", value: healthy, color: "#22c55e" },
            { label: "Low", value: low, color: "#f59e0b" },
            { label: "Out", value: out, color: "#ef4444" },
        ];
    }, [products]);

    const formatCurrency = (amount: number): string => {
        if (amount >= 100000) {
            return `₹${(amount / 100000).toFixed(1)}L`;
        }
        if (amount >= 1000) {
            return `₹${(amount / 1000).toFixed(1)}K`;
        }
        return `₹${amount.toLocaleString()}`;
    };

    const formatTime = (dateStr: string): string => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);

        if (seconds < 60) return "Just now";
        if (minutes < 60) return `${minutes} min ago`;
        if (hours < 24) return `${hours} hr ago`;
        return date.toLocaleDateString();
    };

    if (productsLoading || invoicesLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
            <div className="space-y-6 pr-2">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
                    <p className="text-slate-500">Overview of your business performance</p>
                </div>

                {/* Main Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="p-4 border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-500">Today's Sales</p>
                                <h3 className="text-2xl font-bold text-slate-800 mt-1">
                                    <AnimatedCounter value={stats.todaySales} prefix="₹" />
                                </h3>
                            </div>
                            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                <DollarSign size={20} />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center text-xs">
                            <span className={`font-medium flex items-center ${salesChange.positive ? 'text-emerald-600' : 'text-red-500'}`}>
                                {salesChange.value}
                                {salesChange.positive ? <ArrowUpRight size={12} className="ml-0.5" /> : <ArrowDownRight size={12} className="ml-0.5" />}
                            </span>
                            <span className="text-slate-400 ml-2">from yesterday</span>
                        </div>
                    </Card>

                    <Card className="p-4 border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-500">Today's Invoices</p>
                                <h3 className="text-2xl font-bold text-slate-800 mt-1">
                                    <AnimatedCounter value={stats.todayInvoices} />
                                </h3>
                            </div>
                            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                <ShoppingCart size={20} />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center text-xs">
                            <span className={`font-medium flex items-center ${invoiceChange.positive ? 'text-emerald-600' : 'text-red-500'}`}>
                                {invoiceChange.value}
                                {invoiceChange.positive ? <ArrowUpRight size={12} className="ml-0.5" /> : <ArrowDownRight size={12} className="ml-0.5" />}
                            </span>
                            <span className="text-slate-400 ml-2">from yesterday ({stats.yesterdayInvoices})</span>
                        </div>
                    </Card>

                    <Card className="p-4 border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-500">Total Products</p>
                                <h3 className="text-2xl font-bold text-slate-800 mt-1">
                                    <AnimatedCounter value={stats.totalProducts} />
                                </h3>
                            </div>
                            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                                <Package size={20} />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center text-xs">
                            <span className="text-amber-500 font-medium">{stats.lowStockCount} low stock</span>
                            <span className="text-slate-300 mx-2">•</span>
                            <span className="text-red-500 font-medium">{stats.outOfStockCount} out</span>
                            <button
                                onClick={() => onNavigate("stock")}
                                className="ml-auto text-indigo-600 hover:text-indigo-700 font-medium"
                            >
                                View →
                            </button>
                        </div>
                    </Card>

                    <Card className="p-4 border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-500">Monthly Revenue</p>
                                <h3 className="text-2xl font-bold text-slate-800 mt-1">
                                    <AnimatedCounter value={stats.thisMonthSales} prefix="₹" />
                                </h3>
                            </div>
                            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                                <TrendingUp size={20} />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center text-xs">
                            <span className={`font-medium flex items-center ${monthChange.positive ? 'text-emerald-600' : 'text-red-500'}`}>
                                {monthChange.value}
                                {monthChange.positive ? <ArrowUpRight size={12} className="ml-0.5" /> : <ArrowDownRight size={12} className="ml-0.5" />}
                            </span>
                            <span className="text-slate-400 ml-2">vs last month</span>
                        </div>
                    </Card>
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Weekly Sales Chart */}
                    <Card className="p-5 border-slate-100 shadow-sm">
                        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                            <BarChart3 size={18} className="text-indigo-500" />
                            Last 7 Days Sales
                        </h3>
                        <SimpleBarChart data={weeklySalesData} height={100} />
                    </Card>

                    {/* Stock Health Donut */}
                    <Card className="p-5 border-slate-100 shadow-sm">
                        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                            <Package size={18} className="text-purple-500" />
                            Stock Health
                        </h3>
                        {products.length > 0 ? (
                            <DonutChart data={stockHealthData} size={120} />
                        ) : (
                            <div className="flex items-center justify-center h-32 text-slate-400">
                                <p>No products yet</p>
                            </div>
                        )}
                    </Card>

                    {/* Category Distribution */}
                    <Card className="p-5 border-slate-100 shadow-sm">
                        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                            <Package size={18} className="text-teal-500" />
                            By Category
                        </h3>
                        {categoryData.length > 0 ? (
                            <DonutChart data={categoryData} size={120} />
                        ) : (
                            <div className="flex items-center justify-center h-32 text-slate-400">
                                <p>No categories yet</p>
                            </div>
                        )}
                    </Card>
                </div>

                {/* Secondary Stats Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="p-4 border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-500">Today's Profit</p>
                                <h3 className={`text-2xl font-bold mt-1 ${profitStats.todayProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    <AnimatedCounter value={profitStats.todayProfit} prefix="₹" />
                                </h3>
                            </div>
                            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                <TrendingUp size={20} />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center text-xs">
                            <span className={`font-medium flex items-center ${profitChange.positive ? 'text-emerald-600' : 'text-red-500'}`}>
                                {profitChange.value}
                                {profitChange.positive ? <ArrowUpRight size={12} className="ml-0.5" /> : <ArrowDownRight size={12} className="ml-0.5" />}
                            </span>
                            <span className="text-slate-400 ml-2">vs yesterday</span>
                        </div>
                    </Card>

                    <Card className="p-4 border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-500">Monthly Profit</p>
                                <h3 className={`text-2xl font-bold mt-1 ${profitStats.thisMonthProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    <AnimatedCounter value={profitStats.thisMonthProfit} prefix="₹" />
                                </h3>
                            </div>
                            <div className="p-2 rounded-lg bg-teal-500/10 text-teal-500">
                                <BarChart3 size={20} />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center text-xs">
                            <span className={`font-medium flex items-center ${monthProfitChange.positive ? 'text-emerald-600' : 'text-red-500'}`}>
                                {monthProfitChange.value}
                                {monthProfitChange.positive ? <ArrowUpRight size={12} className="ml-0.5" /> : <ArrowDownRight size={12} className="ml-0.5" />}
                            </span>
                            <span className="text-slate-400 ml-2">vs last month</span>
                        </div>
                    </Card>

                    <Card className="p-4 border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                            <Package size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500 font-medium">Inventory Cost</p>
                            <h3 className="text-xl font-bold text-slate-800">
                                <AnimatedCounter value={stats.inventoryCostValue} prefix="₹" />
                            </h3>
                            <p className="text-xs text-slate-400">Sell value: {formatCurrency(stats.inventoryValue)}</p>
                        </div>
                    </Card>

                    <Card className="p-4 border-slate-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5">
                        <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                            <RotateCcw size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500 font-medium">Today's Returns</p>
                            <h3 className="text-xl font-bold text-slate-800">
                                <AnimatedCounter value={stats.todayReturns} /> <span className="text-sm font-normal text-slate-400">({formatCurrency(stats.todayReturnAmount)})</span>
                            </h3>
                        </div>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Recent Transactions */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-slate-800">Recent Transactions</h2>
                            <button onClick={() => onNavigate("invoices")} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                                View All →
                            </button>
                        </div>
                        <Card className="divide-y divide-slate-100 border-slate-100 shadow-sm">
                            {recentInvoices.length === 0 ? (
                                <div className="p-8 text-center text-slate-500">
                                    <ShoppingCart size={32} className="mx-auto mb-2 text-slate-300" />
                                    <p>No transactions yet</p>
                                    <button
                                        onClick={() => onNavigate("billing")}
                                        className="mt-2 text-indigo-600 hover:text-indigo-700 font-medium"
                                    >
                                        Create your first invoice →
                                    </button>
                                </div>
                            ) : (
                                recentInvoices.map((inv, index) => (
                                    <div
                                        key={inv.id}
                                        className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors animate-in slide-in-from-left duration-300"
                                        style={{ animationDelay: `${index * 50}ms` }}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-100 text-blue-600">
                                                <ShoppingCart size={18} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-800">
                                                    Invoice #{inv.id.slice(0, 8).toUpperCase()}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {inv.customer_name || "Walking Customer"} • {formatTime(inv.created_at)}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-sm font-semibold text-slate-700">₹{inv.total_amount.toLocaleString()}</span>
                                    </div>
                                ))
                            )}
                        </Card>
                    </div>

                    {/* Sidebar: Quick Actions + Low Stock */}
                    <div className="space-y-6">
                        {/* Quick Actions */}
                        <div className="space-y-4">
                            <h2 className="text-lg font-semibold text-slate-800">Quick Actions</h2>
                            <div className="grid grid-cols-1 gap-3">
                                <button
                                    onClick={() => onNavigate("billing")}
                                    className="p-4 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-between group"
                                >
                                    <span className="font-semibold">New Invoice</span>
                                    <ArrowUpRight size={20} className="opacity-70 group-hover:opacity-100 transition-opacity" />
                                </button>
                                <button
                                    onClick={() => onNavigate("stock")}
                                    className="p-4 bg-white border border-slate-200 text-slate-700 rounded-xl hover:border-indigo-300 hover:text-indigo-600 hover:shadow-md transition-all flex items-center justify-between group"
                                >
                                    <span className="font-medium">Add Product</span>
                                    <Package size={20} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                                </button>
                                <button
                                    onClick={() => onNavigate("reports")}
                                    className="p-4 bg-white border border-slate-200 text-slate-700 rounded-xl hover:border-indigo-300 hover:text-indigo-600 hover:shadow-md transition-all flex items-center justify-between group"
                                >
                                    <span className="font-medium">View Reports</span>
                                    <TrendingUp size={20} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                                </button>
                            </div>
                        </div>

                        {/* Low Stock Alert */}
                        {lowStockItems.length > 0 && (
                            <div className="space-y-4">
                                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                                    <AlertTriangle size={18} className="text-amber-500" />
                                    Low Stock Alert
                                </h2>
                                <Card className="divide-y divide-slate-100 border-amber-200 bg-amber-50/30">
                                    {lowStockItems.map((item, index) => (
                                        <div
                                            key={item.id}
                                            className="p-3 flex items-center justify-between animate-in slide-in-from-right duration-300"
                                            style={{ animationDelay: `${index * 50}ms` }}
                                        >
                                            <div>
                                                <p className="text-sm font-medium text-slate-800 truncate max-w-45">{item.name}</p>
                                                <p className="text-xs text-slate-500">{item.category || "Uncategorized"}</p>
                                            </div>
                                            <span className={`text-sm font-bold ${item.quantity <= 2 ? 'text-red-600' : 'text-amber-600'}`}>
                                                {item.quantity} left
                                            </span>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => onNavigate("stock")}
                                        className="w-full p-3 text-center text-sm text-amber-700 hover:bg-amber-100 transition-colors font-medium"
                                    >
                                        View All Low Stock Items →
                                    </button>
                                </Card>
                            </div>
                        )}

                        {/* Weekly Summary */}
                        <Card className="p-4 border-slate-100 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <Calendar size={18} className="text-indigo-500" />
                                <h3 className="font-semibold text-slate-800">This Week</h3>
                            </div>
                            <div className="text-2xl font-bold text-indigo-600">
                                <AnimatedCounter value={stats.thisWeekSales} prefix="₹" />
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Total sales this week</p>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
};
