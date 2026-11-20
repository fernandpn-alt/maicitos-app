import { db, getDeviceIdentity } from './dexie';
import { DEFAULT_SETTINGS } from '../constants/defaults';

export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateFolio(prefix = 'PED') {
  const timePart = Date.now().toString(36).slice(-3).toUpperCase();
  const randPart = String(Math.floor(10 + Math.random() * 90));
  return `${prefix}-${timePart}${randPart}`;
}

async function enqueue(tableName, recordId, opType, payload) {
  await db._outbox.add({
    op_id: generateId(),
    table_name: tableName,
    record_id: String(recordId),
    op_type: opType,
    payload,
    created_at: new Date().toISOString()
  });
}

export async function recordStockIn({
  items = [],
  location_id = 'bodega',
  actor_name,
  note = 'Entrada por cajas en bodega'
}) {
  const identity = getDeviceIdentity();
  const nowIso = new Date().toISOString();
  const validItems = items.filter((item) => (Number(item.boxes) || 0) > 0);
  if (validItems.length === 0) return [];

  const created = [];
  await db.transaction('rw', [db.products, db.stock_movements, db._outbox], async () => {
    for (const item of validItems) {
      const product = await db.products.get(item.product_id);
      const unitsPerBox = Number(item.units_per_box) || Number(product?.units_per_box) || 25;
      const boxes = Number(item.boxes) || 0;
      const delta = boxes * unitsPerBox;

      const movement = {
        id: generateId(),
        created_at: nowIso,
        product_id: item.product_id,
        location_id,
        delta,
        movement_type: 'stock_in',
        reference_id: null,
        note: `${note} (+${boxes} ${boxes === 1 ? 'caja' : 'cajas'})`,
        device_id: identity.device_id,
        actor_name: actor_name || identity.device_name,
        updated_at: nowIso,
        deleted_at: null
      };

      await db.stock_movements.put(movement);
      await enqueue('stock_movements', movement.id, 'insert_immutable', movement);
      created.push(movement);
    }
  });

  return created;
}

export async function recordTransfer({
  items = [],
  from_location_id,
  to_location_id,
  actor_name,
  note = ''
}) {
  if (!from_location_id || !to_location_id || from_location_id === to_location_id) {
    return [];
  }
  const identity = getDeviceIdentity();
  const nowIso = new Date().toISOString();
  const validItems = items.filter((item) => (Number(item.qty) || 0) > 0);
  if (validItems.length === 0) return [];

  const referenceId = generateId();
  const created = [];

  await db.transaction('rw', [db.locations, db.stock_movements, db._outbox], async () => {
    const fromLoc = await db.locations.get(from_location_id);
    const toLoc = await db.locations.get(to_location_id);
    const label = note || `Traspaso ${fromLoc?.name || from_location_id} → ${toLoc?.name || to_location_id}`;

    for (const item of validItems) {
      const qty = Math.abs(Number(item.qty) || 0);
      const outMov = {
        id: generateId(),
        created_at: nowIso,
        product_id: item.product_id,
        location_id: from_location_id,
        delta: -qty,
        movement_type: 'transfer_out',
        reference_id: referenceId,
        note: label,
        device_id: identity.device_id,
        actor_name: actor_name || identity.device_name,
        updated_at: nowIso,
        deleted_at: null
      };
      const inMov = {
        id: generateId(),
        created_at: nowIso,
        product_id: item.product_id,
        location_id: to_location_id,
        delta: qty,
        movement_type: 'transfer_in',
        reference_id: referenceId,
        note: label,
        device_id: identity.device_id,
        actor_name: actor_name || identity.device_name,
        updated_at: nowIso,
        deleted_at: null
      };

      await db.stock_movements.bulkPut([outMov, inMov]);
      await enqueue('stock_movements', outMov.id, 'insert_immutable', outMov);
      await enqueue('stock_movements', inMov.id, 'insert_immutable', inMov);
      created.push(outMov, inMov);
    }
  });

  return created;
}

export async function recordStockAdjustment({
  product_id,
  location_id = 'bodega',
  delta,
  reason = 'Ajuste manual',
  movement_type = 'adjustment',
  actor_name
}) {
  const numDelta = Number(delta) || 0;
  if (!product_id || numDelta === 0) return null;

  const identity = getDeviceIdentity();
  const nowIso = new Date().toISOString();
  const movement = {
    id: generateId(),
    created_at: nowIso,
    product_id,
    location_id,
    delta: numDelta,
    movement_type,
    reference_id: null,
    note: reason,
    device_id: identity.device_id,
    actor_name: actor_name || identity.device_name,
    updated_at: nowIso,
    deleted_at: null
  };

  await db.transaction('rw', [db.stock_movements, db._outbox], async () => {
    await db.stock_movements.put(movement);
    await enqueue('stock_movements', movement.id, 'insert_immutable', movement);
  });

  return movement;
}

