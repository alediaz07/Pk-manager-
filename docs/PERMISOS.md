# Matriz de Permisos por Rol — Pollos Karen Manager

El sistema opera con **2 roles internos activos** (`admin`, `colaborador`). Las cuentas inactivas (`active: false`) o no registradas son bloqueadas de inmediato. El rol histórico `cocina` está retirado y no obtiene acceso al POS automáticamente.

| Funcionalidad / Módulo | Administrador (`admin`) | Colaborador (`colaborador`) |
| --- | :---: | :---: |
| Punto de Venta (POS: Mesa, Ventana, Exprés manual) y Mesas | Total | Total |
| Imprimir y reimprimir comandas físicas; registrar entrega en POS | Sí | Sí |
| Cobrar comandas (Efectivo / SINPE / Tarjeta / Mixto / Parcial) | Sí | Sí |
| Abrir y cerrar caja diaria | Sí | Sí |
| Reabrir caja cerrada o registrar reembolso | Sí (auditado) | No |
| Anular comandas (con motivo y disposición de inventario) | Sí | No |
| Ver precios, totales, caja o métricas financieras | Sí | Solo totales de venta/caja |
| Inventario, costos promedio, mermas y planificador | Sí | Sin acceso |
| Recetas, márgenes y precios de carta | Sí | Sin acceso |
| Compras, proveedores, CxP y escaneo IA de facturas | Sí | Sin acceso |
| Gastos operativos | Sí | Sin acceso |
| Reportes financieros y exportación Excel CSV | Sí | Sin acceso |
| Gestión de usuarios, invitaciones, auditoría y respaldos | Sí | Sin acceso |
| Configuración del local y catálogo oficial | Sí | Sin acceso |
