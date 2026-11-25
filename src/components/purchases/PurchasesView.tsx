import React, { useState, useRef } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { PurchaseLineItem, UnitOfMeasure } from '../../types';
import { formatCRC, formatDateTime, getCostaRicaDateString } from '../../utils/formatters';
import { auth } from '../../config/firebase';
import {
  Camera,
  Upload,
  Plus,
  Trash2,
  Sparkles,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Building2,
  Calendar,
} from 'lucide-react';

export const PurchasesView: React.FC = () => {
  const { purchases, addPurchase, inventory, isOnline } = usePOS();
  const { isAdmin } = useAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [vendor, setVendor] = useState('');
  const [date, setDate] = useState(getCostaRicaDateString());
  const [purchaseNumber, setPurchaseNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'transferencia' | 'tarjeta' | 'credito'>('efectivo');
  const [paidFromCashRegister, setPaidFromCashRegister] = useState(true);
  const [notes, setNotes] = useState('');

  const [items, setItems] = useState<PurchaseLineItem[]>([
    {
      name: '',
      normalizedName: '',
      quantity: 1,
      unit: 'kg',
      unitCost: 0,
      totalCost: 0,
    },
  ]);

  // AI Scanner & Feedback state
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-100">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-md border border-gray-200">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-gray-900">Acceso Restringido</h2>
          <p className="text-xs text-gray-500 mt-2">
            El registro de compras, costos y escaneo de facturas con IA está reservado exclusivamente para cuentas con rol de Administrador.
          </p>
        </div>
      </div>
    );
  }

  const grandTotal = items.reduce((acc, item) => acc + (Number(item.totalCost) || 0), 0);

  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      {
        name: '',
        normalizedName: '',
        quantity: 1,
        unit: 'kg',
        unitCost: 0,
        totalCost: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: keyof PurchaseLineItem, value: any) => {
    setItems(prev =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item, [field]: value };

        // Automatic Unit Cost Calculation: Costo unitario = costo total / cantidad
        if (field === 'totalCost' || field === 'quantity') {
          const qty = field === 'quantity' ? Number(value) : item.quantity;
          const tot = field === 'totalCost' ? Number(value) : item.totalCost;
          if (qty > 0 && tot >= 0) {
            updated.unitCost = Math.round(tot / qty);
          }
        }
        return updated;
      })
    );
  };

  // AI Invoice Scanner via Express backend endpoint
  const handleScanInvoiceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isOnline) {
      setFeedbackBanner({
        type: 'error',
        text: 'Se requiere conexión a Internet para procesar el escaneo de facturas con Gemini AI. Puede registrar la compra de forma manual.',
      });
      return;
    }

    setIsScanning(true);
    setFeedbackBanner(null);
    setScanMessage('Analizando factura con Gemini 3.8 Flash...');

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;

        const idToken = await auth.currentUser?.getIdToken();

        const response = await fetch('/api/scan-invoice', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken || ''}`,
          },
          body: JSON.stringify({
            imageBase64: base64Data,
            mimeType: file.type || 'image/jpeg',
          }),
        });

        const data = await response.json();
        setIsScanning(false);

        if (data.success && data.extracted) {
          const ext = data.extracted;
          if (ext.vendor) setVendor(ext.vendor);
          if (ext.date) setDate(ext.date);
          if (ext.invoiceNumber) setPurchaseNumber(ext.invoiceNumber);

          if (Array.isArray(ext.items) && ext.items.length > 0) {
            const mappedItems: PurchaseLineItem[] = ext.items.map((it: any) => ({
              name: it.name || '',
              normalizedName: it.normalizedName || it.name,
              quantity: Number(it.quantity) || 1,
              unit: (it.unit?.toLowerCase() as UnitOfMeasure) || 'unidad',
              unitCost: Number(it.unitCost) || 0,
              totalCost: Number(it.totalCost) || 0,
            }));
            setItems(mappedItems);
            setScanMessage(`Factura analizada con éxito: ${mappedItems.length} insumos extraídos.`);
          }
        } else {
          setFeedbackBanner({
            type: 'error',
            text: `Error procesando factura: ${data.error || 'No se reconocieron datos.'}`,
          });
        }
      };

      reader.onerror = () => {
        setIsScanning(false);
        setFeedbackBanner({ type: 'error', text: 'Error al leer el archivo de la imagen.' });
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setIsScanning(false);
      console.error('Error llamando a API Gemini:', err);
      setFeedbackBanner({ type: 'error', text: 'Error de conexión al analizar la factura.' });
    }
  };

  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackBanner(null);

    if (items.some(it => !it.name.trim() || it.totalCost <= 0)) {
      setFeedbackBanner({
        type: 'error',
        text: 'Verifique que todos los insumos tengan nombre y costo total válido mayor a 0.',
      });
      return;
    }

    // Intelligent duplicate invoice detection
    const cleanVendor = vendor.trim().toLowerCase();
    const cleanInvoiceNum = purchaseNumber.trim().toLowerCase();

    if (cleanInvoiceNum.length > 0 && cleanVendor.length > 0) {
      const existingMatch = purchases.find(p => {
        const pVendor = (p.vendor || '').trim().toLowerCase();
        const pInv = (p.purchaseNumber || '').trim().toLowerCase();
        return pVendor === cleanVendor && pInv === cleanInvoiceNum;
      });

      if (existingMatch) {
        setFeedbackBanner({
          type: 'error',
          text:
            `FACTURA DUPLICADA BLOQUEADA: Ya existe una compra registrada para el proveedor "${existingMatch.vendor}" ` +
            `con el número de factura "${existingMatch.purchaseNumber}" (Fecha: ${existingMatch.date}, Total: ₡${existingMatch.total.toLocaleString()}).`,
        });
        return;
      }
    }

    try {
      await addPurchase({
        vendor: vendor.trim() || undefined,
        date,
        purchaseNumber: purchaseNumber.trim() || undefined,
        paymentMethod,
        paidFromCashRegister,
        items,
        total: grandTotal,
        notes: notes.trim() || undefined,
      });

      setFeedbackBanner({
        type: 'success',
        text: 'Compra confirmada y guardada. El inventario y la caja han sido actualizados.',
      });

      // Reset Form
      setVendor('');
      setPurchaseNumber('');
      setNotes('');
      setItems([
        {
          name: '',
          normalizedName: '',
          quantity: 1,
          unit: 'kg',
          unitCost: 0,
          totalCost: 0,
        },
      ]);
      setScanMessage(null);
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: `Error al procesar la compra: ${err?.message || 'Error de comunicación o validación de datos.'}`,
      });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-100 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header & AI Scanner Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl shadow-xs border border-gray-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-md">
                Gestión de Suministros
              </span>
              <span className="text-xs text-gray-500 font-medium">Administración</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 mt-1">
              Registro de Compras y Facturas con IA
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Escanee recibos o ingrese compras manualmente. Actualiza inventario y descuenta de caja automáticamente.
            </p>
          </div>

          {/* AI Scan Actions */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={cameraInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleScanInvoiceFile}
              className="hidden"
            />
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleScanInvoiceFile}
              className="hidden"
            />

            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold text-xs shadow-md transition disabled:opacity-50"
            >
              {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              <span>Tomar Foto Factura</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold text-xs shadow-md transition disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>Subir Imagen</span>
            </button>
          </div>
        </div>

        {feedbackBanner && (
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between text-xs font-bold ${
              feedbackBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{feedbackBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-xs underline ml-3 shrink-0"
            >
              Cerrar
            </button>
          </div>
        )}

        {scanMessage && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center justify-between text-xs text-amber-900 font-semibold">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{scanMessage}</span>
            </div>
            <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
              Revisión previa requerida
            </span>
          </div>
        )}

        {/* Purchase Form */}
        <form onSubmit={handleSubmitPurchase} className="bg-white rounded-3xl p-6 border border-gray-200 shadow-xs space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <h3 className="font-black text-lg text-gray-900">Detalles del Proveedor y Pago</h3>
            <span className="text-xs text-red-600 font-bold bg-red-50 px-2.5 py-1 rounded-xl">
              Total Compra: {formatCRC(grandTotal)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block font-bold text-gray-700 mb-1 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                <span>Proveedor (Opcional):</span>
              </label>
              <input
                type="text"
                value={vendor}
                onChange={e => setVendor(e.target.value)}
                placeholder="Ej. Carnicería El Arreo, Peri, Feria..."
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Fecha:</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">
                Método de Pago:
              </label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white focus:ring-2 focus:ring-red-500 focus:outline-none"
              >
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia Bancaria</option>
                <option value="tarjeta">Tarjeta Débito/Crédito</option>
                <option value="credito">Crédito de Proveedor</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">
                Número de Factura:
              </label>
              <input
                type="text"
                value={purchaseNumber}
                onChange={e => setPurchaseNumber(e.target.value)}
                placeholder="Ej. FAC-00129"
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Cash Register Deduction checkbox */}
          <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="paidCashDrawer"
                checked={paidFromCashRegister && paymentMethod === 'efectivo'}
                disabled={paymentMethod !== 'efectivo'}
                onChange={e => setPaidFromCashRegister(e.target.checked)}
                className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
              />
              <label htmlFor="paidCashDrawer" className="font-bold text-gray-800 cursor-pointer">
                Descontar automáticamente este monto de la Caja General del día
              </label>
            </div>
            <span className="text-[11px] text-gray-500 hidden sm:inline">
              (Aplica solo si se pagó en efectivo desde el cajón)
            </span>
          </div>

          {/* Items Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-gray-900">
                Líneas de Insumos / Productos Comprados
              </h4>
              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-xl transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Renglón</span>
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-gray-50 p-3 rounded-2xl border border-gray-200 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center text-xs"
                >
                  <div className="sm:col-span-4">
                    <label className="block text-[10px] font-bold text-gray-500 mb-0.5 sm:hidden">
                      Producto / Insumo
                    </label>
                    <input
                      type="text"
                      required
                      value={item.name}
                      onChange={e => handleItemChange(idx, 'name', e.target.value)}
                      placeholder="Nombre del insumo (ej. Pollo fresco, Arroz blanco...)"
                      className="w-full px-3 py-1.5 bg-white rounded-xl border border-gray-300 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-500 mb-0.5 sm:hidden">
                      Cantidad
                    </label>
                    <input
                      type="number"
                      step="any"
                      min={0.1}
                      required
                      value={item.quantity}
                      onChange={e => handleItemChange(idx, 'quantity', Number(e.target.value))}
                      placeholder="Cantidad"
                      className="w-full px-3 py-1.5 bg-white rounded-xl border border-gray-300 text-xs text-center focus:ring-1 focus:ring-red-500 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-500 mb-0.5 sm:hidden">
                      Unidad
                    </label>
                    <select
                      value={item.unit}
                      onChange={e => handleItemChange(idx, 'unit', e.target.value)}
                      className="w-full px-2 py-1.5 bg-white rounded-xl border border-gray-300 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                    >
                      <option value="kg">Kilos (kg)</option>
                      <option value="g">Gramos (g)</option>
                      <option value="litro">Litros</option>
                      <option value="unidad">Unidades</option>
                      <option value="paquete">Paquetes</option>
                      <option value="caja">Cajas</option>
                      <option value="lata">Latas</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-500 mb-0.5 sm:hidden">
                      Costo Total (CRC)
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={item.totalCost}
                      onChange={e => handleItemChange(idx, 'totalCost', Number(e.target.value))}
                      placeholder="Total"
                      className="w-full px-3 py-1.5 bg-white rounded-xl border border-gray-300 text-xs font-bold text-right focus:ring-1 focus:ring-red-500 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-2">
                    <div className="text-[11px] text-gray-500">
                      Costo U: <span className="font-bold text-gray-800">{formatCRC(item.unitCost)}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      disabled={items.length <= 1}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg transition disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Confirm Button */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              * Nunca se guarda una compra automáticamente sin revisión administrativa previa.
            </span>

            <button
              type="submit"
              className="py-3 px-6 bg-red-600 hover:bg-red-700 text-white font-black text-sm rounded-2xl shadow-md transition flex items-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>Confirmar y Registrar Compra ({formatCRC(grandTotal)})</span>
            </button>
          </div>
        </form>

        {/* Purchases History */}
        <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-4">
          <h3 className="font-black text-lg text-gray-900">Historial de Compras Registradas</h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">Proveedor</th>
                  <th className="py-2.5 px-3">Insumos</th>
                  <th className="py-2.5 px-3">Método</th>
                  <th className="py-2.5 px-3">Caja</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {purchases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-gray-400">
                      No hay compras registradas aún.
                    </td>
                  </tr>
                ) : (
                  purchases.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-semibold text-gray-700">{p.date}</td>
                      <td className="py-2.5 px-3 font-bold text-gray-900">{p.vendor || 'Proveedor General'}</td>
                      <td className="py-2.5 px-3 text-gray-600">
                        {p.items.map(it => `${it.quantity}${it.unit} ${it.name}`).join(', ')}
                      </td>
                      <td className="py-2.5 px-3 uppercase text-gray-500 font-bold text-[10px]">
                        {p.paymentMethod}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                            p.paidFromCashRegister
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {p.paidFromCashRegister ? 'Descontado de Caja' : 'Externo'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-sm text-red-600">
                        {formatCRC(p.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
