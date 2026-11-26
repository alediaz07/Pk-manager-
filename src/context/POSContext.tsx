import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  runTransaction,
  writeBatch,
  query,
  orderBy,
  limit,
  increment,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeForFirestore } from '../config/firebase';
import { useAuth } from './AuthContext';
import {
  RestaurantTable,
  ProductCategory,
  ProductItem,
  RestaurantOrder,
  OrderLineItem,
  ServiceType,
  PaymentMethod,
  CashRegister,
  CashMovement,
  InventoryItem,
  PurchaseRecord,
  OperatingExpense,
  KitchenTicket,
  CasadoProtein,
  AuditLog,
  InventoryMovement,
  OrderStatus,
  OperationalOrderStatus,
  FinancialOrderStatus,
  Recipe,
  PaymentRecord,
  DeliveryDetails,
  KitchenOrderProjection,
  RestaurantConfig,
  Supplier,
  DenominationCount,
  CreditPaymentEntry,
} from '../types';
import {
  INITIAL_TABLES,
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_INVENTORY_ITEMS,
  INITIAL_RECIPES,
} from '../config/initialData';
import { getCostaRicaDateString, generateOrderNumber } from '../utils/formatters';
import {
  calculateWeightedAverageCost,
  convertToInventoryUnit,
  normalizeUnitString,
} from '../utils/unitConverter';
import {
  calculateExpectedCash,
  calculateIngredientConsumption,
  calculateOrderTotalsDetailed,
  DEFAULT_RESTAURANT_CONFIG,
  resolveFinancialStatus,
  resolveOperationalStatus,
  toLegacyOrderStatus,
} from '../utils/orderStateMachine';
import {
  createKitchenTicketFromOrder,
  printKitchenTicket,
} from '../utils/thermalPrinter';
import {
  saveOfflineOrder,
  getOfflineOrders,
  removeOfflineOrder,
  saveOfflineMutation,
  getOfflineMutations,
  removeOfflineMutation,
  updateOfflineMutationStatus,
  getOfflinePendingCount,
} from '../utils/offlineQueue';
import {
  buildSanitizedBackup,
  restoreBackupInChunks,
  validateBackupPayload,
  BackupValidationResult,
} from '../utils/backupManager';
import { POLLOS_KAREN_CATEGORIES, POLLOS_KAREN_PRODUCTS } from '../config/pollosKarenCatalog';
import {
  buildCashRegisterClosePatch,
  buildDeterministicPaymentId,
  buildPurchaseInvoiceLockId,
  evaluateTransactionalPayment,
} from '../utils/concurrencyGuards';

export interface RecipeFormulaDoc {
  id: string;
  productId: string;
  protein?: CasadoProtein;
  yieldPortions: number;
  autoDeductEnabled: boolean;
  ingredients: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    unit: string;
    inventoryUnit: string;
  }>;
  updatedAt: string;
}

export interface PaymentEntryInput {
  method: 'efectivo' | 'sinpe' | 'tarjeta';
  amount: number;
  receivedCash?: number;
  sinpeReference?: string;
  cardAuthCode?: string;
}

const CLOSED_PLACEHOLDER_REGISTER = (dateStr: string): CashRegister => ({
  id: '',
  date: dateStr,
  status: 'closed',
  openedAt: '',
  openedBy: '',
  initialCash: 0,
  cashSales: 0,
  sinpeSales: 0,
  cardSales: 0,
  cashDeposits: 0,
  cashWithdrawals: 0,
  cashRefunds: 0,
  cashPurchases: 0,
  cashExpenses: 0,
  expectedCash: 0,
});

function buildKitchenProjection(order: RestaurantOrder, opStatus: OperationalOrderStatus): KitchenOrderProjection {
  const nowIso = new Date().toISOString();
  return {
    id: order.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    serviceType: order.serviceType,
    tableName: order.tableName,
    operationalStatus: opStatus,
    items: order.items.map(it => ({
      id: it.id,
      name: it.name,
      quantity: it.quantity,
      selectedProtein: it.selectedProtein,
      notes: it.notes,
    })),
    observations: order.observations,
    createdAt: order.createdAt || nowIso,
    operationalDate: order.operationalDate || getCostaRicaDateString(),
    authorizedAt: order.authorizedAt || order.createdAt || nowIso,
    startedAt: order.startedAt,
    readyAt: order.readyAt,
    updatedAt: nowIso,
  };
}

interface POSContextType {
  // Config
  restaurantConfig: RestaurantConfig;
  updateRestaurantConfig: (patch: Partial<RestaurantConfig>) => Promise<void>;

  // Catalog & Tables
  tables: RestaurantTable[];
  categories: ProductCategory[];
  products: ProductItem[];
  selectedTable: RestaurantTable | null;
  selectTable: (table: RestaurantTable | null) => void;
  updateTableStatus: (
    tableId: string,
    status: RestaurantTable['status'],
    currentOrderId?: string | null
  ) => Promise<void>;
  addTable: (name: string, number: number, type: 'table' | 'bar', seats: number) => Promise<void>;
  toggleTableActive: (tableId: string) => Promise<void>;
  importPollosKarenOfficialMenu: (options?: {
    updateExistingPrices?: boolean;
  }) => Promise<{ categoriesAdded: number; productsAdded: number; productsUpdated: number }>;

  // Active Orders & Separated States
  orders: RestaurantOrder[];
  kitchenOrders: KitchenOrderProjection[];
  currentOrder: RestaurantOrder | null;
  setCurrentOrder: (order: RestaurantOrder | null) => void;
  createNewOrder: (serviceType: ServiceType, table?: RestaurantTable) => RestaurantOrder;
  addItemToCurrentOrder: (product: ProductItem, protein?: CasadoProtein, notes?: string) => void;
  updateOrderItemQuantity: (lineItemId: string, delta: number) => void;
  removeOrderItem: (lineItemId: string) => void;
  setOrderObservations: (observations: string) => void;
  setOrderDeliveryDetails: (details: DeliveryDetails | undefined) => void;
  setOrderDiscount: (discount: number, reason?: string) => void;
  saveActiveOrder: (options?: {
    authorizeToKitchen?: boolean;
  }) => Promise<{ success: boolean; order?: RestaurantOrder; error?: string }>;
  authorizeOrderToKitchen: (orderId: string) => Promise<{ success: boolean; error?: string }>;
  updateKitchenOrderStatus: (
    orderId: string,
    nextStatus: 'in_preparation' | 'ready'
  ) => Promise<void>;
  markOrderDelivered: (orderId: string) => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  cancelOrder: (
    orderId: string,
    reason: string,
    inventoryDisposition?: 'restored' | 'waste' | 'none'
  ) => Promise<void>;
  transferTableOrder: (
    orderId: string,
    targetTableId: string
  ) => Promise<{ success: boolean; error?: string }>;
  mergeTableOrders: (
    sourceOrderId: string,
    targetOrderId: string
  ) => Promise<{ success: boolean; error?: string }>;
  splitOrderItems: (
    orderId: string,
    splitSelections: Array<{ lineItemId: string; quantity: number }>
  ) => Promise<{ success: boolean; newOrder?: RestaurantOrder; error?: string }>;

  // Kitchen Tickets
  kitchenTickets: KitchenTicket[];
  printOrderTicket: (order: RestaurantOrder) => void;
  activeTicketToPrint: KitchenTicket | null;
  setActiveTicketToPrint: (ticket: KitchenTicket | null) => void;

