import assert from 'node:assert/strict';
import {
  calculateDenominationsTotal,
  calculateExpectedCash,
  calculateIngredientConsumption,
  calculateOrderTotalsDetailed,
  calculateRecipeConsumptionForItem,
  canTransitionOperationalStatus,
  computeFinancialStatus,
  isWithinCostaRicaSchedule,
  resolveFinancialStatus,
  resolveOperationalStatus,
} from '../src/utils/orderStateMachine';
import {
  calculateWeightedAverageCost,
  convertToInventoryUnit,
  normalizeUnitString,
} from '../src/utils/unitConverter';
import { POLLOS_KAREN_OFFICIAL_CATEGORIES, POLLOS_KAREN_OFFICIAL_PRODUCTS } from '../src/config/pollosKarenCatalog';
import type { InventoryItem, Recipe } from '../src/types';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function runTest(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err?.message || String(err) });
    console.error(`  [FAIL] ${name}: ${err?.message || err}`);
  }
}

console.log('\n=== POLLOS KAREN MANAGER — OPERATIONS, POS, CASH & INVENTORY TEST SUITE ===');

// 1. Service rules: Mesa +10%, Ventana 0%, Exprés configurable delivery fee
runTest('Cálculo de totales: Mesa aplica +10%, Ventana 0%, Exprés tarifa configurable', () => {
  const items = [{ price: 3800, quantity: 2 }]; // Subtotal 7,600

  const mesa = calculateOrderTotalsDetailed(items, 'mesa');
  assert.equal(mesa.subtotal, 7600);
  assert.equal(mesa.serviceCharge, 760);
  assert.equal(mesa.deliveryFee, 0);
  assert.equal(mesa.total, 8360);

  const ventana = calculateOrderTotalsDetailed(items, 'ventana');
  assert.equal(ventana.subtotal, 7600);
  assert.equal(ventana.serviceCharge, 0);
  assert.equal(ventana.deliveryFee, 0);
  assert.equal(ventana.total, 7600);

  const expres = calculateOrderTotalsDetailed(items, 'expres', { deliveryFee: 500 });
  assert.equal(expres.subtotal, 7600);
  assert.equal(expres.serviceCharge, 0);
  assert.equal(expres.deliveryFee, 500);
  assert.equal(expres.total, 8100);
});

// 2. Separation of Operational and Financial states
runTest('Estado operativo y estado financiero son independientes', () => {
  // Paid upfront (e.g. Ventana / Exprés) still remains in preparation until delivered
  const finPaid = computeFinancialStatus(5000, 5000, 0, false);
  assert.equal(finPaid, 'paid');

  const finPartial = computeFinancialStatus(5000, 2000, 0, false);
  assert.equal(finPartial, 'partially_paid');

  const finRefunded = computeFinancialStatus(5000, 5000, 5000, false);
  assert.equal(finRefunded, 'refunded');

  // Legacy mapping preserves compatibility
  assert.equal(resolveOperationalStatus({ status: 'in_kitchen' }), 'in_preparation');
  assert.equal(resolveFinancialStatus({ paymentStatus: 'unpaid', status: 'in_kitchen' }), 'unpaid');
});

// 3. Role-based Operational State Machine transitions
runTest('Transiciones POS: colaborador registra entrega y el rol de cocina retirado no puede operar', () => {
  assert.equal(canTransitionOperationalStatus('authorized', 'delivered', 'colaborador').allowed, true);
  assert.equal(canTransitionOperationalStatus('authorized', 'ready', 'colaborador').allowed, true);
  assert.equal(canTransitionOperationalStatus('authorized', 'in_preparation', 'cocina').allowed, false);
  assert.equal(canTransitionOperationalStatus('ready', 'delivered', 'cocina').allowed, false);
  assert.equal(canTransitionOperationalStatus('authorized', 'cancelled', 'colaborador').allowed, false);
  assert.equal(canTransitionOperationalStatus('authorized', 'cancelled', 'admin').allowed, true);
  assert.equal(canTransitionOperationalStatus('cancelled', 'authorized', 'admin').allowed, false);
});

// 4. Exact Cash Register Expected Cash Formula (all 7 components)
runTest('Arqueo de caja: fórmula exacta de efectivo esperado y suma de denominaciones CRC', () => {
  const expected = calculateExpectedCash({
    initialCash: 50000,
    cashSales: 120000,
    cashDeposits: 10000,
    cashWithdrawals: 15000,
    cashPurchases: 25000,
    cashExpenses: 5000,
    cashRefunds: 3800,
  });
  // 50000 + 120000 + 10000 - 15000 - 25000 - 5000 - 3800 = 131200
  assert.equal(expected, 131200);

  const denomTotal = calculateDenominationsTotal({
    '20000': 2, // 40000
    '10000': 1, // 10000
    '5000': 3,  // 15000
    '500': 4,   // 2000
    '100': 5,   // 500
  });
  assert.equal(denomTotal, 67500);
});

