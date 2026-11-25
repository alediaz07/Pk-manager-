# AUDITORÍA FINAL E INDEPENDIENTE — POLLOS KAREN MANAGER

**Fecha de auditoría:** 2026-11-25  
**Alcance:** Revisión técnica, operativa, de seguridad, concurrencia, reglas Firestore, secretos y exclusiones del repositorio **Pollos Karen Manager** previo a la autorización de despliegue en producción.  
**Restricciones respetadas:**  
- **NO** se desplegaron las reglas de `firestore.rules` en producción.  
- **NO** se modificaron ni borraron datos reales en Cloud Firestore.  
- **NO** se declararon aprobaciones basadas únicamente en compilación exitosa.

---

## 0. VEREDICTO EJECUTIVO DE PREPARACIÓN PARA PRODUCCIÓN

### **VEREDICTO: NO APTO TODAVÍA PARA PRODUCCIÓN SIN COMPLETAR BLOQUEADORES EXTERNOS**

La aplicación presenta una base funcional, modular y segura a nivel de código cliente, backend Express y diseño de reglas Firestore (`vite build` pasa, `tsc --noEmit` pasa con 0 errores, `26/26` pruebas automatizadas pasan y el escaneo de secretos en código y `dist/` da 0 hallazgos).

**Sin embargo, NO se declara preparado para producción** por las siguientes razones verificables que requieren validación o configuración externa antes de liberar en operación real:

1. **Reglas `firestore.rules` sin pruebas contra Firebase Emulator Suite ni despliegue controlado:** No existen `firebase.json`, `firestore.indexes.json` ni `@firebase/rules-unit-testing` ejecutados contra el emulador real de Firestore. Además, antes de desplegar reglas se debe confirmar que el documento `/admins/{uid}` del propietario existe en el Firestore en vivo.
2. **Ausencia de Firebase Admin SDK / Cloud Functions en servidor:** El cálculo y persistencia de totales de pedidos POS internos, pagos y descuentos de inventario ocurre en el cliente (protegido por `firestore.rules` y `runTransaction`), no en un backend con autoridad de escritura sobre Firestore.
3. **Estado volátil en memoria RAM en `server.ts`:** El catálogo público sincronizado (`/api/public/catalog-sync`), la cola de pedidos públicos QR/Exprés (`publicOrderQueue`), los snapshots de Jarvis (`cachedCollections`) y los rate-limiters viven en memoria RAM del proceso Node.js y se pierden si el servidor se reinicia.
4. **Discrepancia comercial entre `src/config/pollosKarenCatalog.ts` y la Sección 20 del Prompt Maestro:** Los nombres y precios del catálogo importable no coinciden exactamente con el menú listado en la sección 20 del prompt maestro (se detalla en la Sección 8; no se modificaron precios sin autorización comercial).
5. **Validación externa pendiente obligatoria:** Pruebas físicas en la tablet de caja, tablet de cocina, impresora térmica real (58 mm / 80 mm), red local con corte de internet real, configuración de variables secretas (`GEMINI_API_KEY`, `JARVIS_API_KEY`, `ALLOWED_ORIGINS`) y rotación/auditoría del historial Git en el repositorio `alediaz07/Pk-manager-` (este sandbox no contiene carpeta `.git`).

### Defectos críticos reales detectados y corregidos localmente durante esta auditoría
Durante la inspección línea por línea (sin modificar datos reales ni desplegar reglas), se detectaron y corrigieron **4 defectos reales** en `src/context/POSContext.tsx` (apoyados por el nuevo módulo puro `src/utils/concurrencyGuards.ts`):

| # | Severidad | Archivo | Defecto real encontrado | Corrección aplicada |
|---|---|---|---|---|
| 1 | **Crítica** | `src/context/POSContext.tsx` (`syncOfflineQueue`) | Los pagos guardados sin internet (`type: 'payment_transaction'`) eran eliminados silenciosamente de IndexedDB al reconectar sin ejecutarse en Firestore. | Se implementó sincronización transaccional idempotente (`runTransaction`) validando caja abierta, existencia previa de `payments/{id}` y saldo real; en caso de conflicto marca `status: 'conflict'` sin borrar el registro. |
| 2 | **Crítica** | `src/context/POSContext.tsx` (`recordOrderPayment`) | `alreadyPaid` y `newPaidTotal` se calculaban fuera de `runTransaction` usando estado React potencialmente obsoleto, permitiendo sobrecobro ante 2 pagos parciales simultáneos. | Se movió la evaluación dentro de `runTransaction` vía `evaluateTransactionalPayment()`, leyendo `liveOrder.paidAmount`, `liveOrder.total`, `regData.status` y `tx.get(payRef)` para bloquear sobrecobro y garantizar idempotencia. |
| 3 | **Alta** | `src/context/POSContext.tsx` (`closeCashRegister`) | `updateDoc` enviaba `...target` completo al cerrar caja, lo que podía fallar el filtro `affectedKeys().hasOnly(...)` de `firestore.rules` para el rol `colaborador`. | Se reemplazó por `buildCashRegisterClosePatch()` enviando únicamente los campos permitidos por `firestore.rules`. |
| 4 | **Alta** | `src/context/POSContext.tsx` (`addPurchase`) | La verificación de `purchase_invoice_locks/{lockId}` ocurría con `getDoc` fuera de transacción antes del `writeBatch`. | Se migró a `runTransaction` leyendo `lockRef`, `regRef` e `inventory_items` antes de escribir el bloqueo, la compra, los movimientos de inventario y la deducción de caja atómicamente. |

