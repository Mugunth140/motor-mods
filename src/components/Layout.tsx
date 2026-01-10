import {
    BarChart3,
    Bell,
    ChevronLeft, ChevronRight,
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
import { notificationService } from "../db/notificationService";
import { UserSession } from "../types";
import { InboxNotification, ReportIntent } from "../types/notifications";
import { Button, useToast } from "./ui";

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  session: UserSession;
  onLogout: () => void;
  onReportIntent?: (intent: ReportIntent) => void;
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

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, session, onLogout, onReportIntent }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxItems, setInboxItems] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const toast = useToast();
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

  useEffect(() => {
    if (!isAdmin) return;
    try {
      notificationService.checkAndQueuePeriodNotifications();
    } catch {
      // ignore
    }
    refreshInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const refreshInbox = () => {
    try {
      const all = notificationService.getAll();
      setInboxItems(all.slice(0, 20));
      setUnreadCount(notificationService.getUnreadCount());
    } catch {
      setInboxItems([]);
      setUnreadCount(0);
    }
  };

  const openInbox = () => {
    if (!isAdmin) return;
    try {
      notificationService.checkAndQueuePeriodNotifications();
    } catch {
      // ignore
    }
    refreshInbox();
    setInboxOpen(true);
  };

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
          <img src="/logo.png" alt="MotorMods Logo" className="w-10 h-10 shrink-0 object-contain" />
          {!sidebarCollapsed && (
            <div className="overflow-hidden">
              <span className="text-lg font-bold text-white tracking-tight block">MotorMods</span>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Performance Billing</p>
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
                  <span className="text-[10px] text-slate-500 font-mono">v0.1.0</span>
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

          <div className="flex items-center gap-6">
            {/* User Actions Group */}
            <div className="flex items-center p-1.5 bg-white border border-slate-200/80 rounded-full shadow-sm shadow-slate-200/50">
              {/* Notifications */}
              {isAdmin && (
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="relative text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full w-9 h-9 transition-all"
                    onClick={() => {
                      if (inboxOpen) {
                        setInboxOpen(false);
                      } else {
                        openInbox();
                      }
                    }}
                    title="Inbox"
                  >
                    <Bell size={18} />
                    {unreadCount > 0 && (
                      <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
                    )}
                  </Button>

                  {inboxOpen && (
                    <div className="absolute right-0 mt-4 w-80 bg-white border border-slate-100 rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden z-50 ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                      <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                        <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">Notifications</p>
                        <button
                          onClick={() => setInboxOpen(false)}
                          className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
                        >
                          Close
                        </button>
                      </div>

                      <div className="max-h-80 overflow-auto custom-scrollbar">
                        {inboxItems.length === 0 ? (
                          <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
                            <Bell size={20} className="opacity-20" />
                            <p className="text-xs">No new notifications</p>
                          </div>
                        ) : (
                          inboxItems.map((n) => (
                            <button
                              key={n.id}
                              className={
                                "w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors group relative " +
                                (n.read ? "bg-white" : "bg-indigo-50/30")
                              }
                              onClick={() => {
                                notificationService.markRead(n.id);
                                refreshInbox();
                                setInboxOpen(false);
                                if (n.intent && onReportIntent) onReportIntent(n.intent);
                                else if (n.intent) setActiveTab("reports");
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className={`text-sm ${n.read ? 'font-medium text-slate-700' : 'font-bold text-slate-900'}`}>{n.title}</p>
                                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                                </div>
                                {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="w-px h-4 bg-slate-200 mx-1" />

              {/* Profile */}
              <div className="flex items-center gap-3 px-2">
                <div className="text-right hidden md:block">
                  <p className="text-sm font-bold text-slate-800 leading-none">{session.name}</p>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mt-0.5">{session.role}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white text-sm font-bold shadow-md ring-2 ring-white">
                  {session.name.charAt(0).toUpperCase()}
                </div>
              </div>

              {/* Logout */}
              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="ml-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full w-9 h-9 transition-all"
                title="Logout"
              >
                <LogOut size={16} />
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-6 scroll-smooth custom-scrollbar">
          <div className="max-w-7xl mx-auto h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};
