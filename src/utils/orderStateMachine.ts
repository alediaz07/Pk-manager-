import {
  CashRegister,
  DenominationCount,
  FinancialOrderStatus,
  InventoryItem,
  OperationalOrderStatus,
  OrderLineItem,
  OrderStatus,
  Recipe,
  RestaurantConfig,
  RestaurantOrder,
  ServiceType,
  UserRole,
} from '../types';
import { convertToInventoryUnit } from './unitConverter';

export const DEFAULT_RESTAURANT_CONFIG: RestaurantConfig = {
  id: 'main',
  restaurantName: 'Pollos Karen',
  location: 'La Uruca, San José, Costa Rica',
  timezone: 'America/Costa_Rica',
  currency: 'CRC',
  expressDeliveryFee: 500,
  expressMaxRadiusKm: 1,
  expressMinOrder: 0,
  expressEnabled: true,
  expressCoverageDescription: '1 km alrededor del local en La Uruca',
  qrTableOrderingEnabled: true,
  inventoryDeductionTrigger: 'kitchen_auth',
  printerWidth: '80mm',
  tableServicePercent: 10,
  phone: '',
  contactPhone: '',
  sinpePhone: '',
  openDays: [1, 2, 3, 4, 5],
  openTime: '07:00',
  closeTime: '18:00',
  breakfastStartTime: '07:00',
  breakfastEndTime: '10:30',
  schedules: {
    general: {
      enabled: true,
      openTime: '07:00',
      closeTime: '18:00',
      daysOfWeek: [1, 2, 3, 4, 5], // Lunes a Viernes
    },
    breakfast: {
      enabled: true,
      openTime: '07:00',
      closeTime: '10:30',
      daysOfWeek: [1, 2, 3, 4, 5],
    },
    express: {
      enabled: true,
      openTime: '07:00',
      closeTime: '17:30',
      daysOfWeek: [1, 2, 3, 4, 5],
    },
  },
};

/**
 * Maps legacy OrderStatus into the separated OperationalOrderStatus
 */
export function resolveOperationalStatus(order: Partial<RestaurantOrder>): OperationalOrderStatus {
  if (order.operationalStatus) return order.operationalStatus;
  switch (order.status) {
    case 'pending':
      return 'draft';
    case 'in_kitchen':
      return 'in_preparation';
    case 'served':
      return 'ready';
    case 'completed':
      return 'delivered';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'draft';
  }
}

/**
 * Maps separated OperationalOrderStatus back to legacy OrderStatus for compatibility
 */
export function mapOperationalToLegacyStatus(
  op: OperationalOrderStatus,
  _fin?: FinancialOrderStatus
): OrderStatus {
  switch (op) {
    case 'draft':
    case 'pending_auth':
      return 'pending';
    case 'authorized':
    case 'in_preparation':
      return 'in_kitchen';
    case 'ready':
    case 'dispatched':
      return 'served';
    case 'delivered':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
  }
}

export const toLegacyOrderStatus = mapOperationalToLegacyStatus;

/**
 * Resolves FinancialOrderStatus from order fields
 */
export function resolveFinancialStatus(order: Partial<RestaurantOrder>): FinancialOrderStatus {
  if (order.financialStatus) return order.financialStatus;
  if (order.status === 'cancelled' && order.paymentStatus !== 'paid') return 'voided';
  if (order.paymentStatus === 'paid') return 'paid';
  if (order.paymentStatus === 'partially_paid') return 'partially_paid';
  if (order.paymentStatus === 'refunded') return 'refunded';
  return 'unpaid';
}

/**
 * Computes financial status strictly from monetary totals (NEVER alters operationalStatus)
 */
