# Reporte Real de Pruebas — Pollos Karen Manager

**Fecha de ejecución**: 2026-11-25  
**Entorno**: Sandbox Node.js v22.23.5 + TypeScript (`tsc --noEmit`) + Vite 8

## 1. Pruebas Automatizadas Ejecutadas (Resultados Reales)

### A. Suite de Seguridad e Integridad (`tests/security.test.ts`) — **10/10 APROBADAS**
- `[PASS]` `server.ts` contiene 0 `cachedAdminToken` y 0 llaves privadas hardcodeadas; incluye `X-Content-Type-Options` y `Content-Security-Policy`.
- `[PASS]` `firestore.rules` cumple deny-by-default, 3 roles (`admin`, `colaborador`, `cocina`), aislamiento `/kitchen_orders`, colección `/payments`, bloqueo `/purchase_invoice_locks`, proyección `/recipe_formulas` e inmutabilidad de `/audit_logs` (`update, delete: if false`).
- `[PASS]` Código cliente (`src/`) contiene 0 usos de `window.open`, `window.alert` y `window.confirm`.
- `[PASS]` Comanda de cocina omite precios/montos e incluye proteína; comprobante interno incluye `DOCUMENTO INTERNO — NO FISCAL` y excluye referencias a Hacienda/CABYS.
- `[PASS]` Validación de respaldos rechaza colecciones protegidas (`users`, `admins`, `user_invites`, `audit_logs`, `purchase_invoice_locks`) y fragmenta restauraciones en lotes ≤400.
- `[PASS]` `GET /api/health` responde `200` con cabeceras de seguridad y sin filtrar secretos.
- `[PASS]` `POST /api/scan-invoice` rechaza solicitudes sin token Bearer (`401`).
- `[PASS]` `GET /api/ai/sales-summary` rechaza solicitudes sin `X-Jarvis-Key` válida (`401`/`503`).
- `[PASS]` `GET /api/public/menu`, `/api/public/order-status/*` y `/api/public/pending-orders` responden `410 Gone` sin exponer datos.
- `[PASS]` `POST /api/public/order` y `/api/public/catalog-sync` responden `410 Gone` bloqueando cualquier pedido externo; verificado también que `PublicMenuView.tsx` y `qrcode` fueron eliminados y `firestore.rules` exige `source == 'pos'` para pedidos nuevos.

### B. Suite Operativa (`tests/operations.test.ts`) — **8/8 APROBADAS**
- `[PASS]` Reglas de totales: Mesa `+10%`, Ventana `0%`, Exprés tarifa configurable (`₡500`).
- `[PASS]` Separación de estado operativo y estado financiero (pago parcial, pagado, reembolsado).
- `[PASS]` Máquina de estados por rol: `cocina` solo avanza `authorized -> in_preparation -> ready` y no puede anular; solo `admin` anula.
- `[PASS]` Fórmula exacta de arqueo de caja con los 7 términos y sumatoria de denominaciones CRC.
- `[PASS]` Consumo de recetas respetando `yieldPortions` y conversiones `g -> kg` / `ml -> litro` (rechaza unidades incompatibles).
- `[PASS]` Costo promedio ponderado y normalización de unidades.
- `[PASS]` Validación de horario `America/Costa_Rica` (L–V, ventana de desayunos 07:00–10:30 y cierre domingo).
- `[PASS]` Integridad del catálogo oficial de Pollos Karen (categorías, precios >0 y casados con proteína).

### C. Suite de Concurrencia e Idempotencia (`tests/concurrency.test.ts`) — **8/8 APROBADAS**
- `[PASS]` Doble cobro concurrente, sobrepago, pago mixto/parcial, idempotencia de sincronización offline, inventario delta sin doble descuento, bloqueo de facturas duplicadas, cierre concurrente de caja y ráfaga de 16 peticiones concurrentes a `/api/public/order` devolviendo 100% `HTTP 410 Gone`.

### D. Verificación Estática, Compilación y Escaneo de Secretos
- `npm run lint` (`tsc --noEmit`): **APROBADO (0 errores)**.
- `npm run build` (`vite build`): **APROBADO**.
- `npm run scan:secrets`: **`[SECRET SCAN OK] Cero secretos privados expuestos (código fuente)`**.
- `npm run scan:dist`: verificado tras compilación (ver resultado en consola).

## 2. Pruebas Manuales Pendientes en Dispositivos / Producción Real
Las siguientes verificaciones requieren hardware físico o entorno Firebase en vivo y **no se reportan como ejecutadas**:
1. Impresión física en impresora térmica real de 58mm y 80mm desde navegador Chrome/Android/Windows.
2. Prueba en vivo de `firestore.rules` con Firebase Emulator Suite o tras aprobación de despliegue en `funky-aloe-jxq1s`.
3. Prueba en tablet dedicada en cocina (`rol: cocina`) verificando sonido de nueva comanda y Wake Lock prolongado.
4. Prueba de corte real de Internet en el local y reconexión posterior con verificación de cola IndexedDB.
5. Escaneo de historial Git completo en GitHub con Gitleaks (`.github/workflows/ci-security.yml`).
