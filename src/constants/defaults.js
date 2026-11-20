export const APP_VERSION = '2.0.0';

export const COLOR_THEMES = {
  rose: {
    card: 'bg-rose-50 border-rose-300',
    badge: 'bg-rose-100 text-rose-800 border-rose-300',
    button: 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white',
    pill: 'bg-rose-600 text-white',
    accentText: 'text-rose-700'
  },
  stone: {
    card: 'bg-stone-100 border-stone-300',
    badge: 'bg-stone-200 text-stone-800 border-stone-400',
    button: 'bg-stone-800 hover:bg-stone-900 active:bg-black text-white',
    pill: 'bg-stone-800 text-white',
    accentText: 'text-stone-800'
  },
  emerald: {
    card: 'bg-emerald-50 border-emerald-300',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    button: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white',
    pill: 'bg-emerald-600 text-white',
    accentText: 'text-emerald-700'
  },
  orange: {
    card: 'bg-orange-50 border-orange-300',
    badge: 'bg-orange-100 text-orange-800 border-orange-300',
    button: 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white',
    pill: 'bg-orange-600 text-white',
    accentText: 'text-orange-700'
  },
  green: {
    card: 'bg-green-50 border-green-300',
    badge: 'bg-green-100 text-green-800 border-green-300',
    button: 'bg-green-600 hover:bg-green-700 active:bg-green-800 text-white',
    pill: 'bg-green-600 text-white',
    accentText: 'text-green-700'
  },
  amber: {
    card: 'bg-amber-50 border-amber-300',
    badge: 'bg-amber-100 text-amber-900 border-amber-300',
    button: 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950',
    pill: 'bg-amber-500 text-slate-950',
    accentText: 'text-amber-700'
  },
  indigo: {
    card: 'bg-indigo-50 border-indigo-300',
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    button: 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white',
    pill: 'bg-indigo-600 text-white',
    accentText: 'text-indigo-700'
  },
  cyan: {
    card: 'bg-cyan-50 border-cyan-300',
    badge: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    button: 'bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-white',
    pill: 'bg-cyan-600 text-white',
    accentText: 'text-cyan-700'
  }
};

export function getColorTheme(color) {
  return COLOR_THEMES[color] || COLOR_THEMES.amber;
}

export const INITIAL_PRODUCTS = [
  {
    id: 'fuego',
    sku: 'MAI-FUE-01',
    name: 'Fuego',
    short_name: 'Fuego',
    emoji: '🔥',
    color: 'rose',
    cost_price: 12,
    sale_price: 20,
    units_per_box: 25,
    min_stock: 100,
    aliases: ['fuego', 'fue', 'rojo', 'rojos', 'flamin', 'takis', 'picante'],
    active: true,
    sort_order: 1
  },
  {
    id: 'salsas-negras',
    sku: 'MAI-SAL-02',
    name: 'Salsas Negras',
    short_name: 'Salsas',
    emoji: '🥢',
    color: 'stone',
    cost_price: 12,
    sale_price: 20,
    units_per_box: 25,
    min_stock: 100,
    aliases: ['salsas negras', 'salsa negra', 'salsas', 'salsa', 'negras', 'negra', 'sal', 'sn', 'maggi'],
    active: true,
    sort_order: 2
  },
  {
    id: 'limon-sal',
    sku: 'MAI-LIM-03',
    name: 'Limón y Sal',
    short_name: 'Limón',
    emoji: '🍋',
    color: 'emerald',
    cost_price: 12,
    sale_price: 20,
    units_per_box: 25,
    min_stock: 100,
    aliases: ['limon y sal', 'limon sal', 'limon', 'limones', 'lim', 'verde', 'natural', 'clasico'],
    active: true,
    sort_order: 3
  },
  {
    id: 'ranchero',
    sku: 'MAI-RAN-04',
    name: 'Ranchero',
    short_name: 'Ranchero',
    emoji: '🤠',
    color: 'orange',
    cost_price: 12,
    sale_price: 20,
    units_per_box: 25,
    min_stock: 100,
    aliases: ['ranchero', 'rancheros', 'rancho', 'ran', 'tomate'],
    active: true,
    sort_order: 4
  },
  {
    id: 'jalapeno',
    sku: 'MAI-JAL-05',
    name: 'Jalapeño',
    short_name: 'Jalapeño',
    emoji: '🌶️',
    color: 'green',
    cost_price: 12,
    sale_price: 20,
    units_per_box: 25,
    min_stock: 80,
    aliases: ['jalapeno', 'jalapenos', 'jal', 'toreado', 'chile'],
    active: true,
    sort_order: 5
  },
  {
    id: 'queso',
    sku: 'MAI-QUE-06',
    name: 'Queso',
    short_name: 'Queso',
    emoji: '🧀',
    color: 'amber',
    cost_price: 12,
    sale_price: 20,
    units_per_box: 25,
    min_stock: 80,
    aliases: ['queso', 'quesos', 'que', 'cheddar', 'amarillo', 'amarillos'],
    active: true,
    sort_order: 6
  }
];

