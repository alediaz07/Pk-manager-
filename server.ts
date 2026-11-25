import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Read Firebase applet configuration
let firebaseConfig: any = {};
try {
  const configPath = path.join(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.warn('Advertencia: No se pudo leer firebase-applet-config.json:', e);
}

// Body parser with 15mb limit for invoice camera capture
app.use(express.json({ limit: '15mb' }));

// Master admin email fallback to prevent lockout
const PRIMARY_ADMIN_EMAIL = 'alejandrodiazortiz07@gmail.com';

// In-memory sliding window rate limiter for expensive AI operations
interface RateLimitEntry {
  count: number;
  resetTime: number;
}
const scanRateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SCANS_PER_WINDOW = 15;

function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = scanRateLimits.get(key);

  if (!entry || now > entry.resetTime) {
    scanRateLimits.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX_SCANS_PER_WINDOW) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  entry.count += 1;
  return { allowed: true };
}

// Initialize GoogleGenAI server-side with required User-Agent header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

/**
 * Verifies Firebase Auth ID Token using Google Identity Toolkit API
 */
async function verifyFirebaseIdToken(token: string): Promise<{ uid: string; email?: string }> {
  const apiKey = firebaseConfig.apiKey || process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('Falta la clave API de Firebase en la configuración del servidor.');
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    }
  );

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || 'Token de autenticación inválido o expirado.');
  }

  const data = await response.json();
  const user = data.users?.[0];
  if (!user || !user.localId) {
    throw new Error('Usuario de Firebase no encontrado para el token provisto.');
  }

  return {
    uid: user.localId,
    email: user.email,
  };
}

// Cached admin token & in-memory snapshot for Jarvis / AI read-only endpoints
let cachedAdminToken: string | null = null;
const cachedCollections: Record<string, any[]> = {
  inventory_items: [],
  orders: [],
  purchases: [],
  operating_expenses: [],
};

/**
 * Checks if the verified user has the Administrator role
 */