export function computeFinancialStatus(
  orderTotal: number,
  confirmedPaidTotal: number,
  refundedTotal: number,
  isVoided: boolean = false
): FinancialOrderStatus {
  if (isVoided && confirmedPaidTotal <= 0) return 'voided';
  const netPaid = Math.max(0, Math.round(confirmedPaidTotal - refundedTotal));
  if (refundedTotal > 0 && netPaid <= 0) return 'refunded';
  if (refundedTotal > 0 && netPaid > 0) return 'partially_refunded';
  if (orderTotal > 0 && netPaid >= orderTotal) return 'paid';
  if (netPaid > 0 && netPaid < orderTotal) return 'partially_paid';
  return 'unpaid';
}

const VALID_OPERATIONAL_TRANSITIONS: Record<OperationalOrderStatus, OperationalOrderStatus[]> = {
  draft: ['pending_auth', 'authorized', 'in_preparation', 'cancelled'],
  pending_auth: ['authorized', 'in_preparation', 'cancelled'],
  authorized: ['in_preparation', 'ready', 'cancelled'],
  in_preparation: ['ready', 'delivered', 'cancelled'],
  ready: ['dispatched', 'delivered', 'cancelled'],
  dispatched: ['delivered', 'cancelled'],
  delivered: ['cancelled'], // Only admin can cancel post-delivery
  cancelled: [],
};

export function canTransitionOperationalStatus(
  from: OperationalOrderStatus,
  to: OperationalOrderStatus,
  role: UserRole
): { allowed: boolean; reason?: string } {
  if (from === to) return { allowed: true };
  if (from === 'cancelled') {
    return { allowed: false, reason: 'Una comanda anulada no puede cambiar de estado.' };
  }
  if (to === 'cancelled' && role !== 'admin') {
    return { allowed: false, reason: 'Solo un Administrador puede anular comandas.' };
  }
  if (role === 'cocina') {
    const kitchenAllowed =
      (from === 'authorized' && (to === 'in_preparation' || to === 'ready')) ||
      (from === 'in_preparation' && to === 'ready');
    return kitchenAllowed
      ? { allowed: true }
      : { allowed: false, reason: 'Cocina solo puede avanzar comandas autorizadas a En Preparación o Lista.' };
  }
  if (!VALID_OPERATIONAL_TRANSITIONS[from]?.includes(to)) {
    return {
      allowed: false,
      reason: `Transición operativa inválida: ${from} -> ${to}.`,
    };
  }
  return { allowed: true };
}

export interface OrderTotalOptions {
  deliveryFee?: number;
  expressDeliveryFee?: number;
  discountAmount?: number;
  discount?: number;
  tableServicePercent?: number;
}

/**
 * Canonical order calculation (shared by POS, Public Menu, and Backend verification):
 * - Mesa: +10% service charge on subtotal after discount, ₡0 delivery fee
 * - Ventana: 0% service charge, ₡0 delivery fee
 * - Exprés: 0% service charge, configurable delivery fee (e.g. ₡500)
 */
export function calculateOrderTotalsDetailed(
  items: Pick<OrderLineItem, 'price' | 'quantity'>[],
  serviceType: ServiceType,
  options: OrderTotalOptions = {}
): {
  subtotal: number;
  discount: number;
  discountAmount: number;
  serviceCharge: number;
  deliveryFee: number;
  total: number;
} {
  const subtotal = Math.max(
    0,
    items.reduce((acc, item) => {
      const price = Math.max(0, Number(item.price) || 0);
      const qty = Math.max(0, Number(item.quantity) || 0);
      return acc + Math.round(price * qty);
    }, 0)
  );

  const rawDiscount = Math.max(
    0,
    Math.round(Number(options.discountAmount ?? options.discount) || 0)
  );
  const discountAmount = Math.min(subtotal, rawDiscount);
  const taxableBase = Math.max(0, subtotal - discountAmount);

  const serviceRate = (options.tableServicePercent ?? 10) / 100;
  const serviceCharge = serviceType === 'mesa' ? Math.round(taxableBase * serviceRate) : 0;
  const effectiveDeliveryFee = options.deliveryFee ?? options.expressDeliveryFee ?? 0;
  const deliveryFee =
    serviceType === 'expres' && subtotal > 0
      ? Math.max(0, Math.round(Number(effectiveDeliveryFee) || 0))
      : 0;

  const total = Math.max(0, taxableBase + serviceCharge + deliveryFee);

  return {
    subtotal,
    discount: discountAmount,
    discountAmount,
    serviceCharge,
    deliveryFee,
    total,
  };
}