---

## 1. VERIFICACIÓN INDIVIDUAL DE REQUISITOS DEL PROMPT MAESTRO

Se auditó bloque por bloque contra el prompt maestro (`Paste_November_25__2026_-_10_53AM_727ce855`, 2,101 líneas, 42 secciones):

- **Bloque I (Secciones 1–4 — Alcance, Exclusiones, Principios):** Exclusiones respetadas al 100% (cero Hacienda/CABYS/facturación electrónica/Uber Eats). Principio de cálculo de totales y descuentos de inventario en servidor cumplido **solo en pedidos públicos (`/api/public/order`)**; en el POS interno los cálculos corren en el cliente respaldados por transacciones Firestore y `firestore.rules`.
- **Bloque II (Secciones 5–13 — Secretos, Auth, RBAC, Reglas Firestore, Backend, IA):**
  - Cero llaves privadas hardcodeadas en código fuente o `dist/`.
  - `cachedAdminToken` eliminado de `server.ts`.
  - Tres roles implementados (`admin`, `colaborador`, `cocina`) + colección aislada `/kitchen_orders` sin precios y `/recipe_formulas` sin costos.
  - Invitaciones/alta controlada implementada en `AuthContext.tsx` y `firestore.rules` (usuarios desconocidos bloqueados; usuarios desactivados expulsados en tiempo real).
  - **Pendiente/Limitación:** MFA no habilitado (depende de configuración en Firebase Console / Identity Platform); fallback de correo personal del propietario sigue presente como red de seguridad bootstrap hasta verificar `/admins/{uid}` en producción.
- **Bloque III (Secciones 14–22 — POS, Estados, Pagos, Caja, Inventario, Recetas, Menú, Horarios, Mesas):**
  - Separación de `operationalStatus` y `financialStatus` implementada y verificada (`orderStateMachine.ts`, `POSContext.tsx`).
  - Pagos únicos, mixtos, parciales, cálculo de vuelto, detección de referencia SINPE duplicada, cobro anticipado o posterior, bloqueo con caja cerrada y arqueo por denominaciones CRC implementados.
  - Descuento delta de inventario (`deductedQuantity`), rendimiento por porciones (`yieldPortions`), conversión `g↔kg` / `ml↔litro`, costo promedio ponderado y disposición explícita al anular (`restored` vs `waste`) implementados.
  - Horario Costa Rica (`America/Costa_Rica`, L–V 07:00–18:00, desayunos 07:00–10:30) implementado.
  - **Observación:** Catálogo pre-cargable `src/config/pollosKarenCatalog.ts` difiere en nombres/precios de la lista de Sección 20 del prompt maestro (ver Sección 8).
- **Bloque IV (Secciones 23–27 — KDS Cocina, Impresión Térmica, Compras/CxP, Gastos, Dashboard/Reportes):**
  - Pantalla KDS aislada sin precios, comprobantes internos térmicos 58 mm / 80 mm con `DOCUMENTO INTERNO — NO FISCAL` sin `window.open`/`alert`/`confirm` (usa `iframe` oculto).
  - Compras al contado y a crédito (CxP con abonos), bloqueo atómico de facturas duplicadas (`purchase_invoice_locks`), escaneo OCR de facturas con Gemini en servidor (`POST /api/scan-invoice`) y reportes financieros con filtros de fechas implementados.
- **Bloque V (Secciones 28–30 — Menú Público QR/Exprés, PWA/Offline, Respaldos):**
  - Menú digital público con recalculo de precios en servidor, QR por mesa con rotación de token y exprés con radio La Uruca implementados (almacenamiento en RAM del servidor Express; ver Sección 8).
  - PWA (`vite-plugin-pwa`), IndexedDB (`offlineQueue.ts`) y ahora sincronización transaccional de pagos offline implementados.
  - Respaldo JSON sanitizado (excluye `users`, `admins`, `audit_logs`, `user_invites`, `purchase_invoice_locks`) y restauración por lotes (`<=400` ops) implementados.
- **Bloque VI–VIII (Secciones 31–42 — CI/CD, Pruebas, Documentación, Monitoreo):**
  - Los 18 documentos exigidos en `docs/` existen y están sin secretos.
  - Workflow `.github/workflows/ci-security.yml` creado con permisos mínimos y Gitleaks.
  - **Pendiente:** `firebase.json`, `firestore.indexes.json`, pruebas en Firebase Emulator Suite y pruebas E2E en dispositivos reales.

---

## 2. MATRIZ DE CUMPLIMIENTO