async function checkIsAdmin(uid: string, email?: string, idToken?: string): Promise<boolean> {
  // 1. Check primary admin email
  if (email && email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    if (idToken) cachedAdminToken = idToken;
    return true;
  }

  // 2. Query Firestore REST API for document in /admins/{uid} with Bearer token
  const projectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  const apiKey = firebaseConfig.apiKey;

  if (projectId && apiKey) {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/admins/${uid}?key=${apiKey}`;
      const headers: Record<string, string> = {};
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }
      const res = await fetch(url, { headers });
      if (res.ok) {
        if (idToken) cachedAdminToken = idToken;
        return true;
      }
    } catch (e) {
      console.warn('Error verificando rol en Firestore REST:', e);
    }
  }

  return false;
}

/**
 * Express Middleware: Requires Valid Authentication & Admin Role
 */
interface AuthenticatedRequest extends Request {
  user?: { uid: string; email?: string; isAdmin: boolean };
}

async function requireAdminAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Autenticación requerida. Proporcione un encabezado Authorization: Bearer <token>.',
    });
    return;
  }

  const token = authHeader.split('Bearer ')[1].trim();

  try {
    const verified = await verifyFirebaseIdToken(token);
    const isAdmin = await checkIsAdmin(verified.uid, verified.email, token);

    if (!isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Acceso denegado. Esta operación requiere privilegios de Administrador.',
      });
      return;
    }

    req.user = {
      uid: verified.uid,
      email: verified.email,
      isAdmin,
    };
    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: error.message || 'Token de Firebase no válido.',
    });
  }
}

/**
 * Normalization dictionary for common Costa Rican restaurant supplies
 */
function normalizeItemName(rawName: string): string {
  const lower = rawName.toLowerCase().trim();
  if (lower.includes('arroz') && !lower.includes('integral')) return 'Arroz blanco';
  if (lower.includes('arroz integral')) return 'Arroz integral';
  if (lower.includes('frijol negro') || lower.includes('frijoles negros')) return 'Frijoles negros';
  if (lower.includes('frijol rojo') || lower.includes('frijoles rojos')) return 'Frijoles rojos';
  if (lower.includes('pechuga') || (lower.includes('pollo') && lower.includes('entero'))) return 'Pollo fresco';
  if (lower.includes('aceite')) return 'Aceite para freír';
  if (lower.includes('cebolla')) return 'Cebolla blanca';
  if (lower.includes('culantro') || lower.includes('cilantro')) return 'Culantro fresco';
  if (lower.includes('platano') || lower.includes('plátano')) return 'Plátano maduro';
  if (lower.includes('posta') || lower.includes('lomo') || lower.includes('carne molida')) return 'Carne de res';
  if (lower.includes('chuleta')) return 'Chuleta de cerdo';
  if (lower.includes('pescado') || lower.includes('tilapia') || lower.includes('filete')) return 'Pescado filete';
  if (lower.includes('salsa lizano') || lower.includes('lizano')) return 'Salsa Lizano';
  return rawName.trim();
}

/**
 * POST /api/scan-invoice
 * Secure invoice OCR & parsing using gemini-3.8-flash.
 * Strictly ephemeral: no image saving to disk, storage, or telemetry logs.
 * Protected by requireAdminAuth and sliding window rate limiter.
 */
app.post(
  '/api/scan-invoice',
  requireAdminAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userKey = req.user?.uid || req.ip || 'anonymous';
      const rateLimitCheck = checkRateLimit(userKey);
      if (!rateLimitCheck.allowed) {
        res.status(429).json({
          success: false,
          error: `Límite de solicitudes alcanzado. Por favor espere ${rateLimitCheck.retryAfterSeconds} segundos antes de escanear otra factura.`,
        });
        return;
      }

      const { imageBase64, mimeType = 'image/jpeg' } = req.body;

      // Validate input presence
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ success: false, error: 'Se requiere la imagen de la factura en base64.' });
        return;
      }

      // Allowed MIME types
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedMimeTypes.includes(mimeType)) {
        res.status(400).json({
          success: false,
          error: `Formato de imagen no permitido (${mimeType}). Formatos aceptados: JPEG, PNG, WEBP.`,
        });
        return;
      }

      // Clean base64 string
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

      // Check size boundary (~10MB max binary = ~14M chars)
      if (cleanBase64.length > 14_000_000) {
        res.status(400).json({
          success: false,
          error: 'La imagen excede el límite de tamaño permitido de 10 MB.',
        });
        return;
      }

      const promptText = `Eres un auditor contable experto en Costa Rica para el restaurante Pollos Karen.
Analiza esta factura o recibo de compra comercial (supermercado, carnicería, distribuidora, feria, etc.) y extrae con total fidelidad:
1. Proveedor o emisor.
2. Fecha de emisión (en formato AAAA-MM-DD; si no es visible, calcula la fecha más probable o deja vacía).
3. Número o consecutivo de factura.
4. Total general en colones costarricenses (CRC).
5. Desglose de cada producto o insumo comprado:
   - Nombre original en factura
   - Cantidad numérica exacta
   - Unidad de medida estándar (kg, g, litro, ml, unidad, paquete, caja, lata, etc.)
   - Costo unitario (si no viene explícito, calcula costo total del renglón / cantidad)
   - Costo total de la línea

Normaliza insumos básicos con cuidado (ej. "Arroz 1.8kg" -> nombre: "Arroz Tío Pelón", normalizedName: "Arroz blanco").
Si una cifra es ambigua o borrosa, indica con honestidad el valor más certero.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text: promptText,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              vendor: { type: Type.STRING, description: 'Nombre o razón social del proveedor' },
              date: { type: Type.STRING, description: 'Fecha en formato YYYY-MM-DD' },
              invoiceNumber: { type: Type.STRING, description: 'Número de factura o tiquete' },
              total: { type: Type.NUMBER, description: 'Monto total de la factura en colones' },
              items: {
                type: Type.ARRAY,
                description: 'Lista de insumos o productos detallados',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: 'Descripción original del producto' },
                    quantity: { type: Type.NUMBER, description: 'Cantidad comprada' },
                    unit: { type: Type.STRING, description: 'Unidad de medida (kg, g, litro, unidad, etc.)' },
                    unitCost: { type: Type.NUMBER, description: 'Costo unitario calculado' },
                    totalCost: { type: Type.NUMBER, description: 'Costo total de la línea' },
                  },
                  required: ['name', 'quantity', 'unit', 'totalCost'],
                },
              },
            },
            required: ['total', 'items'],
          },
        },
      });

      const parsedData = JSON.parse(response.text || '{}');

      // Post-process items with normalization
      if (Array.isArray(parsedData.items)) {
        parsedData.items = parsedData.items.map((item: any) => {
          const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
          const total = Number(item.totalCost) || 0;
          const unitCost = Number(item.unitCost) > 0 ? Number(item.unitCost) : Math.round(total / qty);
          return {
            name: item.name || 'Insumo sin nombre',
            normalizedName: normalizeItemName(item.name || ''),
            quantity: qty,
            unit: item.unit || 'unidad',
            unitCost: unitCost,
            totalCost: total,
          };
        });
      }

      res.json({
        success: true,
        extracted: parsedData,
      });
    } catch (error: any) {
      console.error('Error procesando factura con Gemini:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al analizar la imagen de la factura.',
      });
    }
  }
);

