import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { formatCRC, formatDateTime, getCostaRicaDateString } from '../../utils/formatters';
import {
  Coins,
  Banknote,
  Smartphone,
  CreditCard,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Calculator,
  AlertCircle,
  FileText,
  Lock,
} from 'lucide-react';

export const CashRegisterView: React.FC = () => {
  const { cashRegister, cashMovements, recordPhysicalCount, openNewDayRegister } = usePOS();
  const { isAdmin } = useAuth();

  const [physicalCountInput, setPhysicalCountInput] = useState<number>(cashRegister.expectedCash);
  const [countNotes, setCountNotes] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isOpeningShift, setIsOpeningShift] = useState(false);
  const [newShiftFloat, setNewShiftFloat] = useState(50000);
  const [countSavedMessage, setCountSavedMessage] = useState<string | null>(null);

  const handleSavePhysicalCount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await recordPhysicalCount(physicalCountInput, countNotes);
      setCountSavedMessage('Arqueo físico guardado exitosamente.');
      setTimeout(() => setCountSavedMessage(null), 4000);
    } catch (err: any) {
      setCountSavedMessage(err?.message || 'Error al guardar arqueo.');
    }
  };

  const handleOpenNewShift = (e: React.FormEvent) => {
    e.preventDefault();
    openNewDayRegister(newShiftFloat);
    setIsOpeningShift(false);
  };

  const filteredMovements = cashMovements.filter(
    m => filterType === 'all' || m.type === filterType
  );

  const totalSales = cashRegister.cashSales + cashRegister.sinpeSales + cashRegister.cardSales;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-100 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl shadow-xs border border-gray-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-md">
                Gestión Financiera de Caja
              </span>
              <span className="text-xs text-gray-500 font-medium">Turno #{cashRegister.date}</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 mt-1">Caja General y Arqueos</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Cierre automático diario a las 00:00 (Zona Horaria America/Costa_Rica).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 px-3.5 py-2 rounded-2xl border border-emerald-200 text-xs font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Caja Activa & Abierta</span>
            </div>

            {isAdmin && (
              <button
                onClick={() => setIsOpeningShift(true)}
                className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold text-xs shadow-md transition"
              >
                Nuevo Turno
              </button>
            )}
          </div>
        </div>

        {/* Financial KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Expected Cash in Drawer */}
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Efectivo Esperado</span>
              <Coins className="w-5 h-5 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-gray-950">
              {formatCRC(cashRegister.expectedCash)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1 flex items-center justify-between">
              <span>Fondo Inicial:</span>
              <span className="font-semibold text-gray-700">{formatCRC(cashRegister.initialCash)}</span>
            </div>
          </div>

          {/* Sales Breakdown: Cash */}
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Ventas en Efectivo</span>
              <Banknote className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-emerald-600">
              {formatCRC(cashRegister.cashSales)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              Ingresado directamente al cajón
            </div>
          </div>

          {/* Sales Breakdown: SINPE */}
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">SINPE Móvil</span>
              <Smartphone className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-2xl font-black text-blue-600">
              {formatCRC(cashRegister.sinpeSales)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              Verificado manualmente en teléfono
            </div>
          </div>

          {/* Sales Breakdown: Tarjeta */}
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Tarjeta / Datáfono</span>
              <CreditCard className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-2xl font-black text-purple-600">
              {formatCRC(cashRegister.cardSales)}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              Comprobantes de terminal POS
            </div>
          </div>
        </div>

        {/* Row 2: Automatic Midnight Rollover Card & Cash Deductions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Midnight Close Automation Banner */}
          <div className="lg:col-span-2 bg-gradient-to-r from-red-600 to-red-800 text-white rounded-3xl p-6 shadow-md flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider bg-red-900/60 w-fit px-3 py-1 rounded-full border border-red-500/40">
                <Clock className="w-3.5 h-3.5" />
                <span>Cierre Backend a las 00:00 (America/Costa_Rica)</span>
              </div>
              <h2 className="text-xl font-black mt-3">
                Automatización de Medianoche Independiente
              </h2>
              <p className="text-xs text-red-100 mt-1 max-w-xl leading-relaxed">
                El corte y cierre del período operativo se realiza automáticamente en backend a la medianoche sin depender de que la app permanezca abierta. Las órdenes que queden abiertas se mantienen vinculadas a su fecha original para evitar duplicidades contables.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5 pt-4 border-t border-red-500/40 text-xs">
              <div>
                <span className="text-red-200 text-[11px]">Ventas Totales Hoy:</span>
                <div className="font-black text-base">{formatCRC(totalSales)}</div>
              </div>
              <div>
                <span className="text-red-200 text-[11px]">Salidas Compras Efectivo:</span>
                <div className="font-black text-base text-amber-200">
                  -{formatCRC(cashRegister.cashPurchases)}
                </div>
              </div>
              <div>
                <span className="text-red-200 text-[11px]">Salidas Gastos Efectivo:</span>
                <div className="font-black text-base text-amber-200">
                  -{formatCRC(cashRegister.cashExpenses)}
                </div>
              </div>
            </div>
          </div>

          {/* Physical Cash Count (Arqueo de Caja) */}
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-black text-base text-gray-900">Arqueo Físico de Efectivo</h3>
                <Calculator className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Cuente billetes y monedas en el cajón y registre la cifra real.
              </p>

              {isAdmin ? (
                <form onSubmit={handleSavePhysicalCount} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Monto Físico Contado (CRC)
                    </label>
                    <input
                      type="number"
                      required
                      value={physicalCountInput}
                      onChange={e => setPhysicalCountInput(Number(e.target.value))}
                      className="w-full px-3.5 py-2 text-lg font-black text-gray-900 rounded-xl border border-gray-300 focus:ring-2 focus:ring-red-500 focus:outline-none"
                    />
                  </div>

                  {cashRegister.difference !== undefined && (
                    <div
                      className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
                        cashRegister.difference === 0
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : cashRegister.difference > 0
                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                          : 'bg-red-50 text-red-800 border-red-200'
                      }`}
                    >
                      <span>
                        {cashRegister.difference === 0
                          ? 'Caja cuadrada exactamente'
                          : cashRegister.difference > 0
                          ? 'Sobrante en caja:'
                          : 'Faltante en caja:'}
                      </span>
                      <span className="text-sm font-black">
                        {formatCRC(Math.abs(cashRegister.difference))}
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Observación / Justificación:
                    </label>
                    <input
                      type="text"
                      value={countNotes}
                      onChange={e => setCountNotes(e.target.value)}
                      placeholder="Ejemplo: Arqueo de medio turno sin novedades"
                      className="w-full px-3 py-1.5 rounded-xl border border-gray-300 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                    />
                  </div>

                  {countSavedMessage && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold text-center">
                      {countSavedMessage}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs shadow-md transition"
                  >
                    Guardar Arqueo Físico
                  </button>
                </form>
              ) : (
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 text-xs text-gray-600 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>El arqueo físico está restringido exclusivamente a administradores.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Movements History */}
        <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-lg text-gray-900">Historial de Movimientos de Caja</h3>
              <p className="text-xs text-gray-500">
                Trazabilidad de cada venta, compra o gasto que impacta el efectivo y métodos de pago.
              </p>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1.5 text-xs">
              {['all', 'sale', 'purchase', 'expense'].map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition capitalize ${
                    filterType === type
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {type === 'all'
                    ? 'Todos'
                    : type === 'sale'
                    ? 'Ventas'
                    : type === 'purchase'
                    ? 'Compras'
                    : 'Gastos'}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Fecha y Hora</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3">Descripción</th>
                  <th className="py-2.5 px-3">Método</th>
                  <th className="py-2.5 px-3">Usuario</th>
                  <th className="py-2.5 px-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400">
                      No hay movimientos registrados en este período.
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map(mov => {
                    const isIncome = mov.type === 'sale' || mov.type === 'initial_float';
                    return (
                      <tr key={mov.id} className="hover:bg-gray-50">
                        <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                          {formatDateTime(mov.createdAt)}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                              isIncome
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {mov.type === 'sale' ? 'Venta' : mov.type === 'purchase' ? 'Compra' : 'Gasto'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-gray-900">{mov.description}</td>
                        <td className="py-2.5 px-3 uppercase text-gray-600 font-bold text-[10px]">
                          {mov.paymentMethod}
                        </td>
                        <td className="py-2.5 px-3 text-gray-500">{mov.performedBy}</td>
                        <td
                          className={`py-2.5 px-3 text-right font-black text-sm ${
                            isIncome ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {isIncome ? '+' : '-'}
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
      </div>

      {/* Modal: Open New Shift */}
      {isOpeningShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleOpenNewShift}
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4"
          >
            <h3 className="font-black text-lg text-gray-900">Apertura de Nuevo Turno de Caja</h3>
            <p className="text-xs text-gray-500">
              Inicia un nuevo período operativo y establece el fondo de caja inicial.
            </p>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Fondo Inicial en Efectivo (CRC)
              </label>
              <input
                type="number"
                required
                value={newShiftFloat}
                onChange={e => setNewShiftFloat(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsOpeningShift(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md"
              >
                Abrir Turno
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