| # | Requisito (Prompt Maestro) | Estado | Evidencia verificable |
|---|---|---|---|
| 1 | Exclusiones (sin Hacienda, CABYS, FE, Uber Eats) | **Implementado** | `grep` en `src/`, `server.ts`, `docs/` = 0 referencias prohibidas; `thermalPrinter.ts` incluye `DOCUMENTO INTERNO — NO FISCAL`. |
| 2 | Cero secretos en código fuente y `dist/` | **Implementado** | `npm run scan:secrets` y `npm run scan:dist` aprueban con 0 hallazgos. |
| 3 | Auditoría y limpieza de historial Git (`Pk-manager-`) | **Requiere validación externa** | `/app/applet` no es un repositorio Git (`.git` inexistente en sandbox). |
| 4 | Autenticación controlada (bloqueo desconocidos y desactivados) | **Implementado** | `src/context/AuthContext.tsx` + `firestore.rules:44-103`. |
| 5 | Retiro definitivo de correo personal hardcodeado | **Parcialmente implementado** | `/admins/{uid}` es primario, pero persiste fallback `alejandrodiazortiz07@gmail.com` en `firestore.rules:32`, `server.ts:31` y `AuthContext.tsx:54` hasta verificar `/admins/{uid}` en vivo. |
| 6 | Autenticación multifactor (MFA) para administradores | **Pendiente** | Requiere activación en Firebase Console / Identity Platform (fuera de código). |
| 7 | RBAC 3 roles (`admin`, `colaborador`, `cocina`) | **Implementado** | `firestore.rules`, `AuthContext.tsx`, `POSContext.tsx`, `KDSView.tsx`. |
| 8 | Aislamiento financiero de `cocina` (`/kitchen_orders`) | **Implementado** | `firestore.rules:149,199-219`; `security.test.ts` verifica 0 precios en tickets. |
| 9 | Aislamiento de costos/recetas para `colaborador` (`/recipe_formulas`) | **Implementado** | `firestore.rules:273-305` restringe `recipes` y lectura de `inventory_items` a `admin`. |
| 10 | Validación de precios y totales en servidor (Menú público) | **Implementado** | `server.ts:1284-1333` recalcula totales desde catálogo del servidor. |
| 11 | Validación de precios, pagos e inventario en servidor (POS interno) | **Parcialmente implementado** | POS interno usa Firestore Client SDK + `runTransaction` + `firestore.rules` (sin Firebase Admin SDK / Cloud Functions en servidor). |
| 12 | POS: Mesa (+10%), Ventana (0%), Exprés (tarifa configurable) | **Implementado** | `orderStateMachine.ts`, `POSContext.tsx`, verificado en `operations.test.ts`. |
| 13 | Estados operativo y financiero desacoplados | **Implementado** | `operationalStatus` vs `financialStatus` en `orderStateMachine.ts` y `POSContext.tsx`. |
| 14 | Pagos mixtos, parciales, vuelto, SINPE único y anti doble cobro | **Implementado** | `POSContext.tsx` (`runTransaction` + `evaluateTransactionalPayment`), verificado en `concurrency.test.ts`. |
| 15 | Caja: apertura explícita, cierre/arqueo CRC, reapertura admin, bloqueo caja cerrada | **Implementado** | `POSContext.tsx` + `buildCashRegisterClosePatch` verificado contra `firestore.rules`. |
| 16 | Inventario: conversión unidades, `yieldPortions`, consumo delta, merma vs restitución | **Implementado** | `unitConverter.ts`, `orderStateMachine.ts`, `concurrencyGuards.ts`, verificado en `operations.test.ts` y `concurrency.test.ts`. |
| 17 | Compras, proveedores, crédito (CxP) y bloqueo atómico facturas duplicadas | **Implementado** | `POSContext.tsx:2747-2954` (`runTransaction` + `purchase_invoice_locks`), verificado en `concurrency.test.ts`. |
| 18 | Catálogo oficial Pollos Karen coincidente con Sección 20 | **Parcialmente implementado** | `src/config/pollosKarenCatalog.ts` contiene catálogo distinto al de Sección 20 (pendiente confirmación comercial del dueño). |
| 19 | KDS cocina en tiempo real + alertas + tiempos | **Implementado** | `src/components/KDSView.tsx` + `/kitchen_orders`. |
| 20 | Impresión térmica 58/80 mm sin `window.open` + sello NO FISCAL | **Implementado** | `src/utils/thermalPrinter.ts` (iframe oculto), verificado en `security.test.ts`; requiere validación en impresora física. |
| 21 | Escaneo OCR de facturas con Gemini en servidor (solo admin + anti-injection) | **Implementado** | `server.ts:419-575` (`requireAdminAuth`, rate-limit, validación MIME/tamaño); requiere `GEMINI_API_KEY` en entorno real. |
| 22 | API solo lectura para Jarvis (`x-api-key` + `timingSafeEqual`, sin clave fija) | **Implementado** | `server.ts:618-977`; snapshots dependen de RAM del servidor o token admin activo. |
| 23 | Menú digital público QR por mesa y Exprés La Uruca | **Parcialmente implementado** | Funcional vía `server.ts:980-1440`, pero `publicCatalogState` y `publicOrderQueue` son volátiles en RAM (se pierden al reiniciar Node). |
| 24 | PWA + Modo Offline + Sincronización de órdenes y pagos | **Implementado** | `vite.config.ts`, `offlineQueue.ts`, `POSContext.tsx` (corregido `payment_transaction` sync); requiere validación física con corte real de Wi-Fi. |
| 25 | Respaldo sanitizado y restauración validada por lotes (`<=400`) | **Implementado** | `backupManager.ts`, verificado en `security.test.ts`. Backups automáticos programados en nube están **Pendientes**. |
| 26 | Pruebas con Firebase Emulator Suite (`@firebase/rules-unit-testing`) | **Pendiente** | No existen `firebase.json`, `firestore.indexes.json` ni pruebas contra emulador de Firestore. |
| 27 | Pruebas de concurrencia, idempotencia, doble cobro y descuento duplicado | **Implementado** | `tests/concurrency.test.ts` (8/8 pruebas aprobadas, incluyendo ráfaga HTTP real contra Express). |
| 28 | GitHub Actions DevSecOps (`ci-security.yml`) | **Implementado** | `.github/workflows/ci-security.yml` creado; pendiente primera ejecución en GitHub tras sincronización. |
| 29 | Documentación obligatoria (`docs/*` — 18 archivos) | **Implementado** | Todos los archivos listados en Sección 38 existen en `/docs` + `AUDITORIA_FINAL.md`. |
| 30 | Pruebas en dispositivos físicos del restaurante | **Requiere validación externa** | Tablet caja, tablet cocina, impresora térmica y teléfonos reales de clientes. |

