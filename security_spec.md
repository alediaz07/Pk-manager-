# Security Specification — Pollos Karen Manager

## 1. Data Invariants

1. **Role Separation**:
   - `admin`: Three accounts with total access to inventory, purchases, expenses, audit logs, financial reports, and sales overrides.
   - `colaborador`: Single shared account with POS-only permissions (create/edit active orders, collect payments, mark table status, print tickets).
   - Colaboradores have NO read access to `purchases`, `operating_expenses`, `recipes`, `audit_logs`, or financial summary fields.
2. **Order Immutability & Safe Status Transitions**:
   - Once an order is `paymentStatus == 'paid'`, non-admin users cannot alter its items or financial amounts.
   - Cancellation of confirmed sales requires `isAdmin()`.
3. **Table Lifecycle**:
   - Mesas 1–7 and Barra are maintained by admins. Colaboradores may only transition state between `libre`, `activa`, and `pendiente_pago`, and link the active `currentOrderId`.
4. **Cash Movement & Register Integrity**:
   - Purchases and expenses paid in cash from the register must be recorded as single idempotent `cash_movements`.
   - Colaboradores can only record `sale` cash movements linked to their collected orders.
5. **No Blind Client Trust**:
   - All rules check `resource.data` or request constraints explicitly.
   - User email from runtime (`alejandrodiazortiz07@gmail.com`) is bootstrapped as master administrator in `/admins/{uid}` and rule checks.

---

## 2. The "Dirty Dozen" Threat Payloads

1. **Payload 1: Colaborador Privileged Escalation**: Colaborador attempts to set their own role to `"admin"` in `/users/{uid}`. -> `PERMISSION_DENIED`
2. **Payload 2: Colaborador Financial Snooping**: Colaborador attempts `get` or `list` on `/purchases` or `/operating_expenses`. -> `PERMISSION_DENIED`
3. **Payload 3: Colaborador Recipe & Cost Leak**: Colaborador attempts reading `/recipes` which contains unit ingredient costs and profit margins. -> `PERMISSION_DENIED`
4. **Payload 4: Ghost Field Injection on Order**: Attacker sends order payload with arbitrary shadow property `discount_override: 100`. -> `PERMISSION_DENIED`
5. **Payload 5: Price Tampering in Catalog**: Colaborador attempts `update` on `/products/casado-pollo` setting price to `0`. -> `PERMISSION_DENIED`
6. **Payload 6: Paid Order Hijack**: Colaborador attempts to change `total` on an already paid order (`paymentStatus: 'paid'`). -> `PERMISSION_DENIED`
7. **Payload 7: Unaudited Sale Annulment**: Non-admin attempts to set order status to `'cancelled'`. -> `PERMISSION_DENIED`
8. **Payload 8: Inventory Direct Write by Colaborador**: Non-admin attempts to directly adjust `currentStock` in `/inventory_items/arroz`. -> `PERMISSION_DENIED`
9. **Payload 9: Fake Cash Adjustment**: Non-admin attempts to insert an arbitrary `adjustment` into `/cash_movements`. -> `PERMISSION_DENIED`
10. **Payload 10: Cash Register Arqueo Tampering**: Colaborador attempts to overwrite `actualCash` or `difference` on closed register. -> `PERMISSION_DENIED`
11. **Payload 11: Deletion of Audit Log**: Any user, including admin, attempts `delete` on `/audit_logs/{logId}`. -> `PERMISSION_DENIED`
12. **Payload 12: Oversized String Denial-of-Wallet Attack**: Attacker sends a 50KB string in `observations`. -> `PERMISSION_DENIED`

---

## 3. Security Test Runner Specifications

The rules enforce:
- Master Gate pattern.
- Standalone `isValid[Entity]` validators checking strict key sets, types, and string bounds (`size() <= MAX`).
- `isAdmin()` validated against `/admins/$(request.auth.uid)`.
- Default deny catch-all `match /{document=**} { allow read, write: if false; }`.
- Read and write constraints on every collection.
