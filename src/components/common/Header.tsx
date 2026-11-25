import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePOS } from '../../context/POSContext';
import { PWAInstallButton } from './PWAInstallButton';
import { formatCRC } from '../../utils/formatters';
import {
  Shield,
  UserCheck,
  Wifi,
  WifiOff,
  Coins,
  Clock,
  LogOut,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';

export const Header: React.FC = () => {
  const { appUser, role, isAdmin, logout } = useAuth();
  const { cashRegister, isOnline, pendingOfflineCount, syncOfflineQueue } = usePOS();

  const [crTime, setCrTime] = useState<string>('');
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCrTime(
        now.toLocaleTimeString('es-CR', {
          timeZone: 'America/Costa_Rica',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-red-600 text-white shadow-md border-b border-red-700 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-md p-1">
            <img src="/icon.svg" alt="Pollos Karen" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-wide uppercase">Pollos Karen</span>
              <span className="text-[11px] bg-red-800 text-red-100 font-semibold px-2 py-0.5 rounded-full border border-red-700 hidden sm:inline-block">
                POS Costa Rica
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-red-100">
              <Clock className="w-3.5 h-3.5 opacity-80" />
              <span>{crTime || 'Cargando hora CR...'}</span>
              <span className="text-red-300">•</span>
              <span>Caja #{cashRegister.date}</span>
            </div>
          </div>
        </div>

        {/* Center / Stats (Tablet & Desktop) */}
        <div className="hidden md:flex items-center gap-3">
          {/* Cash Drawer Status */}
          <div className="flex items-center gap-2 bg-red-700/80 px-3 py-1.5 rounded-xl border border-red-500/40 text-xs font-medium">
            <Coins className="w-4 h-4 text-amber-300" />
            <div>
              <div className="text-[10px] text-red-200 leading-none">Efectivo en Caja</div>
              <div className="font-bold text-amber-200">{formatCRC(cashRegister.expectedCash)}</div>
            </div>
          </div>

          {/* Network & Offline Status */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold ${
              isOnline ? 'bg-emerald-600/90 text-white' : 'bg-amber-500 text-gray-950 animate-pulse'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isOnline ? 'En línea' : 'Sin conexión (Offline)'}</span>
            {pendingOfflineCount > 0 && (
              <button
                onClick={syncOfflineQueue}
                className="ml-1 bg-white text-gray-900 px-1.5 py-0.5 rounded-md text-[10px] flex items-center gap-1 hover:bg-gray-100"
                title="Sincronizar órdenes pendientes"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                <span>{pendingOfflineCount}</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Actions & User Profile */}
        <div className="flex items-center gap-2">
          <PWAInstallButton />

          {/* Real Role Indicator */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm border ${
                isAdmin
                  ? 'bg-amber-400 text-amber-950 border-amber-300 hover:bg-amber-300'
                  : 'bg-white text-red-700 border-white hover:bg-red-50'
              }`}
            >
              {isAdmin ? <Shield className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
              <span className="capitalize">{role === 'admin' ? 'Administrador' : 'Colaborador'}</span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2.5 text-gray-800 z-50 text-xs">
                <div className="px-2.5 py-2 border-b border-gray-100 mb-2">
                  <div className="font-bold text-gray-900">{appUser?.displayName || 'Usuario'}</div>
                  <div className="text-[11px] text-gray-500 truncate">{appUser?.email}</div>
                  <div className="mt-1">
                    <span
                      className={`inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                        isAdmin ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-900'
                      }`}
                    >
                      Rol Verificado: {role === 'admin' ? 'Administrador' : 'Colaborador'}
                    </span>
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      logout();
                    }}
                    className="w-full text-left px-2.5 py-2 text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2 font-bold cursor-pointer transition"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Cerrar Sesión Segura</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