---

## 3. AUDITORÍA HONESTA DE LAS PRUEBAS AUTOMATIZADAS

Se inspeccionaron línea por línea `tests/security.test.ts` (10 pruebas), `tests/operations.test.ts` (8 pruebas) y la nueva suite `tests/concurrency.test.ts` (8 pruebas) = **26 pruebas ejecutadas y aprobadas (26/26)**.

### Desglose real: qué prueban realmente vs qué NO cubren todavía

| Suite | Total | Pruebas reales sobre servidor HTTP Express | Pruebas unitarias de lógica pura del proyecto | Verificaciones estáticas de código/reglas | ¿Prueba Firestore real o Emulador? |
|---|---|---|---|---|---|
| `tests/security.test.ts` | 10 | **5** (`/api/health`, `/api/scan-invoice`, `/api/ai/sales-summary`, `/api/public/menu`, `/api/public/order` en puerto real `127.0.0.1`) | **2** (`thermalPrinter.ts`, `backupManager.ts`) | **3** (`server.ts`, `firestore.rules`, ausencia de `window.open/alert/confirm` en `src/`) | **NO** |
| `tests/operations.test.ts` | 8 | **0** | **8** (`orderStateMachine.ts`, `unitConverter.ts`, `pollosKarenCatalog.ts`) | **0** | **NO** |
| `tests/concurrency.test.ts` (nueva) | 8 | **1** (ráfaga `Promise.all` de 16 requests simultáneos a `POST /api/public/order` validando HTTP 429) | **7** (harness transaccional asíncrono serializado usando `evaluateTransactionalPayment`, `computeOrderItemDeductionDeltas`, `buildPurchaseInvoiceLockId`, `buildCashRegisterClosePatch`) | **0** | **NO** (usa harness transaccional en memoria, no emulador Firestore) |
| **TOTAL** | **26** | **6 pruebas HTTP reales** | **17 pruebas unitarias/concurrencia reales** | **3 chequeos estáticos** | **0 pruebas en Emulador Firestore** |

### Conclusión honesta sobre las pruebas
- **Las 18 pruebas originales NO son falsas ni resultados inventados:** 5 ejercitan el servidor Express real vía HTTP, 10 validan funciones reales de producción (`orderStateMachine`, `unitConverter`, `thermalPrinter`, `backupManager`) y 3 verifican invariantes estáticas en `server.ts`, `firestore.rules` y `src/`.
- **Observación puntual en `tests/security.test.ts:194`:** El test envía el encabezado `X-Jarvis-Key` mientras que `server.ts:641` lee `x-api-key` (y `Authorization: Bearer`). El rechazo `401` sigue siendo real y válido, pero conviene alinear el nombre del encabezado en futuras pruebas con una clave válida de entorno aislado.
- **Brecha pendiente antes de producción:** Ninguna de las 26 pruebas ejecuta reglas de seguridad dentro de **Firebase Emulator Suite** (`@firebase/rules-unit-testing`) ni ejecuta pruebas E2E en navegador real (Playwright/Cypress) ni transacciones distribuidas multi-dispositivo contra Firestore real.

---

## 4. RE-AUDITORÍA DE `firestore.rules` Y PERMISOS RBAC

Se revisaron las **388 líneas** de `/firestore.rules` cruzándolas contra todas las operaciones de escritura en `src/context/POSContext.tsx` y `src/context/AuthContext.tsx`:

### Matriz verificada de permisos en `firestore.rules`

