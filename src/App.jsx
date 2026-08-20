import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import InventorySetup from './components/InventorySetup';
import SalesPOS from './components/SalesPOS';
import DailyClosing from './components/DailyClosing';
import HistoryView from './components/HistoryView';
import RestockModal from './components/RestockModal';
import {
  getStoredFlavors,
  getActiveShift,
  saveActiveShift,
  getHistory,
  addShiftToHistory,
  saveHistory
} from './utils/storage';
import { sounds } from './utils/audio';

export default function App() {
  const [flavors, setFlavors] = useState(getStoredFlavors);
  const [activeShift, setActiveShift] = useState(getActiveShift);
  const [history, setHistory] = useState(getHistory);
  const [view, setView] = useState(() => {
    const shift = getActiveShift();
    return shift ? 'pos' : 'inventory';
  });
  const [isRestockOpen, setIsRestockOpen] = useState(false);

  // Sync activeShift to LocalStorage whenever it changes
  useEffect(() => {
    saveActiveShift(activeShift);
  }, [activeShift]);

  // Compute live global totals
  const computeTotals = () => {
    if (!activeShift) {
      return { revenue: 0, cost: 0, profit: 0, soldPieces: 0, remainingPieces: 0 };
    }
    const sales = activeShift.flavorSales || {};
    const inventory = activeShift.currentInventory || {};

    const soldPieces = Object.values(sales).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
    const remainingPieces = Object.values(inventory).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
    const revenue = soldPieces * 20;
    const cost = soldPieces * 12;
    const profit = soldPieces * 8;

    return { revenue, cost, profit, soldPieces, remainingPieces };
  };

  const totals = computeTotals();

  // 1. Start or overwrite shift inventory
  const handleStartShift = (initialStock) => {
    const shift = {
      id: `shift_${Date.now()}`,
      startTime: new Date().toISOString(),
      initialInventory: { ...initialStock },
      currentInventory: { ...initialStock },
      flavorSales: {},
      restocked: {},
      salesHistory: []
    };

    // Initialize flavor sales to 0
    flavors.forEach(f => {
      shift.flavorSales[f.id] = 0;
      shift.restocked[f.id] = 0;
    });

    setActiveShift(shift);
    setView('pos');
  };

  // 2. Register sale (-qty)
  const handleRegisterSale = (flavorId, qty) => {
    if (!activeShift) return;

    setActiveShift(prev => {
      const currentStock = prev.currentInventory[flavorId] || 0;
      if (currentStock < qty) return prev; // Cannot sell more than stock

      const updatedInventory = {
        ...prev.currentInventory,
        [flavorId]: currentStock - qty
      };

      const updatedSales = {
        ...prev.flavorSales,
        [flavorId]: (prev.flavorSales[flavorId] || 0) + qty
      };

      const saleRecord = {
        id: `sale_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        timestamp: Date.now(),
        flavorId,
        qty,
        revenue: qty * 20,
        cost: qty * 12,
        profit: qty * 8
      };

      return {
        ...prev,
        currentInventory: updatedInventory,
        flavorSales: updatedSales,
        salesHistory: [...prev.salesHistory, saleRecord]
      };
    });
  };

  // 3. Undo last sale
  const handleUndoLastSale = () => {
    if (!activeShift || activeShift.salesHistory.length === 0) return;

    setActiveShift(prev => {
      const historyCopy = [...prev.salesHistory];
      const lastSale = historyCopy.pop();
      if (!lastSale) return prev;

      const flavorId = lastSale.flavorId;
      const qty = lastSale.qty;

      const updatedInventory = {
        ...prev.currentInventory,
        [flavorId]: (prev.currentInventory[flavorId] || 0) + qty
      };

      const updatedSales = {
        ...prev.flavorSales,
        [flavorId]: Math.max(0, (prev.flavorSales[flavorId] || 0) - qty)
      };

      return {
        ...prev,
        currentInventory: updatedInventory,
        flavorSales: updatedSales,
        salesHistory: historyCopy
      };
    });
  };

  // 4. Restock backpack mid-route
  const handleRestock = (amounts) => {
    if (!activeShift) return;

    setActiveShift(prev => {
      const updatedInventory = { ...prev.currentInventory };
      const updatedRestocked = { ...prev.restocked };

      Object.entries(amounts).forEach(([flavorId, qty]) => {
        const add = Number(qty) || 0;
        if (add > 0) {
          updatedInventory[flavorId] = (updatedInventory[flavorId] || 0) + add;
          updatedRestocked[flavorId] = (updatedRestocked[flavorId] || 0) + add;
        }
      });

      return {
        ...prev,
        currentInventory: updatedInventory,
        restocked: updatedRestocked
      };
    });
  };

  // 5. Finish and archive shift
  const handleFinishAndSaveShift = (closingData) => {
    const updatedHistory = addShiftToHistory(closingData);
    setHistory(updatedHistory);
    setActiveShift(null);
    saveActiveShift(null);
    setView('history');
  };

  // 6. Clear history
  const handleClearHistory = () => {
    saveHistory([]);
    setHistory([]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950">
      {/* Top Application Header & Tabs */}
      <Header
        currentView={view}
        setView={setView}
        activeShift={activeShift}
        totals={totals}
      />

      {/* Main View Router */}
      <main className="flex-1">
        {view === 'inventory' && (
          <InventorySetup
            flavors={flavors}
            activeShift={activeShift}
            onStartShift={handleStartShift}
          />
        )}

        {view === 'pos' && activeShift && (
          <SalesPOS
            flavors={flavors}
            activeShift={activeShift}
            onRegisterSale={handleRegisterSale}
            onUndoLastSale={handleUndoLastSale}
            onOpenRestock={() => setIsRestockOpen(true)}
            onGoToClosing={() => setView('closing')}
          />
        )}

        {view === 'closing' && activeShift && (
          <DailyClosing
            flavors={flavors}
            activeShift={activeShift}
            onFinishAndSaveShift={handleFinishAndSaveShift}
            onBackToPOS={() => setView('pos')}
          />
        )}

        {view === 'history' && (
          <HistoryView
            history={history}
            onClearHistory={handleClearHistory}
          />
        )}
      </main>

      {/* Mid-Route Restock Modal */}
      <RestockModal
        flavors={flavors}
        isOpen={isRestockOpen}
        onClose={() => setIsRestockOpen(false)}
        onRestock={handleRestock}
      />
    </div>
  );
}