export async function upsertClient(clientData) {
  const nowIso = new Date().toISOString();
  const existing = clientData.id ? await db.clients.get(clientData.id) : null;

  const record = {
    id: clientData.id || generateId(),
    name: (clientData.name || 'Cliente sin nombre').trim(),
    phone: (clientData.phone || '').trim(),
    address: (clientData.address || '').trim(),
    maps_url: (clientData.maps_url || '').trim(),
    price_tier: clientData.price_tier || existing?.price_tier || 'base',
    unit_price: Number(clientData.unit_price) || Number(existing?.unit_price) || 20,
    cycle_days: Number(clientData.cycle_days) || Number(existing?.cycle_days) || 7,
    notes: (clientData.notes || '').trim(),
    active: clientData.active !== undefined ? Boolean(clientData.active) : true,
    updated_at: nowIso,
    deleted_at: clientData.deleted_at || null
  };

  await db.transaction('rw', [db.clients, db._outbox], async () => {
    await db.clients.put(record);
    await enqueue('clients', record.id, 'upsert', record);
  });

  return record;
}

export async function softDeleteClient(clientId) {
  const existing = await db.clients.get(clientId);
  if (!existing) return null;
  const nowIso = new Date().toISOString();
  const updated = {
    ...existing,
    active: false,
    deleted_at: nowIso,
    updated_at: nowIso
  };

  await db.transaction('rw', [db.clients, db._outbox], async () => {
    await db.clients.put(updated);
    await enqueue('clients', updated.id, 'upsert', updated);
  });

  return updated;
}

export async function createOrder(orderData) {
  const identity = getDeviceIdentity();
  const nowIso = new Date().toISOString();
  const items = (orderData.items || [])
    .filter((it) => (Number(it.qty) || 0) > 0)
    .map((it) => ({
      product_id: it.product_id,
      product_name: it.product_name || it.name || it.product_id,
      emoji: it.emoji || '🌽',
      qty: Number(it.qty) || 0,
      packed_qty: Number(it.packed_qty) || 0,
      unit_price: Number(it.unit_price) || Number(orderData.unit_price) || 20
    }));

  const totalBags = items.reduce((acc, it) => acc + it.qty, 0);
  const totalAmount = items.reduce((acc, it) => acc + it.qty * it.unit_price, 0);

  const initialNotes = [];
  if (orderData.initial_note && orderData.initial_note.trim()) {
    initialNotes.push({
      id: generateId(),
      author: identity.device_name,
      role: identity.role || 'ruta',
      text: orderData.initial_note.trim(),
      created_at: nowIso
    });
  }

  const record = {
    id: generateId(),
    folio: orderData.folio || generateFolio('PED'),
    created_at: nowIso,
    client_id: orderData.client_id || null,
    client_name: (orderData.client_name || 'Cliente WhatsApp').trim(),
    client_phone: (orderData.client_phone || '').trim(),
    priority: orderData.priority || 'media',
    status: orderData.status || 'nuevo',
    assigned_location_id: orderData.assigned_location_id || 'auto-papa',
    items,
    total_bags: totalBags,
    total_amount: totalAmount,
    raw_whatsapp_text: orderData.raw_whatsapp_text || '',
    team_notes: Array.isArray(orderData.team_notes) ? orderData.team_notes : initialNotes,
    created_by_device: identity.device_id,
    updated_at: nowIso,
    deleted_at: null
  };

  await db.transaction('rw', [db.orders, db._outbox], async () => {
    await db.orders.put(record);
    await enqueue('orders', record.id, 'upsert', record);
  });

  return record;
}

export async function updateOrderStatus(orderId, status, extra = {}) {
  const existing = await db.orders.get(orderId);
  if (!existing) return null;
  const nowIso = new Date().toISOString();
  const updated = {
    ...existing,
    ...extra,
    status,
    updated_at: nowIso
  };

  await db.transaction('rw', [db.orders, db._outbox], async () => {
    await db.orders.put(updated);
    await enqueue('orders', updated.id, 'upsert', updated);
  });

  return updated;
}

