import React, { useState, useMemo } from 'react';
import { usePOS } from '../../context/POSContext';
import { InventoryItem } from '../../types';
import { formatCRC } from '../../utils/formatters';
import { calculateIngredientConsumption } from '../../utils/orderStateMachine';
import {
  CalendarDays,
  X,
  Printer,
  Info,
} from 'lucide-react';

interface WeeklyPurchasePlannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ForecastSource = 'historial_real' | 'recetas_ventas' | 'estimacion_inicial';

interface ItemRecommendation {
  item: InventoryItem;
  dailyAvgConsumption: number;
  weeklyProjectedConsumption: number; // 5 operational days (Mon-Fri)
  safetyStock: number;
  currentStock: number;
  suggestedPurchase: number;
  unitCost: number;
  totalEstimatedCost: number;
  reason: string;
  dataSource: ForecastSource;
  status: 'critical' | 'warning' | 'optimal';
}

export const WeeklyPurchasePlannerModal: React.FC<WeeklyPurchasePlannerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { inventory, orders, recipes, inventoryMovements } = usePOS();
  const [safetyBufferPercent, setSafetyBufferPercent] = useState<number>(20);
  const [operationalDays, setOperationalDays] = useState<number>(5);

  const recommendations: ItemRecommendation[] = useMemo(() => {
    const now = Date.now();
    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

    // 1. Real 14-day consumption + waste movements
    const historicalConsumptionByItem: Record<string, number> = {};
    const movementDates = new Set<string>();

    inventoryMovements.forEach(mov => {
      const movTime = new Date(mov.createdAt).getTime();
      if (movTime >= fourteenDaysAgo && (mov.type === 'consumption' || mov.type === 'waste')) {
        const qty = Math.abs(mov.quantity || 0);
        historicalConsumptionByItem[mov.itemId] = (historicalConsumptionByItem[mov.itemId] || 0) + qty;
        if (mov.createdAt) movementDates.add(mov.createdAt.slice(0, 10));
      }
    });
    const observedMovementDays = Math.max(1, Math.min(10, movementDates.size || 10));

    // 2. Fallback: recipe-derived consumption from paid orders respecting yieldPortions + unit conversion
    const recipeRateByItem: Record<string, number> = {};
    const paidOrders = orders.filter(
      o => (o.paymentStatus === 'paid' || o.financialStatus === 'paid') && o.status !== 'cancelled'
    );
    const orderDates = new Set(paidOrders.map(o => o.operationalDate || o.createdAt.slice(0, 10)));
    const observedOrderDays = Math.max(1, orderDates.size);

    paidOrders.forEach(o => {
      o.items.forEach(lineItem => {
        const matched = recipes.find(r => {
          if (lineItem.isCasado || lineItem.selectedProtein) {
            return (
              r.productId === lineItem.productId &&
              r.protein?.toLowerCase() === lineItem.selectedProtein?.toLowerCase()
            );
          }
          return r.productId === lineItem.productId;
        });
        if (matched && matched.ingredients) {
          matched.ingredients.forEach(ing => {
            const invTarget = inventory.find(i => i.id === ing.itemId);
            if (!invTarget) return;
            const calc = calculateIngredientConsumption(
              lineItem.quantity,
              matched.yieldPortions || 1,
              ing.quantity,
              ing.unit,
              invTarget.unit
            );
            if (calc.compatible && calc.deductedQty > 0) {
              recipeRateByItem[ing.itemId] = (recipeRateByItem[ing.itemId] || 0) + calc.deductedQty;
            }
          });
        }
      });
    });

    return inventory.map(item => {
      const histTotal = historicalConsumptionByItem[item.id] || 0;
      let dailyAvg = 0;
      let dataSource: ForecastSource = 'estimacion_inicial';

      if (histTotal > 0) {
        dailyAvg = histTotal / observedMovementDays;
        dataSource = 'historial_real';
      } else if ((recipeRateByItem[item.id] || 0) > 0) {
        dailyAvg = recipeRateByItem[item.id] / observedOrderDays;
        dataSource = 'recetas_ventas';
      } else {
        // Explicit min-stock baseline when no consumption history exists yet
        dailyAvg = Math.max(0, (item.minStock || 0) / Math.max(1, operationalDays));
        dataSource = 'estimacion_inicial';
      }

      const weeklyProjectedConsumption = Math.round(dailyAvg * operationalDays * 100) / 100;
      const bufferQty = (weeklyProjectedConsumption * safetyBufferPercent) / 100;
      const safetyStock = Math.max(item.minStock || 0, Math.round(bufferQty * 100) / 100);

      const neededTotal = weeklyProjectedConsumption + safetyStock;
      const currentStock = Number(item.currentStock) || 0;
      const suggestedPurchase = Math.max(0, Math.round((neededTotal - currentStock) * 100) / 100);

      const unitCost = item.averageCost || item.lastPurchaseCost || 0;
      const totalEstimatedCost = Math.round(suggestedPurchase * unitCost);

      let status: 'critical' | 'warning' | 'optimal' = 'optimal';
      if (currentStock <= safetyStock) {
        status = 'critical';
      } else if (currentStock < neededTotal) {
        status = 'warning';
      }

      let reason = '';
      if (status === 'critical') {
        reason = `Stock actual (${currentStock} ${item.unit}) en nivel crítico, por debajo de la reserva de seguridad (${safetyStock} ${item.unit}).`;
      } else if (status === 'warning') {
        const daysCovered = dailyAvg > 0 ? Math.max(0, Math.round((currentStock / dailyAvg) * 10) / 10) : 0;
        reason =
          dailyAvg > 0
            ? `Stock suficiente para ~${daysCovered} días de operación. Requiere reposición para cubrir ${operationalDays} días.`
            : `Stock por debajo del mínimo configurado (${safetyStock} ${item.unit}).`;
      } else {
        reason =
          weeklyProjectedConsumption > 0
            ? `Stock suficiente para la demanda proyectada de ${weeklyProjectedConsumption} ${item.unit}.`
            : `Sin consumo registrado aún; stock actual por encima del mínimo (${safetyStock} ${item.unit}).`;
      }

      return {
        item,
        dailyAvgConsumption: Math.round(dailyAvg * 100) / 100,
        weeklyProjectedConsumption,
        safetyStock,
        currentStock,
        suggestedPurchase,
        unitCost,
        totalEstimatedCost,
        reason,
        dataSource,
        status,
      };
    });
  }, [inventory, orders, recipes, inventoryMovements, safetyBufferPercent, operationalDays]);

  const totalWeeklyBudget = useMemo(() => {
    return recommendations.reduce((sum, r) => sum + r.totalEstimatedCost, 0);
  }, [recommendations]);

  const criticalCount = recommendations.filter(r => r.status === 'critical').length;
  const warningCount = recommendations.filter(r => r.status === 'warning').length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider bg-white/20 px-2 py-0.5 rounded-md">
                  Operación Lunes a Viernes (7:00 a. m. - 6:00 p. m.)
                </span>
              </div>
              <h2 className="text-xl font-black">Planificador Semanal de Compras</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Control Bar & Summary */}
        <div className="bg-gray-50 border-b border-gray-200 p-4 shrink-0 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-xs">
            <span className="text-gray-500 text-[11px] block">Días de Operación:</span>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min={1}
                max={7}
                value={operationalDays}
                onChange={e => setOperationalDays(Math.max(1, Math.min(7, Number(e.target.value))))}
                className="w-14 px-2 py-1 rounded-lg border border-gray-300 font-black text-sm text-center"
              />
              <span className="font-bold text-gray-700">días / semana</span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-xs">
            <span className="text-gray-500 text-[11px] block">Margen de Seguridad:</span>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min={0}
                max={50}
                value={safetyBufferPercent}
                onChange={e => setSafetyBufferPercent(Math.max(0, Number(e.target.value)))}
                className="w-14 px-2 py-1 rounded-lg border border-gray-300 font-black text-sm text-center"
              />
              <span className="font-bold text-gray-700">% de reserva</span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-xs">
            <span className="text-gray-500 text-[11px] block">Insumos Críticos / Alerta:</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-base font-black text-red-600">{criticalCount}</span>
              <span className="text-gray-400">críticos •</span>
              <span className="text-base font-black text-amber-600">{warningCount}</span>
              <span className="text-gray-400">en reposición</span>
            </div>
          </div>

          <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200 shadow-xs">
            <span className="text-emerald-700 text-[11px] font-bold block">Presupuesto Sugerido:</span>
            <div className="text-base font-black text-emerald-900 mt-1">
              {formatCRC(totalWeeklyBudget)}
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 text-gray-600 uppercase text-[10px] tracking-wider border-b border-gray-200">
                <tr>
                  <th className="py-2.5 px-3">Insumo</th>
                  <th className="py-2.5 px-3">Stock Actual</th>
                  <th className="py-2.5 px-3">Consumo Semanal</th>
                  <th className="py-2.5 px-3">Reserva</th>
                  <th className="py-2.5 px-3 bg-red-50 text-red-800">Sugerencia de Compra</th>
                  <th className="py-2.5 px-3 text-right">Costo Estimado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recommendations.map(rec => (
                  <tr
                    key={rec.item.id}
                    className={`hover:bg-gray-50/80 transition ${
                      rec.status === 'critical' ? 'bg-red-50/40' : ''
                    }`}
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-gray-900">{rec.item.name}</span>
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md ${
                            rec.dataSource === 'historial_real'
                              ? 'bg-emerald-100 text-emerald-800'
                              : rec.dataSource === 'recetas_ventas'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {rec.dataSource === 'historial_real'
                            ? 'Historial real'
                            : rec.dataSource === 'recetas_ventas'
                            ? 'Recetas / ventas'
                            : 'Estimación inicial'}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                        <Info className="w-3 h-3 text-gray-400 shrink-0" />
                        <span>{rec.reason}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-semibold text-gray-800">
                      {rec.currentStock} {rec.item.unit}
                    </td>
                    <td className="py-3 px-3 text-gray-700">
                      {rec.weeklyProjectedConsumption} {rec.item.unit}
                      <span className="text-[10px] text-gray-400 block">
                        ({rec.dailyAvgConsumption}/día)
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-500">
                      {rec.safetyStock} {rec.item.unit}
                    </td>
                    <td className="py-3 px-3 bg-red-50/30">
                      <span
                        className={`font-black text-sm px-2.5 py-1 rounded-lg ${
                          rec.suggestedPurchase > 0
                            ? 'bg-red-600 text-white shadow-xs'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {rec.suggestedPurchase > 0
                          ? `+${rec.suggestedPurchase} ${rec.item.unit}`
                          : 'Abastecido'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-black text-gray-900">
                      {rec.totalEstimatedCost > 0 ? formatCRC(rec.totalEstimatedCost) : '₡0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-gray-500">
            * Cálculo basado en el historial real de comandas, mermas registradas y recetas de Pollos Karen.
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => window.print()}
              className="flex-1 sm:flex-none px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Lista</span>
            </button>
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs transition shadow-md"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
