export type UserRole = 'admin' | 'colaborador' | 'cocina';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
}

export type ServiceType = 'mesa' | 'ventana' | 'expres';
export type TableStatus = 'libre' | 'activa' | 'pendiente_pago';

// Legacy OrderStatus preserved for backwards compatibility with existing Firestore documents
export type OrderStatus = 'pending' | 'in_kitchen' | 'served' | 'completed' | 'cancelled';

// Separated Operational State Machine (does NOT depend on payment)
export type OperationalOrderStatus =
  | 'draft'
  | 'pending_auth'
  | 'authorized'
  | 'in_preparation'
  | 'ready'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

// Separated Financial State Machine (does NOT mark order delivered)
export type FinancialOrderStatus =
  | 'unpaid'
  | 'partially_paid'
  | 'paid'
  | 'partially_refunded'
  | 'refunded'
  | 'voided';

export type PaymentStatus = 'unpaid' | 'paid' | 'partially_paid' | 'refunded';
export type PaymentMethod = 'efectivo' | 'sinpe' | 'tarjeta' | 'mixto';
export type OrderSource = 'pos' | 'qr_mesa' | 'menu_expres';

export type CasadoProtein = 'Pollo' | 'Carne' | 'Chuleta' | 'Pescado' | string;

export interface RestaurantTable {
  id: string;
  name: string;
  number: number;
  type: 'table' | 'bar';
  active: boolean;
  status: TableStatus;
  currentOrderId?: string | null;
  seats?: number;
  qrToken?: string;
  qrEnabled?: boolean;
  qrRotatedAt?: string;
  updatedAt?: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  order: number;
  icon?: string;
  active: boolean;
  scheduleStart?: string; // e.g. "07:00"
  scheduleEnd?: string;   // e.g. "10:30"
  daysOfWeek?: number[];  // 1=Mon ... 5=Fri
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
  isFavorite?: boolean;
  isPublicMenu?: boolean;
  scheduleStart?: string;
  scheduleEnd?: string;
  breakfastOnly?: boolean;
  dayOfWeek?: number;
  updatedAt?: string;
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
  // Historical cost snapshot at time of sale/preparation (admin reporting only)
  historicalUnitCost?: number;
  // Track how many units of this line have already been deducted from inventory (delta-only deduction)
  deductedQuantity?: number;
}

export interface OrderChangeLog {
  timestamp: string;
  user: string;
  action: string;
  details?: string;
}

export interface DeliveryDetails {
  customerName: string;
  customerPhone: string;
  address: string;
  reference?: string;
  deliveryFee: number;
  withinCoverage1Km?: boolean;
  withinCoverageRadius?: boolean;
  needsChangeFor?: number;
  assignedCourier?: string;
  estimatedMinutes?: number;
}

export interface RestaurantOrder {
  id: string;
  orderNumber: string; // e.g. M-001, V-001, E-001
  serviceType: ServiceType;
  source?: OrderSource;
  tableId?: string;
  tableName?: string;
  items: OrderLineItem[];
  // Legacy status (kept synchronized for compatibility)
  status: OrderStatus;
  // Separated state machine
  operationalStatus?: OperationalOrderStatus;
  financialStatus?: FinancialOrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod | null;
  subtotal: number;
  serviceCharge: number; // 10% applied ONLY for 'mesa'
  deliveryFee?: number;  // Configurable delivery fee ONLY for 'expres'
  discount?: number;
  discountAmount?: number;
  discountReason?: string;
  total: number;
  paidAmount?: number;
  refundedAmount?: number;
  observations?: string;
  deliveryDetails?: DeliveryDetails;
  operationalDate: string; // YYYY-MM-DD in America/Costa_Rica
  createdBy: string;
  createdByUid?: string;
  createdAt: string;
  updatedAt: string;
  authorizedAt?: string;
  authorizedBy?: string;
  startedAt?: string;
  readyAt?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  paidAt?: string;
  inventoryDeducted?: boolean;
  inventoryDeductedAt?: string;
  changeHistory?: OrderChangeLog[];
  cancellationReason?: string;
  cancellationInventoryDisposition?: 'restored' | 'waste' | 'none';
  publicTrackingCode?: string;
  splitFromOrderId?: string;
}

