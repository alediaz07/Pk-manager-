# Checklist de Salida a Producción — Pollos Karen Manager

## Seguridad y Secretos
- [x] Eliminado `cachedAdminToken` y cualquier llave de respaldo hardcodeada en `server.ts`.
- [x] Cabeceras de seguridad (`CSP`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) y CORS restrictivo configurados.
- [x] Cero autorregistro público en `AuthContext.tsx` y `firestore.rules`.
- [x] Aislamiento estricto de 3 roles (`admin`, `colaborador`, `cocina`).
- [x] Escaneo de secretos en código fuente (`npm run scan:secrets`) aprobado sin hallazgos.
- [ ] Configurar `GEMINI_API_KEY`, `JARVIS_API_KEY`, `APP_URL` y `ALLOWED_ORIGINS` en variables de entorno reales de producción.
- [ ] Ejecutar Gitleaks sobre el historial completo del repositorio GitHub (`alediaz07/Pk-manager-`).
- [ ] Aprobar y desplegar `/firestore.rules` sobre el proyecto Firebase de producción (`funky-aloe-jxq1s`).

## Operación POS, Caja, Cocina e Inventario
- [x] Reglas verificadas: Mesa `+10%`, Ventana `0%`, Exprés tarifa configurable (`₡500`).
- [x] Estados operativo y financiero separados; pago no marca entregada la comanda.
- [x] Apertura y cierre explícito de caja (sin auto-inicio ₡50,000 ni auto-cierre silencioso) + contador de denominaciones CRC.
- [x] Pantalla de Cocina (KDS) sin precios ni datos financieros.
- [x] Descuento delta de inventario con `yieldPortions`, conversión de unidades y disposición explícita al anular (`restored` / `waste` / `none`).
- [x] Compras con bloqueo anti-duplicado, proveedores y Cuentas por Pagar (CxP).
- [x] Impresión térmica 58mm/80mm mediante `<iframe>` oculto (0 `window.open`) con `DOCUMENTO INTERNO — NO FISCAL`.
- [x] Exclusiones respetadas: sin facturación electrónica, sin Hacienda/CABYS, sin Uber Eats.

## Validación Física Pendiente en Local (La Uruca)
- [ ] Probar impresión física 58mm y 80mm en impresora térmica real.
- [ ] Probar tablet dedicada en cocina (`rol: cocina`) durante un turno real.
- [ ] Confirmar en producción que cualquier enlace antiguo (`?menu=table` / `?menu=expres`) exige inicio de sesión y que `/api/public/*` responde `410 Gone`.
- [ ] Realizar respaldo inicial JSON desde **Auditoría y Respaldos**.
