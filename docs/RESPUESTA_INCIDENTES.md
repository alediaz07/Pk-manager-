# Procedimiento de Respuesta a Incidentes — Pollos Karen Manager

## 1. Sospecha de Cuenta Comprometida o Salida de Personal
1. Ingrese como Administrador a **Auditoría y Usuarios**.
2. Desactive inmediatamente la cuenta (`active: false`). El listener `onSnapshot` cerrará la sesión en todos los dispositivos en segundos.
3. Si existía una invitación pendiente en `/user_invites`, elimínela o revóquela.
4. Revise `/audit_logs`, `/cash_movements` y `/payments` del período involucrado.

## 2. Exposición Accidental de Clave Privada (`GEMINI_API_KEY`, `JARVIS_API_KEY`)
1. **Revoque y rote** la clave inmediatamente en Google AI Studio / Cloud Console o genere una nueva `JARVIS_API_KEY` aleatoria de ≥32 caracteres.
2. Actualice la variable de entorno en el entorno de producción y reinicie el servicio.
3. Ejecute `npm run scan:secrets` y el workflow `ci-security.yml` (Gitleaks) para confirmar que no permanezca ninguna referencia en código ni en historial Git.

## 3. Abuso o Escaneo No Autorizado de QR de Mesa
1. Ingrese a **Configuración & QR**.
2. Pulse **Rotar Token QR** en la mesa afectada (o desactive temporalmente los pedidos QR desde la configuración general).
3. El código QR anterior quedará rechazado automáticamente por el servidor (`403`).

## 4. Discrepancia de Caja o Error de Cobro
1. No borre registros de ventas ni de auditoría.
2. Si un pago fue erróneo, el Administrador debe emitir un **Reembolso** auditado (o **Anular Comanda** con motivo obligatorio y disposición explícita de inventario).
3. Registre el motivo completo en notas de cierre de caja.
