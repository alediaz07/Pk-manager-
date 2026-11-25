# Política de Respaldos y Restauración — Pollos Karen Manager

## 1. Exportación de Respaldos (Solo Administrador)
- Desde **Auditoría y Respaldos**, pulse **Exportar Respaldo JSON**.
- El sistema genera un archivo estructurado versión `2.0` únicamente con las colecciones operativas permitidas (`categories`, `products`, `tables`, `inventory_items`, `recipes`, `recipe_formulas`, `suppliers`, `purchases`, `operating_expenses`, `orders`, `payments`, `cash_registers`, `cash_movements`, `restaurant_config`).
- Se recomienda exportar un respaldo al cierre de cada viernes y almacenarlo en una unidad segura fuera del repositorio Git (los archivos de respaldo están excluidos en `.gitignore`).

## 2. Restauración Segura con Validación Previa
- Al cargar un archivo JSON para restaurar, `validateBackupPayload` ejecuta una vista previa (**dry-run**) que verifica formato, identificadores de documento y conteo por colección.
- **Protección de seguridad**: las colecciones críticas (`users`, `admins`, `user_invites`, `audit_logs`, `purchase_invoice_locks`) son excluidas automáticamente para impedir pérdida de acceso administrativo o alteración de auditoría.
- **Lotes seguros**: `restoreBackupInChunks` divide cualquier restauración superior a 400 documentos en múltiples `writeBatch` (≤400 operaciones por lote), evitando el límite de 500 escrituras de Firestore.
- Cada restauración queda registrada en `/audit_logs`.
