import { useEffect, useState } from "react";
import "./App.css";
import { BackupRestore } from "./components/BackupRestore";
import { Billing } from "./components/Billing";
import { Dashboard } from "./components/Dashboard";
import { InvoicesList } from "./components/InvoicesList";
import { Layout } from "./components/Layout";
import { Login } from "./components/Login";
import { Reports } from "./components/reports/Reports";
import { SalesReturns } from "./components/SalesReturns";
import { Settings } from "./components/Settings";
import { StockManagement } from "./components/StockManagement";
import { ToastProvider } from "./components/ui";
import { WholesaleHub } from "./components/WholesaleHub";
import { backupService } from "./db/backupService";
import { initializeFirebase } from "./db/firebase";
import { useAuthSession } from "./hooks";

function AppContent() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isInitializing, setIsInitializing] = useState(true);
  const { session, login, logout } = useAuthSession();

  useEffect(() => {
    const initApp = async () => {
      try {
        // Initialize Firebase for cloud sync
        const firebaseReady = initializeFirebase();
        if (firebaseReady) {
          console.log("Firebase cloud sync enabled");
        } else {
          console.log("Firebase not configured - running in local-only mode");
        }

        // Production: only check backup, no seeding
        await backupService.checkAndTriggerAutoBackup();
      } catch (error) {
        console.error("Initialization failed:", error);
      } finally {
        setIsInitializing(false);
      }
    };
    initApp();
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard onNavigate={setActiveTab} />;
      case "billing":
        return <Billing onNavigate={setActiveTab} />;
      case "wholesale":
        return <WholesaleHub />;
      case "stock":
        return <StockManagement canEdit={true} canDelete={session?.role === "admin"} />;
      case "returns":
        return <SalesReturns userRole={session?.role} userName={session?.name} />;
      case "invoices":
        return <InvoicesList />;
      case "reports":
        return <Reports />;
      case "backups":
        return <BackupRestore />;
      case "settings":
        return <Settings />;
      default:
        return <Dashboard onNavigate={setActiveTab} />;
    }
  };

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-semibold">Initializing MotorMods...</p>
          <p className="text-sm text-slate-400 mt-1">Loading database and services</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login onLogin={login} />;
  }

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={(tab) => {
        setActiveTab(tab);
      }}
      session={session}
      onLogout={logout}
    >
      {renderContent()}
    </Layout>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;