export async function updateOrderPacking(orderId, items, extra = {}) {
  const existing = await db.orders.get(orderId);
  if (!existing) return null;
  const nowIso = new Date().toISOString();
  const updated = {
    ...existing,
    ...extra,
    items,
    updated_at: nowIso
  };

  await db.transaction('rw', [db.orders, db._outbox], async () => {
    await db.orders.put(updated);
    await enqueue('orders', updated.id, 'upsert', updated);
  });

  return updated;
}

export async function updateOrderPriority(orderId, priority) {
  return updateOrderStatus(orderId, (await db.orders.get(orderId))?.status || 'nuevo', {
    priority
  });
}

export async function addOrderTeamNote(orderId, { author, role, text }) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  const existing = await db.orders.get(orderId);
  if (!existing) return null;

  const identity = getDeviceIdentity();
  const nowIso = new Date().toISOString();
  const note = {
    id: generateId(),
    author: author || identity.device_name,
    role: role || identity.role || 'equipo',
    text: trimmed,
    created_at: nowIso
  };

  const updated = {
    ...existing,
    team_notes: [...(existing.team_notes || []), note],
    updated_at: nowIso
  };

  await db.transaction('rw', [db.orders, db._outbox], async () => {
    await db.orders.put(updated);
    await enqueue('orders', updated.id, 'upsert', updated);
  });

  return updated;
}

export async function completeSale({
  order_id = null,
  client_id = null,
  client_name = 'Público General',
  location_id = 'auto-papa',
  seller_name,
  items = [],
  cash_paid = 0,
  transfer_paid = 0,
  credit_amount = 0,
  payment_method = 'efectivo',
  note = ''
}) {
  const identity = getDeviceIdentity();
  const nowIso = new Date().toISOString();
  const validItems = items.filter((it) => (Number(it.qty) || 0) > 0);
  if (validItems.length === 0) return null;

  let createdSale = null;

  await db.transaction(
    'rw',
    [db.products, db.sales, db.stock_movements, db.orders, db._outbox],
    async () => {
      const normalizedItems = [];
      let totalBags = 0;
      let totalAmount = 0;
      let totalCost = 0;

      for (const it of validItems) {
        const product = await db.products.get(it.product_id);
        const qty = Number(it.qty) || 0;
        const unitPrice = Number(it.unit_price) || Number(product?.sale_price) || 20;
        const unitCost =
          it.cost_price !== undefined
            ? Number(it.cost_price) || 0
            : Number(product?.cost_price) || 12;

        normalizedItems.push({
          product_id: it.product_id,
          product_name: it.product_name || product?.name || it.product_id,
          emoji: it.emoji || product?.emoji || '🌽',
          qty,
          unit_price: unitPrice,
          cost_price: unitCost,
          subtotal: qty * unitPrice
        });

        totalBags += qty;
        totalAmount += qty * unitPrice;
        totalCost += qty * unitCost;
      }

      const grossProfit = totalAmount - totalCost;
      const saleId = generateId();
      const folio = generateFolio('VTA');

      createdSale = {
        id: saleId,
        folio,
        created_at: nowIso,
        order_id: order_id || null,
        client_id: client_id || null,
        client_name: (client_name || 'Público General').trim(),
        location_id,
        seller_name: seller_name || identity.device_name,
        items: normalizedItems,
        total_bags: totalBags,
        total_amount: totalAmount,
        total_cost: totalCost,
        gross_profit: grossProfit,
        cash_paid: Number(cash_paid) || 0,
        transfer_paid: Number(transfer_paid) || 0,
        credit_amount: Number(credit_amount) || 0,
        payment_method,
        note: (note || '').trim(),
        device_id: identity.device_id,
        updated_at: nowIso,
        deleted_at: null
      };

      await db.sales.put(createdSale);
      await enqueue('sales', createdSale.id, 'insert_immutable', createdSale);

      for (const item of normalizedItems) {
        const movement = {
          id: generateId(),
          created_at: nowIso,
          product_id: item.product_id,
          location_id,
          delta: -item.qty,
          movement_type: 'sale',
          reference_id: saleId,
          note: `Venta ${folio} (${createdSale.client_name})`,
          device_id: identity.device_id,
          actor_name: seller_name || identity.device_name,
          updated_at: nowIso,
          deleted_at: null
        };
        await db.stock_movements.put(movement);
        await enqueue('stock_movements', movement.id, 'insert_immutable', movement);
      }

      if (order_id) {
        const order = await db.orders.get(order_id);
        if (order) {
          const updatedOrder = {
            ...order,
            status: 'entregado',
            updated_at: nowIso
          };
          await db.orders.put(updatedOrder);
          await enqueue('orders', updatedOrder.id, 'upsert', updatedOrder);
        }
      }
    }
  );

  return createdSale;
}

