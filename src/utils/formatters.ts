import { OrderLineItem, ServiceType } from '../types';

/**
 * Formats a numeric amount into Costa Rican Colones (CRC ₡)
 * e.g., 3500 -> "₡3,500"
 */
export function formatCRC(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return '₡0';
  }
  const formatted = Math.round(amount).toLocaleString('es-CR');
  return `₡${formatted}`;
}

/**
 * Returns current date in America/Costa_Rica as YYYY-MM-DD
 */
export function getCostaRicaDateString(date: Date = new Date()): string {
  try {
    return date.toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Formats ISO date string to legible Spanish Costa Rica representation
 */
export function formatDateTime(isoString?: string): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('es-CR', {
      timeZone: 'America/Costa_Rica',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function formatDate(isoString?: string): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('es-CR', {
      timeZone: 'America/Costa_Rica',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoString;
  }
}

/**
 * Calculates order subtotal, conditional 10% table service, and grand total.
 * RULE: 10% de servicio applies ONLY to orders with serviceType == 'mesa'!
 */
export function calculateOrderTotals(
  items: OrderLineItem[],
  serviceType: ServiceType
): { subtotal: number; serviceCharge: number; total: number } {
  const subtotal = Math.max(
    0,
    items.reduce((acc, item) => {
      const price = Math.max(0, Number(item.price) || 0);
      const qty = Math.max(0, Number(item.quantity) || 0);
      return acc + Math.round(price * qty);
    }, 0)
  );

  // RULE: 10% de servicio applies ONLY to orders with serviceType == 'mesa'!
  const serviceCharge = serviceType === 'mesa' ? Math.round(subtotal * 0.10) : 0;
  const total = subtotal + serviceCharge;

  return { subtotal, serviceCharge, total };
}

/**
 * Generates an automatic order sequence identifier:
 * - Mesa: M-01, M-02...
 * - Ventana: V-101, V-102...
 * - Exprés: E-201, E-202...
 */
export function generateOrderNumber(serviceType: ServiceType, sequenceNumber: number): string {
  const prefix = serviceType === 'mesa' ? 'M' : serviceType === 'ventana' ? 'V' : 'E';
  const padded = String(sequenceNumber).padStart(3, '0');
  return `${prefix}-${padded}`;
}
