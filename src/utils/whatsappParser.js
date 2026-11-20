import { INITIAL_PRODUCTS } from '../constants/defaults';

export function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAliasCatalog(products) {
  const entries = [];
  for (const p of products) {
    if (!p || p.deleted_at || p.active === false) continue;
    const rawAliases = [
      p.name,
      p.short_name,
      p.id,
      ...(Array.isArray(p.aliases) ? p.aliases : [])
    ];
    const seen = new Set();
    for (const raw of rawAliases) {
      const norm = normalizeText(raw);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      entries.push({ alias: norm, product: p });
    }
  }
  // Longest aliases first so "limon y sal" beats "sal" and "salsas negras" beats "salsa"
  entries.sort((a, b) => b.alias.length - a.alias.length);
  return entries;
}

function matchProductInText(normalizedText, aliasCatalog) {
  if (!normalizedText) return null;
  for (const entry of aliasCatalog) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(entry.alias)}($|[^a-z0-9])`, 'i');
    if (pattern.test(normalizedText)) {
      return entry.product;
    }
  }
  return null;
}

function splitIntoClauses(rawText) {
  const baseSegments = String(rawText || '')
    .split(/[\n,;•|+]+/)
    .flatMap((seg) => seg.split(/\s+y\s+(?=\d)/i))
    .map((s) => s.trim())
    .filter(Boolean);

  const clauses = [];
  for (const rawSeg of baseSegments) {
    const seg = rawSeg.normalize('NFC');
    const norm = normalizeText(seg);
    // Split inline multi-item clauses like "50 fuego 30 queso" or "50x jalapeno 15 queso"
    const numberMatches = [...norm.matchAll(/\b\d{1,5}(?:x\b|\b)/gi)];
    if (numberMatches.length > 1) {
      let lastIndex = 0;
      for (let i = 1; i < numberMatches.length; i += 1) {
        const idx = numberMatches[i].index;
        const chunk = seg.slice(lastIndex, idx).trim();
        if (chunk) clauses.push(chunk);
        lastIndex = idx;
      }
      const tail = seg.slice(lastIndex).trim();
      if (tail) clauses.push(tail);
    } else {
      clauses.push(seg);
    }
  }

  return clauses;
}

function detectClient(rawText, clients = []) {
  const normText = normalizeText(rawText);
  const digitsInText = rawText.replace(/\D/g, '');
  let bestMatch = null;
  let bestScore = 0;

  for (const c of clients) {
    if (!c || c.deleted_at || c.active === false) continue;

    // Phone check
    const cleanPhone = String(c.phone || '').replace(/\D/g, '');
    const last10 = cleanPhone.slice(-10);
    if (last10.length >= 7 && digitsInText.includes(last10)) {
      return c;
    }

    // Name check (longest match wins)
    const normName = normalizeText(c.name);
    if (normName.length >= 3 && normText.includes(normName)) {
      if (normName.length > bestScore) {
        bestScore = normName.length;
        bestMatch = c;
      }
    }
  }

  return bestMatch;
}

export function parseWhatsAppOrderText(
  rawText,
  products = INITIAL_PRODUCTS,
  clients = []
) {
  const text = String(rawText || '').trim();
  if (!text) {
    return {
      items: [],
      matchedClient: null,
      priority: 'media',
      totalBags: 0,
      unmatchedLines: []
    };
  }

  const normFull = normalizeText(text);
  const priority = /\b(urgente|urge|ahorita|prioridad|inmediato|para ya|hoy mismo)\b/i.test(
    normFull
  )
    ? 'urgente'
    : 'media';

  const matchedClient = detectClient(text, clients);
  const aliasCatalog = buildAliasCatalog(products);
  const clauses = splitIntoClauses(text);

  const itemsMap = new Map();
  const unmatchedLines = [];

  for (const clause of clauses) {
    const normClause = normalizeText(clause);

    // Ignore long phone numbers (>= 7 digits)
    if (/\b\d{7,}\b/.test(normClause) && !matchProductInText(normClause, aliasCatalog)) {
      continue;
    }

    const qtyRegex =
      /(?:^|[^a-z0-9])(\d{1,4})\s*(?:x\b)?\s*(cajas?|cjs?|cj|bolsas?|bls|pzas?|piezas?|paquetes?)?(?=$|[^a-z0-9])/i;
    const qtyMatch = normClause.match(qtyRegex);

    if (!qtyMatch) {
      continue;
    }

    const rawQty = Number(qtyMatch[1]) || 0;
    if (rawQty <= 0) continue;

    const unitWord = (qtyMatch[2] || '').toLowerCase();
    const isBox = unitWord.startsWith('caja') || unitWord.startsWith('cj');

    const textWithoutQty = normClause.replace(qtyMatch[0], ' ').trim();
    const product = matchProductInText(textWithoutQty, aliasCatalog);

    if (product) {
      const unitsPerBox = Number(product.units_per_box) || 25;
      const bags = isBox ? rawQty * unitsPerBox : rawQty;
      const prev = itemsMap.get(product.id);

      if (prev) {
        prev.qty += bags;
      } else {
        itemsMap.set(product.id, {
          product_id: product.id,
          product_name: product.name,
          emoji: product.emoji || '🌽',
          qty: bags,
          packed_qty: 0,
          unit_price: Number(matchedClient?.unit_price) || Number(product.sale_price) || 20
        });
      }
    } else {
      // Only flag as unmatched if it isn't part of a matched client's name/address
      const clientNameNorm = matchedClient ? normalizeText(matchedClient.name) : '';
      if (!clientNameNorm || !normClause.includes(clientNameNorm)) {
        unmatchedLines.push(clause);
      }
    }
  }

  const items = Array.from(itemsMap.values());
  const totalBags = items.reduce((sum, it) => sum + it.qty, 0);

  return {
    items,
    matchedClient,
    priority,
    totalBags,
    unmatchedLines
  };
}
