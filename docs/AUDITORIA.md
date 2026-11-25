# Auditoría Técnica y de Seguridad — Pollos Karen Manager

**Fecha de auditoría inicial:** Fase 0 (Evaluación real del código existente)  
**Alcance:** Frontend React/TypeScript, Backend Express (`server.ts`), Cloud Firestore (`firestore.rules`, `firebase-blueprint.json`), PWA (`vite.config.ts`), cola offline (`offlineQueue.ts`), impresión térmica (`thermalPrinter.ts`), dependencias y configuración del repositorio.

---

## 1. Resumen Ejecutivo

La aplicación existente posee una base funcional sólida para POS, mesas, inventario, recetas, compras con IA, gastos, dashboard y auditoría, pero presenta **brechas críticas de seguridad, control financiero, estados operativos y resiliencia** que deben corregirse antes de operar en producción real en el restaurante.

> **Nota sobre el historial Git:** El entorno de ejecución actual (`/app/applet`) no contiene carpeta `.git`. Por ello, la auditoría de secretos en el árbol de trabajo se realizó con `scripts/scan-secrets.mjs`, y se entrega el workflow `.github/workflows/ci-security.yml` con **Gitleaks (`fetch-depth: 0`)** más los comandos exactos en `docs/GESTION_SECRETOS.md` para auditar el historial completo del repositorio remoto `https://github.com/alediaz07/Pk-manager-`.

---

## 2. Hallazgos Críticos (Prioridad 1 — Bloqueantes de Producción)

| ID | Severidad | Archivo(s) | Hallazgo Real Verificado | Mitigación Planificada |
|---|---|---|---|---|
| **AUD-01** | **CRÍTICA** | `src/context/AuthContext.tsx` (76–97), `firestore.rules` (40–42) | Cualquier cuenta de Google externa que inicie sesión obtiene automáticamente un documento en `/users/{uid}` con `role: 'colaborador'` y acceso a comandas, mesas, caja, recetas e inventario. | Eliminar auto-registro abierto. Solo usuarios pre-autorizados y activos (creados por admin o bootstrap principal) pueden ingresar. Bloquear en `AuthContext` y `firestore.rules`. |
| **AUD-02** | **CRÍTICA** | `server.ts` (107, 121, 139, 435) | El servidor guarda el token personal de Firebase de un administrador en memoria global (`cachedAdminToken`) y lo reutiliza para responder consultas externas de Jarvis (`/api/ai/*`). | Eliminar completamente `cachedAdminToken`. Los endpoints `/api/ai/*` usarán exclusivamente snapshots sincronizados explícitamente o llamadas autenticadas con su propia credencial sin reutilizar tokens personales. |
| **AUD-03** | **CRÍTICA** | `firestore.rules` (28–179) | Las reglas no verifican `active == true` del usuario, permiten lecturas globales con `isSignedIn()` sobre `recipes` (exponiendo costos a colaboradores), `inventory_items`, `admins`, `cash_registers`, `cash_movements` y `orders`, permiten `allow create: if isSignedIn()` en `tables` y `cash_registers`, y permiten que un colaborador edite `currentStock` directamente. | Rediseñar `firestore.rules` con 3 roles (`admin`, `colaborador`, `cocina`), verificación de cuenta activa, bloqueo de costos/recetas/inventario para no-admin, colección sanitizada `kitchen_orders` para cocina y validadores estrictos `isValid[Entity]()`. |
| **AUD-04** | **ALTA** | `src/context/POSContext.tsx` (150–163, 293–330) | La caja se inicializa automáticamente con `initialCash: 50000` si no existe documento diario, y los turnos anteriores abiertos se cierran silenciosamente sin arqueo. Además, permite cobrar sin verificar si la caja está abierta. | Eliminar inicialización automática de ₡50,000 y cierre silencioso. Exigir apertura explícita autorizada, bloquear cobros si no hay caja abierta, mostrar alerta de turno previo sin cerrar e implementar cierre con conteo por denominación. |
| **AUD-05** | **ALTA** | `src/context/POSContext.tsx` (1466, 1480) | Cobrar una orden la marca automáticamente como `status: 'completed'`, mezclando el estado financiero con el operativo (ej. un cliente paga en ventana antes de que la comida esté lista). | Separar máquina de estados en `operationalStatus` (`draft`, `pending_auth`, `authorized`, `in_preparation`, `ready`, `dispatched`, `delivered`, `cancelled`) y `financialStatus` (`unpaid`, `partially_paid`, `paid`, `partially_refunded`, `refunded`, `voided`). |
| **AUD-06** | **ALTA** | `src/components/pos/PaymentModal.tsx`, `POSContext.tsx` | Los campos `sinpeReference` y `cardAuth` capturados en pantalla nunca se persisten; no existe colección independiente `payments` ni control contra comprobantes SINPE duplicados o pagos mixtos/parciales. | Crear colección `payments` con clave de idempotencia, referencia SINPE única, código de autorización de tarjeta, soporte de pagos mixtos/parciales y reembolsos auditados. |
| **AUD-07** | **ALTA** | `src/context/POSContext.tsx` (1151, 1424) | El descuento de inventario ignora `recipe.yieldPortions` y la conversión de unidades (`convertToInventoryUnit`) cuando la receta usa gramos/ml y el inventario usa kg/litro. Además, anular una comanda siempre devuelve inventario aunque el plato ya haya sido cocinado. | Aplicar fórmula `(ing.quantity / yieldPortions) * soldQty` con conversión de unidades, guardar snapshot de costo histórico por línea, ejecutar rebajo único en evento configurable (autorización a cocina o cobro, con delta para ítems agregados) y preguntar en anulación si el insumo se recupera o es merma. |
| **AUD-08** | **ALTA** | `server.ts` (1–363) | Faltan cabeceras de seguridad (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP), política CORS restrictiva, sanitización de errores HTTP 500 (actualmente devuelve `error.message` interno), defensa explícita contra prompt injection en OCR de facturas, y el modelo `gemini-3.8-flash` debe actualizarse al alias vigente (`gemini-4-hydrogen`). | Aplicar middleware de seguridad en `server.ts`, CORS configurable por `ALLOWED_ORIGINS`, sanitización de errores, endurecimiento anti-prompt-injection y modelo `gemini-4-hydrogen`. |

