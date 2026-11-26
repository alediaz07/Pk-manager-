# Plan de Contingencia Operativa — Pollos Karen Manager

## 1. Caída de Internet en el Local
- **POS y Salón**: continúe tomando comandas; el sistema detecta modo sin conexión y encola operaciones en IndexedDB v3 (`offlineQueue.ts`) asociadas al usuario y dispositivo.
- **Escaneo de facturas IA**: requiere conexión activa. Registre compras manualmente mientras vuelve el enlace.
- **Reconexión**: al restablecer Internet, el sistema sincroniza la cola pendiente. Si alguna operación falla repetidamente o queda marcada con `requiresReconciliation`, el administrador debe revisarla y conciliarla manualmente antes de cerrar caja.

## 2. Falla de Impresora Térmica
- Registre la orden en POS y transcriba manualmente la comanda en papel, con número de pedido, cantidades y observaciones. Entregue una sola copia a cocina y evite duplicar la preparación.
- Si dispone de otra impresora compatible, selecciónela en el navegador. Reimprima solo cuando haga falta y marque las copias para evitar preparación duplicada.

## 3. Cierre de Caja de Día Anterior Olvidado
- Al iniciar la mañana siguiente, el módulo **Caja** detectará automáticamente la jornada pendiente de cierre. Cierre primero la caja atrasada con el conteo físico real y luego abra la nueva caja del día actual.
