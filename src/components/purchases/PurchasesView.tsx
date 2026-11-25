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
  const {
    purchases,
    addPurchase,
    suppliers,
    saveSupplier,
    recordCreditPurchasePayment,
    hasOpenCashRegister,
    isOnline,
  } = usePOS();
  const { isAdmin } = useAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [vendor, setVendor] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(getCostaRicaDateString());
  const [dueDate, setDueDate] = useState('');
  const [purchaseNumber, setPurchaseNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'transferencia' | 'tarjeta' | 'credito'>('efectivo');
  const [paidFromCashRegister, setPaidFromCashRegister] = useState(true);
  const [notes, setNotes] = useState('');

  // Suppliers & CxP Modals
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierCategory, setNewSupplierCategory] = useState('Carnes y Pollo');
  const [newSupplierCreditDays, setNewSupplierCreditDays] = useState(15);

  const [payingCreditPurchaseId, setPayingCreditPurchaseId] = useState<string | null>(null);
  const [creditPayAmount, setCreditPayAmount] = useState<number>(0);
  const [creditPayMethod, setCreditPayMethod] = useState<'efectivo' | 'transferencia' | 'tarjeta'>('transferencia');
  const [creditPayFromCash, setCreditPayFromCash] = useState(false);
  const [creditPayNotes, setCreditPayNotes] = useState('');

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
    setScanMessage('Analizando factura con Gemini AI...');

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
        supplierId: supplierId || undefined,
        date,
        dueDate: paymentMethod === 'credito' && dueDate ? dueDate : undefined,
        creditStatus: paymentMethod === 'credito' ? 'pending' : 'paid',
        paidAmount: paymentMethod === 'credito' ? 0 : grandTotal,
        purchaseNumber: purchaseNumber.trim() || undefined,
        paymentMethod,
        paidFromCashRegister: paymentMethod === 'efectivo' && paidFromCashRegister,
        items,
        total: grandTotal,
        notes: notes.trim() || undefined,
      });

      setFeedbackBanner({
        type: 'success',
        text:
          paymentMethod === 'credito'
            ? 'Compra a crédito registrada. Inventario actualizado y saldo agregado a Cuentas por Pagar (CxP).'
            : 'Compra confirmada y guardada. El inventario y la caja han sido actualizados.',
      });

      // Reset Form
      setVendor('');
      setSupplierId('');
      setDueDate('');
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

  const pendingCreditPurchases = purchases.filter(
    p => p.paymentMethod === 'credito' && p.creditStatus !== 'paid' && (p.total - (p.paidAmount || 0)) > 0
  );
  const totalCxP = pendingCreditPurchases.reduce(
    (sum, p) => sum + Math.max(0, p.total - (p.paidAmount || 0)),
    0
  );

  const handleSaveNewSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim()) return;
    try {
      await saveSupplier({
        name: newSupplierName.trim(),
        phone: newSupplierPhone.trim() || undefined,
        category: newSupplierCategory.trim() || undefined,
        creditDays: Math.max(0, Number(newSupplierCreditDays) || 0),
        active: true,
      });
      setNewSupplierName('');
      setNewSupplierPhone('');
      setFeedbackBanner({ type: 'success', text: 'Proveedor guardado en el directorio.' });
    } catch (err: any) {
      setFeedbackBanner({ type: 'error', text: err?.message || 'No se pudo guardar el proveedor.' });
    }
  };

  const handleConfirmCreditPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingCreditPurchaseId || creditPayAmount <= 0) return;
    try {
      await recordCreditPurchasePayment(
        payingCreditPurchaseId,
        creditPayAmount,
        creditPayMethod,
        creditPayMethod === 'efectivo' && creditPayFromCash,
        creditPayNotes.trim() || undefined
      );
      setPayingCreditPurchaseId(null);
      setCreditPayAmount(0);
      setCreditPayNotes('');
      setFeedbackBanner({ type: 'success', text: 'Abono registrado en Cuenta por Pagar.' });
    } catch (err: any) {
      setFeedbackBanner({ type: 'error', text: err?.message || 'No se pudo registrar el abono.' });
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
              type="button"
              onClick={() => setIsSupplierModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 rounded-2xl font-bold text-xs shadow-xs transition"
            >
              <Building2 className="w-4 h-4 text-red-600" />
              <span>Proveedores ({suppliers.length})</span>
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
                <span>Proveedor:</span>
              </label>
              <input
                type="text"
                list="suppliers-datalist"
                value={vendor}
                onChange={e => {
                  const val = e.target.value;
                  setVendor(val);
                  const matched = suppliers.find(
                    s => s.name.trim().toLowerCase() === val.trim().toLowerCase()
                  );
                  setSupplierId(matched ? matched.id : '');
                }}
                placeholder="Ej. Carnicería El Arreo, Peri, Feria..."
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
              <datalist id="suppliers-datalist">
                {suppliers.filter(s => s.active).map(s => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
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
                <option value="credito">Crédito de Proveedor (CxP)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">
                {paymentMethod === 'credito' ? 'Vencimiento / N° Factura:' : 'Número de Factura:'}
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={purchaseNumber}
                  onChange={e => setPurchaseNumber(e.target.value)}
                  placeholder="Ej. FAC-00129"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
                {paymentMethod === 'credito' && (
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    title="Fecha de vencimiento del crédito"
                    className="w-36 px-2 py-2 rounded-xl border border-amber-300 bg-amber-50 text-xs"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Cash Register Deduction checkbox */}
          <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
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
            {!hasOpenCashRegister && paymentMethod === 'efectivo' && paidFromCashRegister ? (
              <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg">
                Caja cerrada: abra la caja primero o desmarque esta casilla
              </span>
            ) : (
              <span className="text-[11px] text-gray-500 hidden sm:inline">
                (Aplica solo si se pagó en efectivo desde el cajón)
              </span>
            )}
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

        {/* Cuentas por Pagar (CxP) */}
        {pendingCreditPurchases.length > 0 && (
          <div className="bg-amber-50/70 rounded-3xl p-5 border border-amber-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-black text-base text-amber-950">
                  Cuentas por Pagar a Proveedores (CxP)
                </h3>
                <p className="text-xs text-amber-800">
                  Facturas a crédito con saldo pendiente de pago.
                </p>
              </div>
              <span className="px-3 py-1 rounded-xl bg-amber-600 text-white font-black text-xs">
                Saldo Total Pendiente: {formatCRC(totalCxP)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pendingCreditPurchases.map(cp => {
                const pendingBalance = Math.max(0, cp.total - (cp.paidAmount || 0));
                return (
                  <div
                    key={cp.id}
                    className="bg-white rounded-2xl p-3.5 border border-amber-200 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-black text-gray-900">
                        {cp.vendor || 'Proveedor General'}
                        {cp.purchaseNumber && (
                          <span className="text-gray-500 font-semibold ml-1.5">
                            #{cp.purchaseNumber}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Fecha: {cp.date}
                        {cp.dueDate ? ` • Vence: ${cp.dueDate}` : ''}
                      </div>
                      <div className="text-[11px] text-gray-600 mt-1">
                        Total: {formatCRC(cp.total)} • Abonado: {formatCRC(cp.paidAmount || 0)}
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-1.5">
                      <div className="font-black text-sm text-red-600">
                        {formatCRC(pendingBalance)}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPayingCreditPurchaseId(cp.id);
                          setCreditPayAmount(pendingBalance);
                          setCreditPayMethod('transferencia');
                          setCreditPayFromCash(false);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition"
                      >
                        Registrar Abono
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
                  <th className="py-2.5 px-3">Caja / Estado</th>
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
                      <td className="py-2.5 px-3 font-bold text-gray-900">
                        {p.vendor || 'Proveedor General'}
                        {p.purchaseNumber && (
                          <span className="block text-[10px] font-normal text-gray-500">
                            Fac. {p.purchaseNumber}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">
                        {p.items.map(it => `${it.quantity}${it.unit} ${it.name}`).join(', ')}
                      </td>
                      <td className="py-2.5 px-3 uppercase text-gray-500 font-bold text-[10px]">
                        {p.paymentMethod}
                      </td>
                      <td className="py-2.5 px-3">
                        {p.paymentMethod === 'credito' ? (
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                              p.creditStatus === 'paid'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {p.creditStatus === 'paid'
                              ? 'Crédito Pagado'
                              : `Pendiente ${formatCRC(Math.max(0, p.total - (p.paidAmount || 0)))}`}
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                              p.paidFromCashRegister
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {p.paidFromCashRegister ? 'Descontado de Caja' : 'Externo'}
                          </span>
                        )}
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

      {/* Modal: Suppliers Directory */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-black text-lg text-gray-900">Directorio de Proveedores</h3>
              <button
                type="button"
                onClick={() => setIsSupplierModalOpen(false)}
                className="px-2.5 py-1 rounded-xl bg-gray-100 hover:bg-gray-200 font-bold text-gray-700"
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={handleSaveNewSupplier} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-gray-50 p-3.5 rounded-2xl border border-gray-200">
              <input
                type="text"
                required
                value={newSupplierName}
                onChange={e => setNewSupplierName(e.target.value)}
                placeholder="Nombre del proveedor *"
                className="px-3 py-2 rounded-xl border border-gray-300 bg-white"
              />
              <input
                type="text"
                value={newSupplierPhone}
                onChange={e => setNewSupplierPhone(e.target.value)}
                placeholder="Teléfono / WhatsApp"
                className="px-3 py-2 rounded-xl border border-gray-300 bg-white"
              />
              <input
                type="text"
                value={newSupplierCategory}
                onChange={e => setNewSupplierCategory(e.target.value)}
                placeholder="Rubro (ej. Pollo, Verduras)"
                className="px-3 py-2 rounded-xl border border-gray-300 bg-white"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={newSupplierCreditDays}
                  onChange={e => setNewSupplierCreditDays(Number(e.target.value))}
                  className="w-20 px-2 py-2 rounded-xl border border-gray-300 bg-white text-center font-bold"
                />
                <span className="text-gray-600">días crédito</span>
                <button
                  type="submit"
                  className="ml-auto px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold"
                >
                  Agregar
                </button>
              </div>
            </form>

            <div className="divide-y divide-gray-100">
              {suppliers.length === 0 ? (
                <p className="text-center text-gray-400 py-4">No hay proveedores registrados.</p>
              ) : (
                suppliers.map(s => (
                  <div key={s.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-gray-900">{s.name}</div>
                      <div className="text-[11px] text-gray-500">
                        {s.category || 'General'} {s.phone ? `• ${s.phone}` : ''}{' '}
                        {s.creditDays ? `• ${s.creditDays}d crédito` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setVendor(s.name);
                        setSupplierId(s.id);
                        setIsSupplierModalOpen(false);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 font-bold hover:bg-red-100"
                    >
                      Usar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Record Credit Purchase Payment (Abono CxP) */}
      {payingCreditPurchaseId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleConfirmCreditPayment}
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-xs"
          >
            <h3 className="font-black text-lg text-gray-900">Registrar Abono a Proveedor</h3>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Monto del Abono (CRC)</label>
              <input
                type="number"
                required
                min={1}
                value={creditPayAmount}
                onChange={e => setCreditPayAmount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 font-black text-sm"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Método de Pago</label>
              <select
                value={creditPayMethod}
                onChange={e => setCreditPayMethod(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white"
              >
                <option value="transferencia">Transferencia / SINPE</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
            </div>

            {creditPayMethod === 'efectivo' && (
              <label className="flex items-center gap-2 font-semibold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={creditPayFromCash}
                  onChange={e => setCreditPayFromCash(e.target.checked)}
                  className="w-4 h-4 text-red-600 rounded"
                />
                <span>Descontar este abono de la Caja General</span>
              </label>
            )}

            <div>
              <label className="block font-bold text-gray-700 mb-1">Referencia / Nota (Opcional)</label>
              <input
                type="text"
                value={creditPayNotes}
                onChange={e => setCreditPayNotes(e.target.value)}
                placeholder="Ej. Comprobante BCR #9812"
                className="w-full px-3 py-2 rounded-xl border border-gray-300"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayingCreditPurchaseId(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 font-bold text-gray-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md"
              >
                Confirmar Abono
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
