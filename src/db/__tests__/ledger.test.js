import { describe, expect, it } from 'vitest';
import {
  computeClientBalances,
  computeFinancialSummary,
  computeStockMap,
  getLocalDateKey
} from '../ledger';

describe('ledger calculations', () => {
  it('computes multi-location stock accurately from stock_in, transfers, sales and adjustments', () => {
    const movements = [
      { id: '1', product_id: 'fuego', location_id: 'bodega', delta: 100 },
      { id: '2', product_id: 'queso', location_id: 'bodega', delta: 50 },
      // Transfer 40 fuego to auto-papa
      { id: '3', product_id: 'fuego', location_id: 'bodega', delta: -40 },
      { id: '4', product_id: 'fuego', location_id: 'auto-papa', delta: 40 },
      // Sale of 15 fuego from auto-papa
      { id: '5', product_id: 'fuego', location_id: 'auto-papa', delta: -15 },
      // Merma of 2 queso in bodega
      { id: '6', product_id: 'queso', location_id: 'bodega', delta: -2 },
      // Soft-deleted movement should be ignored
      { id: '7', product_id: 'fuego', location_id: 'bodega', delta: 999, deleted_at: '2026-11-19T12:00:00Z' }
    ];

    const map = computeStockMap(movements);

    expect(map.byLocation.bodega).toEqual({ fuego: 60, queso: 48 });
    expect(map.byLocation['auto-papa']).toEqual({ fuego: 25 });
    expect(map.totalsByProduct).toEqual({ fuego: 85, queso: 48 });
    expect(map.totalsByLocation).toEqual({ bodega: 108, 'auto-papa': 25 });
    expect(map.grandTotal).toBe(133);
  });

  it('computes client fiado balances with partial sales and payments', () => {
    const sales = [
      { id: 's1', client_id: 'c1', credit_amount: 800 },
      { id: 's2', client_id: 'c1', credit_amount: 400 },
      { id: 's3', client_id: 'c2', credit_amount: 500 },
      { id: 's4', client_id: 'c2', credit_amount: 200, deleted_at: '2026-11-19T10:00:00Z' }
    ];
    const payments = [
      { id: 'p1', client_id: 'c1', amount: 500 },
      { id: 'p2', client_id: 'c2', amount: 500 }
    ];

    const balances = computeClientBalances(sales, payments);
    expect(balances.c1).toEqual({ totalCredit: 1200, totalPaid: 500, balance: 700 });
    expect(balances.c2).toEqual({ totalCredit: 500, totalPaid: 500, balance: 0 });
  });

  it('computes daily financial summary with reinvestment fund, net profit, and cash/bank reconciliation', () => {
    const today = new Date();
    const todayKey = getLocalDateKey(today);
    const todayIso = today.toISOString();
    const oldIso = '2020-01-01T12:00:00.000Z';

    const sales = [
      {
        id: 's1',
        created_at: todayIso,
        client_id: 'c1',
        location_id: 'auto-papa',
        total_bags: 100,
        total_amount: 2000,
        total_cost: 1200,
        gross_profit: 800,
        cash_paid: 1200,
        transfer_paid: 0,
        credit_amount: 800
      },
      {
        id: 's2',
        created_at: todayIso,
        client_id: 'c2',
        location_id: 'auto-alexis',
        total_bags: 50,
        total_amount: 1000,
        total_cost: 600,
        gross_profit: 400,
        cash_paid: 0,
        transfer_paid: 1000,
        credit_amount: 0
      },
      // Old sale should not count in today's summary, but DOES count in totalOutstandingDebt
      {
        id: 's-old',
        created_at: oldIso,
        client_id: 'c3',
        location_id: 'auto-papa',
        total_bags: 25,
        total_amount: 500,
        total_cost: 300,
        gross_profit: 200,
        cash_paid: 200,
        transfer_paid: 0,
        credit_amount: 300
      }
    ];

    const payments = [
      { id: 'p1', created_at: todayIso, client_id: 'c3', amount: 100, method: 'efectivo' },
      { id: 'p2', created_at: todayIso, client_id: 'c1', amount: 200, method: 'transferencia' }
    ];

    const expenses = [
      { id: 'e1', created_at: todayIso, amount: 250, payment_method: 'efectivo' },
      { id: 'e2', created_at: todayIso, amount: 150, payment_method: 'transferencia' }
    ];

    const summary = computeFinancialSummary({
      sales,
      payments,
      expenses,
      dateFilter: todayKey,
      allSales: sales,
      allPayments: payments
    });

    expect(summary.totalBags).toBe(150);
    expect(summary.totalRevenue).toBe(3000);
    expect(summary.totalCost).toBe(1800); // Reinvestment fund ($12/bag)
    expect(summary.grossProfit).toBe(1200);
    expect(summary.totalExpenses).toBe(400);
    expect(summary.netProfit).toBe(800); // 1200 - 400
    expect(summary.expectedCashInHand).toBe(1050); // 1200 cash sale + 100 cash payment - 250 cash expense
    expect(summary.expectedBankTransfers).toBe(1050); // 1000 transfer sale + 200 transfer payment - 150 transfer expense
    expect(summary.creditGenerated).toBe(800);
    expect(summary.totalOutstandingDebt).toBe(800); // c1: 800-200=600, c3: 300-100=200
  });
});
