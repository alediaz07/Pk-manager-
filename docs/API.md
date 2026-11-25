# Documentación de Endpoints API (`server.ts`)

Todos los endpoints bajo `/api/*` son servidos por Express y excluidos del caché del Service Worker (`NetworkOnly`).

## 1. Salud y Hora Oficial
- `GET /api/health`
  - **Auth**: Pública (respuesta mínima `{ status: "ok", timestamp, timezone }`, sin secretos ni detalles internos).
- `GET /api/cash-register/costa-rica-time`
  - **Auth**: Pública. Devuelve fecha operativa (`YYYY-MM-DD`) y hora actual en `America/Costa_Rica`.

## 2. Escaneo de Facturas con Gemini AI
- `POST /api/scan-invoice`
  - **Auth**: `Authorization: Bearer <Firebase ID Token>` verificado + rol `admin` activo.
  - **Rate Limit**: Protegido contra abuso.
  - **Body**: `{ imageBase64: string, mimeType?: string }`.
  - **Respuesta**: Datos estructurados sanitizados (`vendor`, `date`, `invoiceNumber`, `items[]`) listos para revisión manual previa al guardado.

## 3. Endpoints de Consulta Administrativa / IA (`/api/ai/*`)
- **Auth**: `X-Jarvis-Key` igual a `process.env.JARVIS_API_KEY` (sin clave de respaldo hardcodeada; devuelve `503` si no está configurada o `401` si es inválida) + snapshot sincronizado por administrador o token Firebase verificado.
- `POST /api/ai/sync-snapshot`: el panel de administración sincroniza un resumen estructurado seguro.
- `GET /api/ai/inventory-summary`: resumen de existencias y alertas de stock bajo.
- `GET /api/ai/sales-summary`: resumen de ventas por período y método de pago.
- `GET /api/ai/purchase-recommendations`: sugerencias de compra basadas en inventario.
- `GET /api/ai/financial-overview`: panorama financiero operativo.
- `GET /api/ai/openapi.json`: especificación OpenAPI 3.1 para integración controlada.

## 4. Menú Digital QR de Mesa y Pedidos Exprés
- `POST /api/public/catalog-sync` (Auth: Staff) — sincroniza catálogo público sin costos ni PII y tokens QR activos de mesas.
- `GET /api/public/menu` (Pública) — devuelve catálogo público, horarios y tarifas vigentes (nunca expone costos de inventario/recetas ni PII). Responde `503` si el catálogo aún no fue sincronizado.
- `POST /api/public/order` (Pública, con rate limit) — valida precios en servidor desde catálogo oficial, exige `tableToken` válido para QR de mesa y guarda el pedido como `pending_auth` (nunca entra directo a cocina).
- `GET /api/public/order-status/:trackingCode` (Pública) — estado operativo del pedido para seguimiento del cliente.
- `GET /api/public/pending-orders` (Auth: Staff) — lista de pedidos pendientes de aprobación en POS.
- `POST /api/public/pending-orders/:trackingCode/status` (Auth: Staff) — marca pedido como aceptado/rechazado tras revisión humana.
