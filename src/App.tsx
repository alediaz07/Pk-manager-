import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { POSProvider } from './context/POSContext';
import { LoginView } from './components/auth/LoginView';
import { Header } from './components/common/Header';
import { Sidebar, NavTab } from './components/common/Sidebar';
import { POSView } from './components/pos/POSView';
import { TablesView } from './components/tables/TablesView';
import { CashRegisterView } from './components/cash/CashRegisterView';
import { InventoryView } from './components/inventory/InventoryView';
import { PurchasesView } from './components/purchases/PurchasesView';
import { ExpensesView } from './components/expenses/ExpensesView';
import { RecipesView } from './components/recipes/RecipesView';
import { DashboardView } from './components/dashboard/DashboardView';
import { AuditView } from './components/audit/AuditView';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { currentUser, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('pos');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <div className="w-14 h-14 rounded-2xl bg-red-600 flex items-center justify-center shadow-lg p-2.5 mb-4">
          <img src="/icon.svg" alt="Pollos Karen" className="w-full h-full object-contain" />
        </div>
        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
          <Loader2 className="w-4 h-4 animate-spin text-red-600" />
          <span>Verificando credenciales de Pollos Karen...</span>
        </div>
      </div>
    );
  }

  // Strictly enforce authentication: no access without signing in
  if (!currentUser) {
    return <LoginView />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-100 font-sans antialiased text-gray-900 select-none">
      <Header />
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'pos' && <POSView />}
          {activeTab === 'tables' && (
            <TablesView onOpenPOSForTable={() => setActiveTab('pos')} />
          )}
          {activeTab === 'cash' && <CashRegisterView />}
          {activeTab === 'inventory' && <InventoryView />}
          {activeTab === 'purchases' && <PurchasesView />}
          {activeTab === 'expenses' && <ExpensesView />}
          {activeTab === 'recipes' && <RecipesView />}
          {activeTab === 'dashboard' && <DashboardView />}
          {activeTab === 'audit' && <AuditView />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <POSProvider>
        <AppContent />
      </POSProvider>
    </AuthProvider>
  );
}