export async function recordPayment({
  client_id,
  client_name,
  amount,
  method = 'efectivo',
  note = '',
  received_by
}) {
  const numAmount = Number(amount) || 0;
  if (!client_id || numAmount <= 0) return null;

  const identity = getDeviceIdentity();
  const nowIso = new Date().toISOString();
  const record = {
    id: generateId(),
    created_at: nowIso,
    client_id,
    client_name: (client_name || '').trim(),
    amount: numAmount,
    method,
    note: (note || 'Abono de deuda').trim(),
    received_by: received_by || identity.device_name,
    device_id: identity.device_id,
    updated_at: nowIso,
    deleted_at: null
  };

  await db.transaction('rw', [db.payments, db._outbox], async () => {
    await db.payments.put(record);
    await enqueue('payments', record.id, 'insert_immutable', record);
  });

  return record;
}

export async function recordExpense({
  category = 'gasolina',
  concept,
  amount,
  payment_method = 'efectivo',
  recorded_by
}) {
  const numAmount = Number(amount) || 0;
  if (!concept || numAmount <= 0) return null;

  const identity = getDeviceIdentity();
  const nowIso = new Date().toISOString();
  const record = {
    id: generateId(),
    created_at: nowIso,
    category,
    concept: concept.trim(),
    amount: numAmount,
    payment_method,
    recorded_by: recorded_by || identity.device_name,
    device_id: identity.device_id,
    updated_at: nowIso,
    deleted_at: null
  };

  await db.transaction('rw', [db.expenses, db._outbox], async () => {
    await db.expenses.put(record);
    await enqueue('expenses', record.id, 'insert_immutable', record);
  });

  return record;
}

export async function upsertProduct(productData) {
  const nowIso = new Date().toISOString();
  const existing = productData.id ? await db.products.get(productData.id) : null;
  const rawAliases = Array.isArray(productData.aliases)
    ? productData.aliases
    : String(productData.aliases || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

  const id =
    productData.id ||
    String(productData.name || 'sabor')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') ||
    `prod-${Date.now()}`;

  const record = {
    id,
    sku: (productData.sku || existing?.sku || `MAI-${id.slice(0, 3).toUpperCase()}`).trim(),
    name: (productData.name || existing?.name || 'Nuevo Sabor').trim(),
    short_name: (productData.short_name || productData.name || existing?.short_name || 'Sabor').trim(),
    emoji: productData.emoji || existing?.emoji || '🌽',
    color: productData.color || existing?.color || 'amber',
    cost_price: Number(productData.cost_price ?? existing?.cost_price ?? 12),
    sale_price: Number(productData.sale_price ?? existing?.sale_price ?? 20),
    units_per_box: Number(productData.units_per_box ?? existing?.units_per_box ?? 25),
    min_stock: Number(productData.min_stock ?? existing?.min_stock ?? 100),
    aliases: rawAliases.length > 0 ? rawAliases : existing?.aliases || [id],
    active: productData.active !== undefined ? Boolean(productData.active) : true,
    sort_order: Number(productData.sort_order ?? existing?.sort_order ?? 99),
    updated_at: nowIso,
    deleted_at: productData.deleted_at || null
  };

  await db.transaction('rw', [db.products, db._outbox], async () => {
    await db.products.put(record);
    await enqueue('products', record.id, 'upsert', record);
  });

  return record;
}

export async function upsertLocation(locationData) {
  const nowIso = new Date().toISOString();
  const existing = locationData.id ? await db.locations.get(locationData.id) : null;
  const id =
    locationData.id ||
    String(locationData.name || 'ubicacion')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') ||
    `loc-${Date.now()}`;

  const record = {
    id,
    name: (locationData.name || existing?.name || 'Nueva Ubicación').trim(),
    type: locationData.type || existing?.type || 'vehicle',
    driver_name: (locationData.driver_name ?? existing?.driver_name ?? '').trim(),
    active: locationData.active !== undefined ? Boolean(locationData.active) : true,
    updated_at: nowIso,
    deleted_at: locationData.deleted_at || null
  };

  await db.transaction('rw', [db.locations, db._outbox], async () => {
    await db.locations.put(record);
    await enqueue('locations', record.id, 'upsert', record);
  });

  return record;
}

export async function updateBusinessSettings(partial) {
  const nowIso = new Date().toISOString();
  const existing = await db.app_settings.get('business_config');
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(existing?.value || {}),
    ...partial,
    price_tiers: {
      ...DEFAULT_SETTINGS.price_tiers,
      ...(existing?.value?.price_tiers || {}),
      ...(partial.price_tiers || {})
    }
  };

  const record = {
    key: 'business_config',
    value: merged,
    updated_at: nowIso
  };

  await db.transaction('rw', [db.app_settings, db._outbox], async () => {
    await db.app_settings.put(record);
    await enqueue('app_settings', record.key, 'upsert', record);
  });

  return record;
}