| Colección | `admin` | `colaborador` | `cocina` | Anónimo / Desconocido / Desactivado |
|---|---|---|---|---|
| `admins/{uid}` | Lectura/escritura | Denegado | Denegado | Denegado |
| `users/{uid}` | Lectura/escritura | Lee propio perfil; crea propio perfil SOLO si existe invitación activa en `user_invites` con mismo `role` | Igual que colaborador (solo propio perfil con invitación) | Denegado |
| `user_invites/{id}` | Lectura/escritura | Lee SOLO su propia invitación normalizada | Lee SOLO su propia invitación normalizada | Denegado |
| `orders/{id}` | Lectura/escritura | Lee, crea, actualiza no anuladas (y solo campos operativos si ya está `paid`) | **DENEGADO (0 acceso a precios/ventas)** | Denegado |
| `kitchen_orders/{id}` | Lectura/escritura | Lee, crea (sin llaves financieras), actualiza | Lee y actualiza SOLO `operationalStatus` (`in_preparation`/`ready`), `startedAt`, `readyAt`, `updatedAt` | Denegado |
| `payments/{id}` | Lee/crea/actualiza (reembolso); delete = `false` | Lee y crea (`status == 'confirmed'`, `amount > 0`); update/delete = `false` | Denegado | Denegado |
| `cash_registers/{id}` | Lectura/escritura | Lee, abre turno (`status == 'open'`), actualiza SOLO campos permitidos mientras `status == 'open'` (incluye cierre) | Denegado | Denegado |
| `cash_movements/{id}` | Lectura/escritura | Lee; crea SOLO `type in ['sale', 'initial_float']` | Denegado | Denegado |
| `inventory_items/{id}` | Lectura/escritura | **Lectura DENEGADA** (oculta costos); update SOLO decremento `currentStock <= existing().currentStock` | Denegado | Denegado |
| `recipes/{id}` | Lectura/escritura | **DENEGADO** (oculta costos/márgenes) | Denegado | Denegado |
| `recipe_formulas/{id}` | Lectura/escritura | Solo lectura (fórmulas sin costos para descuento delta) | Denegado | Denegado |
| `purchases`, `suppliers`, `operating_expenses`, `purchase_invoice_locks` | Lectura/escritura (`locks`: update = `false`) | Denegado | Denegado | Denegado |
| `audit_logs/{id}` | Lectura + creación validada; `update, delete: if false` | Creación validada (solo acciones no administrativas ligadas a doc existente + `performedByUid == request.auth.uid`); lectura/update/delete = `false` | Denegado | Denegado |
| Catch-all `/{document=**}` | `allow read, write: if false;` | `allow read, write: if false;` | `allow read, write: if false;` | `allow read, write: if false;` |

### Hallazgos y riesgos residuales de `firestore.rules`
1. **Compatibilidad corregida para `colaborador`:** Al cerrar caja, `POSContext.tsx` ahora envía exactamente el subconjunto de campos permitido por `firestore.rules:252-255`.
2. **Normalización de `user_invites`:** `AuthContext.tsx:56-61` (`email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')`) coincide exactamente con `firestore.rules:59` (`request.auth.token.email.lower().replace('[^a-z0-9]', '_')`).
3. **Riesgo residual #1 (Fallback de correo personal):** `firestore.rules:32` conserva `isPrimaryAdmin()` comparando `alejandrodiazortiz07@gmail.com`. **NO debe eliminarse todavía** hasta confirmar que `/admins/{uid}` existe en el Firestore en vivo; luego podrá retirarse.
4. **Riesgo residual #2 (Arquitectura sin Cloud Functions / Admin SDK):** Un usuario autenticado con rol `colaborador` que use el SDK de Firestore directamente fuera de la interfaz aún podría: (a) crear una orden con totales calculados desde el cliente, o (b) decrementar `inventory_items.currentStock` sin una orden vinculada (`firestore.rules:275-280`), o (c) crear un `cash_movements` con `type == 'sale'` sin verificar que `referenceId` apunte a un pago recién creado. Cerrar completamente estos 3 vectores requiere mover cobros y descuentos de inventario a Cloud Functions o un backend con Firebase Admin SDK.

---

## 5. AUDITORÍA DE SECRETOS Y ALMACENAMIENTO

### Resultados verificables ejecutados
- **Escaneo automatizado de código fuente (`npm run scan:secrets`):**
  `[SECRET SCAN OK] Cero secretos privados expuestos (código fuente).`
- **Escaneo automatizado del bundle compilado (`npm run scan:dist`):**
  `[SECRET SCAN OK] Cero secretos privados expuestos (código fuente + dist/).`
- **Búsqueda directa (`grep`) en `src/`, `server.ts`, `docs/`, `tests/`, `scripts/`, `.github/`:**
  - 0 llaves `AIza...` privadas (solo existe la `apiKey` web pública de Firebase dentro de `firebase-applet-config.json`, la cual es identificador público estándar de cliente web).
  - 0 bloques `BEGIN PRIVATE KEY`, 0 tokens `ghp_`/`gho_`/`sk-`, 0 cuentas de servicio JSON, 0 contraseñas ni claves `jarvis_default` en código o documentación.
  - No existe archivo `.env` local en el árbol de trabajo; `.gitignore` bloquea `.env`, `.env.*`, `*.pem`, `*.key`, `*service-account*.json`, `*backup*.json`, `dist/`.
