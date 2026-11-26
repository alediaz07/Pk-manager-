import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {
  buildInternalSalesReceiptHtml,
  buildKitchenTicketHtml,
  createKitchenTicketFromOrder,
  NON_FISCAL_DISCLAIMER,
} from '../src/utils/thermalPrinter';
import {
  chunkOperations,
  FORBIDDEN_BACKUP_COLLECTIONS,
  validateBackupPayload,
} from '../src/utils/backupManager';
import type { RestaurantOrder } from '../src/types';

process.env.DISABLE_AUTO_LISTEN = 'true';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err?.message || String(err) });
    console.error(`  [FAIL] ${name}: ${err?.message || err}`);
  }
}

async function main() {
  console.log('\n=== POLLOS KAREN MANAGER — SECURITY & INTEGRITY TEST SUITE ===');
  const rootDir = process.cwd();

  // 1. Static audit of server.ts (no cachedAdminToken, no hardcoded private keys)
  await runTest('server.ts contiene 0 cachedAdminToken y 0 llaves privadas hardcodeadas', () => {
    const serverSrc = fs.readFileSync(path.join(rootDir, 'server.ts'), 'utf8');
    assert.equal(serverSrc.includes('cachedAdminToken'), false, 'cachedAdminToken no debe existir en server.ts');
    assert.equal(/AIza[0-9A-Za-z\-_]{35}/.test(serverSrc), false, 'No debe existir llave AIza hardcodeada en server.ts');
    assert.equal(/BEGIN PRIVATE KEY/.test(serverSrc), false, 'No debe existir llave privada PEM en server.ts');
    assert.equal(serverSrc.includes('X-Content-Type-Options'), true, 'Debe incluir X-Content-Type-Options');
    assert.equal(serverSrc.includes('Content-Security-Policy'), true, 'Debe incluir CSP');
  });

  // 2. Static audit of firestore.rules
  await runTest('firestore.rules: 2 roles activos, KDS retirado, auditoría inmutable', () => {
    const rules = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
    assert.equal(rules.includes('allow read, write: if false;'), true, 'Debe existir catch-all deny-by-default');
    assert.equal(rules.includes('function isCocina()'), false, 'No debe existir rol activo de cocina');
    assert.equal(fs.existsSync(path.join(rootDir, 'src/components/kitchen/KitchenDisplayView.tsx')), false);
    const posSource = fs.readFileSync(path.join(rootDir, 'src/context/POSContext.tsx'), 'utf8');
    assert.equal(posSource.includes("'kitchen_orders'"), false, 'POS no debe escribir ni escuchar KDS');
    assert.equal(posSource.includes("'kitchen_tickets'"), true, 'Debe conservar el registro de comandas impresas');
    assert.equal(posSource.includes('printKitchenTicket(ticket, restaurantConfig.printerWidth)'), true);
    assert.equal(rules.includes("incoming().role in ['admin', 'colaborador']"), true);
    assert.equal(rules.includes('function isActiveUser()'), true, 'Debe verificar usuario activo');
    assert.match(rules, /match \/kitchen_orders\/\{orderId\} \{\s*allow read: if isAdmin\(\);\s*allow write: if false;/);
    assert.equal(rules.includes('match /payments/{paymentId}'), true, 'Debe existir colección /payments');
    assert.equal(rules.includes('match /purchase_invoice_locks/{lockId}'), true, 'Debe existir bloqueo atómico de facturas duplicadas');
    assert.equal(rules.includes('allow update, delete: if false;'), true, 'audit_logs debe prohibir update y delete');
    assert.equal(rules.includes('match /recipes/{recipeId}'), true, 'Debe proteger /recipes');
    assert.equal(rules.includes('match /recipe_formulas/{recipeId}'), true, 'Debe existir proyección sin costos /recipe_formulas');
    assert.equal(rules.includes("incoming().source == 'pos'"), true, 'Los pedidos nuevos deben exigir origen interno pos');
    assert.equal(rules.includes("!('publicTrackingCode' in incoming())"), true, 'Los pedidos nuevos no deben aceptar publicTrackingCode');
    assert.equal(rules.includes("'rotate_qr'"), false, 'rotate_qr debe haberse eliminado de audit_logs');
    assert.equal(fs.existsSync(path.join(rootDir, 'src/components/public/PublicMenuView.tsx')), false, 'PublicMenuView.tsx no debe existir');
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    assert.equal(Boolean(pkg.dependencies?.qrcode || pkg.dependencies?.['@types/qrcode']), false, 'qrcode no debe estar en package.json');
  });

  // 3. Static audit: zero window.open / window.alert / window.confirm in src/
  await runTest('Código cliente (src/) no contiene window.open, window.alert ni window.confirm', () => {
    const walk = (dir: string, acc: string[] = []): string[] => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, acc);
        else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
      }
      return acc;
    };
    const files = walk(path.join(rootDir, 'src'));
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      assert.equal(
        /\bwindow\.(open|alert|confirm)\s*\(/.test(content),
        false,
        `Uso prohibido de window.open/alert/confirm detectado en ${path.relative(rootDir, file)}`
      );
    }
  });

  // 4. Kitchen ticket contains ZERO prices; internal receipt MUST contain NON_FISCAL_DISCLAIMER
  await runTest('Comanda de cocina omite precios y comprobante interno incluye leyenda NO FISCAL', () => {
    const sampleOrder: RestaurantOrder = {
      id: 'ord-sec-1',
      orderNumber: 'M-901',
      serviceType: 'mesa',
      tableName: 'Mesa 4',
      items: [
        {
          id: 'line-1',
          productId: 'prod-casado',
          name: 'Casado Pollos Karen',
          price: 3800,
          quantity: 2,
          isCasado: true,
          selectedProtein: 'Pollo',
          notes: 'Sin ensalada',
          subtotal: 7600,
        },
      ],
      status: 'in_kitchen',
      operationalStatus: 'authorized',
      financialStatus: 'paid',
      paymentStatus: 'paid',
      subtotal: 7600,
      serviceCharge: 760,
      total: 8360,
      operationalDate: '2026-11-25',
      createdBy: 'Cajero',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const ticket = createKitchenTicketFromOrder(sampleOrder, false, 0);
    const kitchenHtml = buildKitchenTicketHtml(ticket, '80mm');
    assert.equal(kitchenHtml.includes('3,800') || kitchenHtml.includes('8,360') || kitchenHtml.includes('₡'), false, 'Comanda de cocina nunca debe incluir precios ni montos');
    assert.equal(kitchenHtml.includes('POLLO'), true, 'Comanda de cocina debe incluir proteína');

    const receiptHtml = buildInternalSalesReceiptHtml(sampleOrder, [], { paperWidth: '80mm' });
    assert.equal(receiptHtml.includes(NON_FISCAL_DISCLAIMER), true, 'Comprobante interno debe mostrar DOCUMENTO INTERNO — NO FISCAL');
    assert.equal(/hacienda|cabys|factura electr[oó]nica v[aá]lida/i.test(receiptHtml.replace('No válido como factura electrónica.', '')), false, 'No debe incluir referencias fiscales ni CABYS');
  });

  // 5. Backup validation & chunking security
  await runTest('Backup valida esquema, excluye colecciones protegidas y divide lotes <=400', () => {
    const raw = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      data: {
        users: [{ id: 'u1', role: 'admin' }],
        admins: [{ id: 'a1' }],
        audit_logs: [{ id: 'log1' }],
        products: [{ id: 'p1', name: 'Casado', price: 3800 }],
      },
    };
    const validation = validateBackupPayload(raw);
    assert.equal(validation.valid, true);
    for (const forbidden of FORBIDDEN_BACKUP_COLLECTIONS) {
      assert.equal(
        forbidden in validation.collectionCounts,
        false,
        `Colección protegida ${forbidden} nunca debe ser restaurable`
      );
    }
    assert.ok(validation.warnings.length >= 3, 'Debe advertir que las colecciones protegidas serán omitidas');
    assert.equal(validation.collectionCounts.products, 1);

    const manyOps = Array.from({ length: 950 }, (_, i) => ({ id: i }));
    const chunks = chunkOperations(manyOps, 400);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].length, 400);
    assert.equal(chunks[1].length, 400);
    assert.equal(chunks[2].length, 150);
  });

  // 6. Live Express HTTP Security Tests on ephemeral port
  const { app } = await import('../server');
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await runTest('GET /api/health responde 200 con headers de seguridad y sin filtrar secretos', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(res.headers.get('content-security-policy'), 'CSP header presente');
      const body = await res.json();
      assert.equal(body.status, 'ok');
      assert.equal('apiKey' in body, false);
      assert.equal('cachedAdminToken' in body, false);
    });

    await runTest('POST /api/scan-invoice rechaza solicitudes sin token Bearer (401)', async () => {
      const res = await fetch(`${baseUrl}/api/scan-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: 'data:image/png;base64,AA==' }),
      });
      assert.equal(res.status, 401);
    });

    await runTest('GET /api/ai/sales-summary rechaza solicitudes sin X-Jarvis-Key válida (401 o 503)', async () => {
      const res = await fetch(`${baseUrl}/api/ai/sales-summary`, {
        headers: { 'X-Jarvis-Key': 'clave-invalida-de-prueba' },
      });
      assert.ok(res.status === 401 || res.status === 503, `Esperado 401 o 503, recibido ${res.status}`);
    });

    await runTest('GET /api/public/menu y /api/public/order-status responden 410 Gone sin exponer datos', async () => {
      const [menuRes, statusRes, pendingRes] = await Promise.all([
        fetch(`${baseUrl}/api/public/menu`),
        fetch(`${baseUrl}/api/public/order-status/PK-TEST`),
        fetch(`${baseUrl}/api/public/pending-orders`),
      ]);
      assert.equal(menuRes.status, 410, `GET /api/public/menu debe devolver 410, recibido ${menuRes.status}`);
      assert.equal(statusRes.status, 410, `GET /api/public/order-status debe devolver 410, recibido ${statusRes.status}`);
      assert.equal(pendingRes.status, 410, `GET /api/public/pending-orders debe devolver 410, recibido ${pendingRes.status}`);
      const body = await menuRes.json();
      assert.equal(body.success, false);
      assert.equal('catalog' in body, false, 'No debe devolver catálogo');
    });

    await runTest('POST /api/public/order y /api/public/catalog-sync responden 410 Gone y bloquean pedidos externos', async () => {
      const [orderRes, syncRes] = await Promise.all([
        fetch(`${baseUrl}/api/public/order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceType: 'mesa',
            tableToken: 'token-falso-inexistente',
            items: [{ productId: 'prod-casado', quantity: 1, selectedProtein: 'Pollo' }],
          }),
        }),
        fetch(`${baseUrl}/api/public/catalog-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categories: [], products: [] }),
        }),
      ]);
      assert.equal(orderRes.status, 410, `POST /api/public/order debe devolver 410, recibido ${orderRes.status}`);
      assert.equal(syncRes.status, 410, `POST /api/public/catalog-sync debe devolver 410, recibido ${syncRes.status}`);
    });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }

  const failed = results.filter(r => !r.passed);
  console.log(`\nResultado Seguridad: ${results.length - failed.length}/${results.length} pruebas aprobadas.`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error fatal ejecutando security.test.ts:', err);
  process.exit(1);
});
