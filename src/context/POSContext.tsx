import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
  PurchaseLineItem,
  OrderStatus,
  Recipe,
} from '../types';
import { INITIAL_TABLES, INITIAL_CATEGORIES, INITIAL_PRODUCTS, INITIAL_INVENTORY_ITEMS, INITIAL_RECIPES } from '../config/initialData';
import { calculateOrderTotals, getCostaRicaDateString, generateOrderNumber } from '../utils/formatters';
import {
  calculateWeightedAverageCost,
  convertToInventoryUnit,
  normalizeUnitString,
} from '../utils/unitConverter';
import { createKitchenTicketFromOrder, printKitchenTicket } from '../utils/thermalPrinter';
import {
  saveOfflineOrder,
  getOfflineOrders,
  removeOfflineOrder,
  saveOfflineMutation,
  getOfflineMutations,
  removeOfflineMutation,
  getOfflinePendingCount,
} from '../utils/offlineQueue';

interface POSContextType {
  // Catalog & Tables
  tables: RestaurantTable[];
  categories: ProductCategory[];
  products: ProductItem[];
  selectedTable: RestaurantTable | null;
  selectTable: (table: RestaurantTable | null) => void;
  updateTableStatus: (tableId: string, status: RestaurantTable['status'], currentOrderId?: string | null) => Promise<void>;
  addTable: (name: string, number: number, type: 'table' | 'bar', seats: number) => Promise<void>;
  toggleTableActive: (tableId: string) => Promise<void>;

  // Active Orders
  orders: RestaurantOrder[];
  currentOrder: RestaurantOrder | null;
  setCurrentOrder: (order: RestaurantOrder | null) => void;
  createNewOrder: (serviceType: ServiceType, table?: RestaurantTable) => RestaurantOrder;
  addItemToCurrentOrder: (product: ProductItem, protein?: CasadoProtein, notes?: string) => void;
  updateOrderItemQuantity: (lineItemId: string, delta: number) => void;
  removeOrderItem: (lineItemId: string) => void;
  setOrderObservations: (observations: string) => void;
  saveActiveOrder: () => Promise<{ success: boolean; order?: RestaurantOrder; error?: string }>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  cancelOrder: (orderId: string, reason: string) => Promise<void>;

  // Kitchen Tickets
  kitchenTickets: KitchenTicket[];
  printOrderTicket: (order: RestaurantOrder) => void;
  activeTicketToPrint: KitchenTicket | null;
  setActiveTicketToPrint: (ticket: KitchenTicket | null) => void;

  // Checkout & Cash Register
  cashRegister: CashRegister;
  cashMovements: CashMovement[];
  completeOrderPayment: (orderId: string, method: PaymentMethod, receivedCash?: number) => Promise<{ success: boolean; change?: number; error?: string }>;
  recordPhysicalCount: (actualCash: number, notes?: string) => Promise<void>;
  openNewDayRegister: (initialFloat: number) => Promise<void>;

  // Recipes & Formulation (Fase 3)
  recipes: Recipe[];
  saveRecipe: (recipe: Recipe) => Promise<void>;
  toggleRecipeAutoDeduct: (recipeId: string) => Promise<void>;
  registerWaste: (itemId: string, quantity: number, reason: string, notes?: string) => Promise<void>;
  saveProduct: (product: ProductItem) => Promise<void>;

  // Inventory & Purchases
  inventory: InventoryItem[];
  inventoryMovements: InventoryMovement[];
  purchases: PurchaseRecord[];
  addPurchase: (purchase: Omit<PurchaseRecord, 'id' | 'createdAt' | 'registeredBy'>) => Promise<void>;
  updateInventoryStock: (itemId: string, newStock: number, reason: string) => Promise<void>;

  // Expenses
  expenses: OperatingExpense[];
  addExpense: (expense: Omit<OperatingExpense, 'id' | 'createdAt' | 'status'>) => Promise<void>;
  markExpensePaid: (expenseId: string, method: PaymentMethod, fromCash: boolean) => Promise<void>;

  // Audit Logs
  auditLogs: AuditLog[];
  addAuditLog: (action: string, collectionName: string, documentId: string, reason: string, details?: string) => Promise<void>;

  // Backup and Restore
  exportDataBackup: () => string;
  restoreDataBackup: (backupJson: string) => Promise<{ success: boolean; message: string; count: number }>;