- **Almacenamiento del navegador (`localStorage` / `sessionStorage` / `IndexedDB`):**
  - `localStorage`: único uso en `src/utils/offlineQueue.ts:29,32` (`pk_device_id`, identificador aleatorio anónimo de dispositivo). Cero tokens, cero contraseñas, cero secretos.
  - `sessionStorage`: 0 usos.
  - `IndexedDB` (`pollos_karen_offline_db`): almacena únicamente órdenes y mutaciones operativas pendientes de sincronización offline; no almacena tokens de autenticación ni secretos.
- **Registros (`console.*`):**
  - `server.ts`: cero impresión de claves, tokens o payloads sensibles.
  - `src/config/firebase.ts:90`: `handleFirestoreError` registra `userId`, `email` y ruta en `console.error` para depuración de errores Firestore (sin tokens ni contraseñas).
- **Auditoría de dependencias (`bun audit`):**
  - **4 vulnerabilidades transitivas detectadas:** 1 `high` + 1 `low` en `@grpc/grpc-js@1.9.16` (dependencia transitiva de `firebase > @firebase/firestore-compat`; afecta servidor gRPC Node, no se ejecuta en navegador cliente) y 2 `moderate` en `glob@11.1.0` / `minimatch` (dentro de `vite-plugin-pwa > workbox-build`, solo tiempo de compilación). Se recomienda actualizar `firebase` / `vite-plugin-pwa` cuando existan versiones parcheadas compatibles.
- **Limitación en historial Git:** El sandbox `/app/applet` no contiene `.git`. La inspección del historial completo de commits de `alediaz07/Pk-manager-` (con Gitleaks/TruffleHog) debe ejecutarse fuera del sandbox y se detalla en la Sección 10.

---

## 6. RESULTADOS REALES DE PRUEBAS DE CONCURRENCIA, IDEMPOTENCIA Y ANTI-DUPLICACIÓN

Se creó y ejecutó `tests/concurrency.test.ts` junto con el resto de la suite mediante `npm test`:

```text
Resultado Seguridad: 10/10 pruebas aprobadas.
Resultado Operación: 8/8 pruebas aprobadas.
Resultado Concurrencia e Idempotencia: 8/8 pruebas aprobadas.
TOTAL: 26/26 pruebas aprobadas.
```

Casos verificados en `tests/concurrency.test.ts`:
1. **Doble cobro concurrente (10 dispositivos simultáneos):** 1 ganador, 9 rechazos, exactamente 1 pago en `payments`, `paidAmount == 6600`, `cashSales == 6600`, `expectedCash == 56600`.
2. **Sobrecobro por pagos parciales simultáneos:** 2 pagos paralelos de ₡4,000 sobre orden de ₡6,600 → el primero aprueba (`paidAmount = 4000`, `partially_paid`), el segundo se rechaza por superar el saldo real pendiente (₡2,600); luego un abono exacto de ₡2,600 cierra la orden (`paid`).
3. **Idempotencia de reintentos (red/offline):** 3 ejecuciones con el mismo `paymentId` determinista → 1 escritura real, 2 detecciones `idempotentReplay: true`, 0 duplicación en caja.
4. **Cierre concurrente de caja:** cobro rechazado inmediatamente cuando `registerStatus === 'closed'`.
5. **Descuento duplicado de inventario:** 4 pases sucesivos (autorización qty 2 → re-guardado qty 2 → aumento a qty 3 → disparo al pagar) descuentan exactamente `0.4 kg` + `0 kg` + `0.2 kg` + `0 kg` = `0.6 kg` total (cero doble descuento).
6. **Bloqueo atómico de facturas duplicadas:** 8 envíos simultáneos del mismo proveedor + número de factura con variaciones de mayúsculas/espacios/guiones → 1 ganador y 7 rechazos (`purchase_invoice_locks`).
7. **Compatibilidad de cierre de caja con `firestore.rules`:** todas las llaves generadas por `buildCashRegisterClosePatch` pertenecen estrictamente al allowlist de `colaborador`.
8. **Ráfaga HTTP real sobre Express (`POST /api/public/order`):** 16 solicitudes simultáneas desde una misma IP → exactamente 12 procesadas y 4 bloqueadas con `HTTP 429`.

---

## 7. PROCEDIMIENTO DE RESPALDO, VERIFICACIÓN Y RECUPERACIÓN ANTES DE DESPLEGAR REGLAS

> **Ejecutar OBLIGATORIAMENTE en este orden antes de autorizar el despliegue de `firestore.rules` en producción (`funky-aloe-jxq1s`, BD `ai-studio-polloskarenmanag-620e2f71-e206-47f9-9c14-f27fd5ad2c8a`):**

### Paso 1 — Respaldo completo de datos reales
1. Iniciar sesión como **Administrador** en Pollos Karen Manager.
2. Ir a **Configuración → Respaldos y Recuperación** y descargar el respaldo JSON completo (`exportDataBackup()`). Guardar una copia cifrada/protegida fuera del repositorio (Google Drive privado o disco cifrado).
3. *(Recomendado adicional en Google Cloud / Firebase Console)*: Ejecutar un export nativo de Firestore a un bucket privado de Cloud Storage:
   ```bash
   gcloud firestore export gs://<BUCKET-PRIVADO-RESPALDOS-PK>/pre-rules-$(date +%Y%m%d-%H%M) \
     --database="ai-studio-polloskarenmanag-620e2f71-e206-47f9-9c14-f27fd5ad2c8a" \
     --project="funky-aloe-jxq1s"
   ```

