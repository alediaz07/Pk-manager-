import React, { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { ProductItem, ServiceType, CasadoProtein, RestaurantTable, RestaurantOrder } from '../../types';
import { formatCRC } from '../../utils/formatters';
import {
  FINANCIAL_STATUS_LABELS,
  OPERATIONAL_STATUS_LABELS,
  resolveFinancialStatus,
  resolveOperationalStatus,
} from '../../utils/orderStateMachine';
import { printPreCuenta } from '../../utils/thermalPrinter';
import { CasadoProteinModal } from './CasadoProteinModal';
import { PaymentModal } from './PaymentModal';
import { KitchenTicketModal } from './KitchenTicketModal';
import { ActiveOrdersModal } from './ActiveOrdersModal';
import {
  UtensilsCrossed,
  ShoppingBag,
  Bike,
  Plus,
  Minus,
  Trash2,
  Printer,
  CreditCard,
  Save,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Search,
  ClipboardList,
  Ban,
  FilePlus2,
  ArrowRightLeft,
  Receipt,
  PackageCheck,
} from 'lucide-react';

export const POSView: React.FC = () => {
  const {
    categories,
    products,
    tables,
    selectedTable,
    selectTable,
    orders,
    restaurantConfig,
    currentOrder,
    setCurrentOrder,
    createNewOrder,
    addItemToCurrentOrder,
    updateOrderItemQuantity,
    removeOrderItem,
    setOrderObservations,
    setOrderDeliveryDetails,
    saveActiveOrder,
    updateOrderStatus,
    markOrderDelivered,
    transferTableOrder,
    cancelOrder,
    printOrderTicket,
    activeTicketToPrint,
    setActiveTicketToPrint,
  } = usePOS();
  const { isAdmin } = useAuth();

  const [activeCategoryId, setActiveCategoryId] = useState<string>('cat-casados');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [casadoModalProduct, setCasadoModalProduct] = useState<ProductItem | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [isActiveOrdersOpen, setIsActiveOrdersOpen] = useState<boolean>(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState<boolean>(false);
  const [transferTargetTableId, setTransferTargetTableId] = useState<string>('');
  const [orderToPay, setOrderToPay] = useState<RestaurantOrder | null>(null);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState<boolean>(false);
  const [cancelReasonInput, setCancelReasonInput] = useState<string>('');
  const [cancelDisposition, setCancelDisposition] = useState<'restored' | 'waste' | 'none'>('restored');
  const [isNotesOpen, setIsNotesOpen] = useState<boolean>(false);
  const [isSavingOrder, setIsSavingOrder] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto-initialize default table order if none is active on mount
  useEffect(() => {
    if (!currentOrder && !selectedTable && tables.length > 0) {
      const defaultTable = tables.find(t => t.active && t.status === 'libre') || tables.find(t => t.active) || tables[0];
      if (defaultTable) {
        selectTable(defaultTable);
      }
    }
  }, [tables.length]);

  // If no order is active, initialize default table or ventana order
  const activeServiceType: ServiceType = currentOrder ? currentOrder.serviceType : 'mesa';

  const activeUnpaidOrders = orders.filter(
    o => o.paymentStatus !== 'paid' && o.status !== 'cancelled'
  );

  const handleSelectService = (type: ServiceType) => {
    setSaveFeedback(null);
    if (type === 'mesa') {
      const freeTable = tables.find(t => t.active && t.status === 'libre') || tables.find(t => t.active) || tables[0];
      selectTable(freeTable);
    } else {
      selectTable(null);
      const newOrder = createNewOrder(type);
      setCurrentOrder(newOrder);
    }
  };

  const handleStartFreshOrder = () => {
    setSaveFeedback(null);
    if (activeServiceType === 'mesa' && selectedTable) {
      const newOrd = createNewOrder('mesa', selectedTable);
      setCurrentOrder(newOrd);
    } else {
      const newOrd = createNewOrder(activeServiceType);
      setCurrentOrder(newOrd);
    }
  };

  const handleProductClick = (product: ProductItem) => {
    setSaveFeedback(null);
    if (product.isCasado) {
      setCasadoModalProduct(product);
    } else {
      addItemToCurrentOrder(product);
    }
  };

  const handleConfirmCasado = (protein: CasadoProtein, notes: string) => {
    if (casadoModalProduct) {
      addItemToCurrentOrder(casadoModalProduct, protein, notes);
      setCasadoModalProduct(null);
    }
  };

  const handleSaveOrder = async () => {
    if (!currentOrder || currentOrder.items.length === 0 || isSavingOrder) return;
    setIsSavingOrder(true);
    setSaveFeedback(null);
    const res = await saveActiveOrder();
    setIsSavingOrder(false);
    if (res.success && res.order) {
      setSaveFeedback({
        type: 'success',
        message: `Comanda ${res.order.orderNumber} guardada correctamente.`,
      });
      setTimeout(() => setSaveFeedback(null), 4000);
    } else {
      setSaveFeedback({
        type: 'error',
        message: res.error || 'No se pudo guardar la comanda.',
      });
    }
  };

  const handleSaveAndPrint = async () => {
    if (!currentOrder || currentOrder.items.length === 0 || isSavingOrder) return;
    setIsSavingOrder(true);
    setSaveFeedback(null);
    const res = await saveActiveOrder();
    setIsSavingOrder(false);
    if (res.success && res.order) {
      setSaveFeedback({
        type: 'success',
        message: `Comanda ${res.order.orderNumber} guardada; impresión solicitada.`,
      });
      printOrderTicket(res.order);
      setTimeout(() => setSaveFeedback(null), 4000);
    } else {
      setSaveFeedback({
        type: 'error',
        message: res.error || 'No se pudo guardar la comanda.',
      });
    }
  };

  const handleConfirmCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrder || !cancelReasonInput.trim()) return;

    try {
      await cancelOrder(currentOrder.id, cancelReasonInput.trim(), cancelDisposition);
      setIsCancelConfirmOpen(false);
      setCancelReasonInput('');
      setCancelDisposition('restored');
      setSaveFeedback({
        type: 'success',
        message: `Comanda ${currentOrder.orderNumber} anulada correctamente.`,
      });
    } catch (err: any) {
      setSaveFeedback({
        type: 'error',
        message: err.message || 'Error al anular la orden.',
      });
    }
  };

  const handleConfirmTransferTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrder || !transferTargetTableId) return;
    const res = await transferTableOrder(currentOrder.id, transferTargetTableId);
    if (res.success) {
      const target = tables.find(t => t.id === transferTargetTableId);
      if (target) selectTable(target);
      setIsTransferModalOpen(false);
      setTransferTargetTableId('');
      setSaveFeedback({
        type: 'success',
        message: `Comanda transferida a ${target?.name || 'la nueva mesa'}.`,
      });
    } else {
      setSaveFeedback({
        type: 'error',
        message: res.error || 'No se pudo transferir la mesa.',
      });
    }
  };

  const filteredProducts = products.filter(p => {
    if (!p.active) return false;
    const matchesCategory = activeCategoryId === 'all' || p.categoryId === activeCategoryId;
    const matchesSearch =
      !searchQuery.trim() ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-gray-100">
      {/* Left: Product Catalog & Touchpad */}
      <div className="flex-1 flex flex-col overflow-hidden p-3 lg:p-4">
        {/* Service Type Tabs & Active Orders Hub */}
        <div className="flex items-center gap-2 mb-3 bg-white p-1.5 rounded-2xl shadow-xs border border-gray-200 flex-wrap sm:flex-nowrap">
          <button
            onClick={() => handleSelectService('mesa')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl font-bold text-xs sm:text-sm transition ${
              activeServiceType === 'mesa'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <UtensilsCrossed className="w-4 h-4" />
            <span>Mesa (+10%)</span>
          </button>

          <button
            onClick={() => handleSelectService('ventana')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl font-bold text-xs sm:text-sm transition ${
              activeServiceType === 'ventana'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Ventana</span>
          </button>

          <button
            onClick={() => handleSelectService('expres')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl font-bold text-xs sm:text-sm transition ${
              activeServiceType === 'expres'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Bike className="w-4 h-4" />
            <span>Exprés</span>
          </button>

          {/* Active Orders Launcher Badge */}
          <button
            onClick={() => setIsActiveOrdersOpen(true)}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-bold text-xs sm:text-sm bg-gray-900 text-white hover:bg-black transition shadow-xs shrink-0"
            title="Ver comandas activas"
          >
            <ClipboardList className="w-4 h-4 text-amber-400" />
            <span>Comandas ({activeUnpaidOrders.length})</span>
          </button>
        </div>

        {/* Mesa Picker Selector when service is Mesa */}
        {activeServiceType === 'mesa' && (
          <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 text-xs">
            <span className="font-bold text-gray-500 uppercase tracking-wider shrink-0 text-[11px]">
              Mesa:
            </span>
            {tables
              .filter(t => t.active)
              .map(table => {
                const isSelected = selectedTable?.id === table.id;
                const isOccupied = table.status === 'activa';
                return (
                  <button
                    key={table.id}
                    onClick={() => selectTable(table)}
                    className={`px-3 py-1.5 rounded-xl font-bold shrink-0 transition flex items-center gap-1.5 border ${
                      isSelected
                        ? 'bg-red-600 text-white border-red-600 shadow-xs'
                        : isOccupied
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <span>{table.name}</span>
                    {isOccupied && !isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                    )}
                  </button>
                );
              })}
          </div>
        )}

        {/* Quick Search & Categories Pills */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white border border-gray-200 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Categories Pills */}
        <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setActiveCategoryId('all')}
            className={`px-3 py-1.5 rounded-xl font-bold shrink-0 transition ${
              activeCategoryId === 'all'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            Todos
          </button>
          {categories
            .filter(c => c.active)
            .map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={`px-3.5 py-1.5 rounded-xl font-bold shrink-0 transition flex items-center gap-1.5 ${
                  activeCategoryId === cat.id
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <span>{cat.name}</span>
              </button>
            ))}
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pr-1 pb-16 lg:pb-2">
          {filteredProducts.map(product => {
            return (
              <button
                key={product.id}
                onClick={() => handleProductClick(product)}
                className="group bg-white rounded-2xl p-3.5 border border-gray-200 hover:border-red-400 hover:shadow-md transition text-left flex flex-col justify-between active:scale-98 cursor-pointer relative overflow-hidden"
              >
                {product.isCasado && (
                  <div className="absolute top-2 right-2 bg-amber-500 text-white text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shadow-xs">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Casado</span>
                  </div>
                )}

                <div>
                  <h4 className="font-extrabold text-gray-900 text-sm leading-snug group-hover:text-red-600 transition">
                    {product.name}
                  </h4>
                  {product.description && (
                    <p className="text-[11px] text-gray-500 line-clamp-2 mt-1 leading-tight">
                      {product.description}
                    </p>
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
                  <span className="font-black text-red-600 text-sm">
                    {formatCRC(product.price)}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition">
                    <Plus className="w-4 h-4" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Active Order Cart (Tablet Touchscreen Friendly) */}
      <div className="w-full lg:w-96 bg-white border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col shadow-lg shrink-0 max-h-[50vh] lg:max-h-full">
        {/* Cart Header */}
        <div className="p-3.5 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-base text-gray-900">
                {currentOrder ? currentOrder.orderNumber : 'Nueva Orden'}
              </span>
              <span className="text-[11px] font-bold uppercase bg-red-100 text-red-700 px-2 py-0.5 rounded-md">
                {currentOrder?.serviceType.toUpperCase()}
                {currentOrder?.tableName ? ` • ${currentOrder.tableName}` : ''}
              </span>
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>{currentOrder ? `${currentOrder.items.length} prod.` : 'Seleccione productos'}</span>
              {currentOrder && (
                <>
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                    {OPERATIONAL_STATUS_LABELS[resolveOperationalStatus(currentOrder)]}
                  </span>
                  <span
                    className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      resolveFinancialStatus(currentOrder) === 'paid'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {FINANCIAL_STATUS_LABELS[resolveFinancialStatus(currentOrder)]}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {currentOrder?.serviceType === 'mesa' && currentOrder.items.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTransferTargetTableId('');
                  setIsTransferModalOpen(true);
                }}
                className="p-2 rounded-xl text-xs font-bold bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 transition"
                title="Transferir comanda a otra mesa"
              >
                <ArrowRightLeft className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleStartFreshOrder}
              className="p-2 rounded-xl text-xs font-bold bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 transition"
              title="Iniciar una comanda nueva"
            >
              <FilePlus2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsNotesOpen(!isNotesOpen)}
              className={`p-2 rounded-xl text-xs font-bold transition border ${
                currentOrder?.observations
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
              title="Observaciones generales para cocina"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Exprés Delivery Details Panel */}
        {currentOrder?.serviceType === 'expres' && (
          <div className="p-3 bg-blue-50/70 border-b border-blue-200 text-xs space-y-2">
            <div className="flex items-center justify-between font-bold text-blue-950">
              <span className="flex items-center gap-1.5">
                <Bike className="w-3.5 h-3.5 text-blue-700" />
                Datos Envío Exprés (Radio ≤ {restaurantConfig.expressMaxRadiusKm} km)
              </span>
              <span className="text-[11px] bg-blue-100 text-blue-900 px-2 py-0.5 rounded-md">
                Tarifa: {formatCRC(restaurantConfig.expressDeliveryFee)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="text"
                value={currentOrder.deliveryDetails?.customerName || ''}
                onChange={e =>
                  setOrderDeliveryDetails({
                    customerName: e.target.value,
                    customerPhone: currentOrder.deliveryDetails?.customerPhone || '',
                    address: currentOrder.deliveryDetails?.address || '',
                    reference: currentOrder.deliveryDetails?.reference || '',
                    deliveryFee: restaurantConfig.expressDeliveryFee,
                    withinCoverage1Km: currentOrder.deliveryDetails?.withinCoverage1Km ?? true,
                  })
                }
                placeholder="Nombre cliente"
                className="px-2.5 py-1.5 bg-white rounded-lg border border-blue-200 text-xs"
              />
              <input
                type="tel"
                value={currentOrder.deliveryDetails?.customerPhone || ''}
                onChange={e =>
                  setOrderDeliveryDetails({
                    customerName: currentOrder.deliveryDetails?.customerName || '',
                    customerPhone: e.target.value,
                    address: currentOrder.deliveryDetails?.address || '',
                    reference: currentOrder.deliveryDetails?.reference || '',
                    deliveryFee: restaurantConfig.expressDeliveryFee,
                    withinCoverage1Km: currentOrder.deliveryDetails?.withinCoverage1Km ?? true,
                  })
                }
                placeholder="Teléfono"
                className="px-2.5 py-1.5 bg-white rounded-lg border border-blue-200 text-xs"
              />
            </div>
            <input
              type="text"
              value={currentOrder.deliveryDetails?.address || ''}
              onChange={e =>
                setOrderDeliveryDetails({
                  customerName: currentOrder.deliveryDetails?.customerName || '',
                  customerPhone: currentOrder.deliveryDetails?.customerPhone || '',
                  address: e.target.value,
                  reference: currentOrder.deliveryDetails?.reference || '',
                  deliveryFee: restaurantConfig.expressDeliveryFee,
                  withinCoverage1Km: currentOrder.deliveryDetails?.withinCoverage1Km ?? true,
                })
              }
              placeholder="Dirección exacta en La Uruca / punto de referencia"
              className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-blue-200 text-xs"
            />
          </div>
        )}

        {/* Observations box toggle */}
        {isNotesOpen && (
          <div className="p-3 bg-amber-50 border-b border-amber-200 text-xs">
            <label className="block font-bold text-amber-900 mb-1">
              Observaciones Generales de la Orden:
            </label>
            <textarea
              value={currentOrder?.observations || ''}
              onChange={e => setOrderObservations(e.target.value)}
              placeholder="Ej. Mesa junta con familia Pérez, entregar todo junto..."
              rows={2}
              className="w-full p-2 bg-white rounded-xl border border-amber-300 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none resize-none"
            />
          </div>
        )}

        {/* Order Items List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {(!currentOrder || currentOrder.items.length === 0) ? (
            <div className="h-48 flex flex-col items-center justify-center text-gray-400 text-center p-4">
              <UtensilsCrossed className="w-10 h-10 stroke-1 mb-2 text-gray-300" />
              <p className="text-sm font-semibold text-gray-500">Comanda vacía</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Toque cualquier producto del menú a la izquierda para agregarlo.
              </p>
            </div>
          ) : (
            currentOrder.items.map(item => (
              <div
                key={item.id}
                className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex items-start justify-between gap-2 text-xs"
              >
                <div className="flex-1">
                  <div className="font-extrabold text-gray-900">{item.name}</div>
                  {item.selectedProtein && (
                    <div className="text-red-700 font-bold text-[11px] mt-0.5">
                      Proteína: {item.selectedProtein}
                    </div>
                  )}
                  {item.notes && (
                    <div className="text-gray-500 italic text-[11px] mt-0.5">
                      * {item.notes}
                    </div>
                  )}
                  <div className="font-bold text-gray-600 mt-1">
                    {formatCRC(item.price)} c/u
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="font-black text-gray-900 text-sm">
                    {formatCRC(item.subtotal)}
                  </span>
                  <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5 shadow-2xs">
                    <button
                      onClick={() => updateOrderItemQuantity(item.id, -1)}
                      className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:bg-gray-100 active:bg-gray-200"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center font-bold text-xs">{item.quantity}</span>
                    <button
                      onClick={() => updateOrderItemQuantity(item.id, 1)}
                      className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:bg-gray-100 active:bg-gray-200"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => removeOrderItem(item.id)}
                      className="w-6 h-6 rounded flex items-center justify-center text-red-500 hover:bg-red-50 ml-1"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals & Actions */}
        <div className="p-3.5 border-t border-gray-200 bg-gray-50 space-y-2.5">
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal:</span>
              <span className="font-semibold">{formatCRC(currentOrder?.subtotal || 0)}</span>
            </div>

            {/* Service Charge (10% ONLY for mesa) or Delivery Fee (ONLY for expres) */}
            {currentOrder?.serviceType === 'mesa' ? (
              <div className="flex justify-between text-red-700 font-bold">
                <span>Servicio de Mesa (10%):</span>
                <span>{formatCRC(currentOrder?.serviceCharge || 0)}</span>
              </div>
            ) : currentOrder?.serviceType === 'expres' ? (
              <div className="flex justify-between text-blue-700 font-bold">
                <span>Tarifa Envío Exprés:</span>
                <span>{formatCRC(currentOrder?.deliveryFee || 0)}</span>
              </div>
            ) : (
              <div className="flex justify-between text-gray-400 text-[11px]">
                <span>Servicio 10% (Solo para mesa):</span>
                <span>₡0</span>
              </div>
            )}

            <div className="flex justify-between text-base font-black text-gray-950 pt-1 border-t border-gray-200">
              <span>TOTAL:</span>
              <span className="text-red-600">{formatCRC(currentOrder?.total || 0)}</span>
            </div>
          </div>

          {/* Save Feedback Banner */}
          {saveFeedback && (
            <div
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                saveFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              {saveFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span className="flex-1">{saveFeedback.message}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              disabled={!currentOrder || currentOrder.items.length === 0 || isSavingOrder}
              onClick={handleSaveAndPrint}
              className="py-2.5 px-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingOrder ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Printer className="w-3.5 h-3.5" />
              )}
              <span>Guardar e imprimir</span>
            </button>

            <button
              disabled={!currentOrder || currentOrder.items.length === 0 || isSavingOrder}
              onClick={handleSaveOrder}
              className="py-2.5 px-2 bg-white border border-gray-300 text-gray-800 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 hover:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingOrder ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
              ) : (
                <Save className="w-3.5 h-3.5 text-red-600" />
              )}
              <span>{isSavingOrder ? 'Guardando...' : 'Guardar comanda'}</span>
            </button>
          </div>

          {/* Precuenta & Operational Delivery separation */}
          {currentOrder && currentOrder.items.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => printPreCuenta(currentOrder, restaurantConfig.printerWidth)}
                className="py-2 px-2 bg-white hover:bg-gray-100 text-gray-700 font-bold text-[11px] rounded-xl flex items-center justify-center gap-1 border border-gray-200 transition"
              >
                <Receipt className="w-3.5 h-3.5 text-gray-500" />
                <span>Precuenta</span>
              </button>

              {resolveOperationalStatus(currentOrder) !== 'delivered' &&
              resolveOperationalStatus(currentOrder) !== 'cancelled' ? (
                <button
                  type="button"
                  onClick={() => markOrderDelivered(currentOrder.id)}
                  className="py-2 px-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[11px] rounded-xl flex items-center justify-center gap-1 border border-blue-200 transition"
                >
                  <PackageCheck className="w-3.5 h-3.5" />
                  <span>Marcar Entregada</span>
                </button>
              ) : (
                <div className="py-2 px-2 bg-emerald-50 text-emerald-700 font-bold text-[11px] rounded-xl flex items-center justify-center border border-emerald-200">
                  Entregada
                </div>
              )}
            </div>
          )}

          {/* Main Checkout Button */}
          <button
            disabled={!currentOrder || currentOrder.items.length === 0}
            onClick={() => {
              if (currentOrder) {
                setOrderToPay(currentOrder);
                setIsPaymentModalOpen(true);
              }
            }}
            className="w-full py-3 bg-red-600 hover:bg-red-700 active:scale-98 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CreditCard className="w-4 h-4" />
            <span>Cobrar Orden ({formatCRC(currentOrder?.total || 0)})</span>
          </button>

          {/* Admin Cancel Order Button */}
          {isAdmin && currentOrder && currentOrder.items.length > 0 && (
            <button
              type="button"
              onClick={() => setIsCancelConfirmOpen(true)}
              className="w-full py-1.5 text-gray-400 hover:text-red-600 text-[11px] font-bold flex items-center justify-center gap-1 transition"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Anular Comanda</span>
            </button>
          )}
        </div>
      </div>

      {/* Casado Protein Mandatory Picker Modal */}
      {casadoModalProduct && (
        <CasadoProteinModal
          product={casadoModalProduct}
          isOpen={!!casadoModalProduct}
          onClose={() => setCasadoModalProduct(null)}
          onConfirm={handleConfirmCasado}
        />
      )}

      {/* Active Orders Drawer Modal */}
      {isActiveOrdersOpen && (
        <ActiveOrdersModal
          isOpen={isActiveOrdersOpen}
          onClose={() => setIsActiveOrdersOpen(false)}
          orders={orders}
          onSelectOrder={ord => {
            setCurrentOrder(ord);
            if (ord.tableId) {
              const matchedTable = tables.find(t => t.id === ord.tableId);
              if (matchedTable) selectTable(matchedTable);
            }
          }}
          onPayOrder={ord => {
            setOrderToPay(ord);
            setIsPaymentModalOpen(true);
            setIsActiveOrdersOpen(false);
          }}
          onPrintTicket={ord => {
            printOrderTicket(ord);
          }}
          onUpdateStatus={(orderId, status) => {
            updateOrderStatus(orderId, status);
          }}
          onCancelOrder={(orderId, reason, disposition) => {
            cancelOrder(orderId, reason, disposition);
          }}
        />
      )}

      {/* Payment Checkout Modal */}
      {isPaymentModalOpen && (orderToPay || currentOrder) && (
        <PaymentModal
          order={orderToPay || currentOrder!}
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setOrderToPay(null);
          }}
          onSuccess={() => {
            const nextOrder = createNewOrder('mesa');
            setCurrentOrder(nextOrder);
            setOrderToPay(null);
          }}
        />
      )}

      {/* Kitchen Ticket Modal */}
      {activeTicketToPrint && (
        <KitchenTicketModal
          ticket={activeTicketToPrint}
          onClose={() => setActiveTicketToPrint(null)}
        />
      )}

      {/* Transfer Table Modal */}
      {isTransferModalOpen && currentOrder && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleConfirmTransferTable}
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-xs"
          >
            <h3 className="font-black text-lg text-gray-900">
              Transferir {currentOrder.orderNumber} a otra Mesa
            </h3>
            <p className="text-gray-500">
              Seleccione una mesa libre para mover esta comanda sin perder sus productos ni su historial.
            </p>
            <select
              required
              value={transferTargetTableId}
              onChange={e => setTransferTargetTableId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-white font-bold"
            >
              <option value="">-- Seleccionar mesa libre --</option>
              {tables
                .filter(t => t.active && t.status === 'libre' && t.id !== currentOrder.tableId)
                .map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-gray-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white font-bold"
              >
                Transferir
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cancel Comanda Modal (Admin confirmation with reason + inventory disposition) */}
      {isCancelConfirmOpen && currentOrder && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200">
          <form
            onSubmit={handleConfirmCancelOrder}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-2 text-red-600">
              <Ban className="w-5 h-5" />
              <h3 className="font-black text-lg text-gray-900">Anular Orden {currentOrder.orderNumber}</h3>
            </div>
            <p className="text-xs text-gray-500">
              La orden será anulada, la mesa {currentOrder.tableName || ''} será liberada y el evento quedará en auditoría.
            </p>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Motivo obligatorio de anulación:
              </label>
              <input
                type="text"
                required
                value={cancelReasonInput}
                onChange={e => setCancelReasonInput(e.target.value)}
                placeholder="Ej. Cliente canceló pedido..."
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="block font-bold text-gray-700">
                Disposición de insumos en inventario:
              </label>
              <label className="flex items-start gap-2 p-2.5 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="invDisp"
                  checked={cancelDisposition === 'restored'}
                  onChange={() => setCancelDisposition('restored')}
                  className="mt-0.5 text-red-600"
                />
                <span>
                  <strong>No se preparó en cocina:</strong> restituir insumos al inventario.
                </span>
              </label>
              <label className="flex items-start gap-2 p-2.5 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="invDisp"
                  checked={cancelDisposition === 'waste'}
                  onChange={() => setCancelDisposition('waste')}
                  className="mt-0.5 text-red-600"
                />
                <span>
                  <strong>Ya se preparó / cocinó:</strong> registrar como merma (NO devolver al stock).
                </span>
              </label>
              <label className="flex items-start gap-2 p-2.5 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="invDisp"
                  checked={cancelDisposition === 'none'}
                  onChange={() => setCancelDisposition('none')}
                  className="mt-0.5 text-red-600"
                />
                <span>
                  <strong>Sin movimiento de inventario.</strong>
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsCancelConfirmOpen(false);
                  setCancelReasonInput('');
                }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50"
              >
                Volver
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md transition"
              >
                Confirmar Anulación
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
