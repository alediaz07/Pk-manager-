# Matriz de Permisos por Rol — Pollos Karen Manager

El sistema opera con **3 roles internos estrictos** (`admin`, `colaborador`, `cocina`). Las cuentas inactivas (`active: false`) o no registradas son bloqueadas de inmediato.

| Funcionalidad / Módulo | Administrador (`admin`) | Colaborador (`colaborador`) | Cocina (`cocina`) |
| --- | :---: | :---: | :---: |
| Punto de Venta (POS) y Mesas | Total | Total | Sin acceso |
| Autorizar pedidos QR Mesa / Exprés | Sí | Sí | Sin acceso |
| Cobrar comandas (Efectivo / SINPE / Tarjeta / Mixto / Parcial) | Sí | Sí | Sin acceso |
| Abrir y cerrar caja diaria | Sí | Sí | Sin acceso |
| Reabrir caja cerrada o registrar reembolso | Sí (auditado) | No | No |
| Anular comandas (con motivo y disposición de inventario) | Sí | No | No |
| Pantalla de Cocina (KDS) — ver ítems sin precios | Sí | Sí | **Vista única dedicada** |
| Cambiar estado en KDS (`En Preparación` / `Lista`) | Sí | Sí | Sí |
| Ver precios, totales, caja o métricas financieras | Sí | Solo totales de venta/caja | **Cero acceso** |
| Inventario, costos promedio, mermas y planificador | Sí | Sin acceso | Sin acceso |
| Recetas, márgenes y precios de carta | Sí | Sin acceso | Sin acceso |
| Compras, proveedores, CxP y escaneo IA de facturas | Sí | Sin acceso | Sin acceso |
| Gastos operativos | Sí | Sin acceso | Sin acceso |
| Reportes financieros y exportación Excel CSV | Sí | Sin acceso | Sin acceso |
| Gestión de usuarios, invitaciones, auditoría y respaldos | Sí | Sin acceso | Sin acceso |
| Configuración del local y rotación de QR | Sí | Sin acceso | Sin acceso |
