# Progreso de Implementación — Pollos Karen Manager

**Última actualización**: 2026-11-25  
**Estado general**: Conversión a aplicación 100% interna completada y verificada localmente (compilación, TypeScript, 26/26 pruebas automatizadas y escaneo de secretos en código y bundle `dist/`).

## Estado por Fase
- **Fase 0 (Higiene de secretos, CI y documentación base)**: Completada (`.gitignore`, `.env.example`, `scripts/scan-secrets.mjs`, `.github/workflows/ci-security.yml`, `README.md`, `docs/AUDITORIA.md`, `docs/PLAN_IMPLEMENTACION.md`, `docs/GESTION_SECRETOS.md`).
- **Fase 1 (Seguridad, 3 roles, Backend y Reglas)**: Completada (`AuthContext.tsx` sin autorregistro, preautorización Google, revocación en vivo; `server.ts` sin `cachedAdminToken`, cabeceras CSP/CORS/rate limit, `/api/scan-invoice` anti-prompt-injection; `firestore.rules`, `firebase-blueprint.json` y `security_spec.md` sincronizados).
- **Fase 2 (POS, estados separados, mesas y Exprés manual)**: Completada (`orderStateMachine.ts`, `POSContext.tsx`, `POSView.tsx`, `ActiveOrdersModal.tsx`).
- **Fase 3 (Caja explícita, pagos persistentes y arqueo CRC)**: Completada (`CashRegisterView.tsx`, `PaymentModal.tsx`, apertura/cierre explícito, alertas de jornadas previas, denominaciones CRC, pagos parciales/mixtos/SINPE, reembolsos y reapertura auditada).
- **Fase 4 (Pantalla de Cocina KDS dedicada)**: Completada (`KitchenDisplayView.tsx`, aislamiento estricto de `rol: cocina` sin precios ni datos financieros, alertas de demora >10m/>20m, sonido Web Audio, pantalla completa y Wake Lock).
- **Fase 5 (Inventario delta, recetas con rendimiento, compras, proveedores y CxP)**: Completada (`RecipesView.tsx` con `yieldPortions`, `PurchasesView.tsx` con proveedores y Cuentas por Pagar, `ExpensesView.tsx` ampliado, `WeeklyPurchasePlannerModal.tsx` con transparencia de fuente de datos y anulación con disposición explícita de inventario).
- **Fase 6 (Catálogo oficial Pollos Karen y Configuración)**: Completada (`pollosKarenCatalog.ts`, `RestaurantConfigView.tsx` con importación segura del menú oficial).
- **Fase 7 (Impresión térmica sin popups, PWA controlada y Respaldos seguros)**: Completada (`thermalPrinter.ts` vía `<iframe>` oculto 58mm/80mm con `DOCUMENTO INTERNO — NO FISCAL`, `PWAUpdatePrompt.tsx`, `offlineQueue.ts` IndexedDB v3, `backupManager.ts` con dry-run y lotes ≤400).
- **Fase 8 (Reportes financieros reales y exportación Excel CSV)**: Completada (`DashboardView.tsx` con COGS histórico, CxP, envío Exprés y exportación CSV UTF-8 BOM).
- **Fase 9 (Pruebas automatizadas, concurrencia y documentación integral)**: Completada (`tests/security.test.ts` 10/10, `tests/operations.test.ts` 8/8, `tests/concurrency.test.ts` 8/8 y documentación completa en `/docs/`).
- **Fase 10 (Conversión a aplicación exclusivamente interna)**: Completada — eliminados completamente `PublicMenuView`, rutas `?menu=table` / `?menu=expres`, endpoints `/api/public/*` (ahora bloqueados con `HTTP 410 Gone`), sincronización de catálogo público, polling de pedidos digitales, generación/rotación de QR y dependencias `qrcode` / `@types/qrcode`; módulo renombrado a **Configuración**; reglas de Firestore reforzadas para exigir `source == 'pos'` en pedidos nuevos manteniendo compatibilidad con registros históricos.

## Acciones Pendientes que Requieren Confirmación o Entorno Externo
1. Aprobar y desplegar `/firestore.rules` sobre el proyecto Firebase de producción (`funky-aloe-jxq1s`).
2. Configurar variables privadas (`GEMINI_API_KEY`, `JARVIS_API_KEY`, `APP_URL`, `ALLOWED_ORIGINS`) en el entorno de producción.
3. Ejecutar Gitleaks sobre el historial Git remoto en GitHub (`alediaz07/Pk-manager-`).
4. Realizar pruebas físicas en el restaurante: impresora térmica 58mm/80mm, tablet de cocina y corte real de Internet.
