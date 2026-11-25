import React, { useState, useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';

/**
 * Non-intrusive PWA update prompt.
 * Never forces a page reload while a cashier or cook is mid-operation.
 */
export const PWAUpdatePrompt: React.FC = () => {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let mounted = true;
    navigator.serviceWorker
      .getRegistration()
      .then(reg => {
        if (!reg || !mounted) return;
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
        }
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller && mounted) {
              setWaitingWorker(newWorker);
            }
          });
        });
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  if (!waitingWorker || dismissed) return null;

  const handleUpdate = () => {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-gray-900 text-white rounded-2xl shadow-2xl border border-gray-700 p-4 flex items-center gap-3">
      <RefreshCw className="w-5 h-5 text-amber-400 shrink-0" />
      <div className="flex-1 text-xs">
        <div className="font-bold">Nueva versión disponible</div>
        <div className="text-gray-300 mt-0.5">
          Actualice cuando termine su pedido o cobro actual.
        </div>
      </div>
      <button
        type="button"
        onClick={handleUpdate}
        className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer"
      >
        Actualizar
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="p-1 text-gray-400 hover:text-white cursor-pointer"
        title="Posponer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
