import { CashRegister, KitchenTicket, PaymentRecord, RestaurantOrder } from '../types';
import { formatCRC, formatDateTime } from './formatters';

export type ThermalPaperWidth = '58mm' | '80mm';

export const NON_FISCAL_DISCLAIMER = 'DOCUMENTO INTERNO — NO FISCAL';
export const NON_FISCAL_SUBTEXT = 'Comprobante interno de control. No válido como factura electrónica.';

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Prints thermal HTML via a hidden local iframe (NO window.open popups).
 * Compatible with iframe sandboxes, desktops, tablets, and PWA standalone windows.
 */
export function printHtmlViaIframe(html: string): boolean {
  if (typeof document === 'undefined') return false;

  try {
    const existing = document.getElementById('pk-thermal-print-frame');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'pk-thermal-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentWindow?.document;
    if (!frameDoc || !iframe.contentWindow) {
      iframe.remove();
      return false;
    }

    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Error al invocar impresión en iframe:', err);
      } finally {
        setTimeout(() => {
          iframe.remove();
        }, 1500);
      }
    }, 120);

    return true;
  } catch (err) {
    console.warn('Error preparando impresión térmica:', err);
    return false;
  }
}

function getBaseStyles(paperWidth: ThermalPaperWidth): string {
  const is58 = paperWidth === '58mm';
  const bodyWidth = is58 ? '54mm' : '76mm';
  const fontSize = is58 ? '11px' : '13px';
  const titleSize = is58 ? '16px' : '20px';

  return `
    @page { size: ${paperWidth} auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      width: ${bodyWidth};
      margin: 0 auto;
      padding: 6px 3px;
      color: #000;
      background: #fff;
      font-size: ${fontSize};
      line-height: 1.3;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .title { font-size: ${titleSize}; font-weight: 900; margin-bottom: 2px; }
    .subtitle { font-size: ${is58 ? '13px' : '15px'}; font-weight: bold; margin-bottom: 4px; }
    .badge {
      display: inline-block;
      border: 2px solid #000;
      padding: 2px 6px;
      font-size: ${is58 ? '12px' : '14px'};
      font-weight: 900;
      margin: 4px 0;
      letter-spacing: 1px;
    }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .double-divider { border-top: 2px solid #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; gap: 6px; margin: 2px 0; }
    .obs-box { background: #f3f3f3; padding: 5px; border: 1px solid #999; margin-top: 6px; }
    .non-fiscal {
      border: 1.5px solid #000;
      padding: 4px;
      text-align: center;
      font-weight: 900;
      font-size: ${is58 ? '10px' : '11px'};
      margin: 6px 0;
    }
    @media print {
      body { width: 100%; padding: 2px; }
    }
  `;
}

/**
 * 1. Creates a kitchen ticket object (strictly zero prices/financials)
 */
export function createKitchenTicketFromOrder(
  order: RestaurantOrder,
  isCopy: boolean = false,
  reprintCount: number = 0
): KitchenTicket {
  return {
    id: `ticket_${order.id}_${Date.now()}`,
    orderId: order.id,
    orderNumber: order.orderNumber,
    serviceType: order.serviceType,
    tableName: order.tableName,
    items: order.items.map(item => ({
      quantity: item.quantity,
      name: item.name,
      selectedProtein: item.selectedProtein,
      notes: item.notes,
    })),
    observations: order.observations,
    printedAt: new Date().toISOString(),
    isCopy,
    reprintCount,
  };
}

/**
 * Plain text representation of Kitchen Ticket (zero prices)
 */
