// =============================================
// CONFIGURACIÓN
// =============================================

// Monedas disponibles
const CURRENCIES = {
  'PEN': { symbol: 'S/',  locale: 'es-PE', name: 'Sol peruano (S/)' },
  'USD': { symbol: '$',   locale: 'en-US', name: 'Dólar (USD)' },
  'EUR': { symbol: '€',   locale: 'es-ES', name: 'Euro (EUR)' },
  'CLP': { symbol: '$',   locale: 'es-CL', name: 'Peso chileno (CLP)' },
  'COP': { symbol: '$',   locale: 'es-CO', name: 'Peso colombiano (COP)' },
  'MXN': { symbol: '$',   locale: 'es-MX', name: 'Peso mexicano (MXN)' },
  'ARS': { symbol: '$',   locale: 'es-AR', name: 'Peso argentino (ARS)' },
  'BRL': { symbol: 'R$',  locale: 'pt-BR', name: 'Real brasileño (BRL)' },
  'BOB': { symbol: 'Bs',  locale: 'es-BO', name: 'Boliviano (BOB)' },
};

// Moneda activa (se actualiza al cargar el perfil)
let CURRENCY        = 'PEN';
let CURRENCY_SYMBOL = 'S/';
let LOCALE          = 'es-PE';

function setCurrency(code) {
  const c = CURRENCIES[code];
  if (!c) return;
  CURRENCY        = code;
  CURRENCY_SYMBOL = c.symbol;
  LOCALE          = c.locale;
}
