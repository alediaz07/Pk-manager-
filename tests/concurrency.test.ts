import assert from 'node:assert/strict';
import http from 'node:http';
import {
  buildCashRegisterClosePatch,
  buildDeterministicPaymentId,
  buildPurchaseInvoiceLockId,
  computeOrderItemDeductionDeltas,
  evaluateTransactionalPayment,
} from '../src/utils/concurrencyGuards';
import {
  calculateExpectedCash,
  calculateIngredientConsumption,
  resolveFinancialStatus,
} from '../src/utils/orderStateMachine';
import type { CashRegister, OrderLineItem, PaymentRecord, RestaurantOrder } from '../src/types';

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

/**
 * Serialized async transaction harness mirroring Firestore optimistic transaction commit
 * semantics so concurrent Promise.all() callers race against the exact same live document state.
 */
function createInMemoryTransactionalStore() {
  let lock = Promise.resolve();
  const orders = new Map<string, RestaurantOrder>();
  const registers = new Map<string, CashRegister>();
  const payments = new Map<string, PaymentRecord>();
  const invoiceLocks = new Map<string, { vendor: string; purchaseNumber: string; purchaseId: string }>();

  const runSerializedTx = async <T>(fn: () => Promise<T> | T): Promise<T> => {
    const prev = lock;
    let release!: () => void;
    lock = new Promise<void>(resolve => {
      release = resolve;
    });
    await prev;
    try {
      // Simulate real async network/IO jitter inside transaction window
      await new Promise(r => setTimeout(r, 2));
      return await fn();
    } finally {
      release();
    }
  };

  return { orders, registers, payments, invoiceLocks, runSerializedTx };
}

function makeOrder(overrides: Partial<RestaurantOrder> = {}): RestaurantOrder {
  return {
    id: 'ord-conc-1',
    orderNumber: 'M-501',
    serviceType: 'mesa',
    tableId: 't-1',
    tableName: 'Mesa 1',
    items: [
      {
        id: 'line-1',
        productId: 'prod-casado',
        name: 'Casado Completo',
        price: 3000,
        quantity: 2,
        isCasado: true,
        selectedProtein: 'Pollo',
        subtotal: 6000,
        deductedQuantity: 0,
      },
    ],
    status: 'in_kitchen',
    operationalStatus: 'in_preparation',
    financialStatus: 'unpaid',
    paymentStatus: 'unpaid',
    paidAmount: 0,
    subtotal: 6000,
    serviceCharge: 600,
    total: 6600,
    operationalDate: '2026-11-25',
    createdBy: 'Cajero',
    createdAt: '2026-11-25T15:00:00.000Z',
    updatedAt: '2026-11-25T15:00:00.000Z',
    ...overrides,
  };
}

function makeOpenRegister(overrides: Partial<CashRegister> = {}): CashRegister {
  return {
    id: 'reg-conc-1',
    date: '2026-11-25',
    status: 'open',
    openedAt: '2026-11-25T13:00:00.000Z',
    openedBy: 'Cajero',
    initialCash: 50000,
    cashSales: 0,
    sinpeSales: 0,
    cardSales: 0,
    cashDeposits: 0,
    cashWithdrawals: 0,
    cashRefunds: 0,
    cashPurchases: 0,
    cashExpenses: 0,
    expectedCash: 50000,
    ...overrides,
  };
}

