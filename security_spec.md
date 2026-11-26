# Security Specification — Pollos Karen Manager

## 1. Data Invariants & Role Separation (2 Active Roles)

1. **Zero Public Self-Registration**:
   - No arbitrary Google or email account may create `/users/{uid}`.
   - Only an active Administrator may create staff accounts or pre-authorized `/user_invites/{inviteId}` entries.
   - Deactivated accounts (`active == false`) are immediately rejected by both Firestore Rules (`isActiveUser()`) and real-time client profile revocation.
2. **Two Active Roles**:
   - `admin`: Full access to finances, inventory, recipes/costs, purchases, suppliers, operating expenses, audit logs, backups, restaurant configuration, and user administration.
   - `colaborador`: Operational POS & cashier access (active orders, table status, confirmed payments, open register sales counters, printed ticket issuance, internal order management, non-fiscal receipt printing). **Zero read access** to `purchases`, `operating_expenses`, `suppliers`, `recipes` (contains costs), `inventory_items` (contains unit costs), `audit_logs`, or `admins` list.
   - Historical `cocina` profiles are blocked from operational access and cannot be created or assigned. Historical `/kitchen_orders` is admin-read-only; POS no longer reads or writes it.
3. **Separated Operational & Financial Lifecycles**:
   - `operationalStatus`: `pending_auth` → `authorized` → `in_preparation` → `ready` → `delivered` (or `cancelled`).
   - `financialStatus`: `unpaid` → `partially_paid` → `paid` → `refunded`.
   - Once `financialStatus == 'paid'` or `paymentStatus == 'paid'`, non-admin users cannot alter line items or monetary amounts; they may only update operational delivery status (`delivered`).
   - Order cancellation and payment refunds strictly require `isAdmin()`.
4. **Explicit Cash Register Control**:
   - Cash registers are never auto-initialized with arbitrary floats. Opening, closing, reopening, and non-sale drawer movements require explicit authorization (`isAdmin()` or authorized open/close flow) and register `status == 'open'` is enforced for sales.
5. **Immutable Audit Logs & Payment Records**:
   - `/audit_logs/{logId}` is strictly append-only (`update: false, delete: false`), bound to `request.auth.uid`, and cross-checked with `exists()` / `existsAfter()` against real documents.
   - `/payments/{paymentId}` is append-only for staff; only admins may record refund status updates.
6. **Internal POS Only**:
   - `/api/public/*` returns HTTP 410. Customer-facing menu, QR ordering, external tracking and KDS are retired.
   - Staff manage internal orders and print thermal tickets; no new digital kitchen projections are created.

---

## 2. Threat Payloads & Expected Enforcement

1. **Unauthorized Google Self-Registration**: Stranger authenticates with Google and tries `setDoc('/users/{uid}', { role: 'colaborador' })` without invite -> `PERMISSION_DENIED`.
2. **Colaborador Privilege Escalation**: Colaborador attempts setting own `role` to `'admin'` in `/users/{uid}` -> `PERMISSION_DENIED`.
3. **Deactivated User Write**: User with `active: false` attempts creating an order -> `PERMISSION_DENIED`.
4. **Cocina Financial Snooping**: User with `role: 'cocina'` attempts reading `/orders`, `/payments`, or `/cash_registers` -> `PERMISSION_DENIED`.
5. **Colaborador Recipe & Cost Leak**: Colaborador attempts reading `/recipes` or `/inventory_items` -> `PERMISSION_DENIED`.
6. **Colaborador Financial Snooping**: Colaborador attempts reading `/purchases`, `/operating_expenses`, `/suppliers`, or `/audit_logs` -> `PERMISSION_DENIED`.
7. **Price Tampering in Catalog**: Colaborador or Cocina attempts modifying `/products/{id}` -> `PERMISSION_DENIED`.
8. **Paid Order Financial Hijack**: Colaborador attempts changing `total` or `items` on an already paid order -> `PERMISSION_DENIED`.
9. **Unaudited Cancellation**: Non-admin attempts changing order to `cancelled` -> `PERMISSION_DENIED`.
10. **Inventory Arbitrary Adjustment**: Colaborador attempts increasing `currentStock` or editing `averageCost` -> `PERMISSION_DENIED`.
11. **Fake Cash Register Creation / Arqueo Tampering**: Colaborador attempts overwriting `actualCash` or `difference` on a closed register -> `PERMISSION_DENIED`.
12. **Audit Log Deletion or Tampering**: Any user (including admin) attempts `update` or `delete` on `/audit_logs/{id}` -> `PERMISSION_DENIED`.
13. **Oversized String Denial-of-Wallet**: Any user submits >1000 char `observations` -> `PERMISSION_DENIED`.
14. **Invoice Duplicate Race Condition**: Two concurrent registrations with same vendor + invoice number attempt creating `/purchase_invoice_locks/{lockId}` -> Second gets `PERMISSION_DENIED` (`!exists(...)`).