export const INITIAL_LOCATIONS = [
  {
    id: 'bodega',
    name: 'Bodega Principal',
    type: 'warehouse',
    driver_name: 'Bodega',
    active: true
  },
  {
    id: 'auto-papa',
    name: 'Auto Papá',
    type: 'vehicle',
    driver_name: 'Papá',
    active: true
  },
  {
    id: 'auto-alexis',
    name: 'Auto Alexis',
    type: 'vehicle',
    driver_name: 'Alexis',
    active: true
  }
];

export const DEFAULT_SETTINGS = {
  business_name: 'Maicitos en Frío',
  admin_pin: '1234',
  price_tiers: {
    base: 20,
    vip: 18,
    medio: 22
  },
  default_cost: 12,
  default_units_per_box: 25
};

export const PRICE_TIER_OPTIONS = [
  { id: 'base', label: 'Mayoreo Base', defaultPrice: 20 },
  { id: 'vip', label: 'Distribuidor VIP', defaultPrice: 18 },
  { id: 'medio', label: 'Medio Mayoreo', defaultPrice: 22 }
];

export const ORDER_STATUS_META = {
  nuevo: { label: 'Nuevo', badge: 'bg-blue-100 text-blue-800 border-blue-300' },
  armando: { label: 'Armando', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  en_auto: { label: 'En Auto', badge: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  entregado: { label: 'Entregado', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  cancelado: { label: 'Cancelado', badge: 'bg-slate-200 text-slate-600 border-slate-300' }
};

export const ORDER_PRIORITY_META = {
  urgente: { label: 'Urgente', emoji: '🔥', badge: 'bg-rose-100 text-rose-800 border-rose-300', rank: 0 },
  media: { label: 'Media', emoji: '⚡', badge: 'bg-amber-100 text-amber-800 border-amber-300', rank: 1 },
  normal: { label: 'Normal', emoji: '🟢', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300', rank: 2 }
};

export const ROLE_CONFIGS = {
  tablet: {
    id: 'tablet',
    path: '/tablet',
    title: 'Tablet Bodega',
    shortTitle: 'Tablet',
    emoji: '📟',
    defaultDeviceName: 'Tablet Lenovo Bodega',
    description: 'Botones gigantes sin animaciones pesadas: entradas por caja, empaque de pedidos y carga de autos.',
    accent: 'border-blue-500 bg-blue-50 text-blue-900'
  },
  oficina: {
    id: 'oficina',
    path: '/oficina',
    title: 'Laptop Oficina',
    shortTitle: 'Oficina',
    emoji: '💻',
    defaultDeviceName: 'Laptop Dell Bodega',
    description: 'Panel ERP completo: inventario Bodega + Autos, cola de pedidos, fiado, gastos y corte del día.',
    accent: 'border-indigo-500 bg-indigo-50 text-indigo-900'
  },
  ruta: {
    id: 'ruta',
    path: '/ruta',
    title: 'Celular Ruta',
    shortTitle: 'Ruta',
    emoji: '📱',
    defaultDeviceName: 'Celular en Ruta',
    description: 'Uso a una mano en la calle: entregas, autoventa desde cajuela, abonos de fiado y recibo WhatsApp.',
    accent: 'border-emerald-500 bg-emerald-50 text-emerald-900'
  },
  admin: {
    id: 'admin',
    path: '/admin',
    title: 'Casa Admin',
    shortTitle: 'Admin',
    emoji: '🏠',
    defaultDeviceName: 'Casa Admin (Alexis)',
    description: 'Control maestro en la nube: precios, sabores, vehículos, monitor de equipos y respaldos.',
    accent: 'border-amber-500 bg-amber-50 text-amber-950'
  }
};