async function main() {
  console.log('\n=== POLLOS KAREN MANAGER — CONCURRENCY, IDEMPOTENCY & ANTI-DUPLICATION SUITE ===');

  // 1. Concurrent full-payment race (10 simultaneous clicks/devices on same order)
  await runTest('Concurrencia: 10 cobros simultáneos sobre la misma orden producen exactamente 1 cobro y 9 rechazos', async () => {
    const store = createInMemoryTransactionalStore();
    store.orders.set('ord-conc-1', makeOrder({ total: 6600, paidAmount: 0 }));
    store.registers.set('reg-conc-1', makeOpenRegister());

    const attempts = Array.from({ length: 10 }, (_, idx) =>
      store.runSerializedTx(() => {
        const liveOrder = store.orders.get('ord-conc-1')!;
        const liveReg = store.registers.get('reg-conc-1')!;
        const payId = buildDeterministicPaymentId('ord-conc-1', `attempt_${idx}`, 0, 'efectivo');
        const pay: PaymentRecord = {
          id: payId,
          orderId: liveOrder.id,
          orderNumber: liveOrder.orderNumber,
          registerId: liveReg.id,
          amount: 6600,
          method: 'efectivo',
          status: 'confirmed',
          idempotencyKey: payId,
          performedBy: `Dispositivo ${idx}`,
          createdAt: new Date().toISOString(),
        };

        const evalRes = evaluateTransactionalPayment({
          liveOrder,
          registerStatus: liveReg.status,
          existingPaymentIds: new Set(store.payments.keys()),
          incomingPayments: [pay],
        });

        if (!evalRes.ok) {
          return { accepted: false, error: evalRes.error };
        }
        if (!evalRes.idempotentReplay) {
          for (const p of evalRes.paymentsToWrite) store.payments.set(p.id, p);
          liveReg.cashSales += evalRes.addCash;
          liveReg.expectedCash = calculateExpectedCash(liveReg);
          liveOrder.paidAmount = evalRes.nextPaidTotal;
          liveOrder.financialStatus = evalRes.nextFinStatus;
          liveOrder.paymentStatus = evalRes.isNowFullyPaid ? 'paid' : 'partially_paid';
        }
        return { accepted: true };
      })
    );

    const outcomes = await Promise.all(attempts);
    const accepted = outcomes.filter(o => o.accepted);
    const rejected = outcomes.filter(o => !o.accepted);

    assert.equal(accepted.length, 1, 'Solo 1 dispositivo debe ganar el cobro total');
    assert.equal(rejected.length, 9, 'Los otros 9 intentos simultáneos deben ser rechazados');
    assert.equal(store.payments.size, 1, 'Debe existir exactamente 1 documento de pago');
    assert.equal(store.orders.get('ord-conc-1')!.paidAmount, 6600);
    assert.equal(store.registers.get('reg-conc-1')!.cashSales, 6600);
    assert.equal(store.registers.get('reg-conc-1')!.expectedCash, 56600);
  });

  // 2. Concurrent partial-payment overpayment race (2 devices send ₡4,000 each on a ₡6,600 order)
  await runTest('Concurrencia: 2 pagos parciales simultáneos que exceden el saldo bloquean sobrecobro', async () => {
    const store = createInMemoryTransactionalStore();
    store.orders.set('ord-conc-2', makeOrder({ id: 'ord-conc-2', total: 6600, paidAmount: 0 }));
    store.registers.set('reg-conc-1', makeOpenRegister());

    const runPartial = (device: string, method: 'efectivo' | 'sinpe', amount: number) =>
      store.runSerializedTx(() => {
        const liveOrder = store.orders.get('ord-conc-2')!;
        const liveReg = store.registers.get('reg-conc-1')!;
        const payId = buildDeterministicPaymentId('ord-conc-2', device, 0, method);
        const evalRes = evaluateTransactionalPayment({
          liveOrder,
          registerStatus: liveReg.status,
          existingPaymentIds: new Set(store.payments.keys()),
          incomingPayments: [
            {
              id: payId,
              orderId: liveOrder.id,
              orderNumber: liveOrder.orderNumber,
              registerId: liveReg.id,
              amount,
              method,
              status: 'confirmed',
              idempotencyKey: payId,
              performedBy: device,
              createdAt: new Date().toISOString(),
            },
          ],
        });
        if (!evalRes.ok) return { accepted: false, error: evalRes.error };
        for (const p of evalRes.paymentsToWrite) store.payments.set(p.id, p);
        liveReg.cashSales += evalRes.addCash;
        liveReg.sinpeSales += evalRes.addSinpe;
        liveReg.expectedCash = calculateExpectedCash(liveReg);
        liveOrder.paidAmount = evalRes.nextPaidTotal;
        liveOrder.financialStatus = evalRes.nextFinStatus;
        liveOrder.paymentStatus = evalRes.isNowFullyPaid ? 'paid' : 'partially_paid';
        return { accepted: true };
      });

    const [r1, r2] = await Promise.all([
      runPartial('tablet_1', 'efectivo', 4000),
      runPartial('tablet_2', 'sinpe', 4000),
    ]);

    assert.equal(r1.accepted, true);
    assert.equal(r2.accepted, false, 'El segundo pago parcial simultáneo de ₡4,000 debe ser rechazado (solo restaban ₡2,600)');
    assert.match(String(r2.error), /saldo real pendiente/i);
    assert.equal(store.orders.get('ord-conc-2')!.paidAmount, 4000);
    assert.equal(resolveFinancialStatus(store.orders.get('ord-conc-2')!), 'partially_paid');

    // Now pay the exact remaining ₡2,600
    const r3 = await runPartial('tablet_2_retry', 'sinpe', 2600);
    assert.equal(r3.accepted, true);
    assert.equal(store.orders.get('ord-conc-2')!.paidAmount, 6600);
    assert.equal(resolveFinancialStatus(store.orders.get('ord-conc-2')!), 'paid');
    assert.equal(store.registers.get('reg-conc-1')!.cashSales, 4000);
    assert.equal(store.registers.get('reg-conc-1')!.sinpeSales, 2600);
  });

  // 3. Strict idempotent retry (same deterministic paymentId replayed offline/network retry)
  await runTest('Idempotencia: reintento con mismo paymentId no duplica cobro ni suma dos veces a caja', async () => {
    const store = createInMemoryTransactionalStore();
    store.orders.set('ord-idemp', makeOrder({ id: 'ord-idemp', total: 3000, paidAmount: 0 }));
    store.registers.set('reg-conc-1', makeOpenRegister());

    const fixedPayId = buildDeterministicPaymentId('ord-idemp', 'offline_sync_01', 0, 'sinpe');
    const payment: PaymentRecord = {
      id: fixedPayId,
      orderId: 'ord-idemp',
      orderNumber: 'M-501',
      registerId: 'reg-conc-1',
      amount: 3000,
      method: 'sinpe',
      status: 'confirmed',
      idempotencyKey: fixedPayId,
      performedBy: 'Cajero',
      createdAt: new Date().toISOString(),
    };

    const executeAttempt = () =>
      store.runSerializedTx(() => {
        const liveOrder = store.orders.get('ord-idemp')!;
        const liveReg = store.registers.get('reg-conc-1')!;
        const evalRes = evaluateTransactionalPayment({
          liveOrder,
          registerStatus: liveReg.status,
          existingPaymentIds: new Set(store.payments.keys()),
          incomingPayments: [payment],
        });
        assert.equal(evalRes.ok, true);
        if (!evalRes.idempotentReplay) {
          for (const p of evalRes.paymentsToWrite) store.payments.set(p.id, p);
          liveReg.sinpeSales += evalRes.addSinpe;
          liveOrder.paidAmount = evalRes.nextPaidTotal;
          liveOrder.financialStatus = evalRes.nextFinStatus;
          liveOrder.paymentStatus = evalRes.isNowFullyPaid ? 'paid' : 'partially_paid';
        }
        return evalRes.idempotentReplay;
      });

    const firstWasReplay = await executeAttempt();
    const secondWasReplay = await executeAttempt();
    const thirdWasReplay = await executeAttempt();

    assert.equal(firstWasReplay, false);
    assert.equal(secondWasReplay, true);
    assert.equal(thirdWasReplay, true);
    assert.equal(store.payments.size, 1);
    assert.equal(store.registers.get('reg-conc-1')!.sinpeSales, 3000);
    assert.equal(store.orders.get('ord-idemp')!.paidAmount, 3000);
  });

  // 4. Closed cash register blocks concurrent payment immediately
  await runTest('Concurrencia de caja: cobro contra caja cerrada simultáneamente en otro equipo es rechazado', async () => {
    const order = makeOrder({ total: 3000, paidAmount: 0 });
    const evalRes = evaluateTransactionalPayment({
      liveOrder: order,
      registerStatus: 'closed',
      existingPaymentIds: new Set(),
      incomingPayments: [
        {
          id: 'pay_closed_1',
          orderId: order.id,
          orderNumber: order.orderNumber,
          registerId: 'reg-closed',
          amount: 3000,
          method: 'efectivo',
          status: 'confirmed',
          idempotencyKey: 'pay_closed_1',
          performedBy: 'Cajero',
          createdAt: new Date().toISOString(),
        },
      ],
    });
    assert.equal(evalRes.ok, false);
    assert.match(String(evalRes.error), /cerrada/i);
  });

  // 5. Anti-duplicate inventory deduction across repeated saves, edits, and payment triggers
  await runTest('Descuento de inventario delta: múltiples guardados y cobro nunca descuentan dos veces', () => {
    let stockKg = 10.0;
    const consumePerPlateKg = calculateIngredientConsumption(1, 10, 2000, 'g', 'kg').deductedQty; // 0.2 kg
    assert.equal(consumePerPlateKg, 0.2);

    // Step A: Initial authorization with qty = 2
    let items: OrderLineItem[] = [
      {
        id: 'line-1',
        productId: 'prod-casado',
        name: 'Casado Completo',
        price: 3000,
        quantity: 2,
        isCasado: true,
        selectedProtein: 'Pollo',
        subtotal: 6000,
        deductedQuantity: 0,
      },
    ];

    const pass1 = computeOrderItemDeductionDeltas(items);
    assert.equal(pass1.deltas.length, 1);
    assert.equal(pass1.deltas[0].pendingQty, 2);
    stockKg = Math.round((stockKg - pass1.deltas[0].pendingQty * consumePerPlateKg) * 1000) / 1000;
    items = pass1.updatedItems;
    assert.equal(stockKg, 9.6);
    assert.equal(items[0].deductedQuantity, 2);

    // Step B: Re-save same order without quantity change (e.g., edit note / print / payment trigger)
    const pass2 = computeOrderItemDeductionDeltas(items);
    assert.equal(pass2.deltas.length, 0, 'Segundo guardado con misma cantidad debe generar delta 0');
    assert.equal(stockKg, 9.6);

    // Step C: Customer adds 1 more Casado (qty 2 -> 3)
    items = [{ ...items[0], quantity: 3, subtotal: 9000 }];
    const pass3 = computeOrderItemDeductionDeltas(items);
    assert.equal(pass3.deltas.length, 1);
    assert.equal(pass3.deltas[0].pendingQty, 1, 'Solo debe descontar la 1 unidad adicional');
    stockKg = Math.round((stockKg - pass3.deltas[0].pendingQty * consumePerPlateKg) * 1000) / 1000;
    items = pass3.updatedItems;
    assert.equal(stockKg, 9.4);
    assert.equal(items[0].deductedQuantity, 3);

    // Step D: Payment trigger runs after authorization already deducted
    const pass4 = computeOrderItemDeductionDeltas(items);
    assert.equal(pass4.deltas.length, 0, 'Cobro posterior no debe volver a descontar unidades ya descontadas');
    assert.equal(stockKg, 9.4);
  });

  // 6. Concurrent duplicate purchase invoice lock across 8 devices (with varying case/spaces)
  await runTest('Bloqueo atómico de facturas duplicadas: 8 registros simultáneos generan 1 éxito y 7 rechazos', async () => {
    const store = createInMemoryTransactionalStore();
    const variants = [
      { vendor: 'Distribuidora La Uruca', num: 'FAC-00123' },
      { vendor: '  distribuidora la uruca ', num: 'fac-00123' },
      { vendor: 'DISTRIBUIDORA LA URUCA', num: 'FAC 00123' },
      { vendor: 'Distribuidora La Uruca', num: 'FAC-00123' },
      { vendor: 'distribuidora la uruca', num: 'FAC-00123 ' },
      { vendor: 'Distribuidora La Uruca', num: 'fac_00123' },
      { vendor: 'Distribuidora La Uruca', num: 'FAC-00123' },
      { vendor: 'DISTRIBUIDORA  LA URUCA'.replace('  ', ' '), num: 'FAC-00123' },
    ];

    const outcomes = await Promise.all(
      variants.map((v, idx) =>
        store.runSerializedTx(() => {
          const lockId = buildPurchaseInvoiceLockId(v.vendor, v.num);
          assert.ok(lockId, 'lockId debe generarse');
          if (store.invoiceLocks.has(lockId!)) {
            return { created: false, lockId };
          }
          store.invoiceLocks.set(lockId!, {
            vendor: v.vendor,
            purchaseNumber: v.num,
            purchaseId: `pur_${idx}`,
          });
          return { created: true, lockId };
        })
      )
    );

    const winners = outcomes.filter(o => o.created);
    const blocked = outcomes.filter(o => !o.created);
    assert.equal(winners.length, 1, 'Solo 1 factura debe poder adquirir el bloqueo atómico');
    assert.equal(blocked.length, 7, 'Las 7 variantes duplicadas deben quedar bloqueadas');
    assert.equal(store.invoiceLocks.size, 1);
  });

  // 7. Cash register close patch strictly matches firestore.rules allowlist for Colaborador
  await runTest('Cierre de caja genera patch mínimo compatible con firestore.rules para Colaborador', () => {
    const allowedColaboradorKeys = new Set([
      'cashSales',
      'sinpeSales',
      'cardSales',
      'expectedCash',
      'notes',
      'status',
      'closedAt',
      'closedBy',
      'actualCash',
      'difference',
      'closingDenominations',
    ]);
    const patch = buildCashRegisterClosePatch({
      expectedCash: 131200,
      actualCash: 131000,
      closedAt: '2026-11-25T23:55:00.000Z',
      closedBy: 'Cajero Turno',
      notes: 'Faltante menor de ₡200',
      closingDenominations: [{ denomination: 20000, count: 6, subtotal: 120000 }],
    });

    for (const key of Object.keys(patch)) {
      assert.equal(
        allowedColaboradorKeys.has(key),
        true,
        `Campo "${key}" en cierre de caja no está permitido para Colaborador en firestore.rules`
      );
    }
    assert.equal(patch.difference, -200);
    assert.equal(patch.status, 'closed');
  });

  // 8. Live Express HTTP concurrency burst on /api/public/order verifying rate limiting (max 12 / 5 min)
  const { app } = await import('../server');
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await runTest('Express HTTP concurrencia: ráfaga de 16 pedidos públicos simultáneos activa rate-limit (429)', async () => {
      const burst = Array.from({ length: 16 }, (_, idx) =>
        fetch(`${baseUrl}/api/public/order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': '203.0.113.77',
          },
          body: JSON.stringify({
            serviceType: 'mesa',
            tableToken: `burst-${idx}`,
            items: [{ productId: 'pk-casado-completo', quantity: 1 }],
          }),
        }).then(r => r.status)
      );

      const statuses = await Promise.all(burst);
      const rateLimited = statuses.filter(s => s === 429);
      const nonRateLimited = statuses.filter(s => s !== 429);

      assert.equal(nonRateLimited.length, 12, `Exactamente 12 solicitudes deben pasar el rate limiter antes del bloqueo (recibidas: ${nonRateLimited.length})`);
      assert.equal(rateLimited.length, 4, `Las 4 solicitudes excedentes deben recibir HTTP 429 (recibidas: ${rateLimited.length})`);
    });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }

  const failed = results.filter(r => !r.passed);
  console.log(`\nResultado Concurrencia e Idempotencia: ${results.length - failed.length}/${results.length} pruebas aprobadas.`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error fatal ejecutando concurrency.test.ts:', err);
  process.exit(1);
});