export async function seedDemoData() {
  const existingClients = await db.clients.filter((c) => !c.deleted_at).count();
  const existingMovs = await db.stock_movements.filter((m) => !m.deleted_at).count();
  if (existingClients > 0 || existingMovs > 0) {
    return { skipped: true, reason: 'Ya existen datos operativos en este dispositivo.' };
  }

  // 1. Entrada inicial por cajas a Bodega
  await recordStockIn({
    items: [
      { product_id: 'fuego', boxes: 8 },
      { product_id: 'salsas-negras', boxes: 6 },
      { product_id: 'limon-sal', boxes: 6 },
      { product_id: 'ranchero', boxes: 4 },
      { product_id: 'jalapeno', boxes: 4 },
      { product_id: 'queso', boxes: 3 }
    ],
    location_id: 'bodega',
    actor_name: 'Demo Inicial',
    note: 'Carga inicial de cajas demo'
  });

  // 2. Traspaso al Auto Papá y Auto Alexis
  await recordTransfer({
    items: [
      { product_id: 'fuego', qty: 50 },
      { product_id: 'salsas-negras', qty: 30 },
      { product_id: 'limon-sal', qty: 20 }
    ],
    from_location_id: 'bodega',
    to_location_id: 'auto-papa',
    actor_name: 'Demo Inicial',
    note: 'Carga matutina Auto Papá'
  });

  await recordTransfer({
    items: [
      { product_id: 'fuego', qty: 25 },
      { product_id: 'ranchero', qty: 25 },
      { product_id: 'queso', qty: 15 }
    ],
    from_location_id: 'bodega',
    to_location_id: 'auto-alexis',
    actor_name: 'Demo Inicial',
    note: 'Carga Auto Alexis'
  });

  // 3. Clientes demo
  const c1 = await upsertClient({
    name: 'Tienda Don Pepe',
    phone: '5512345678',
    address: 'Av. Juárez #45, Col. Centro',
    maps_url: 'https://maps.google.com/?q=Centro',
    price_tier: 'base',
    unit_price: 20,
    cycle_days: 7,
    notes: 'Prefiere entrega antes de mediodía'
  });

  const c2 = await upsertClient({
    name: 'Abarrotes Lupita',
    phone: '5587654321',
    address: 'Calle Hidalgo #12',
    price_tier: 'base',
    unit_price: 20,
    cycle_days: 7
  });

  const c3 = await upsertClient({
    name: 'Distribuidora El Sol',
    phone: '5599887766',
    address: 'Mercado de Abastos Local 8',
    price_tier: 'vip',
    unit_price: 18,
    cycle_days: 14
  });

  // 4. Venta con pago parcial (genera fiado de $800) y venta de contado
  await completeSale({
    client_id: c1.id,
    client_name: c1.name,
    location_id: 'auto-papa',
    seller_name: 'Papá',
    items: [
      { product_id: 'fuego', product_name: 'Fuego', emoji: '🔥', qty: 30, unit_price: 20 },
      { product_id: 'salsas-negras', product_name: 'Salsas Negras', emoji: '🥢', qty: 20, unit_price: 20 }
    ],
    cash_paid: 600,
    transfer_paid: 0,
    credit_amount: 400,
    payment_method: 'parcial',
    note: 'Venta demo con abono parcial'
  });

  await completeSale({
    client_id: c2.id,
    client_name: c2.name,
    location_id: 'auto-alexis',
    seller_name: 'Alexis',
    items: [
      { product_id: 'ranchero', product_name: 'Ranchero', emoji: '🤠', qty: 15, unit_price: 20 },
      { product_id: 'queso', product_name: 'Queso', emoji: '🧀', qty: 10, unit_price: 20 }
    ],
    cash_paid: 0,
    transfer_paid: 500,
    credit_amount: 0,
    payment_method: 'transferencia',
    note: 'Transferencia demo'
  });

  // 5. Pedidos WhatsApp demo
  await createOrder({
    client_id: c1.id,
    client_name: c1.name,
    client_phone: c1.phone,
    priority: 'urgente',
    status: 'nuevo',
    assigned_location_id: 'auto-papa',
    raw_whatsapp_text: 'Hola! Mándame urgente 40 fuego, 20 salsas negras y 15 limon para hoy',
    items: [
      { product_id: 'fuego', product_name: 'Fuego', emoji: '🔥', qty: 40, unit_price: 20 },
      { product_id: 'salsas-negras', product_name: 'Salsas Negras', emoji: '🥢', qty: 20, unit_price: 20 },
      { product_id: 'limon-sal', product_name: 'Limón y Sal', emoji: '🍋', qty: 15, unit_price: 20 }
    ],
    initial_note: 'Pidió pasar antes de las 3pm'
  });

  await createOrder({
    client_id: c3.id,
    client_name: c3.name,
    client_phone: c3.phone,
    priority: 'media',
    status: 'en_auto',
    assigned_location_id: 'auto-papa',
    raw_whatsapp_text: '2 cajas de fuego y 1 caja de limon porfa',
    items: [
      { product_id: 'fuego', product_name: 'Fuego', emoji: '🔥', qty: 50, packed_qty: 50, unit_price: 18 },
      { product_id: 'limon-sal', product_name: 'Limón y Sal', emoji: '🍋', qty: 25, packed_qty: 25, unit_price: 18 }
    ]
  });

  // 6. Gastos demo
  await recordExpense({
    category: 'gasolina',
    concept: 'Gasolina Auto Papá ruta centro',
    amount: 250,
    payment_method: 'efectivo',
    recorded_by: 'Papá'
  });

  return { skipped: false };
}