### Paso 2 — Respaldo de las reglas Firestore actualmente activas (para rollback)
1. Abrir **Firebase Console → Firestore Database → Rules** (seleccionando la base de datos `ai-studio-polloskarenmanag-620e2f71-e206-47f9-9c14-f27fd5ad2c8a`).
2. Copiar las reglas actualmente publicadas en un archivo local fuera del repositorio (ej. `firestore.rules.prod.backup.YYYYMMDD`) o confirmar el número de versión activa en el historial de **Rules → Releases** de Firebase Console.

### Paso 3 — Verificación previa obligatoria de usuarios y colecciones (evitar bloqueo operativo)
Antes de publicar las nuevas reglas, confirmar en Firebase Console:
1. Que existe el documento `/admins/{UID_DEL_PROPIETARIO}` (con `active: true`, `email`, `createdAt`).
2. Que cada colaborador/cocina activo tiene su documento `/users/{uid}` con `active: true` y `role` exacto (`'admin'`, `'colaborador'` o `'cocina'`).
3. Que los documentos existentes en `/orders` tienen los campos mínimos esperados y que los productos/recetas activos generan `/recipe_formulas` al guardarse (si un colaborador descuenta inventario, el admin debe abrir y guardar sus recetas activas una vez para poblar `/recipe_formulas`).

### Paso 4 — Despliegue controlado y prueba de humo inmediata (ventana fuera de horario pico)
1. Publicar `firestore.rules` en horario no operativo (después de las 6:00 p. m. o fin de semana).
2. Probar en vivo durante 10 minutos con 3 cuentas reales:
   - **Admin:** login, lectura de dashboard/costos/compras/auditoría, apertura/cierre de caja de prueba.
   - **Colaborador:** login, apertura de caja, creación de orden Mesa/Ventana, cobro, cierre de caja, y confirmar que NO puede ver costos ni recetas privadas.
   - **Cocina:** login, vista KDS, cambio `authorized → in_preparation → ready`, confirmar que NO ve precios ni ventas.

### Paso 5 — Procedimiento de Rollback inmediato (si falla cualquier prueba de humo)
1. En **Firebase Console → Firestore Database → Rules**, abrir el historial de versiones (**Previous releases**).
2. Seleccionar la versión inmediatamente anterior respaldada en el Paso 2 y presionar **Restore / Publish** (restauración efectiva en < 30 segundos).
3. Si se requiere restaurar datos: usar el archivo JSON del Paso 1 desde **Configuración → Restaurar respaldo** (previa previsualización de conteos) o `gcloud firestore import` desde el bucket privado.

---

## 8. INVENTARIO HONESTO DE FUNCIONALIDADES SIMULADAS, INCOMPLETAS O DEPENDIENTES DE CONFIGURACIÓN EXTERNA

1. **Almacenamiento volátil en RAM en `server.ts`:** `publicCatalogState`, `publicOrderQueue`, `cachedCollections` (Jarvis) y rate-limiters se almacenan en memoria del proceso Node.js. Un reinicio de contenedor borra pedidos públicos pendientes de sincronización al POS y deja `/api/public/menu` en `503` hasta que una sesión de personal resincronice.
2. **Falta de Firebase Admin SDK / Cloud Functions en el backend:** El entorno actual no posee credenciales de cuenta de servicio para escritura privilegiada en Firestore desde `server.ts`. Por ello, el POS interno calcula totales y descuenta inventario desde el cliente con `runTransaction` + `firestore.rules` (ver riesgo residual en Sección 4).
3. **Discrepancia del catálogo pre-cargable (`src/config/pollosKarenCatalog.ts`) vs Prompt Maestro §20:**
   - El prompt maestro §20 menciona: *Pinto con huevo y salchichas (₡1,500)*, *Torta de huevo, salchichón y tortilla (₡1,500)*, *Empanada de pollo o carne (₡1,250)*, *Empanada de frijol, pinto o papa (₡1,000)*, *Casado de pollo frito/chicharrón/carne en salsa (₡3,000)*, *Casado de pollo asado (₡3,500)*, *La Karen Suprema (₡3,000 / ₡3,500 con papas)*, *Flautas (₡1,500)*, *Pinchos (₡1,500)*, *Pupusas (₡1,500)*, *Perros calientes (₡1,500)*, *Salchipapas (₡1,500)*, *Granizados (₡1,000)*.
   - `pollosKarenCatalog.ts` contiene una lista diferente (*Pinto Básico ₡2,000*, *Empanada Normal ₡900*, *Casado Básico ₡2,500*, etc., y omite *La Karen Suprema*, *Flautas*, *Pinchos*, *Pupusas* y *Granizados*).
   - **No se alteró sin autorización comercial.** El administrador debe confirmar qué lista de precios es la vigente antes de importar.
