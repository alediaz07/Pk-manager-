import { doc, Firestore, writeBatch } from 'firebase/firestore';
import { OperatingExpense, Purchase, RestaurantOrder } from '../types';

export const ALLOWED_BACKUP_COLLECTIONS = [
  'categories',
  'products',
  'tables',
  'inventory_items',
  'recipes',
  'recipe_formulas',
  'suppliers',
  'purchases',
  'operating_expenses',
  'orders',
  'payments',
  'cash_registers',
  'cash_movements',
  'restaurant_config',
] as const;

export const FORBIDDEN_BACKUP_COLLECTIONS = [
  'users',
  'admins',
  'user_invites',
  'audit_logs',
  'purchase_invoice_locks',
] as const;

export interface BackupPayload {
  version: string;
  exportedAt: string;
  restaurant: string;
  currency: 'CRC';
  data: Partial<Record<(typeof ALLOWED_BACKUP_COLLECTIONS)[number], any[]>>;
}

export interface BackupValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  totalDocuments: number;
  collectionCounts: Record<string, number>;
}

export function buildSanitizedBackup(
  collectionsData: Partial<Record<(typeof ALLOWED_BACKUP_COLLECTIONS)[number], any[]>>
): BackupPayload {
  const sanitized: BackupPayload['data'] = {};
  for (const col of ALLOWED_BACKUP_COLLECTIONS) {
    const list = collectionsData[col];
    if (Array.isArray(list)) {
      sanitized[col] = list;
    }
  }
  return {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    restaurant: 'Pollos Karen — La Uruca, Costa Rica',
    currency: 'CRC',
    data: sanitized,
  };
}

export function validateBackupPayload(raw: any): BackupValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const collectionCounts: Record<string, number> = {};
  let totalDocuments = 0;

  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      errors: ['El archivo de respaldo no es un objeto JSON válido.'],
      warnings,
      totalDocuments: 0,
      collectionCounts,
    };
  }

  const dataBlock = raw.data && typeof raw.data === 'object' ? raw.data : raw;

  for (const forbidden of FORBIDDEN_BACKUP_COLLECTIONS) {
    if (forbidden in dataBlock) {
      warnings.push(
        `La colección protegida "${forbidden}" será omitida automáticamente por seguridad.`
      );
    }
  }

  for (const col of ALLOWED_BACKUP_COLLECTIONS) {
    const entries = dataBlock[col];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) {
      errors.push(`La colección "${col}" tiene un formato inválido (debe ser un arreglo).`);
      continue;
    }

    let validCount = 0;
    for (const item of entries) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) {
        errors.push(`Se detectó un documento sin "id" válido dentro de "${col}".`);
        break;
      }
      validCount += 1;
    }
    collectionCounts[col] = validCount;
    totalDocuments += validCount;
  }

  if (totalDocuments === 0 && errors.length === 0) {
    errors.push('El archivo de respaldo no contiene colecciones operativas restaurables.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    totalDocuments,
    collectionCounts,
  };
}

/**
 * Splits a list of write operations into chunks strictly <= maxBatchSize (default 400 < Firestore 500 limit).
 */
export function chunkOperations<T>(items: T[], maxBatchSize: number = 400): T[][] {
  const size = Math.max(1, Math.min(maxBatchSize, 450));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function restoreBackupInChunks(
  db: Firestore,
  rawPayload: any,
  maxBatchSize: number = 400
): Promise<{ batchesCommitted: number; documentsRestored: number }> {
  const validation = validateBackupPayload(rawPayload);
  if (!validation.valid) {
    throw new Error(validation.errors.join(' '));
  }

  const dataBlock = rawPayload.data && typeof rawPayload.data === 'object' ? rawPayload.data : rawPayload;
  const operations: Array<{ collection: string; id: string; data: any }> = [];

  for (const col of ALLOWED_BACKUP_COLLECTIONS) {
    const entries = dataBlock[col];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (entry && typeof entry.id === 'string' && entry.id.trim()) {
        operations.push({ collection: col, id: entry.id.trim(), data: entry });
      }
    }
  }

  const chunks = chunkOperations(operations, maxBatchSize);
  let documentsRestored = 0;

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const op of chunk) {
      batch.set(doc(db, op.collection, op.id), op.data, { merge: true });
    }
    await batch.commit();
    documentsRestored += chunk.length;
  }

  return {
    batchesCommitted: chunks.length,
    documentsRestored,
  };
}

function escapeCsvCell(val: any): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an Excel-compatible UTF-8 BOM CSV financial report
 */
export function buildFinancialReportCSV(
  orders: RestaurantOrder[],
  purchases: Purchase[],
  expenses: OperatingExpense[],
  periodLabel: string
): string {
  const rows: string[][] = [
    ['Pollos Karen — Reporte Financiero Interno (DOCUMENTO INTERNO - NO FISCAL)'],
    ['Período', periodLabel, 'Moneda', 'CRC'],
    [],
    ['TIPO', 'FECHA', 'REFERENCIA', 'DETALLE', 'METODO', 'SUBTOTAL', 'SERVICIO_10', 'EXPRES', 'TOTAL_CRC'],
  ];

  orders
    .filter(o => (o.paymentStatus === 'paid' || o.financialStatus === 'paid') && o.status !== 'cancelled')
    .forEach(o => {
      rows.push([
        'VENTA',
        o.operationalDate || o.createdAt.slice(0, 10),
        o.orderNumber,
        `${o.serviceType.toUpperCase()} ${o.tableName || ''}`.trim(),
        o.paymentMethod || 'efectivo',
        String(o.subtotal || 0),
        String(o.serviceCharge || 0),
        String(o.deliveryFee || 0),
        String(o.total || 0),
      ]);
    });

  purchases.forEach(p => {
    rows.push([
      'COMPRA',
      p.date,
      p.purchaseNumber || p.id,
      p.vendor || 'Proveedor',
      p.paymentMethod,
      String(p.total || 0),
      '0',
      '0',
      String(-(p.total || 0)),
    ]);
  });

  expenses
    .filter(e => e.status === 'paid')
    .forEach(e => {
      rows.push([
        'GASTO',
        e.lastPaidAt ? e.lastPaidAt.slice(0, 10) : e.dueDate,
        e.id,
        `${e.name} (${e.category})`,
        e.paymentMethod,
        String(e.amount || 0),
        '0',
        '0',
        String(-(e.amount || 0)),
      ]);
    });

  const csvContent = rows.map(r => r.map(escapeCsvCell).join(',')).join('\r\n');
  return `\uFEFF${csvContent}`;
}
