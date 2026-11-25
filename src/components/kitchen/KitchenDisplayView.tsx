import React, { useState, useEffect, useRef } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { KitchenOrderProjection } from '../../types';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  Flame,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  LogOut,
  Wifi,
  WifiOff,
  Utensils,
  Bike,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';

function playKitchenChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch {
    // Audio playback blocked before user gesture
  }
}

function getElapsedMinutes(iso?: string, nowMs?: number): number {
  if (!iso) return 0;
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor(((nowMs || Date.now()) - start) / 60000));
}

export const KitchenDisplayView: React.FC = () => {
  const { kitchenOrders, updateKitchenOrderStatus, isOnline } = usePOS();
  const { isCocina, appUser, logout } = useAuth();

  const [nowMs, setNowMs] = useState(Date.now());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const prevAuthorizedIdsRef = useRef<Set<string>>(new Set());

  // Tick every 15 seconds for accurate elapsed times
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Detect newly authorized orders and play sound alert
  useEffect(() => {
    const currentAuthorized = kitchenOrders.filter(o => o.operationalStatus === 'authorized');
    const prevIds = prevAuthorizedIdsRef.current;

    if (prevIds.size > 0 && soundEnabled) {
      const hasNew = currentAuthorized.some(o => !prevIds.has(o.orderId));
      if (hasNew) {
        playKitchenChime();
      }
    }
    prevAuthorizedIdsRef.current = new Set(currentAuthorized.map(o => o.orderId));
  }, [kitchenOrders, soundEnabled]);

  // Request Screen Wake Lock when active on kitchen tablet
  useEffect(() => {
    let wakeLock: any = null;
    if (wakeLockActive && 'wakeLock' in navigator) {
      (navigator as any).wakeLock
        .request('screen')
        .then((wl: any) => {
          wakeLock = wl;
        })
        .catch(() => setWakeLockActive(false));
    }
    return () => {
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [wakeLockActive]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fullscreen unavailable in embedded iframe
    }
  };

  const handleTransition = async (orderId: string, nextStatus: 'in_preparation' | 'ready') => {
    setBusyOrderId(orderId);
    try {
      await updateKitchenOrderStatus(orderId, nextStatus);
    } finally {
      setBusyOrderId(null);
    }
  };

  const authorizedOrders = kitchenOrders
    .filter(o => o.operationalStatus === 'authorized')
    .sort((a, b) => (a.authorizedAt || a.createdAt || '').localeCompare(b.authorizedAt || b.createdAt || ''));

  const preparingOrders = kitchenOrders
    .filter(o => o.operationalStatus === 'in_preparation')
    .sort((a, b) =>
      (a.startedAt || a.authorizedAt || a.createdAt || '').localeCompare(
        b.startedAt || b.authorizedAt || b.createdAt || ''
      )
    );

  const readyOrders = kitchenOrders
    .filter(o => o.operationalStatus === 'ready')
    .sort((a, b) => (b.readyAt || b.updatedAt || '').localeCompare(a.readyAt || a.updatedAt || ''))
    .slice(0, 12);

  const renderOrderCard = (order: KitchenOrderProjection, column: 'authorized' | 'prep' | 'ready') => {
    const elapsedMin = getElapsedMinutes(order.authorizedAt || order.createdAt, nowMs);
    const isDelayed = elapsedMin >= 20 && column !== 'ready';
    const isWarning = elapsedMin >= 10 && elapsedMin < 20 && column !== 'ready';

    const borderClass = isDelayed
      ? 'border-red-500 bg-red-950/40'
      : isWarning
        ? 'border-amber-500 bg-amber-950/30'
        : column === 'ready'
          ? 'border-emerald-500/60 bg-emerald-950/30'
          : 'border-slate-700 bg-slate-800/90';

    const ServiceIcon =
      order.serviceType === 'mesa'
        ? Utensils
        : order.serviceType === 'expres'
          ? Bike
          : ShoppingBag;

    return (
      <div
        key={order.orderId}
        className={`rounded-2xl border-2 p-4 shadow-lg transition-all ${borderClass}`}
      >
        <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-700/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-white tracking-tight">
                {order.orderNumber}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-extrabold uppercase ${
                  order.serviceType === 'mesa'
                    ? 'bg-red-600 text-white'
                    : order.serviceType === 'expres'
                      ? 'bg-purple-600 text-white'
                      : 'bg-sky-600 text-white'
                }`}
              >
                <ServiceIcon className="w-3.5 h-3.5" />
                {order.tableName || order.serviceType}
              </span>
            </div>
          </div>

          <div
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black ${
              isDelayed
                ? 'bg-red-600 text-white animate-pulse'
                : isWarning
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-700 text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{elapsedMin} min</span>
          </div>
        </div>

        {/* Items list — STRICTLY ZERO PRICES OR FINANCIAL FIELDS */}
        <ul className="py-3 space-y-2.5">
          {order.items.map(item => (
            <li
              key={item.id}
              className="bg-slate-900/70 rounded-xl px-3 py-2 border border-slate-700/60"
            >
              <div className="flex items-baseline gap-2.5">
                <span className="text-lg font-black text-amber-400 shrink-0">
                  {item.quantity}x
                </span>
                <span className="text-base font-bold text-white leading-snug">{item.name}</span>
              </div>
              {item.selectedProtein && (
                <div className="mt-1 ml-7 inline-block px-2 py-0.5 rounded bg-red-600/30 border border-red-500/60 text-red-200 text-xs font-extrabold uppercase">
                  Proteína: {item.selectedProtein}
                </div>
              )}
              {item.notes && (
                <div className="mt-1 ml-7 text-xs font-semibold text-amber-300 italic">
                  Nota: {item.notes}
                </div>
              )}
            </li>
          ))}
        </ul>

        {order.observations && (
          <div className="mb-3 p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-xs text-amber-200 font-semibold">
            Observaciones: {order.observations}
          </div>
        )}

        {/* Touch Action Button */}
        {column === 'authorized' && (
          <button
            type="button"
            disabled={busyOrderId === order.orderId}
            onClick={() => handleTransition(order.orderId, 'in_preparation')}
            className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-slate-950 font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <Flame className="w-4 h-4" />
            <span>Iniciar Preparación</span>
          </button>
        )}

        {column === 'prep' && (
          <button
            type="button"
            disabled={busyOrderId === order.orderId}
            onClick={() => handleTransition(order.orderId, 'ready')}
            className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Marcar Lista para Entrega</span>
          </button>
        )}

        {column === 'ready' && (
          <div className="w-full py-2.5 rounded-xl bg-emerald-900/60 border border-emerald-500/50 text-emerald-200 font-bold text-xs text-center uppercase tracking-wider">
            Lista en pase de cocina
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* KDS Top Bar */}
      <header className="px-4 md:px-6 py-3.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shadow-lg">
            <ChefHat className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wide uppercase flex items-center gap-2">
              <span>Cocina KDS — Pollos Karen</span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                  isOnline ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/30 text-red-200'
                }`}
              >
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {isOnline ? 'En línea' : 'Sin conexión'}
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Comandas autorizadas en tiempo real • Sin precios ni datos financieros
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
              soundEnabled
                ? 'bg-slate-800 border-slate-700 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span>{soundEnabled ? 'Sonido Activo' : 'Silenciado'}</span>
          </button>

          <button
            type="button"
            onClick={() => setWakeLockActive(!wakeLockActive)}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
              wakeLockActive
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>{wakeLockActive ? 'Pantalla Fija' : 'Mantener Encendida'}</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
            title="Pantalla completa"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {isCocina && (
            <button
              type="button"
              onClick={logout}
              className="px-3 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              title={`Cerrar sesión (${appUser?.displayName || 'Cocina'})`}
            >
              <LogOut className="w-4 h-4" />
              <span>Salir</span>
            </button>
          )}
        </div>
      </header>

      {/* 3-Column KDS Board */}
      <main className="flex-1 p-4 md:p-5 grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-y-auto">
        {/* Column 1: Authorized / Waiting */}
        <section className="bg-slate-900/70 rounded-2xl border border-slate-800 p-3.5 flex flex-col">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
            <h2 className="text-sm font-black uppercase tracking-wider text-amber-400">
              Pendientes Autorizadas
            </h2>
            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-black">
              {authorizedOrders.length}
            </span>
          </div>
          <div className="space-y-3 flex-1">
            {authorizedOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs font-semibold">
                Sin comandas pendientes por iniciar.
              </div>
            ) : (
              authorizedOrders.map(o => renderOrderCard(o, 'authorized'))
            )}
          </div>
        </section>

        {/* Column 2: In Preparation */}
        <section className="bg-slate-900/70 rounded-2xl border border-slate-800 p-3.5 flex flex-col">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
            <h2 className="text-sm font-black uppercase tracking-wider text-sky-400">
              En Preparación
            </h2>
            <span className="px-2.5 py-0.5 rounded-lg bg-sky-500/20 text-sky-300 text-xs font-black">
              {preparingOrders.length}
            </span>
          </div>
          <div className="space-y-3 flex-1">
            {preparingOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs font-semibold">
                No hay platillos en cocción actualmente.
              </div>
            ) : (
              preparingOrders.map(o => renderOrderCard(o, 'prep'))
            )}
          </div>
        </section>

        {/* Column 3: Ready */}
        <section className="bg-slate-900/70 rounded-2xl border border-slate-800 p-3.5 flex flex-col">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
            <h2 className="text-sm font-black uppercase tracking-wider text-emerald-400">
              Listas para Entregar
            </h2>
            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-black">
              {readyOrders.length}
            </span>
          </div>
          <div className="space-y-3 flex-1">
            {readyOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs font-semibold">
                Las comandas terminadas aparecerán aquí.
              </div>
            ) : (
              readyOrders.map(o => renderOrderCard(o, 'ready'))
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