/**
 * Exact expected cash formula in drawer:
 * expectedCash = initialCash + cashSales + cashDeposits - cashRefunds - cashPurchases - cashExpenses - cashWithdrawals
 */
export function calculateExpectedCash(
  reg: Pick<
    CashRegister,
    | 'initialCash'
    | 'cashSales'
    | 'cashDeposits'
    | 'cashRefunds'
    | 'cashPurchases'
    | 'cashExpenses'
    | 'cashWithdrawals'
  >
): number {
  const initial = Number(reg.initialCash) || 0;
  const sales = Number(reg.cashSales) || 0;
  const deposits = Number(reg.cashDeposits) || 0;
  const refunds = Number(reg.cashRefunds) || 0;
  const purchases = Number(reg.cashPurchases) || 0;
  const expenses = Number(reg.cashExpenses) || 0;
  const withdrawals = Number(reg.cashWithdrawals) || 0;

  return Math.round(initial + sales + deposits - refunds - purchases - expenses - withdrawals);
}

/**
 * Single-ingredient consumption helper:
 * deductedQty = convert( (ingredientQty / yieldPortions) * soldQty, ingredientUnit -> inventoryUnit )
 */
export function calculateIngredientConsumption(
  soldQty: number,
  yieldPortions: number,
  ingredientQty: number,
  ingredientUnit: InventoryItem['unit'],
  inventoryUnit: InventoryItem['unit']
): { compatible: boolean; deductedQty: number; unit: InventoryItem['unit'] } {
  const safeYield = Math.max(0.001, Number(yieldPortions) || 1);
  const safeSold = Math.max(0, Number(soldQty) || 0);
  const rawNeeded = (Math.max(0, Number(ingredientQty) || 0) / safeYield) * safeSold;
  const conv = convertToInventoryUnit(rawNeeded, ingredientUnit, 0, inventoryUnit);
  return {
    compatible: conv.compatible,
    deductedQty: Math.round(conv.convertedQuantity * 10000) / 10000,
    unit: conv.targetUnit,
  };
}

/**
 * Exact recipe ingredient consumption formula with yieldPortions and unit conversion:
 * consumedInInventoryUnit = convert( (ing.quantity / yieldPortions) * soldQty, ing.unit -> inv.unit )
 */
export function calculateRecipeConsumptionForItem(
  recipe: Recipe,
  soldQty: number,
  inventoryItems: InventoryItem[]
): {
  deductions: {
    itemId: string;
    itemName: string;
    quantityInInvUnit: number;
    inventoryUnit: InventoryItem['unit'];
    unitCost: number;
    lineCost: number;
    compatible: boolean;
  }[];
  totalPortionCost: number;
} {
  const yieldPortions = Math.max(0.001, Number(recipe.yieldPortions) || 1);
  const qtySold = Math.max(0, Number(soldQty) || 0);
  const deductions: {
    itemId: string;
    itemName: string;
    quantityInInvUnit: number;
    inventoryUnit: InventoryItem['unit'];
    unitCost: number;
    lineCost: number;
    compatible: boolean;
  }[] = [];

  let totalCost = 0;

  for (const ing of recipe.ingredients || []) {
    const invItem = inventoryItems.find(i => i.id === ing.itemId);
    const targetUnit = invItem?.unit || ing.unit;
    const rawNeeded = (Number(ing.quantity || 0) / yieldPortions) * qtySold;
    const invUnitCost = Number(invItem?.averageCost || invItem?.lastPurchaseCost || ing.unitCost || 0);

    const conv = convertToInventoryUnit(rawNeeded, ing.unit, 0, targetUnit);
    const finalQty = Math.round(conv.convertedQuantity * 10000) / 10000;
    const lineCost = Math.round(finalQty * invUnitCost * 100) / 100;
    totalCost += lineCost;

    deductions.push({
      itemId: ing.itemId,
      itemName: invItem?.name || ing.itemName,
      quantityInInvUnit: finalQty,
      inventoryUnit: targetUnit,
      unitCost: invUnitCost,
      lineCost,
      compatible: conv.compatible,
    });
  }

  return {
    deductions,
    totalPortionCost: qtySold > 0 ? Math.round(totalCost / qtySold) : 0,
  };
}

