import React, { useState } from 'react';
import { RestaurantOrder, PaymentMethod } from '../../types';
import { formatCRC } from '../../utils/formatters';
import { usePOS } from '../../context/POSContext';
import {
  X,
  Banknote,
  Smartphone,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Sparkles,
} from 'lucide-react';

interface PaymentModalProps {
  order: RestaurantOrder;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { completeOrderPayment, printOrderTicket } = usePOS();

  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [cashReceived, setCashReceived] = useState<number>(order.total);
  const [sinpeReference, setSinpeReference] = useState<string>('');
  const [cardAuth, setCardAuth] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{ change?: number } | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  if (!isOpen) return null;

  const quickDenominations = [order.total, 5000, 10000, 20000, 50000].filter(
    (amt, idx, arr) => amt >= order.total && arr.indexOf(amt) === idx
  );

  const changeDue = Math.max(0, cashReceived - order.total);
  const hasInsufficientCash = method === 'efectivo' && cashReceived < order.total;

  const handleExecutePayment = async () => {
    if (hasInsufficientCash) return;

    setPaymentError(null);
    setIsProcessing(true);
    const res = await completeOrderPayment(
      order.id,
      method,
      method === 'efectivo' ? cashReceived : undefined
    );
    setIsProcessing(false);

    if (res.success) {
      setPaymentResult({ change: res.change });
    } else {
      setPaymentError(`Error al procesar el cobro: ${res.error}`);
    }
  };

  const handleFinishAndPrint = () => {
    printOrderTicket(order);
    onSuccess();
    onClose();
  };

  const handleFinishWithoutPrint = () => {
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 flex flex-col">
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
              {order.serviceType === 'mesa' ? `Mesa: ${order.tableName || 'N/A'}` : `Servicio: ${order.serviceType.toUpperCase()}`}
            </div>
          </div>
          {!paymentResult && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {paymentResult ? (
          /* Payment Success State */
          <div className="py-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-gray-900">¡Cobro Confirmado!</h3>
              <p className="text-sm text-gray-500 mt-1">
                La orden fue pagada y la mesa ha sido liberada automáticamente.
              </p>
            </div>

            {method === 'efectivo' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 max-w-xs mx-auto">
                <div className="text-xs text-emerald-800 font-bold uppercase tracking-wider">
                  Vuelto a Entregar
                </div>
                <div className="text-3xl font-black text-emerald-700 mt-0.5">
                  {formatCRC(paymentResult.change || 0)}
                </div>
                <div className="text-[11px] text-emerald-600 mt-1">
                  Pagó con {formatCRC(cashReceived)}
                </div>
              </div>
            )}

            <div className="pt-4 flex flex-col gap-2.5">
              <button
                onClick={handleFinishAndPrint}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-md transition"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Ticket de Cocina / Comprobante</span>
              </button>
              <button
                onClick={handleFinishWithoutPrint}
                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm"
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
                Total a Cobrar (CRC)
              </div>
              <div className="text-3xl font-black text-red-700 mt-0.5">
                {formatCRC(order.total)}
              </div>
              {order.serviceCharge > 0 && (
                <div className="text-[11px] text-red-500 font-semibold mt-1">
                  Incluye 10% de servicio de mesa ({formatCRC(order.serviceCharge)})
                </div>
              )}
            </div>

            {/* Methods Selection */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">
                Seleccione Método de Pago
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setMethod('efectivo')}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition ${
                    method === 'efectivo'
                      ? 'border-red-600 bg-red-50 text-red-950 font-bold shadow-xs'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  <Banknote className="w-5 h-5 mb-1" />
                  <span className="text-xs">Efectivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod('sinpe')}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition ${
                    method === 'sinpe'
                      ? 'border-red-600 bg-red-50 text-red-950 font-bold shadow-xs'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  <Smartphone className="w-5 h-5 mb-1" />
                  <span className="text-xs">SINPE Móvil</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod('tarjeta')}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition ${
                    method === 'tarjeta'
                      ? 'border-red-600 bg-red-50 text-red-950 font-bold shadow-xs'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  <CreditCard className="w-5 h-5 mb-1" />
                  <span className="text-xs">Tarjeta</span>
                </button>
              </div>
            </div>

            {/* Method Details */}
            {method === 'efectivo' && (
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
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                        cashReceived === amt
                          ? 'bg-red-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {amt === order.total ? 'Exacto' : formatCRC(amt)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {method === 'sinpe' && (
              <div className="space-y-2.5 bg-blue-50/70 p-3.5 rounded-2xl border border-blue-200 text-xs text-blue-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Verificación Manual Requerida</div>
                    <div className="text-[11px] text-blue-800 mt-0.5">
                      No existe integración bancaria automática. Solicite el comprobante y confirme en el teléfono de caja antes de finalizar.
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-blue-950 mb-1">
                    Número de comprobante / Teléfono (Opcional):
                  </label>
                  <input
                    type="text"
                    value={sinpeReference}
                    onChange={e => setSinpeReference(e.target.value)}
                    placeholder="Ejemplo: Comprobante #948271"
                    className="w-full px-3 py-1.5 bg-white rounded-xl border border-blue-200 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {method === 'tarjeta' && (
              <div className="space-y-2 bg-gray-50 p-3.5 rounded-2xl border border-gray-200 text-xs">
                <div className="text-gray-600">
                  Procese el cobro en el datáfono físico (BAC / BNCR / Promerica).
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    Código de Autorización / Últimos 4 dígitos (Opcional):
                  </label>
                  <input
                    type="text"
                    value={cardAuth}
                    onChange={e => setCardAuth(e.target.value)}
                    placeholder="Ejemplo: Auth 829182"
                    className="w-full px-3 py-1.5 bg-white rounded-xl border border-gray-300 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                </div>
              </div>
            )}

            {/* Submit */}
            <div className="pt-2">
              <button
                type="button"
                disabled={isProcessing || hasInsufficientCash}
                onClick={handleExecutePayment}
                className={`w-full py-3.5 rounded-xl text-sm font-black text-white shadow-lg transition flex items-center justify-center gap-2 ${
                  hasInsufficientCash
                    ? 'bg-gray-300 cursor-not-allowed opacity-75'
                    : 'bg-emerald-600 hover:bg-emerald-700 active:scale-98'
                }`}
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>Confirmar Pago de {formatCRC(order.total)}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
