import React, { useState } from 'react';
import { RestaurantOrder, PaymentRecord } from '../../types';
import { formatCRC } from '../../utils/formatters';
import { usePOS, PaymentEntryInput } from '../../context/POSContext';
import { printInternalSalesReceipt } from '../../utils/thermalPrinter';
import {
  X,
  Banknote,
  Smartphone,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Layers,
  Lock,
} from 'lucide-react';

interface PaymentModalProps {
  order: RestaurantOrder;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ModalPayMode = 'efectivo' | 'sinpe' | 'tarjeta' | 'mixto';

export const PaymentModal: React.FC<PaymentModalProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const {
    recordOrderPayment,
    hasOpenCashRegister,
    restaurantConfig,
    printOrderTicket,
  } = usePOS();

  const alreadyPaid = Number(order.paidAmount || 0);
  const remainingDue = Math.max(0, Math.round(order.total - alreadyPaid));

  const [mode, setMode] = useState<ModalPayMode>('efectivo');
  const [cashReceived, setCashReceived] = useState<number>(remainingDue);
  const [sinpeReference, setSinpeReference] = useState<string>('');
  const [cardAuth, setCardAuth] = useState<string>('');

  // Mixed / partial split inputs
  const [mixCash, setMixCash] = useState<number>(Math.floor(remainingDue / 2));
  const [mixSinpe, setMixSinpe] = useState<number>(remainingDue - Math.floor(remainingDue / 2));
  const [mixCard, setMixCard] = useState<number>(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{
    change?: number;
    payments?: PaymentRecord[];
  } | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  if (!isOpen) return null;

  const quickDenominations = [remainingDue, 5000, 10000, 20000, 50000].filter(
    (amt, idx, arr) => amt >= remainingDue && arr.indexOf(amt) === idx
  );

  const changeDue = Math.max(0, cashReceived - remainingDue);
  const hasInsufficientCash = mode === 'efectivo' && cashReceived < remainingDue;
  const mixedTotal = (Number(mixCash) || 0) + (Number(mixSinpe) || 0) + (Number(mixCard) || 0);

  const handleExecutePayment = async () => {
    if (!hasOpenCashRegister) {
      setPaymentError('La caja está cerrada. Abra un turno de caja en el módulo Caja General antes de cobrar.');
      return;
    }

    setPaymentError(null);
    const entries: PaymentEntryInput[] = [];

    if (mode === 'efectivo') {
      if (cashReceived < remainingDue) {
        setPaymentError('El efectivo recibido es menor al saldo pendiente.');
        return;
      }
      entries.push({
        method: 'efectivo',
        amount: remainingDue,
        receivedCash: cashReceived,
      });
    } else if (mode === 'sinpe') {
      entries.push({
        method: 'sinpe',
        amount: remainingDue,
        sinpeReference: sinpeReference.trim() || undefined,
      });
    } else if (mode === 'tarjeta') {
      entries.push({
        method: 'tarjeta',
        amount: remainingDue,
        cardAuthCode: cardAuth.trim() || undefined,
      });
    } else {
      if (mixedTotal <= 0 || mixedTotal > remainingDue) {
        setPaymentError(
          `La suma del pago mixto/parcial debe ser mayor a ₡0 y no superar ${formatCRC(remainingDue)}.`
        );
        return;
      }
      if (mixCash > 0) entries.push({ method: 'efectivo', amount: mixCash, receivedCash: mixCash });
      if (mixSinpe > 0) {
        entries.push({
          method: 'sinpe',
          amount: mixSinpe,
          sinpeReference: sinpeReference.trim() || undefined,
        });
      }
      if (mixCard > 0) {
        entries.push({
          method: 'tarjeta',
          amount: mixCard,
          cardAuthCode: cardAuth.trim() || undefined,
        });
      }
    }

    setIsProcessing(true);
    const res = await recordOrderPayment(order.id, entries);
    setIsProcessing(false);

    if (res.success) {
      setPaymentResult({ change: res.change, payments: res.payments });
    } else {
      setPaymentError(res.error || 'No se pudo procesar el cobro.');
    }
  };

  const handlePrintInternalReceipt = () => {
    printInternalSalesReceipt(order, paymentResult?.payments || [], {
      paperWidth: restaurantConfig.printerWidth,
      amountTendered: mode === 'efectivo' ? cashReceived : undefined,
      changeAmount: paymentResult?.change,
    });
    onSuccess();
    onClose();
  };

  const handlePrintKitchenAndClose = () => {
    printOrderTicket(order);
    onSuccess();
    onClose();
  };

  const handleFinishWithoutPrint = () => {
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Cobro en Caja General
            </span>
            <h2 className="text-xl font-black text-gray-900 mt-0.5">
              Orden {order.orderNumber}
            </h2>
            <div className="text-xs text-gray-500">
              {order.serviceType === 'mesa'
                ? `Mesa: ${order.tableName || 'N/A'}`
                : `Servicio: ${order.serviceType.toUpperCase()}`}
              {alreadyPaid > 0 && ` • Abonado previo: ${formatCRC(alreadyPaid)}`}
            </div>
          </div>
          {!paymentResult && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {!hasOpenCashRegister && !paymentResult ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900">Caja Cerrada</h3>
              <p className="text-xs text-gray-600 mt-1">
                No se pueden registrar cobros mientras no exista un turno de caja abierto. Diríjase al módulo <strong>Caja General</strong> para abrir el turno.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold cursor-pointer"
            >
              Entendido
            </button>
          </div>
        ) : paymentResult ? (
          /* Payment Success State */
          <div className="py-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-gray-900">¡Pago Registrado!</h3>
              <p className="text-xs text-gray-500 mt-1">
                El movimiento quedó guardado en Caja General. La orden mantiene su estado operativo de cocina/entrega de forma independiente.
              </p>
            </div>

            {mode === 'efectivo' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 max-w-xs mx-auto">
                <div className="text-xs text-emerald-800 font-bold uppercase tracking-wider">
                  Vuelto a Entregar
                </div>
                <div className="text-3xl font-black text-emerald-700 mt-0.5">
                  {formatCRC(paymentResult.change || 0)}
                </div>
                <div className="text-[11px] text-emerald-600 mt-1">
                  Recibido: {formatCRC(cashReceived)}
                </div>
              </div>
            )}

            <div className="pt-3 flex flex-col gap-2">
              <button
                onClick={handlePrintInternalReceipt}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Comprobante Interno (No Fiscal)</span>
              </button>
              <button
                onClick={handlePrintKitchenAndClose}
                className="w-full py-2.5 bg-gray-900 hover:bg-black text-white font-bold rounded-xl text-xs cursor-pointer"
              >
                Imprimir Copia Comanda Cocina
              </button>
              <button
                onClick={handleFinishWithoutPrint}
                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-xs cursor-pointer"
              >
                Cerrar sin imprimir
              </button>
            </div>
          </div>
        ) : (
          /* Payment Selection State */
          <div className="py-4 space-y-4">
            {paymentError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold">
                {paymentError}
              </div>
            )}

            {/* Total Display */}
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-center">
              <div className="text-xs font-bold text-red-600 uppercase tracking-wider">
                Saldo Pendiente a Cobrar (CRC)
              </div>
              <div className="text-3xl font-black text-red-700 mt-0.5">
                {formatCRC(remainingDue)}
              </div>
              <div className="text-[11px] text-red-600 font-semibold mt-1 space-x-2">
                {order.serviceCharge > 0 && <span>+10% Mesa ({formatCRC(order.serviceCharge)})</span>}
                {order.deliveryFee && order.deliveryFee > 0 && (
                  <span>+Exprés ({formatCRC(order.deliveryFee)})</span>
                )}
              </div>
            </div>

            {/* Methods Selection */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">
                Método de Pago
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    { id: 'efectivo', label: 'Efectivo', Icon: Banknote },
                    { id: 'sinpe', label: 'SINPE', Icon: Smartphone },
                    { id: 'tarjeta', label: 'Tarjeta', Icon: CreditCard },
                    { id: 'mixto', label: 'Mixto', Icon: Layers },
                  ] as const
                ).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMode(id)}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border-2 transition cursor-pointer ${
                      mode === id
                        ? 'border-red-600 bg-red-50 text-red-950 font-bold shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-1" />
                    <span className="text-[11px]">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {mode === 'efectivo' && (
              <div className="space-y-3 bg-gray-50 p-3.5 rounded-2xl border border-gray-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700">Monto Recibido</label>
                  <span className="text-xs font-bold text-emerald-600">
                    Vuelto: {formatCRC(changeDue)}
                  </span>
                </div>
                <input
                  type="number"
                  value={cashReceived}
                  onChange={e => setCashReceived(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-lg font-black text-gray-900 bg-white rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {quickDenominations.map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCashReceived(amt)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        cashReceived === amt
                          ? 'bg-red-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {amt === remainingDue ? 'Exacto' : formatCRC(amt)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === 'sinpe' && (
              <div className="space-y-2.5 bg-blue-50/70 p-3.5 rounded-2xl border border-blue-200 text-xs text-blue-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Verificación Manual SINPE Móvil</div>
                    <div className="text-[11px] text-blue-800 mt-0.5">
                      Confirme el depósito en el teléfono del restaurante. El sistema valida automáticamente que no se repita un número de comprobante ya usado.
                    </div>
                  </div>
                </div>
                <input
                  type="text"
                  value={sinpeReference}
                  onChange={e => setSinpeReference(e.target.value)}
                  placeholder="N° de comprobante SINPE (recomendado)"
                  className="w-full px-3 py-2 bg-white rounded-xl border border-blue-200 text-xs text-gray-900"
                />
              </div>
            )}

            {mode === 'tarjeta' && (
              <div className="space-y-2 bg-gray-50 p-3.5 rounded-2xl border border-gray-200 text-xs">
                <div className="text-gray-600">
                  Procese el cobro en el datáfono físico y registre la autorización.
                </div>
                <input
                  type="text"
                  value={cardAuth}
                  onChange={e => setCardAuth(e.target.value)}
                  placeholder="Código de autorización / últimos 4 dígitos"
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-xs text-gray-900"
                />
              </div>
            )}

            {mode === 'mixto' && (
              <div className="space-y-2.5 bg-gray-50 p-3.5 rounded-2xl border border-gray-200 text-xs">
                <div className="font-bold text-gray-800">
                  Pago Mixto o Abono Parcial (Máximo {formatCRC(remainingDue)})
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">Efectivo</label>
                    <input
                      type="number"
                      min={0}
                      value={mixCash}
                      onChange={e => setMixCash(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">SINPE</label>
                    <input
                      type="number"
                      min={0}
                      value={mixSinpe}
                      onChange={e => setMixSinpe(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">Tarjeta</label>
                    <input
                      type="number"
                      min={0}
                      value={mixCard}
                      onChange={e => setMixCard(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white font-bold"
                    />
                  </div>
                </div>
                {mixSinpe > 0 && (
                  <input
                    type="text"
                    value={sinpeReference}
                    onChange={e => setSinpeReference(e.target.value)}
                    placeholder="Referencia SINPE (opcional)"
                    className="w-full px-3 py-1.5 bg-white rounded-xl border border-gray-300 text-xs"
                  />
                )}
                <div className="flex justify-between font-bold text-gray-800 pt-1">
                  <span>Suma a aplicar:</span>
                  <span className={mixedTotal > remainingDue ? 'text-red-600' : 'text-emerald-700'}>
                    {formatCRC(mixedTotal)} {mixedTotal < remainingDue ? '(Abono parcial)' : ''}
                  </span>
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                disabled={isProcessing || hasInsufficientCash}
                onClick={handleExecutePayment}
                className={`w-full py-3.5 rounded-xl text-sm font-black text-white shadow-lg transition flex items-center justify-center gap-2 cursor-pointer ${
                  hasInsufficientCash
                    ? 'bg-gray-300 cursor-not-allowed opacity-75'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  {isProcessing
                    ? 'Procesando...'
                    : `Confirmar Cobro (${formatCRC(mode === 'mixto' ? mixedTotal : remainingDue)})`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
