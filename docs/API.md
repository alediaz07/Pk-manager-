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

## 4. Rutas públicas retiradas
- Todas las rutas `/api/public/*` devuelven HTTP `410 Gone`, sin catálogo, pedidos ni datos de seguimiento.
- Los pedidos de mesa, ventana y exprés se registran exclusivamente desde el POS interno con autenticación Firebase. Las comandas internas mantienen su autorización y estados de cocina.