export async function clearOperationalData() {
  const tables = [
    db.stock_movements,
    db.clients,
    db.orders,
    db.sales,
    db.payments,
    db.expenses,
    db._outbox
  ];

  await db.transaction('rw', tables, async () => {
    await db.stock_movements.clear();
    await db.clients.clear();
    await db.orders.clear();
    await db.sales.clear();
    await db.payments.clear();
    await db.expenses.clear();
    await db._outbox.clear();
  });
}

function triggerDownload(filename, content, mimeType) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportAllDataJSON() {
  const payload = {
    exported_at: new Date().toISOString(),
    version: '2.0.0',
    products: await db.products.toArray(),
    locations: await db.locations.toArray(),
    stock_movements: await db.stock_movements.toArray(),
    clients: await db.clients.toArray(),
    orders: await db.orders.toArray(),
    sales: await db.sales.toArray(),
    payments: await db.payments.toArray(),
    expenses: await db.expenses.toArray(),
    app_settings: await db.app_settings.toArray()
  };

  const dateTag = new Date().toISOString().slice(0, 10);
  triggerDownload(
    `maicitos-respaldo-${dateTag}.json`,
    JSON.stringify(payload, null, 2),
    'application/json'
  );
  return payload;
}

export function exportSalesCSV(sales = []) {
  const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const headers = [
    'Folio',
    'Fecha',
    'Cliente',
    'Ubicacion',
    'Vendedor',
    'Bolsas',
    'Total',
    'FondoReinversion',
    'GananciaBruta',
    'Efectivo',
    'Transferencia',
    'Fiado',
    'Metodo',
    'Nota'
  ];

  const rows = sales
    .filter((s) => !s.deleted_at)
    .map((s) =>
      [
        s.folio,
        s.created_at,
        s.client_name,
        s.location_id,
        s.seller_name,
        s.total_bags,
        s.total_amount,
        s.total_cost,
        s.gross_profit,
        s.cash_paid,
        s.transfer_paid,
        s.credit_amount,
        s.payment_method,
        s.note
      ]
        .map(escape)
        .join(',')
    );

  const csv = [headers.join(','), ...rows].join('\n');
  const dateTag = new Date().toISOString().slice(0, 10);
  triggerDownload(`maicitos-ventas-${dateTag}.csv`, csv, 'text/csv;charset=utf-8;');
}
