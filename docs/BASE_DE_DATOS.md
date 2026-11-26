# Modelo de Base de Datos (Cloud Firestore)

Todas las colecciones residen en Cloud Firestore bajo el proyecto configurado (`funky-aloe-jxq1s`), preservando compatibilidad con documentos existentes.

## Colecciones Principales

| Colección | Propósito | Acceso Lectura | Acceso Escritura |
| --- | --- | --- | --- |
| `/users/{uid}` | Perfil, rol activo (`admin`, `colaborador`); `cocina` histórico bloqueado y estado `active` | Propio usuario o Admin | Solo Admin |
| `/admins/{uid}` | Índice auxiliar de administradores activos | Admin | Solo Admin |
| `/user_invites/{normalizedEmail}` | Preautorización de cuentas Google/correo por rol | Admin o dueño autenticado | Solo Admin |
| `/categories/{id}` | Categorías del menú (con horarios opcionales) | Staff (`admin`, `colaborador`) | Solo Admin |
| `/products/{id}` | Productos, precios CRC, bandera `isCasado` y disponibilidad | Staff | Solo Admin |
| `/tables/{id}` | Mesas/barra y estado (`libre`, `activa`, `pendiente_pago`). Campos históricos legacy preservados sin generación activa. | Staff | Admin (Colaborador solo estado/orden) |
| `/orders/{id}` | Comandas internas (`source: 'pos'` para pedidos nuevos; lectura compatible con registros históricos) con `operationalStatus` y `financialStatus` separados | Staff | Staff (Anulación: solo Admin) |
| `/kitchen_orders/{id}` | Proyección histórica del módulo retirado | Solo Admin | Denegado |
| `/kitchen_tickets/{id}` | Historial de impresiones y reimpresiones (`*** COPIA ***`) | Staff | Staff |
| `/payments/{id}` | Pagos persistentes (efectivo, SINPE con ref., tarjeta, parciales/mixtos) | Staff | Staff crea (idempotente); reembolsos solo Admin |
| `/cash_registers/{id}` | Jornadas de caja (apertura explícita, arqueo, denominaciones, cierre) | Staff | Staff abre/cierra; reapertura solo Admin |
| `/cash_movements/{id}` | Movimientos de caja (ventas, depósitos, retiros, compras, gastos, reembolsos) | Staff | Staff crea; edición/borrado solo Admin |
| `/inventory_items/{id}` | Insumos, stock actual, stock mínimo y costo promedio ponderado | Solo Admin | Admin (Colaborador: solo decremento atómico POS) |
| `/inventory_movements/{id}` | Kardex de compras, consumos, mermas, ajustes y devoluciones | Solo Admin | Admin (Colaborador: solo `consumption` POS) |
| `/recipes/{id}` | Recetas completas con `yieldPortions`, costos unitarios y márgenes | Solo Admin | Solo Admin |
| `/recipe_formulas/{id}` | Proyección sin costos de recetas para descuento delta desde POS | Staff | Solo Admin |
| `/suppliers/{id}` | Directorio de proveedores y condiciones de crédito | Solo Admin | Solo Admin |
| `/purchases/{id}` | Compras a contado y crédito (Cuentas por Pagar / abonos) | Solo Admin | Solo Admin |
| `/purchase_invoice_locks/{lockId}` | Bloqueo atómico único `proveedor__factura` anti-duplicados | Solo Admin | Solo Admin (`!exists`) |
| `/operating_expenses/{id}` | Gastos fijos y operativos por categoría y vencimiento | Solo Admin | Solo Admin |
| `/restaurant_config/main` | Horarios CR, tarifa Exprés, ancho térmico, disparador inventario | Todos los usuarios activos | Solo Admin |
| `/audit_logs/{id}` | Bitácora inmutable (`update, delete: if false`) | Solo Admin | Staff/Admin al crear evento real |

## Consultas Acotadas y Rendimiento
- Los listeners en `POSContext` están filtrados por los dos roles activos y aplican `limit(...)`; ya no existe una suscripción a `/kitchen_orders`.
- Esquema sincronizado en `/firebase-blueprint.json` y `/security_spec.md`.
