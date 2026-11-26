# Seguridad — Pollos Karen Manager

## 1. Modelo de Seguridad Aplicado
- **Autenticación real**: Firebase Authentication (Correo/Contraseña con política mínima de 8 caracteres alfanuméricos + Google Sign-In únicamente para correos previamente invitados en `/user_invites/{normalizedEmail}`).
- **Cero autorregistro público**: cualquier cuenta autenticada sin documento activo en `/users/{uid}` o invitación previa es cerrada inmediatamente (`signOut`) sin conceder acceso.
- **Revocación inmediata de sesión**: `AuthContext` mantiene un listener `onSnapshot` sobre `/users/{uid}`; desactivar un usuario cierra su sesión activa al instante.
- **Protección contra fuerza bruta en cliente**: bloqueo temporal progresivo en `LoginView` tras 5 intentos fallidos consecutivos.
- **Aislamiento estricto por rol (RBAC)**: `admin` y `colaborador` aplicados tanto en la interfaz como en `firestore.rules` y en `server.ts`.

## 2. Hardening del Servidor Express (`server.ts`)
- Eliminación total de `cachedAdminToken` y de cualquier credencial estática de respaldo.
- Cabeceras HTTP de seguridad en todas las respuestas:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` restrictiva
  - `Content-Security-Policy` compatible con iframe de Google AI Studio y Firebase/Google Fonts.
- **CORS restrictivo**: validado contra `ALLOWED_ORIGINS` (`APP_URL` y orígenes locales de desarrollo).
- **Rate limiting en memoria** en endpoints sensibles (`/api/scan-invoice`, `/api/ai/*`).
- **Bloqueo permanente de APIs públicas**: todas las rutas históricas `/api/public/*` responden `HTTP 410 Gone` sin revelar datos ni aceptar pedidos externos.
- **Prevención de Prompt Injection**: el escaneo de facturas con Gemini (`/api/scan-invoice`) trata el texto extraído como datos no confiables con salida JSON estrictamente validada y sanitizada.
- **Errores sanitizados**: ningún stack trace ni detalle interno se devuelve en respuestas HTTP `500`.

## 3. Reglas de Firestore (`firestore.rules`)
- Política **deny-by-default** (`match /{document=**} { allow read, write: if false; }`).
- **Rol histórico `cocina`**: bloqueado en autenticación y en las reglas de operación; no se crean nuevas cuentas ni invitaciones con ese rol. La colección histórica `/kitchen_orders` es de solo lectura administrativa.
- **Colaborador (`isColaborador()`)**: operación POS, mesas, cobros y cierre de caja; lectura de `/recipe_formulas` (sin costos) para descuento delta de inventario; sin acceso de lectura a `/recipes` (costos/márgenes), `/purchases`, `/operating_expenses` ni `/audit_logs`.
- **Auditoría inmutable**: `/audit_logs` permite únicamente `create` vinculado al `request.auth.uid`, correo autenticado y documento real existente; `update` y `delete` están bloqueados (`if false`).
- **Pedidos exclusivamente internos**: `/orders` exige personal autenticado (`isStaff()`), `source == 'pos'` y rechaza `publicTrackingCode` en pedidos nuevos, preservando compatibilidad de lectura con registros históricos.
- **Bloqueo concurrente de facturas duplicadas**: `/purchase_invoice_locks/{vendor__invoice}` exige `!exists(...)` atómicamente en `writeBatch`.

## 4. Documentos Internos No Fiscales
- El sistema **no implementa facturación electrónica ni integración con Hacienda/CABYS**.
- Todos los comprobantes internos de venta muestran de forma obligatoria: `DOCUMENTO INTERNO — NO FISCAL`.

## 5. Estado de Despliegue de Reglas
- Las reglas actualizadas residen en `/firestore.rules` y fueron validadas mediante pruebas automatizadas estáticas.
- **No han sido desplegadas automáticamente a producción** para evitar interrupciones sin aprobación previa del administrador.
