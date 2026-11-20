export function cleanMexicanPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `52${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `52${digits.slice(1)}`;
  return digits;
}

export function openWhatsApp(phone, text) {
  if (typeof window === 'undefined') return;
  const cleaned = cleanMexicanPhone(phone);
  const encoded = encodeURIComponent(text || '');
  const url = cleaned
    ? `https://wa.me/${cleaned}?text=${encoded}`
    : `https://api.whatsapp.com/send?text=${encoded}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function formatMoney(value) {
  const num = Number(value) || 0;
  return `$${num.toLocaleString('es-MX', {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  })}`;
}

export function formatOrderConfirmation(order) {
  const lines = [
    `🌽 *CONFIRMACIÓN DE PEDIDO ${order.folio || ''}*`,
    `👤 *Cliente:* ${order.client_name}`,
    `📦 *Detalle:*`
  ];

  for (const item of order.items || []) {
    lines.push(
      `• ${item.emoji || '🌽'} ${item.qty} bls ${item.product_name} (${formatMoney(
        item.qty * (Number(item.unit_price) || 20)
      )})`
    );
  }

  lines.push(`------------------------`);
  lines.push(`🛍️ *Total piezas:* ${order.total_bags} bolsas`);
  lines.push(`💰 *Total estimado:* ${formatMoney(order.total_amount)} MXN`);
  lines.push(`✅ ¡Pedido anotado! Te avisamos cuando vaya en camino.`);
  return lines.join('\n');
}

export function formatSaleReceipt(sale, clientBalanceAfter = null) {
  const fecha = new Date(sale.created_at || Date.now()).toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short'
  });

  const lines = [
    `🌽 *NOTA DIGITAL — MAICITOS EN FRÍO*`,
    `🧾 *Folio:* ${sale.folio}`,
    `📅 *Fecha:* ${fecha}`,
    `👤 *Cliente:* ${sale.client_name}`,
    `------------------------`
  ];

  for (const item of sale.items || []) {
    lines.push(
      `• ${item.qty}x ${item.product_name} — ${formatMoney(
        item.subtotal ?? item.qty * item.unit_price
      )}`
    );
  }

  lines.push(`------------------------`);
  lines.push(`📦 *Total (${sale.total_bags} bolsas):* ${formatMoney(sale.total_amount)} MXN`);
  if (Number(sale.cash_paid) > 0) {
    lines.push(`💵 *Pagado en efectivo:* ${formatMoney(sale.cash_paid)} MXN`);
  }
  if (Number(sale.transfer_paid) > 0) {
    lines.push(`🏦 *Transferencia:* ${formatMoney(sale.transfer_paid)} MXN`);
  }
  if (Number(sale.credit_amount) > 0) {
    lines.push(`📒 *Saldo a crédito (fiado):* ${formatMoney(sale.credit_amount)} MXN`);
  }
  if (clientBalanceAfter !== null && Number(clientBalanceAfter) > 0) {
    lines.push(`📌 *Saldo total pendiente:* ${formatMoney(clientBalanceAfter)} MXN`);
  }
  lines.push(`🙏 ¡Gracias por tu compra!`);

  return lines.join('\n');
}

export function formatDebtReminder(client, balance) {
  return [
    `Hola *${client.name}* 👋`,
    `Te saludamos de *Maicitos en Frío* 🌽`,
    `Solo para recordarte amablemente tu saldo pendiente actual de *${formatMoney(balance)} MXN*.`,
    `Cuando gustes podemos pasar a recoger tu abono o nos confirmas si necesitas más surtido. ¡Gracias!`
  ].join('\n');
}

export function formatRouteClosingReport(locationName, summary, remainingItems = []) {
  const fecha = new Date().toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });

  const lines = [
    `🚚 *CORTE DE RUTA — ${locationName.toUpperCase()}*`,
    `📅 ${fecha}`,
    `------------------------`,
    `📦 *Bolsas vendidas:* ${summary.totalBags}`,
    `💰 *Venta total:* ${formatMoney(summary.totalRevenue)} MXN`,
    `💵 *Efectivo esperado:* ${formatMoney(summary.expectedCashInHand)} MXN`,
    `🏦 *Transferencias:* ${formatMoney(summary.expectedBankTransfers)} MXN`,
    `📒 *Dejado a fiado hoy:* ${formatMoney(summary.creditGenerated)} MXN`,
    `⛽ *Gastos del día:* ${formatMoney(summary.totalExpenses)} MXN`,
    `🏦 *Fondo Reinversión ($12):* ${formatMoney(summary.totalCost)} MXN`,
    `✨ *Ganancia Neta:* ${formatMoney(summary.netProfit)} MXN`
  ];

  const nonZeroRemaining = remainingItems.filter((it) => it.qty > 0);
  if (nonZeroRemaining.length > 0) {
    lines.push(`------------------------`);
    lines.push(`🎒 *Sobrante en auto:*`);
    for (const item of nonZeroRemaining) {
      lines.push(`• ${item.emoji || '🌽'} ${item.name}: ${item.qty} bls`);
    }
  }

  return lines.join('\n');
}
