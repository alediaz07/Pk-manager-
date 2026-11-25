import React from 'react';
import { KitchenTicket } from '../../types';
import { usePOS } from '../../context/POSContext';
import { formatDateTime } from '../../utils/formatters';
import { printKitchenTicket } from '../../utils/thermalPrinter';
import { X, Printer, Copy } from 'lucide-react';

interface KitchenTicketModalProps {
  ticket: KitchenTicket | null;
  onClose: () => void;
}

export const KitchenTicketModal: React.FC<KitchenTicketModalProps> = ({ ticket, onClose }) => {
  const { restaurantConfig } = usePOS();
  if (!ticket) return null;

  const width = ticket.paperWidth || restaurantConfig.printerWidth || '80mm';

  const handlePrint = () => {
    printKitchenTicket(ticket, width);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-gray-100 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-red-600" />
            <h3 className="font-black text-gray-900 text-base">Comanda de Cocina {width}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Realistic Thermal Paper Preview */}
        <div className="py-4">
          <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-5 font-mono text-xs text-gray-900 shadow-inner max-h-[60vh] overflow-y-auto space-y-3">
            {/* Store & Header */}
            <div className="text-center">
              <div className="font-black text-base tracking-wider">POLLOS KAREN</div>
              <div className="font-bold text-xs">ORDEN DE COCINA</div>
              {ticket.isCopy && (
                <div className="inline-block mt-1 px-3 py-0.5 border-2 border-black font-black text-sm tracking-widest bg-yellow-200">
                  *** COPIA ***
                </div>
              )}
            </div>

            <div className="border-t-2 border-black border-dashed pt-2 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="font-bold">ORDEN:</span>
                <span className="font-black text-sm">{ticket.orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold">SERVICIO:</span>
                <span className="uppercase font-semibold">
                  {ticket.serviceType} {ticket.tableName ? `(${ticket.tableName})` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span>FECHA:</span>
                <span>{formatDateTime(ticket.printedAt)}</span>
              </div>
            </div>

            <div className="border-t border-black border-dashed pt-2">
              <div className="font-bold uppercase text-[10px] text-gray-600 mb-1">
                PRODUCTOS A PREPARAR:
              </div>
              <div className="space-y-2">
                {ticket.items.map((item, idx) => (
                  <div key={idx} className="border-b border-gray-200 pb-1.5 last:border-b-0">
                    <div className="flex justify-between font-bold text-xs">
                      <span>
                        {item.quantity}x {item.name.toUpperCase()}
                      </span>
                    </div>
                    {item.selectedProtein && (
                      <div className="text-red-700 font-bold ml-3 text-[11px]">
                        &gt;&gt; PROTEÍNA: {item.selectedProtein.toUpperCase()}
                      </div>
                    )}
                    {item.notes && (
                      <div className="text-gray-600 italic ml-3 text-[11px]">
                        * {item.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {ticket.observations && (
              <div className="border-t border-black border-dashed pt-2">
                <span className="font-bold uppercase text-[10px] text-gray-600">
                  OBSERVACIONES GENERALES:
                </span>
                <div className="text-[11px] bg-white p-2 rounded border border-amber-200 mt-1">
                  {ticket.observations}
                </div>
              </div>
            )}

            <div className="border-t-2 border-black border-dashed pt-2 text-center text-[10px] text-gray-500">
              {ticket.isCopy ? (
                <div className="flex items-center justify-center gap-1 font-bold text-red-600">
                  <Copy className="w-3 h-3" />
                  <span>REIMPRESIÓN #{ticket.reprintCount} (COPIA)</span>
                </div>
              ) : (
                'TICKET DE PRODUCCIÓN - 80MM'
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50"
          >
            Cerrar
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-md flex items-center justify-center gap-1.5 transition"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Ticket</span>
          </button>
        </div>
      </div>
    </div>
  );
};
