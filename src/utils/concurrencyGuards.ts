import {
  CashRegister,
  DenominationCount,
  FinancialOrderStatus,
  OrderLineItem,
  PaymentRecord,
  RestaurantOrder,
} from '../types';
import { resolveFinancialStatus } from './orderStateMachine';

/**
 * Generates a deterministic Firestore document ID for unique supplier invoice locks
 * so concurrent devices attempting to register the same (vendor + invoiceNumber)
 * collide atomically on the exact same lock document.
 */
export function buildPurchaseInvoiceLockId(
  vendor?: string,
  purchaseNumber?: string
): string | null {
  const cleanVendor = String(vendor || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_');
  const cleanNumber = String(purchaseNumber || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_');

  if (!cleanVendor || !cleanNumber) return null;
  return `invlock_${cleanVendor}__${cleanNumber}`.slice(0, 120);
}

/**
 * Generates a deterministic payment document ID tied to an explicit payment attempt key
 * so network retries or offline replays resolve to the exact same Firestore document ID.
 */
export function buildDeterministicPaymentId(
  orderId: string,
  attemptKey: string,
  entryIndex: number,
  method: string
): string {
  const safeOrder = orderId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  const safeAttempt = attemptKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  const safeMethod = method.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
  return `pay_${safeOrder}_${safeAttempt}_${entryIndex}_${safeMethod}`.slice(0, 120);
}

export interface TransactionalPaymentEvaluation {
  ok: boolean;
  idempotentReplay?: boolean;
  error?: string;
  paymentsToWrite: PaymentRecord[];
  addCash: number;
  addSinpe: number;
  addCard: number;
  nextPaidTotal: number;
  isNowFullyPaid: boolean;
  nextFinStatus: FinancialOrderStatus;
}

/**
 * Pure transactional guard evaluated INSIDE Firestore runTransaction() using LIVE
 * order & register documents. Prevents:
 * - Charging against a closed register
 * - Double-charging an already paid or cancelled order
 * - Concurrent partial-payment overpayment (reads liveOrder.paidAmount, never stale client state)
 * - Duplicate charges on idempotent network/offline retries (skips existing payment IDs)
 */
export function evaluateTransactionalPayment(params: {
  liveOrder: RestaurantOrder;
  registerStatus: string | undefined;
  existingPaymentIds: Set<string>;
  incomingPayments: PaymentRecord[];
}): TransactionalPaymentEvaluation {
  const { liveOrder, registerStatus, existingPaymentIds, incomingPayments } = params;

  if (registerStatus !== 'open') {
    return {
      ok: false,
      error: 'La caja fue cerrada en otro dispositivo.',
      paymentsToWrite: [],
      addCash: 0,
      addSinpe: 0,
      addCard: 0,
      nextPaidTotal: Number(liveOrder.paidAmount || 0),
      isNowFullyPaid: resolveFinancialStatus(liveOrder) === 'paid',
      nextFinStatus: resolveFinancialStatus(liveOrder),
    };
  }

  if (liveOrder.status === 'cancelled' || liveOrder.operationalStatus === 'cancelled') {
    return {
      ok: false,
      error: 'No se puede cobrar una orden anulada.',
      paymentsToWrite: [],
      addCash: 0,
      addSinpe: 0,
      addCard: 0,
      nextPaidTotal: Number(liveOrder.paidAmount || 0),
      isNowFullyPaid: false,
      nextFinStatus: resolveFinancialStatus(liveOrder),
    };
  }

  const newPayments = incomingPayments.filter(p => !existingPaymentIds.has(p.id));
  if (incomingPayments.length > 0 && newPayments.length === 0) {
    const livePaid = Number(liveOrder.paidAmount || 0);
    const fin = resolveFinancialStatus(liveOrder);
    return {
      ok: true,
      idempotentReplay: true,
      paymentsToWrite: [],
      addCash: 0,
      addSinpe: 0,
      addCard: 0,
      nextPaidTotal: livePaid,
      isNowFullyPaid: fin === 'paid',
      nextFinStatus: fin,
    };
  }

  if (resolveFinancialStatus(liveOrder) === 'paid') {
    return {
      ok: false,
      error: 'Esta orden ya fue cobrada en otro dispositivo.',
      paymentsToWrite: [],
      addCash: 0,
      addSinpe: 0,
      addCard: 0,
      nextPaidTotal: Number(liveOrder.paidAmount || 0),
      isNowFullyPaid: true,
      nextFinStatus: 'paid',
    };
  }

  let addCash = 0;
  let addSinpe = 0;
  let addCard = 0;
  let batchTotal = 0;

  for (const pay of newPayments) {
    const amt = Math.round(Number(pay.amount) || 0);
    if (amt <= 0) {
      return {
        ok: false,
        error: 'Todos los montos de pago deben ser mayores a ₡0.',
        paymentsToWrite: [],
        addCash: 0,
        addSinpe: 0,
        addCard: 0,
        nextPaidTotal: Number(liveOrder.paidAmount || 0),
        isNowFullyPaid: false,
        nextFinStatus: resolveFinancialStatus(liveOrder),
      };
    }
    batchTotal += amt;
    if (pay.method === 'efectivo') addCash += amt;
    else if (pay.method === 'sinpe') addSinpe += amt;
    else if (pay.method === 'tarjeta') addCard += amt;
  }

  const livePaid = Math.max(0, Math.round(Number(liveOrder.paidAmount || 0)));
  const liveTotal = Math.max(0, Math.round(Number(liveOrder.total || 0)));
  const liveRemaining = Math.max(0, liveTotal - livePaid);

  if (batchTotal > liveRemaining) {
    return {
      ok: false,
      error: `Conflicto de cobro simultáneo: el monto (₡${batchTotal}) supera el saldo real pendiente (₡${liveRemaining}).`,
      paymentsToWrite: [],
      addCash: 0,
      addSinpe: 0,
      addCard: 0,
      nextPaidTotal: livePaid,
      isNowFullyPaid: livePaid >= liveTotal && liveTotal > 0,
      nextFinStatus: resolveFinancialStatus(liveOrder),
    };
  }

  const nextPaidTotal = livePaid + batchTotal;
  const isNowFullyPaid = nextPaidTotal >= liveTotal;
  const nextFinStatus: FinancialOrderStatus = isNowFullyPaid ? 'paid' : 'partially_paid';

  return {
    ok: true,
    idempotentReplay: false,
    paymentsToWrite: newPayments,
    addCash,
    addSinpe,
    addCard,
    nextPaidTotal,
    isNowFullyPaid,
    nextFinStatus,
  };
}

/**
 * Pure delta calculator preventing duplicate inventory deductions across repeated
 * saves, edits, authorizations, and payment triggers.
 */
export function computeOrderItemDeductionDeltas(items: OrderLineItem[]): {
  deltas: Array<{ item: OrderLineItem; pendingQty: number }>;
  updatedItems: OrderLineItem[];
} {
  const deltas: Array<{ item: OrderLineItem; pendingQty: number }> = [];
  const updatedItems: OrderLineItem[] = [];

  for (const item of items) {
    const alreadyDeducted = Math.max(0, Number(item.deductedQuantity || 0));
    const currentQty = Math.max(0, Number(item.quantity || 0));
    const pendingQty = Math.max(0, currentQty - alreadyDeducted);

    if (pendingQty > 0) {
      deltas.push({ item, pendingQty });
    }

    updatedItems.push({
      ...item,
      deductedQuantity: Math.max(alreadyDeducted, currentQty),
    });
  }

  return { deltas, updatedItems };
}

/**
 * Builds the minimal update payload for closing a cash register so affectedKeys()
 * strictly matches firestore.rules allowlist for Colaborador & Admin.
 */
export function buildCashRegisterClosePatch(params: {
  expectedCash: number;
  actualCash: number;
  closedAt: string;
  closedBy: string;
  notes?: string;
  closingDenominations?: DenominationCount[];
}): Partial<CashRegister> {
  const expected = Math.round(params.expectedCash);
  const counted = Math.round(params.actualCash);
  const patch: Partial<CashRegister> = {
    status: 'closed',
    expectedCash: expected,
    actualCash: counted,
    difference: Math.round(counted - expected),
    closedAt: params.closedAt,
    closedBy: params.closedBy,
  };
  if (params.closingDenominations !== undefined) {
    patch.closingDenominations = params.closingDenominations;
  }
  if (params.notes !== undefined) {
    patch.notes = params.notes;
  }
  return patch;
}