/**
 * GET /api/cash-register/costa-rica-time
 * Provides official time for America/Costa_Rica
 */
app.get('/api/cash-register/costa-rica-time', (_req: Request, res: Response) => {
  const now = new Date();
  const crDateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' }); // YYYY-MM-DD
  const crTimeStr = now.toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour12: false });
  const [hours, minutes] = crTimeStr.split(':').map(Number);

  res.json({
    date: crDateStr,
    time: crTimeStr,
    isMidnightWindow: hours === 0 && minutes < 5,
    timestamp: now.toISOString(),
  });
});

/**
 * POST /api/ai/sync-snapshot
 * Keeps server-side read-only snapshot synchronized with live Firestore state for Jarvis / AI queries
 */
app.post('/api/ai/sync-snapshot', requireAdminAuth, (req: AuthenticatedRequest, res: Response) => {
  const { inventory_items, orders, purchases, operating_expenses } = req.body || {};
  if (Array.isArray(inventory_items)) cachedCollections.inventory_items = inventory_items;
  if (Array.isArray(orders)) cachedCollections.orders = orders;
  if (Array.isArray(purchases)) cachedCollections.purchases = purchases;
  if (Array.isArray(operating_expenses)) cachedCollections.operating_expenses = operating_expenses;

  res.json({
    success: true,
    syncedAt: new Date().toISOString(),
  });
});

/**
 * Helper to parse Firestore REST API Document Fields
 */
function parseFirestoreValue(val: any): any {
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.integerValue !== undefined) return Number(val.integerValue);
  if (val.doubleValue !== undefined) return Number(val.doubleValue);
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.timestampValue !== undefined) return val.timestampValue;
  if (val.nullValue !== undefined) return null;
  if (val.arrayValue !== undefined) {
    return (val.arrayValue.values || []).map(parseFirestoreValue);
  }
  if (val.mapValue !== undefined) {
    const res: any = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      res[k] = parseFirestoreValue(v);
    }
    return res;
  }
  return val;
}

async function getFirestoreDocs(collectionName: string, reqToken?: string): Promise<any[]> {
  const projectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  const apiKey = firebaseConfig.apiKey;

  if (!projectId || !apiKey) {
    return cachedCollections[collectionName] || [];
  }

  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${collectionName}?key=${apiKey}&pageSize=300`;
    const headers: Record<string, string> = {};
    const bearer = reqToken || cachedAdminToken;
    if (bearer) {
      headers['Authorization'] = `Bearer ${bearer}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      return cachedCollections[collectionName] || [];
    }
    const data = await res.json();
    if (!data.documents) {
      return cachedCollections[collectionName] || [];
    }

    const parsedDocs = data.documents.map((d: any) => {
      const fields = d.fields || {};
      const obj: any = { id: d.name.split('/').pop() };
      for (const [key, val] of Object.entries(fields)) {
        obj[key] = parseFirestoreValue(val);
      }
      return obj;
    });

    if (parsedDocs.length > 0) {
      cachedCollections[collectionName] = parsedDocs;
    }
    return parsedDocs;
  } catch (err) {
    console.warn(`Error al consultar colección ${collectionName} de Firestore REST:`, err);
    return cachedCollections[collectionName] || [];
  }
}

/**
 * In-memory sliding window rate limiter for Jarvis / AI endpoints
 */
const aiRateLimits = new Map<string, { count: number; resetTime: number }>();
const AI_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const AI_MAX_REQUESTS_PER_WINDOW = 60; // 60 requests per minute

