# Pollos Karen Manager

Sistema interno integral de gestión operativa, punto de venta (POS), pantalla de cocina (KDS), caja general, inventario, recetas, compras, proveedores, gastos operativos, menú digital y finanzas para **Pollos Karen** (La Uruca, Costa Rica).

- **Moneda:** Colón costarricense (`CRC ₡`)
- **Zona horaria oficial:** `America/Costa_Rica`
- **Horario habitual:** Lunes a viernes, 7:00 a. m. a 6:00 p. m. (desayunos de 7:00 a. m. a 10:30 a. m.; sábado y domingo cerrado)
- **Alcance legal explícito:** Los comprobantes emitidos por el sistema son **documentos internos no fiscales**. Este sistema no implementa facturación electrónica de Hacienda, códigos CABYS ni integraciones con plataformas externas de entregas.

## Stack Tecnológico

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React, PWA (`vite-plugin-pwa`)
- **Backend:** Node.js + Express (`server.ts`)
- **Base de datos y Autenticación:** Firebase Authentication + Cloud Firestore
- **IA (solo servidor):** Google Gemini API (`@google/genai`) para lectura efímera de facturas de compra y endpoints de solo lectura para asistente Jarvis/ChatGPT
- **Offline:** IndexedDB (`src/utils/offlineQueue.ts`)

## Roles del Sistema

1. **`admin` (Administrador):** Acceso total a POS, mesas, caja, inventario, recetas, catálogo, compras, proveedores, gastos operativos, dashboard financiero, auditoría, usuarios, respaldos y configuración.
2. **`colaborador` (Colaborador / Salón y Caja):** Acceso operativo a POS, mesas, caja (cobros y movimientos permitidos), menú digital QR y tickets. Sin acceso a costos, márgenes, compras, gastos, recetas financieras ni utilidades.
3. **`cocina` (Pantalla de Cocina / KDS):** Acceso exclusivo a la pantalla de cocina con comandas sanitizadas (sin precios, totales, métodos de pago ni información financiera).

## Requisitos e Inicio Rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar plantilla de variables de entorno (NUNCA subir .env a Git)
cp .env.example .env

# 3. Ejecutar servidor de desarrollo (puerto 3000)
npm run dev

# 4. Verificar tipos TypeScript y ejecutar pruebas
npm run lint
npm test

# 5. Escanear posibles secretos expuestos y compilar producción
npm run scan:secrets
npm run build
npm run scan:dist
```

## Documentación Técnica y Operativa

Toda la documentación oficial vive en la carpeta `docs/`:

- [docs/AUDITORIA.md](docs/AUDITORIA.md) — Auditoría técnica y de seguridad inicial
- [docs/PLAN_IMPLEMENTACION.md](docs/PLAN_IMPLEMENTACION.md) — Plan por fases (Fases 0 a 9)
- [docs/PROGRESO.md](docs/PROGRESO.md) — Bitácora viva de avance y decisiones
- [docs/SEGURIDAD.md](docs/SEGURIDAD.md) — Modelo de amenazas, RBAC, reglas y mitigaciones
- [docs/GESTION_SECRETOS.md](docs/GESTION_SECRETOS.md) — Manejo de secretos y rotación segura
- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — Arquitectura cliente/servidor/Firestore
- [docs/BASE_DE_DATOS.md](docs/BASE_DE_DATOS.md) — Colecciones, esquemas e índices
- [docs/PERMISOS.md](docs/PERMISOS.md) — Matriz de permisos por rol
- [docs/API.md](docs/API.md) — Endpoints Express, autenticación y contratos
- [docs/MANUAL_ADMINISTRADOR.md](docs/MANUAL_ADMINISTRADOR.md) — Guía del administrador
- [docs/MANUAL_COLABORADOR.md](docs/MANUAL_COLABORADOR.md) — Guía de salón y caja
- [docs/MANUAL_COCINA.md](docs/MANUAL_COCINA.md) — Guía de pantalla de cocina (KDS)
- [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) — Despliegue seguro a producción
- [docs/PRUEBAS.md](docs/PRUEBAS.md) — Estrategia y resultados de pruebas
- [docs/RESPALDOS.md](docs/RESPALDOS.md) — Respaldos, verificación y restauración
- [docs/CONTINGENCIA.md](docs/CONTINGENCIA.md) — Operación sin internet y recuperación
- [docs/RESPUESTA_INCIDENTES.md](docs/RESPUESTA_INCIDENTES.md) — Plan de respuesta a incidentes
- [docs/CHECKLIST_PRODUCCION.md](docs/CHECKLIST_PRODUCCION.md) — Lista de verificación pre-salida
