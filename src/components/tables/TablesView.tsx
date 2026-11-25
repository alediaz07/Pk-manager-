import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { RestaurantTable, TableStatus } from '../../types';
import { formatCRC } from '../../utils/formatters';
import {
  LayoutGrid,
  Users,
  CheckCircle,
  Clock,
  Plus,
  Power,
  UtensilsCrossed,
  Receipt,
  Wine,
} from 'lucide-react';

interface TablesViewProps {
  onOpenPOSForTable?: (table: RestaurantTable) => void;
}

export const TablesView: React.FC<TablesViewProps> = ({ onOpenPOSForTable }) => {
  const { tables, orders, selectTable, updateTableStatus, addTable, toggleTableActive } = usePOS();
  const { isAdmin } = useAuth();

  const [isAddTableOpen, setIsAddTableOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableSeats, setNewTableSeats] = useState(4);
  const [newTableType, setNewTableType] = useState<'table' | 'bar'>('table');

  const handleSelectTableAndGoPOS = (table: RestaurantTable) => {
    selectTable(table);
    if (onOpenPOSForTable) {
      onOpenPOSForTable(table);
    }
  };

  const handleCreateNewTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableName.trim()) return;

    const nextNumber = tables.length + 1;
    addTable(newTableName.trim(), nextNumber, newTableType, newTableSeats);
    setNewTableName('');
    setIsAddTableOpen(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-100">
      {/* Header */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl shadow-xs border border-gray-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-md">
                Salón & Servicio
              </span>
              <span className="text-xs text-gray-500 font-medium">Pollos Karen</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 mt-1">Gestión de Mesas y Barra</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Toque una mesa para abrir o consultar su comanda activa. La Barra opera como cuenta unificada.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Status Legend */}
            <div className="hidden md:flex items-center gap-3 text-xs font-semibold bg-gray-50 px-3 py-2 rounded-2xl border border-gray-200">
              <span className="flex items-center gap-1.5 text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Libre
              </span>
              <span className="flex items-center gap-1.5 text-amber-700">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Orden activa
              </span>
              <span className="flex items-center gap-1.5 text-blue-700">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Por cobrar
              </span>
            </div>

            {isAdmin && (
              <button
                onClick={() => setIsAddTableOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold text-xs shadow-md transition"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar Mesa</span>
              </button>
            )}
          </div>
        </div>

        {/* Tables & Barra Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tables.map(table => {
            const isBar = table.type === 'bar';
            const activeOrder = table.currentOrderId ? orders.find(o => o.id === table.currentOrderId) : null;
            const isOccupied = table.status === 'activa';
            const isBillRequested = table.status === 'pendiente_pago';
            const isFree = table.status === 'libre';

            return (
              <div
                key={table.id}
                className={`rounded-3xl p-5 border-2 transition shadow-xs flex flex-col justify-between relative overflow-hidden ${
                  !table.active
                    ? 'bg-gray-100 border-gray-200 opacity-60'
                    : isOccupied
                    ? 'bg-amber-50/70 border-amber-300 shadow-amber-100'
                    : isBillRequested
                    ? 'bg-blue-50/70 border-blue-400'
                    : 'bg-white border-emerald-300 hover:border-emerald-500'
                }`}
              >
                {/* Header of Table Card */}
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black ${
                          isBar
                            ? 'bg-purple-100 text-purple-700'
                            : isOccupied
                            ? 'bg-amber-200 text-amber-900'
                            : isFree
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {isBar ? <Wine className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                      </div>
                      <div>
                        <h3 className="font-black text-lg text-gray-900">{table.name}</h3>
                        <div className="text-[11px] font-semibold text-gray-500">
                          {isBar ? 'Cuenta única de barra' : `Capacidad: ${table.seats || 4} comensales`}
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                        !table.active
                          ? 'bg-gray-200 text-gray-600 border-gray-300'
                          : isOccupied
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : isBillRequested
                          ? 'bg-blue-100 text-blue-800 border-blue-300'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      }`}
                    >
                      {!table.active ? 'Desactivada' : isOccupied ? 'Ocupada' : isBillRequested ? 'Por Cobrar' : 'Libre'}
                    </span>
                  </div>

                  {/* Active Order Details */}
                  {activeOrder && table.active ? (
                    <div className="mt-4 pt-3 border-t border-gray-200/60 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                        <span>Orden {activeOrder.orderNumber}</span>
                        <span className="text-red-600 font-black">{formatCRC(activeOrder.total)}</span>
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center justify-between">
                        <span>{activeOrder.items.length} productos en mesa</span>
                        <span>{activeOrder.serviceCharge > 0 ? '+10% servicio' : ''}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      <span>Lista para comensales</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-5 pt-3 border-t border-gray-100 flex items-center gap-2">
                  <button
                    onClick={() => handleSelectTableAndGoPOS(table)}
                    disabled={!table.active}
                    className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                      isOccupied
                        ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                        : isBillRequested
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                        : 'bg-gray-900 hover:bg-black text-white'
                    }`}
                  >
                    <UtensilsCrossed className="w-3.5 h-3.5" />
                    <span>{isOccupied ? 'Ver Comanda' : 'Abrir Cuenta'}</span>
                  </button>

                  {/* Quick table status toggle if occupied */}
                  {isOccupied && (
                    <button
                      onClick={() => updateTableStatus(table.id, isBillRequested ? 'activa' : 'pendiente_pago')}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition ${
                        isBillRequested
                          ? 'bg-blue-100 text-blue-900 border-blue-300'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                      title="Marcar cuenta pedida / pendiente de pago"
                    >
                      <Receipt className="w-4 h-4" />
                    </button>
                  )}

                  {/* Admin Deactivate / Activate button */}
                  {isAdmin && (
                    <button
                      onClick={() => toggleTableActive(table.id)}
                      className={`p-2.5 rounded-xl border transition ${
                        table.active
                          ? 'text-gray-400 hover:text-red-600 border-gray-200 hover:bg-red-50'
                          : 'text-emerald-600 bg-emerald-50 border-emerald-200'
                      }`}
                      title={table.active ? 'Desactivar mesa (conserva historial)' : 'Reactivar mesa'}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: Add New Table (Admin Only) */}
      {isAddTableOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleCreateNewTable}
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4"
          >
            <h3 className="font-black text-lg text-gray-900">Configurar Nueva Mesa</h3>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Nombre o Etiqueta</label>
              <input
                type="text"
                required
                value={newTableName}
                onChange={e => setNewTableName(e.target.value)}
                placeholder="Ejemplo: Mesa 8, Terraza 1"
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Tipo</label>
                <select
                  value={newTableType}
                  onChange={e => setNewTableType(e.target.value as 'table' | 'bar')}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white focus:ring-2 focus:ring-red-500 focus:outline-none"
                >
                  <option value="table">Mesa Estándar</option>
                  <option value="bar">Barra</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Comensales</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={newTableSeats}
                  onChange={e => setNewTableSeats(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs text-center focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddTableOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md"
              >
                Guardar Mesa
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
