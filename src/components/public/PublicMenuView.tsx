import React, { useState, useEffect, useMemo } from 'react';
import { formatCRC } from '../../utils/formatters';
import {
  ShoppingBag,
  Plus,
  Minus,
  CheckCircle2,
  Clock,
  MapPin,
  AlertCircle,
  Utensils,
  Bike,
  RefreshCw,
} from 'lucide-react';

interface PublicMenuCategory {
  id: string;
  name: string;
  order: number;
  breakfastOnly?: boolean;
}

interface PublicMenuProduct {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  price: number;
  isCasado: boolean;
  proteinOptions?: string[];
  available: boolean;
  breakfastOnly?: boolean;
  dayOfWeek?: number;
}

interface PublicCartItem {
  key: string;
  product: PublicMenuProduct;
  quantity: number;
  protein?: string;
  notes?: string;
}

interface PublicMenuViewProps {
  mode: 'table' | 'expres';
  tableToken?: string;
}

export const PublicMenuView: React.FC<PublicMenuViewProps> = ({ mode, tableToken }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<{
    restaurantName: string;
    location: string;
    phone?: string;
    tableServicePercent: number;
    expressDeliveryFee: number;
    expressCoverageDescription: string;
    categories: PublicMenuCategory[];
    products: PublicMenuProduct[];
  } | null>(null);
  const [schedule, setSchedule] = useState<{
    isOpen: boolean;
    isBreakfastTime: boolean;
    scheduleLabel: string;
    breakfastLabel: string;
  } | null>(null);
  const [validTable, setValidTable] = useState<{ tableId: string; tableName: string } | null>(null);

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [cart, setCart] = useState<PublicCartItem[]>([]);
  const [proteinModalProduct, setProteinModalProduct] = useState<PublicMenuProduct | null>(null);
  const [selectedProtein, setSelectedProtein] = useState('Pollo');
  const [itemNote, setItemNote] = useState('');
  const [observations, setObservations] = useState('');

  // Exprés delivery fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [reference, setReference] = useState('');
  const [withinCoverage, setWithinCoverage] = useState(true);
  const [paymentPref, setPaymentPref] = useState<'efectivo' | 'sinpe'>('efectivo');
  const [changeFor, setChangeFor] = useState('');

  // Submission & Tracking
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [trackingResult, setTrackingResult] = useState<{
    trackingCode: string;
    orderNumber: string;
    total: number;
    operationalStatus: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const loadMenu = async () => {
      setLoading(true);
      try {
        const qs = tableToken ? `?token=${encodeURIComponent(tableToken)}` : '';
        const res = await fetch(`/api/public/menu${qs}`);
        const data = await res.json();
        if (!active) return;
        if (!res.ok || !data.success) {
          setError(data.error || 'El menú digital no está disponible en este momento.');
        } else {
          setCatalog(data.catalog);
          setSchedule(data.schedule);
          setValidTable(data.validTable || null);
          if (mode === 'table' && !data.validTable) {
            setError(
              'El código QR de mesa es inválido o fue renovado. Por favor escanee el QR actualizado en su mesa.'
            );
          }
        }
      } catch {
        if (active) setError('No se pudo conectar con Pollos Karen. Intente nuevamente.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadMenu();
    return () => {
      active = false;
    };
  }, [mode, tableToken]);

  // Poll order tracking status after submission
  useEffect(() => {
    if (!trackingResult?.trackingCode) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/public/order-status/${trackingResult.trackingCode}`);
        const data = await res.json();
        if (res.ok && data.success) {
          setTrackingResult(prev =>
            prev ? { ...prev, operationalStatus: data.operationalStatus } : prev
          );
        }
      } catch {
        // Ignore transient network drops
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [trackingResult?.trackingCode]);

  const filteredProducts = useMemo(() => {
    if (!catalog) return [];
    return catalog.products.filter(p => {
      if (activeCategory !== 'all' && p.categoryId !== activeCategory) return false;
      return true;
    });
  }, [catalog, activeCategory]);

  const addProductToCart = (product: PublicMenuProduct, protein?: string, notes?: string) => {
    const key = `${product.id}__${protein || ''}__${(notes || '').trim()}`;
    setCart(prev => {
      const idx = prev.findIndex(c => c.key === key);
      if (idx >= 0) {
        return prev.map((c, i) => (i === idx ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...prev, { key, product, quantity: 1, protein, notes: notes?.trim() || undefined }];
    });
  };

  const updateCartQty = (key: string, delta: number) => {
    setCart(prev =>
      prev
        .map(c => (c.key === key ? { ...c, quantity: c.quantity + delta } : c))
        .filter(c => c.quantity > 0)
    );
  };

  const subtotal = cart.reduce((s, c) => s + c.product.price * c.quantity, 0);
  const serviceCharge =
    mode === 'table' && catalog ? Math.round(subtotal * (catalog.tableServicePercent / 100)) : 0;
  const deliveryFee = mode === 'expres' && catalog ? catalog.expressDeliveryFee : 0;
  const total = subtotal + serviceCharge + deliveryFee;

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    setSubmitError(null);
    setSubmitting(true);

    try {
      const payload: any = {
        serviceType: mode === 'table' ? 'mesa' : 'expres',
        tableToken: mode === 'table' ? tableToken : undefined,
        items: cart.map(c => ({
          productId: c.product.id,
          quantity: c.quantity,
          protein: c.protein,
          notes: c.notes,
        })),
        observations: observations.trim() || undefined,
      };

      if (mode === 'expres') {
        payload.deliveryDetails = {
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          address: address.trim(),
          reference: reference.trim() || undefined,
          withinCoverageRadius: withinCoverage,
          paymentMethodPreference: paymentPref,
          changeFor: changeFor ? Number(changeFor) : undefined,
        };
      }

      const res = await fetch('/api/public/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSubmitError(data.error || 'No se pudo enviar el pedido.');
      } else {
        setTrackingResult({
          trackingCode: data.trackingCode,
          orderNumber: data.orderNumber,
          total: data.total,
          operationalStatus: data.operationalStatus,
        });
        setCart([]);
      }
    } catch {
      setSubmitError('Error de conexión al enviar su pedido. Intente nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending_auth: {
      label: 'Recibido — Esperando confirmación de recepción',
      color: 'bg-amber-100 text-amber-800 border-amber-300',
    },
    authorized: {
      label: 'Confirmado — Enviado a cocina',
      color: 'bg-sky-100 text-sky-800 border-sky-300',
    },
    in_preparation: {
      label: 'En preparación en cocina',
      color: 'bg-orange-100 text-orange-800 border-orange-300',
    },
    ready: {
      label: mode === 'expres' ? 'Listo — Saliendo a entrega' : 'Listo — Saliendo hacia su mesa',
      color: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    },
    delivered: {
      label: 'Entregado — ¡Buen provecho!',
      color: 'bg-emerald-600 text-white border-emerald-700',
    },
    cancelled: {
      label: 'Pedido cancelado — Consulte con el restaurante',
      color: 'bg-red-100 text-red-800 border-red-300',
    },
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center mx-auto animate-pulse">
            <Utensils className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-gray-700">Cargando menú de Pollos Karen...</p>
        </div>
      </div>
    );
  }

  if (error || !catalog) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 shadow-xl border border-gray-200 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-red-600 mx-auto" />
          <h1 className="text-lg font-black text-gray-900">Menú Digital — Pollos Karen</h1>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (trackingResult) {
    const st = statusLabels[trackingResult.operationalStatus] || statusLabels.pending_auth;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-gray-200 p-6 space-y-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900">¡Pedido Enviado!</h1>
            <p className="text-xs text-gray-500 mt-1">
              {catalog.restaurantName} • {catalog.location}
            </p>
          </div>

          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-1">
            <div className="text-xs text-gray-500 font-semibold">Código de seguimiento</div>
            <div className="text-2xl font-black text-red-600 tracking-wider">
              {trackingResult.trackingCode}
            </div>
            <div className="text-xs font-bold text-gray-700">
              Orden {trackingResult.orderNumber} • Total: {formatCRC(trackingResult.total)}
            </div>
          </div>

          <div className={`px-4 py-3 rounded-2xl border text-xs font-bold ${st.color}`}>
            {st.label}
          </div>

          <p className="text-[11px] text-gray-500 flex items-center justify-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Actualizando estado automáticamente...</span>
          </p>

          <button
            type="button"
            onClick={() => setTrackingResult(null)}
            className="w-full py-3 rounded-xl bg-gray-900 text-white font-bold text-xs cursor-pointer"
          >
            Hacer otro pedido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-28">
      {/* Header */}
      <header className="bg-gradient-to-r from-red-600 to-red-700 text-white p-5 shadow-md">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-wide">
              {catalog.restaurantName}
            </h1>
            <p className="text-xs text-red-100 flex items-center gap-1.5 mt-0.5">
              <MapPin className="w-3.5 h-3.5" />
              <span>{catalog.location}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/15 text-xs font-extrabold">
              {mode === 'table' ? (
                <>
                  <Utensils className="w-3.5 h-3.5" />
                  <span>{validTable?.tableName || 'Pedido en Mesa'} (+10% servicio)</span>
                </>
              ) : (
                <>
                  <Bike className="w-3.5 h-3.5" />
                  <span>Exprés La Uruca ({formatCRC(catalog.expressDeliveryFee)} envío)</span>
                </>
              )}
            </span>
            {schedule && (
              <span className="text-[11px] text-red-100 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {schedule.scheduleLabel}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Catalog Column */}
        <div className="lg:col-span-2 space-y-4">
          {schedule && !schedule.isOpen && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-900 font-semibold">
              Aviso de horario: Actualmente estamos fuera del horario habitual ({schedule.scheduleLabel}). Puede consultar nuestro menú o confirmar disponibilidad con el local.
            </div>
          )}

          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer ${
                activeCategory === 'all'
                  ? 'bg-red-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-700'
              }`}
            >
              Todo el Menú
            </button>
            {catalog.categories.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer ${
                  activeCategory === cat.id
                    ? 'bg-red-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-700'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredProducts.map(prod => (
              <div
                key={prod.id}
                className="bg-white rounded-2xl border border-gray-200 p-4 shadow-xs flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-sm text-gray-900">{prod.name}</h3>
                    <span className="font-black text-sm text-red-600 shrink-0">
                      {formatCRC(prod.price)}
                    </span>
                  </div>
                  {prod.description && (
                    <p className="text-xs text-gray-500 mt-1">{prod.description}</p>
                  )}
                  {prod.breakfastOnly && (
                    <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                      Desayuno (7:00 a.m. – 10:30 a.m.)
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (prod.isCasado) {
                      setSelectedProtein(prod.proteinOptions?.[0] || 'Pollo');
                      setItemNote('');
                      setProteinModalProduct(prod);
                    } else {
                      addProductToCart(prod);
                    }
                  }}
                  className="mt-2 w-full py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{prod.isCasado ? 'Elegir Proteína' : 'Agregar'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Cart & Checkout Column */}
        <aside className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm h-fit space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h2 className="font-black text-sm flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-red-600" />
              <span>Su Pedido ({cart.reduce((s, c) => s + c.quantity, 0)})</span>
            </h2>
          </div>

          {cart.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-6">
              Agregue platillos del menú para comenzar su pedido.
            </p>
          ) : (
            <form onSubmit={handleSubmitOrder} className="space-y-4">
              <div className="space-y-2.5 max-h-60 overflow-y-auto">
                {cart.map(c => (
                  <div
                    key={c.key}
                    className="flex items-center justify-between gap-2 text-xs border-b border-gray-100 pb-2"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-gray-900 truncate">{c.product.name}</div>
                      {c.protein && (
                        <div className="text-[11px] text-red-600 font-semibold">
                          Proteína: {c.protein}
                        </div>
                      )}
                      {c.notes && <div className="text-[11px] text-gray-500 italic">{c.notes}</div>}
                      <div className="text-gray-600 font-semibold">
                        {formatCRC(c.product.price * c.quantity)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateCartQty(c.key, -1)}
                        className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-bold w-5 text-center">{c.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(c.key, 1)}
                        className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {mode === 'expres' && (
                <div className="space-y-2.5 pt-2 border-t border-gray-100">
                  <div className="text-xs font-black text-gray-800">Datos de Entrega Exprés</div>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Nombre completo *"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
                  />
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    placeholder="Teléfono / WhatsApp *"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
                  />
                  <textarea
                    required
                    rows={2}
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="Dirección exacta en La Uruca *"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
                  />
                  <input
                    type="text"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    placeholder="Punto de referencia (opcional)"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
                  />
                  <label className="flex items-start gap-2 text-[11px] text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={withinCoverage}
                      onChange={e => setWithinCoverage(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>Confirmo que la entrega está dentro de {catalog.expressCoverageDescription}.</span>
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentPref('efectivo')}
                      className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                        paymentPref === 'efectivo'
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-gray-700 border-gray-300'
                      }`}
                    >
                      Efectivo
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentPref('sinpe')}
                      className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                        paymentPref === 'sinpe'
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-gray-700 border-gray-300'
                      }`}
                    >
                      SINPE Móvil
                    </button>
                  </div>

                  {paymentPref === 'efectivo' && (
                    <input
                      type="number"
                      min={0}
                      value={changeFor}
                      onChange={e => setChangeFor(e.target.value)}
                      placeholder="¿Con cuánto paga? (para llevar vuelto)"
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
                    />
                  )}
                </div>
              )}

              <input
                type="text"
                value={observations}
                onChange={e => setObservations(e.target.value)}
                placeholder="Observaciones adicionales (opcional)"
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
              />

              <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatCRC(subtotal)}</span>
                </div>
                {serviceCharge > 0 && (
                  <div className="flex justify-between">
                    <span>Servicio de Mesa ({catalog.tableServicePercent}%):</span>
                    <span>{formatCRC(serviceCharge)}</span>
                  </div>
                )}
                {deliveryFee > 0 && (
                  <div className="flex justify-between">
                    <span>Envío Exprés:</span>
                    <span>{formatCRC(deliveryFee)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm pt-1.5 border-t border-gray-200">
                  <span>Total:</span>
                  <span className="text-red-600">{formatCRC(total)}</span>
                </div>
              </div>

              {submitError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Enviando pedido...' : 'Enviar Pedido a Pollos Karen'}
              </button>
              <p className="text-[10px] text-center text-gray-500">
                Su orden será confirmada por recepción antes de enviarse a cocina.
              </p>
            </form>
          )}
        </aside>
      </main>

      {/* Protein Selection Modal for Casados */}
      {proteinModalProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <h3 className="font-black text-base text-gray-900">
              {proteinModalProduct.name} — Seleccione Proteína
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {(proteinModalProduct.proteinOptions || ['Pollo', 'Carne', 'Chuleta', 'Pescado']).map(
                prot => (
                  <button
                    key={prot}
                    type="button"
                    onClick={() => setSelectedProtein(prot)}
                    className={`py-2.5 rounded-xl text-xs font-bold border-2 cursor-pointer ${
                      selectedProtein === prot
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-gray-50 text-gray-800 border-gray-200'
                    }`}
                  >
                    {prot}
                  </button>
                )
              )}
            </div>
            <input
              type="text"
              value={itemNote}
              onChange={e => setItemNote(e.target.value)}
              placeholder="Nota (ej. sin ensalada, salsa aparte)"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setProteinModalProduct(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  addProductToCart(proteinModalProduct, selectedProtein, itemNote);
                  setProteinModalProduct(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-xs cursor-pointer"
              >
                Agregar ({formatCRC(proteinModalProduct.price)})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
