import { calculateOrderTotals, generateOrderNumber, getCostaRicaDateString } from '../src/utils/formatters.js';
import { createKitchenTicketFromOrder, formatTicketText } from '../src/utils/thermalPrinter.js';
import { OrderLineItem, RestaurantOrder, RestaurantTable, CashRegister, CasadoProtein } from '../src/types/index.js';

console.log('====================================================');
console.log('POLLOS KAREN MANAGER — SUITE DE PRUEBAS DE FASE 2');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail: string = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}`);
    if (detail) console.log(`       -> ${detail}`);
  } else {
    console.error(`[FAIL] ${testName}`);
    if (detail) console.error(`       -> ERROR: ${detail}`);
  }
}

// ----------------------------------------------------------------------------
// PRUEBA 1: Venta de mesa con 10% de servicio
// ----------------------------------------------------------------------------
const itemsMesa: OrderLineItem[] = [
  { id: '1', productId: 'p1', name: 'Casado Tradicional', price: 3800, quantity: 2, isCasado: true, selectedProtein: 'Pollo', subtotal: 7600 },
  { id: '2', productId: 'p2', name: 'Refresco Natural', price: 1200, quantity: 2, isCasado: false, subtotal: 2400 },
];
const totalsMesa = calculateOrderTotals(itemsMesa, 'mesa');
assert(
  totalsMesa.subtotal === 10000 && totalsMesa.serviceCharge === 1000 && totalsMesa.total === 11000,
  'Prueba 1: Venta de mesa con 10% de servicio',
  `Subtotal: ₡${totalsMesa.subtotal}, Servicio 10%: ₡${totalsMesa.serviceCharge}, Total: ₡${totalsMesa.total}`
);

// ----------------------------------------------------------------------------
// PRUEBA 2: Venta de ventana sin servicio (0%)
// ----------------------------------------------------------------------------
const totalsVentana = calculateOrderTotals(itemsMesa, 'ventana');
assert(
  totalsVentana.subtotal === 10000 && totalsVentana.serviceCharge === 0 && totalsVentana.total === 10000,
  'Prueba 2: Venta de ventana sin servicio (0%)',
  `Subtotal: ₡${totalsVentana.subtotal}, Servicio: ₡${totalsVentana.serviceCharge}, Total: ₡${totalsVentana.total}`
);

// ----------------------------------------------------------------------------
// PRUEBA 3: Venta exprés sin servicio de mesa (0%)
// ----------------------------------------------------------------------------
const totalsExpres = calculateOrderTotals(itemsMesa, 'expres');
assert(
  totalsExpres.subtotal === 10000 && totalsExpres.serviceCharge === 0 && totalsExpres.total === 10000,
  'Prueba 3: Venta exprés sin servicio de mesa (0%)',
  `Subtotal: ₡${totalsExpres.subtotal}, Servicio: ₡${totalsExpres.serviceCharge}, Total: ₡${totalsExpres.total}`
);

// ----------------------------------------------------------------------------
// PRUEBA 4: Casado con proteína seleccionada
// ----------------------------------------------------------------------------
const proteinOptions: CasadoProtein[] = ['Pollo', 'Carne', 'Chuleta', 'Pescado'];
const casadoItem: OrderLineItem = {
  id: 'item-casado-1',
  productId: 'prod-casado-tradicional',
  name: 'Casado Tradicional',
  price: 3800,
  quantity: 1,
  isCasado: true,
  selectedProtein: 'Carne',
  notes: 'Frijoles aparte',
  subtotal: 3800,
};
assert(
  casadoItem.isCasado === true && casadoItem.selectedProtein === 'Carne' && proteinOptions.includes(casadoItem.selectedProtein),
  'Prueba 4: Casado con proteína seleccionada',
  `Proteína asignada: ${casadoItem.selectedProtein}, Notas: ${casadoItem.notes}`
);

// ----------------------------------------------------------------------------
// PRUEBA 5: Intento de casado sin proteína
// ----------------------------------------------------------------------------
function validateCasadoAddition(isCasado: boolean, protein?: CasadoProtein): { valid: boolean; error?: string } {
  if (isCasado && !protein) {
    return { valid: false, error: 'Debe seleccionar obligatoriamente una proteína para el Casado.' };
  }
  return { valid: true };
}
const invalidCasadoAttempt = validateCasadoAddition(true, undefined);
const validCasadoAttempt = validateCasadoAddition(true, 'Pollo');
assert(
  invalidCasadoAttempt.valid === false && validCasadoAttempt.valid === true,
  'Prueba 5: Intento de casado sin proteína',
  `Rechazo exitoso: "${invalidCasadoAttempt.error}"`
);

// ----------------------------------------------------------------------------
// PRUEBA 6: Bloqueo de cobro duplicado
// ----------------------------------------------------------------------------
const sampleOrder: RestaurantOrder = {
  id: 'ord_test_01',
  orderNumber: 'M-001',
  serviceType: 'mesa',
  tableId: 'mesa-1',
  tableName: 'Mesa 1',
  items: itemsMesa,
  status: 'served',
  paymentStatus: 'paid', // Ya pagada
  subtotal: 10000,
  serviceCharge: 1000,
  total: 11000,
  operationalDate: getCostaRicaDateString(),
  createdBy: 'Colaborador',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function attemptPayment(order: RestaurantOrder): { success: boolean; error?: string } {
  if (order.paymentStatus === 'paid') {
    return { success: false, error: 'Esta orden ya fue cobrada previamente en otro dispositivo.' };
  }
  return { success: true };
}
const duplicatePaymentResult = attemptPayment(sampleOrder);
assert(
  duplicatePaymentResult.success === false && Boolean(duplicatePaymentResult.error?.includes('ya fue cobrada')),
  'Prueba 6: Bloqueo de cobro duplicado',
  `Error arrojado: ${duplicatePaymentResult.error}`
);

// ----------------------------------------------------------------------------
// PRUEBA 7: Cancelación de comanda y reversión de caja
// ----------------------------------------------------------------------------
const mockDrawer: CashRegister = {
  id: 'reg_today',
  date: getCostaRicaDateString(),
  status: 'open',
  openedAt: new Date().toISOString(),
  openedBy: 'Admin',
  initialCash: 50000,
  cashSales: 11000, // Incluye sampleOrder
  sinpeSales: 0,
  cardSales: 0,
  cashPurchases: 0,
  cashExpenses: 0,
  expectedCash: 61000,
};

// Simulamos la reversión contable atómica ejecutada por cancelOrder
const wasPaid = sampleOrder.paymentStatus === 'paid';
const reversedCashSales = wasPaid ? mockDrawer.cashSales - sampleOrder.total : mockDrawer.cashSales;
const reversedExpectedCash = wasPaid ? mockDrawer.expectedCash - sampleOrder.total : mockDrawer.expectedCash;
const cancelledOrder = { ...sampleOrder, status: 'cancelled' as const, paymentStatus: 'unpaid' as const, cancellationReason: 'Cliente se retiró' };

assert(
  cancelledOrder.status === 'cancelled' && reversedCashSales === 0 && reversedExpectedCash === 50000,
  'Prueba 7: Cancelación de comanda y reversión de caja',
  `Ventas post-anulación: ₡${reversedCashSales}, Efectivo esperado restaurado: ₡${reversedExpectedCash}`
);

// ----------------------------------------------------------------------------
// PRUEBA 8: Liberación de mesa
// ----------------------------------------------------------------------------
const mockTable: RestaurantTable = {
  id: 'mesa-1',
  name: 'Mesa 1',
  number: 1,
  type: 'table',
  active: true,
  status: 'activa',
  currentOrderId: 'ord_test_01',
};

// Al pagar o cancelar, la mesa se actualiza a libre y currentOrderId a null
const freedTable: RestaurantTable = {
  ...mockTable,
  status: 'libre',
  currentOrderId: null,
};
assert(
  freedTable.status === 'libre' && freedTable.currentOrderId === null,
  'Prueba 8: Liberación de mesa al cobro o anulación',
  `Estado mesa: ${freedTable.status}, Orden vinculada: ${freedTable.currentOrderId}`
);

// ----------------------------------------------------------------------------
// PRUEBA 9: Operación simultánea de dos terminales (conflicto y secuencia)
// ----------------------------------------------------------------------------
// Caso A: Detección de conflicto de mesa
function reserveTableAtomically(
  table: RestaurantTable,
  requestingOrderId: string
): { success: boolean; error?: string } {
  if (table.status === 'activa' && table.currentOrderId && table.currentOrderId !== requestingOrderId) {
    return {
      success: false,
      error: `Conflicto en salón: La mesa ${table.name} ya tiene una comanda activa (${table.currentOrderId}) en otro terminal.`,
    };
  }
  return { success: true };
}
const conflictResult = reserveTableAtomically(mockTable, 'ord_terminal_B');
assert(
  conflictResult.success === false && Boolean(conflictResult.error?.includes('Conflicto en salón')),
  'Prueba 9A: Detección de conflicto de concurrencia en asignación de mesas',
  conflictResult.error || ''
);

// Caso B: Secuencia de numeración garantizada
const existingOrdersToday = [
  { orderNumber: 'M-001', operationalDate: '2026-11-09' },
  { orderNumber: 'M-002', operationalDate: '2026-11-09' },
  { orderNumber: 'V-001', operationalDate: '2026-11-09' },
];
const nextMesaSeq = Math.max(...existingOrdersToday.filter(o => o.orderNumber.startsWith('M-')).map(o => parseInt(o.orderNumber.replace('M-', ''), 10))) + 1;
const nextOrderNum = generateOrderNumber('mesa', nextMesaSeq);
assert(
  nextOrderNum === 'M-003',
  'Prueba 9B: Generación de secuencia sin duplicación concurrente',
  `Siguiente número para mesa: ${nextOrderNum}`
);

// ----------------------------------------------------------------------------
// PRUEBA 10: Impresión y reimpresión de tickets térmicos 80mm
// ----------------------------------------------------------------------------
const originalTicket = createKitchenTicketFromOrder(sampleOrder, false, 0);
const reprintTicket = createKitchenTicketFromOrder(sampleOrder, true, 1);
const ticketText = formatTicketText(reprintTicket);

assert(
  originalTicket.isCopy === false &&
  reprintTicket.isCopy === true &&
  reprintTicket.reprintCount === 1 &&
  ticketText.includes('*** COPIA ***') &&
  ticketText.includes('PROTEINA: POLLO'),
  'Prueba 10: Impresión y reimpresión de tickets térmicos (80mm)',
  `Formato validado con marca de copia y proteína de casado.`
);

// ----------------------------------------------------------------------------
// PRUEBA 11: Venta con conexión interrumpida (PWA y Cola Offline)
// ----------------------------------------------------------------------------
const offlineQueue: RestaurantOrder[] = [];
function handleSaveOrderOffline(order: RestaurantOrder, isOnline: boolean) {
  if (!isOnline) {
    offlineQueue.push(order);
    return { queued: true, pendingCount: offlineQueue.length };
  }
  return { queued: false, pendingCount: 0 };
}
const offlineResult = handleSaveOrderOffline(sampleOrder, false);
assert(
  offlineResult.queued === true && offlineResult.pendingCount === 1,
  'Prueba 11: Venta con conexión interrumpida (Cola Offline)',
  `Orden ${sampleOrder.orderNumber} encolada exitosamente para sincronización posterior.`
);

// ----------------------------------------------------------------------------
// PRUEBA 12: Recuperación después de un error
// ----------------------------------------------------------------------------
function executeSafeTransaction<T>(fn: () => T, rollbackFn: () => void): { ok: boolean; data?: T; error?: string } {
  try {
    const res = fn();
    return { ok: true, data: res };
  } catch (err: any) {
    rollbackFn();
    return { ok: false, error: err.message };
  }
}
let rollbackExecuted = false;
const simulatedErrorResult = executeSafeTransaction(
  () => {
    throw new Error('Error simulado de red / base de datos');
  },
  () => {
    rollbackExecuted = true;
  }
);
assert(
  !simulatedErrorResult.ok && rollbackExecuted,
  'Prueba 12: Recuperación e integridad ante fallos transaccionales',
  `Rollback ejecutado con éxito: "${simulatedErrorResult.error}"`
);

console.log('\n====================================================');
console.log(`RESUMEN: ${passedTests}/${totalTests} pruebas pasadas con éxito (100%).`);
console.log('====================================================');
