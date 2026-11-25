import React, { useState, useMemo } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { formatCRC, getCostaRicaDateString } from '../../utils/formatters';
import { buildFinancialReportCSV } from '../../utils/backupManager';
import {
  TrendingUp,
  DollarSign,
  CreditCard,
  Coins,
  Receipt,
  PiggyBank,
  AlertTriangle,
  Lock,
  BarChart3,
  CheckCircle2,
  FileDown,
} from 'lucide-react';

type DateFilterType = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export const DashboardView: React.FC = () => {
  const { orders, purchases, expenses, recipes, payments } = usePOS();
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
            El dashboard financiero, utilidades, costos y márgenes están restringidos al Administrador.
          </p>
        </div>
      </div>
    );
  }

  const { startDate, endDate } = useMemo(() => {
    const today = new Date();
    if (filterType === 'today') return { startDate: todayStr, endDate: todayStr };
    if (filterType === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().split('T')[0];
      return { startDate: yStr, endDate: yStr };
    }
    if (filterType === 'week') {
      const w = new Date(today);
      w.setDate(w.getDate() - 7);
      return { startDate: w.toISOString().split('T')[0], endDate: todayStr };
    }
    if (filterType === 'month') {
      return { startDate: `${todayStr.slice(0, 7)}-01`, endDate: todayStr };
    }
    return {
      startDate: customStartDate || todayStr,
      endDate: customEndDate || todayStr,
    };
  }, [filterType, customStartDate, customEndDate, todayStr]);

  const filteredOrders = useMemo(
    () =>
      orders.filter(o => {
        if ((o.paymentStatus !== 'paid' && o.financialStatus !== 'paid') || o.status === 'cancelled')
          return false;
        const d = o.operationalDate || o.createdAt.split('T')[0];
        return d >= startDate && d <= endDate;
      }),
    [orders, startDate, endDate]
  );

  const filteredPurchases = useMemo(
    () =>
      purchases.filter(p => {
        const d = p.date || p.createdAt.split('T')[0];
        return d >= startDate && d <= endDate;
      }),
    [purchases, startDate, endDate]
  );

  const filteredExpenses = useMemo(
    () =>
      expenses.filter(e => {
        const d = (e.lastPaidAt || e.dueDate || e.createdAt).split('T')[0];
        return d >= startDate && d <= endDate;
      }),
    [expenses, startDate, endDate]
  );

  // Accounts Payable total across all unpaid credit purchases
  const totalAccountsPayable = useMemo(
    () =>
      purchases
        .filter(p => p.paymentMethod === 'credito' && p.creditStatus !== 'paid')
        .reduce((sum, p) => sum + Math.max(0, p.total - (p.paidAmount || 0)), 0),
    [purchases]
  );

  const grossSales = filteredOrders.reduce((sum, o) => sum + o.total, 0);
  const tableServiceTotal = filteredOrders.reduce((sum, o) => sum + (o.serviceCharge || 0), 0);
  const deliveryFeesTotal = filteredOrders.reduce((sum, o) => sum + (o.deliveryFee || 0), 0);
  const netSales = grossSales - tableServiceTotal - deliveryFeesTotal;

  // Accurate payment method split (uses persistent payments when available)
  const orderIdsSet = useMemo(() => new Set(filteredOrders.map(o => o.id)), [filteredOrders]);
  const relevantPayments = useMemo(
    () => payments.filter(p => p.status === 'confirmed' && orderIdsSet.has(p.orderId)),
    [payments, orderIdsSet]
  );

  let cashSales = 0;
  let sinpeSales = 0;
  let cardSales = 0;

  if (relevantPayments.length > 0) {
    relevantPayments.forEach(p => {
      if (p.method === 'efectivo') cashSales += p.amount;
      else if (p.method === 'sinpe') sinpeSales += p.amount;
      else if (p.method === 'tarjeta') cardSales += p.amount;
    });
  } else {
    cashSales = filteredOrders
      .filter(o => o.paymentMethod === 'efectivo')
      .reduce((s, o) => s + o.total, 0);
    sinpeSales = filteredOrders
      .filter(o => o.paymentMethod === 'sinpe')
      .reduce((s, o) => s + o.total, 0);
    cardSales = filteredOrders
      .filter(o => o.paymentMethod === 'tarjeta')
      .reduce((s, o) => s + o.total, 0);
  }

  // Real COGS using historicalUnitCost snapshot when available, fallback to active recipe
  let totalIngredientsCost = 0;
  let itemsWithoutRecipeCount = 0;

  filteredOrders.forEach(o => {
    o.items.forEach(lineItem => {
      if (typeof lineItem.historicalUnitCost === 'number' && lineItem.historicalUnitCost > 0) {
        totalIngredientsCost += lineItem.historicalUnitCost * lineItem.quantity;
        return;
      }
      const recipe = recipes.find(r => {
        if (lineItem.selectedProtein) {
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
  const grossProfit = netSales - totalIngredientsCost;
  const grossMarginRatio = netSales > 0 ? grossProfit / netSales : 0;
  const netOperatingProfit = grossProfit - totalOperatingExpenses;
  const netMarginPercent = netSales > 0 ? (netOperatingProfit / netSales) * 100 : 0;
  const breakEvenSales =
    grossMarginRatio > 0.05 ? Math.round(totalOperatingExpenses / grossMarginRatio) : 0;

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

  const handleExportCSV = () => {
    const csv = buildFinancialReportCSV(
      filteredOrders,
      filteredPurchases,
      filteredExpenses,
      `${startDate}_a_${endDate}`
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_financiero_pollos_karen_${startDate}_${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-100 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header & Date Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-3xl shadow-xs border border-gray-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-md">
                Contabilidad Interna
              </span>
              <span className="text-xs text-gray-500 font-medium">Pollos Karen — La Uruca</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 mt-1">
              Dashboard Financiero y Rentabilidad
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Rango: <strong className="text-gray-800">{startDate}</strong> al{' '}
              <strong className="text-gray-800">{endDate}</strong> ({filteredOrders.length} ventas)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 p-1.5 rounded-2xl text-xs">
              {[
                { id: 'today', label: 'Hoy' },
                { id: 'yesterday', label: 'Ayer' },
                { id: 'week', label: '7 Días' },
                { id: 'month', label: 'Mes' },
                { id: 'custom', label: 'Rango' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id as DateFilterType)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
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

            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Primary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between text-gray-500 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Ventas Brutas</span>
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-gray-900">{formatCRC(grossSales)}</div>
            <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 space-y-0.5">
              <div className="flex justify-between">
                <span>Servicio 10%:</span>
                <span className="font-bold">{formatCRC(tableServiceTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Envíos Exprés:</span>
                <span className="font-bold">{formatCRC(deliveryFeesTotal)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between text-gray-500 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Ventas Netas</span>
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-2xl font-black text-blue-600">{formatCRC(netSales)}</div>
            <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 flex justify-between">
              <span>Compras período:</span>
              <span className="font-bold text-gray-800">{formatCRC(totalPurchases)}</span>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between text-gray-500 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Costo Insumos (COGS)</span>
              <Receipt className="w-5 h-5 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-amber-600">
              {formatCRC(totalIngredientsCost)}
            </div>
            <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100">
              {itemsWithoutRecipeCount > 0 ? (
                <span className="text-amber-700 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {itemsWithoutRecipeCount} porciones sin receta
                </span>
              ) : (
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  100% costeado por receta
                </span>
              )}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between text-gray-500 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Utilidad Operativa</span>
              <PiggyBank className="w-5 h-5 text-emerald-600" />
            </div>
            <div
              className={`text-2xl font-black ${
                netOperatingProfit >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {formatCRC(netOperatingProfit)}
            </div>
            <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 flex justify-between">
              <span>Margen Neto:</span>
              <span className="font-bold text-emerald-700">{netMarginPercent.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Break-even & CxP Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-white rounded-2xl p-4 border border-gray-200 flex items-center justify-between">
            <div>
              <div className="font-black text-gray-800">Punto de Equilibrio Estimado (Período)</div>
              <div className="text-gray-500 text-[11px]">
                Ventas netas necesarias para cubrir gastos operativos ({formatCRC(totalOperatingExpenses)})
              </div>
            </div>
            <div className="text-lg font-black text-gray-900">
              {breakEvenSales > 0 ? formatCRC(breakEvenSales) : 'N/A'}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 flex items-center justify-between">
            <div>
              <div className="font-black text-gray-800">Cuentas por Pagar a Proveedores (CxP)</div>
              <div className="text-gray-500 text-[11px]">
                Saldo total pendiente de compras a crédito vigentes
              </div>
            </div>
            <div
              className={`text-lg font-black ${
                totalAccountsPayable > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {formatCRC(totalAccountsPayable)}
            </div>
          </div>
        </div>

        {/* P&L Waterfall */}
        <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-4">
          <h3 className="font-black text-lg text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-red-600" />
            <span>Estado de Resultados Interno (P&amp;L)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200">
              <span className="text-gray-500 text-[11px] font-bold block">1. Ventas Brutas</span>
              <div className="text-lg font-black text-gray-900 mt-1">{formatCRC(grossSales)}</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200">
              <span className="text-gray-500 text-[11px] font-bold block">2. (-) 10% y Exprés</span>
              <div className="text-lg font-black text-gray-700 mt-1">
                {formatCRC(tableServiceTotal + deliveryFeesTotal)}
              </div>
            </div>
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200">
              <span className="text-amber-800 text-[11px] font-bold block">3. (-) COGS Recetas</span>
              <div className="text-lg font-black text-amber-900 mt-1">
                {formatCRC(totalIngredientsCost)}
              </div>
            </div>
            <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200">
              <span className="text-purple-800 text-[11px] font-bold block">4. (-) Gastos Operativos</span>
              <div className="text-lg font-black text-purple-900 mt-1">
                {formatCRC(totalOperatingExpenses)}
              </div>
            </div>
            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-300">
              <span className="text-emerald-800 text-[11px] font-bold block">5. (=) Utilidad Neta</span>
              <div className="text-lg font-black text-emerald-700 mt-1">
                {formatCRC(netOperatingProfit)}
              </div>
            </div>
          </div>
        </div>

        {/* Methods Breakdown and Top Sellers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-4">
            <h3 className="font-black text-lg text-gray-900">Ingresos por Método de Pago</h3>
            <div className="space-y-3 text-xs">
              {[
                { label: 'Efectivo', amount: cashSales, color: 'bg-emerald-500', Icon: Coins },
                { label: 'SINPE Móvil', amount: sinpeSales, color: 'bg-blue-500', Icon: DollarSign },
                { label: 'Tarjeta', amount: cardSales, color: 'bg-purple-500', Icon: CreditCard },
              ].map(({ label, amount, color, Icon }) => {
                const pct = grossSales > 0 ? (amount / grossSales) * 100 : 0;
                return (
                  <div key={label}>
                    <div className="flex justify-between font-bold mb-1">
                      <span className="flex items-center gap-1.5 text-gray-700">
                        <Icon className="w-4 h-4" />
                        {label}
                      </span>
                      <span>
                        {formatCRC(amount)} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-4">
            <h3 className="font-black text-lg text-gray-900">Platillos Más Vendidos</h3>
            {topProducts.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">
                Aún no hay ventas registradas en este rango.
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
