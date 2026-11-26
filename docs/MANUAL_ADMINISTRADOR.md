# Manual del Administrador — Pollos Karen Manager

## 1. Inicio de Sesión y Gestión de Usuarios
- Ingrese con su cuenta de Administrador (`role: "admin"`).
- En **Auditoría y Usuarios**:
  - Cree cuentas de **Colaborador** (salón/caja) o **Cocina** (tablet KDS) con contraseña segura (mínimo 8 caracteres con letras y números).
  - Para acceso con Google Sign-In, cree primero una **Preautorización (Invitación)** con el correo exacto y el rol deseado. Ninguna cuenta externa puede autorregistrarse.
  - Desactivar un usuario revoca su sesión activa en tiempo real.

## 2. Configuración del Local y Menú Oficial
En **Configuración**:
- Ajuste horarios (`America/Costa_Rica`), tarifa de envío Exprés (₡500 por defecto), radio de cobertura (1 km), ancho de impresora térmica (`80mm` o `58mm`) y disparador de descuento de inventario (`kitchen_auth` o `payment`).
- Use **Importar / Sincronizar Menú Oficial** para cargar o actualizar sin sobrescribir innecesariamente el catálogo de Pollos Karen (Desayunos 7:00–10:30, Casados, Platos del Día, Comidas Rápidas y Bebidas).

## 3. Compras, Proveedores, CxP e Inventario
- En **Compras**: escanee facturas con Gemini AI (siempre requiere revisión manual antes de confirmar) o regístrelas manualmente. El bloqueo atómico impide registrar dos veces la misma factura (`proveedor + número`).
- Use el **Directorio de Proveedores** y registre compras a **Crédito (CxP)** con fecha de vencimiento y control de abonos.
- En **Recetas**: defina ingredientes, `Rendimiento (Porciones por Lote)` y active el descuento automático.
- En **Inventario**: registre mermas justificadas y consulte el **Planificador Semanal de Compras**, que indica con transparencia si cada proyección proviene de historial real, recetas vendidas o estimación inicial.

## 4. Caja, Anulaciones, Reembolsos y Reportes
- La caja requiere **apertura y cierre explícito** con conteo por denominación CRC. Solo el Administrador puede **reabrir una caja cerrada**, **anular comandas** (eligiendo explícitamente si devolver insumos o registrar como merma) y **emitir reembolsos** auditados.
- En **Dashboard**: filtre por fechas, revise margen real (COGS histórico), CxP, ingresos de envío Exprés y exporte reportes a Excel (CSV UTF-8 con BOM).
- En **Auditoría y Respaldos**: exporte copias JSON sanitizadas y valide cualquier respaldo antes de restaurar (las colecciones protegidas `users`, `admins`, `audit_logs` nunca se sobrescriben).