/**
 * Evaluates whether a Costa Rica timestamp falls within a configured ScheduleWindow
 */
export function isWithinCostaRicaSchedule(
  schedule: { enabled: boolean; openTime: string; closeTime: string; daysOfWeek: number[] },
  referenceDate: Date = new Date()
): { open: boolean; reason?: string; currentCRTime: string; dayOfWeek: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Costa_Rica',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(referenceDate);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const weekdayStr = parts.find(p => p.type === 'weekday')?.value || 'Mon';
  const hourStr = parts.find(p => p.type === 'hour')?.value || '00';
  const minStr = parts.find(p => p.type === 'minute')?.value || '00';
  const dayOfWeek = weekdayMap[weekdayStr] ?? 1;
  const hh = hourStr === '24' ? '00' : hourStr;
  const currentCRTime = `${hh}:${minStr}`;

  if (!schedule.enabled) {
    return { open: false, reason: 'Servicio temporalmente deshabilitado.', currentCRTime, dayOfWeek };
  }

  if (!schedule.daysOfWeek.includes(dayOfWeek)) {
    return {
      open: false,
      reason: 'Cerrado hoy (horario habitual: lunes a viernes).',
      currentCRTime,
      dayOfWeek,
    };
  }

  if (currentCRTime < schedule.openTime || currentCRTime > schedule.closeTime) {
    return {
      open: false,
      reason: `Fuera de horario (${schedule.openTime} a ${schedule.closeTime}, hora Costa Rica).`,
      currentCRTime,
      dayOfWeek,
    };
  }

  return { open: true, currentCRTime, dayOfWeek };
}

/**
 * Computes human-readable Spanish labels for operational & financial statuses
 */
export const OPERATIONAL_STATUS_LABELS: Record<OperationalOrderStatus, string> = {
  draft: 'Borrador',
  pending_auth: 'Pendiente Autorizar',
  authorized: 'Autorizada',
  in_preparation: 'En Preparación',
  ready: 'Lista',
  dispatched: 'Despachada',
  delivered: 'Entregada',
  cancelled: 'Anulada',
};

export const FINANCIAL_STATUS_LABELS: Record<FinancialOrderStatus, string> = {
  unpaid: 'Sin Pagar',
  partially_paid: 'Pago Parcial',
  paid: 'Pagada',
  partially_refunded: 'Reembolso Parcial',
  refunded: 'Reembolsada',
  voided: 'Anulada',
};

/**
 * Generates a Costa Rica bill/coin denomination summary
 */
export const CR_DENOMINATIONS = [20000, 10000, 5000, 2000, 1000, 500, 100, 50, 25, 10, 5] as const;

export function calculateDenominationsTotal(
  counts: Record<string, number> | DenominationCount[]
): number {
  if (Array.isArray(counts)) {
    return counts.reduce((sum, entry) => {
      const denom = Math.max(0, Number(entry.denomination) || 0);
      const qty = Math.max(0, Math.floor(Number(entry.count) || 0));
      return sum + denom * qty;
    }, 0);
  }
  return CR_DENOMINATIONS.reduce((sum, denom) => {
    const qty = Math.max(0, Math.floor(Number(counts[String(denom)]) || 0));
    return sum + denom * qty;
  }, 0);
}
