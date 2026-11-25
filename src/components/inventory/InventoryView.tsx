import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { InventoryCategory, InventoryItem } from '../../types';
import { formatCRC } from '../../utils/formatters';
import { WeeklyPurchasePlannerModal } from './WeeklyPurchasePlannerModal';
import { WasteRegistrationModal } from './WasteRegistrationModal';
import {
  Package,
  AlertTriangle,
  Plus,
  Edit2,
  Lock,
  Layers,
  ArrowUpDown,
  CheckCircle,
  CalendarDays,
  Trash2,
} from 'lucide-react';

export const InventoryView: React.FC = () => {
  const { inventory, updateInventoryStock } = usePOS();
  const { isAdmin } = useAuth();

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [adjustedStock, setAdjustedStock] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState<string>('');
  const [showPlannerModal, setShowPlannerModal] = useState<boolean>(false);
  const [showWasteModal, setShowWasteModal] = useState<boolean>(false);

  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-100">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-md border border-gray-200">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-gray-900">Acceso Restringido</h2>
          <p className="text-xs text-gray-500 mt-2">
            El inventario, costos y existencias son confidenciales y solo pueden ser consultados y modificados por Administradores.
          </p>
        </div>
      </div>
    );
  }

  const filteredItems = inventory.filter(
    item => activeCategory === 'all' || item.category === activeCategory
  );

  const lowStockCount = inventory.filter(
    i => i.minStock !== undefined && i.minStock > 0 && i.currentStock <= i.minStock
  ).length;

  const handleOpenAdjustModal = (item: InventoryItem) => {
    setEditingItem(item);
    setAdjustedStock(item.currentStock);
    setAdjustmentReason('');
  };

  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    updateInventoryStock(
      editingItem.id,
      adjustedStock,
      adjustmentReason.trim() || 'Ajuste manual de inventario'
    );
    setEditingItem(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-100 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl shadow-xs border border-gray-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-md">
                Control de Existencias
              </span>
              <span className="text-xs text-gray-500 font-medium">Pollos Karen</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 mt-1">Inventario General</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Administración de ingredientes, bebidas, empaques y consumibles con alertas de stock mínimo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {lowStockCount > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 text-amber-900 px-3.5 py-2 rounded-2xl border border-amber-200 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>{lowStockCount} insumos con stock bajo</span>
              </div>
            )}

            <button
              onClick={() => setShowWasteModal(true)}
              className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-2xl font-bold text-xs flex items-center gap-1.5 transition"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Registrar Merma</span>
            </button>

            <button
              onClick={() => setShowPlannerModal(true)}
              className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
            >
              <CalendarDays className="w-4 h-4" />
              <span>Planificador Semanal</span>
            </button>
          </div>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'all', label: 'Todos los Insumos' },
            { id: 'ingredientes', label: 'Ingredientes' },
            { id: 'bebidas', label: 'Bebidas' },
            { id: 'empaques', label: 'Empaques' },
            { id: 'consumibles', label: 'Consumibles' },
            { id: 'otros', label: 'Otros Insumos' },
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3.5 py-2 rounded-xl font-bold shrink-0 transition ${
                activeCategory === cat.id
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Inventory Table */}
        <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-3">Insumo</th>
                  <th className="py-3 px-3">Categoría</th>
                  <th className="py-3 px-3">Unidad</th>
                  <th className="py-3 px-3">Stock Actual</th>
                  <th className="py-3 px-3">Stock Mínimo</th>
                  <th className="py-3 px-3">Costo Promedio</th>
                  <th className="py-3 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.map(item => {
                  const isLow =
                    item.minStock !== undefined &&
                    item.minStock > 0 &&
                    item.currentStock <= item.minStock;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="py-3 px-3 font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <span>{item.name}</span>
                          {isLow && (
                            <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-red-200">
                              <AlertTriangle className="w-3 h-3" />
                              Bajo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 capitalize text-gray-600 font-medium">
                        {item.category}
                      </td>
                      <td className="py-3 px-3 uppercase text-gray-500 font-bold text-[11px]">
                        {item.unit}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`font-black text-sm ${
                            isLow ? 'text-red-600' : 'text-gray-900'
                          }`}
                        >
                          {item.currentStock} {item.unit}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-500">
                        {item.minStock !== undefined && item.minStock > 0 ? (
                          <span>{item.minStock} {item.unit}</span>
                        ) : (
                          <span className="text-gray-400 italic">No configurado</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-bold text-gray-700">
                        {item.averageCost ? formatCRC(item.averageCost) : 'Pendiente'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleOpenAdjustModal(item)}
                          className="px-2.5 py-1.5 bg-gray-100 hover:bg-red-50 hover:text-red-700 text-gray-700 rounded-lg font-bold text-xs transition"
                        >
                          Ajustar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal: Adjust Stock */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSaveAdjustment}
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4"
          >
            <h3 className="font-black text-lg text-gray-900">Ajuste de Existencias</h3>
            <div className="text-xs text-gray-600">
              <strong>{editingItem.name}</strong> • Stock actual: {editingItem.currentStock} {editingItem.unit}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Nuevo Stock Físico ({editingItem.unit}):
              </label>
              <input
                type="number"
                step="any"
                min={0}
                required
                value={adjustedStock}
                onChange={e => setAdjustedStock(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Motivo del Ajuste (Auditoría):
              </label>
              <input
                type="text"
                required
                value={adjustmentReason}
                onChange={e => setAdjustmentReason(e.target.value)}
                placeholder="Ej. Merma, conteo físico semanal, daño..."
                className="w-full px-3 py-1.5 rounded-xl border border-gray-300 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md"
              >
                Guardar Ajuste
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Weekly Purchase Planner (Fase 6) */}
      <WeeklyPurchasePlannerModal
        isOpen={showPlannerModal}
        onClose={() => setShowPlannerModal(false)}
      />

      {/* Modal: Waste Registration (Fase 3) */}
      <WasteRegistrationModal
        isOpen={showWasteModal}
        onClose={() => setShowWasteModal(false)}
      />
    </div>
  );
};
