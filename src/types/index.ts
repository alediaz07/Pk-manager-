export type UserRole = 'admin' | 'colaborador';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt?: string;
}

export type ServiceType = 'mesa' | 'ventana' | 'expres';
export type TableStatus = 'libre' | 'activa' | 'pendiente_pago';
export type OrderStatus = 'pending' | 'in_kitchen' | 'served' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid';
export type PaymentMethod = 'efectivo' | 'sinpe' | 'tarjeta';

export type CasadoProtein = 'Pollo' | 'Carne' | 'Chuleta' | 'Pescado';

export interface RestaurantTable {
  id: string;
  name: string;
  number: number;
  type: 'table' | 'bar';
  active: boolean;
  status: TableStatus;
  currentOrderId?: string | null;
  seats?: number;
  updatedAt?: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  order: number;
  icon?: string;
  active: boolean;
}

export interface ProductItem {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  price: number; // In CRC ₡
  isCasado: boolean;
  proteinOptions?: CasadoProtein[];
  available: boolean;
  active: boolean;
  imageUrl?: string;
}

export interface OrderLineItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  isCasado: boolean;
  selectedProtein?: CasadoProtein;
  notes?: string;
  subtotal: number;
}

export interface OrderChangeLog {
  timestamp: string;
  user: string;
  action: string;
  details: string;
}

export interface RestaurantOrder {
  id: string;
  orderNumber: string; // e.g. M-101, V-102, E-103
  serviceType: ServiceType;
  tableId?: string;
  tableName?: string;
  items: OrderLineItem[];
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod | null;
  subtotal: number;
  serviceCharge: number; // 10% applied ONLY for 'mesa'
  total: number;
  observations?: string;
  operationalDate: string; // YYYY-MM-DD in America/Costa_Rica
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  inventoryDeducted?: boolean;
  inventoryDeductedAt?: string;
  changeHistory?: OrderChangeLog[];
  cancellationReason?: string;
}

export interface KitchenTicket {
  id: string;
  orderId: string;
  orderNumber: string;
  serviceType: ServiceType;
  tableName?: string;
  items: {
    quantity: number;
    name: string;
    selectedProtein?: CasadoProtein;
    notes?: string;
  }[];
  observations?: string;
  printedAt: string;
  isCopy: boolean;
  reprintCount: number;
}

export interface CashRegister {
  id: string;
  date: string; // YYYY-MM-DD in America/Costa_Rica
  status: 'open' | 'closed';
  openedAt: string;
  closedAt?: string;
  openedBy: string;
  closedBy?: string;
  initialCash: number;
  cashSales: number;
  sinpeSales: number;
  cardSales: number;
  cashPurchases: number;
  cashExpenses: number;
  expectedCash: number;
  actualCash?: number;
  difference?: number;
  notes?: string;
}

export interface CashMovement {
  id: string;
  registerId: string;
  type: 'sale' | 'purchase' | 'expense' | 'adjustment' | 'initial_float';
  amount: number;
  paymentMethod: PaymentMethod;
  referenceId?: string;
  description: string;
  performedBy: string;
  createdAt: string;
}

export type InventoryCategory = 'ingredientes' | 'bebidas' | 'empaques' | 'consumibles' | 'otros';
export type UnitOfMeasure = 'kg' | 'g' | 'litro' | 'ml' | 'unidad' | 'paquete' | 'caja' | 'lata' | 'porcion';

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  unit: UnitOfMeasure;
  currentStock: number;
  minStock?: number; // Optional, only triggers alert if configured
  averageCost?: number;
  lastPurchaseCost?: number;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  itemName: string;
  type: 'purchase' | 'consumption' | 'adjustment' | 'waste';
  quantity: number;
  previousStock: number;
  newStock: number;
  unit?: UnitOfMeasure;
  unitCost?: number;
  referenceId?: string;
  reason: string;
  performedBy: string;
  performedByEmail?: string;
  createdAt: string;
}

export interface PurchaseLineItem {
  id?: string;
  itemId?: string;
  name: string;
  normalizedName?: string;
  quantity: number;
  unit: UnitOfMeasure;
  unitCost: number;
  totalCost: number;
}

export interface PurchaseRecord {
  id: string;
  purchaseNumber?: string;
  vendor?: string;
  date: string;
  paymentMethod: 'efectivo' | 'transferencia' | 'tarjeta' | 'credito';
  paidFromCashRegister: boolean;
  items: PurchaseLineItem[];
  total: number;
  notes?: string;
  registeredBy: string;
  createdAt: string;
}

export interface RecipeIngredient {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: UnitOfMeasure;
  unitCost?: number;
}

export interface Recipe {
  id: string;
  productId: string;
  productName: string;
  protein?: CasadoProtein | string;
  ingredients: RecipeIngredient[];
  yieldPortions: number;
  calculatedCost?: number;
  autoDeductEnabled: boolean;
  isComplete: boolean; // false if missing ingredients, quantities or costs
  updatedAt: string;
}

export type ExpenseFrequency = 'mensual' | 'quincenal' | 'anual' | 'unico';

export interface OperatingExpense {
  id: string;
  name: string;
  category: 'alquiler' | 'electricidad' | 'agua' | 'gas' | 'internet' | 'servicios' | 'permisos' | 'otros';
  amount: number;
  paymentMethod: string;
  paidFromCashRegister: boolean;
  frequency: ExpenseFrequency;
  dueDate: string; // YYYY-MM-DD
  nextDueDate: string;
  status: 'pending' | 'paid';
  lastPaidAt?: string;
  notes?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  collection: string;
  documentId: string;
  reason: string;
  performedBy: string;
  performedByUid: string;
  performedByEmail: string;
  timestamp: string;
  details?: string;
}
