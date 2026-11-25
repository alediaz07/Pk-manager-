import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { InventoryItem } from '../../types';
import { formatCRC } from '../../utils/formatters';
import {
  Trash2,
  X,
  AlertTriangle,
  Flame,
  Clock,
  Scale,
  CheckCircle2,
} from 'lucide-react';

interface WasteRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WasteRegistrationModal: React.FC<WasteRegistrationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { inventory, registerWaste } = usePOS();
  const [selectedItemId, setSelectedItemId] = useState<string>(inventory[0]?.id || '');
  const [quantity, setQuantity] = useState<number>(1);
  const [wasteReason, setWasteReason] = useState<string>('cocina');
  const [customNotes, setCustomNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedItem = inventory.find(i => i.id === selectedItemId) || inventory[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!selectedItem) return;

    if (quantity <= 0) {
      setErrorMsg('La cantidad de merma debe ser mayor a 0.');
      return;
    }

    try {
      setSubmitting(true);
      await registerWaste(selectedItem.id, quantity, wasteReason, customNotes);
      onClose();
    } catch (err: any) {
      setErrorMsg(`Error registrando merma: ${err.message || 'Error desconocido'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider bg-white/20 px-2 py-0.5 rounded-md">
                Auditoría de Insumos
              </span>
              <h2 className="text-xl font-black">Registrar Merma / Desperdicio</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 font-bold">
              {errorMsg}
            </div>
          )}
          <div>
            <label className="block text-gray-700 font-bold mb-1">
              Seleccionar Insumo:
            </label>
            <select
              value={selectedItemId}
              onChange={e => setSelectedItemId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 font-bold text-gray-900 bg-white focus:ring-2 focus:ring-red-500 focus:outline-none"
            >
              {inventory.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.currentStock} {item.unit} disponibles)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-700 font-bold mb-1">
                Cantidad a Descontar ({selectedItem?.unit || 'unidad'}):
              </label>
              <input
                type="number"
                step="any"
                min={0.01}
                required
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 font-black text-gray-900 text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-bold mb-1">
                Costo Estimado de Merma:
              </label>
              <div className="px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 font-black text-red-600 text-sm">
                {formatCRC(
                  Math.round(
                    quantity * (selectedItem?.averageCost || selectedItem?.lastPurchaseCost || 0)
                  )
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-1">
              Motivo de la Merma:
            </label>
            <select
              value={wasteReason}
              onChange={e => setWasteReason(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 font-bold text-gray-800 bg-white focus:ring-1 focus:ring-red-500 focus:outline-none"
            >
              <option value="cocina">Sobre-cocción / Preparación en cocina</option>
              <option value="vencimiento">Vencimiento o caducidad</option>
              <option value="diferencia_arqueo">Diferencia de conteo / arqueo físico</option>
              <option value="merma_preparacion">Merma técnica de corte / descongelado</option>
              <option value="accidente">Derrame o caída accidental</option>
            </select>
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-1">
              Observaciones / Detalle adicional:
            </label>
            <textarea
              rows={2}
              value={customNotes}
              onChange={e => setCustomNotes(e.target.value)}
              placeholder="Ej. Piezas quemadas en freidora durante hora pico..."
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-gray-800 focus:ring-1 focus:ring-red-500 focus:outline-none"
            />
          </div>

          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-md transition disabled:opacity-50"
            >
              {submitting ? 'Registrando...' : 'Registrar Merma'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
