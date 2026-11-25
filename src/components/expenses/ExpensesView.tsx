import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { OperatingExpense, ExpenseFrequency } from '../../types';
import { formatCRC, formatDate, getCostaRicaDateString } from '../../utils/formatters';
import {
  PiggyBank,
  Plus,
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Lock,
  Coins,
} from 'lucide-react';

export const ExpensesView: React.FC = () => {
  const { expenses, addExpense, markExpensePaid } = usePOS();
  const { isAdmin } = useAuth();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<OperatingExpense['category']>('electricidad');
  const [amount, setAmount] = useState<number>(50000);
  const [frequency, setFrequency] = useState<ExpenseFrequency>('mensual');
  const [dueDate, setDueDate] = useState(getCostaRicaDateString());
  const [paidFromCash, setPaidFromCash] = useState(true);

  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-100">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-md border border-gray-200">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-gray-900">Acceso Restringido</h2>
          <p className="text-xs text-gray-500 mt-2">
            La administración de gastos fijos y operativos es confidencial y solo accesible para Administradores.
          </p>
        </div>
      </div>
    );
  }

  const todayStr = getCostaRicaDateString();
  const today = new Date(todayStr);

  const getExpenseStatus = (exp: OperatingExpense) => {
    if (exp.status === 'paid') {
      return { label: 'Pagado', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    }

    const due = new Date(exp.dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        label: `VENCIDO (${Math.abs(diffDays)} días de atraso)`,
        color: 'bg-red-600 text-white font-black animate-pulse border-red-700',
        isCritical: true,
      };
    } else if (diffDays <= 3) {
      return {
        label: `Vence en ${diffDays} días (Urgente)`,
        color: 'bg-orange-500 text-white font-bold border-orange-600',
        isUrgent: true,
      };
    } else if (diffDays <= 7) {
      return {
        label: `Vence en ${diffDays} días`,
        color: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
        isWarning: true,
      };
    }

    return {
      label: `Vence el ${formatDate(exp.dueDate)}`,
      color: 'bg-gray-100 text-gray-700 border-gray-200',
    };
  };

  const [confirmingPayId, setConfirmingPayId] = useState<string | null>(null);

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || amount <= 0) return;

    addExpense({
      name: name.trim(),
      category,
      amount,
      paymentMethod: 'efectivo',
      paidFromCashRegister: paidFromCash,
      frequency,
      dueDate,
      nextDueDate: dueDate,
    });

    setName('');
    setIsAddOpen(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-100 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl shadow-xs border border-gray-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-md">
                Costos Fijos & Operativos
              </span>
              <span className="text-xs text-gray-500 font-medium">Administración</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 mt-1">Gastos Operativos y Alertas</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Control de servicios públicos, alquileres y permisos con avisos automáticos a 7 días, 3 días y vencidos.
            </p>
          </div>

          <button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold text-xs shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Nuevo Gasto</span>
          </button>
        </div>

        {/* Expenses Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {expenses.map(exp => {
            const statusInfo = getExpenseStatus(exp);
            const isPending = exp.status === 'pending';

            return (
              <div
                key={exp.id}
                className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      {exp.category} • {exp.frequency}
                    </span>
                    <span
                      className={`text-[10px] uppercase px-2.5 py-1 rounded-full border ${statusInfo.color}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-lg text-gray-900 mt-2">{exp.name}</h3>
                  <div className="text-2xl font-black text-red-600 mt-1">
                    {formatCRC(exp.amount)}
                  </div>

                  <div className="text-xs text-gray-500 mt-2 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    <span>Fecha límite: {formatDate(exp.dueDate)}</span>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">
                    {exp.paidFromCashRegister ? 'Se deduce de caja general' : 'Pago externo'}
                  </span>

                  {isPending ? (
                    confirmingPayId === exp.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            markExpensePaid(exp.id, 'efectivo', exp.paidFromCashRegister);
                            setConfirmingPayId(null);
                          }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[11px] shadow-xs transition"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingPayId(null)}
                          className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-[11px] transition"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingPayId(exp.id)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs transition"
                      >
                        Marcar Pagado
                      </button>
                    )
                  ) : (
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      <span>Al día</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: Add Expense */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleCreateExpense}
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4"
          >
            <h3 className="font-black text-lg text-gray-900">Nuevo Gasto Operativo</h3>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Nombre del Gasto</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ej. Recibo de Agua AyA, Permiso de Salud..."
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Categoría</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as any)}
                  className="w-full px-2 py-2 rounded-xl border border-gray-300 text-xs bg-white focus:outline-none"
                >
                  <option value="alquiler">Alquiler</option>
                  <option value="electricidad">Electricidad</option>
                  <option value="agua">Agua</option>
                  <option value="gas">Gas</option>
                  <option value="internet">Internet</option>
                  <option value="servicios">Servicios</option>
                  <option value="permisos">Permisos</option>
                  <option value="otros">Otros</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Frecuencia</label>
                <select
                  value={frequency}
                  onChange={e => setFrequency(e.target.value as any)}
                  className="w-full px-2 py-2 rounded-xl border border-gray-300 text-xs bg-white focus:outline-none"
                >
                  <option value="mensual">Mensual</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="anual">Anual</option>
                  <option value="unico">Pago Único</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Monto (CRC)</label>
                <input
                  type="number"
                  required
                  min={100}
                  value={amount}
                  onChange={e => setAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Fecha Límite</label>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full px-2 py-2 rounded-xl border border-gray-300 text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                id="paidCashCheck"
                checked={paidFromCash}
                onChange={e => setPaidFromCash(e.target.checked)}
                className="w-4 h-4 text-red-600 rounded border-gray-300"
              />
              <label htmlFor="paidCashCheck" className="font-semibold text-gray-700 cursor-pointer">
                Descontar de la Caja General al pagarse
              </label>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md"
              >
                Guardar Gasto
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
