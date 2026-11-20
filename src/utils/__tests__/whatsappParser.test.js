import { describe, expect, it } from 'vitest';
import { INITIAL_PRODUCTS } from '../../constants/defaults';
import { parseWhatsAppOrderText } from '../whatsappParser';

const SAMPLE_CLIENTS = [
  {
    id: 'cli-1',
    name: 'Tienda Don Pepe',
    phone: '5512345678',
    unit_price: 20,
    active: true
  },
  {
    id: 'cli-2',
    name: 'Distribuidora El Sol',
    phone: '5599887766',
    unit_price: 18,
    active: true
  }
];

describe('parseWhatsAppOrderText', () => {
  it('parses standard flavors with accents, commas and "limon y sal"', () => {
    const res = parseWhatsAppOrderText(
      'Hola! Mándame 50 fuego, 30 salsas negras y 20 limón y sal por favor',
      INITIAL_PRODUCTS,
      SAMPLE_CLIENTS
    );

    expect(res.totalBags).toBe(100);
    expect(res.items).toEqual([
      expect.objectContaining({ product_id: 'fuego', qty: 50 }),
      expect.objectContaining({ product_id: 'salsas-negras', qty: 30 }),
      expect.objectContaining({ product_id: 'limon-sal', qty: 20 })
    ]);
    expect(res.unmatchedLines).toHaveLength(0);
  });

  it('converts boxes (cajas) using product units_per_box and detects urgent priority', () => {
    const res = parseWhatsAppOrderText(
      'Urgente para Distribuidora El Sol: 2 cajas de fuego y 1 caja queso',
      INITIAL_PRODUCTS,
      SAMPLE_CLIENTS
    );

    expect(res.priority).toBe('urgente');
    expect(res.matchedClient?.id).toBe('cli-2');
    expect(res.totalBags).toBe(75);
    expect(res.items).toEqual([
      expect.objectContaining({ product_id: 'fuego', qty: 50, unit_price: 18 }),
      expect.objectContaining({ product_id: 'queso', qty: 25, unit_price: 18 })
    ]);
  });

  it('handles flavor before quantity, "50x" notation, and inline multiple items', () => {
    const res = parseWhatsAppOrderText(
      'Ranchero: 25\n50x jalapeño 15 queso',
      INITIAL_PRODUCTS,
      SAMPLE_CLIENTS
    );

    expect(res.totalBags).toBe(90);
    expect(res.items).toEqual([
      expect.objectContaining({ product_id: 'ranchero', qty: 25 }),
      expect.objectContaining({ product_id: 'jalapeno', qty: 50 }),
      expect.objectContaining({ product_id: 'queso', qty: 15 })
    ]);
  });

  it('accumulates duplicate mentions of the same flavor and matches client by phone', () => {
    const res = parseWhatsAppOrderText(
      'Tel 5512345678\n20 fuego\n30 rojo',
      INITIAL_PRODUCTS,
      SAMPLE_CLIENTS
    );

    expect(res.matchedClient?.id).toBe('cli-1');
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ product_id: 'fuego', qty: 50 });
  });

  it('flags lines with quantities whose flavor is unrecognized', () => {
    const res = parseWhatsAppOrderText(
      'Tienda Don Pepe\n10 fuego\n5 tamarindo loco',
      INITIAL_PRODUCTS,
      SAMPLE_CLIENTS
    );

    expect(res.totalBags).toBe(10);
    expect(res.unmatchedLines).toEqual(['5 tamarindo loco']);
  });
});