export function formatTicketText(ticket: KitchenTicket, paperWidth: ThermalPaperWidth = '80mm'): string {
  const width = paperWidth === '58mm' ? 32 : 42;
  const line = '='.repeat(width);
  const divider = '-'.repeat(width);

  let out = '';
  out += 'POLLOS KAREN\n';
  out += 'COMANDA DE COCINA\n';
  if (ticket.isCopy) {
    out += '*** COPIA ***\n';
  }
  out += line + '\n';
  out += `ORDEN: ${ticket.orderNumber}\n`;
  out += `SERVICIO: ${ticket.serviceType.toUpperCase()}`;
  if (ticket.tableName) out += ` - ${ticket.tableName.toUpperCase()}`;
  out += '\n';
  out += `FECHA: ${formatDateTime(ticket.printedAt)}\n`;
  out += divider + '\n';

  ticket.items.forEach(item => {
    out += `${item.quantity}x ${item.name.toUpperCase()}\n`;
    if (item.selectedProtein) out += `   >> PROTEINA: ${item.selectedProtein.toUpperCase()}\n`;
    if (item.notes) out += `   >> NOTA: ${item.notes}\n`;
  });

  if (ticket.observations) {
    out += divider + '\n';
    out += `OBSERVACIONES:\n${ticket.observations}\n`;
  }

  out += line + '\n';
  if (ticket.isCopy) {
    out += `REIMPRESION #${ticket.reprintCount} (COPIA)\n`;
  }
  return out;
}

/**
 * 1 & 2. Kitchen Comanda & Kitchen Copy HTML builder (strictly zero prices)
 */
