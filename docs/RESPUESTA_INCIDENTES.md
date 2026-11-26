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

## 3. Intento de Acceso Externo o Uso de Enlaces Antiguos
1. PK Manager es de uso exclusivamente interno: cualquier intento de acceso vía `?menu=table` o `?menu=expres` redirige automáticamente a la pantalla de inicio de sesión y los endpoints `/api/public/*` responden `HTTP 410 Gone`.
2. Si detecta intentos repetidos de ingreso no autorizado, verifique los registros del servidor y asegúrese de que no existan invitaciones abiertas indebidas en `/user_invites`.

## 4. Discrepancia de Caja o Error de Cobro
1. No borre registros de ventas ni de auditoría.
2. Si un pago fue erróneo, el Administrador debe emitir un **Reembolso** auditado (o **Anular Comanda** con motivo obligatorio y disposición explícita de inventario).
3. Registre el motivo completo en notas de cierre de caja.
