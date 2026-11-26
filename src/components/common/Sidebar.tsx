import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePOS } from '../../context/POSContext';
import {
  Store,
  LayoutGrid,
  Coins,
  Package,
  ReceiptText,
  PiggyBank,
  ChefHat,
  TrendingUp,
  FileSpreadsheet,
  Lock,
  Settings,
} from 'lucide-react';

export type NavTab =
  | 'pos'
  | 'tables'
  | 'cash'
  | 'inventory'
  | 'purchases'
  | 'expenses'
  | 'recipes'
  | 'dashboard'
  | 'audit'
  | 'config';

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { isAdmin } = useAuth();
  const { hasOpenCashRegister } = usePOS();

  const standardNavItems: {
    id: NavTab;
    label: string;
    icon: React.ElementType;
    badge?: number | string;
    badgeColor?: string;
  }[] = [
    {
      id: 'pos',
      label: 'Punto de Venta',
      icon: Store,
    },
    { id: 'tables', label: 'Mesas & Barra', icon: LayoutGrid },
    {
      id: 'cash',
      label: 'Caja General',
      icon: Coins,
      badge: !hasOpenCashRegister ? 'Cerrada' : undefined,
      badgeColor: 'bg-red-100 text-red-700',
    },
  ];

  const adminNavItems: { id: NavTab; label: string; icon: React.ElementType; tag?: string }[] = [
    { id: 'inventory', label: 'Inventario', icon: Package },
    { id: 'purchases', label: 'Compras & CxP', icon: ReceiptText, tag: 'IA' },
    { id: 'expenses', label: 'Gastos Operativos', icon: PiggyBank },
    { id: 'recipes', label: 'Recetas & Costos', icon: ChefHat },
    { id: 'dashboard', label: 'Dashboard Financiero', icon: TrendingUp },
    { id: 'audit', label: 'Auditoría & Usuarios', icon: FileSpreadsheet },
    { id: 'config', label: 'Configuración', icon: Settings },
  ];

  return (
    <aside className="w-full md:w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 select-none">
      <nav className="p-3 space-y-1 overflow-y-auto">
        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-3 mb-1">
          Operación Diaria
        </div>

        {standardNavItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl font-medium text-sm transition cursor-pointer ${
                isActive
                  ? 'bg-red-50 text-red-700 font-bold shadow-xs'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 ${isActive ? 'text-red-600' : 'text-gray-500'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span
                  className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                    item.badgeColor || 'bg-red-600 text-white'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Administration Section */}
        <div className="pt-4 pb-1">
          <div className="flex items-center justify-between px-3 mb-1">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Administración
            </span>
            {!isAdmin && (
              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md flex items-center gap-1 font-semibold">
                <Lock className="w-2.5 h-2.5" />
                Solo Admin
              </span>
            )}
          </div>
        </div>

        {adminNavItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isLocked = !isAdmin;

          return (
            <button
              key={item.id}
              disabled={isLocked}
              onClick={() => !isLocked && setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-sm transition ${
                isLocked
                  ? 'opacity-40 cursor-not-allowed text-gray-400'
                  : isActive
                    ? 'bg-red-50 text-red-700 font-bold shadow-xs cursor-pointer'
                    : 'text-gray-700 hover:bg-gray-100 cursor-pointer'
              }`}
              title={isLocked ? 'Restringido: Requiere rol de Administrador' : undefined}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 ${isActive ? 'text-red-600' : 'text-gray-500'}`} />
                <span>{item.label}</span>
              </div>
              {item.tag && (
                <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded-md">
                  {item.tag}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto p-4 border-t border-gray-100 bg-gray-50 text-xs text-gray-500 flex items-center justify-between">
        <div>
          <span className="font-bold text-gray-700">Pollos Karen POS</span>
          <div>La Uruca • v3.0</div>
        </div>
        <div
          className={`w-2.5 h-2.5 rounded-full ${hasOpenCashRegister ? 'bg-emerald-500' : 'bg-amber-500'}`}
          title={hasOpenCashRegister ? 'Caja Abierta' : 'Caja Cerrada'}
        />
      </div>
    </aside>
  );
};