export function buildKitchenTicketHtml(
  ticket: KitchenTicket,
  paperWidth: ThermalPaperWidth = '80mm'
): string {
  const itemsHtml = ticket.items
    .map(
      item => `
      <div style="margin-bottom: 7px; border-bottom: 1px dashed #ccc; padding-bottom: 5px;">
        <div style="font-weight: 900; font-size: ${paperWidth === '58mm' ? '13px' : '16px'};">
          ${item.quantity}x ${escapeHtml(item.name)}
        </div>
        ${
          item.selectedProtein
            ? `<div style="font-weight: bold; margin-left: 10px;">PROTEÍNA: ${escapeHtml(item.selectedProtein)}</div>`
            : ''
        }
        ${
          item.notes
            ? `<div style="font-style: italic; margin-left: 10px;">* ${escapeHtml(item.notes)}</div>`
            : ''
        }
      </div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Comanda ${escapeHtml(ticket.orderNumber)}</title>
  <style>${getBaseStyles(paperWidth)}</style>
</head>
<body>
  <div class="center">
    <div class="title">POLLOS KAREN</div>
    <div class="subtitle">COMANDA DE COCINA</div>
    ${ticket.isCopy ? '<div class="badge">*** COPIA ***</div>' : ''}
  </div>
  <div class="double-divider"></div>
  <div class="row"><span class="bold">ORDEN:</span><span class="bold">${escapeHtml(ticket.orderNumber)}</span></div>
  <div class="row"><span class="bold">SERVICIO:</span><span>${escapeHtml(ticket.serviceType.toUpperCase())}${ticket.tableName ? ` (${escapeHtml(ticket.tableName)})` : ''}</span></div>
  <div class="row"><span>HORA:</span><span>${escapeHtml(formatDateTime(ticket.printedAt))}</span></div>
  <div class="divider"></div>
  ${itemsHtml}
  ${
    ticket.observations
      ? `<div class="obs-box"><strong>OBSERVACIONES:</strong><br/>${escapeHtml(ticket.observations)}</div>`
      : ''
  }
  <div class="double-divider"></div>
  <div class="center" style="font-size: 10px;">
    ${ticket.isCopy ? `REIMPRESIÓN #${ticket.reprintCount} — COPIA DE COCINA` : 'ORDEN AUTORIZADA PARA PREPARACIÓN'}
  </div>
</body>
</html>`;
}

export function printKitchenTicket(
  ticket: KitchenTicket,
  paperWidth: ThermalPaperWidth = '80mm'
): boolean {
  return printHtmlViaIframe(buildKitchenTicketHtml(ticket, paperWidth));
}

/**
 * 3. Precuenta de Mesa (Table Bill before payment)
 */
export function buildPreCuentaHtml(
  order: RestaurantOrder,
  paperWidth: ThermalPaperWidth = '80mm'
): string {
  const itemsHtml = order.items
    .map(
      it => `
      <div class="row">
        <span>${it.quantity}x ${escapeHtml(it.name)}${it.selectedProtein ? ` (${escapeHtml(it.selectedProtein)})` : ''}</span>
        <span class="bold">${escapeHtml(formatCRC(it.subtotal))}</span>
      </div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Precuenta ${escapeHtml(order.orderNumber)}</title>
  <style>${getBaseStyles(paperWidth)}</style>
</head>
<body>
  <div class="center">
    <div class="title">POLLOS KAREN</div>
    <div style="font-size: 11px;">La Uruca, San José, Costa Rica</div>
    <div class="badge">PRECUENTA DE MESA</div>
  </div>
  <div class="non-fiscal">${NON_FISCAL_DISCLAIMER}</div>
  <div class="row"><span>Orden:</span><span class="bold">${escapeHtml(order.orderNumber)}</span></div>
  <div class="row"><span>Servicio:</span><span>${escapeHtml(order.tableName || order.serviceType.toUpperCase())}</span></div>
  <div class="row"><span>Fecha:</span><span>${escapeHtml(formatDateTime(new Date().toISOString()))}</span></div>
  <div class="divider"></div>
  ${itemsHtml}
  <div class="divider"></div>
  <div class="row"><span>Subtotal:</span><span>${escapeHtml(formatCRC(order.subtotal))}</span></div>
  ${
    order.serviceCharge > 0
      ? `<div class="row"><span>Servicio de Mesa (10%):</span><span>${escapeHtml(formatCRC(order.serviceCharge))}</span></div>`
      : ''
  }
  ${
    order.deliveryFee && order.deliveryFee > 0
      ? `<div class="row"><span>Envío Exprés:</span><span>${escapeHtml(formatCRC(order.deliveryFee))}</span></div>`
      : ''
  }
  ${
    order.discount && order.discount > 0
      ? `<div class="row"><span>Descuento:</span><span>-${escapeHtml(formatCRC(order.discount))}</span></div>`
      : ''
  }
  <div class="double-divider"></div>
  <div class="row bold" style="font-size: 15px;">
    <span>TOTAL A PAGAR:</span>
    <span>${escapeHtml(formatCRC(order.total))}</span>
  </div>
  <div class="divider"></div>
  <div class="center" style="font-size: 10px;">
    Esta precuenta es únicamente informativa.<br/>
    ${NON_FISCAL_SUBTEXT}
  </div>
</body>
</html>`;
}

export function printPreCuenta(
  order: RestaurantOrder,
  paperWidth: ThermalPaperWidth = '80mm'
): boolean {
  return printHtmlViaIframe(buildPreCuentaHtml(order, paperWidth));
}

/**
 * 4. Comprobante Interno de Venta (Strictly NON-FISCAL)
 */
export function buildInternalSalesReceiptHtml(
  order: RestaurantOrder,
  payments: PaymentRecord[] = [],
  options?: { paperWidth?: ThermalPaperWidth; amountTendered?: number; changeAmount?: number }
): string {
  const paperWidth = options?.paperWidth || '80mm';
  const itemsHtml = order.items
    .map(
      it => `
      <div class="row">
        <span>${it.quantity}x ${escapeHtml(it.name)}${it.selectedProtein ? ` (${escapeHtml(it.selectedProtein)})` : ''}</span>
        <span>${escapeHtml(formatCRC(it.subtotal))}</span>
      </div>`
    )
    .join('');

  const paymentsHtml =
    payments.length > 0
      ? payments
          .map(
            p => `
        <div class="row">
          <span>Pago ${escapeHtml(p.method.toUpperCase())}${p.sinpeReference ? ` (Ref: ${escapeHtml(p.sinpeReference)})` : ''}:</span>
          <span class="bold">${escapeHtml(formatCRC(p.amount))}</span>
        </div>`
          )
          .join('')
      : `<div class="row"><span>Método de pago:</span><span class="bold">${escapeHtml((order.paymentMethod || 'efectivo').toUpperCase())}</span></div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Comprobante Interno ${escapeHtml(order.orderNumber)}</title>
  <style>${getBaseStyles(paperWidth)}</style>
</head>
<body>
  <div class="center">
    <div class="title">POLLOS KAREN</div>
    <div style="font-size: 11px;">La Uruca, San José, Costa Rica</div>
    <div class="subtitle">COMPROBANTE INTERNO DE VENTA</div>
  </div>
  <div class="non-fiscal">${NON_FISCAL_DISCLAIMER}</div>
  <div class="row"><span>Orden:</span><span class="bold">${escapeHtml(order.orderNumber)}</span></div>
  <div class="row"><span>Servicio:</span><span>${escapeHtml(order.serviceType.toUpperCase())}${order.tableName ? ` — ${escapeHtml(order.tableName)}` : ''}</span></div>
  <div class="row"><span>Fecha:</span><span>${escapeHtml(formatDateTime(order.paidAt || new Date().toISOString()))}</span></div>
  ${
    order.deliveryDetails
      ? `<div class="obs-box">
          <strong>EXPRÉS:</strong> ${escapeHtml(order.deliveryDetails.customerName)} (${escapeHtml(order.deliveryDetails.customerPhone)})<br/>
          ${escapeHtml(order.deliveryDetails.address)}
        </div>`
      : ''
  }
  <div class="divider"></div>
  ${itemsHtml}
  <div class="divider"></div>
  <div class="row"><span>Subtotal:</span><span>${escapeHtml(formatCRC(order.subtotal))}</span></div>
  ${
    order.serviceCharge > 0
      ? `<div class="row"><span>Servicio Mesa (10%):</span><span>${escapeHtml(formatCRC(order.serviceCharge))}</span></div>`
      : ''
  }
  ${
    order.deliveryFee && order.deliveryFee > 0
      ? `<div class="row"><span>Envío Exprés:</span><span>${escapeHtml(formatCRC(order.deliveryFee))}</span></div>`
      : ''
  }
  ${
    order.discount && order.discount > 0
      ? `<div class="row"><span>Descuento:</span><span>-${escapeHtml(formatCRC(order.discount))}</span></div>`
      : ''
  }
  <div class="double-divider"></div>
  <div class="row bold" style="font-size: 15px;">
    <span>TOTAL PAGADO:</span>
    <span>${escapeHtml(formatCRC(order.total))}</span>
  </div>
  <div class="divider"></div>
  ${paymentsHtml}
  ${
    options?.amountTendered && options.amountTendered > 0
      ? `<div class="row"><span>Recibido:</span><span>${escapeHtml(formatCRC(options.amountTendered))}</span></div>
         <div class="row bold"><span>Vuelto:</span><span>${escapeHtml(formatCRC(options.changeAmount || 0))}</span></div>`
      : ''
  }
  <div class="double-divider"></div>
  <div class="center" style="font-size: 10px;">
    <strong>${NON_FISCAL_DISCLAIMER}</strong><br/>
    ${NON_FISCAL_SUBTEXT}<br/>
    ¡Gracias por su preferencia!
  </div>
</body>
</html>`;
}

export function printInternalSalesReceipt(
  order: RestaurantOrder,
  payments: PaymentRecord[] = [],
  options?: { paperWidth?: ThermalPaperWidth; amountTendered?: number; changeAmount?: number }
): boolean {
  return printHtmlViaIframe(buildInternalSalesReceiptHtml(order, payments, options));
}

/**
 * 5. Reporte de Cierre de Caja
 */
export function buildCashCloseReportHtml(
  register: CashRegister,
  paperWidth: ThermalPaperWidth = '80mm'
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Cierre de Caja ${escapeHtml(register.date)}</title>
  <style>${getBaseStyles(paperWidth)}</style>
</head>
<body>
  <div class="center">
    <div class="title">POLLOS KAREN</div>
    <div class="subtitle">REPORTE DE CIERRE DE CAJA</div>
  </div>
  <div class="non-fiscal">${NON_FISCAL_DISCLAIMER}</div>
  <div class="row"><span>Fecha Operativa:</span><span class="bold">${escapeHtml(register.date)}</span></div>
  <div class="row"><span>Apertura:</span><span>${escapeHtml(formatDateTime(register.openedAt))}</span></div>
  <div class="row"><span>Abrió:</span><span>${escapeHtml(register.openedBy)}</span></div>
  ${
    register.closedAt
      ? `<div class="row"><span>Cierre:</span><span>${escapeHtml(formatDateTime(register.closedAt))}</span></div>`
      : ''
  }
  ${
    register.closedBy
      ? `<div class="row"><span>Cerró:</span><span>${escapeHtml(register.closedBy)}</span></div>`
      : ''
  }
  <div class="divider"></div>
  <div class="bold">RESUMEN DE VENTAS</div>
  <div class="row"><span>Efectivo:</span><span>${escapeHtml(formatCRC(register.cashSales || 0))}</span></div>
  <div class="row"><span>SINPE Móvil:</span><span>${escapeHtml(formatCRC(register.sinpeSales || 0))}</span></div>
  <div class="row"><span>Tarjeta:</span><span>${escapeHtml(formatCRC(register.cardSales || 0))}</span></div>
  <div class="row bold"><span>Total Ventas:</span><span>${escapeHtml(formatCRC((register.cashSales || 0) + (register.sinpeSales || 0) + (register.cardSales || 0)))}</span></div>
  <div class="divider"></div>
  <div class="bold">ARQUEO DE EFECTIVO</div>
  <div class="row"><span>Fondo Inicial:</span><span>${escapeHtml(formatCRC(register.initialCash || 0))}</span></div>
  <div class="row"><span>(+) Ventas Efectivo:</span><span>${escapeHtml(formatCRC(register.cashSales || 0))}</span></div>
  <div class="row"><span>(+) Ingresos Manuales:</span><span>${escapeHtml(formatCRC(register.cashDeposits || 0))}</span></div>
  <div class="row"><span>(-) Retiros Manuales:</span><span>-${escapeHtml(formatCRC(register.cashWithdrawals || 0))}</span></div>
  <div class="row"><span>(-) Compras Efectivo:</span><span>-${escapeHtml(formatCRC(register.cashPurchases || 0))}</span></div>
  <div class="row"><span>(-) Gastos Efectivo:</span><span>-${escapeHtml(formatCRC(register.cashExpenses || 0))}</span></div>
  <div class="row"><span>(-) Reembolsos Efectivo:</span><span>-${escapeHtml(formatCRC(register.cashRefunds || 0))}</span></div>
  <div class="double-divider"></div>
  <div class="row bold"><span>EFECTIVO ESPERADO:</span><span>${escapeHtml(formatCRC(register.expectedCash || 0))}</span></div>
  <div class="row bold"><span>EFECTIVO CONTADO:</span><span>${escapeHtml(formatCRC(register.actualCash ?? 0))}</span></div>
  <div class="row bold"><span>DIFERENCIA:</span><span>${escapeHtml(formatCRC(register.difference ?? 0))}</span></div>
  ${
    register.notes
      ? `<div class="obs-box"><strong>NOTAS:</strong><br/>${escapeHtml(register.notes)}</div>`
      : ''
  }
  <div class="divider"></div>
  <div class="center" style="font-size: 10px;">
    Firma Responsable: _______________________<br/><br/>
    ${NON_FISCAL_DISCLAIMER}
  </div>
</body>
</html>`;
}

export function printCashCloseReport(
  register: CashRegister,
  paperWidth: ThermalPaperWidth = '80mm'
): boolean {
  return printHtmlViaIframe(buildCashCloseReportHtml(register, paperWidth));
}
