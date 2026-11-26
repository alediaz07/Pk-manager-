# Plan de Contingencia Operativa — Pollos Karen Manager

## 1. Caída de Internet en el Local
- **POS y Salón**: continúe tomando comandas; el sistema detecta modo sin conexión y encola operaciones en IndexedDB v3 (`offlineQueue.ts`) asociadas al usuario y dispositivo.
- **Escaneo de facturas IA**: requiere conexión activa. Registre compras manualmente mientras vuelve el enlace.
- **Reconexión**: al restablecer Internet, el sistema sincroniza la cola pendiente. Si alguna operación falla repetidamente o queda marcada con `requiresReconciliation`, el administrador debe revisarla y conciliarla manualmente antes de cerrar caja.

## 2. Falla de Impresora Térmica
- Use la **Pantalla de Cocina (KDS)** como canal primario en cocina; las comandas aparecen en tiempo real sin depender de papel.
- Si falla la impresora de caja, entregue el detalle desde pantalla o reimprima desde el historial una vez restablecido el equipo.

## 3. Caída de Tablet KDS en Cocina
- Utilice la impresión térmica de comandas desde el POS (`Imprimir Cocina`) o abra temporalmente la vista KDS desde un celular o laptop secundaria con una cuenta `cocina`.

## 4. Cierre de Caja de Día Anterior Olvidado
- Al iniciar la mañana siguiente, el módulo **Caja** detectará automáticamente la jornada pendiente de cierre. Cierre primero la caja atrasada con el conteo físico real y luego abra la nueva caja del día actual.
