import { KitchenTicket, RestaurantOrder } from '../types';
import { formatDateTime } from './formatters';

/**
 * Creates a kitchen ticket object from an active restaurant order.
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
 * Generates formatted plain text for raw thermal ESC/POS network/bluetooth printer or preview
 */
export function formatTicketText(ticket: KitchenTicket): string {
  const line = '==========================================';
  const divider = '------------------------------------------';

  let out = '';
  out += '              POLLOS KAREN                \n';
  out += '            ORDEN DE COCINA               \n';
  if (ticket.isCopy) {
    out += '            *** COPIA ***                 \n';
  }
  out += line + '\n';
  out += `ORDEN: ${ticket.orderNumber}\n`;
  out += `SERVICIO: ${ticket.serviceType.toUpperCase()}`;
  if (ticket.tableName) {
    out += ` - ${ticket.tableName.toUpperCase()}`;
  }
  out += '\n';
  out += `FECHA: ${formatDateTime(ticket.printedAt)}\n`;
  out += divider + '\n';
  out += 'CANT  PRODUCTO / DETALLES\n';
  out += divider + '\n';

  ticket.items.forEach(item => {
    out += `${String(item.quantity).padEnd(5)} ${item.name.toUpperCase()}\n`;
    if (item.selectedProtein) {
      out += `      >> PROTEINA: ${item.selectedProtein.toUpperCase()}\n`;
    }
    if (item.notes) {
      out += `      >> NOTA: ${item.notes}\n`;
    }
  });

  if (ticket.observations) {
    out += divider + '\n';
    out += `OBSERVACIONES GENERALES:\n${ticket.observations}\n`;
  }

  out += line + '\n';
  if (ticket.isCopy) {
    out += `REIMPRESION #${ticket.reprintCount} (COPIA)\n`;
  }
  out += '\n\n\n';

  return out;
}

/**
 * Executes browser print specifically framed for 80mm thermal receipt width
 */
export function printKitchenTicket(ticket: KitchenTicket): void {
  let printWindow: Window | null = null;
  try {
    printWindow = window.open('', '_blank', 'width=380,height=600');
  } catch (e) {
    console.warn('Popup para ticket bloqueado o no soportado en este entorno:', e);
  }

  if (!printWindow) {
    // If popup blocked or forbidden by sandbox iframe, trigger standard print dialog
    try {
      window.print();
    } catch (e) {
      console.warn('window.print no disponible:', e);
    }
    return;
  }

  const itemsHtml = ticket.items
    .map(
      item => `
    <div style="margin-bottom: 8px; border-bottom: 1px dashed #ddd; padding-bottom: 6px;">
      <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 16px;">
        <span>${item.quantity}x ${escapeHtml(item.name)}</span>
      </div>
      ${
        item.selectedProtein
          ? `<div style="font-size: 14px; font-weight: bold; color: #b91c1c; margin-left: 14px;">
              PROTEÍNA: ${escapeHtml(item.selectedProtein)}
             </div>`
          : ''
      }
      ${
        item.notes
          ? `<div style="font-size: 13px; font-style: italic; color: #444; margin-left: 14px;">
              * ${escapeHtml(item.notes)}
             </div>`
          : ''
      }
    </div>
  `
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Ticket ${ticket.orderNumber}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            width: 76mm;
            margin: 0 auto;
            padding: 8px 4px;
            color: #000;
            background: #fff;
            font-size: 13px;
            line-height: 1.3;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .title { font-size: 20px; font-weight: 900; margin-bottom: 2px; }
          .subtitle { font-size: 16px; font-weight: bold; margin-bottom: 6px; }
          .badge-copy {
            display: inline-block;
            border: 2px solid #000;
            padding: 2px 8px;
            font-size: 16px;
            font-weight: 900;
            margin: 4px 0;
            letter-spacing: 2px;
          }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .double-divider { border-top: 2px solid #000; margin: 8px 0; }
          .info-row { display: flex; justify-content: space-between; font-size: 14px; margin: 3px 0; }
          .obs-box { background: #f3f3f3; padding: 6px; border: 1px solid #ccc; font-size: 13px; margin-top: 6px; }
          @media print {
            body { width: 100%; padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="title">POLLOS KAREN</div>
          <div class="subtitle">ORDEN DE COCINA</div>
          ${ticket.isCopy ? '<div class="badge-copy">*** COPIA ***</div>' : ''}
        </div>
        <div class="double-divider"></div>

        <div class="info-row">
          <span class="bold">ORDEN:</span>
          <span class="bold" style="font-size: 18px;">${escapeHtml(ticket.orderNumber)}</span>
        </div>
        <div class="info-row">
          <span class="bold">SERVICIO:</span>
          <span>${escapeHtml(ticket.serviceType.toUpperCase())} ${ticket.tableName ? `(${escapeHtml(ticket.tableName)})` : ''}</span>
        </div>
        <div class="info-row">
          <span>FECHA:</span>
          <span>${formatDateTime(ticket.printedAt)}</span>
        </div>

        <div class="divider"></div>
        <div style="font-weight: bold; margin-bottom: 6px;">ITEMS A PREPARAR:</div>
        ${itemsHtml}

        ${
          ticket.observations
            ? `
          <div class="obs-box">
            <strong>OBSERVACIONES:</strong><br />
            ${escapeHtml(ticket.observations)}
          </div>
        `
            : ''
        }

        <div class="double-divider"></div>
        <div class="center" style="font-size: 11px;">
          ${ticket.isCopy ? `REIMPRESIÓN #${ticket.reprintCount} — COPIA DE COCINA` : 'COMANDA OFICIAL DE PRODUCCIÓN'}
        </div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
