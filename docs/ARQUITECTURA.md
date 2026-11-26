# Arquitectura del Sistema — Pollos Karen Manager

## 1. Visión General
Pollos Karen Manager es una aplicación web progresiva (PWA) interna para la operación de Pollos Karen en La Uruca, Costa Rica (`CRC ₡`, zona horaria `America/Costa_Rica`).

- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + `vite-plugin-pwa` (actualización controlada con `registerType: 'prompt'`).
- **Backend HTTP**: Express (`server.ts`) en puerto `3000` (o `PORT`), sirviendo `vite.middlewares` en desarrollo y `dist/` en producción.
- **Autenticación y Base de Datos**: Firebase Authentication + Cloud Firestore (proyecto `funky-aloe-jxq1s`).
- **Resiliencia Offline**: IndexedDB v3 (`src/utils/offlineQueue.ts`) para encolamiento de operaciones POS sin conexión con `userId`, `deviceId`, reintentos y bandera `requiresReconciliation`.
- **IA Operativa**: `@google/genai` (escaneo de facturas de proveedores en `/api/scan-invoice`) y endpoints estructurados de consulta administrativa (`/api/ai/*`).

## 2. Separación de Módulos
- `src/context/AuthContext.tsx`: ciclo de vida de sesión, roles (`admin`, `colaborador`, `cocina`), preautorización Google, revocación en tiempo real y política de contraseñas.
- `src/context/POSContext.tsx`: listeners acotados por rol (`limit(...)`), estados separados operativo/financiero, apertura/cierre explícito de caja, pagos persistentes, inventario delta por receta, compras/CxP, proveedores, menú oficial y respaldos.
- `src/utils/orderStateMachine.ts`: funciones puras para reglas de servicio (`Mesa +10%`, `Ventana 0%`, `Exprés` manual con tarifa configurable), fórmula exacta de caja esperada, consumo de recetas con `yieldPortions` y horarios de Costa Rica.
- `src/utils/thermalPrinter.ts`: impresión térmica 58mm/80mm mediante `<iframe>` local oculto (sin `window.open`), cubriendo Comanda Cocina, Copia, Precuenta, Comprobante Interno (`DOCUMENTO INTERNO — NO FISCAL`) y Cierre de Caja.
- `src/components/kitchen/KitchenDisplayView.tsx`: pantalla de cocina (KDS) aislada, sin precios ni métricas financieras, con alertas >10m / >20m, sonido Web Audio, pantalla completa y Wake Lock.
- `src/components/config/RestaurantConfigView.tsx`: configuración central, horarios, tarifa Exprés, ancho térmico e importación segura del catálogo oficial.

## 3. Exclusiones Explícitas de Alcance
- Aplicación **100% interna** (requiere autenticación en todas las rutas; sin menú digital público, sin autopedido por clientes, sin códigos QR y sin rastreo externo).
- Sin facturación electrónica, sin integración con Ministerio de Hacienda y sin códigos CABYS.
- Sin integración ni conciliación con Uber Eats u otras plataformas externas de delivery.
