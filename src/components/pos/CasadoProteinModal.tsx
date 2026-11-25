import React, { useState } from 'react';
import { ProductItem, CasadoProtein } from '../../types';
import { formatCRC } from '../../utils/formatters';
import { Check, X, Drumstick, Beef, Fish, Sparkles } from 'lucide-react';

interface CasadoProteinModalProps {
  product: ProductItem;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (protein: CasadoProtein, notes: string) => void;
}

const PROTEIN_ICONS: Record<CasadoProtein, React.ElementType> = {
  Pollo: Drumstick,
  Carne: Beef,
  Chuleta: Beef,
  Pescado: Fish,
};

const COMMON_PREFERENCES = [
  'Sin cebolla',
  'Frijoles aparte',
  'Sin ensalada',
  'Poco arroz',
  'Maduro bien frito',
  'Con salsa Lizano extra',
];

export const CasadoProteinModal: React.FC<CasadoProteinModalProps> = ({
  product,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [selectedProtein, setSelectedProtein] = useState<CasadoProtein | null>(null);
  const [customNotes, setCustomNotes] = useState<string>('');
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const proteins = product.proteinOptions || (['Pollo', 'Carne', 'Chuleta', 'Pescado'] as CasadoProtein[]);

  const handleTogglePreference = (pref: string) => {
    setSelectedPreferences(prev =>
      prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref]
    );
  };

  const handleConfirm = () => {
    if (!selectedProtein) {
      setErrorMsg('Debe seleccionar obligatoriamente la proteína para este Casado.');
      return;
    }

    const combinedNotes = [
      ...selectedPreferences,
      customNotes.trim() ? customNotes.trim() : null,
    ]
      .filter(Boolean)
      .join(', ');

    onConfirm(selectedProtein, combinedNotes);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-md">
                Selección Obligatoria
              </span>
              <span className="text-xs text-gray-500 font-medium">Casado Costarricense</span>
            </div>
            <h2 className="text-xl font-black text-gray-900 mt-1">{product.name}</h2>
            <div className="text-sm font-bold text-red-600 mt-0.5">{formatCRC(product.price)}</div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-4 space-y-5 overflow-y-auto pr-1">
          {/* Protein Selector */}
          <div>
            <label className="block text-sm font-bold text-gray-800 mb-2.5 flex items-center gap-1.5">
              <span>1. Elija la Proteína</span>
              <span className="text-red-500 font-black">*</span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              {proteins.map(prot => {
                const Icon = PROTEIN_ICONS[prot] || Drumstick;
                const isSelected = selectedProtein === prot;

                return (
                  <button
                    key={prot}
                    type="button"
                    onClick={() => {
                      setSelectedProtein(prot);
                      setErrorMsg(null);
                    }}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 transition text-left cursor-pointer ${
                      isSelected
                        ? 'border-red-600 bg-red-50 text-red-950 font-black shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300 text-gray-800'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isSelected ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-sm">{prot}</div>
                      <div className="text-[11px] text-gray-500">
                        {prot === 'Pollo'
                          ? 'Frito o en salsa'
                          : prot === 'Carne'
                          ? 'Mechada o bistec'
                          : prot === 'Chuleta'
                          ? 'Ahumada dorada'
                          : 'Filete fresco'}
                      </div>
                    </div>
                    {isSelected && <Check className="w-5 h-5 text-red-600 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {errorMsg && (
              <div className="mt-2 text-xs font-bold text-red-600 bg-red-50 px-3 py-2 rounded-xl flex items-center gap-1.5 border border-red-200">
                <X className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Quick Preferences Chips */}
          <div>
            <label className="block text-sm font-bold text-gray-800 mb-2 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>2. Preferencias Comunes (Opcional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {COMMON_PREFERENCES.map(pref => {
                const isSelected = selectedPreferences.includes(pref);
                return (
                  <button
                    key={pref}
                    type="button"
                    onClick={() => handleTogglePreference(pref)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                      isSelected
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {pref}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Notes */}
          <div>
            <label className="block text-sm font-bold text-gray-800 mb-1">
              3. Observaciones Adicionales para Cocina
            </label>
            <textarea
              value={customNotes}
              onChange={e => setCustomNotes(e.target.value)}
              placeholder="Ejemplo: Arroz con poca sal, maduro cortado en cuadritos..."
              rows={2}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-gray-100 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl border border-gray-200 text-gray-700 font-bold hover:bg-gray-50 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`flex-1 py-3 px-4 rounded-xl font-black text-sm text-white shadow-md transition ${
              selectedProtein
                ? 'bg-red-600 hover:bg-red-700 active:scale-98'
                : 'bg-gray-300 cursor-not-allowed opacity-70'
            }`}
          >
            Agregar a la Orden
          </button>
        </div>
      </div>
    </div>
  );
};