// 5. Recipe Consumption with yieldPortions > 1 and g -> kg / ml -> litro conversion
runTest('Descuento de inventario respeta yieldPortions y convierte g->kg / ml->litro correctamente', () => {
  const single = calculateIngredientConsumption(3, 10, 500, 'g', 'kg');
  // (500g / 10 porciones) * 3 platos = 150g = 0.15 kg
  assert.equal(single.compatible, true);
  assert.equal(single.deductedQty, 0.15);
  assert.equal(single.unit, 'kg');

  const incompatible = calculateIngredientConsumption(1, 1, 200, 'ml', 'kg');
  assert.equal(incompatible.compatible, false);

  const inventory: InventoryItem[] = [
    { id: 'inv-arroz', name: 'Arroz', category: 'ingredientes', unit: 'kg', currentStock: 20, averageCost: 1200, updatedAt: '' },
    { id: 'inv-aceite', name: 'Aceite', category: 'ingredientes', unit: 'litro', currentStock: 10, averageCost: 1800, updatedAt: '' },
  ];
  const recipe: Recipe = {
    id: 'rec-arroz',
    productId: 'prod-1',
    productName: 'Arroz con Pollo',
    yieldPortions: 10,
    autoDeductEnabled: true,
    isComplete: true,
    updatedAt: '',
    ingredients: [
      { itemId: 'inv-arroz', itemName: 'Arroz', quantity: 2000, unit: 'g' },   // 200g/porción = 0.2kg -> ₡240
      { itemId: 'inv-aceite', itemName: 'Aceite', quantity: 500, unit: 'ml' }, // 50ml/porción = 0.05L -> ₡90
    ],
  };

  const full = calculateRecipeConsumptionForItem(recipe, 2, inventory);
  assert.equal(full.deductions[0].quantityInInvUnit, 0.4);
  assert.equal(full.deductions[1].quantityInInvUnit, 0.1);
  assert.equal(full.totalPortionCost, 330);
});

// 6. Weighted Average Cost & Unit Normalization
runTest('Costo promedio ponderado y normalización de unidades', () => {
  const avg = calculateWeightedAverageCost(10, 2000, 10, 3000);
  assert.equal(avg, 2500);

  // Zero/negative stock resets cost to new purchase cost
  const avgFromZero = calculateWeightedAverageCost(0, 1500, 5, 2800);
  assert.equal(avgFromZero, 2800);

  const conv = convertToInventoryUnit(500, 'g', 4, 'kg');
  assert.equal(conv.compatible, true);
  assert.equal(conv.convertedQuantity, 0.5);
  assert.equal(conv.convertedUnitCost, 4000);

  assert.equal(normalizeUnitString('Kilos'), 'kg');
  assert.equal(normalizeUnitString('ml'), 'ml');
  assert.equal(normalizeUnitString('paq'), 'paquete');
});

// 7. Costa Rica Schedule Window Verification (UTC-6, America/Costa_Rica)
runTest('Validación de horario Costa Rica (L-V 07:00-18:00 y Desayunos 07:00-10:30)', () => {
  const breakfastSchedule = { enabled: true, openTime: '07:00', closeTime: '10:30', daysOfWeek: [1, 2, 3, 4, 5] };
  // Wednesday 2026-11-25 08:15 America/Costa_Rica = 14:15 UTC
  const wedMorning = new Date('2026-11-25T14:15:00Z');
  assert.equal(isWithinCostaRicaSchedule(breakfastSchedule, wedMorning).open, true);

  // Wednesday 2026-11-25 11:15 America/Costa_Rica = 17:15 UTC (outside breakfast)
  const wedLateMorning = new Date('2026-11-25T17:15:00Z');
  assert.equal(isWithinCostaRicaSchedule(breakfastSchedule, wedLateMorning).open, false);

  // Sunday 2026-11-29 09:00 America/Costa_Rica = 15:00 UTC (closed on Sunday)
  const sundayMorning = new Date('2026-11-29T15:00:00Z');
  assert.equal(isWithinCostaRicaSchedule(breakfastSchedule, sundayMorning).open, false);
});

// 8. Official Pollos Karen Catalog Integrity
runTest('Catálogo oficial Pollos Karen tiene categorías, precios >0 y casados con proteínas', () => {
  assert.ok(POLLOS_KAREN_OFFICIAL_CATEGORIES.length >= 5);
  assert.ok(POLLOS_KAREN_OFFICIAL_PRODUCTS.length >= 25);
  for (const prod of POLLOS_KAREN_OFFICIAL_PRODUCTS) {
    assert.ok(prod.price > 0, `Precio inválido en ${prod.name}`);
  }
  const casados = POLLOS_KAREN_OFFICIAL_PRODUCTS.filter(p => p.isCasado);
  assert.ok(casados.length >= 1, 'Debe existir al menos un Casado con selección de proteína');
});

const failed = results.filter(r => !r.passed);
console.log(`\nResultado Operación: ${results.length - failed.length}/${results.length} pruebas aprobadas.`);
if (failed.length > 0) {
  process.exit(1);
}