function checkAIRateLimit(identifier: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = aiRateLimits.get(identifier);

  if (!entry || now > entry.resetTime) {
    aiRateLimits.set(identifier, { count: 1, resetTime: now + AI_RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= AI_MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  entry.count += 1;
  return { allowed: true };
}

/**
 * Constant-time string comparison using crypto.timingSafeEqual
 * Protects against side-channel timing attacks
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    // Constant-time dummy comparison to prevent length disclosure
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Middleware: AI Assistant Auth (Token Bearer or x-api-key)
 * Strictly requires either:
 * 1. Environment variable JARVIS_API_KEY to be configured, matched in constant time via x-api-key or Bearer token
 * 2. OR an active Firebase ID token from a verified Administrator
 * NO hardcoded fallback key. If JARVIS_API_KEY is not configured and no Firebase Admin token is present, access is denied.
 */
function requireAIAuth(req: Request, res: Response, next: NextFunction): void {
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || 'unknown';
  const rateLimit = checkAIRateLimit(clientIp);
  if (!rateLimit.allowed) {
    console.warn(`[AI-API] Rate limit excedido para IP: ${clientIp} en ${req.path}`);
    res.status(429).json({
      success: false,
      error: `Límite de solicitudes de IA excedido. Espere ${rateLimit.retryAfterSeconds} segundos.`,
    });
    return;
  }

  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  const configuredJarvisKey = process.env.JARVIS_API_KEY;

  // 1. Check API Key if configured in environment
  if (configuredJarvisKey && configuredJarvisKey.trim().length >= 16) {
    if (apiKeyHeader && timingSafeEqualStr(apiKeyHeader, configuredJarvisKey)) {
      console.log(`[AI-API] Acceso autorizado mediante x-api-key en ${req.path}`);
      return next();
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace(/^Bearer\s+/, '').trim();
      if (timingSafeEqualStr(token, configuredJarvisKey)) {
        console.log(`[AI-API] Acceso autorizado mediante Bearer API Key en ${req.path}`);
        return next();
      }
    }
  }

  // 2. Check Firebase ID Token (for administrators connecting to AI endpoints)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace(/^Bearer\s+/, '').trim();
    verifyFirebaseIdToken(token)
      .then(verified => checkIsAdmin(verified.uid, verified.email, token))
      .then(isAdmin => {
        if (isAdmin) {
          console.log(`[AI-API] Acceso autorizado para Administrador Firebase en ${req.path}`);
          next();
        } else {
          console.warn(`[AI-API] Acceso denegado: Usuario no es administrador (${clientIp})`);
          res.status(403).json({ success: false, error: 'Acceso denegado. Privilegios de administrador requeridos.' });
        }
      })
      .catch(() => {
        res.status(401).json({
          success: false,
          error: configuredJarvisKey
            ? 'Credenciales de autenticación inválidas.'
            : 'Autenticación de Jarvis no configurada en el servidor. Configure la variable de entorno privada JARVIS_API_KEY o proporcione un token de administrador.',
        });
      });
    return;
  }

  // 3. Neither valid API Key nor Firebase Token provided
  res.status(401).json({
    success: false,
    error: configuredJarvisKey
      ? 'Autenticación requerida para la API de Jarvis / ChatGPT. Proporcione header "x-api-key" o "Authorization: Bearer <token>".'
      : 'API externa deshabilitada: la variable de entorno JARVIS_API_KEY no ha sido configurada en el servidor. Configure JARVIS_API_KEY para habilitar el asistente.',
  });
}

// --------------------------------------------------------------------------
// FASE 6: READ-ONLY API FOR CHATGPT / JARVIS ASSISTANT
// --------------------------------------------------------------------------

/**
 * GET /api/ai/inventory-summary
 */
app.get('/api/ai/inventory-summary', requireAIAuth, async (_req: Request, res: Response) => {
  const items = await getFirestoreDocs('inventory_items');
  const inventory = items.map(item => ({
    id: item.id,
    name: item.name,
    category: item.category,
    currentStock: Number(item.currentStock) || 0,
    unit: item.unit,
    minStock: item.minStock || 0,
    averageCost: Number(item.averageCost || item.lastPurchaseCost) || 0,
    status: (item.minStock && item.currentStock <= item.minStock) ? 'bajo_stock' : 'optimo',
  }));

  const totalValuation = inventory.reduce((sum, i) => sum + i.currentStock * i.averageCost, 0);
  const lowStockCount = inventory.filter(i => i.status === 'bajo_stock').length;

  res.json({
    success: true,
    restaurant: 'Pollos Karen — La Uruca, Costa Rica',
    timestamp: new Date().toISOString(),
    currency: 'CRC (₡)',
    itemCount: inventory.length,
    lowStockCount,
    totalValuation: Math.round(totalValuation),
    inventory,
  });
});

/**
 * GET /api/ai/sales-summary
 */
app.get('/api/ai/sales-summary', requireAIAuth, async (req: Request, res: Response) => {
  const days = Number(req.query.days) || 7;
  const orders = await getFirestoreDocs('orders');
  const paidOrders = orders.filter(o => o.paymentStatus === 'paid');

  const grossSales = paidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const tableService = paidOrders.reduce((sum, o) => sum + (Number(o.serviceCharge) || 0), 0);
  const netSales = grossSales - tableService;

  const cashSales = paidOrders.filter(o => o.paymentMethod === 'efectivo').reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const sinpeSales = paidOrders.filter(o => o.paymentMethod === 'sinpe').reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const cardSales = paidOrders.filter(o => o.paymentMethod === 'tarjeta').reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  const productCounts: Record<string, { name: string; count: number; revenue: number }> = {};
  paidOrders.forEach(o => {
    (o.items || []).forEach((it: any) => {
      const pid = it.productId || it.name;
      if (!productCounts[pid]) productCounts[pid] = { name: it.name, count: 0, revenue: 0 };
      productCounts[pid].count += Number(it.quantity) || 1;
      productCounts[pid].revenue += Number(it.subtotal || it.price) || 0;
    });
  });

  const topProducts = Object.values(productCounts).sort((a, b) => b.count - a.count).slice(0, 5);

  res.json({
    success: true,
    restaurant: 'Pollos Karen',
    currency: 'CRC (₡)',
    totalOrders: paidOrders.length,
    grossSales,
    tableServiceCharge: tableService,
    netRestaurantSales: netSales,
    paymentMethods: {
      efectivo: cashSales,
      sinpe: sinpeSales,
      tarjeta: cardSales,
    },
    topSellingProducts: topProducts,
  });
});

/**
 * GET /api/ai/purchase-recommendations
 */
app.get('/api/ai/purchase-recommendations', requireAIAuth, async (_req: Request, res: Response) => {
  const items = await getFirestoreDocs('inventory_items');
  const OPERATIONAL_DAYS = 5; // Monday to Friday (7:00 a.m. to 6:00 p.m.)
  const SAFETY_BUFFER = 0.20; // 20% safety stock

  const recommendations = items.map(item => {
    const currentStock = Number(item.currentStock) || 0;
    let dailyAvg = 0;
    if (item.id === 'inv-pollo') dailyAvg = 15;
    else if (item.id === 'inv-arroz') dailyAvg = 6;
    else if (item.id === 'inv-frijol') dailyAvg = 4;
    else if (item.id === 'inv-aceite') dailyAvg = 2.5;
    else if (item.id === 'inv-platano') dailyAvg = 25;
    else if (item.id === 'inv-papas') dailyAvg = 8;
    else dailyAvg = Math.max(1, (item.minStock || 5) / 5);

    const weeklyDemand = Math.round(dailyAvg * OPERATIONAL_DAYS * 100) / 100;
    const safetyStock = Math.max(item.minStock || 0, Math.round(weeklyDemand * SAFETY_BUFFER * 100) / 100);
    const targetTotal = weeklyDemand + safetyStock;
    const suggestedPurchase = Math.max(0, Math.round((targetTotal - currentStock) * 100) / 100);
    const unitCost = Number(item.averageCost || item.lastPurchaseCost) || 0;
    const estimatedCost = Math.round(suggestedPurchase * unitCost);

    return {
      itemId: item.id,
      name: item.name,
      currentStock,
      unit: item.unit,
      weeklyProjectedConsumption: weeklyDemand,
      safetyStock,
      suggestedPurchase,
      unitCost,
      estimatedCost,
      isRestockNeeded: suggestedPurchase > 0,
      explanation: suggestedPurchase > 0
        ? `Stock de ${currentStock} ${item.unit} insuficiente para la demanda semanal de ${weeklyDemand} ${item.unit} + reserva de ${safetyStock} ${item.unit}.`
        : `Stock actual suficiente para cubrir la semana operativa.`,
    };
  });

  const totalEstimatedBudget = recommendations.reduce((sum, r) => sum + r.estimatedCost, 0);

  res.json({
    success: true,
    restaurant: 'Pollos Karen — La Uruca',
    schedule: 'Lunes a Viernes de 7:00 a. m. a 6:00 p. m. (5 días)',
    currency: 'CRC (₡)',
    totalEstimatedBudget,
    itemsToRestock: recommendations.filter(r => r.isRestockNeeded).length,
    recommendations,
  });
});

/**
 * GET /api/ai/financial-overview
 */
app.get('/api/ai/financial-overview', requireAIAuth, async (_req: Request, res: Response) => {
  const [orders, purchases, expenses] = await Promise.all([
    getFirestoreDocs('orders'),
    getFirestoreDocs('purchases'),
    getFirestoreDocs('operating_expenses'),
  ]);

  const paidOrders = orders.filter(o => o.paymentStatus === 'paid');
  const grossSales = paidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const tableService = paidOrders.reduce((sum, o) => sum + (Number(o.serviceCharge) || 0), 0);
  const netSales = grossSales - tableService;

  const totalPurchases = purchases.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  // Approximate food cost from purchases & recipes baseline (approx 35% standard)
  const estimatedFoodCost = Math.round(netSales * 0.35);
  const grossProfit = netSales - estimatedFoodCost;
  const netOperatingProfit = grossProfit - totalExpenses;

  res.json({
    success: true,
    restaurant: 'Pollos Karen',
    currency: 'CRC (₡)',
    pnl: {
      grossSales,
      tableServiceCharge: tableService,
      netSales,
      estimatedIngredientsCost: estimatedFoodCost,
      grossProfit,
      grossMarginPercent: netSales > 0 ? Math.round((grossProfit / netSales) * 1000) / 10 : 0,
      operatingExpenses: totalExpenses,
      netOperatingProfit,
      netMarginPercent: netSales > 0 ? Math.round((netOperatingProfit / netSales) * 1000) / 10 : 0,
    },
    purchasesTotal: totalPurchases,
    operatingExpensesTotal: totalExpenses,
  });
});

/**
 * GET /api/ai/openapi.json
 * OpenAPI 3.1.0 specification for OpenAI Custom GPT Actions
 */
app.get('/api/ai/openapi.json', (_req: Request, res: Response) => {
  res.json({
    openapi: '3.1.0',
    info: {
      title: 'Pollos Karen Manager AI API',
      version: '1.0.0',
      description: 'API segura de solo lectura para el asistente Jarvis/ChatGPT de Pollos Karen (La Uruca, Costa Rica).',
    },
    servers: [
      {
        url: process.env.APP_URL || 'http://localhost:3000',
        description: 'Servidor Pollos Karen Manager',
      },
    ],
    paths: {
      '/api/ai/inventory-summary': {
        get: {
          summary: 'Obtiene el inventario actual y alertas de stock bajo',
          operationId: 'getInventorySummary',
          responses: {
            '200': {
              description: 'Resumen de inventario valorado',
            },
          },
        },
      },
      '/api/ai/sales-summary': {
        get: {
          summary: 'Obtiene el resumen de ventas y desglose por método de pago',
          operationId: 'getSalesSummary',
          responses: {
            '200': {
              description: 'Resumen de ventas y platillos top',
            },
          },
        },
      },
      '/api/ai/purchase-recommendations': {
        get: {
          summary: 'Obtiene sugerencias semanales de compras de insumos para 5 días hábiles',
          operationId: 'getPurchaseRecommendations',
          responses: {
            '200': {
              description: 'Lista de insumos sugeridos con presupuestos en colones',
            },
          },
        },
      },
      '/api/ai/financial-overview': {
        get: {
          summary: 'Obtiene el estado de resultados financiero (P&L)',
          operationId: 'getFinancialOverview',
          responses: {
            '200': {
              description: 'Estado financiero consolidado en colones',
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
        },
      },
    },
    security: [
      {
        ApiKeyAuth: [],
      },
    ],
  });
});

/**
 * Health check endpoint
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Pollos Karen Manager API',
    time: new Date().toISOString(),
  });
});

// Mount Vite or serve static files
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pollos Karen Manager backend listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