  // Payments & Cash Register (Explicit Open/Close)
  payments: PaymentRecord[];
  cashRegister: CashRegister;
  activeCashRegister: CashRegister | null;
  hasOpenCashRegister: boolean;
  cashRegistersHistory: CashRegister[];
  staleOpenRegisters: CashRegister[];
  cashMovements: CashMovement[];
  recordOrderPayment: (
    orderId: string,
    entries: PaymentEntryInput[]
  ) => Promise<{
    success: boolean;
    change?: number;
    payments?: PaymentRecord[];
    error?: string;
  }>;
  completeOrderPayment: (
    orderId: string,
    method: PaymentMethod,
    receivedCash?: number,
    meta?: { sinpeReference?: string; cardAuthCode?: string }
  ) => Promise<{ success: boolean; change?: number; error?: string }>;
  refundPayment: (paymentId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  recordPhysicalCount: (
    actualCash: number,
    notes?: string,
    denominations?: DenominationCount[]
  ) => Promise<void>;
  closeCashRegister: (
    actualCash: number,
    notes?: string,
    denominations?: DenominationCount[],
    targetRegisterId?: string
  ) => Promise<{ success: boolean; register?: CashRegister; error?: string }>;
  openNewDayRegister: (
    initialFloat: number,
    denominations?: DenominationCount[]
  ) => Promise<void>;
  reopenCashRegister: (registerId: string, reason: string) => Promise<void>;
  recordCashDrawerMovement: (
    type: 'deposit' | 'withdrawal',
    amount: number,
    reason: string
  ) => Promise<void>;

  // Recipes & Formulation
  recipes: Recipe[];
  saveRecipe: (recipe: Recipe) => Promise<void>;
  toggleRecipeAutoDeduct: (recipeId: string) => Promise<void>;
  registerWaste: (itemId: string, quantity: number, reason: string, notes?: string) => Promise<void>;
  saveProduct: (product: ProductItem) => Promise<void>;

  // Inventory, Suppliers & Purchases (CxP)
  inventory: InventoryItem[];
  inventoryMovements: InventoryMovement[];
  suppliers: Supplier[];
  saveSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt'> & { id?: string }) => Promise<void>;
  purchases: PurchaseRecord[];
  addPurchase: (
    purchase: Omit<PurchaseRecord, 'id' | 'createdAt' | 'registeredBy'>
  ) => Promise<void>;
  recordCreditPurchasePayment: (
    purchaseId: string,
    amount: number,
    method: 'efectivo' | 'transferencia' | 'tarjeta',
    paidFromCashRegister: boolean,
    notes?: string
  ) => Promise<void>;
  updateInventoryStock: (itemId: string, newStock: number, reason: string) => Promise<void>;

  // Expenses
  expenses: OperatingExpense[];
  addExpense: (expense: Omit<OperatingExpense, 'id' | 'createdAt' | 'status'>) => Promise<void>;
  markExpensePaid: (expenseId: string, method: PaymentMethod, fromCash: boolean) => Promise<void>;

  // Audit Logs
  auditLogs: AuditLog[];
  addAuditLog: (
    action: string,
    collectionName: string,
    documentId: string,
    reason: string,
    details?: string
  ) => Promise<void>;

  // Backup and Restore
  exportDataBackup: () => string;
  previewDataBackup: (backupJson: string) => BackupValidationResult;
  restoreDataBackup: (
    backupJson: string
  ) => Promise<{ success: boolean; message: string; count: number }>;

  // Offline Status & Multi-Device Sync
  isOnline: boolean;
  pendingOfflineCount: number;
  syncOfflineQueue: () => Promise<void>;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

export const POSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, appUser, role, isAdmin, isCocina } = useAuth();

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingOfflineCount, setPendingOfflineCount] = useState<number>(0);

  // Operational Config
  const [restaurantConfig, setRestaurantConfig] = useState<RestaurantConfig>(
    DEFAULT_RESTAURANT_CONFIG
  );

  // Catalog & Tables
  const [tables, setTables] = useState<RestaurantTable[]>(INITIAL_TABLES);
  const [categories, setCategories] = useState<ProductCategory[]>(INITIAL_CATEGORIES);
  const [products, setProducts] = useState<ProductItem[]>(INITIAL_PRODUCTS);
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);

  // Orders & KDS
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [kitchenOrders, setKitchenOrders] = useState<KitchenOrderProjection[]>([]);
  const [currentOrder, setCurrentOrder] = useState<RestaurantOrder | null>(null);

  // Tickets & Payments
  const [kitchenTickets, setKitchenTickets] = useState<KitchenTicket[]>([]);
  const [activeTicketToPrint, setActiveTicketToPrint] = useState<KitchenTicket | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  // Cash Registers (NO automatic ₡50,000 open shift!)
  const todayCR = getCostaRicaDateString();
  const [cashRegistersHistory, setCashRegistersHistory] = useState<CashRegister[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);

  // Derived active & stale cash registers
  const openRegisters = cashRegistersHistory.filter(r => r.status === 'open');
  const activeCashRegister =
    openRegisters.find(r => r.date === todayCR) || openRegisters[0] || null;
  const staleOpenRegisters = openRegisters.filter(r => r.date < todayCR);
  const hasOpenCashRegister = Boolean(activeCashRegister && activeCashRegister.status === 'open');
  const cashRegister: CashRegister =
    activeCashRegister ||
    cashRegistersHistory.find(r => r.date === todayCR) ||
    CLOSED_PLACEHOLDER_REGISTER(todayCR);

  // Recipes & Formulas
  const [recipes, setRecipes] = useState<Recipe[]>(INITIAL_RECIPES);
  const [recipeFormulas, setRecipeFormulas] = useState<RecipeFormulaDoc[]>([]);

  // Admin Collections
  const [inventory, setInventory] = useState<InventoryItem[]>(INITIAL_INVENTORY_ITEMS);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [expenses, setExpenses] = useState<OperatingExpense[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);


  const getActorName = useCallback(
    () => appUser?.displayName || currentUser?.email || 'Operador',
    [appUser, currentUser]
  );

  // ------------------------------------------------------------------------
  // AUDIT LOG HELPER
  // ------------------------------------------------------------------------
  const addAuditLog = useCallback(
    async (
      action: string,
      collectionName: string,
      documentId: string,
      reason: string,
      details?: string
    ) => {
      if (!currentUser || isCocina) return;
      const logId = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const entry: AuditLog = {
        id: logId,
        action,
        collection: collectionName,
        documentId,
        reason,
        performedBy: getActorName(),
        performedByUid: currentUser.uid,
        performedByEmail: currentUser.email || '',
        timestamp: new Date().toISOString(),
        details,
      };
      try {
        await setDoc(doc(db, 'audit_logs', logId), sanitizeForFirestore(entry));
      } catch (err) {
        console.warn('No se pudo registrar auditoría:', err);
      }
    },
    [currentUser, isCocina, getActorName]
  );

  // ------------------------------------------------------------------------
  // ROLE-SCOPED & BOUNDED FIRESTORE SUBSCRIPTIONS
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (!currentUser || !role) return;

    const unsubs: Array<() => void> = [];

    // 1. Restaurant Config (all active roles)
    unsubs.push(
      onSnapshot(
        doc(db, 'restaurant_config', 'main'),
        snap => {
          if (snap.exists()) {
            setRestaurantConfig({
              ...DEFAULT_RESTAURANT_CONFIG,
              ...(snap.data() as Partial<RestaurantConfig>),
            });
          }
        },
        err => console.warn('Config listener:', err)
      )
    );

    // 2. Sanitized Kitchen Orders (all active roles — primary feed for Cocina KDS!)
    unsubs.push(
      onSnapshot(
        query(collection(db, 'kitchen_orders'), orderBy('authorizedAt', 'desc'), limit(80)),
        snap => {
          const list = snap.docs.map(d => d.data() as KitchenOrderProjection);
          setKitchenOrders(list);
        },
        err => console.warn('Kitchen orders listener:', err)
      )
    );

    // STRICT ISOLATION: Cocina role stops here (zero reads to orders, cash, costs, or admin collections!)
    if (role === 'cocina') {
      return () => unsubs.forEach(u => u());
    }

    // 3. Staff & Admin Operational Listeners (all bounded)
    unsubs.push(
      onSnapshot(collection(db, 'categories'), snap => {
        if (!snap.empty) {
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ProductCategory, 'id'>) }));
          list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          setCategories(list);
        }
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'products'), snap => {
        if (!snap.empty) {
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ProductItem, 'id'>) }));
          setProducts(list);
        }
      })
    );

    unsubs.push(
      onSnapshot(collection(db, 'tables'), snap => {
        if (!snap.empty) {
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<RestaurantTable, 'id'>) }));
          list.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
          setTables(list);
        }
      })
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(250)),
        snap => {
          const list = snap.docs.map(d => {
            const raw = d.data() as RestaurantOrder;
            return {
              ...raw,
              id: d.id,
              operationalStatus: resolveOperationalStatus(raw),
              financialStatus: resolveFinancialStatus(raw),
            };
          });
          setOrders(list);
        },
        err => console.warn('Orders listener:', err)
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'payments'), orderBy('createdAt', 'desc'), limit(250)),
        snap => {
          setPayments(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<PaymentRecord, 'id'>) })));
        },
        err => console.warn('Payments listener:', err)
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'kitchen_tickets'), orderBy('printedAt', 'desc'), limit(100)),
        snap => {
          setKitchenTickets(
            snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<KitchenTicket, 'id'>) }))
          );
        },
        err => console.warn('Tickets listener:', err)
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'cash_registers'), orderBy('openedAt', 'desc'), limit(30)),
        snap => {
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<CashRegister, 'id'>) }));
          setCashRegistersHistory(list);
        },
        err => console.warn('Cash registers listener:', err)
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'cash_movements'), orderBy('createdAt', 'desc'), limit(200)),
        snap => {
          setCashMovements(
            snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<CashMovement, 'id'>) }))
          );
        },
        err => console.warn('Cash movements listener:', err)
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'recipe_formulas'),
        snap => {
          setRecipeFormulas(
            snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<RecipeFormulaDoc, 'id'>) }))
          );
        },
        err => console.warn('Recipe formulas listener:', err)
      )
    );

    // 4. Strictly Admin-Only Collections (Costs, Inventory, Purchases, Suppliers, Expenses, Audit)
    if (isAdmin) {
      unsubs.push(
        onSnapshot(collection(db, 'inventory_items'), snap => {
          if (!snap.empty) {
            setInventory(
              snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<InventoryItem, 'id'>) }))
            );
          }
        })
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, 'inventory_movements'), orderBy('createdAt', 'desc'), limit(200)),
          snap => {
            setInventoryMovements(
              snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<InventoryMovement, 'id'>) }))
            );
          }
        )
      );

      unsubs.push(
        onSnapshot(collection(db, 'recipes'), snap => {
          if (!snap.empty) {
            setRecipes(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Recipe, 'id'>) })));
          }
        })
      );

      unsubs.push(
        onSnapshot(collection(db, 'suppliers'), snap => {
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Supplier, 'id'>) }));
          list.sort((a, b) => a.name.localeCompare(b.name));
          setSuppliers(list);
        })
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, 'purchases'), orderBy('createdAt', 'desc'), limit(200)),
          snap => {
            setPurchases(
              snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<PurchaseRecord, 'id'>) }))
            );
          }
        )
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, 'operating_expenses'), orderBy('dueDate', 'asc'), limit(200)),
          snap => {
            setExpenses(
              snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<OperatingExpense, 'id'>) }))
            );
          }
        )
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(200)),
          snap => {
            setAuditLogs(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AuditLog, 'id'>) })));
          }
        )
      );
    }

    return () => unsubs.forEach(u => u());
  }, [currentUser, role, isAdmin]);

  // ------------------------------------------------------------------------
  // SAFE INITIAL SEEDING FOR EMPTY FRESH WORKSPACE (Admin only, NEVER overwrites real data)
  // ------------------------------------------------------------------------
  const seededRef = useRef(false);
  useEffect(() => {
    if (!currentUser || !isAdmin || seededRef.current) return;
    seededRef.current = true;

    (async () => {
      try {
        const [catSnap, prodSnap, tblSnap] = await Promise.all([
          getDocs(query(collection(db, 'categories'), limit(1))),
          getDocs(query(collection(db, 'products'), limit(1))),
          getDocs(query(collection(db, 'tables'), limit(1))),
        ]);

        const batch = writeBatch(db);
        let hasWrites = false;

        if (catSnap.empty) {
          INITIAL_CATEGORIES.forEach(c => {
            batch.set(doc(db, 'categories', c.id), sanitizeForFirestore(c));
          });
          hasWrites = true;
        }
        if (prodSnap.empty) {
          INITIAL_PRODUCTS.forEach(p => {
            batch.set(doc(db, 'products', p.id), sanitizeForFirestore(p));
          });
          hasWrites = true;
        }
        if (tblSnap.empty) {
          INITIAL_TABLES.forEach(t => {
            batch.set(
              doc(db, 'tables', t.id),
              sanitizeForFirestore(t)
            );
          });
          hasWrites = true;
        }

        if (hasWrites) {
          await batch.commit();
        }
      } catch (err) {
        console.warn('Seed inicial omitido o sin cambios:', err);
      }
    })();
  }, [currentUser, isAdmin]);

  // Sync admin read-only snapshot for Jarvis / AI endpoints (explicitly no cached token on server!)
  useEffect(() => {
    if (!currentUser || !isAdmin || !isOnline) return;
    const timer = setTimeout(async () => {
      try {
        const token = await currentUser.getIdToken();
        await fetch('/api/ai/sync-snapshot', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            inventory_items: inventory,
            inventory_movements: inventoryMovements,
            orders,
            purchases,
            operating_expenses: expenses,
          }),
        });
      } catch {
        // Non-blocking
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [currentUser, isAdmin, isOnline, inventory, inventoryMovements, orders, purchases, expenses]);

  // ------------------------------------------------------------------------
  // OFFLINE QUEUE SYNCHRONIZATION
  // ------------------------------------------------------------------------
  const syncOfflineQueue = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (!currentUser || isCocina) return;

    const [queuedOrders, queuedMutations] = await Promise.all([
      getOfflineOrders(),
      getOfflineMutations(),
    ]);

    for (const qOrder of queuedOrders) {
      try {
        const { _offlineSyncPending, _offlineUserId, _offlineDeviceId, _offlineSavedAt, ...clean } =
          qOrder as any;
        await setDoc(doc(db, 'orders', clean.id), sanitizeForFirestore(clean), { merge: true });
        await removeOfflineOrder(clean.id);
      } catch (err) {
        console.warn('Error sincronizando orden offline:', err);
      }
    }

    for (const mut of queuedMutations) {
      try {
        if (mut.status === 'conflict') continue;
        await updateOfflineMutationStatus(mut.id, 'syncing');
        if (mut.type === 'set') {
          await setDoc(doc(db, mut.collection, mut.docId), sanitizeForFirestore(mut.payload), {
            merge: true,
          });
          await removeOfflineMutation(mut.id);
        } else if (mut.type === 'update') {
          await updateDoc(doc(db, mut.collection, mut.docId), sanitizeForFirestore(mut.payload));
          await removeOfflineMutation(mut.id);
        } else if (mut.type === 'payment_transaction') {
          const payload = mut.payload as {
            orderId: string;
            registerId?: string;
            payments: PaymentRecord[];
            finalPaymentMethod?: PaymentMethod;
          };
          const targetRegisterId =
            payload.registerId || payload.payments?.[0]?.registerId || activeCashRegister?.id;
          if (!payload.orderId || !targetRegisterId || !Array.isArray(payload.payments) || payload.payments.length === 0) {
            await updateOfflineMutationStatus(mut.id, 'conflict', 'Datos de pago offline incompletos para conciliación.');
            continue;
          }

          await runTransaction(db, async tx => {
            const orderRef = doc(db, 'orders', payload.orderId);
            const regRef = doc(db, 'cash_registers', targetRegisterId);
            const payRefs = payload.payments.map(p => doc(db, 'payments', p.id));

            const [orderSnap, regSnap, ...paySnaps] = await Promise.all([
              tx.get(orderRef),
              tx.get(regRef),
              ...payRefs.map(ref => tx.get(ref)),
            ]);

            if (!orderSnap.exists()) {
              throw new Error('CONFLICT: La orden ya no existe en Firestore.');
            }
            const liveOrder = orderSnap.data() as RestaurantOrder;
            const regData = regSnap.exists() ? (regSnap.data() as CashRegister) : undefined;
            const existingIds = new Set<string>();
            paySnaps.forEach((snap, idx) => {
              if (snap.exists()) existingIds.add(payload.payments[idx].id);
            });

            const evalRes = evaluateTransactionalPayment({
              liveOrder,
              registerStatus: regData?.status,
              existingPaymentIds: existingIds,
              incomingPayments: payload.payments,
            });

            if (!evalRes.ok) {
              throw new Error(`CONFLICT: ${evalRes.error}`);
            }
            if (evalRes.idempotentReplay || !regData) {
              return;
            }

            const nowIso = new Date().toISOString();
            for (const pay of evalRes.paymentsToWrite) {
              tx.set(doc(db, 'payments', pay.id), sanitizeForFirestore(pay));
              const movId = `cm_sale_${pay.id}`;
              tx.set(
                doc(db, 'cash_movements', movId),
                sanitizeForFirestore({
                  id: movId,
                  registerId: targetRegisterId,
                  type: 'sale',
                  amount: pay.amount,
                  paymentMethod: pay.method,
                  referenceId: payload.orderId,
                  description: `Cobro offline sincronizado ${liveOrder.orderNumber} (${pay.method.toUpperCase()})`,
                  performedBy: pay.performedBy || getActorName(),
                  createdAt: pay.createdAt || nowIso,
                })
              );
            }

            const nextReg: CashRegister = {
              ...regData,
              cashSales: (regData.cashSales || 0) + evalRes.addCash,
              sinpeSales: (regData.sinpeSales || 0) + evalRes.addSinpe,
              cardSales: (regData.cardSales || 0) + evalRes.addCard,
            };
            tx.update(regRef, {
              cashSales: nextReg.cashSales,
              sinpeSales: nextReg.sinpeSales,
              cardSales: nextReg.cardSales,
              expectedCash: calculateExpectedCash(nextReg),
            });

            const currentOp = resolveOperationalStatus(liveOrder);
            tx.set(
              orderRef,
              sanitizeForFirestore({
                ...liveOrder,
                paidAmount: evalRes.nextPaidTotal,
                financialStatus: evalRes.nextFinStatus,
                paymentStatus: evalRes.nextFinStatus,
                paymentMethod: payload.finalPaymentMethod || liveOrder.paymentMethod || payload.payments[0].method,
                paidAt: evalRes.isNowFullyPaid ? nowIso : liveOrder.paidAt,
                status: toLegacyOrderStatus(currentOp, evalRes.nextFinStatus),
                updatedAt: nowIso,
              }),
              { merge: true }
            );
          });

          await removeOfflineMutation(mut.id);
        } else {
          await updateOfflineMutationStatus(mut.id, 'conflict', `Tipo de mutación no reconocido: ${mut.type}`);
        }
      } catch (err: any) {
        const msg = err?.message || 'Error de sincronización';
        const nextStatus = msg.startsWith('CONFLICT:') ? 'conflict' : 'failed';
        await updateOfflineMutationStatus(mut.id, nextStatus, msg);
      }
    }

    const remaining = await getOfflinePendingCount();
    setPendingOfflineCount(remaining);
  }, [currentUser, isCocina, activeCashRegister?.id, getActorName]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    getOfflinePendingCount().then(setPendingOfflineCount).catch(() => {});

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncOfflineQueue]);

  // ------------------------------------------------------------------------
  // RESTAURANT CONFIG & CATALOG IMPORT
  // ------------------------------------------------------------------------
  const updateRestaurantConfig = async (patch: Partial<RestaurantConfig>) => {
    if (!isAdmin) throw new Error('Solo el administrador puede modificar la configuración.');
    const next: RestaurantConfig = {
      ...restaurantConfig,
      ...patch,
      updatedAt: new Date().toISOString(),
      updatedBy: getActorName(),
    };
    await setDoc(doc(db, 'restaurant_config', 'main'), sanitizeForFirestore(next), { merge: true });
    setRestaurantConfig(next);
    await addAuditLog('update_config', 'restaurant_config', 'main', 'Actualización de configuración operativa');
  };

  const importPollosKarenOfficialMenu = async (options?: { updateExistingPrices?: boolean }) => {
    if (!isAdmin) throw new Error('Solo el administrador puede importar el catálogo oficial.');
    const batch = writeBatch(db);
    let categoriesAdded = 0;
    let productsAdded = 0;
    let productsUpdated = 0;

    const existingCatIds = new Set(categories.map(c => c.id));
    const existingProdById = new Map(products.map(p => [p.id, p]));
    const existingProdByName = new Map(products.map(p => [p.name.trim().toLowerCase(), p]));

    for (const cat of POLLOS_KAREN_CATEGORIES) {
      if (!existingCatIds.has(cat.id)) {
        batch.set(doc(db, 'categories', cat.id), sanitizeForFirestore(cat));
        categoriesAdded += 1;
      }
    }

    const nowIso = new Date().toISOString();
    for (const prod of POLLOS_KAREN_PRODUCTS) {
      const match =
        existingProdById.get(prod.id) || existingProdByName.get(prod.name.trim().toLowerCase());
      if (!match) {
        batch.set(
          doc(db, 'products', prod.id),
          sanitizeForFirestore({ ...prod, updatedAt: nowIso })
        );
        productsAdded += 1;
      } else if (options?.updateExistingPrices && match.price !== prod.price) {
        batch.update(
          doc(db, 'products', match.id),
          sanitizeForFirestore({
            price: prod.price,
            description: prod.description || match.description,
            breakfastOnly: prod.breakfastOnly,
            dayOfWeek: prod.dayOfWeek,
            updatedAt: nowIso,
          })
        );
        productsUpdated += 1;
      }
    }

    if (categoriesAdded > 0 || productsAdded > 0 || productsUpdated > 0) {
      await batch.commit();
      await addAuditLog(
        'save_product',
        'products',
        POLLOS_KAREN_PRODUCTS[0].id,
        'Importación revisada de catálogo oficial Pollos Karen',
        `Categorías nuevas: ${categoriesAdded}, Productos nuevos: ${productsAdded}, Precios actualizados: ${productsUpdated}`
      );
    }

    return { categoriesAdded, productsAdded, productsUpdated };
  };

  // ------------------------------------------------------------------------
  // TABLES MANAGEMENT
  // ------------------------------------------------------------------------
  const selectTable = (table: RestaurantTable | null) => setSelectedTable(table);

  const updateTableStatus = async (
    tableId: string,
    status: RestaurantTable['status'],
    currentOrderId?: string | null
  ) => {
    const payload: Record<string, any> = {
      status,
      updatedAt: new Date().toISOString(),
    };
    if (currentOrderId !== undefined) {
      payload.currentOrderId = currentOrderId || null;
    }
    await updateDoc(doc(db, 'tables', tableId), sanitizeForFirestore(payload));
  };

  const addTable = async (
    name: string,
    number: number,
    type: 'table' | 'bar',
    seats: number
  ) => {
    if (!isAdmin) throw new Error('Solo el administrador puede agregar mesas.');
    const id = `${type === 'bar' ? 'barra' : 'mesa'}-${number}-${Date.now().toString(36).slice(-3)}`;
    const newTable: RestaurantTable = {
      id,
      name: name.trim(),
      number,
      type,
      seats,
      active: true,
      status: 'libre',
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'tables', id), sanitizeForFirestore(newTable));
    await addAuditLog('create', 'tables', id, `Creación de mesa/barra: ${name}`);
  };

  const toggleTableActive = async (tableId: string) => {
    if (!isAdmin) throw new Error('Solo el administrador puede habilitar o deshabilitar mesas.');
    const tbl = tables.find(t => t.id === tableId);
    if (!tbl) return;
    await updateDoc(doc(db, 'tables', tableId), {
      active: !tbl.active,
      updatedAt: new Date().toISOString(),
    });
    await addAuditLog('toggle_active', 'tables', tableId, `Mesa ${tbl.name} -> ${!tbl.active ? 'Activa' : 'Inactiva'}`);
  };

  // ------------------------------------------------------------------------
  // DELTA INVENTORY DEDUCTION (RESPECTS yieldPortions + convertToInventoryUnit)
  // ------------------------------------------------------------------------
  const deductInventoryDeltaForOrder = async (
    order: RestaurantOrder
  ): Promise<OrderLineItem[]> => {
    const nowIso = new Date().toISOString();
    const updatedItems: OrderLineItem[] = [];
    const consumptionDeltas = new Map<
      string,
      { itemId: string; itemName: string; deltaQty: number; unit: string }
    >();

    for (const item of order.items) {
      const alreadyDeducted = Number(item.deductedQuantity || 0);
      const pendingQty = item.quantity - alreadyDeducted;
      let historicalUnitCost = item.historicalUnitCost;

      if (pendingQty > 0) {
        // Match admin Recipe (with cost) OR zero-cost RecipeFormula (for Colaborador)
        const adminRecipe = isAdmin
          ? recipes.find(
              r =>
                r.productId === item.productId &&
                (!r.protein || r.protein === item.selectedProtein)
            )
          : undefined;

        const formula = !adminRecipe
          ? recipeFormulas.find(
              f =>
                f.productId === item.productId &&
                (!f.protein || f.protein === item.selectedProtein)
            )
          : undefined;

        if (adminRecipe && adminRecipe.autoDeductEnabled) {
          historicalUnitCost = adminRecipe.calculatedCost;
          for (const ing of adminRecipe.ingredients) {
            const invItem = inventory.find(i => i.id === ing.itemId);
            if (!invItem) continue;
            const calc = calculateIngredientConsumption(
              pendingQty,
              adminRecipe.yieldPortions || 1,
              ing.quantity,
              ing.unit,
              invItem.unit
            );
            if (!calc.compatible || calc.deductedQty <= 0) continue;
            const cur = consumptionDeltas.get(invItem.id) || {
              itemId: invItem.id,
              itemName: invItem.name,
              deltaQty: 0,
              unit: invItem.unit,
            };
            cur.deltaQty = Math.round((cur.deltaQty + calc.deductedQty) * 10000) / 10000;
            consumptionDeltas.set(invItem.id, cur);
          }
        } else if (formula && formula.autoDeductEnabled) {
          for (const ing of formula.ingredients) {
            const calc = calculateIngredientConsumption(
              pendingQty,
              formula.yieldPortions || 1,
              ing.quantity,
              normalizeUnitString(ing.unit),
              normalizeUnitString(ing.inventoryUnit)
            );
            if (!calc.compatible || calc.deductedQty <= 0) continue;
            const cur = consumptionDeltas.get(ing.itemId) || {
              itemId: ing.itemId,
              itemName: ing.itemName,
              deltaQty: 0,
              unit: ing.inventoryUnit,
            };
            cur.deltaQty = Math.round((cur.deltaQty + calc.deductedQty) * 10000) / 10000;
            consumptionDeltas.set(ing.itemId, cur);
          }
        }
      }

      updatedItems.push({
        ...item,
        deductedQuantity: Math.max(alreadyDeducted, item.quantity),
        historicalUnitCost,
      });
    }

    if (consumptionDeltas.size > 0 && isOnline) {
      const batch = writeBatch(db);
      for (const delta of consumptionDeltas.values()) {
        batch.update(doc(db, 'inventory_items', delta.itemId), {
          currentStock: increment(-delta.deltaQty),
          updatedAt: nowIso,
        });
        const invItem = isAdmin ? inventory.find(i => i.id === delta.itemId) : undefined;
        const prevStock = invItem ? Number(invItem.currentStock) : 0;
        const movId = `inv_cons_${order.id}_${delta.itemId}_${Date.now().toString(36)}`;
        batch.set(
          doc(db, 'inventory_movements', movId),
          sanitizeForFirestore({
            id: movId,
            itemId: delta.itemId,
            itemName: delta.itemName,
            type: 'consumption',
            quantity: delta.deltaQty,
            previousStock: prevStock,
            newStock: isAdmin ? Math.round((prevStock - delta.deltaQty) * 1000) / 1000 : 0,
            reason: `Consumo automático orden ${order.orderNumber}`,
            referenceId: order.id,
            performedBy: getActorName(),
            createdAt: nowIso,
          })
        );
      }
      try {
        await batch.commit();
      } catch (err) {
        console.warn('Error aplicando descuento de inventario delta:', err);
      }
    }

    return updatedItems;
  };

  // ------------------------------------------------------------------------
  // ORDER CREATION & LOCAL DRAFT EDITING
  // ------------------------------------------------------------------------
  const recalculateDraft = useCallback(
    (order: RestaurantOrder): RestaurantOrder => {
      const totals = calculateOrderTotalsDetailed(order.items, order.serviceType, {
        tableServicePercent: restaurantConfig.tableServicePercent,
        expressDeliveryFee:
          order.serviceType === 'expres'
            ? order.deliveryDetails?.deliveryFee ?? restaurantConfig.expressDeliveryFee
            : 0,
        discount: order.discount || 0,
      });
      return {
        ...order,
        subtotal: totals.subtotal,
        serviceCharge: totals.serviceCharge,
        deliveryFee: totals.deliveryFee,
        discount: totals.discount,
        total: totals.total,
        updatedAt: new Date().toISOString(),
      };
    },
    [restaurantConfig]
  );

  const createNewOrder = (serviceType: ServiceType, table?: RestaurantTable): RestaurantOrder => {
    const nowIso = new Date().toISOString();
    const newOrd: RestaurantOrder = recalculateDraft({
      id: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orderNumber: generateOrderNumber(serviceType, orders.length + 1),
      serviceType,
      tableId: table?.id,
      tableName: table?.name,
      items: [],
      status: 'pending',
      operationalStatus: 'pending_auth',
      financialStatus: 'unpaid',
      paymentStatus: 'unpaid',
      paidAmount: 0,
      subtotal: 0,
      serviceCharge: 0,
      deliveryFee: serviceType === 'expres' ? restaurantConfig.expressDeliveryFee : 0,
      discount: 0,
      total: 0,
      operationalDate: getCostaRicaDateString(),
      source: 'pos',
      createdBy: getActorName(),
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    setCurrentOrder(newOrd);
    return newOrd;
  };

  const addItemToCurrentOrder = (
    product: ProductItem,
    protein?: CasadoProtein,
    notes?: string
  ) => {
    setCurrentOrder(prev => {
      if (!prev) return prev;
      const cleanNotes = notes?.trim() || undefined;
      const existingIdx = prev.items.findIndex(
        it =>
          it.productId === product.id &&
          it.selectedProtein === protein &&
          (it.notes || '') === (cleanNotes || '')
      );

      let nextItems: OrderLineItem[];
      if (existingIdx >= 0) {
        nextItems = prev.items.map((it, idx) =>
          idx === existingIdx
            ? {
                ...it,
                quantity: it.quantity + 1,
                subtotal: (it.quantity + 1) * it.price,
              }
            : it
        );
      } else {
        const line: OrderLineItem = {
          id: `line_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
          isCasado: Boolean(product.isCasado || protein),
          selectedProtein: protein,
          notes: cleanNotes,
          subtotal: product.price,
          deductedQuantity: 0,
        };
        nextItems = [...prev.items, line];
      }

      return recalculateDraft({ ...prev, items: nextItems });
    });
  };

  const updateOrderItemQuantity = (lineItemId: string, delta: number) => {
    setCurrentOrder(prev => {
      if (!prev) return prev;
      const nextItems = prev.items
        .map(it => {
          if (it.id !== lineItemId) return it;
          const nextQty = it.quantity + delta;
          if (nextQty <= 0) return null;
          return { ...it, quantity: nextQty, subtotal: nextQty * it.price };
        })
        .filter(Boolean) as OrderLineItem[];
      return recalculateDraft({ ...prev, items: nextItems });
    });
  };

  const removeOrderItem = (lineItemId: string) => {
    setCurrentOrder(prev => {
      if (!prev) return prev;
      const nextItems = prev.items.filter(it => it.id !== lineItemId);
      return recalculateDraft({ ...prev, items: nextItems });
    });
  };

  const setOrderObservations = (observations: string) => {
    setCurrentOrder(prev => (prev ? { ...prev, observations } : prev));
  };

  const setOrderDeliveryDetails = (details: DeliveryDetails | undefined) => {
    setCurrentOrder(prev => {
      if (!prev) return prev;
      return recalculateDraft({ ...prev, deliveryDetails: details });
    });
  };

  const setOrderDiscount = (discount: number, reason?: string) => {
    setCurrentOrder(prev => {
      if (!prev) return prev;
      const safeDiscount = Math.max(0, Number(discount) || 0);
      return recalculateDraft({
        ...prev,
        discount: safeDiscount,
        discountReason: reason?.trim() || prev.discountReason,
      });
    });
  };

  // ------------------------------------------------------------------------
  // SAVE ORDER & AUTHORIZE TO KITCHEN (KDS)
  // ------------------------------------------------------------------------
  const saveActiveOrder = async (options?: {
    authorizeToKitchen?: boolean;
  }): Promise<{ success: boolean; order?: RestaurantOrder; error?: string }> => {
    if (!currentOrder) return { success: false, error: 'No hay una orden activa.' };
    if (currentOrder.items.length === 0) {
      return { success: false, error: 'Debe agregar al menos un producto a la orden.' };
    }

    if (currentOrder.serviceType === 'expres' && currentOrder.deliveryDetails) {
      if (!currentOrder.deliveryDetails.withinCoverageRadius) {
        return {
          success: false,
          error: 'El pedido exprés requiere confirmación de cobertura dentro del radio de 1 km en La Uruca.',
        };
      }
    }

    const authorizeNow = options?.authorizeToKitchen ?? true;
    const nowIso = new Date().toISOString();
    const existingOrder = orders.find(o => o.id === currentOrder.id);
    const currentOpStatus = resolveOperationalStatus(currentOrder);
    const nextOpStatus: OperationalOrderStatus =
      authorizeNow && currentOpStatus === 'pending_auth' ? 'authorized' : currentOpStatus;

    let orderToSave: RestaurantOrder = recalculateDraft({
      ...currentOrder,
      operationalStatus: nextOpStatus,
      financialStatus: resolveFinancialStatus(currentOrder),
      status: toLegacyOrderStatus(nextOpStatus, resolveFinancialStatus(currentOrder)),
      authorizedAt:
        nextOpStatus === 'authorized' && !currentOrder.authorizedAt
          ? nowIso
          : currentOrder.authorizedAt,
      updatedAt: nowIso,
      changeHistory: [
        ...(currentOrder.changeHistory || []),
        {
          timestamp: nowIso,
          user: getActorName(),
          action: existingOrder ? 'Orden actualizada' : 'Orden creada y enviada',
        },
      ],
    });

    // Trigger delta inventory deduction if configured for kitchen authorization
    if (
      authorizeNow &&
      restaurantConfig.inventoryDeductionTrigger === 'kitchen_auth' &&
      isOnline
    ) {
      const updatedItems = await deductInventoryDeltaForOrder(orderToSave);
      orderToSave = {
        ...orderToSave,
        items: updatedItems,
        inventoryDeducted: true,
        inventoryDeductedAt: nowIso,
      };
    }

    if (!isOnline) {
      await saveOfflineOrder(orderToSave, currentUser?.uid);
      setPendingOfflineCount(await getOfflinePendingCount());
      setOrders(prev => [orderToSave, ...prev.filter(o => o.id !== orderToSave.id)]);
      setCurrentOrder(orderToSave);
      return { success: true, order: orderToSave };
    }

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'orders', orderToSave.id), sanitizeForFirestore(orderToSave), {
        merge: true,
      });

      if (nextOpStatus !== 'pending_auth' && nextOpStatus !== 'cancelled') {
        const projection = buildKitchenProjection(orderToSave, nextOpStatus);
        batch.set(doc(db, 'kitchen_orders', orderToSave.id), sanitizeForFirestore(projection), {
          merge: true,
        });
      }

      if (orderToSave.serviceType === 'mesa' && orderToSave.tableId) {
        batch.update(doc(db, 'tables', orderToSave.tableId), {
          status:
            orderToSave.financialStatus === 'paid' && nextOpStatus === 'delivered'
              ? 'libre'
              : 'activa',
          currentOrderId:
            orderToSave.financialStatus === 'paid' && nextOpStatus === 'delivered'
              ? null
              : orderToSave.id,
          updatedAt: nowIso,
        });
      }

      await batch.commit();
      setCurrentOrder(orderToSave);
      return { success: true, order: orderToSave };
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, `orders/${orderToSave.id}`);
      return { success: false, error: 'Error guardando la orden en Firestore.' };
    }
  };

  const authorizeOrderToKitchen = async (
    orderId: string
  ): Promise<{ success: boolean; error?: string }> => {
    const target = orders.find(o => o.id === orderId);
    if (!target) return { success: false, error: 'Orden no encontrada.' };

    const nowIso = new Date().toISOString();
    let updatedItems = target.items;
    if (restaurantConfig.inventoryDeductionTrigger === 'kitchen_auth') {
      updatedItems = await deductInventoryDeltaForOrder(target);
    }

    const updatedOrder: RestaurantOrder = {
      ...target,
      items: updatedItems,
      operationalStatus: 'authorized',
      status: 'in_kitchen',
      authorizedAt: nowIso,
      inventoryDeducted:
        restaurantConfig.inventoryDeductionTrigger === 'kitchen_auth'
          ? true
          : target.inventoryDeducted,
      inventoryDeductedAt:
        restaurantConfig.inventoryDeductionTrigger === 'kitchen_auth'
          ? nowIso
          : target.inventoryDeductedAt,
      updatedAt: nowIso,
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'orders', orderId), sanitizeForFirestore(updatedOrder), { merge: true });
    batch.set(
      doc(db, 'kitchen_orders', orderId),
      sanitizeForFirestore(buildKitchenProjection(updatedOrder, 'authorized')),
      { merge: true }
    );
    await batch.commit();

    return { success: true };
  };

  const updateKitchenOrderStatus = async (
    orderId: string,
    nextStatus: 'in_preparation' | 'ready'
  ) => {
    const nowIso = new Date().toISOString();
    const kitchenPatch: Record<string, any> = {
      operationalStatus: nextStatus,
      updatedAt: nowIso,
    };
    if (nextStatus === 'in_preparation') kitchenPatch.startedAt = nowIso;
    if (nextStatus === 'ready') kitchenPatch.readyAt = nowIso;

    // Cocina ONLY writes to /kitchen_orders/{orderId} (strictly isolated from /orders)
    if (isCocina) {
      await updateDoc(doc(db, 'kitchen_orders', orderId), sanitizeForFirestore(kitchenPatch));
      return;
    }

    const batch = writeBatch(db);
    batch.update(doc(db, 'kitchen_orders', orderId), sanitizeForFirestore(kitchenPatch));
    batch.update(
      doc(db, 'orders', orderId),
      sanitizeForFirestore({
        operationalStatus: nextStatus,
        status: nextStatus === 'ready' ? 'served' : 'in_kitchen',
        ...(nextStatus === 'in_preparation' ? { startedAt: nowIso } : { readyAt: nowIso }),
        updatedAt: nowIso,
      })
    );
    await batch.commit();

  };

  const markOrderDelivered = async (orderId: string) => {
    const target = orders.find(o => o.id === orderId);
    if (!target) return;
    const nowIso = new Date().toISOString();
    const finStatus = resolveFinancialStatus(target);

    const batch = writeBatch(db);
    batch.update(
      doc(db, 'orders', orderId),
      sanitizeForFirestore({
        operationalStatus: 'delivered',
        status: finStatus === 'paid' ? 'completed' : 'served',
        deliveredAt: nowIso,
        updatedAt: nowIso,
      })
    );
    batch.set(
      doc(db, 'kitchen_orders', orderId),
      sanitizeForFirestore({
        operationalStatus: 'delivered',
        updatedAt: nowIso,
      }),
      { merge: true }
    );

    if (target.serviceType === 'mesa' && target.tableId && finStatus === 'paid') {
      batch.update(doc(db, 'tables', target.tableId), {
        status: 'libre',
        currentOrderId: null,
        updatedAt: nowIso,
      });
    }

    await batch.commit();

  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    if (status === 'in_kitchen') {
      await authorizeOrderToKitchen(orderId);
      return;
    }
    if (status === 'served') {
      await updateKitchenOrderStatus(orderId, 'ready');
      return;
    }
    if (status === 'completed') {
      await markOrderDelivered(orderId);
      return;
    }
    await updateDoc(doc(db, 'orders', orderId), {
      status,
      updatedAt: new Date().toISOString(),
    });
  };

  // ------------------------------------------------------------------------
  // TABLE OPERATIONS: TRANSFER, MERGE, SPLIT BILL
  // ------------------------------------------------------------------------
  const transferTableOrder = async (
    orderId: string,
    targetTableId: string
  ): Promise<{ success: boolean; error?: string }> => {
    const order = orders.find(o => o.id === orderId);
    const targetTable = tables.find(t => t.id === targetTableId);
    if (!order || !targetTable) return { success: false, error: 'Orden o mesa destino no válida.' };
    if (targetTable.status !== 'libre') {
      return { success: false, error: `La mesa ${targetTable.name} ya está ocupada.` };
    }

    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);
    if (order.tableId) {
      batch.update(doc(db, 'tables', order.tableId), {
        status: 'libre',
        currentOrderId: null,
        updatedAt: nowIso,
      });
    }
    batch.update(doc(db, 'tables', targetTable.id), {
      status: 'activa',
      currentOrderId: order.id,
      updatedAt: nowIso,
    });
    batch.update(doc(db, 'orders', order.id), {
      tableId: targetTable.id,
      tableName: targetTable.name,
      updatedAt: nowIso,
    });
    batch.set(
      doc(db, 'kitchen_orders', order.id),
      { tableName: targetTable.name, updatedAt: nowIso },
      { merge: true }
    );
    await batch.commit();
    return { success: true };
  };

  const mergeTableOrders = async (
    sourceOrderId: string,
    targetOrderId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (sourceOrderId === targetOrderId) {
      return { success: false, error: 'Seleccione dos órdenes distintas.' };
    }
    const source = orders.find(o => o.id === sourceOrderId);
    const target = orders.find(o => o.id === targetOrderId);
    if (!source || !target) return { success: false, error: 'Órdenes no encontradas.' };
    if (resolveFinancialStatus(source) === 'paid' || resolveFinancialStatus(target) === 'paid') {
      return { success: false, error: 'No se pueden fusionar órdenes ya pagadas.' };
    }

    const nowIso = new Date().toISOString();
    const mergedItems = [...target.items, ...source.items];
    const recalculated = recalculateDraft({
      ...target,
      items: mergedItems,
      observations: [target.observations, source.observations].filter(Boolean).join(' | ') || undefined,
      updatedAt: nowIso,
    });

    const batch = writeBatch(db);
    batch.set(doc(db, 'orders', target.id), sanitizeForFirestore(recalculated), { merge: true });
    batch.set(
      doc(db, 'kitchen_orders', target.id),
      sanitizeForFirestore(buildKitchenProjection(recalculated, resolveOperationalStatus(recalculated))),
      { merge: true }
    );
    batch.update(doc(db, 'orders', source.id), {
      status: 'cancelled',
      operationalStatus: 'cancelled',
      cancelReason: `Fusionada con orden ${target.orderNumber}`,
      cancelledAt: nowIso,
      cancelledBy: getActorName(),
      updatedAt: nowIso,
    });
    batch.set(
      doc(db, 'kitchen_orders', source.id),
      { operationalStatus: 'cancelled', updatedAt: nowIso },
      { merge: true }
    );
    if (source.tableId) {
      batch.update(doc(db, 'tables', source.tableId), {
        status: 'libre',
        currentOrderId: null,
        updatedAt: nowIso,
      });
    }
    await batch.commit();
    return { success: true };
  };

  const splitOrderItems = async (
    orderId: string,
    splitSelections: Array<{ lineItemId: string; quantity: number }>
  ): Promise<{ success: boolean; newOrder?: RestaurantOrder; error?: string }> => {
    const source = orders.find(o => o.id === orderId);
    if (!source) return { success: false, error: 'Orden original no encontrada.' };
    if (resolveFinancialStatus(source) === 'paid') {
      return { success: false, error: 'No se puede dividir una orden ya pagada.' };
    }

    const splitItems: OrderLineItem[] = [];
    const remainingItems: OrderLineItem[] = [];

    for (const item of source.items) {
      const sel = splitSelections.find(s => s.lineItemId === item.id);
      const splitQty = sel ? Math.min(Math.max(0, Math.floor(sel.quantity)), item.quantity) : 0;
      const remQty = item.quantity - splitQty;
      const origDeducted = Number(item.deductedQuantity || 0);
      const splitDeducted = Math.min(origDeducted, splitQty);
      const remDeducted = Math.max(0, origDeducted - splitDeducted);

      if (splitQty > 0) {
        splitItems.push({
          ...item,
          id: `line_sp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          quantity: splitQty,
          subtotal: splitQty * item.price,
          deductedQuantity: splitDeducted,
        });
      }
      if (remQty > 0) {
        remainingItems.push({
          ...item,
          quantity: remQty,
          subtotal: remQty * item.price,
          deductedQuantity: remDeducted,
        });
      }
    }

    if (splitItems.length === 0 || remainingItems.length === 0) {
      return {
        success: false,
        error: 'Seleccione una parte de los platillos (deben quedar ítems en ambas cuentas).',
      };
    }

    const nowIso = new Date().toISOString();
    const updatedSource = recalculateDraft({ ...source, items: remainingItems, updatedAt: nowIso });
    const newSplitOrder = recalculateDraft({
      ...source,
      id: `ord_sp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      orderNumber: `${source.orderNumber}-B`,
      items: splitItems,
      paidAmount: 0,
      financialStatus: 'unpaid',
      paymentStatus: 'unpaid',
      splitFromOrderId: source.id,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const batch = writeBatch(db);
    batch.set(doc(db, 'orders', updatedSource.id), sanitizeForFirestore(updatedSource), {
      merge: true,
    });
    batch.set(doc(db, 'orders', newSplitOrder.id), sanitizeForFirestore(newSplitOrder));
    await batch.commit();
    return { success: true, newOrder: newSplitOrder };
  };

  // ------------------------------------------------------------------------
  // ORDER CANCELLATION (ADMIN ONLY, EXPLICIT INVENTORY DISPOSITION)
  // ------------------------------------------------------------------------
  const cancelOrder = async (
    orderId: string,
    reason: string,
    inventoryDisposition: 'restored' | 'waste' | 'none' = 'none'
  ) => {
    if (!isAdmin) throw new Error('Solo el administrador puede anular órdenes.');
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Orden no encontrada.');
    if (order.status === 'cancelled') return;

    const nowIso = new Date().toISOString();
    const wasPaid = resolveFinancialStatus(order) === 'paid' || (order.paidAmount || 0) > 0;

    // 1. Update order & kitchen projection & free table
    const batch = writeBatch(db);
    batch.update(
      doc(db, 'orders', orderId),
      sanitizeForFirestore({
        status: 'cancelled',
        operationalStatus: 'cancelled',
        financialStatus: wasPaid ? 'refunded' : 'unpaid',
        paymentStatus: wasPaid ? 'refunded' : 'unpaid',
        cancelReason: reason,
        inventoryDisposition,
        cancelledAt: nowIso,
        cancelledBy: getActorName(),
        updatedAt: nowIso,
      })
    );
    batch.set(
      doc(db, 'kitchen_orders', orderId),
      { operationalStatus: 'cancelled', updatedAt: nowIso },
      { merge: true }
    );
    if (order.tableId) {
      batch.update(doc(db, 'tables', order.tableId), {
        status: 'libre',
        currentOrderId: null,
        updatedAt: nowIso,
      });
    }

    // 2. Refund confirmed payments linked to this order if any
    const orderPayments = payments.filter(p => p.orderId === orderId && p.status === 'confirmed');
    let cashToRefund = 0;
    for (const p of orderPayments) {
      batch.update(
        doc(db, 'payments', p.id),
        sanitizeForFirestore({
          status: 'refunded',
          refundedAt: nowIso,
          refundedBy: getActorName(),
          refundReason: reason,
        })
      );
      if (p.method === 'efectivo') cashToRefund += p.amount;
    }

    if (cashToRefund === 0 && wasPaid && order.paymentMethod === 'efectivo') {
      cashToRefund = order.total;
    }

    if (cashToRefund > 0 && activeCashRegister) {
      const nextRefunds = (activeCashRegister.cashRefunds || 0) + cashToRefund;
      const nextExpected = calculateExpectedCash({
        ...activeCashRegister,
        cashRefunds: nextRefunds,
      });
      batch.update(doc(db, 'cash_registers', activeCashRegister.id), {
        cashRefunds: nextRefunds,
        expectedCash: nextExpected,
      });
      const movId = `cm_ref_${orderId}_${Date.now().toString(36)}`;
      batch.set(
        doc(db, 'cash_movements', movId),
        sanitizeForFirestore({
          id: movId,
          registerId: activeCashRegister.id,
          type: 'refund',
          amount: cashToRefund,
          paymentMethod: 'efectivo',
          referenceId: orderId,
          description: `Devolución por anulación ${order.orderNumber}: ${reason}`,
          performedBy: getActorName(),
          createdAt: nowIso,
        })
      );
    }

    // 3. Explicit Inventory Disposition (NEVER blindly return cooked food to stock!)
    if (order.inventoryDeducted && inventoryDisposition !== 'none') {
      for (const item of order.items) {
        const deductedUnits = Number(item.deductedQuantity || item.quantity || 0);
        if (deductedUnits <= 0) continue;
        const rec = recipes.find(
          r => r.productId === item.productId && (!r.protein || r.protein === item.selectedProtein)
        );
        if (!rec || !rec.autoDeductEnabled) continue;

        for (const ing of rec.ingredients) {
          const invItem = inventory.find(i => i.id === ing.itemId);
          if (!invItem) continue;
          const calc = calculateIngredientConsumption(
            deductedUnits,
            rec.yieldPortions || 1,
            ing.quantity,
            ing.unit,
            invItem.unit
          );
          if (!calc.compatible || calc.deductedQty <= 0) continue;

          const movId = `inv_can_${orderId}_${invItem.id}_${Date.now().toString(36)}`;
          if (inventoryDisposition === 'restored') {
            batch.update(doc(db, 'inventory_items', invItem.id), {
              currentStock: increment(calc.deductedQty),
              updatedAt: nowIso,
            });
            batch.set(
              doc(db, 'inventory_movements', movId),
              sanitizeForFirestore({
                id: movId,
                itemId: invItem.id,
                itemName: invItem.name,
                type: 'return',
                quantity: calc.deductedQty,
                previousStock: invItem.currentStock,
                newStock: Math.round((invItem.currentStock + calc.deductedQty) * 1000) / 1000,
                reason: `Restitución por anulación sin preparar (${order.orderNumber})`,
                referenceId: orderId,
                performedBy: getActorName(),
                createdAt: nowIso,
              })
            );
          } else if (inventoryDisposition === 'waste') {
            batch.set(
              doc(db, 'inventory_movements', movId),
              sanitizeForFirestore({
                id: movId,
                itemId: invItem.id,
                itemName: invItem.name,
                type: 'waste',
                quantity: calc.deductedQty,
                previousStock: invItem.currentStock,
                newStock: invItem.currentStock,
                reason: `Merma por anulación de orden preparada (${order.orderNumber}): ${reason}`,
                referenceId: orderId,
                performedBy: getActorName(),
                createdAt: nowIso,
              })
            );
          }
        }
      }
    }

    await batch.commit();
    await addAuditLog(
      'cancel_order',
      'orders',
      orderId,
      reason,
      `Orden ${order.orderNumber} anulada. Inventario: ${inventoryDisposition}. Reembolso efectivo: ₡${cashToRefund}.`
    );
  };

  // ------------------------------------------------------------------------
  // PERSISTENT PAYMENTS (SINGLE / MIXED / PARTIAL) + EXPLICIT REGISTER CHECK
  // ------------------------------------------------------------------------
  const recordOrderPayment = async (
    orderId: string,
    entries: PaymentEntryInput[]
  ): Promise<{
    success: boolean;
    change?: number;
    payments?: PaymentRecord[];
    error?: string;
  }> => {
    if (!hasOpenCashRegister || !activeCashRegister) {
      return {
        success: false,
        error: 'La caja está cerrada. Debe abrir un turno de caja antes de registrar cobros.',
      };
    }

    const order = orders.find(o => o.id === orderId) || (currentOrder?.id === orderId ? currentOrder : null);
    if (!order) return { success: false, error: 'Orden no encontrada.' };
    if (order.status === 'cancelled') {
      return { success: false, error: 'No se puede cobrar una orden anulada.' };
    }

    const currentFin = resolveFinancialStatus(order);
    if (currentFin === 'paid') {
      return { success: false, error: 'Esta orden ya fue cobrada en su totalidad.' };
    }

    if (!entries || entries.length === 0) {
      return { success: false, error: 'Debe especificar al menos un método de pago.' };
    }

    const alreadyPaid = Number(order.paidAmount || 0);
    const remainingDue = Math.max(0, Math.round(order.total - alreadyPaid));

    let totalApplied = 0;
    let totalChange = 0;

    for (const entry of entries) {
      const amt = Math.round(Number(entry.amount) || 0);
      if (amt <= 0) {
        return { success: false, error: 'Todos los montos de pago deben ser mayores a ₡0.' };
      }
      if (entry.method === 'sinpe' && entry.sinpeReference?.trim()) {
        const cleanRef = entry.sinpeReference.trim().toLowerCase();
        const duplicate = payments.find(
          p => p.status === 'confirmed' && p.sinpeReference?.trim().toLowerCase() === cleanRef
        );
        if (duplicate) {
          return {
            success: false,
            error: `El comprobante SINPE "${entry.sinpeReference.trim()}" ya fue registrado en la orden ${duplicate.orderNumber}.`,
          };
        }
      }
      if (entry.method === 'efectivo' && entry.receivedCash !== undefined) {
        if (entry.receivedCash < amt) {
          return {
            success: false,
            error: 'El efectivo recibido es menor al monto a aplicar en efectivo.',
          };
        }
        totalChange += Math.round(entry.receivedCash - amt);
      }
      totalApplied += amt;
    }

    if (totalApplied > remainingDue) {
      return {
        success: false,
        error: `El monto total aplicado (₡${totalApplied}) supera el saldo pendiente (₡${remainingDue}).`,
      };
    }

    const nowIso = new Date().toISOString();
    const newPaidTotal = alreadyPaid + totalApplied;
    const isNowFullyPaid = newPaidTotal >= order.total;
    const nextFinStatus: FinancialOrderStatus = isNowFullyPaid ? 'paid' : 'partially_paid';

    const usedMethods = new Set<string>(entries.map(e => e.method));
    const priorPayments = payments.filter(p => p.orderId === orderId && p.status === 'confirmed');
    priorPayments.forEach(p => usedMethods.add(p.method));
    const finalPaymentMethod: PaymentMethod =
      usedMethods.size > 1 ? 'mixto' : (entries[0].method as PaymentMethod);

    const attemptKey = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const createdPayments: PaymentRecord[] = entries.map((e, idx) => {
      const idempKey = buildDeterministicPaymentId(orderId, attemptKey, idx, e.method);
      return {
        id: idempKey,
        orderId,
        orderNumber: order.orderNumber,
        registerId: activeCashRegister.id,
        amount: Math.round(e.amount),
        method: e.method,
        status: 'confirmed',
        receivedCash: e.receivedCash,
        changeGiven:
          e.method === 'efectivo' && e.receivedCash !== undefined
            ? Math.max(0, Math.round(e.receivedCash - e.amount))
            : undefined,
        sinpeReference: e.sinpeReference?.trim() || undefined,
        cardAuthCode: e.cardAuthCode?.trim() || undefined,
        idempotencyKey: idempKey,
        performedBy: getActorName(),
        performedByUid: currentUser?.uid,
        createdAt: nowIso,
      };
    });

    if (!isOnline) {
      await saveOfflineMutation({
        id: `mut_pay_${orderId}_${attemptKey}`,
        collection: 'orders',
        docId: orderId,
        type: 'payment_transaction',
        payload: {
          orderId,
          registerId: activeCashRegister.id,
          payments: createdPayments,
          finalPaymentMethod,
          nextFinStatus,
          newPaidTotal,
        },
        userId: currentUser?.uid,
        requiresReconciliation: true,
        createdAt: nowIso,
      });
      setPendingOfflineCount(await getOfflinePendingCount());
      return {
        success: true,
        change: totalChange,
        payments: createdPayments,
      };
    }

    try {
      let txFullyPaid = isNowFullyPaid;

      await runTransaction(db, async tx => {
        const orderRef = doc(db, 'orders', orderId);
        const regRef = doc(db, 'cash_registers', activeCashRegister.id);
        const payRefs = createdPayments.map(p => doc(db, 'payments', p.id));

        const [orderSnap, regSnap, ...paySnaps] = await Promise.all([
          tx.get(orderRef),
          tx.get(regRef),
          ...payRefs.map(ref => tx.get(ref)),
        ]);

        const liveOrder = orderSnap.exists() ? (orderSnap.data() as RestaurantOrder) : order;
        const regData = regSnap.exists() ? (regSnap.data() as CashRegister) : undefined;
        const existingPayIds = new Set<string>();
        paySnaps.forEach((snap, idx) => {
          if (snap.exists()) existingPayIds.add(createdPayments[idx].id);
        });

        const evaluation = evaluateTransactionalPayment({
          liveOrder,
          registerStatus: regData?.status,
          existingPaymentIds: existingPayIds,
          incomingPayments: createdPayments,
        });

        if (!evaluation.ok) {
          throw new Error(evaluation.error || 'No se pudo validar el cobro de forma atómica.');
        }

        txFullyPaid = evaluation.isNowFullyPaid;

        if (evaluation.idempotentReplay || !regData) {
          return;
        }

        for (const pay of evaluation.paymentsToWrite) {
          tx.set(doc(db, 'payments', pay.id), sanitizeForFirestore(pay));

          const movId = `cm_sale_${pay.id}`;
          tx.set(
            doc(db, 'cash_movements', movId),
            sanitizeForFirestore({
              id: movId,
              registerId: activeCashRegister.id,
              type: 'sale',
              amount: pay.amount,
              paymentMethod: pay.method,
              referenceId: orderId,
              description: `Cobro ${liveOrder.orderNumber} (${pay.method.toUpperCase()})${pay.sinpeReference ? ` Ref:${pay.sinpeReference}` : ''}`,
              performedBy: getActorName(),
              createdAt: nowIso,
            })
          );
        }

        const nextReg: CashRegister = {
          ...regData,
          cashSales: (regData.cashSales || 0) + evaluation.addCash,
          sinpeSales: (regData.sinpeSales || 0) + evaluation.addSinpe,
          cardSales: (regData.cardSales || 0) + evaluation.addCard,
        };
        const nextExpected = calculateExpectedCash(nextReg);

        tx.update(regRef, {
          cashSales: nextReg.cashSales,
          sinpeSales: nextReg.sinpeSales,
          cardSales: nextReg.cardSales,
          expectedCash: nextExpected,
        });

        // CRITICAL: Paying an order NEVER silently marks kitchen operationalStatus as 'delivered'!
        const currentOp = resolveOperationalStatus(liveOrder);
        tx.set(
          orderRef,
          sanitizeForFirestore({
            ...liveOrder,
            paidAmount: evaluation.nextPaidTotal,
            financialStatus: evaluation.nextFinStatus,
            paymentStatus: evaluation.nextFinStatus,
            paymentMethod: finalPaymentMethod,
            paidAt: evaluation.isNowFullyPaid ? nowIso : liveOrder.paidAt,
            status: toLegacyOrderStatus(currentOp, evaluation.nextFinStatus),
            updatedAt: nowIso,
          }),
          { merge: true }
        );

        // Free table ONLY if fully paid AND already delivered (or if ventana/expres)
        if (evaluation.isNowFullyPaid && liveOrder.serviceType === 'mesa' && liveOrder.tableId) {
          tx.update(doc(db, 'tables', liveOrder.tableId), {
            status: currentOp === 'delivered' ? 'libre' : 'activa',
            currentOrderId: currentOp === 'delivered' ? null : orderId,
            updatedAt: nowIso,
          });
        }
      });

      // Trigger inventory deduction if configured for payment moment
      if (txFullyPaid && restaurantConfig.inventoryDeductionTrigger === 'payment') {
        const updatedItems = await deductInventoryDeltaForOrder(order);
        await updateDoc(doc(db, 'orders', orderId), {
          items: sanitizeForFirestore(updatedItems),
          inventoryDeducted: true,
          inventoryDeductedAt: nowIso,
        });
      }

      return { success: true, change: totalChange, payments: createdPayments };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Error procesando el cobro.' };
    }
  };

  const completeOrderPayment = async (
    orderId: string,
    method: PaymentMethod,
    receivedCash?: number,
    meta?: { sinpeReference?: string; cardAuthCode?: string }
  ): Promise<{ success: boolean; change?: number; error?: string }> => {
    const order = orders.find(o => o.id === orderId) || (currentOrder?.id === orderId ? currentOrder : null);
    if (!order) return { success: false, error: 'Orden no encontrada.' };
    const remaining = Math.max(0, Math.round(order.total - (order.paidAmount || 0)));
    const resolvedMethod = method === 'mixto' ? 'efectivo' : method;
    return recordOrderPayment(orderId, [
      {
        method: resolvedMethod,
        amount: remaining,
        receivedCash,
        sinpeReference: meta?.sinpeReference,
        cardAuthCode: meta?.cardAuthCode,
      },
    ]);
  };

  const refundPayment = async (
    paymentId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isAdmin) return { success: false, error: 'Solo un administrador puede emitir reembolsos.' };
    const pay = payments.find(p => p.id === paymentId);
    if (!pay) return { success: false, error: 'Pago no encontrado.' };
    if (pay.status !== 'confirmed') return { success: false, error: 'Este pago ya fue revertido.' };
    if (pay.method === 'efectivo' && !activeCashRegister) {
      return {
        success: false,
        error: 'Debe haber una caja abierta para registrar un reembolso en efectivo.',
      };
    }

    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);
    batch.update(
      doc(db, 'payments', paymentId),
      sanitizeForFirestore({
        status: 'refunded',
        refundedAt: nowIso,
        refundedBy: getActorName(),
        refundReason: reason,
      })
    );

    const order = orders.find(o => o.id === pay.orderId);
    if (order) {
      const nextPaid = Math.max(0, (order.paidAmount || order.total) - pay.amount);
      const nextFin: FinancialOrderStatus =
        nextPaid <= 0 ? 'refunded' : nextPaid < order.total ? 'partially_paid' : 'paid';
      batch.update(doc(db, 'orders', order.id), {
        paidAmount: nextPaid,
        financialStatus: nextFin,
        paymentStatus: nextFin,
        updatedAt: nowIso,
      });
    }

    if (pay.method === 'efectivo' && activeCashRegister) {
      const nextRefunds = (activeCashRegister.cashRefunds || 0) + pay.amount;
      batch.update(doc(db, 'cash_registers', activeCashRegister.id), {
        cashRefunds: nextRefunds,
        expectedCash: calculateExpectedCash({ ...activeCashRegister, cashRefunds: nextRefunds }),
      });
      const movId = `cm_ref_${paymentId}`;
      batch.set(
        doc(db, 'cash_movements', movId),
        sanitizeForFirestore({
          id: movId,
          registerId: activeCashRegister.id,
          type: 'refund',
          amount: pay.amount,
          paymentMethod: 'efectivo',
          referenceId: pay.orderId,
          description: `Reembolso efectivo ${pay.orderNumber}: ${reason}`,
          performedBy: getActorName(),
          createdAt: nowIso,
        })
      );
    }

    await batch.commit();
    await addAuditLog('refund_payment', 'payments', paymentId, reason, `Monto: ₡${pay.amount}`);
    return { success: true };
  };

  // ------------------------------------------------------------------------
  // EXPLICIT CASH REGISTER OPERATIONS (OPEN / CLOSE / REOPEN / DEPOSIT / WITHDRAWAL)
  // ------------------------------------------------------------------------
  const openNewDayRegister = async (
    initialFloat: number,
    denominations?: DenominationCount[]
  ) => {
    const cleanFloat = Math.round(Number(initialFloat) || 0);
    if (cleanFloat < 0) throw new Error('El fondo inicial no puede ser negativo.');

    const today = getCostaRicaDateString();
    const alreadyOpenToday = cashRegistersHistory.find(
      r => r.date === today && r.status === 'open'
    );
    if (alreadyOpenToday) {
      throw new Error('Ya existe un turno de caja abierto para hoy.');
    }

    const nowIso = new Date().toISOString();
    const regId = `reg_${today}_${Date.now().toString(36).slice(-4)}`;
    const newReg: CashRegister = {
      id: regId,
      date: today,
      status: 'open',
      openedAt: nowIso,
      openedBy: getActorName(),
      initialCash: cleanFloat,
      openingDenominations: denominations,
      cashSales: 0,
      sinpeSales: 0,
      cardSales: 0,
      cashDeposits: 0,
      cashWithdrawals: 0,
      cashRefunds: 0,
      cashPurchases: 0,
      cashExpenses: 0,
      expectedCash: cleanFloat,
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'cash_registers', regId), sanitizeForFirestore(newReg));
    const movId = `cm_open_${regId}`;
    batch.set(
      doc(db, 'cash_movements', movId),
      sanitizeForFirestore({
        id: movId,
        registerId: regId,
        type: 'initial_float',
        amount: cleanFloat,
        paymentMethod: 'efectivo',
        referenceId: regId,
        description: `Apertura de caja — Fondo inicial (${today})`,
        performedBy: getActorName(),
        createdAt: nowIso,
      })
    );
    await batch.commit();

    await addAuditLog(
      'open_register',
      'cash_registers',
      regId,
      `Apertura explícita de turno con fondo ₡${cleanFloat}`
    );
  };

  const closeCashRegister = async (
    actualCash: number,
    notes?: string,
    denominations?: DenominationCount[],
    targetRegisterId?: string
  ): Promise<{ success: boolean; register?: CashRegister; error?: string }> => {
    const target = targetRegisterId
      ? cashRegistersHistory.find(r => r.id === targetRegisterId)
      : activeCashRegister;

    if (!target || target.status !== 'open') {
      return { success: false, error: 'No hay un turno de caja abierto para cerrar.' };
    }

    const counted = Math.round(Number(actualCash) || 0);
    if (counted < 0) {
      return { success: false, error: 'El efectivo contado no puede ser negativo.' };
    }

    const expected = calculateExpectedCash(target);
    const difference = Math.round(counted - expected);
    const nowIso = new Date().toISOString();
    const closePatch = buildCashRegisterClosePatch({
      expectedCash: expected,
      actualCash: counted,
      closedAt: nowIso,
      closedBy: getActorName(),
      notes: notes?.trim() || target.notes,
      closingDenominations: denominations,
    });

    const closedReg: CashRegister = {
      ...target,
      ...closePatch,
      status: 'closed',
    };

    await updateDoc(doc(db, 'cash_registers', target.id), sanitizeForFirestore(closePatch));
    await addAuditLog(
      'close_register',
      'cash_registers',
      target.id,
      notes?.trim() || 'Cierre formal de turno de caja',
      `Esperado: ₡${expected} | Contado: ₡${counted} | Diferencia: ₡${difference}`
    );

    return { success: true, register: closedReg };
  };

  const recordPhysicalCount = async (
    actualCash: number,
    notes?: string,
    denominations?: DenominationCount[]
  ) => {
    const res = await closeCashRegister(actualCash, notes, denominations);
    if (!res.success) throw new Error(res.error);
  };

  const reopenCashRegister = async (registerId: string, reason: string) => {
    if (!isAdmin) throw new Error('Solo el administrador puede reabrir una caja cerrada.');
    if (!reason.trim()) throw new Error('Debe indicar el motivo de reapertura.');
    const target = cashRegistersHistory.find(r => r.id === registerId);
    if (!target) throw new Error('Caja no encontrada.');

    const nowIso = new Date().toISOString();
    await updateDoc(
      doc(db, 'cash_registers', registerId),
      sanitizeForFirestore({
        status: 'open',
        reopenedAt: nowIso,
        reopenedBy: getActorName(),
        reopenReason: reason.trim(),
      })
    );
    await addAuditLog('reopen_register', 'cash_registers', registerId, reason.trim());
  };

  const recordCashDrawerMovement = async (
    type: 'deposit' | 'withdrawal',
    amount: number,
    reason: string
  ) => {
    if (!isAdmin) throw new Error('Solo el administrador puede registrar ingresos o retiros de caja.');
    if (!activeCashRegister || activeCashRegister.status !== 'open') {
      throw new Error('Debe tener una caja abierta para registrar movimientos.');
    }
    const cleanAmt = Math.round(Number(amount) || 0);
    if (cleanAmt <= 0) throw new Error('El monto debe ser mayor a ₡0.');
    if (!reason.trim()) throw new Error('Debe indicar el motivo del movimiento.');

    const nowIso = new Date().toISOString();
    const nextReg: CashRegister = {
      ...activeCashRegister,
      cashDeposits:
        (activeCashRegister.cashDeposits || 0) + (type === 'deposit' ? cleanAmt : 0),
      cashWithdrawals:
        (activeCashRegister.cashWithdrawals || 0) + (type === 'withdrawal' ? cleanAmt : 0),
    };
    const nextExpected = calculateExpectedCash(nextReg);

    const batch = writeBatch(db);
    batch.update(doc(db, 'cash_registers', activeCashRegister.id), {
      cashDeposits: nextReg.cashDeposits,
      cashWithdrawals: nextReg.cashWithdrawals,
      expectedCash: nextExpected,
    });
    const movId = `cm_${type}_${Date.now().toString(36)}`;
    batch.set(
      doc(db, 'cash_movements', movId),
      sanitizeForFirestore({
        id: movId,
        registerId: activeCashRegister.id,
        type,
        amount: cleanAmt,
        paymentMethod: 'efectivo',
        referenceId: activeCashRegister.id,
        description: `${type === 'deposit' ? 'Ingreso manual' : 'Retiro de efectivo'}: ${reason.trim()}`,
        performedBy: getActorName(),
        createdAt: nowIso,
      })
    );
    await batch.commit();
    await addAuditLog(
      'cash_movement',
      'cash_registers',
      activeCashRegister.id,
      `${type === 'deposit' ? 'Ingreso' : 'Retiro'} ₡${cleanAmt}: ${reason.trim()}`
    );
  };

  // ------------------------------------------------------------------------
  // KITCHEN TICKET PRINTING
  // ------------------------------------------------------------------------
  const printOrderTicket = (order: RestaurantOrder) => {
    const previousPrints = kitchenTickets.filter(t => t.orderId === order.id).length;
    const isCopy = previousPrints > 0;
    const ticket = createKitchenTicketFromOrder(order, isCopy, previousPrints);
    setActiveTicketToPrint(ticket);
    printKitchenTicket(ticket, restaurantConfig.printerWidth);

    setDoc(doc(db, 'kitchen_tickets', ticket.id), sanitizeForFirestore(ticket)).catch(err =>
      console.warn('Error guardando registro de ticket:', err)
    );
  };

  // ------------------------------------------------------------------------
  // RECIPES, PRODUCTS, WASTE & INVENTORY (ADMIN ONLY)
  // ------------------------------------------------------------------------
  const saveRecipe = async (recipe: Recipe) => {
    if (!isAdmin) throw new Error('Solo el administrador puede guardar recetas.');
    const nowIso = new Date().toISOString();
    const yieldPortions = Math.max(1, Number(recipe.yieldPortions) || 1);

    let totalBatchCost = 0;
    const formulaIngredients: RecipeFormulaDoc['ingredients'] = [];

    for (const ing of recipe.ingredients) {
      const invItem = inventory.find(i => i.id === ing.itemId);
      if (invItem) {
        const conv = convertToInventoryUnit(ing.quantity, ing.unit, 0, invItem.unit);
        if (conv.compatible) {
          totalBatchCost += conv.convertedQuantity * (invItem.averageCost || invItem.lastPurchaseCost || 0);
        }
        formulaIngredients.push({
          itemId: invItem.id,
          itemName: invItem.name,
          quantity: ing.quantity,
          unit: ing.unit,
          inventoryUnit: invItem.unit,
        });
      }
    }

    const calculatedCost = Math.round(totalBatchCost / yieldPortions);
    const finalRecipe: Recipe = {
      ...recipe,
      yieldPortions,
      calculatedCost,
      updatedAt: nowIso,
    };

    const formulaDoc: RecipeFormulaDoc = {
      id: recipe.id,
      productId: recipe.productId,
      protein: recipe.protein,
      yieldPortions,
      autoDeductEnabled: recipe.autoDeductEnabled,
      ingredients: formulaIngredients,
      updatedAt: nowIso,
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'recipes', recipe.id), sanitizeForFirestore(finalRecipe));
    batch.set(doc(db, 'recipe_formulas', recipe.id), sanitizeForFirestore(formulaDoc));
    await batch.commit();

    await addAuditLog(
      'save_recipe',
      'recipes',
      recipe.id,
      `Receta guardada: ${recipe.productName} (Rendimiento: ${yieldPortions}, Costo/porción: ₡${calculatedCost})`
    );
  };

  const toggleRecipeAutoDeduct = async (recipeId: string) => {
    if (!isAdmin) throw new Error('Solo el administrador puede cambiar descuento automático.');
    const rec = recipes.find(r => r.id === recipeId);
    if (!rec) return;
    const nextVal = !rec.autoDeductEnabled;
    const nowIso = new Date().toISOString();

    const batch = writeBatch(db);
    batch.update(doc(db, 'recipes', recipeId), {
      autoDeductEnabled: nextVal,
      updatedAt: nowIso,
    });
    batch.set(
      doc(db, 'recipe_formulas', recipeId),
      { autoDeductEnabled: nextVal, updatedAt: nowIso },
      { merge: true }
    );
    await batch.commit();
    await addAuditLog(
      'toggle_recipe_autodeduct',
      'recipes',
      recipeId,
      `Descuento automático ${nextVal ? 'activado' : 'desactivado'}`
    );
  };

  const saveProduct = async (product: ProductItem) => {
    if (!isAdmin) throw new Error('Solo el administrador puede editar productos.');
    const nowIso = new Date().toISOString();
    const finalProd = { ...product, updatedAt: nowIso };
    await setDoc(doc(db, 'products', product.id), sanitizeForFirestore(finalProd), { merge: true });
    await addAuditLog(
      'save_product',
      'products',
      product.id,
      `Producto guardado: ${product.name} (₡${product.price})`
    );
  };

  const registerWaste = async (
    itemId: string,
    quantity: number,
    reason: string,
    notes?: string
  ) => {
    if (!isAdmin) throw new Error('Solo el administrador puede registrar mermas.');
    const item = inventory.find(i => i.id === itemId);
    if (!item) throw new Error('Insumo no encontrado.');
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('Cantidad de merma inválida.');

    const nowIso = new Date().toISOString();
    const newStock = Math.max(0, Math.round((item.currentStock - qty) * 1000) / 1000);
    const movId = `inv_waste_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const batch = writeBatch(db);
    batch.update(doc(db, 'inventory_items', itemId), {
      currentStock: newStock,
      updatedAt: nowIso,
    });
    batch.set(
      doc(db, 'inventory_movements', movId),
      sanitizeForFirestore({
        id: movId,
        itemId,
        itemName: item.name,
        type: 'waste',
        quantity: qty,
        previousStock: item.currentStock,
        newStock,
        reason: notes ? `${reason} — ${notes}` : reason,
        performedBy: getActorName(),
        createdAt: nowIso,
      })
    );
    await batch.commit();
    await addAuditLog('waste_record', 'inventory_items', itemId, `Merma ${qty} ${item.unit}: ${reason}`);
  };

  const updateInventoryStock = async (itemId: string, newStock: number, reason: string) => {
    if (!isAdmin) throw new Error('Solo el administrador puede ajustar el inventario.');
    const item = inventory.find(i => i.id === itemId);
    if (!item) throw new Error('Insumo no encontrado.');
    if (newStock < 0) throw new Error('El stock no puede ser negativo.');

    const nowIso = new Date().toISOString();
    const movId = `inv_adj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const batch = writeBatch(db);
    batch.update(doc(db, 'inventory_items', itemId), {
      currentStock: newStock,
      updatedAt: nowIso,
    });
    batch.set(
      doc(db, 'inventory_movements', movId),
      sanitizeForFirestore({
        id: movId,
        itemId,
        itemName: item.name,
        type: 'adjustment',
        quantity: Math.round((newStock - item.currentStock) * 1000) / 1000,
        previousStock: item.currentStock,
        newStock,
        reason,
        performedBy: getActorName(),
        createdAt: nowIso,
      })
    );
    await batch.commit();
    await addAuditLog(
      'inventory_adjustment',
      'inventory_items',
      itemId,
      reason,
      `Stock: ${item.currentStock} -> ${newStock} ${item.unit}`
    );
  };

  // ------------------------------------------------------------------------
  // SUPPLIERS & PURCHASES WITH CREDIT (CxP) & STRICT OPEN-REGISTER CHECK
  // ------------------------------------------------------------------------
  const saveSupplier = async (
    supplierInput: Omit<Supplier, 'id' | 'createdAt'> & { id?: string }
  ) => {
    if (!isAdmin) throw new Error('Solo el administrador puede gestionar proveedores.');
    const nowIso = new Date().toISOString();
    const id = supplierInput.id || `sup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const existing = suppliers.find(s => s.id === id);
    const finalSup: Supplier = {
      ...supplierInput,
      id,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };
    await setDoc(doc(db, 'suppliers', id), sanitizeForFirestore(finalSup), { merge: true });
    await addAuditLog('create', 'suppliers', id, `Proveedor guardado: ${finalSup.name}`);
  };

  const addPurchase = async (
    purchase: Omit<PurchaseRecord, 'id' | 'createdAt' | 'registeredBy'>
  ) => {
    if (!isAdmin) throw new Error('Solo el administrador puede registrar compras.');

    if (purchase.paidFromCashRegister && (!activeCashRegister || activeCashRegister.status !== 'open')) {
      throw new Error(
        'No se puede descontar una compra de la caja porque no hay un turno de caja abierto.'
      );
    }

    const nowIso = new Date().toISOString();
    const purchaseId = `pur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const isCredit = purchase.paymentMethod === 'credito';
    const initialPaid = isCredit ? Number(purchase.paidAmount || 0) : purchase.total;
    const creditStatus: PurchaseRecord['creditStatus'] = isCredit
      ? initialPaid >= purchase.total
        ? 'paid'
        : initialPaid > 0
          ? 'partial'
          : 'pending'
      : 'paid';

    // Atomic duplicate invoice lock when vendor + purchaseNumber are present
    const lockId = buildPurchaseInvoiceLockId(purchase.vendor, purchase.purchaseNumber);

    const finalPurchase: PurchaseRecord = {
      ...purchase,
      id: purchaseId,
      creditStatus,
      paidAmount: initialPaid,
      registeredBy: getActorName(),
      createdAt: nowIso,
    };

    // Execute lock check, purchase write, stock updates, and cash deduction atomically in a transaction
    const matchedLines = purchase.items.map(line => {
      const normalizedUnit = normalizeUnitString(line.unit);
      const invItem = line.itemId
        ? inventory.find(i => i.id === line.itemId)
        : inventory.find(
            i =>
              i.name.trim().toLowerCase() ===
              (line.normalizedName || line.name).trim().toLowerCase()
          );
      return { line, normalizedUnit, invItem };
    });

    await runTransaction(db, async tx => {
      const lockRef = lockId ? doc(db, 'purchase_invoice_locks', lockId) : null;
      const regRef =
        purchase.paidFromCashRegister && activeCashRegister && !isCredit
          ? doc(db, 'cash_registers', activeCashRegister.id)
          : null;

      // All reads MUST precede writes in Firestore transactions
      const lockSnap = lockRef ? await tx.get(lockRef) : null;
      if (lockSnap && lockSnap.exists()) {
        throw new Error(
          `Factura duplicada detectada: ${purchase.vendor} #${purchase.purchaseNumber} ya fue registrada.`
        );
      }

      const regSnap = regRef ? await tx.get(regRef) : null;
      if (regRef && (!regSnap || !regSnap.exists() || regSnap.data()?.status !== 'open')) {
        throw new Error('La caja fue cerrada en otro dispositivo antes de registrar la compra.');
      }

      const liveInvSnaps = new Map<string, InventoryItem>();
      const uniqueInvIds = Array.from(
        new Set(matchedLines.filter(m => m.invItem).map(m => m.invItem!.id))
      );
      for (const invId of uniqueInvIds) {
        const snap = await tx.get(doc(db, 'inventory_items', invId));
        if (snap.exists()) {
          liveInvSnaps.set(invId, { id: snap.id, ...(snap.data() as Omit<InventoryItem, 'id'>) });
        }
      }

      if (lockRef) {
        tx.set(lockRef, {
          vendor: purchase.vendor,
          purchaseNumber: purchase.purchaseNumber,
          purchaseId,
          total: purchase.total,
          registeredAt: nowIso,
          registeredBy: getActorName(),
        });
      }
      tx.set(doc(db, 'purchases', purchaseId), sanitizeForFirestore(finalPurchase));

      for (const { line, normalizedUnit, invItem } of matchedLines) {
        const liveInv = invItem ? liveInvSnaps.get(invItem.id) || invItem : undefined;
        if (liveInv) {
          const conv = convertToInventoryUnit(
            line.quantity,
            normalizedUnit,
            line.unitCost || 0,
            liveInv.unit
          );
          const addedQty = conv.compatible ? conv.convertedQuantity : line.quantity;
          const unitCostInInvUnit = addedQty > 0 ? line.totalCost / addedQty : line.unitCost;
          const nextAvgCost = calculateWeightedAverageCost(
            liveInv.currentStock,
            liveInv.averageCost || liveInv.lastPurchaseCost || 0,
            addedQty,
            unitCostInInvUnit
          );
          const nextStock = Math.round((liveInv.currentStock + addedQty) * 1000) / 1000;

          tx.update(doc(db, 'inventory_items', liveInv.id), {
            currentStock: nextStock,
            averageCost: Math.round(nextAvgCost * 100) / 100,
            lastPurchaseCost: Math.round(unitCostInInvUnit * 100) / 100,
            updatedAt: nowIso,
          });
          // Update local map in case same item appears twice in one invoice
          liveInvSnaps.set(liveInv.id, {
            ...liveInv,
            currentStock: nextStock,
            averageCost: Math.round(nextAvgCost * 100) / 100,
          });

          const movId = `inv_pur_${purchaseId}_${liveInv.id}_${Math.random().toString(36).slice(2, 5)}`;
          tx.set(
            doc(db, 'inventory_movements', movId),
            sanitizeForFirestore({
              id: movId,
              itemId: liveInv.id,
              itemName: liveInv.name,
              type: 'purchase',
              quantity: addedQty,
              previousStock: liveInv.currentStock,
              newStock: nextStock,
              reason: `Compra ${purchase.vendor || ''} ${purchase.purchaseNumber || ''}`.trim(),
              referenceId: purchaseId,
              performedBy: getActorName(),
              createdAt: nowIso,
            })
          );
        } else {
          const newInvId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          tx.set(
            doc(db, 'inventory_items', newInvId),
            sanitizeForFirestore({
              id: newInvId,
              name: line.normalizedName || line.name,
              category: 'ingredientes',
              unit: normalizedUnit,
              currentStock: line.quantity,
              minStock: 2,
              averageCost: line.unitCost,
              lastPurchaseCost: line.unitCost,
              updatedAt: nowIso,
            })
          );
        }
      }

      if (regRef && regSnap) {
        const regData = regSnap.data() as CashRegister;
        const nextCashPurchases = (regData.cashPurchases || 0) + purchase.total;
        const nextExpected = calculateExpectedCash({
          ...regData,
          cashPurchases: nextCashPurchases,
        });
        tx.update(regRef, {
          cashPurchases: nextCashPurchases,
          expectedCash: nextExpected,
        });
        const movId = `cm_pur_${purchaseId}`;
        tx.set(
          doc(db, 'cash_movements', movId),
          sanitizeForFirestore({
            id: movId,
            registerId: regRef.id,
            type: 'purchase',
            amount: purchase.total,
            paymentMethod: 'efectivo',
            referenceId: purchaseId,
            description: `Compra a ${purchase.vendor || 'Proveedor'} ${purchase.purchaseNumber || ''}`.trim(),
            performedBy: getActorName(),
            createdAt: nowIso,
          })
        );
      }
    });
    await addAuditLog(
      'add_purchase',
      'purchases',
      purchaseId,
      `Compra registrada: ${purchase.vendor || 'Proveedor'} — ₡${purchase.total}`
    );
  };

  const recordCreditPurchasePayment = async (
    purchaseId: string,
    amount: number,
    method: 'efectivo' | 'transferencia' | 'tarjeta',
    paidFromCashRegister: boolean,
    notes?: string
  ) => {
    if (!isAdmin) throw new Error('Solo el administrador puede registrar abonos a proveedores.');
    const pur = purchases.find(p => p.id === purchaseId);
    if (!pur) throw new Error('Compra a crédito no encontrada.');

    const cleanAmt = Math.round(Number(amount) || 0);
    const currentPaid = Number(pur.paidAmount || 0);
    const pendingBalance = Math.max(0, pur.total - currentPaid);
    if (cleanAmt <= 0 || cleanAmt > pendingBalance) {
      throw new Error(`El monto del abono debe estar entre ₡1 y ₡${pendingBalance}.`);
    }
    if (paidFromCashRegister && (!activeCashRegister || activeCashRegister.status !== 'open')) {
      throw new Error('Debe haber un turno de caja abierto para pagar este abono desde caja.');
    }

    const nowIso = new Date().toISOString();
    const nextPaid = currentPaid + cleanAmt;
    const nextStatus: PurchaseRecord['creditStatus'] = nextPaid >= pur.total ? 'paid' : 'partial';
    const paymentEntry: CreditPaymentEntry = {
      id: `cpay_${Date.now().toString(36)}`,
      amount: cleanAmt,
      paymentMethod: method,
      paidFromCashRegister,
      paidAt: nowIso,
      paidBy: getActorName(),
      notes: notes?.trim() || undefined,
    };

    const batch = writeBatch(db);
    batch.update(
      doc(db, 'purchases', purchaseId),
      sanitizeForFirestore({
        paidAmount: nextPaid,
        creditStatus: nextStatus,
        creditPayments: [...(pur.creditPayments || []), paymentEntry],
      })
    );

    if (paidFromCashRegister && activeCashRegister) {
      const nextCashPurchases = (activeCashRegister.cashPurchases || 0) + cleanAmt;
      batch.update(doc(db, 'cash_registers', activeCashRegister.id), {
        cashPurchases: nextCashPurchases,
        expectedCash: calculateExpectedCash({
          ...activeCashRegister,
          cashPurchases: nextCashPurchases,
        }),
      });
      const movId = `cm_cpay_${paymentEntry.id}`;
      batch.set(
        doc(db, 'cash_movements', movId),
        sanitizeForFirestore({
          id: movId,
          registerId: activeCashRegister.id,
          type: 'purchase',
          amount: cleanAmt,
          paymentMethod: 'efectivo',
          referenceId: purchaseId,
          description: `Abono CxP ${pur.vendor || ''} ${pur.purchaseNumber || ''}`.trim(),
          performedBy: getActorName(),
          createdAt: nowIso,
        })
      );
    }

    await batch.commit();
    await addAuditLog(
      'credit_payment',
      'purchases',
      purchaseId,
      `Abono CxP ₡${cleanAmt} a ${pur.vendor || 'Proveedor'} (Estado: ${nextStatus})`
    );
  };

  // ------------------------------------------------------------------------
  // OPERATING EXPENSES
  // ------------------------------------------------------------------------
  const addExpense = async (expense: Omit<OperatingExpense, 'id' | 'createdAt' | 'status'>) => {
    if (!isAdmin) throw new Error('Solo el administrador puede registrar gastos.');
    const nowIso = new Date().toISOString();
    const id = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newExp: OperatingExpense = {
      ...expense,
      id,
      status: 'pending',
      createdAt: nowIso,
    };
    await setDoc(doc(db, 'operating_expenses', id), sanitizeForFirestore(newExp));
    await addAuditLog('add_expense', 'operating_expenses', id, `Gasto registrado: ${expense.name}`);
  };

  const markExpensePaid = async (expenseId: string, method: PaymentMethod, fromCash: boolean) => {
    if (!isAdmin) throw new Error('Solo el administrador puede marcar gastos como pagados.');
    const exp = expenses.find(e => e.id === expenseId);
    if (!exp) throw new Error('Gasto no encontrado.');
    if (fromCash && (!activeCashRegister || activeCashRegister.status !== 'open')) {
      throw new Error('No se puede pagar desde caja porque no hay un turno de caja abierto.');
    }

    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);
    batch.update(
      doc(db, 'operating_expenses', expenseId),
      sanitizeForFirestore({
        status: 'paid',
        paymentMethod: method,
        paidFromCashRegister: fromCash,
        lastPaidAt: nowIso,
      })
    );

    if (fromCash && activeCashRegister) {
      const nextCashExpenses = (activeCashRegister.cashExpenses || 0) + exp.amount;
      batch.update(doc(db, 'cash_registers', activeCashRegister.id), {
        cashExpenses: nextCashExpenses,
        expectedCash: calculateExpectedCash({
          ...activeCashRegister,
          cashExpenses: nextCashExpenses,
        }),
      });
      const movId = `cm_exp_${expenseId}_${Date.now().toString(36)}`;
      batch.set(
        doc(db, 'cash_movements', movId),
        sanitizeForFirestore({
          id: movId,
          registerId: activeCashRegister.id,
          type: 'expense',
          amount: exp.amount,
          paymentMethod: 'efectivo',
          referenceId: expenseId,
          description: `Gasto operativo: ${exp.name}`,
          performedBy: getActorName(),
          createdAt: nowIso,
        })
      );
    }

    await batch.commit();
    await addAuditLog(
      'pay_expense',
      'operating_expenses',
      expenseId,
      `Pago de gasto: ${exp.name} (₡${exp.amount})`
    );
  };

  // ------------------------------------------------------------------------
  // SANITIZED BACKUP & CHUNKED VALIDATED RESTORE
  // ------------------------------------------------------------------------
  const exportDataBackup = (): string => {
    const payload = buildSanitizedBackup({
      categories,
      products,
      tables,
      inventory_items: inventory,
      recipes,
      recipe_formulas: recipeFormulas,
      suppliers,
      purchases,
      operating_expenses: expenses,
      orders,
      payments,
      cash_registers: cashRegistersHistory,
      cash_movements: cashMovements,
      restaurant_config: [restaurantConfig],
    });
    return JSON.stringify(payload, null, 2);
  };

  const previewDataBackup = (backupJson: string): BackupValidationResult => {
    try {
      const parsed = JSON.parse(backupJson);
      return validateBackupPayload(parsed);
    } catch {
      return {
        valid: false,
        errors: ['El contenido JSON no es válido o está corrupto.'],
        warnings: [],
        totalDocuments: 0,
        collectionCounts: {},
      };
    }
  };

  const restoreDataBackup = async (
    backupJson: string
  ): Promise<{ success: boolean; message: string; count: number }> => {
    if (!isAdmin) {
      return { success: false, message: 'Solo un administrador puede restaurar respaldos.', count: 0 };
    }
    try {
      const parsed = JSON.parse(backupJson);
      const { batchesCommitted, documentsRestored } = await restoreBackupInChunks(db, parsed, 400);
      await addAuditLog(
        'data_restore',
        'restaurant_config',
        'main',
        `Restauración validada por lotes (${documentsRestored} documentos en ${batchesCommitted} lotes)`
      );
      return {
        success: true,
        message: `Restauración completada: ${documentsRestored} documentos procesados en ${batchesCommitted} lotes seguros.`,
        count: documentsRestored,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || 'Error restaurando el respaldo.',
        count: 0,
      };
    }
  };

  return (
    <POSContext.Provider
      value={{
        restaurantConfig,
        updateRestaurantConfig,
        tables,
        categories,
        products,
        selectedTable,
        selectTable,
        updateTableStatus,
        addTable,
        toggleTableActive,
        importPollosKarenOfficialMenu,
        orders,
        kitchenOrders,
        currentOrder,
        setCurrentOrder,
        createNewOrder,
        addItemToCurrentOrder,
        updateOrderItemQuantity,
        removeOrderItem,
        setOrderObservations,
        setOrderDeliveryDetails,
        setOrderDiscount,
        saveActiveOrder,
        authorizeOrderToKitchen,
        updateKitchenOrderStatus,
        markOrderDelivered,
        updateOrderStatus,
        cancelOrder,
        transferTableOrder,
        mergeTableOrders,
        splitOrderItems,
        kitchenTickets,
        printOrderTicket,
        activeTicketToPrint,
        setActiveTicketToPrint,
        payments,
        cashRegister,
        activeCashRegister,
        hasOpenCashRegister,
        cashRegistersHistory,
        staleOpenRegisters,
        cashMovements,
        recordOrderPayment,
        completeOrderPayment,
        refundPayment,
        recordPhysicalCount,
        closeCashRegister,
        openNewDayRegister,
        reopenCashRegister,
        recordCashDrawerMovement,
        recipes,
        saveRecipe,
        toggleRecipeAutoDeduct,
        registerWaste,
        saveProduct,
        inventory,
        inventoryMovements,
        suppliers,
        saveSupplier,
        purchases,
        addPurchase,
        recordCreditPurchasePayment,
        updateInventoryStock,
        expenses,
        addExpense,
        markExpensePaid,
        auditLogs,
        addAuditLog,
        exportDataBackup,
        previewDataBackup,
        restoreDataBackup,
        isOnline,
        pendingOfflineCount,
        syncOfflineQueue,
      }}
    >
      {children}
    </POSContext.Provider>
  );
};

export function usePOS() {
  const context = useContext(POSContext);
  if (!context) {
    throw new Error('usePOS debe ser utilizado dentro de un POSProvider');
  }
  return context;
}