// Sanitized Kitchen Display System (KDS) projection — STRICTLY ZERO PRICES / FINANCIALS
export interface KitchenOrderItem {
  id: string;
  name: string;
  quantity: number;
  selectedProtein?: CasadoProtein;
  notes?: string;
  isAddedDelta?: boolean;
}

export interface KitchenOrderProjection {
  id: string;
  orderId: string;
  orderNumber: string;
  serviceType: ServiceType;
  tableName?: string;
  source?: OrderSource;
  operationalStatus: OperationalOrderStatus;
  items: KitchenOrderItem[];
  observations?: string;
  customerName?: string; // Only first name / label for pickup/expres identification, never financial data
  priority?: 'normal' | 'alta';
  createdAt: string;
  authorizedAt?: string;
  startedAt?: string;
  readyAt?: string;
  dispatchedAt?: string;
  updatedAt: string;
  operationalDate: string;
}

// Persistent Payment Record (Collection: /payments/{paymentId})
export interface PaymentRecord {
  id: string;
  idempotencyKey: string;
  orderId: string;
  orderNumber: string;
  registerId: string;
  method: Exclude<PaymentMethod, 'mixto'>;
  amount: number;
  cashReceived?: number;
  receivedCash?: number;
  changeGiven?: number;
  sinpeReference?: string;
  cardAuthCode?: string;
  status: 'confirmed' | 'refunded' | 'voided';
  refundedAmount?: number;
  refundReason?: string;
  refundedBy?: string;
  refundedAt?: string;
  isSplitPayment?: boolean;
  splitLabel?: string;
  consolidatedOrderIds?: string[];
  notes?: string;
  performedBy: string;
  performedByUid?: string;
  createdAt: string;
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
  printedBy?: string;
  isCopy: boolean;
  reprintCount: number;
  documentType?: 'kitchen_comanda' | 'table_bill' | 'internal_receipt' | 'cash_close';
  paperWidth?: '58mm' | '80mm';
}

export interface DenominationCount {
  denomination: number;
  count: number;
  subtotal?: number;
}

export interface CashRegister {
  id: string;
  date: string; // YYYY-MM-DD in America/Costa_Rica
  status: 'open' | 'closed';
  openedAt: string;
  closedAt?: string;
  openedBy: string;
  openedByUid?: string;
  closedBy?: string;
  closedByUid?: string;
  initialCash: number;
  cashSales: number;
  sinpeSales: number;
  cardSales: number;
  cashDeposits?: number;
  cashWithdrawals?: number;
  cashRefunds?: number;
  cashPurchases: number;
  cashExpenses: number;
  expectedCash: number;
  actualCash?: number;
  difference?: number;
  denominations?: Record<string, number> | DenominationCount[];
  openingDenominations?: DenominationCount[];
  closingDenominations?: DenominationCount[];
  notes?: string;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenReason?: string;
}

