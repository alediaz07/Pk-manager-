# Plan de Implementación — Pollos Karen Manager

Este plan organiza el endurecimiento, corrección operativa y preparación para producción en **10 fases secuenciales (Fase 0 a Fase 9)**, conservando los datos existentes y la identidad visual de Pollos Karen.

| Fase | Nombre | Objetivos Clave |
|---|---|---|
| **Fase 0** | Auditoría y Protección Inmediata | Escaneo de secretos, endurecimiento de `.gitignore` y `.env.example`, script `scan-secrets.mjs`, workflow CI/DevSecOps, `README.md`, `docs/AUDITORIA.md`, `docs/GESTION_SECRETOS.md`, `docs/PROGRESO.md`. |
| **Fase 1** | Seguridad (Auth, 3 Roles, Reglas, Backend, IA) | Bloquear auto-acceso de cuentas Google externas; 3 roles (`admin`, `colaborador`, `cocina`); revocación en tiempo real; recuperación de contraseña; `firestore.rules` y `firebase-blueprint.json` endurecidos; eliminar `cachedAdminToken`; headers de seguridad, CORS, anti-prompt-injection y actualización a `gemini-4-hydrogen`. |
| **Fase 2** | POS, Estados Separados, Pagos Persistentes y Caja | Máquina de estados separada (`operationalStatus` + `financialStatus`); colección `payments` con idempotencia, SINPE único, pagos parciales/mixtos y reembolsos; eliminar caja automática ₡50,000 y cierre silencioso; apertura/cierre formal con conteo por denominación; división/cambio/unión de mesas; Exprés propio (₡500 configurable, 1 km, vuelto). |
| **Fase 3** | Inventario y Recetas | Fórmula exacta con `yieldPortions` y conversión de unidades; costo histórico por ítem; evento único configurable de rebajo (autorización cocina o cobro) con delta por agregados; anulación con elección explícita de recuperación vs. merma. |
| **Fase 4** | Catálogo Real de Pollos Karen y Horarios | Módulo administrativo para revisar/importar el menú oficial de Pollos Karen (Desayunos, Casados, Platos del Día, Comidas Rápidas, Otros) con precios reales en CRC y horarios configurables (L–V 7am–6pm, Desayunos 7am–10:30am, S–D cerrado) sin sobrescribir datos reales existentes. |
| **Fase 5** | Pantalla de Cocina (KDS) e Impresión Térmica | Módulo KDS en tiempo real sobre colección sanitizada `kitchen_orders` (cero precios/finanzas), alertas sonoras/visuales, cronómetros, pantalla completa + Wake Lock; impresora térmica `58mm` y `80mm` por iframe oculto sin `window.open` con 5 formatos (comanda, copia, precuenta, comprobante interno no fiscal, cierre de caja). |
| **Fase 6** | Administración (Proveedores, CxP, Gastos, Dashboard) | Proveedores, compras a crédito y cuentas por pagar con abonos; planificador semanal mejorado con histórico real; gastos operativos completos (planilla, CCSS, pólizas, etc.); dashboard financiero con separación de servicio 10%, envíos, descuentos, COGS vs compras, punto de equilibrio y exportación CSV compatible con Excel. |
| **Fase 7** | Estabilidad, Offline, Respaldos y Costos Firebase | Cola IndexedDB v3 por usuario/dispositivo con visibilidad de errores y contingencia de cobros offline; PWA `registerType: 'prompt'` seguro; respaldo/restauración en lotes (≤400 escrituras) protegiendo roles/admins/auditoría; consultas Firestore acotadas con `limit()` y filtros operativos. |
| **Fase 8** | Menú Digital Público (QR Mesas y Exprés) | Menú público sin login desde proyección sanitizada (`public_catalog`), QR de mesas con token aleatorio revocable (10% servicio, requiere autorización en recepción), menú Exprés público (0% servicio, costo envío configurable, consulta de estado) y panel de administración de QRs y pedidos entrantes. |
| **Fase 9** | Pruebas Integrales, Documentación Final y Checklist | Suites automatizadas de seguridad, operaciones, estados, pagos, inventario, offline y reglas; completar toda la documentación en `docs/`; build final + escaneo de secretos en `dist/` + checklist de producción. |

## Exclusiones Estrictas Confirmadas

- **NO** facturación electrónica ni integración con el Ministerio de Hacienda.
- **NO** códigos CABYS ni certificados tributarios.
- **NO** integraciones con Uber Eats ni plataformas externas de entrega.
- Todo comprobante de venta emitido indica explícitamente: **`DOCUMENTO INTERNO — NO FISCAL`**.
