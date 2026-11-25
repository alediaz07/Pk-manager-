import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { formatCRC } from '../../utils/formatters';
import { POLLOS_KAREN_PRODUCTS } from '../../config/pollosKarenCatalog';
import {
  Settings,
  Clock,
  Printer,
  QrCode,
  RefreshCw,
  CheckCircle2,
  Download,
  Bike,
  UtensilsCrossed,
  ShieldAlert,
  Copy,
} from 'lucide-react';

export const RestaurantConfigView: React.FC = () => {
  const { isAdmin } = useAuth();
  const {
    restaurantConfig,
    updateRestaurantConfig,
    tables,
    rotateTableQRToken,
    toggleTableQR,
    importPollosKarenOfficialMenu,
  } = usePOS();

  const [form, setForm] = useState(restaurantConfig);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [importUpdatePrices, setImportUpdatePrices] = useState(false);
  const [importing, setImporting] = useState(false);
  const [qrPreviews, setQrPreviews] = useState<Record<string, string>>({});
  const [expresQrUrl, setExpresQrUrl] = useState<string>('');

  useEffect(() => {
    setForm(restaurantConfig);
  }, [restaurantConfig]);

  const baseUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';

  useEffect(() => {
    let active = true;
    (async () => {
      const map: Record<string, string> = {};
      for (const tbl of tables) {
        if (tbl.qrToken) {
          const url = `${baseUrl}?menu=table&token=${encodeURIComponent(tbl.qrToken)}`;
          try {
            map[tbl.id] = await QRCode.toDataURL(url, { width: 220, margin: 1 });
          } catch {
            // ignore
          }
        }
      }
      if (active) setQrPreviews(map);

      try {
        const expDataUrl = await QRCode.toDataURL(`${baseUrl}?menu=expres`, {
          width: 220,
          margin: 1,
        });
        if (active) setExpresQrUrl(expDataUrl);
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, [tables, baseUrl]);

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-sm text-gray-600">
        <ShieldAlert className="w-8 h-8 text-red-600 mx-auto mb-2" />
        Solo el administrador puede acceder a la configuración del restaurante.
      </div>
    );
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await updateRestaurantConfig(form);
      setFeedback('Configuración operativa guardada correctamente.');
    } catch (err: any) {
      setFeedback(err?.message || 'Error guardando configuración.');
    } finally {
      setSaving(false);
    }
  };

  const handleImportOfficialMenu = async () => {
    setImporting(true);
    setFeedback(null);
    try {
      const res = await importPollosKarenOfficialMenu({
        updateExistingPrices: importUpdatePrices,
      });
      setFeedback(
        `Catálogo procesado: ${res.categoriesAdded} categorías nuevas, ${res.productsAdded} platillos agregados, ${res.productsUpdated} precios actualizados.`
      );
    } catch (err: any) {
      setFeedback(err?.message || 'Error importando catálogo.');
    } finally {
      setImporting(false);
    }
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setFeedback('Enlace copiado al portapapeles.');
    } catch {
      setFeedback(url);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-red-600" />
            <span>Configuración Operativa, Catálogo Oficial y Códigos QR</span>
          </h1>
          <p className="text-xs text-gray-500">
            Pollos Karen — La Uruca, Costa Rica • Zona horaria America/Costa_Rica
          </p>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* 1. Operational Settings Form */}
      <form
        onSubmit={handleSaveConfig}
        className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-5"
      >
        <h2 className="text-sm font-black text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2.5">
          <Clock className="w-4 h-4 text-red-600" />
          <span>Horarios, Tarifas, Inventario e Impresión Térmica</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-bold text-gray-700 mb-1">Hora Apertura</label>
            <input
              type="time"
              value={form.openTime}
              onChange={e => setForm({ ...form, openTime: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-gray-300"
            />
          </div>
          <div>
            <label className="block font-bold text-gray-700 mb-1">Hora Cierre</label>
            <input
              type="time"
              value={form.closeTime}
              onChange={e => setForm({ ...form, closeTime: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-gray-300"
            />
          </div>
          <div>
            <label className="block font-bold text-gray-700 mb-1">Desayunos Hasta</label>
            <input
              type="time"
              value={form.breakfastEndTime}
              onChange={e => setForm({ ...form, breakfastEndTime: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-gray-300"
            />
          </div>

          <div>
            <label className="block font-bold text-gray-700 mb-1">Servicio de Mesa (%)</label>
            <input
              type="number"
              min={0}
              max={25}
              value={form.tableServicePercent}
              onChange={e => setForm({ ...form, tableServicePercent: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-xl border border-gray-300"
            />
          </div>
          <div>
            <label className="block font-bold text-gray-700 mb-1">Tarifa Exprés (₡ CRC)</label>
            <input
              type="number"
              min={0}
              step={100}
              value={form.expressDeliveryFee}
              onChange={e => setForm({ ...form, expressDeliveryFee: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-xl border border-gray-300"
            />
          </div>
          <div>
            <label className="block font-bold text-gray-700 mb-1">Cobertura Exprés</label>
            <input
              type="text"
              value={form.expressCoverageDescription}
              onChange={e => setForm({ ...form, expressCoverageDescription: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-gray-300"
            />
          </div>

          <div>
            <label className="block font-bold text-gray-700 mb-1">
              Descuento Automático de Inventario
            </label>
            <select
              value={form.inventoryDeductionTrigger}
              onChange={e =>
                setForm({
                  ...form,
                  inventoryDeductionTrigger: e.target.value as 'kitchen_auth' | 'payment',
                })
              }
              className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white"
            >
              <option value="kitchen_auth">Al autorizar comanda a cocina (Recomendado)</option>
              <option value="payment">Al confirmar cobro en caja</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-gray-700 mb-1 flex items-center gap-1">
              <Printer className="w-3.5 h-3.5" />
              Ancho Impresora Térmica
            </label>
            <select
              value={form.printerWidth}
              onChange={e =>
                setForm({ ...form, printerWidth: e.target.value as '58mm' | '80mm' })
              }
              className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white"
            >
              <option value="80mm">80mm (Estándar Cocina/Caja)</option>
              <option value="58mm">58mm (Compacta / Bluetooth)</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        </div>
      </form>

      {/* 2. Official Pollos Karen Menu Catalog Safe Importer */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div>
            <h2 className="text-sm font-black text-gray-900 flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-red-600" />
              <span>Catálogo Oficial Pollos Karen ({POLLOS_KAREN_PRODUCTS.length} platillos)</span>
            </h2>
            <p className="text-xs text-gray-500">
              Importación segura y aditiva: agrega Desayunos, Casados, Platos del Día (L–V), Comidas Rápidas y Bebidas sin borrar órdenes ni recetas existentes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={importUpdatePrices}
                onChange={e => setImportUpdatePrices(e.target.checked)}
              />
              <span>Actualizar precios existentes</span>
            </label>
            <button
              type="button"
              disabled={importing}
              onClick={handleImportOfficialMenu}
              className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {importing ? 'Procesando...' : 'Importar / Sincronizar Menú Oficial'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto text-[11px]">
          {POLLOS_KAREN_PRODUCTS.map(p => (
            <div key={p.id} className="p-2 rounded-xl bg-gray-50 border border-gray-100">
              <div className="font-bold text-gray-800 truncate">{p.name}</div>
              <div className="text-red-600 font-black">{formatCRC(p.price)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Digital Menu QR Codes (Tables & Exprés) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
        <div className="border-b border-gray-100 pb-3">
          <h2 className="text-sm font-black text-gray-900 flex items-center gap-2">
            <QrCode className="w-4 h-4 text-red-600" />
            <span>Códigos QR para Mesas y Menú Exprés</span>
          </h2>
          <p className="text-xs text-gray-500">
            Cada mesa usa un token aleatorio revocable. Todos los pedidos QR entran en espera hasta que recepción los autorice hacia cocina.
          </p>
        </div>

        {/* Exprés Card */}
        <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="font-black text-sm text-purple-900 flex items-center gap-1.5">
              <Bike className="w-4 h-4" />
              <span>Menú Público Exprés (La Uruca — 1 km)</span>
            </div>
            <p className="text-xs text-purple-700">
              Sin recargo del 10% • Tarifa de envío actual: {formatCRC(restaurantConfig.expressDeliveryFee)}
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => copyLink(`${baseUrl}?menu=expres`)}
                className="px-3 py-1.5 rounded-lg bg-purple-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar enlace Exprés
              </button>
              {expresQrUrl && (
                <a
                  href={expresQrUrl}
                  download="QR-PollosKaren-Expres.png"
                  className="px-3 py-1.5 rounded-lg bg-white border border-purple-300 text-purple-800 text-xs font-bold inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar QR
                </a>
              )}
            </div>
          </div>
          {expresQrUrl && (
            <img
              src={expresQrUrl}
              alt="QR Exprés"
              className="w-24 h-24 rounded-xl border border-purple-200 bg-white p-1"
            />
          )}
        </div>

        {/* Tables QR Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tables.map(tbl => {
            const url = tbl.qrToken
              ? `${baseUrl}?menu=table&token=${encodeURIComponent(tbl.qrToken)}`
              : '';
            return (
              <div
                key={tbl.id}
                className="p-3.5 rounded-2xl border border-gray-200 bg-gray-50 flex flex-col items-center text-center gap-2"
              >
                <div className="font-black text-sm text-gray-900">{tbl.name}</div>
                {qrPreviews[tbl.id] ? (
                  <img
                    src={qrPreviews[tbl.id]}
                    alt={`QR ${tbl.name}`}
                    className="w-32 h-32 rounded-xl border border-gray-200 bg-white p-1"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-[11px] text-gray-400">
                    Sin token QR
                  </div>
                )}

                <div className="flex flex-wrap justify-center gap-1.5 w-full">
                  <button
                    type="button"
                    onClick={() => rotateTableQRToken(tbl.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 text-[11px] font-bold text-gray-700 inline-flex items-center gap-1 cursor-pointer hover:bg-gray-100"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {tbl.qrToken ? 'Rotar' : 'Generar'}
                  </button>
                  {url && (
                    <button
                      type="button"
                      onClick={() => copyLink(url)}
                      className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      Enlace
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleTableQR(tbl.id, tbl.qrEnabled === false)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                      tbl.qrEnabled === false
                        ? 'bg-gray-200 text-gray-600'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {tbl.qrEnabled === false ? 'Inactivo' : 'Activo'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
