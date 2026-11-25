import React, { useState, useMemo } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { formatCRC, getCostaRicaDateString } from '../../utils/formatters';
import {
  TrendingUp,
  DollarSign,
  CreditCard,
  ShoppingBag,
  Coins,
  Receipt,
  PiggyBank,
  AlertTriangle,
  Lock,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Layers,
  PieChart,
  BarChart3,
  CheckCircle2,
  FileDown,
} from 'lucide-react';

type DateFilterType = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export const DashboardView: React.FC = () => {
  const { orders, purchases, expenses, cashRegister, recipes } = usePOS();
  const { isAdmin } = useAuth();

  const todayStr = getCostaRicaDateString();
  const [filterType, setFilterType] = useState<DateFilterType>('today');
  const [customStartDate, setCustomStartDate] = useState<string>(todayStr);
  const [customEndDate, setCustomEndDate] = useState<string>(todayStr);

  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-100">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-md border border-gray-200">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-gray-900">Acceso Financiero Denegado</h2>
          <p className="text-xs text-gray-500 mt-2">
            El dashboard financiero, utilidades, costos y márgenes de ganancia están estrictamente restringidos al perfil de Administrador.
          </p>
        </div>
      </div>
    );
  }

  // Calculate Date Bounds
  const { startDate, endDate } = useMemo(() => {
    const today = new Date();
    if (filterType === 'today') {
      return { startDate: todayStr, endDate: todayStr };
    }
    if (filterType === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      return { startDate: yStr, endDate: yStr };
    }
    if (filterType === 'week') {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { startDate: weekAgo.toISOString().split('T')[0], endDate: todayStr };
    }
    if (filterType === 'month') {
      const monthStart = `${todayStr.slice(0, 7)}-01`;
      return { startDate: monthStart, endDate: todayStr };
    }
    // Custom
    return {
      startDate: customStartDate || todayStr,
      endDate: customEndDate || todayStr,
    };
  }, [filterType, customStartDate, customEndDate, todayStr]);

  // Filter Orders in selected range
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.paymentStatus !== 'paid') return false;
      const orderDate = o.operationalDate || o.createdAt.split('T')[0];
      return orderDate >= startDate && orderDate <= endDate;
    });
  }, [orders, startDate, endDate]);

  // Filter Purchases in range
  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => {
      const pDate = p.date || p.createdAt.split('T')[0];
      return pDate >= startDate && pDate <= endDate;
    });
  }, [purchases, startDate, endDate]);

  // Filter Expenses in range
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const eDate = (e.lastPaidAt || e.dueDate || e.createdAt).split('T')[0];
      return eDate >= startDate && eDate <= endDate;
    });
  }, [expenses, startDate, endDate]);

  // Financial Metrics
  const grossSales = filteredOrders.reduce((sum, o) => sum + o.total, 0);
  const tableServiceTotal = filteredOrders.reduce((sum, o) => sum + (o.serviceCharge || 0), 0);
  const netSales = grossSales - tableServiceTotal; // Net revenue for restaurant (service charge goes to staff)

  // Payment Breakdown
  const cashSales = filteredOrders
    .filter(o => o.paymentMethod === 'efectivo')
    .reduce((sum, o) => sum + o.total, 0);
  const sinpeSales = filteredOrders
    .filter(o => o.paymentMethod === 'sinpe')
    .reduce((sum, o) => sum + o.total, 0);
  const cardSales = filteredOrders
    .filter(o => o.paymentMethod === 'tarjeta')
    .reduce((sum, o) => sum + o.total, 0);

  // Real Insumo Consumption Cost based on Recipes
  let totalIngredientsCost = 0;
  let itemsWithoutRecipeCount = 0;

  filteredOrders.forEach(o => {
    o.items.forEach(lineItem => {
      const recipe = recipes.find(r => {
        if (lineItem.isCasado || lineItem.selectedProtein) {
          return (
            r.productId === lineItem.productId &&
            r.protein?.toLowerCase() === lineItem.selectedProtein?.toLowerCase()
          );
        }
        return r.productId === lineItem.productId;
      });

      if (recipe && recipe.calculatedCost) {
        totalIngredientsCost += recipe.calculatedCost * lineItem.quantity;
      } else {
        itemsWithoutRecipeCount += lineItem.quantity;
      }
    });
  });

  const totalPurchases = filteredPurchases.reduce((sum, p) => sum + p.total, 0);
  const totalOperatingExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Gross Profit = Net Sales - Ingredients Cost
  const grossProfit = netSales - totalIngredientsCost;
  const grossMarginPercent = netSales > 0 ? (grossProfit / netSales) * 100 : 0;

  // Net Operating Profit = Gross Profit - Operating Expenses
  const netOperatingProfit = grossProfit - totalOperatingExpenses;
  const netMarginPercent = netSales > 0 ? (netOperatingProfit / netSales) * 100 : 0;

  // Top Products
  const productCounts: Record<string, { name: string; count: number; revenue: number }> = {};
  filteredOrders.forEach(o => {
    o.items.forEach(it => {
      if (!productCounts[it.productId]) {
        productCounts[it.productId] = { name: it.name, count: 0, revenue: 0 };
      }
      productCounts[it.productId].count += it.quantity;
      productCounts[it.productId].revenue += it.subtotal;
    });
  });

  const topProducts = Object.values(productCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-100 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header & Date Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-3xl shadow-xs border border-gray-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-md">
                Auditoría Contable Integral
              </span>
              <span className="text-xs text-gray-500 font-medium">Pollos Karen — La Uruca</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 mt-1">Dashboard Financiero y Rentabilidad</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Rango activo: <strong className="text-gray-800">{startDate}</strong> al{' '}
              <strong className="text-gray-800">{endDate}</strong> ({filteredOrders.length} comandas cobradas)
            </p>
          </div>

          {/* Date Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 p-1.5 rounded-2xl text-xs">
              {[
                { id: 'today', label: 'Hoy' },
                { id: 'yesterday', label: 'Ayer' },
                { id: 'week', label: '7 Días' },
                { id: 'month', label: 'Este Mes' },
                { id: 'custom', label: 'Personalizado' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id as DateFilterType)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition ${
                    filterType === f.id
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filterType === 'custom' && (
              <div className="flex items-center gap-2 text-xs bg-gray-50 p-2 rounded-2xl border border-gray-200">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 rounded-lg border border-gray-300 font-bold text-gray-800"
                />
                <span className="text-gray-400">a</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 rounded-lg border border-gray-300 font-bold text-gray-800"
                />
              </div>
            )}
          </div>
        </div>

        {/* Primary Financial Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Gross Sales */}
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-gray-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Ventas Brutas</span>
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-gray-900">
                {formatCRC(grossSales)}
              </div>
            </div>
            <div className="text-[11px] text-gray-500 mt-3 pt-2 border-t border-gray-100 flex justify-between">
              <span>Servicio de Mesa (10%):</span>
              <span className="font-bold text-gray-800">{formatCRC(tableServiceTotal)}</span>
            </div>
          </div>

          {/* Net Sales */}
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-gray-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Ventas Netas (Restaurante)</span>
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-blue-600">
                {formatCRC(netSales)}
              </div>
            </div>
            <div className="text-[11px] text-gray-500 mt-3 pt-2 border-t border-gray-100">
              Base contable antes de costo de insumos
            </div>
          </div>

          {/* Insumos Consumed Cost */}
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-gray-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Costo Insumos (Recetas)</span>
                <Receipt className="w-5 h-5 text-amber-500" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-amber-600">
                {formatCRC(totalIngredientsCost)}
              </div>
            </div>
            <div className="text-[11px] text-gray-500 mt-3 pt-2 border-t border-gray-100">
              {itemsWithoutRecipeCount > 0 ? (
                <span className="text-amber-700 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {itemsWithoutRecipeCount} porciones sin receta activa
                </span>
              ) : (
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  100% de platillos con costeo real
                </span>
              )}
            </div>
          </div>

          {/* Net Operating Profit */}
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-gray-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Utilidad Neta Operativa</span>
                <PiggyBank className="w-5 h-5 text-emerald-600" />
              </div>
              <div
                className={`text-2xl sm:text-3xl font-black ${
                  netOperatingProfit >= 0 ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {formatCRC(netOperatingProfit)}
              </div>
            </div>
            <div className="text-[11px] text-gray-500 mt-3 pt-2 border-t border-gray-100 flex justify-between">
              <span>Margen Neto:</span>
              <span className="font-bold text-emerald-700">{netMarginPercent.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Financial Flow Structure */}
        <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-4">
          <h3 className="font-black text-lg text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-red-600" />
            <span>Estructura de Rentabilidad en Cascada (P&L)</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200">
              <span className="text-gray-500 text-[11px] font-bold block">1. Ventas Brutas</span>
              <div className="text-lg font-black text-gray-900 mt-1">{formatCRC(grossSales)}</div>
              <span className="text-[10px] text-gray-400">Total facturado a clientes</span>
            </div>

            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200">
              <span className="text-gray-500 text-[11px] font-bold block">2. (-) Serv. Mesa (10%)</span>
              <div className="text-lg font-black text-gray-700 mt-1">{formatCRC(tableServiceTotal)}</div>
              <span className="text-[10px] text-gray-400">Retención ley saloneros</span>
            </div>

            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200">
              <span className="text-amber-800 text-[11px] font-bold block">3. (-) Costo de Insumos</span>
              <div className="text-lg font-black text-amber-900 mt-1">{formatCRC(totalIngredientsCost)}</div>
              <span className="text-[10px] text-amber-700">Materia prima dosificada</span>
            </div>

            <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200">
              <span className="text-purple-800 text-[11px] font-bold block">4. (-) Gastos Operativos</span>
              <div className="text-lg font-black text-purple-900 mt-1">{formatCRC(totalOperatingExpenses)}</div>
              <span className="text-[10px] text-purple-700">Alquiler, luz, agua, gas</span>
            </div>

            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-300">
              <span className="text-emerald-800 text-[11px] font-bold block">5. (=) Utilidad Operativa</span>
              <div className="text-lg font-black text-emerald-700 mt-1">{formatCRC(netOperatingProfit)}</div>
              <span className="text-[10px] text-emerald-800">Resultado neto real</span>
            </div>
          </div>
        </div>

        {/* Methods Breakdown and Top Sellers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Payment Methods */}
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-4">
            <h3 className="font-black text-lg text-gray-900">Ingresos por Método de Pago</h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="flex items-center gap-1.5 text-gray-700">
                    <Coins className="w-4 h-4 text-emerald-600" />
                    <span>Efectivo en Caja</span>
                  </span>
                  <span className="text-gray-900">
                    {formatCRC(cashSales)} ({grossSales > 0 ? ((cashSales / grossSales) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${grossSales > 0 ? (cashSales / grossSales) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="flex items-center gap-1.5 text-gray-700">
                    <DollarSign className="w-4 h-4 text-blue-600" />
                    <span>SINPE Móvil</span>
                  </span>
                  <span className="text-gray-900">
                    {formatCRC(sinpeSales)} ({grossSales > 0 ? ((sinpeSales / grossSales) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${grossSales > 0 ? (sinpeSales / grossSales) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="flex items-center gap-1.5 text-gray-700">
                    <CreditCard className="w-4 h-4 text-purple-600" />
                    <span>Tarjeta de Crédito / Débito</span>
                  </span>
                  <span className="text-gray-900">
                    {formatCRC(cardSales)} ({grossSales > 0 ? ((cardSales / grossSales) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full"
                    style={{ width: `${grossSales > 0 ? (cardSales / grossSales) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Selling Products */}
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-4">
            <h3 className="font-black text-lg text-gray-900">Platillos Más Vendidos</h3>
            {topProducts.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">
                Aún no hay comandas cobradas en el período seleccionado.
              </p>
            ) : (
              <div className="space-y-3">
                {topProducts.map((prod, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs border-b border-gray-100 pb-2 last:border-b-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-red-100 text-red-700 font-black flex items-center justify-center text-[11px]">
                        #{idx + 1}
                      </span>
                      <span className="font-bold text-gray-900">{prod.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-gray-900">{prod.count} porciones</div>
                      <div className="text-[11px] text-gray-500">{formatCRC(prod.revenue)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
