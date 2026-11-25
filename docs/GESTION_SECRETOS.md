# Gestión de Secretos y Protección del Repositorio — Pollos Karen Manager

## 1. Clasificación de Configuraciones y Secretos

| Variable / Archivo | Tipo | Ubicación Permitida | ¿Puede ir al cliente (`dist/`)? |
|---|---|---|---|
| `GEMINI_API_KEY` | **Secreto privado** | Variables de entorno del servidor (`.env` local no versionado / Secret Manager) | **NO — NUNCA** |
| `JARVIS_API_KEY` | **Secreto privado** | Variables de entorno del servidor (mínimo 32 caracteres aleatorios) | **NO — NUNCA** |
| `PRIMARY_ADMIN_EMAIL` | Configuración operativa | Variable de entorno del servidor (opcional) | No es secreto, pero no sustituye `/admins/{uid}` |
| `firebase-applet-config.json` | Identificador público de app Firebase | Cliente y servidor (protegido por `firestore.rules` y restricciones de dominio/API en Google Cloud) | Sí (estándar de Firebase Web SDK) |
| Service Account JSON / `*.pem` / `*.key` | **Secreto crítico** | **PROHIBIDO en el repositorio** | **NO — NUNCA** |
| Respaldos `*respaldo*.json` / dumps | **Datos privados del negocio** | Almacenamiento privado del administrador (Drive/USB cifrado) | **NO — NUNCA en Git** |

---

## 2. Reglas Obligatorias

1. **Nunca** anteponer `VITE_` a claves privadas (`GEMINI_API_KEY`, `JARVIS_API_KEY`, tokens de servicio). Vite incrusta todas las variables `VITE_*` en el bundle público del navegador.
2. **Nunca** incluir valores de respaldo ("fallback") codificados en el código para llaves de API o contraseñas.
3. **Nunca** imprimir secretos ni tokens Bearer en `console.log`, respuestas de error HTTP, archivos de prueba ni documentación.
4. Ejecutar antes de cada publicación:
   ```bash
   npm run scan:secrets
   npm run build
   npm run scan:dist
   ```

---

## 3. Cómo Auditar el Historial Git en `https://github.com/alediaz07/Pk-manager-`

El entorno sandbox de trabajo no contiene la carpeta `.git`, por lo que el repositorio GitHub debe auditarse ejecutando localmente o mediante el workflow incluido (`.github/workflows/ci-security.yml`):

```bash
# Instalar gitleaks (macOS / Linux / Windows) y escanear todo el historial Git
gitleaks detect --source . --verbose --redact
```

Además, en GitHub (`Settings > Code security and analysis`) se recomienda activar:
- **Repository visibility:** Private (aplicación de uso interno)
- **Secret scanning** y **Push protection**
- **Dependabot alerts** y **Dependabot security updates**

---

## 4. Procedimiento de Rotación Inmediata si se Detecta una Fuga

> **Importante:** La rotación de credenciales reales de producción requiere acción directa del propietario en Google Cloud / AI Studio / OpenAI.

1. **Revocar y regenerar inmediatamente** la clave afectada:
   - `GEMINI_API_KEY`: Google AI Studio / Google Cloud Console > APIs & Services > Credentials.
   - `JARVIS_API_KEY`: Generar nueva clave aleatoria (`openssl rand -hex 32`), actualizar la variable en el servidor y actualizar el header `x-api-key` en la configuración del Custom GPT / Jarvis.
   - Restricciones de la `apiKey` web de Firebase: En Google Cloud Console > Credentials, restringir por **HTTP referrers** a los dominios reales de producción y limitar las APIs habilitadas únicamente a Firebase Auth / Identity Toolkit / Firestore.
2. **Eliminar el secreto del historial Git** (solo tras aprobación del propietario, ya que reescribe historial):
   ```bash
   git filter-repo --invert-paths --path <archivo-expuesto>
   git push --force --all
   ```
3. **Registrar el incidente** siguiendo `docs/RESPUESTA_INCIDENTES.md`.
