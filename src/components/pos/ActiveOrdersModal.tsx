import React, { useState } from 'react';
import { RestaurantOrder, OrderStatus, ServiceType } from '../../types';
import { formatCRC, formatDateTime } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  Clock,
  UtensilsCrossed,
  ShoppingBag,
  Bike,
  CheckCircle2,
  Printer,
  CreditCard,
  Ban,
  ArrowRight,
  ChefHat,
  Search,
} from 'lucide-react';

interface ActiveOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: RestaurantOrder[];
  onSelectOrder: (order: RestaurantOrder) => void;
  onPayOrder: (order: RestaurantOrder) => void;
  onPrintTicket: (order: RestaurantOrder) => void;
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
  onCancelOrder: (orderId: string, reason: string) => void;
}

export const ActiveOrdersModal: React.FC<ActiveOrdersModalProps> = ({
  isOpen,
  onClose,
  orders,
  onSelectOrder,
  onPayOrder,
  onPrintTicket,
  onUpdateStatus,
  onCancelOrder,
}) => {
  const { isAdmin } = useAuth();
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');

  if (!isOpen) return null;

  const activeOrders = orders.filter(
    o => o.paymentStatus !== 'paid' && o.status !== 'cancelled'
  );

  const filtered = activeOrders.filter(o => {
    const matchesType = filterType === 'all' || o.serviceType === filterType;
    const matchesSearch =
      !search.trim() ||
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      (o.tableName && o.tableName.toLowerCase().includes(search.toLowerCase())) ||
      o.items.some(i => i.name.toLowerCase().includes(search.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const handleConfirmCancel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingOrderId || !cancelReason.trim()) return;
    onCancelOrder(cancellingOrderId, cancelReason.trim());
    setCancellingOrderId(null);
    setCancelReason('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-md">
                Control Operativo
              </span>
              <span className="text-xs text-gray-500 font-medium">Pollos Karen</span>
            </div>
            <h2 className="text-xl font-black text-gray-900 mt-1">
              Comandas Activas en Salón y Despacho ({activeOrders.length})
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Toque una comanda para verla en pantalla, actualizar su estado de cocina o proceder al cobro.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters & Search */}
        <div className="py-3 flex flex-col sm:flex-row items-center gap-3 border-b border-gray-100">
          <div className="flex items-center gap-1.5 w-full sm:w-auto text-xs overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: `Todas (${activeOrders.length})` },
              { id: 'mesa', label: 'Mesas' },
              { id: 'ventana', label: 'Ventana' },
              { id: 'expres', label: 'Exprés' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterType(tab.id)}
                className={`px-3 py-1.5 rounded-xl font-bold shrink-0 transition ${
                  filterType === tab.id
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar comanda por número, mesa o producto..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Orders List */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <ChefHat className="w-12 h-12 stroke-1 mx-auto mb-2 text-gray-300" />
              <p className="font-bold text-gray-600 text-sm">No hay comandas activas con este filtro</p>
              <p className="text-xs text-gray-400 mt-1">
                Todas las órdenes han sido completadas o cobradas en caja.
              </p>
            </div>
          ) : (
            filtered.map(ord => {
              const ServiceIcon =
                ord.serviceType === 'mesa'
                  ? UtensilsCrossed
                  : ord.serviceType === 'ventana'
                  ? ShoppingBag
                  : Bike;

              return (
                <div
                  key={ord.id}
                  className="bg-gray-50 hover:bg-gray-100/70 rounded-2xl p-4 border border-gray-200 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  {/* Left: Info */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-base text-gray-900">
                        {ord.orderNumber}
                      </span>
                      <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-md flex items-center gap-1 bg-white border border-gray-300 text-gray-700">
                        <ServiceIcon className="w-3 h-3 text-red-600" />
                        <span>
                          {ord.serviceType.toUpperCase()}
                          {ord.tableName ? ` • ${ord.tableName}` : ''}
                        </span>
                      </span>

                      {/* Status Badge with progression trigger */}
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                          ord.status === 'in_kitchen'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : ord.status === 'served'
                            ? 'bg-blue-100 text-blue-800 border-blue-300'
                            : 'bg-gray-200 text-gray-700 border-gray-300'
                        }`}
                      >
                        {ord.status === 'in_kitchen'
                          ? 'En Cocina'
                          : ord.status === 'served'
                          ? 'Servido / Listo'
                          : 'Pendiente'}
                      </span>
                    </div>

                    {/* Items Summary */}
                    <div className="text-xs text-gray-700">
                      {ord.items.map((it, idx) => (
                        <span key={it.id || idx}>
                          <span className="font-bold">{it.quantity}x</span> {it.name}
                          {it.selectedProtein && (
                            <span className="text-red-600 font-semibold"> ({it.selectedProtein})</span>
                          )}
                          {idx < ord.items.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </div>

                    {ord.observations && (
                      <div className="text-[11px] text-amber-900 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 italic">
                        Nota: {ord.observations}
                      </div>
                    )}

                    <div className="text-[11px] text-gray-500 flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-400" />
                        {formatDateTime(ord.createdAt)}
                      </span>
                      {ord.serviceCharge > 0 && (
                        <span className="text-red-600 font-semibold">+10% Servicio de mesa</span>
                      )}
                    </div>
                  </div>

                  {/* Right: Price & Quick Actions */}
                  <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between gap-2.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-200">
                    <div className="font-black text-lg text-gray-950">
                      {formatCRC(ord.total)}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Status Changer Buttons */}
                      {ord.status === 'in_kitchen' && (
                        <button
                          onClick={() => onUpdateStatus(ord.id, 'served')}
                          className="px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-xl text-xs flex items-center gap-1 border border-blue-200 transition"
                          title="Marcar como servida / lista para entrega"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Listo</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          onPrintTicket(ord);
                        }}
                        className="p-2 bg-white hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold border border-gray-300 transition"
                        title="Reimprimir ticket de cocina"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => {
                          onSelectOrder(ord);
                          onClose();
                        }}
                        className="px-3 py-1.5 bg-gray-900 hover:bg-black text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-xs transition"
                      >
                        <span>Abrir</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>

                      <button
                        onClick={() => {
                          onPayOrder(ord);
                        }}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-xs transition"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Cobrar</span>
                      </button>

                      {isAdmin && (
                        <button
                          onClick={() => {
                            setCancellingOrderId(ord.id);
                            setCancelReason('');
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                          title="Anular comanda"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Cancellation Modal Confirmation (Admin Only) */}
        {cancellingOrderId && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
            <form
              onSubmit={handleConfirmCancel}
              className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-2 text-red-600">
                <Ban className="w-5 h-5" />
                <h3 className="font-black text-lg text-gray-900">Anular Comanda</h3>
              </div>
              <p className="text-xs text-gray-500">
                Esta acción cancelará la orden, liberará la mesa asociada y guardará un registro inmutable en auditoría.
              </p>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Motivo obligatorio de anulación:
                </label>
                <input
                  type="text"
                  required
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Ej: Cliente canceló pedido, error de digitación..."
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellingOrderId(null)}
                  className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md transition"
                >
                  Confirmar Anulación
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
