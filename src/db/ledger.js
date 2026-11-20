/**
 * Pure calculation functions over the event ledger.
 * Zero side effects — shared by UI views and unit tests.
 */

export function getLocalDateKey(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isSameLocalDay(isoDate, targetDateStr) {
  if (!isoDate || !targetDateStr) return false;
  return getLocalDateKey(isoDate) === targetDateStr;
}

export function computeStockMap(movements = []) {
  const byLocation = {};
  const totalsByProduct = {};
  const totalsByLocation = {};
  let grandTotal = 0;

  for (const mov of movements) {
    if (!mov || mov.deleted_at) continue;
    const loc = mov.location_id;
    const prod = mov.product_id;
    const delta = Number(mov.delta) || 0;
    if (!loc || !prod || delta === 0) continue;

    if (!byLocation[loc]) byLocation[loc] = {};
    byLocation[loc][prod] = (byLocation[loc][prod] || 0) + delta;
    totalsByProduct[prod] = (totalsByProduct[prod] || 0) + delta;
    totalsByLocation[loc] = (totalsByLocation[loc] || 0) + delta;
    grandTotal += delta;
  }

  return {
    byLocation,
    totalsByProduct,
    totalsByLocation,
    grandTotal
  };
}

export function computeClientBalances(sales = [], payments = []) {
  const map = {};

  const ensure = (clientId) => {
    if (!map[clientId]) {
      map[clientId] = { totalCredit: 0, totalPaid: 0, balance: 0 };
    }
    return map[clientId];
  };

  for (const sale of sales) {
    if (!sale || sale.deleted_at || !sale.client_id) continue;
    const credit = Number(sale.credit_amount) || 0;
    if (credit > 0) {
      ensure(sale.client_id).totalCredit += credit;
    }
  }

  for (const pay of payments) {
    if (!pay || pay.deleted_at || !pay.client_id) continue;
    const amt = Number(pay.amount) || 0;
    if (amt > 0) {
      ensure(pay.client_id).totalPaid += amt;
    }
  }

  for (const clientId of Object.keys(map)) {
    const entry = map[clientId];
    entry.balance = Math.max(0, Number((entry.totalCredit - entry.totalPaid).toFixed(2)));
  }

  return map;
}

export function computeFinancialSummary({
  sales = [],
  payments = [],
  expenses = [],
  dateFilter = null,
  locationFilter = null,
  allSales = null,
  allPayments = null
}) {
  const activeSales = sales.filter((s) => {
    if (!s || s.deleted_at) return false;
    if (dateFilter && !isSameLocalDay(s.created_at, dateFilter)) return false;
    if (locationFilter && s.location_id !== locationFilter) return false;
    return true;
  });

  const activePayments = payments.filter((p) => {
    if (!p || p.deleted_at) return false;
    if (dateFilter && !isSameLocalDay(p.created_at, dateFilter)) return false;
    return true;
  });

  const activeExpenses = expenses.filter((e) => {
    if (!e || e.deleted_at) return false;
    if (dateFilter && !isSameLocalDay(e.created_at, dateFilter)) return false;
    return true;
  });

  let totalBags = 0;
  let totalRevenue = 0;
  let totalCost = 0;
  let grossProfit = 0;
  let cashFromSales = 0;
  let transferFromSales = 0;
  let creditGenerated = 0;

  for (const s of activeSales) {
    const bags = Number(s.total_bags) || 0;
    const amount = Number(s.total_amount) || 0;
    const cost = Number(s.total_cost) || 0;
    const profit = s.gross_profit !== undefined && s.gross_profit !== null
      ? Number(s.gross_profit) || 0
      : amount - cost;

    totalBags += bags;
    totalRevenue += amount;
    totalCost += cost;
    grossProfit += profit;
    cashFromSales += Number(s.cash_paid) || 0;
    transferFromSales += Number(s.transfer_paid) || 0;
    creditGenerated += Number(s.credit_amount) || 0;
  }

  let cashFromPayments = 0;
  let transferFromPayments = 0;
  for (const p of activePayments) {
    const amt = Number(p.amount) || 0;
    if ((p.method || 'efectivo') === 'transferencia') {
      transferFromPayments += amt;
    } else {
      cashFromPayments += amt;
    }
  }

  let totalExpenses = 0;
  let cashExpenses = 0;
  let transferExpenses = 0;
  for (const e of activeExpenses) {
    const amt = Number(e.amount) || 0;
    totalExpenses += amt;
    if ((e.payment_method || 'efectivo') === 'transferencia') {
      transferExpenses += amt;
    } else {
      cashExpenses += amt;
    }
  }

  const netProfit = grossProfit - totalExpenses;
  const expectedCashInHand = cashFromSales + cashFromPayments - cashExpenses;
  const expectedBankTransfers = transferFromSales + transferFromPayments - transferExpenses;

  const balances = computeClientBalances(allSales || sales, allPayments || payments);
  const totalOutstandingDebt = Object.values(balances).reduce(
    (sum, item) => sum + (item.balance || 0),
    0
  );

  return {
    salesCount: activeSales.length,
    totalBags,
    totalRevenue,
    totalCost,
    grossProfit,
    totalExpenses,
    netProfit,
    cashFromSales,
    transferFromSales,
    creditGenerated,
    cashFromPayments,
    transferFromPayments,
    totalPaymentsCollected: cashFromPayments + transferFromPayments,
    cashExpenses,
    transferExpenses,
    expectedCashInHand,
    expectedBankTransfers,
    totalOutstandingDebt
  };
}
