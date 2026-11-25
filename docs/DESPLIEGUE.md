# Guía de Despliegue — Pollos Karen Manager

## 1. Variables de Entorno Requeridas
Defina las variables en el entorno de despliegue (nunca las guarde en el repositorio Git; use `.env.example` como plantilla):

- `PORT=3000`
- `NODE_ENV=production`
- `APP_URL=https://<tu-dominio-produccion>`
- `ALLOWED_ORIGINS=https://<tu-dominio-produccion>`
- `GEMINI_API_KEY=<clave privada de Gemini para escaneo de facturas>`
- `JARVIS_API_KEY=<clave aleatoria larga >=32 caracteres para /api/ai/*>`
- `PRIMARY_ADMIN_EMAIL=<correo del administrador principal>`

## 2. Pasos de Compilación y Verificación Previa
```bash
npm install
npm run lint
npm test
npm run scan:secrets
npm run build
npm run scan:dist
```

## 3. Inicio en Producción
```bash
npm start
```
El servidor Express (`server.ts`) servirá la compilación estática de `dist/` y todos los endpoints `/api/*` en el puerto configurado.

## 4. Despliegue de Reglas de Firestore (Requiere Aprobación Explícita)
Antes de publicar las nuevas reglas de `/firestore.rules` sobre el proyecto `funky-aloe-jxq1s`:
1. Verifique que las cuentas de administrador actuales tengan su documento activo en `/users/{uid}` con `role: "admin"` y `active: true`.
2. Pruebe las reglas con emulador o aprobación explícita del propietario del restaurante.
3. Despliegue las reglas mediante `firebase deploy --only firestore:rules` o mediante la herramienta de despliegue cuando el administrador autorice.

## 5. Limpieza Histórica de GitHub
Ejecute Gitleaks sobre el repositorio remoto (`https://github.com/alediaz07/Pk-manager-`) usando el workflow `.github/workflows/ci-security.yml` para confirmar que no existan secretos históricos y rote cualquier clave comprometida si se detectara algún hallazgo antiguo.
