import React, { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { formatCRC, formatDateTime } from '../../utils/formatters';
import {
  CR_DENOMINATIONS,
  calculateDenominationsTotal,
  calculateExpectedCash,
} from '../../utils/orderStateMachine';
import { printCashCloseReport } from '../../utils/thermalPrinter';
import { DenominationCount } from '../../types';
import {
  Coins,
  Banknote,
  Smartphone,
  CreditCard,
  Calculator,
  AlertTriangle,
  Lock,
  Printer,
  ArrowDownCircle,
  ArrowUpCircle,
  RotateCcw,
  CheckCircle2,
  DoorOpen,
} from 'lucide-react';

export const CashRegisterView: React.FC = () => {
  const {
    cashRegister,
    activeCashRegister,
    hasOpenCashRegister,
    staleOpenRegisters,
    cashRegistersHistory,
    cashMovements,
    openNewDayRegister,
    closeCashRegister,
    reopenCashRegister,
    recordCashDrawerMovement,
    restaurantConfig,
  } = usePOS();
  const { isAdmin } = useAuth();

  const [openFloat, setOpenFloat] = useState<number>(30000);
  const [closingCounts, setClosingCounts] = useState<Record<number, number>>({});
  const [useDenominations, setUseDenominations] = useState(false);
  const [manualCountInput, setManualCountInput] = useState<number>(0);
  const [closeNotes, setCloseNotes] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Manual deposit/withdrawal modal
  const [drawerAction, setDrawerAction] = useState<'deposit' | 'withdrawal' | null>(null);
  const [drawerAmount, setDrawerAmount] = useState<number>(0);
  const [drawerReason, setDrawerReason] = useState<string>('');

  // Reopen modal
  const [reopenTargetId, setReopenTargetId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState<string>('');

  const expectedCash = activeCashRegister ? calculateExpectedCash(activeCashRegister) : 0;

  useEffect(() => {
    setManualCountInput(expectedCash);
  }, [expectedCash]);

  const denominationsList: DenominationCount[] = CR_DENOMINATIONS.map(d => ({
    denomination: d,
    count: closingCounts[d] || 0,
  })).filter(d => d.count > 0);

  const countedCash = useDenominations
    ? calculateDenominationsTotal(denominationsList)
    : manualCountInput;

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await openNewDayRegister(openFloat);
      setFeedback({ type: 'ok', text: `Turno de caja abierto con fondo inicial de ${formatCRC(openFloat)}.` });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Error abriendo turno.' });
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await closeCashRegister(
      countedCash,
      closeNotes,
      useDenominations ? denominationsList : undefined
    );
    if (res.success && res.register) {
      setFeedback({
        type: 'ok',
        text: `Turno cerrado. Diferencia: ${formatCRC(res.register.difference || 0)}.`,
      });
      setCloseNotes('');
      setClosingCounts({});
    } else {
      setFeedback({ type: 'err', text: res.error || 'Error cerrando turno.' });
    }
  };

  const handleDrawerMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawerAction) return;
    setFeedback(null);
    try {
      await recordCashDrawerMovement(drawerAction, drawerAmount, drawerReason);
      setFeedback({
        type: 'ok',
        text: `${drawerAction === 'deposit' ? 'Ingreso' : 'Retiro'} de ${formatCRC(drawerAmount)} registrado.`,
      });
      setDrawerAction(null);
      setDrawerAmount(0);
      setDrawerReason('');
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Error registrando movimiento.' });
    }
  };

  const handleReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenTargetId) return;
    setFeedback(null);
    try {
      await reopenCashRegister(reopenTargetId, reopenReason);
      setFeedback({ type: 'ok', text: 'Turno reabierto con registro de auditoría.' });
      setReopenTargetId(null);
      setReopenReason('');
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Error reabriendo turno.' });
    }
  };

  const filteredMovements = cashMovements.filter(
    m =>
      (!activeCashRegister || m.registerId === activeCashRegister.id) &&
      (filterType === 'all' || m.type === filterType)
  );

  const totalSales =
    (cashRegister.cashSales || 0) + (cashRegister.sinpeSales || 0) + (cashRegister.cardSales || 0);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-100 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl shadow-xs border border-gray-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-md">
                Control Real de Caja
              </span>
              {hasOpenCashRegister && (
                <span className="text-xs text-gray-500 font-medium">
                  Turno #{activeCashRegister?.date}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black text-gray-900 mt-1">Caja General y Arqueos</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Apertura y cierre explícito con conteo de denominaciones CRC • Sin fondos ficticios ni cierres silenciosos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border text-xs font-bold ${
                hasOpenCashRegister
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  hasOpenCashRegister ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                }`}
              />
              <span>{hasOpenCashRegister ? 'Turno Abierto' : 'Caja Cerrada'}</span>
            </div>

            {hasOpenCashRegister && isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setDrawerAction('deposit')}
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  Ingreso
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerAction('withdrawal')}
                  className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowDownCircle className="w-4 h-4" />
                  Retiro
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stale Open Register Warning */}
        {staleOpenRegisters.length > 0 && (
          <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-black text-sm">
                  Alerta: Existe un turno abierto de una fecha anterior ({staleOpenRegisters[0].date})
                </div>
                <p className="mt-0.5">
                  El sistema no cierra turnos en silencio para proteger su arqueo. Verifique el efectivo físico y cierre ese turno antes de iniciar la jornada de hoy.
                </p>
              </div>
            </div>
          </div>
        )}

        {feedback && (
          <div
            className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
              feedback.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback.text}</span>
          </div>
        )}

        {/* EXPLICIT OPEN SHIFT SCREEN WHEN CLOSED */}
        {!hasOpenCashRegister ? (
          <div className="bg-white rounded-3xl p-6 md:p-8 border border-gray-200 shadow-xs max-w-lg mx-auto space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <DoorOpen className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-black text-gray-900">Abrir Turno de Caja</h2>
              <p className="text-xs text-gray-500">
                Para comenzar a cobrar pedidos en Punto de Venta, ingrese el efectivo inicial real con el que abre el cajón hoy.
              </p>
            </div>

            <form onSubmit={handleOpenShift} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Fondo Inicial en Efectivo (₡ CRC)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={openFloat}
                  onChange={e => setOpenFloat(Number(e.target.value))}
                  className="w-full px-4 py-3 text-xl font-black rounded-xl border border-gray-300 focus:ring-2 focus:ring-red-500"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm shadow-md cursor-pointer"
              >
                Abrir Turno de Caja Ahora
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* Financial KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs">
                <div className="flex items-center justify-between text-gray-500 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Efectivo Esperado</span>
                  <Coins className="w-5 h-5 text-amber-500" />
                </div>
                <div className="text-2xl font-black text-gray-950">{formatCRC(expectedCash)}</div>
                <div className="text-[11px] text-gray-500 mt-1 flex justify-between">
                  <span>Fondo Inicial:</span>
                  <span className="font-semibold text-gray-700">
                    {formatCRC(cashRegister.initialCash)}
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs">
                <div className="flex items-center justify-between text-gray-500 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Ventas Efectivo</span>
                  <Banknote className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="text-2xl font-black text-emerald-600">
                  {formatCRC(cashRegister.cashSales || 0)}
                </div>
                <div className="text-[11px] text-gray-500 mt-1">
                  Total ventas turno: {formatCRC(totalSales)}
                </div>
              </div>

              <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs">
                <div className="flex items-center justify-between text-gray-500 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">SINPE Móvil</span>
                  <Smartphone className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-2xl font-black text-blue-600">
                  {formatCRC(cashRegister.sinpeSales || 0)}
                </div>
                <div className="text-[11px] text-gray-500 mt-1">Verificado en teléfono de caja</div>
              </div>

              <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs">
                <div className="flex items-center justify-between text-gray-500 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider">Tarjeta / Datáfono</span>
                  <CreditCard className="w-5 h-5 text-purple-600" />
                </div>
                <div className="text-2xl font-black text-purple-600">
                  {formatCRC(cashRegister.cardSales || 0)}
                </div>
                <div className="text-[11px] text-gray-500 mt-1">Terminal física POS</div>
              </div>
            </div>

            {/* Formula Breakdown + Formal Close Form */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-3 text-xs">
                <h3 className="font-black text-base text-gray-900">
                  Fórmula Exacta de Efectivo Esperado
                </h3>
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between">
                    <span>Fondo Inicial:</span>
                    <span className="font-bold">{formatCRC(cashRegister.initialCash || 0)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>(+) Ventas en Efectivo:</span>
                    <span className="font-bold">+{formatCRC(cashRegister.cashSales || 0)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>(+) Ingresos Manuales:</span>
                    <span className="font-bold">+{formatCRC(cashRegister.cashDeposits || 0)}</span>
                  </div>
                  <div className="flex justify-between text-red-700">
                    <span>(-) Retiros Manuales:</span>
                    <span className="font-bold">-{formatCRC(cashRegister.cashWithdrawals || 0)}</span>
                  </div>
                  <div className="flex justify-between text-red-700">
                    <span>(-) Compras en Efectivo:</span>
                    <span className="font-bold">-{formatCRC(cashRegister.cashPurchases || 0)}</span>
                  </div>
                  <div className="flex justify-between text-red-700">
                    <span>(-) Gastos en Efectivo:</span>
                    <span className="font-bold">-{formatCRC(cashRegister.cashExpenses || 0)}</span>
                  </div>
                  <div className="flex justify-between text-red-700">
                    <span>(-) Reembolsos Efectivo:</span>
                    <span className="font-bold">-{formatCRC(cashRegister.cashRefunds || 0)}</span>
                  </div>
                  <div className="flex justify-between text-base font-black text-gray-950 pt-3 border-t border-gray-200">
                    <span>(=) Efectivo Esperado:</span>
                    <span>{formatCRC(expectedCash)}</span>
                  </div>
                </div>
              </div>

              {/* Formal Shift Close & Arqueo */}
              <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-red-600" />
                    <span>Cierre Formal y Arqueo de Turno</span>
                  </h3>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useDenominations}
                      onChange={e => setUseDenominations(e.target.checked)}
                    />
                    <span>Contar billetes/monedas</span>
                  </label>
                </div>

                <form onSubmit={handleCloseShift} className="space-y-3">
                  {useDenominations ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-gray-50 rounded-2xl border border-gray-200 text-xs">
                      {CR_DENOMINATIONS.map(denom => (
                        <div key={denom} className="flex items-center justify-between gap-1 bg-white p-1.5 rounded-lg border border-gray-200">
                          <span className="font-bold text-gray-700">{formatCRC(denom)}</span>
                          <input
                            type="number"
                            min={0}
                            value={closingCounts[denom] || ''}
                            onChange={e =>
                              setClosingCounts(prev => ({
                                ...prev,
                                [denom]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                              }))
                            }
                            placeholder="0"
                            className="w-12 px-1.5 py-0.5 text-right rounded border border-gray-300 font-bold"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Efectivo Físico Contado (₡ CRC)
                      </label>
                      <input
                        type="number"
                        min={0}
                        required
                        value={manualCountInput}
                        onChange={e => setManualCountInput(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 text-lg font-black rounded-xl border border-gray-300"
                      />
                    </div>
                  )}

                  <div
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
                      countedCash - expectedCash === 0
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : countedCash - expectedCash > 0
                          ? 'bg-blue-50 border-blue-200 text-blue-800'
                          : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    <span>
                      Contado: {formatCRC(countedCash)} •{' '}
                      {countedCash - expectedCash === 0
                        ? 'Caja Cuadrada'
                        : countedCash - expectedCash > 0
                          ? 'Sobrante:'
                          : 'Faltante:'}
                    </span>
                    <span className="text-sm font-black">
                      {formatCRC(Math.abs(countedCash - expectedCash))}
                    </span>
                  </div>

                  <input
                    type="text"
                    value={closeNotes}
                    onChange={e => setCloseNotes(e.target.value)}
                    placeholder="Observaciones del cierre (obligatorio si hay diferencia)"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
                  />

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs shadow-md cursor-pointer"
                  >
                    Cerrar Turno de Caja Definitivamente
                  </button>
                </form>
              </div>
            </div>
          </>
        )}

        {/* Movements History */}
        <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-black text-base text-gray-900">Movimientos del Turno</h3>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {['all', 'sale', 'purchase', 'expense', 'deposit', 'withdrawal', 'refund'].map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-2.5 py-1 rounded-lg font-bold capitalize cursor-pointer ${
                    filterType === t ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {t === 'all' ? 'Todos' : t}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase text-[10px]">
                <tr>
                  <th className="py-2 px-3">Fecha</th>
                  <th className="py-2 px-3">Tipo</th>
                  <th className="py-2 px-3">Descripción</th>
                  <th className="py-2 px-3">Método</th>
                  <th className="py-2 px-3">Usuario</th>
                  <th className="py-2 px-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-gray-400">
                      Sin movimientos registrados.
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map(mov => {
                    const isIn =
                      mov.type === 'sale' ||
                      mov.type === 'initial_float' ||
                      mov.type === 'deposit';
                    return (
                      <tr key={mov.id} className="hover:bg-gray-50">
                        <td className="py-2 px-3 whitespace-nowrap text-gray-600">
                          {formatDateTime(mov.createdAt)}
                        </td>
                        <td className="py-2 px-3 uppercase font-bold text-[10px]">{mov.type}</td>
                        <td className="py-2 px-3 font-semibold text-gray-900">{mov.description}</td>
                        <td className="py-2 px-3 uppercase text-[10px] font-bold">
                          {mov.paymentMethod}
                        </td>
                        <td className="py-2 px-3 text-gray-500">{mov.performedBy}</td>
                        <td
                          className={`py-2 px-3 text-right font-black ${
                            isIn ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {isIn ? '+' : '-'}
                          {formatCRC(mov.amount)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Closed Shifts History & Thermal Print / Audited Reopen */}
        <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-3">
          <h3 className="font-black text-base text-gray-900">Historial de Turnos de Caja</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase text-[10px]">
                <tr>
                  <th className="py-2 px-3">Fecha</th>
                  <th className="py-2 px-3">Estado</th>
                  <th className="py-2 px-3">Esperado</th>
                  <th className="py-2 px-3">Contado</th>
                  <th className="py-2 px-3">Diferencia</th>
                  <th className="py-2 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cashRegistersHistory.map(reg => (
                  <tr key={reg.id} className="hover:bg-gray-50">
                    <td className="py-2 px-3 font-bold">{reg.date}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          reg.status === 'open'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {reg.status === 'open' ? 'Abierto' : 'Cerrado'}
                      </span>
                    </td>
                    <td className="py-2 px-3">{formatCRC(reg.expectedCash || 0)}</td>
                    <td className="py-2 px-3">
                      {reg.actualCash !== undefined ? formatCRC(reg.actualCash) : '-'}
                    </td>
                    <td className="py-2 px-3 font-bold">
                      {reg.difference !== undefined ? formatCRC(reg.difference) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() =>
                          printCashCloseReport(reg, restaurantConfig.printerWidth)
                        }
                        className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Printer className="w-3 h-3" />
                        Reporte
                      </button>
                      {isAdmin && reg.status === 'closed' && !hasOpenCashRegister && (
                        <button
                          type="button"
                          onClick={() => setReopenTargetId(reg.id)}
                          className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reabrir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal: Manual Deposit / Withdrawal */}
      {drawerAction && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleDrawerMovement}
            className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl"
          >
            <h3 className="font-black text-lg text-gray-900">
              {drawerAction === 'deposit' ? 'Ingreso Manual de Efectivo' : 'Retiro de Efectivo de Caja'}
            </h3>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Monto (₡ CRC)</label>
              <input
                type="number"
                min={1}
                required
                value={drawerAmount}
                onChange={e => setDrawerAmount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Motivo / Respaldo</label>
              <input
                type="text"
                required
                value={drawerReason}
                onChange={e => setDrawerReason(e.target.value)}
                placeholder="Ej. Sencillo adicional / Depósito bancario"
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDrawerAction(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-xs cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Audited Reopen */}
      {reopenTargetId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleReopen}
            className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl"
          >
            <h3 className="font-black text-lg text-gray-900 flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-600" />
              Reabrir Turno Cerrado
            </h3>
            <p className="text-xs text-gray-500">
              Esta acción queda registrada en la bitácora de auditoría inmutable.
            </p>
            <input
              type="text"
              required
              value={reopenReason}
              onChange={e => setReopenReason(e.target.value)}
              placeholder="Justificación obligatoria *"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReopenTargetId(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white font-bold text-xs cursor-pointer"
              >
                Reabrir Turno
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
