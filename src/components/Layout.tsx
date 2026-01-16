import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingCart,
  WifiOff
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { UserSession } from "../types";
import { Button } from "./ui";

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  session: UserSession;
  onLogout: () => void;
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Overview & Stats" },
  { id: "billing", label: "Billing", icon: ShoppingCart, description: "Create invoices & bill" },
  { id: "stock", label: "Inventory", icon: Package, description: "Manage products & stock" },
  { id: "returns", label: "Returns", icon: RotateCcw, description: "Process sales returns" },
  { id: "invoices", label: "Transactions", icon: Receipt, description: "View sales history" },
  { id: "reports", label: "Reports", icon: BarChart3, description: "Sales, stock & profit" },
  { id: "settings", label: "Settings", icon: Settings, description: "App configuration", adminOnly: true },
];

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, session, onLogout }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const isAdmin = session.role === "admin";

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar - Midnight Theme */}
      <aside
        className={`
          bg-slate-900 border-r border-slate-800 flex flex-col shadow-xl z-20 transition-all duration-300 relative
          ${sidebarCollapsed ? 'w-20' : 'w-72'}
        `}
      >
        {/* Logo */}
        <div className="p-5 border-b border-slate-800 flex items-center gap-4">
          <img src="/logo.png" alt="MotorMods Logo" className="w-10 h-10 shrink-0 object-contain bg-white rounded-lg p-1.5 shadow-sm" />
          {!sidebarCollapsed && (
            <div className="overflow-hidden">
              <span className="text-lg font-bold text-white tracking-tight block">MotorMods</span>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Billing & Inventory</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
          {navItems
            .filter(item => !('adminOnly' in item && item.adminOnly) || isAdmin)
            .map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`
                  w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative
                  ${isActive
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    }
                `}
                >
                  <div className={`
                  w-6 h-6 flex items-center justify-center shrink-0 transition-colors
                  ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}
                `}>
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  {!sidebarCollapsed && (
                    <div className="text-left overflow-hidden flex-1">
                      <span className={`block font-medium text-sm ${isActive ? 'text-white' : ''}`}>
                        {item.label}
                      </span>
                    </div>
                  )}
                  {isActive && !sidebarCollapsed && (
                    <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
                  )}
                </button>
              );
            })}
        </nav>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-slate-800 space-y-2">
          {/* Backup Option */}
          {isAdmin && (
            <button
              onClick={() => setActiveTab("backups")}
              title={sidebarCollapsed ? "Backups" : undefined}
              className={`
                w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative
                ${activeTab === "backups"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }
              `}
            >
              <div className={`
                w-6 h-6 flex items-center justify-center shrink-0 transition-colors
                ${activeTab === "backups" ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}
              `}>
                <Database size={20} strokeWidth={activeTab === "backups" ? 2.5 : 2} />
              </div>
              {!sidebarCollapsed && (
                <div className="text-left overflow-hidden flex-1">
                  <span className={`block font-medium text-sm ${activeTab === "backups" ? 'text-white' : ''}`}>
                    Backups
                  </span>
                </div>
              )}
            </button>
          )}
        </div>

        {/* Footer Status */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/30">
          <div className={`rounded-xl ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
            {sidebarCollapsed ? (
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)] ${isOnline ? 'bg-emerald-500 shadow-emerald-500/50' : 'bg-amber-500 shadow-amber-500/50'}`}></span>
                    <span className="text-xs font-medium text-slate-300">{isOnline ? 'System Online' : 'Offline Mode'}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">v0.2.0</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  {isOnline ? <HardDrive size={12} /> : <WifiOff size={12} />}
                  <span className="text-[10px]">{isOnline ? 'Local Database' : 'No Connection'}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute top-1/2 -right-3 w-6 h-6 bg-slate-800 border border-slate-700 rounded-full shadow-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-indigo-600 hover:border-indigo-500 transition-all z-30"
          style={{ transform: 'translateY(-50%)' }}
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative bg-slate-50/50">
        {/* Header */}
        <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 flex items-center justify-between px-8 shrink-0 sticky top-0 z-10 transition-all duration-200">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {activeTab === "backups" ? "Backups" : navItems.find(n => n.id === activeTab)?.label}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {activeTab === "backups" ? "Manage database" : navItems.find(n => n.id === activeTab)?.description}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* User Profile Section */}
            <div className="flex items-center gap-3 pl-6 border-l border-slate-200/60">
              <div className="flex flex-col items-end">
                <span className="text-sm font-bold text-slate-800 leading-none">{session.name}</span>
                <span className={`
                  text-[9px] font-bold uppercase tracking-widest mt-1.5 px-2 py-0.5 rounded-md
                  ${isAdmin ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-600'}
                `}>
                  {session.role}
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white text-base font-bold shadow-md ring-2 ring-white transition-transform hover:scale-105 duration-200">
                {session.name.charAt(0).toUpperCase()}
              </div>
            </div>

            {/* Logout Action */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl w-10 h-10 transition-all border border-slate-100 hover:border-rose-200"
              title="Logout"
            >
              <LogOut size={18} />
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-6 scroll-smooth custom-scrollbar">
          <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};