---

## 3. Hallazgos Medios y de Producción

| ID | Severidad | Archivo(s) | Hallazgo | Mitigación |
|---|---|---|---|---|
| **AUD-09** | **MEDIA** | `src/utils/thermalPrinter.ts` (86) | Usa `window.open(...)`, bloqueado en iframes/PWAs móviles y restringido por política de entorno; solo soporta 80mm y un único formato de ticket. | Reemplazar `window.open` por impresión mediante `<iframe>` oculto local; soportar `58mm` y `80mm`; diferenciar comanda, copia, precuenta de mesa, comprobante interno no fiscal y cierre de caja. |
| **AUD-10** | **MEDIA** | `vite.config.ts` (13) | `VitePWA` usa `registerType: 'autoUpdate'`, lo que puede recargar la app en medio de una venta o cobro; además no excluye explícitamente rutas privadas `/api/*` del fallback. | Cambiar a `registerType: 'prompt'` con aviso seguro que espera a que no haya cobro/orden en edición; excluir `/api/` y endpoints privados de Firestore del caché del Service Worker. |
| **AUD-11** | **MEDIA** | `src/context/POSContext.tsx` (266, 334, 350, 418, 465) | Listeners `onSnapshot` sin `limit()` ni filtro de fechas descargan todo el historial de órdenes, movimientos y auditoría en cada carga (crecimiento lineal de costo Firestore). | Aplicar consultas acotadas por fecha operativa / ventana reciente y límites (`limit`) con carga bajo demanda para reportes históricos. |
| **AUD-12** | **MEDIA** | `src/context/POSContext.tsx` (2152–2241) | `restoreDataBackup` usa un único `writeBatch` (límite Firestore: 500 operaciones) y fallaría con respaldos medianos/grandes; no valida integridad de esquema por documento. | Dividir la restauración en lotes de máximo 400 escrituras, validar versión/esquema, excluir secretos y nunca sobrescribir roles/admins/auditoría silenciosamente. |
| **AUD-13** | **MEDIA** | `src/utils/offlineQueue.ts` | Una sola cola global sin separar usuario/dispositivo y con `catch` silenciosos que pueden ocultar fallos de almacenamiento. | Versionar IndexedDB (v3) con metadatos de usuario/dispositivo, clave de idempotencia, contador de reintentos, estado de error visible y contingencia explícita para cobros sin internet. |
| **AUD-14** | **MEDIA** | `bun.lock` (`bun audit`) | 4 vulnerabilidades transitivas reportadas por `bun audit` (`@grpc/grpc-js` vía `firebase`; `glob` y `minimatch` vía `vite-plugin-pwa > workbox-build`). | Documentadas en `docs/SEGURIDAD.md` y monitoreadas en CI; no afectan ejecución directa del servidor HTTP (`workbox-build` solo corre en build; `@grpc/grpc-js` es dependencia interna de compatibilidad de Firestore). |
| **AUD-15** | **MEDIA** | Falta de módulos críticos | Faltan: rol `cocina` + Pantalla de Cocina (KDS), catálogo real de Pollos Karen (revisión/importación segura), Proveedores y Cuentas por Pagar, Menú Digital Público QR/Exprés y documentación completa en `docs/`. | Implementar incrementalmente en Fases 1 a 9. |

---

## 4. Nota de Arquitectura sobre Firebase Admin SDK

El proyecto actual opera sobre la base de datos Firestore provisionada `ai-studio-polloskarenmanag-620e2f71-e206-47f9-9c14-f27fd5ad2c8a` (proyecto `funky-aloe-jxq1s`). En proyectos Google-hosted Starter Tier dentro de AI Studio, el contenedor del servidor corre con una cuenta de servicio sin permisos IAM sobre el proyecto del usuario, por lo que `firebase-admin` para lectura/escritura directa en Firestore o gestión de Auth requiere que el proyecto haya sido actualizado ("grow out") a un proyecto GCP administrado por el usuario con roles IAM otorgados.

Por ello, la arquitectura mantiene:
1. Validación estricta de tokens Firebase ID en `server.ts` (Identity Toolkit REST).
2. Seguridad primaria en Cloud Firestore mediante `firestore.rules` endurecidas.
3. Endpoints backend sin reutilización de tokens personales y listos para operar tanto en Starter Tier como en despliegue productivo propio (Cloud Run / VPS / Firebase Hosting).
