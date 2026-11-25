import { UnitOfMeasure } from '../types';

export interface UnitConversionResult {
  compatible: boolean;
  convertedQuantity: number;
  convertedUnitCost: number;
  targetUnit: UnitOfMeasure;
}

/**
 * Standard unit aliases for normalizing user input or OCR text from invoices.
 */
export function normalizeUnitString(rawUnit: string): UnitOfMeasure {
  const clean = (rawUnit || '').trim().toLowerCase();
  
  if (['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(clean)) return 'kg';
  if (['g', 'gr', 'gramo', 'gramos'].includes(clean)) return 'g';
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(clean)) return 'litro';
  if (['ml', 'cc', 'mililitro', 'mililitros'].includes(clean)) return 'ml';
  if (['paq', 'paquete', 'paquetes', 'pqte', 'bolsa', 'bolsas'].includes(clean)) return 'paquete';
  if (['caja', 'cajas'].includes(clean)) return 'caja';
  if (['lata', 'latas'].includes(clean)) return 'lata';
  if (['porcion', 'porción', 'porciones'].includes(clean)) return 'porcion';
  
  return 'unidad';
}

/**
 * Converts a purchased quantity and unit cost to the inventory item's unit of measure.
 */
export function convertToInventoryUnit(
  purchaseQty: number,
  purchaseUnit: UnitOfMeasure,
  purchaseUnitCost: number,
  inventoryUnit: UnitOfMeasure
): UnitConversionResult {
  // If units match, no conversion needed
  if (purchaseUnit === inventoryUnit) {
    return {
      compatible: true,
      convertedQuantity: purchaseQty,
      convertedUnitCost: purchaseUnitCost,
      targetUnit: inventoryUnit,
    };
  }

  // Weight conversions: kg <-> g
  if (purchaseUnit === 'kg' && inventoryUnit === 'g') {
    const convertedQuantity = purchaseQty * 1000;
    const convertedUnitCost = purchaseUnitCost / 1000;
    return { compatible: true, convertedQuantity, convertedUnitCost, targetUnit: 'g' };
  }
  if (purchaseUnit === 'g' && inventoryUnit === 'kg') {
    const convertedQuantity = purchaseQty / 1000;
    const convertedUnitCost = purchaseUnitCost * 1000;
    return { compatible: true, convertedQuantity, convertedUnitCost, targetUnit: 'kg' };
  }

  // Volume conversions: litro <-> ml
  if (purchaseUnit === 'litro' && inventoryUnit === 'ml') {
    const convertedQuantity = purchaseQty * 1000;
    const convertedUnitCost = purchaseUnitCost / 1000;
    return { compatible: true, convertedQuantity, convertedUnitCost, targetUnit: 'ml' };
  }
  if (purchaseUnit === 'ml' && inventoryUnit === 'litro') {
    const convertedQuantity = purchaseQty / 1000;
    const convertedUnitCost = purchaseUnitCost * 1000;
    return { compatible: true, convertedQuantity, convertedUnitCost, targetUnit: 'litro' };
  }

  // Incompatible unit types (e.g. kg to litro, or unidad to kg)
  // Fallback gracefully without throwing, but flag compatible: false
  return {
    compatible: false,
    convertedQuantity: purchaseQty,
    convertedUnitCost: purchaseUnitCost,
    targetUnit: purchaseUnit,
  };
}

/**
 * Calculates the exact Weighted Average Cost (Costo Promedio Ponderado)
 * Formula:
 * Costo promedio nuevo = ((existencia anterior * costo anterior) + (cantidad comprada * costo nuevo)) / (existencia anterior + cantidad comprada)
 * 
 * Edge cases:
 * - If previous stock <= 0 (out of stock or negative), previous cost has no weight -> returns newUnitCost.
 * - If previous cost <= 0 or not set -> returns newUnitCost.
 * - Zero division protection: if (previousStock + purchasedQty) <= 0 -> returns newUnitCost.
 */
export function calculateWeightedAverageCost(
  previousStock: number,
  previousAverageCost: number | undefined | null,
  purchasedQty: number,
  newUnitCost: number
): number {
  if (purchasedQty <= 0) {
    return previousAverageCost || newUnitCost;
  }

  // If previous stock is non-positive or no previous cost exists, the new cost governs 100%
  if (previousStock <= 0 || !previousAverageCost || previousAverageCost <= 0) {
    return Math.round(newUnitCost * 100) / 100;
  }

  const totalStock = previousStock + purchasedQty;
  if (totalStock <= 0) {
    return Math.round(newUnitCost * 100) / 100;
  }

  const previousTotalValue = previousStock * previousAverageCost;
  const newPurchaseTotalValue = purchasedQty * newUnitCost;
  const weightedCost = (previousTotalValue + newPurchaseTotalValue) / totalStock;

  return Math.round(weightedCost * 100) / 100;
}