  // Offline Status & Multi-Device Sync
  isOnline: boolean;
  pendingOfflineCount: number;
  syncOfflineQueue: () => Promise<void>;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

export const POSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, appUser, isAdmin } = useAuth();

  // Network & Sync State
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingOfflineCount, setPendingOfflineCount] = useState<number>(0);

  // Core Real-Time State
  const [tables, setTables] = useState<RestaurantTable[]>(INITIAL_TABLES);
  const [categories, setCategories] = useState<ProductCategory[]>(INITIAL_CATEGORIES);
  const [products, setProducts] = useState<ProductItem[]>(INITIAL_PRODUCTS);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [currentOrder, setCurrentOrder] = useState<RestaurantOrder | null>(null);

  // Tickets
  const [kitchenTickets, setKitchenTickets] = useState<KitchenTicket[]>([]);
  const [activeTicketToPrint, setActiveTicketToPrint] = useState<KitchenTicket | null>(null);

  // Cash Register
  const todayCR = getCostaRicaDateString();
  const [cashRegister, setCashRegister] = useState<CashRegister>({
    id: `reg_${todayCR}`,
    date: todayCR,
    status: 'open',
    openedAt: new Date().toISOString(),
    openedBy: 'Administración Karen',
    initialCash: 50000,
    cashSales: 0,
    sinpeSales: 0,
    cardSales: 0,
    cashPurchases: 0,
    cashExpenses: 0,
    expectedCash: 50000,
  });
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);

  // Recipes State (Fase 3)
  const [recipes, setRecipes] = useState<Recipe[]>(INITIAL_RECIPES);

  // Inventory, Purchases & Expenses
  const [inventory, setInventory] = useState<InventoryItem[]>(INITIAL_INVENTORY_ITEMS);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [expenses, setExpenses] = useState<OperatingExpense[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const isInitialMount = useRef(true);

  // --------------------------------------------------------------------------
  // FIRESTORE REAL-TIME SYNCHRONIZATION (Multi-Device)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribers: (() => void)[] = [];

    // 1. Tables Listener
    const tablesCol = collection(db, 'tables');
    const unsubTables = onSnapshot(
      tablesCol,
      snapshot => {
        if (!snapshot.empty) {
          const list: RestaurantTable[] = snapshot.docs.map(d => ({
            id: d.id,
            ...(d.data() as Omit<RestaurantTable, 'id'>),
          }));
          list.sort((a, b) => a.number - b.number);
          setTables(list);
        } else if (isAdmin) {
          // Seed initial tables if collection is completely fresh
          INITIAL_TABLES.forEach(async tbl => {
            try {
              await setDoc(doc(db, 'tables', tbl.id), tbl);
            } catch (err) {
              console.warn('Error inicializando mesa:', err);
            }
          });
        }
      },
      error => handleFirestoreError(error, OperationType.GET, 'tables')
    );
    unsubscribers.push(unsubTables);

    // 2. Categories Listener
    const categoriesCol = collection(db, 'categories');
    const unsubCategories = onSnapshot(
      categoriesCol,
      snapshot => {
        if (!snapshot.empty) {
          const list: ProductCategory[] = snapshot.docs.map(d => ({
            id: d.id,
            ...(d.data() as Omit<ProductCategory, 'id'>),
          }));
          list.sort((a, b) => a.order - b.order);
          setCategories(list);
        } else if (isAdmin) {
          INITIAL_CATEGORIES.forEach(async cat => {
            try {
              await setDoc(doc(db, 'categories', cat.id), cat);
            } catch (err) {
              console.warn('Error inicializando categoría:', err);
            }
          });
        }
      },
      error => handleFirestoreError(error, OperationType.GET, 'categories')
    );
    unsubscribers.push(unsubCategories);

    // 3. Products Listener
    const productsCol = collection(db, 'products');
    const unsubProducts = onSnapshot(
      productsCol,
      snapshot => {
        if (!snapshot.empty) {
          const list: ProductItem[] = snapshot.docs.map(d => ({
            id: d.id,
            ...(d.data() as Omit<ProductItem, 'id'>),
          }));
          setProducts(list);
        } else if (isAdmin) {
          INITIAL_PRODUCTS.forEach(async prod => {
            try {
              await setDoc(doc(db, 'products', prod.id), prod);
            } catch (err) {
              console.warn('Error inicializando producto:', err);
            }
          });
        }
      },
      error => handleFirestoreError(error, OperationType.GET, 'products')
    );
    unsubscribers.push(unsubProducts);

    // 4. Orders Listener (Real-time live synchronization between tablets)
    const ordersCol = collection(db, 'orders');
    const unsubOrders = onSnapshot(
      ordersCol,
      snapshot => {
        const list: RestaurantOrder[] = snapshot.docs.map(d => ({
          id: d.id,
          ...(d.data() as Omit<RestaurantOrder, 'id'>),
        }));
        // Sort descending by createdAt
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setOrders(list);
      },
      error => handleFirestoreError(error, OperationType.GET, 'orders')
    );
    unsubscribers.push(unsubOrders);

    // 5. Cash Register Listener & Automatic Midnight Closure of Previous Days
    const activeRegDoc = doc(db, 'cash_registers', `reg_${todayCR}`);
    const unsubReg = onSnapshot(
      activeRegDoc,
      snapshot => {
        if (snapshot.exists()) {
          setCashRegister({
            id: snapshot.id,
            ...(snapshot.data() as Omit<CashRegister, 'id'>),
          });
        } else {
          // Initialize today's cash register period in Firestore
          const initialDrawer: CashRegister = {
            id: `reg_${todayCR}`,
            date: todayCR,
            status: 'open',
            openedAt: new Date().toISOString(),
            openedBy: appUser?.displayName || 'Administración',
            initialCash: 50000,
            cashSales: 0,
            sinpeSales: 0,
            cardSales: 0,
            cashPurchases: 0,
            cashExpenses: 0,
            expectedCash: 50000,
          };
          setDoc(activeRegDoc, initialDrawer).catch(e => console.warn('Init register error:', e));
        }
      },
      error => handleFirestoreError(error, OperationType.GET, `cash_registers/reg_${todayCR}`)
    );
    unsubscribers.push(unsubReg);

    // Close any stale open cash registers from previous dates (Midnight Rollover)
    if (isAdmin) {
      getDocs(collection(db, 'cash_registers'))
        .then(snap => {
          snap.docs.forEach(regDoc => {
            const data = regDoc.data() as CashRegister;
            if (data.status === 'open' && data.date && data.date < todayCR) {
              updateDoc(doc(db, 'cash_registers', regDoc.id), {
                status: 'closed',
                closedAt: new Date().toISOString(),
                notes: `${data.notes ? data.notes + ' | ' : ''}Cierre automático de medianoche (America/Costa_Rica)`,
              }).catch(e => console.warn('Auto-close old register warning:', e));
            }
          });
        })
        .catch(e => console.warn('Check previous cash registers warning:', e));
    }

    // 6. Cash Movements Listener
    const movementsCol = collection(db, 'cash_movements');
    const unsubMovements = onSnapshot(
      movementsCol,
      snapshot => {
        const list: CashMovement[] = snapshot.docs.map(d => ({
          id: d.id,
          ...(d.data() as Omit<CashMovement, 'id'>),
        }));
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setCashMovements(list);
      },
      error => handleFirestoreError(error, OperationType.GET, 'cash_movements')
    );
    unsubscribers.push(unsubMovements);

    // 7. Kitchen Tickets Listener
    const ticketsCol = collection(db, 'kitchen_tickets');
    const unsubTickets = onSnapshot(
      ticketsCol,
      snapshot => {
        const list: KitchenTicket[] = snapshot.docs.map(d => ({
          id: d.id,
          ...(d.data() as Omit<KitchenTicket, 'id'>),
        }));
        list.sort((a, b) => (b.printedAt || '').localeCompare(a.printedAt || ''));
        setKitchenTickets(list);
      },
      error => handleFirestoreError(error, OperationType.GET, 'kitchen_tickets')
    );
    unsubscribers.push(unsubTickets);

    // 8. Inventory Items Listener (Catalog and stock tracking)
    const invCol = collection(db, 'inventory_items');
    const unsubInv = onSnapshot(
      invCol,
      snapshot => {
        if (!snapshot.empty) {
          const list: InventoryItem[] = snapshot.docs.map(d => ({
            id: d.id,
            ...(d.data() as Omit<InventoryItem, 'id'>),
          }));
          setInventory(list);
        } else if (isAdmin) {
          INITIAL_INVENTORY_ITEMS.forEach(async item => {
            try {
              await setDoc(doc(db, 'inventory_items', item.id), item);
            } catch (err) {
              console.warn('Error inicializando inventario:', err);
            }
          });
        }
      },
      error => handleFirestoreError(error, OperationType.GET, 'inventory_items')
    );
    unsubscribers.push(unsubInv);

    // 9. Recipes Listener (Formulations and automated deduction)
    const recCol = collection(db, 'recipes');
    const unsubRecipes = onSnapshot(
      recCol,
      snapshot => {
        if (!snapshot.empty) {
          const list: Recipe[] = snapshot.docs.map(d => ({
            id: d.id,
            ...(d.data() as Omit<Recipe, 'id'>),
          }));
          setRecipes(list);
        } else if (isAdmin) {
          INITIAL_RECIPES.forEach(async r => {
            try {
              await setDoc(doc(db, 'recipes', r.id), r);
            } catch (err) {
              console.warn('Error inicializando recetas:', err);
            }
          });
        }
      },
      error => handleFirestoreError(error, OperationType.GET, 'recipes')
    );
    unsubscribers.push(unsubRecipes);

    // 10. Admin-Only Collections (Strictly bypassed for Colaborador to respect ABAC)
    if (isAdmin) {
      // Inventory Movements
      const movsCol = collection(db, 'inventory_movements');
      const unsubMovs = onSnapshot(
        movsCol,
        snapshot => {
          const list: InventoryMovement[] = snapshot.docs.map(d => ({
            id: d.id,
            ...(d.data() as Omit<InventoryMovement, 'id'>),
          }));
          list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          setInventoryMovements(list);
        },
        error => handleFirestoreError(error, OperationType.GET, 'inventory_movements')
      );
      unsubscribers.push(unsubMovs);

      // Purchases
      const purCol = collection(db, 'purchases');
      const unsubPurchases = onSnapshot(
        purCol,
        snapshot => {
          const list: PurchaseRecord[] = snapshot.docs.map(d => ({
            id: d.id,
            ...(d.data() as Omit<PurchaseRecord, 'id'>),
          }));
          list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          setPurchases(list);
        },
        error => handleFirestoreError(error, OperationType.GET, 'purchases')
      );
      unsubscribers.push(unsubPurchases);

      // Operating Expenses
      const expCol = collection(db, 'operating_expenses');
      const unsubExpenses = onSnapshot(
        expCol,
        snapshot => {
          const list: OperatingExpense[] = snapshot.docs.map(d => ({
            id: d.id,
            ...(d.data() as Omit<OperatingExpense, 'id'>),
          }));
          setExpenses(list);
        },
        error => handleFirestoreError(error, OperationType.GET, 'operating_expenses')
      );
      unsubscribers.push(unsubExpenses);

      // Audit Logs
      const auditCol = collection(db, 'audit_logs');
      const unsubAudit = onSnapshot(
        auditCol,
        snapshot => {
          const list: AuditLog[] = snapshot.docs.map(d => ({
            id: d.id,
            ...(d.data() as Omit<AuditLog, 'id'>),
          }));
          list.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
          setAuditLogs(list);
        },
        error => handleFirestoreError(error, OperationType.GET, 'audit_logs')
      );
      unsubscribers.push(unsubAudit);
    }

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [currentUser, isAdmin, todayCR]);

  // --------------------------------------------------------------------------
  // OFFLINE QUEUE & AUTO-SYNC LISTENER
  // --------------------------------------------------------------------------
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    getOfflinePendingCount().then(setPendingOfflineCount);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync live snapshot to backend for Jarvis AI read-only endpoints when Admin is active
  useEffect(() => {
    if (!currentUser || !isAdmin || !isOnline) return;
    const timer = setTimeout(async () => {
      try {
        const idToken = await currentUser.getIdToken();
        await fetch('/api/ai/sync-snapshot', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            inventory_items: inventory,
            orders,
            purchases,
            operating_expenses: expenses,
          }),
        });
      } catch {
        // Ignore background sync warnings
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [currentUser, isAdmin, isOnline, inventory, orders, purchases, expenses]);

  const syncOfflineQueue = async () => {
    const pendingOrders = await getOfflineOrders();
    const pendingMutations = await getOfflineMutations();

    // 1. Sync pending orders (including full payment + cash register + inventory deduction if paid offline)
    for (const order of pendingOrders) {
      try {
        if (order.paymentStatus === 'paid' && !order.inventoryDeducted) {
          // First persist order as unpaid so completeOrderPayment can process it atomically without skipping
          const unpaidCopy: RestaurantOrder = sanitizeForFirestore({
            ...order,
            paymentStatus: 'unpaid',
            status: 'served',
            inventoryDeducted: false,
          });
          await setDoc(doc(db, 'orders', order.id), unpaidCopy);
          const payRes = await completeOrderPayment(order.id, order.paymentMethod || 'efectivo');
          if (payRes.success || payRes.error?.includes('ya fue')) {
            await removeOfflineOrder(order.id);
          }
        } else {
          await setDoc(doc(db, 'orders', order.id), sanitizeForFirestore(order));
          await removeOfflineOrder(order.id);
        }
      } catch (err) {
        console.warn('Error sincronizando orden pendiente:', order.id, err);
      }
    }

    // 2. Sync pending mutations
    for (const mutation of pendingMutations) {
      try {
        if (mutation.type === 'set') {
          await setDoc(doc(db, mutation.collection, mutation.docId), sanitizeForFirestore(mutation.payload));
        } else if (mutation.type === 'update') {
          await updateDoc(doc(db, mutation.collection, mutation.docId), sanitizeForFirestore(mutation.payload));
        }
        await removeOfflineMutation(mutation.id);
      } catch (err) {
        console.warn('Error sincronizando mutación pendiente:', mutation.id, err);
      }
    }

    const remaining = await getOfflinePendingCount();
    setPendingOfflineCount(remaining);
  };

  const addAuditLog = async (
    action: string,
    collectionName: string,
    documentId: string,
    reason: string,
    details?: string
  ) => {
    const newLog: AuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action,
      collection: collectionName,
      documentId,
      reason,
      performedBy: appUser?.displayName || currentUser?.email || 'Usuario',
      performedByUid: currentUser?.uid || '',
      performedByEmail: currentUser?.email || appUser?.email || '',
      timestamp: new Date().toISOString(),
      details,
    };

    try {
      await setDoc(doc(db, 'audit_logs', newLog.id), newLog);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'audit_logs');
    }
  };

  // --------------------------------------------------------------------------
  // TABLE MANAGEMENT
  // --------------------------------------------------------------------------
  const selectTable = (table: RestaurantTable | null) => {
    setSelectedTable(table);
    if (!table) {
      setCurrentOrder(null);
      return;
    }

    // 1. Check if table has a linked currentOrderId
    if (table.currentOrderId) {
      const existing = orders.find(o => o.id === table.currentOrderId);
      if (existing && existing.status !== 'cancelled' && existing.paymentStatus !== 'paid') {
        setCurrentOrder(existing);
        return;
      }
    }

    // 2. Fallback check: find active unpaid order associated with this table
    const activeTableOrder = orders.find(
      o => o.tableId === table.id && o.paymentStatus !== 'paid' && o.status !== 'cancelled'
    );
    if (activeTableOrder) {
      setCurrentOrder(activeTableOrder);
      return;
    }

    // 3. Otherwise create a clean new order for this table
    const newOrder = createNewOrder('mesa', table);
    setCurrentOrder(newOrder);
  };

  const updateTableStatus = async (
    tableId: string,
    status: RestaurantTable['status'],
    currentOrderId?: string | null
  ) => {
    const payload: Partial<RestaurantTable> = {
      status,
      currentOrderId: currentOrderId !== undefined ? currentOrderId : null,
      updatedAt: new Date().toISOString(),
    };

    try {
      await updateDoc(doc(db, 'tables', tableId), payload);
    } catch (error) {
      if (!isOnline) {
        await saveOfflineMutation({
          id: `mut_tbl_${tableId}_${Date.now()}`,
          collection: 'tables',
          docId: tableId,
          type: 'update',
          payload,
          createdAt: new Date().toISOString(),
        });
      } else {
        handleFirestoreError(error, OperationType.UPDATE, `tables/${tableId}`);
      }
    }
  };

  const addTable = async (name: string, number: number, type: 'table' | 'bar', seats: number) => {
    if (!isAdmin) return;
    const newTable: RestaurantTable = {
      id: `table-${Date.now()}`,
      name,
      number,
      type,
      active: true,
      status: 'libre',
      seats,
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'tables', newTable.id), newTable);
      await addAuditLog('create', 'tables', newTable.id, 'Creación de mesa/barra', `Nombre: ${name}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tables');
    }
  };

  const toggleTableActive = async (tableId: string) => {
    if (!isAdmin) return;
    const current = tables.find(t => t.id === tableId);
    if (!current) return;

    try {
      await updateDoc(doc(db, 'tables', tableId), {
        active: !current.active,
        updatedAt: new Date().toISOString(),
      });
      await addAuditLog('toggle_active', 'tables', tableId, 'Cambio de activación de mesa');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tables/${tableId}`);
    }
  };

  // --------------------------------------------------------------------------
  // ORDER MANAGEMENT
  // --------------------------------------------------------------------------
  const createNewOrder = (serviceType: ServiceType, table?: RestaurantTable): RestaurantOrder => {
    const dateStr = getCostaRicaDateString();
    const prefix = serviceType === 'mesa' ? 'M' : serviceType === 'ventana' ? 'V' : 'E';

    const resolvedTable =
      serviceType === 'mesa'
        ? table || selectedTable || tables.find(t => t.active && t.status === 'libre') || tables.find(t => t.active) || tables[0]
        : undefined;

    // Find highest existing sequence number for this prefix today to prevent multi-device duplicates
    const existingSeqNumbers = orders
      .filter(o => o.operationalDate === dateStr && o.orderNumber?.startsWith(`${prefix}-`))
      .map(o => {
        const numPart = parseInt(o.orderNumber.replace(`${prefix}-`, ''), 10);
        return isNaN(numPart) ? 0 : numPart;
      });
    const maxSeq = existingSeqNumbers.length > 0 ? Math.max(...existingSeqNumbers) : 0;
    const orderNumber = generateOrderNumber(serviceType, maxSeq + 1);
    const nowIso = new Date().toISOString();

    const newOrder: RestaurantOrder = {
      id: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orderNumber,
      serviceType,
      ...(resolvedTable ? { tableId: resolvedTable.id, tableName: resolvedTable.name } : {}),
      items: [],
      status: 'pending',
      paymentStatus: 'unpaid',
      subtotal: 0,
      serviceCharge: 0,
      total: 0,
      operationalDate: dateStr,
      createdBy: appUser?.displayName || 'Colaborador',
      createdAt: nowIso,
      updatedAt: nowIso,
      changeHistory: [
        {
          timestamp: nowIso,
          user: appUser?.displayName || 'Colaborador',
          action: 'Creación de comanda',
          details: `Servicio: ${serviceType.toUpperCase()}${resolvedTable ? ` (${resolvedTable.name})` : ''}`,
        },
      ],
    };

    return sanitizeForFirestore(newOrder);
  };

  const addItemToCurrentOrder = (product: ProductItem, protein?: CasadoProtein, notes?: string) => {
    if (product.isCasado && !protein) {
      return;
    }

    const cleanNotes = notes?.trim() || undefined;

    setCurrentOrder(prevOrder => {
      let baseOrder = prevOrder;
      if (!baseOrder) {
        const defaultTable =
          selectedTable ||
          tables.find(t => t.active && t.status === 'libre') ||
          tables.find(t => t.active) ||
          tables[0];
        if (!selectedTable && defaultTable) {
          setSelectedTable(defaultTable);
        }
        baseOrder = createNewOrder(defaultTable ? 'mesa' : 'ventana', defaultTable);
      }

      const existingIndex = baseOrder.items.findIndex(
        item =>
          item.productId === product.id &&
          (item.selectedProtein || undefined) === (protein || undefined) &&
          (item.notes || '') === (cleanNotes || '')
      );

      let updatedItems: OrderLineItem[];

      if (existingIndex >= 0) {
        updatedItems = baseOrder.items.map((item, idx) => {
          if (idx === existingIndex) {
            const newQty = item.quantity + 1;
            return {
              ...item,
              quantity: newQty,
              subtotal: newQty * item.price,
            };
          }
          return item;
        });
      } else {
        const newItem: OrderLineItem = {
          id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
          isCasado: Boolean(product.isCasado),
          ...(protein ? { selectedProtein: protein } : {}),
          ...(cleanNotes ? { notes: cleanNotes } : {}),
          subtotal: product.price,
        };
        updatedItems = [...baseOrder.items, newItem];
      }

      const { subtotal, serviceCharge, total } = calculateOrderTotals(updatedItems, baseOrder.serviceType);

      return sanitizeForFirestore({
        ...baseOrder,
        items: updatedItems,
        subtotal,
        serviceCharge,
        total,
        updatedAt: new Date().toISOString(),
      });
    });
  };

  const updateOrderItemQuantity = (lineItemId: string, delta: number) => {
    setCurrentOrder(prevOrder => {
      if (!prevOrder) return prevOrder;

      const updatedItems = prevOrder.items
        .map(item => {
          if (item.id === lineItemId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            return {
              ...item,
              quantity: newQty,
              subtotal: newQty * item.price,
            };
          }
          return item;
        })
        .filter(Boolean) as OrderLineItem[];

      const { subtotal, serviceCharge, total } = calculateOrderTotals(updatedItems, prevOrder.serviceType);

      return sanitizeForFirestore({
        ...prevOrder,
        items: updatedItems,
        subtotal,
        serviceCharge,
        total,
        updatedAt: new Date().toISOString(),
      });
    });
  };

  const removeOrderItem = (lineItemId: string) => {
    setCurrentOrder(prevOrder => {
      if (!prevOrder) return prevOrder;

      const updatedItems = prevOrder.items.filter(item => item.id !== lineItemId);
      const { subtotal, serviceCharge, total } = calculateOrderTotals(updatedItems, prevOrder.serviceType);

      return sanitizeForFirestore({
        ...prevOrder,
        items: updatedItems,
        subtotal,
        serviceCharge,
        total,
        updatedAt: new Date().toISOString(),
      });
    });
  };

  const setOrderObservations = (observations: string) => {
    setCurrentOrder(prevOrder => {
      if (!prevOrder) return prevOrder;
      return sanitizeForFirestore({
        ...prevOrder,
        observations,
        updatedAt: new Date().toISOString(),
      });
    });
  };

  const saveActiveOrder = async (): Promise<{ success: boolean; order?: RestaurantOrder; error?: string }> => {
    if (!currentOrder || currentOrder.items.length === 0) {
      return { success: false, error: 'Agregue al menos un producto antes de guardar la comanda.' };
    }

    const nowIso = new Date().toISOString();

    // Ensure mesa orders always have a valid table assigned
    let resolvedTableId = currentOrder.tableId;
    let resolvedTableName = currentOrder.tableName;
    if (currentOrder.serviceType === 'mesa' && !resolvedTableId) {
      const fallbackTable =
        selectedTable ||
        tables.find(t => t.active && t.status === 'libre') ||
        tables.find(t => t.active) ||
        tables[0];
      if (fallbackTable) {
        resolvedTableId = fallbackTable.id;
        resolvedTableName = fallbackTable.name;
        if (!selectedTable) {
          setSelectedTable(fallbackTable);
        }
      }
    }

    // Detect collision on orderNumber
    let finalOrderNumber = currentOrder.orderNumber;
    const hasCollision = orders.some(
      o =>
        o.id !== currentOrder.id &&
        o.operationalDate === currentOrder.operationalDate &&
        o.orderNumber === finalOrderNumber
    );

    if (hasCollision) {
      const prefix = currentOrder.serviceType === 'mesa' ? 'M' : currentOrder.serviceType === 'ventana' ? 'V' : 'E';
      const existingSeqNumbers = orders
        .filter(o => o.operationalDate === currentOrder.operationalDate && o.orderNumber?.startsWith(`${prefix}-`))
        .map(o => {
          const numPart = parseInt(o.orderNumber.replace(`${prefix}-`, ''), 10);
          return isNaN(numPart) ? 0 : numPart;
        });
      const maxSeq = existingSeqNumbers.length > 0 ? Math.max(...existingSeqNumbers) : 0;
      finalOrderNumber = generateOrderNumber(currentOrder.serviceType, maxSeq + 1);
    }

    const orderToSave: RestaurantOrder = sanitizeForFirestore({
      ...currentOrder,
      orderNumber: finalOrderNumber,
      ...(resolvedTableId ? { tableId: resolvedTableId, tableName: resolvedTableName } : {}),
      status: currentOrder.status === 'pending' ? 'in_kitchen' : currentOrder.status,
      updatedAt: nowIso,
      changeHistory: [
        ...(currentOrder.changeHistory || []),
        {
          timestamp: nowIso,
          user: appUser?.displayName || 'Colaborador',
          action: currentOrder.status === 'pending' ? 'Envío a cocina' : 'Actualización de comanda',
          details: `${currentOrder.items.length} productos - Total: ₡${currentOrder.total}`,
        },
      ],
    });

    try {
      if (isOnline) {
        await runTransaction(db, async transaction => {
          // --- PHASE 1: ALL TRANSACTIONAL READS FIRST ---
          const orderRef = doc(db, 'orders', orderToSave.id);
          let tableRef: any = null;
          let tableSnap: any = null;
          let conflictOrderSnap: any = null;

          if (orderToSave.tableId) {
            tableRef = doc(db, 'tables', orderToSave.tableId);
            tableSnap = await transaction.get(tableRef);
            if (tableSnap.exists()) {
              const tData = tableSnap.data() as RestaurantTable;
              if (
                tData.status === 'activa' &&
                tData.currentOrderId &&
                tData.currentOrderId !== orderToSave.id
              ) {
                const conflictOrderRef = doc(db, 'orders', tData.currentOrderId);
                conflictOrderSnap = await transaction.get(conflictOrderRef);
              }
            }
          }

          // --- PHASE 2: VALIDATION & ALL TRANSACTIONAL WRITES ---
          if (orderToSave.tableId && tableRef) {
            if (tableSnap && tableSnap.exists()) {
              const tData = tableSnap.data() as RestaurantTable;
              if (
                tData.status === 'activa' &&
                tData.currentOrderId &&
                tData.currentOrderId !== orderToSave.id &&
                conflictOrderSnap &&
                conflictOrderSnap.exists()
              ) {
                const cOrd = conflictOrderSnap.data() as RestaurantOrder;
                if (cOrd.status !== 'cancelled' && cOrd.paymentStatus !== 'paid') {
                  throw new Error(
                    `Conflicto en salón: La mesa ${tData.name} ya tiene una comanda activa (${cOrd.orderNumber}) en otro terminal.`
                  );
                }
              }

              transaction.update(tableRef, {
                status: 'activa',
                currentOrderId: orderToSave.id,
                updatedAt: nowIso,
              });
            } else {
              const localTable = tables.find(t => t.id === orderToSave.tableId);
              transaction.set(
                tableRef,
                sanitizeForFirestore({
                  id: orderToSave.tableId,
                  name: orderToSave.tableName || localTable?.name || 'Mesa',
                  number: localTable?.number || 1,
                  type: localTable?.type || 'table',
                  active: true,
                  seats: localTable?.seats || 4,
                  status: 'activa',
                  currentOrderId: orderToSave.id,
                  updatedAt: nowIso,
                })
              );
            }
          }

          transaction.set(orderRef, orderToSave);
        });
      } else {
        await saveOfflineOrder(orderToSave);
        const count = await getOfflinePendingCount();
        setPendingOfflineCount(count);
      }

      // Optimistic local state update so UI reflects saved order immediately
      setCurrentOrder(orderToSave);
      setOrders(prev => {
        const existsIdx = prev.findIndex(o => o.id === orderToSave.id);
        if (existsIdx >= 0) {
          const updated = [...prev];
          updated[existsIdx] = orderToSave;
          return updated;
        }
        return [orderToSave, ...prev];
      });
      if (orderToSave.tableId) {
        setTables(prev =>
          prev.map(t =>
            t.id === orderToSave.tableId
              ? { ...t, status: 'activa', currentOrderId: orderToSave.id, updatedAt: nowIso }
              : t
          )
        );
      }

      return { success: true, order: orderToSave };
    } catch (error: any) {
      if (!isOnline) {
        await saveOfflineOrder(orderToSave);
        const count = await getOfflinePendingCount();
        setPendingOfflineCount(count);
        setCurrentOrder(orderToSave);
        return { success: true, order: orderToSave };
      } else {
        console.error('Error guardando orden:', error);
        return { success: false, error: error.message || 'Error guardando la comanda en la base de datos.' };
      }
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    const order = orders.find(o => o.id === orderId) || (currentOrder?.id === orderId ? currentOrder : null);
    if (!order) return;

    const nowIso = new Date().toISOString();
    const updatedHistory = [
      ...(order.changeHistory || []),
      {
        timestamp: nowIso,
        user: appUser?.displayName || 'Colaborador',
        action: `Cambio de estado: ${newStatus.toUpperCase()}`,
        details: `De ${order.status} a ${newStatus}`,
      },
    ];

    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: newStatus,
        updatedAt: nowIso,
        changeHistory: updatedHistory,
      });

      if (currentOrder && currentOrder.id === orderId) {
        setCurrentOrder({
          ...currentOrder,
          status: newStatus,
          updatedAt: nowIso,
          changeHistory: updatedHistory,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const cancelOrder = async (orderId: string, reason: string) => {
    if (!isAdmin) {
      throw new Error('Seguridad: Solo los administradores pueden anular órdenes confirmadas.');
    }

    const order = orders.find(o => o.id === orderId) || (currentOrder?.id === orderId ? currentOrder : null);
    if (!order) return;

    if (order.status === 'cancelled') {
      throw new Error('Esta orden ya fue anulada previamente.');
    }

    const nowIso = new Date().toISOString();

    try {
      await runTransaction(db, async transaction => {
        // --- PHASE 1: ALL READS FIRST ---
        const orderRef = doc(db, 'orders', orderId);
        const orderSnap = await transaction.get(orderRef);
        const liveOrder = orderSnap.exists() ? (orderSnap.data() as RestaurantOrder) : order;

        if (liveOrder.status === 'cancelled') {
          return;
        }

        const wasPaid = liveOrder.paymentStatus === 'paid';
        const hadInventoryDeducted = Boolean(liveOrder.inventoryDeducted);

        // 1. Read Cash Register if was paid
        let regData: any = null;
        const regRef = doc(db, 'cash_registers', cashRegister.id);
        if (wasPaid) {
          const regSnap = await transaction.get(regRef);
          if (regSnap.exists()) {
            regData = regSnap.data();
          }
        }

        // 2. Read inventory items to restore if inventory was deducted
        const itemsToRestore: Record<string, { itemId: string; itemName: string; quantity: number; unit?: any }> = {};
        if (hadInventoryDeducted && liveOrder.items && liveOrder.items.length > 0) {
          for (const item of liveOrder.items) {
            const recipe = recipes.find(r => {
              if (item.isCasado || item.selectedProtein) {
                return (
                  r.productId === item.productId &&
                  r.protein?.toLowerCase() === item.selectedProtein?.toLowerCase()
                );
              }
              return r.productId === item.productId;
            });

            if (recipe && recipe.autoDeductEnabled !== false && recipe.ingredients) {
              for (const ing of recipe.ingredients) {
                const qtyToReturn = Math.round(Number(ing.quantity || 0) * Number(item.quantity || 1) * 1000) / 1000;
                if (!itemsToRestore[ing.itemId]) {
                  itemsToRestore[ing.itemId] = {
                    itemId: ing.itemId,
                    itemName: ing.itemName,
                    quantity: qtyToReturn,
                    unit: ing.unit,
                  };
                } else {
                  itemsToRestore[ing.itemId].quantity =
                    Math.round((itemsToRestore[ing.itemId].quantity + qtyToReturn) * 1000) / 1000;
                }
              }
            }
          }
        }

        const invSnaps: Record<string, any> = {};
        for (const itemId of Object.keys(itemsToRestore)) {
          const itemDocRef = doc(db, 'inventory_items', itemId);
          const snap = await transaction.get(itemDocRef);
          invSnaps[itemId] = snap;
        }

        // --- PHASE 2: ALL WRITES ---
        // 1. Revert cash register totals if was paid
        if (wasPaid && regData) {
          const isCash = liveOrder.paymentMethod === 'efectivo';
          const isSinpe = liveOrder.paymentMethod === 'sinpe';
          const isCard = liveOrder.paymentMethod === 'tarjeta';

          const newCashSales = Math.max(0, (regData.cashSales || 0) - (isCash ? liveOrder.total : 0));
          const newSinpeSales = Math.max(0, (regData.sinpeSales || 0) - (isSinpe ? liveOrder.total : 0));
          const newCardSales = Math.max(0, (regData.cardSales || 0) - (isCard ? liveOrder.total : 0));
          const newExpectedCash = Math.max(
            0,
            (regData.initialCash || 0) +
              newCashSales -
              (regData.cashPurchases || 0) -
              (regData.cashExpenses || 0)
          );

          transaction.update(regRef, {
            cashSales: newCashSales,
            sinpeSales: newSinpeSales,
            cardSales: newCardSales,
            expectedCash: newExpectedCash,
          });

          // Record reversal cash movement
          const revMovId = `mov_rev_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
          const revMovRef = doc(db, 'cash_movements', revMovId);
          transaction.set(revMovRef, {
            id: revMovId,
            registerId: cashRegister.id,
            type: 'adjustment',
            amount: -liveOrder.total,
            paymentMethod: liveOrder.paymentMethod || 'efectivo',
            referenceId: liveOrder.orderNumber,
            description: `Reversión por anulación de comanda ${liveOrder.orderNumber} (Motivo: ${reason})`,
            performedBy: appUser?.displayName || currentUser?.email || 'Administrador',
            createdAt: nowIso,
          });
        }

        // 2. Free Table if assigned
        if (liveOrder.tableId) {
          const tableRef = doc(db, 'tables', liveOrder.tableId);
          transaction.update(tableRef, {
            status: 'libre',
            currentOrderId: null,
            updatedAt: nowIso,
          });
        }

        // 3. Restore inventory items if inventory was deducted
        if (hadInventoryDeducted) {
          for (const [itemId, restoreInfo] of Object.entries(itemsToRestore)) {
            const snap = invSnaps[itemId];
            if (snap && snap.exists()) {
              const liveInv = snap.data() as InventoryItem;
              const prevStock = Number(liveInv.currentStock) || 0;
              const newStock = Math.round((prevStock + restoreInfo.quantity) * 1000) / 1000;

              transaction.update(doc(db, 'inventory_items', itemId), {
                currentStock: newStock,
                updatedAt: nowIso,
              });

              const rstMovId = `mov_rst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
              const rstMovRef = doc(db, 'inventory_movements', rstMovId);
              transaction.set(rstMovRef, {
                id: rstMovId,
                itemId,
                itemName: liveInv.name || restoreInfo.itemName,
                type: 'adjustment',
                quantity: restoreInfo.quantity,
                previousStock: prevStock,
                newStock,
                unit: liveInv.unit || restoreInfo.unit,
                unitCost: liveInv.averageCost || liveInv.lastPurchaseCost || 0,
                referenceId: liveOrder.orderNumber,
                reason: `Reposición por anulación de comanda ${liveOrder.orderNumber} (${reason})`,
                performedBy: appUser?.displayName || currentUser?.email || 'Administrador',
                performedByEmail: currentUser?.email || undefined,
                createdAt: nowIso,
              });
            }
          }
        }

        // 4. Update order document with immutable history
        const updatedHistory = [
          ...(liveOrder.changeHistory || []),
          {
            timestamp: nowIso,
            user: appUser?.displayName || currentUser?.email || 'Administrador',
            action: 'Anulación de comanda',
            details: `Motivo: ${reason}${wasPaid ? ' (Venta revertida en caja)' : ''}${
              hadInventoryDeducted ? ' (Insumos repuestos en inventario)' : ''
            }`,
          },
        ];

        transaction.update(orderRef, {
          status: 'cancelled',
          paymentStatus: wasPaid ? 'unpaid' : liveOrder.paymentStatus,
          inventoryDeducted: false,
          cancellationReason: reason,
          updatedAt: nowIso,
          changeHistory: updatedHistory,
        });

        // 5. Audit Log with anti-spoofing identity
        const auditId = `aud_cncl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const auditRef = doc(db, 'audit_logs', auditId);
        transaction.set(auditRef, {
          id: auditId,
          action: 'cancel_order',
          collection: 'orders',
          documentId: orderId,
          reason,
          performedBy: appUser?.displayName || currentUser?.email || 'Administrador',
          performedByUid: currentUser?.uid || '',
          performedByEmail: currentUser?.email || '',
          timestamp: nowIso,
          details: `Comanda ${liveOrder.orderNumber} por ₡${liveOrder.total} anulada.${
            wasPaid ? ' Reversión de caja aplicada.' : ''
          }${hadInventoryDeducted ? ' Inventario restituido.' : ''}`,
        });
      });

      if (currentOrder?.id === orderId) {
        setCurrentOrder(null);
      }
      if (selectedTable?.id === order.tableId) {
        setSelectedTable(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
      throw error;
    }
  };

  // --------------------------------------------------------------------------
  // KITCHEN TICKETS (80mm)
  // --------------------------------------------------------------------------
  const printOrderTicket = async (order: RestaurantOrder) => {
    const isReprint = kitchenTickets.some(t => t.orderId === order.id);
    const reprintCount = kitchenTickets.filter(t => t.orderId === order.id).length;

    const ticket = sanitizeForFirestore(createKitchenTicketFromOrder(order, isReprint, reprintCount));

    try {
      await setDoc(doc(db, 'kitchen_tickets', ticket.id), ticket);
    } catch (err) {
      console.warn('Error registrando ticket en Firestore:', err);
    }

    setActiveTicketToPrint(ticket);
    printKitchenTicket(ticket);
  };

  // --------------------------------------------------------------------------
  // CHECKOUT WITH SECURE FIRESTORE TRANSACTION
  // --------------------------------------------------------------------------
  const completeOrderPayment = async (
    orderId: string,
    method: PaymentMethod,
    receivedCash?: number
  ): Promise<{ success: boolean; change?: number; error?: string }> => {
    const order = orders.find(o => o.id === orderId) || (currentOrder?.id === orderId ? currentOrder : null);
    if (!order) {
      return { success: false, error: 'Orden no encontrada.' };
    }

    if (order.paymentStatus === 'paid') {
      return { success: false, error: 'Esta orden ya fue cobrada previamente en otro dispositivo.' };
    }

    let change = 0;
    if (method === 'efectivo' && receivedCash !== undefined) {
      if (receivedCash < order.total) {
        return { success: false, error: `Efectivo insuficiente. Total es ${order.total} y se entregaron ${receivedCash}.` };
      }
      change = receivedCash - order.total;
    }

    const nowIso = new Date().toISOString();
    const movementId = `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const movement: CashMovement = sanitizeForFirestore({
      id: movementId,
      registerId: cashRegister.id,
      type: 'sale',
      amount: order.total,
      paymentMethod: method,
      referenceId: order.orderNumber,
      description: `Venta orden ${order.orderNumber} (${order.serviceType})`,
      performedBy: appUser?.displayName || 'Colaborador',
      createdAt: nowIso,
    });

    try {
      // Execute atomic transaction on Firestore
      await runTransaction(db, async transaction => {
        // --- PHASE 1: ALL READS FIRST ---
        // 1. Order Read
        const orderRef = doc(db, 'orders', orderId);
        const orderSnap = await transaction.get(orderRef);
        let liveOrder: RestaurantOrder = order;

        if (orderSnap.exists()) {
          liveOrder = orderSnap.data() as RestaurantOrder;
          if (liveOrder.paymentStatus === 'paid') {
            throw new Error('Esta orden ya fue pagada en otro terminal.');
          }
        }

        // 1b. Table Read (if order is associated with a table)
        let tableRef: any = null;
        let tableSnap: any = null;
        if (order.tableId) {
          tableRef = doc(db, 'tables', order.tableId);
          tableSnap = await transaction.get(tableRef);
        }

        // 2. Cash Register Read
        const regRef = doc(db, 'cash_registers', cashRegister.id);
        const regSnap = await transaction.get(regRef);

        // 3. Plan Inventory Deductions via Recipes (if not already deducted)
        const shouldDeductInventory = !liveOrder.inventoryDeducted;
        const deductionsMap: Record<
          string,
          { itemId: string; itemName: string; quantity: number; unit: any; unitCost: number }
        > = {};

        if (shouldDeductInventory && liveOrder.items && liveOrder.items.length > 0) {
          for (const item of liveOrder.items) {
            // Match recipe: if Casado, match by protein; else by productId
            const matchedRecipe = recipes.find(r => {
              if (item.isCasado || item.selectedProtein) {
                return (
                  r.productId === item.productId &&
                  r.protein?.toLowerCase() === item.selectedProtein?.toLowerCase()
                );
              }
              return r.productId === item.productId;
            });

            if (matchedRecipe && matchedRecipe.autoDeductEnabled !== false && matchedRecipe.ingredients) {
              for (const ing of matchedRecipe.ingredients) {
                const consumed = Math.round(Number(ing.quantity || 0) * Number(item.quantity || 1) * 1000) / 1000;
                if (!deductionsMap[ing.itemId]) {
                  deductionsMap[ing.itemId] = {
                    itemId: ing.itemId,
                    itemName: ing.itemName,
                    quantity: consumed,
                    unit: ing.unit,
                    unitCost: ing.unitCost || 0,
                  };
                } else {
                  deductionsMap[ing.itemId].quantity =
                    Math.round((deductionsMap[ing.itemId].quantity + consumed) * 1000) / 1000;
                }
              }
            }
          }
        }

        // 4. Read all matching inventory item documents in transaction
        const invItemSnaps: Record<string, any> = {};
        for (const itemId of Object.keys(deductionsMap)) {
          const invDocRef = doc(db, 'inventory_items', itemId);
          const snap = await transaction.get(invDocRef);
          invItemSnaps[itemId] = snap;
        }

        // --- PHASE 2: ALL WRITES ---
        // 1. Order Update / Set
        const changeHistoryEntry = {
          timestamp: nowIso,
          user: appUser?.displayName || 'Colaborador',
          action: 'Cobro de orden',
          details: `Método: ${method.toUpperCase()} - Total: ₡${order.total}${
            shouldDeductInventory ? ' (Descuento automático de inventario ejecutado)' : ''
          }`,
        };

        if (!orderSnap.exists()) {
          transaction.set(
            orderRef,
            sanitizeForFirestore({
              ...order,
              status: 'completed',
              paymentStatus: 'paid',
              paymentMethod: method,
              paidAt: nowIso,
              updatedAt: nowIso,
              inventoryDeducted: true,
              inventoryDeductedAt: nowIso,
              changeHistory: [...(order.changeHistory || []), changeHistoryEntry],
            })
          );
        } else {
          transaction.update(
            orderRef,
            sanitizeForFirestore({
              status: 'completed',
              paymentStatus: 'paid',
              paymentMethod: method,
              paidAt: nowIso,
              updatedAt: nowIso,
              inventoryDeducted: true,
              inventoryDeductedAt: nowIso,
              changeHistory: [...(liveOrder.changeHistory || []), changeHistoryEntry],
            })
          );
        }

        // 2. Free Table atomically
        if (order.tableId && tableRef && tableSnap && tableSnap.exists()) {
          transaction.update(tableRef, {
            status: 'libre',
            currentOrderId: null,
            updatedAt: nowIso,
          });
        }

        // 3. Update active Cash Register totals
        if (regSnap.exists()) {
          const regData = regSnap.data();
          const isCash = method === 'efectivo';
          const isSinpe = method === 'sinpe';
          const isCard = method === 'tarjeta';

          const newCashSales = (regData.cashSales || 0) + (isCash ? order.total : 0);
          const newSinpeSales = (regData.sinpeSales || 0) + (isSinpe ? order.total : 0);
          const newCardSales = (regData.cardSales || 0) + (isCard ? order.total : 0);
          const newExpectedCash =
            (regData.initialCash || 0) +
            newCashSales -
            (regData.cashPurchases || 0) -
            (regData.cashExpenses || 0);

          transaction.update(regRef, {
            cashSales: newCashSales,
            sinpeSales: newSinpeSales,
            cardSales: newCardSales,
            expectedCash: newExpectedCash,
          });
        }

        // 4. Create single idempotent cash movement
        const movRef = doc(db, 'cash_movements', movementId);
        transaction.set(movRef, movement);

        // 5. Deduct inventory items and generate atomic consumption movements
        if (shouldDeductInventory) {
          for (const [itemId, deduction] of Object.entries(deductionsMap)) {
            const snap = invItemSnaps[itemId];
            if (snap && snap.exists()) {
              const liveInv = snap.data() as InventoryItem;
              const prevStock = Number(liveInv.currentStock) || 0;
              const newStock = Math.round((prevStock - deduction.quantity) * 1000) / 1000;

              transaction.update(doc(db, 'inventory_items', itemId), {
                currentStock: newStock,
                updatedAt: nowIso,
              });

              const cnsMovId = `mov_cns_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
              const cnsMovRef = doc(db, 'inventory_movements', cnsMovId);
              transaction.set(cnsMovRef, {
                id: cnsMovId,
                itemId,
                itemName: liveInv.name || deduction.itemName,
                type: 'consumption',
                quantity: -deduction.quantity,
                previousStock: prevStock,
                newStock,
                unit: liveInv.unit || deduction.unit,
                unitCost: liveInv.averageCost || liveInv.lastPurchaseCost || deduction.unitCost,
                referenceId: liveOrder.orderNumber,
                reason: `Consumo comanda ${liveOrder.orderNumber} (${liveOrder.serviceType})`,
                performedBy: appUser?.displayName || 'Colaborador',
                performedByEmail: currentUser?.email || undefined,
                createdAt: nowIso,
              });
            }
          }
        }
      });

      if (selectedTable?.id === order.tableId) {
        setSelectedTable(null);
      }

      return { success: true, change };
    } catch (error: any) {
      if (!isOnline) {
        // Fallback to offline queue
        await saveOfflineOrder({
          ...order,
          status: 'completed',
          paymentStatus: 'paid',
          paymentMethod: method,
          paidAt: nowIso,
          updatedAt: nowIso,
        });
        const count = await getOfflinePendingCount();
        setPendingOfflineCount(count);
        return { success: true, change };
      }

      console.error('Error en transacción de cobro:', error);
      return { success: false, error: error.message || 'Error en la transacción contable.' };
    }
  };

  const recordPhysicalCount = async (actualCash: number, countNotes?: string) => {
    if (!isAdmin) {
      throw new Error('Restricción: Solo el Administrador puede registrar arqueos físicos de caja.');
    }

    const difference = actualCash - cashRegister.expectedCash;
    const payload = {
      actualCash,
      difference,
      notes: countNotes || cashRegister.notes || '',
    };

    try {
      await updateDoc(doc(db, 'cash_registers', cashRegister.id), payload);
      await addAuditLog(
        'cash_count',
        'cash_registers',
        cashRegister.id,
        'Arqueo físico de caja',
        `Esperado: ₡${cashRegister.expectedCash} - Físico: ₡${actualCash} - Dif: ₡${difference}`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cash_registers/${cashRegister.id}`);
    }
  };

  const openNewDayRegister = async (initialFloat: number) => {
    if (!isAdmin) return;

    const dateStr = getCostaRicaDateString();
    const newRegId = `reg_${dateStr}_${Date.now()}`;
    const newRegister: CashRegister = {
      id: newRegId,
      date: dateStr,
      status: 'open',
      openedAt: new Date().toISOString(),
      openedBy: appUser?.displayName || 'Administrador',
      initialCash: initialFloat,
      cashSales: 0,
      sinpeSales: 0,
      cardSales: 0,
      cashPurchases: 0,
      cashExpenses: 0,
      expectedCash: initialFloat,
    };

    try {
      await setDoc(doc(db, 'cash_registers', newRegId), newRegister);
      setCashRegister(newRegister);
      await addAuditLog('open_register', 'cash_registers', newRegId, 'Apertura de turno de caja', `Fondo inicial: ₡${initialFloat}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'cash_registers');
    }
  };

  // --------------------------------------------------------------------------
  // INVENTORY & PURCHASES WITH FIRESTORE TRANSACTIONS
  // --------------------------------------------------------------------------
  const addPurchase = async (purchaseData: Omit<PurchaseRecord, 'id' | 'createdAt' | 'registeredBy'>) => {
    if (!isAdmin) {
      throw new Error('Seguridad: Solo administradores pueden registrar compras de insumos.');
    }

    const nowIso = new Date().toISOString();
    const newPurchaseId = `pur_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newPurchase: PurchaseRecord = {
      ...purchaseData,
      id: newPurchaseId,
      registeredBy: appUser?.displayName || 'Administrador',
      createdAt: nowIso,
    };

    try {
      await runTransaction(db, async transaction => {
        // --- PHASE 1: ALL TRANSACTIONAL READS FIRST ---
        // 0. Unique invoice locking to prevent concurrent duplicate invoices across devices
        const cleanVendor = (newPurchase.vendor || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        const cleanInvoiceNum = (newPurchase.purchaseNumber || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        let invoiceLockRef: any = null;
        if (cleanVendor.length > 0 && cleanInvoiceNum.length > 0) {
          const lockDocId = `lock_${cleanVendor}__${cleanInvoiceNum}`;
          invoiceLockRef = doc(db, 'purchase_invoice_locks', lockDocId);
          const lockSnap = await transaction.get(invoiceLockRef);
          if (lockSnap.exists()) {
            const existingLock = lockSnap.data() as any;
            throw new Error(
              `FACTURA_DUPLICADA: La factura #${newPurchase.purchaseNumber} del proveedor "${newPurchase.vendor}" ya fue registrada previamente ` +
              `(Fecha: ${existingLock?.registeredAt ? new Date(existingLock.registeredAt).toLocaleDateString() : 'N/A'}, Total: ₡${Number(existingLock?.total || 0).toLocaleString()}). ` +
              `Operación rechazada automáticamente.`
            );
          }
        }

        // 1. Read cash register if paying from cash drawer
        let regData: any = null;
        const regRef = doc(db, 'cash_registers', cashRegister.id);
        if (newPurchase.paidFromCashRegister && newPurchase.paymentMethod === 'efectivo') {
          const regSnap = await transaction.get(regRef);
          if (regSnap.exists()) {
            regData = regSnap.data();
          }
        }

        // 2. Read matching inventory items
        const itemPlan: {
          purchaseItem: PurchaseLineItem;
          invRef: any;
          existingData: InventoryItem | null;
          isNew: boolean;
        }[] = [];

        for (const pItem of newPurchase.items) {
          const nameToMatch = (pItem.normalizedName || pItem.name).trim().toLowerCase();
          const existing = inventory.find(inv => inv.name.trim().toLowerCase() === nameToMatch);

          if (existing) {
            const invRef = doc(db, 'inventory_items', existing.id);
            const snap = await transaction.get(invRef);
            itemPlan.push({
              purchaseItem: pItem,
              invRef,
              existingData: snap.exists() ? (snap.data() as InventoryItem) : existing,
              isNew: false,
            });
          } else {
            const newItemId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const invRef = doc(db, 'inventory_items', newItemId);
            itemPlan.push({
              purchaseItem: pItem,
              invRef,
              existingData: null,
              isNew: true,
            });
          }
        }

        // --- PHASE 2: ALL TRANSACTIONAL WRITES ---
        // 1. Save purchase document
        const purRef = doc(db, 'purchases', newPurchaseId);
        transaction.set(purRef, newPurchase);

        // 2. Update cash register and record cash movement if paid in cash
        if (regData && newPurchase.paidFromCashRegister && newPurchase.paymentMethod === 'efectivo') {
          const newCashPurchases = (regData.cashPurchases || 0) + newPurchase.total;
          const newExpectedCash = (regData.expectedCash || 0) - newPurchase.total;

          transaction.update(regRef, {
            cashPurchases: newCashPurchases,
            expectedCash: newExpectedCash,
          });

          const movId = `mov_pur_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
          const movRef = doc(db, 'cash_movements', movId);
          transaction.set(movRef, {
            id: movId,
            registerId: cashRegister.id,
            type: 'purchase',
            amount: newPurchase.total,
            paymentMethod: 'efectivo',
            referenceId: newPurchase.purchaseNumber || newPurchaseId,
            description: `Compra proveedor ${newPurchase.vendor || 'General'}`,
            performedBy: appUser?.displayName || 'Administrador',
            createdAt: nowIso,
          });
        }

        // 3. Update / Create inventory items and generate atomic inventory_movements
        for (const item of itemPlan) {
          const { purchaseItem, invRef, existingData, isNew } = item;
          const pUnit = normalizeUnitString(purchaseItem.unit);
          const pQty = Number(purchaseItem.quantity) || 0;
          const pUnitCost = Number(purchaseItem.unitCost) || 0;

          if (!isNew && existingData) {
            // Unit conversion & Weighted Average Cost
            const conversion = convertToInventoryUnit(pQty, pUnit, pUnitCost, existingData.unit);
            const convertedQty = conversion.convertedQuantity;
            const convertedUnitCost = conversion.convertedUnitCost;

            const prevStock = Number(existingData.currentStock) || 0;
            const newStock = Math.round((prevStock + convertedQty) * 1000) / 1000;

            const prevAverageCost = existingData.averageCost || existingData.lastPurchaseCost || 0;
            const newAverageCost = calculateWeightedAverageCost(
              prevStock,
              prevAverageCost,
              convertedQty,
              convertedUnitCost
            );

            transaction.update(invRef, {
              currentStock: newStock,
              lastPurchaseCost: convertedUnitCost,
              averageCost: newAverageCost,
              updatedAt: nowIso,
            });

            // Write inventory movement record
            const movId = `mov_inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const movRef = doc(db, 'inventory_movements', movId);
            const movData: InventoryMovement = {
              id: movId,
              itemId: existingData.id,
              itemName: existingData.name,
              type: 'purchase',
              quantity: convertedQty,
              previousStock: prevStock,
              newStock,
              unit: existingData.unit,
              unitCost: convertedUnitCost,
              referenceId: newPurchaseId,
              reason: `Factura ${newPurchase.purchaseNumber || 'S/N'} (${newPurchase.vendor || 'Proveedor'})`,
              performedBy: appUser?.displayName || 'Administrador',
              performedByEmail: currentUser?.email || undefined,
              createdAt: nowIso,
            };
            transaction.set(movRef, movData);
          } else {
            // New inventory item
            const newItemName = (purchaseItem.normalizedName || purchaseItem.name).trim();
            const newItem: InventoryItem = {
              id: invRef.id,
              name: newItemName,
              category: 'ingredientes',
              unit: pUnit,
              currentStock: pQty,
              lastPurchaseCost: pUnitCost,
              averageCost: pUnitCost,
              updatedAt: nowIso,
            };
            transaction.set(invRef, newItem);

            // Initial movement
            const movId = `mov_inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const movRef = doc(db, 'inventory_movements', movId);
            const movData: InventoryMovement = {
              id: movId,
              itemId: invRef.id,
              itemName: newItemName,
              type: 'purchase',
              quantity: pQty,
              previousStock: 0,
              newStock: pQty,
              unit: pUnit,
              unitCost: pUnitCost,
              referenceId: newPurchaseId,
              reason: `Ingreso inicial compra ${newPurchase.purchaseNumber || 'S/N'}`,
              performedBy: appUser?.displayName || 'Administrador',
              performedByEmail: currentUser?.email || undefined,
              createdAt: nowIso,
            };
            transaction.set(movRef, movData);
          }
        }

        // 4. Unique Invoice Lock Write (Concurrent protection)
        if (invoiceLockRef) {
          transaction.set(invoiceLockRef, {
            id: invoiceLockRef.id,
            vendor: newPurchase.vendor || 'General',
            purchaseNumber: newPurchase.purchaseNumber,
            purchaseId: newPurchaseId,
            total: newPurchase.total,
            registeredAt: nowIso,
            registeredBy: appUser?.displayName || 'Administrador',
            registeredByEmail: currentUser?.email || '',
          });
        }

        // 5. Audit Log
        const audId = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const audRef = doc(db, 'audit_logs', audId);
        transaction.set(audRef, {
          id: audId,
          action: 'add_purchase',
          collection: 'purchases',
          documentId: newPurchaseId,
          reason: 'Registro de compra con actualización de costo promedio ponderado',
          performedBy: appUser?.displayName || currentUser?.email || 'Administrador',
          performedByUid: currentUser?.uid || '',
          performedByEmail: currentUser?.email || '',
          timestamp: nowIso,
          details: `Compra ${newPurchase.purchaseNumber || 'S/N'} (${newPurchase.vendor || 'Proveedor'}) - Total: ₡${newPurchase.total} (${newPurchase.items.length} ítems)`,
        });
      });
    } catch (error: any) {
      if (error?.message && error.message.startsWith('FACTURA_DUPLICADA')) {
        throw error;
      }
      handleFirestoreError(error, OperationType.WRITE, 'purchases');
      throw error;
    }
  };

  const updateInventoryStock = async (itemId: string, newStock: number, reason: string) => {
    if (!isAdmin) return;
    const nowIso = new Date().toISOString();
    const existing = inventory.find(i => i.id === itemId);
    const prevStock = existing ? existing.currentStock : 0;
    const delta = Math.round((newStock - prevStock) * 1000) / 1000;

    try {
      await updateDoc(doc(db, 'inventory_items', itemId), {
        currentStock: newStock,
        updatedAt: nowIso,
      });

      const movementId = `mov_adj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await setDoc(doc(db, 'inventory_movements', movementId), {
        id: movementId,
        itemId,
        itemName: existing?.name || 'Insumo',
        type: 'adjustment',
        quantity: delta,
        previousStock: prevStock,
        newStock,
        unit: existing?.unit,
        reason,
        performedBy: appUser?.displayName || 'Administrador',
        performedByEmail: currentUser?.email || undefined,
        createdAt: nowIso,
      });

      await addAuditLog('inventory_adjustment', 'inventory_items', itemId, reason, `Ajuste manual de stock: ${prevStock} -> ${newStock} (${delta >= 0 ? '+' : ''}${delta})`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inventory_items/${itemId}`);
    }
  };

  // --------------------------------------------------------------------------
  // EXPENSES WITH FIRESTORE
  // --------------------------------------------------------------------------
  const addExpense = async (expenseData: Omit<OperatingExpense, 'id' | 'createdAt' | 'status'>) => {
    if (!isAdmin) return;
    const newExpId = `exp_${Date.now()}`;
    const newExp: OperatingExpense = {
      ...expenseData,
      id: newExpId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'operating_expenses', newExpId), newExp);
      await addAuditLog('add_expense', 'operating_expenses', newExpId, 'Gasto operativo registrado', `Monto: ₡${newExp.amount}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'operating_expenses');
    }
  };

  const markExpensePaid = async (expenseId: string, method: PaymentMethod, fromCash: boolean) => {
    if (!isAdmin) return;
    const nowIso = new Date().toISOString();
    const target = expenses.find(e => e.id === expenseId);
    if (!target) return;

    try {
      await updateDoc(doc(db, 'operating_expenses', expenseId), {
        status: 'paid',
        lastPaidAt: nowIso,
      });

      if (fromCash && method === 'efectivo') {
        const movId = `mov_exp_${Date.now()}`;
        await setDoc(doc(db, 'cash_movements', movId), {
          id: movId,
          registerId: cashRegister.id,
          type: 'expense',
          amount: target.amount,
          paymentMethod: 'efectivo',
          referenceId: target.name,
          description: `Pago de servicio: ${target.name}`,
          performedBy: appUser?.displayName || 'Administrador',
          createdAt: nowIso,
        });

        await updateDoc(doc(db, 'cash_registers', cashRegister.id), {
          cashExpenses: (cashRegister.cashExpenses || 0) + target.amount,
          expectedCash: (cashRegister.expectedCash || 0) - target.amount,
        });
      }

      await addAuditLog('pay_expense', 'operating_expenses', expenseId, 'Gasto pagado', `Gasto: ${target.name} - ₡${target.amount}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `operating_expenses/${expenseId}`);
    }
  };

  // --------------------------------------------------------------------------
  // RECIPES, PRODUCTS & FORMULATIONS (Fase 3)
  // --------------------------------------------------------------------------
  const saveProduct = async (product: ProductItem) => {
    if (!isAdmin) {
      throw new Error('Seguridad: Solo administradores pueden modificar productos y precios del menú.');
    }
    const cleanProduct = sanitizeForFirestore({
      ...product,
      name: product.name.trim(),
      price: Math.max(0, Number(product.price) || 0),
    });
    try {
      await setDoc(doc(db, 'products', cleanProduct.id), cleanProduct);
      await addAuditLog(
        'save_product',
        'products',
        cleanProduct.id,
        'Actualización de producto / precio de carta',
        `Producto ${cleanProduct.name} — Precio: ₡${cleanProduct.price} (${cleanProduct.active ? 'Activo' : 'Inactivo'})`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
      throw error;
    }
  };

  const saveRecipe = async (recipe: Recipe) => {
    if (!isAdmin) {
      throw new Error('Seguridad: Solo administradores pueden modificar recetas y formulaciones.');
    }
    const nowIso = new Date().toISOString();
    const updatedRecipe: Recipe = sanitizeForFirestore({
      ...recipe,
      updatedAt: nowIso,
    });
    try {
      await setDoc(doc(db, 'recipes', recipe.id), updatedRecipe);
      await addAuditLog(
        'save_recipe',
        'recipes',
        recipe.id,
        'Formulación de receta guardada',
        `Receta ${recipe.productName} (${recipe.protein || 'Estándar'}) actualizada con ${recipe.ingredients.length} insumos.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'recipes');
      throw error;
    }
  };

  const toggleRecipeAutoDeduct = async (recipeId: string) => {
    if (!isAdmin) return;
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    if (!recipe.isComplete) {
      throw new Error('No se puede activar el descuento automático en una receta incompleta o sin costeo.');
    }
    const nextVal = !recipe.autoDeductEnabled;
    try {
      await updateDoc(doc(db, 'recipes', recipeId), {
        autoDeductEnabled: nextVal,
        updatedAt: new Date().toISOString(),
      });
      await addAuditLog(
        'toggle_recipe_autodeduct',
        'recipes',
        recipeId,
        nextVal ? 'Activación descuento automático' : 'Pausa descuento automático',
        `Receta ${recipe.productName} auto-descuento: ${nextVal ? 'ACTIVO' : 'PAUSADO'}`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `recipes/${recipeId}`);
      throw error;
    }
  };

  const registerWaste = async (itemId: string, quantity: number, reason: string, customNotes?: string) => {
    if (!isAdmin) {
      throw new Error('Seguridad: Solo administradores pueden registrar mermas de inventario.');
    }
    const targetItem = inventory.find(i => i.id === itemId);
    if (!targetItem) {
      throw new Error('Insumo no encontrado en catálogo.');
    }
    const qtyToDeduct = Math.abs(quantity);
    if (qtyToDeduct <= 0) return;

    const nowIso = new Date().toISOString();
    const movementId = `mov_wst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    try {
      await runTransaction(db, async transaction => {
        const itemRef = doc(db, 'inventory_items', itemId);
        const itemSnap = await transaction.get(itemRef);
        const currentData = itemSnap.exists() ? (itemSnap.data() as InventoryItem) : targetItem;

        const prevStock = Number(currentData.currentStock) || 0;
        const newStock = Math.round((prevStock - qtyToDeduct) * 1000) / 1000;

        transaction.update(itemRef, {
          currentStock: newStock,
          updatedAt: nowIso,
        });

        const movRef = doc(db, 'inventory_movements', movementId);
        transaction.set(movRef, {
          id: movementId,
          itemId,
          itemName: currentData.name,
          type: 'waste',
          quantity: -qtyToDeduct,
          previousStock: prevStock,
          newStock,
          unit: currentData.unit,
          unitCost: currentData.averageCost || currentData.lastPurchaseCost || 0,
          reason: `${reason}${customNotes ? `: ${customNotes}` : ''}`,
          performedBy: appUser?.displayName || 'Administrador',
          performedByEmail: currentUser?.email || undefined,
          createdAt: nowIso,
        });

        const audId = `aud_wst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const audRef = doc(db, 'audit_logs', audId);
        transaction.set(audRef, {
          id: audId,
          action: 'waste_record',
          collection: 'inventory_items',
          documentId: itemId,
          reason,
          performedBy: appUser?.displayName || currentUser?.email || 'Administrador',
          performedByUid: currentUser?.uid || '',
          performedByEmail: currentUser?.email || '',
          timestamp: nowIso,
          details: `Merma de ${qtyToDeduct} ${currentData.unit} en ${currentData.name}. Motivo: ${reason}${customNotes ? ` (${customNotes})` : ''}`,
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inventory_items/${itemId}`);
      throw error;
    }
  };

  // --------------------------------------------------------------------------
  // BACKUP AND RESTORE
  // --------------------------------------------------------------------------
  const exportDataBackup = (): string => {
    if (!isAdmin) {
      throw new Error('Seguridad: Solo los administradores pueden generar respaldos del sistema.');
    }

    const backupPayload = {
      system: 'Pollos Karen Manager',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: appUser?.displayName || currentUser?.email || 'Administrador',
      tables,
      categories,
      products,
      inventory,
      recipes,
      purchases,
      expenses,
      cashRegisters: [cashRegister],
      cashMovements,
      orders,
      auditLogs,
    };

    return JSON.stringify(backupPayload, null, 2);
  };

  const restoreDataBackup = async (backupJson: string): Promise<{ success: boolean; message: string; count: number }> => {
    if (!isAdmin) {
      throw new Error('Seguridad: Solo los administradores pueden restaurar datos en el sistema.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(backupJson);
    } catch {
      throw new Error('El archivo no contiene un formato JSON válido.');
    }

    if (!parsed || parsed.system !== 'Pollos Karen Manager') {
      throw new Error('El archivo seleccionado no corresponde a una copia de seguridad oficial de Pollos Karen Manager.');
    }

    const nowIso = new Date().toISOString();
    let totalRestored = 0;

    const batch = writeBatch(db);

    if (Array.isArray(parsed.categories)) {
      for (const cat of parsed.categories) {
        if (cat.id) {
          batch.set(doc(db, 'categories', cat.id), cat);
          totalRestored++;
        }
      }
    }

    if (Array.isArray(parsed.products)) {
      for (const prod of parsed.products) {
        if (prod.id) {
          batch.set(doc(db, 'products', prod.id), prod);
          totalRestored++;
        }
      }
    }

    if (Array.isArray(parsed.tables)) {
      for (const tbl of parsed.tables) {
        if (tbl.id) {
          batch.set(doc(db, 'tables', tbl.id), tbl);
          totalRestored++;
        }
      }
    }

    if (Array.isArray(parsed.inventory)) {
      for (const inv of parsed.inventory) {
        if (inv.id) {
          batch.set(doc(db, 'inventory_items', inv.id), inv);
          totalRestored++;
        }
      }
    }

    if (Array.isArray(parsed.recipes)) {
      for (const rec of parsed.recipes) {
        if (rec.id) {
          batch.set(doc(db, 'recipes', rec.id), rec);
          totalRestored++;
        }
      }
    }

    // Create an audit log record for the data restoration
    const audId = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const audRef = doc(db, 'audit_logs', audId);
    batch.set(audRef, {
      id: audId,
      action: 'data_restore',
      collection: 'cash_registers',
      documentId: cashRegister.id,
      reason: 'Restauración de respaldo general de datos',
      performedBy: appUser?.displayName || currentUser?.email || 'Administrador',
      performedByUid: currentUser?.uid || '',
      performedByEmail: currentUser?.email || '',
      timestamp: nowIso,
      details: `Restauración ejecutada exitosamente: ${totalRestored} registros importados desde archivo exportado el ${parsed.exportedAt || 'fecha desconocida'}.`,
    });

    await batch.commit();

    return {
      success: true,
      message: `Restauración completada con éxito. Se importaron ${totalRestored} registros del sistema.`,
      count: totalRestored,
    };
  };

  return (
    <POSContext.Provider
      value={{
        tables,
        categories,
        products,
        selectedTable,
        selectTable,
        updateTableStatus,
        addTable,
        toggleTableActive,

        orders,
        currentOrder,
        setCurrentOrder,
        createNewOrder,
        addItemToCurrentOrder,
        updateOrderItemQuantity,
        removeOrderItem,
        setOrderObservations,
        saveActiveOrder,
        updateOrderStatus,
        cancelOrder,

        kitchenTickets,
        printOrderTicket,
        activeTicketToPrint,
        setActiveTicketToPrint,

        cashRegister,
        cashMovements,
        completeOrderPayment,
        recordPhysicalCount,
        openNewDayRegister,

        recipes,
        saveRecipe,
        toggleRecipeAutoDeduct,
        registerWaste,
        saveProduct,

        inventory,
        inventoryMovements,
        purchases,
        addPurchase,
        updateInventoryStock,

        expenses,
        addExpense,
        markExpensePaid,

        auditLogs,
        addAuditLog,

        exportDataBackup,
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