4. **Sin Firebase Emulator Suite configurado:** Faltan `firebase.json`, `firestore.indexes.json` y pruebas automatizadas con `@firebase/rules-unit-testing`.
5. **Variables de entorno externas requeridas en producción:** `GEMINI_API_KEY` (escaneo de facturas), `JARVIS_API_KEY` (mínimo 32 caracteres para API de lectura externa), `ALLOWED_ORIGINS` y `APP_URL`. Sin ellas, `/api/scan-invoice` y `/api/ai/*` (por API key) responden de forma segura en modo `fail-closed` (`503`/`401`).
6. **Sin MFA configurado ni respaldos automáticos programados en nube:** El respaldo actual es manual (descarga JSON por el administrador). Los respaldos programados diarios requieren Cloud Scheduler / Firestore Scheduled Backups en GCP.
7. **Pruebas físicas pendientes:** Impresora térmica real (58 mm / 80 mm), tablet de caja, tablet de cocina y corte real de red Wi-Fi.
8. **Vulnerabilidades transitivas en `bun audit`:** 1 `high` (`@grpc/grpc-js@1.9.16`, código servidor gRPC no usado en navegador) y 2 `moderate` (`glob`/`minimatch` en `vite-plugin-pwa`, solo build).

---

## 9. VERIFICACIÓN DE EXCLUSIONES DEL PROYECTO

Se comprobó mediante inspección de código y `grep` sobre todo el árbol (`src/`, `server.ts`, `tests/`, `docs/`):
- **Facturación electrónica / Ministerio de Hacienda / CABYS / XML tributario:** **0 implementaciones, 0 dependencias, 0 endpoints.**
- **Integraciones con Uber Eats, PedidosYa, DiDi Food o terceros de delivery:** **0 implementaciones, 0 referencias.**
- **Integraciones bancarias automáticas / pasarelas de cobro:** **0 implementaciones.**
- **Comprobantes internos:** `src/utils/thermalPrinter.ts` imprime de forma obligatoria `DOCUMENTO INTERNO — NO FISCAL` y `Comprobante interno de control. No válido como factura electrónica.` (verificado automáticamente por `tests/security.test.ts`).

---

## 10. SINCRONIZACIÓN CON GITHUB (`https://github.com/alediaz07/Pk-manager-`)

### Estado verificado en este entorno
- Se ejecutaron `git status` y `which gh` en `/app/applet`.
- **Resultado real:** `/app/applet` **no contiene carpeta `.git`** (`fatal: not a git repository`) y no cuenta con credenciales de GitHub ni `gh` CLI instaladas. Por seguridad y arquitectura del sandbox, **no es posible realizar `git push` directo a `alediaz07/Pk-manager-` ni auditar commits históricos desde aquí.**
- **Verificación previa de secretos completada:** `npm run scan:secrets` y `npm run scan:dist` pasaron con **0 secretos expuestos**; `.gitignore` protege `.env`, llaves y respaldos.

### Procedimiento seguro para sincronizar desde tu máquina o entorno Git autenticado
1. Clonar o actualizar el repositorio privado `https://github.com/alediaz07/Pk-manager-` y crear una rama dedicada (ej. `git checkout -b audit/pre-prod-hardening`).
2. Copiar los archivos verificados de este workspace (excluyendo `node_modules/`, `dist/` y cualquier `.env` local).
3. Ejecutar antes del `commit` y `push`:
   ```bash
   npm run scan:secrets
   npm run lint
   npm test
   npm run build
   npm run scan:dist
   git status --ignored
   ```
4. Ejecutar escaneo de historial previo en tu máquina antes de fusionar a `main`:
   ```bash
   gitleaks detect --source . --verbose --redact
   ```
   *(Si Gitleaks reporta alguna credencial histórica en commits antiguos, revocar y rotar esa credencial antes de cualquier reescritura de historial.)*
5. Confirmar que ningún archivo privado esté en `git diff --staged` y realizar `git push -u origin audit/pre-prod-hardening` para revisión por Pull Request (ejecutando automáticamente `.github/workflows/ci-security.yml`).

---

## 11. EVIDENCIA VERIFICABLE DE COMANDOS EJECUTADOS EN ESTA AUDITORÍA

| Comando | Resultado | Detalle |
|---|---|---|
| `npm run lint` (`tsc --noEmit`) | **PASS (0 errores)** | Verificación estricta TypeScript de `src/`, `server.ts` y `tests/`. |
| `npm run build` (`vite build`) | **PASS** | Bundle de producción + Service Worker PWA generados en `dist/`. |
| `npm test` | **PASS (26/26)** | Seguridad `10/10`, Operación `8/8`, Concurrencia e Idempotencia `8/8`. |
| `npm run scan:secrets` | **PASS (0 hallazgos)** | Cero secretos privados en código fuente y documentación. |
| `npm run scan:dist` | **PASS (0 hallazgos)** | Cero secretos privados en código fuente y `dist/`. |
| `bun audit` | **4 hallazgos transitivos** | 1 High + 1 Low (`@grpc/grpc-js@1.9.16` vía `firebase`), 2 Moderate (`glob`/`minimatch` vía `vite-plugin-pwa`). |
| `git status` | **Sin `.git` en sandbox** | Sincronización con `alediaz07/Pk-manager-` requiere ejecución desde entorno con Git autenticado. |