export interface CashMovement {
  id: string;
  registerId: string;
  type: 'sale' | 'purchase' | 'expense' | 'adjustment' | 'initial_float' | 'refund' | 'deposit' | 'withdrawal';
  amount: number;
  paymentMethod: PaymentMethod;
  referenceId?: string;
  paymentId?: string;
  description: string;
  performedBy: string;
  performedByUid?: string;
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
  minStock?: number;
  averageCost?: number;
  lastPurchaseCost?: number;
  preferredSupplierId?: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  itemName: string;
  type: 'purchase' | 'consumption' | 'adjustment' | 'waste' | 'return';
  quantity: number;
  previousStock: number;
  newStock: number;
  unit?: UnitOfMeasure;
  unitCost?: number;
  referenceId?: string;
  reason: string;
  performedBy: string;
  performedByUid?: string;
  performedByEmail?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  category?: string;
  creditDays?: number;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
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

export interface CreditPaymentEntry {
  id: string;
  amount: number;
  method?: 'efectivo' | 'transferencia' | 'sinpe' | 'tarjeta';
  paymentMethod?: 'efectivo' | 'transferencia' | 'sinpe' | 'tarjeta';
  paidFromCashRegister: boolean;
  reference?: string;
  notes?: string;
  paidAt: string;
  paidBy: string;
}

export interface PurchaseRecord {
  id: string;
  purchaseNumber?: string;
  vendor?: string;
  supplierId?: string;
  date: string;
  paymentMethod: 'efectivo' | 'transferencia' | 'tarjeta' | 'credito';
  paidFromCashRegister: boolean;
  creditStatus?: 'paid' | 'pending' | 'partial';
  paidAmount?: number;
  dueDate?: string;
  creditPayments?: CreditPaymentEntry[];
  items: PurchaseLineItem[];
  total: number;
  notes?: string;
  registeredBy: string;
  createdAt: string;
}

export type Purchase = PurchaseRecord;

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
  isComplete: boolean;
  updatedAt: string;
}

export type ExpenseFrequency = 'mensual' | 'quincenal' | 'semanal' | 'anual' | 'unico';

export type ExpenseCategory =
  | 'alquiler'
  | 'electricidad'
  | 'agua'
  | 'gas'
  | 'internet'
  | 'planilla'
  | 'ccss'
  | 'polizas'
  | 'mantenimiento'
  | 'transporte'
  | 'publicidad'
  | 'empaques'
  | 'servicios'
  | 'permisos'
  | 'otros';

export interface OperatingExpense {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  paymentMethod: string;
  paidFromCashRegister: boolean;
  frequency: ExpenseFrequency;
  dueDate: string; // YYYY-MM-DD
  nextDueDate: string;
  status: 'pending' | 'paid';
  lastPaidAt?: string;
  receiptRef?: string;
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

export interface ScheduleWindow {
  enabled: boolean;
  openTime: string;  // "07:00"
  closeTime: string; // "18:00"
  daysOfWeek: number[]; // 0=Sun, 1=Mon ... 6=Sat
}

export interface RestaurantConfig {
  id: string;
  restaurantName: string;
  location: string;
  timezone: string;
  currency: string;
  expressDeliveryFee: number;
  expressMaxRadiusKm: number;
  expressMinOrder: number;
  expressEnabled: boolean;
  expressCoverageDescription?: string;
  qrTableOrderingEnabled: boolean;
  inventoryDeductionTrigger: 'kitchen_auth' | 'payment';
  printerWidth: '80mm' | '58mm';
  tableServicePercent?: number;
  phone?: string;
  contactPhone?: string;
  sinpePhone?: string;
  openDays?: number[];
  openTime?: string;
  closeTime?: string;
  breakfastStartTime?: string;
  breakfastEndTime?: string;
  schedules: {
    general: ScheduleWindow;
    breakfast: ScheduleWindow;
    express: ScheduleWindow;
  };
  updatedAt?: string;
  updatedBy?: string;
}

export interface PublicMenuProduct {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  price: number;
  isCasado: boolean;
  proteinOptions?: CasadoProtein[];
  available: boolean;
  scheduleStart?: string;
  scheduleEnd?: string;
}

export interface PublicCatalogSnapshot {
  restaurantName: string;
  location: string;
  currency: string;
  expressDeliveryFee: number;
  expressMaxRadiusKm: number;
  expressEnabled: boolean;
  qrTableOrderingEnabled: boolean;
  schedules: RestaurantConfig['schedules'];
  categories: ProductCategory[];
  products: PublicMenuProduct[];
  updatedAt: string;
}
