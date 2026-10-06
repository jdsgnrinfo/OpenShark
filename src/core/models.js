'use strict';
/**
 * Modelos soportados. Para añadir un ratón nuevo de Attack Shark:
 *  1. Averigua su VID/PID (Administrador de dispositivos o `npm run probe`).
 *  2. Si usa el mismo protocolo que el X6, añade sus PID aquí.
 *  3. Si no, crea src/core/protocol/<modelo>.js con la misma interfaz que x6.js.
 */
const x6 = require('./protocol/x6');

const MODELS = [
  {
    id: 'attackshark-x6',
    name: 'Attack Shark X6',
    vendorId: 0x1d57,
    products: {
      0xfa60: { connection: 'wireless', label: '2.4 GHz' },
      0xfa61: { connection: 'wired', label: 'Cable' },
    },
    configUsagePage: 0x0b, // colección con los Feature Reports de configuración
    eventUsagePage: 0x0a, // colección con los reports de estado (batería, DPI, ACK)
    protocol: x6,
    // Ranuras físicas del X6. El firmware admite 18; las demás no tienen botón.
    buttons: [
      { slot: 0, name: 'Clic izquierdo', short: 'Izq.' },
      { slot: 1, name: 'Clic derecho', short: 'Der.' },
      { slot: 2, name: 'Rueda', short: 'Rueda' },
      { slot: 3, name: 'Botón DPI', short: 'DPI' },
      { slot: 8, name: 'Botón de modo', short: 'Modo' }, // segundo botón bajo la rueda (de fábrica: "Cambio de modo")
      { slot: 6, name: 'Lateral delantero', short: 'Lat. 1' },
      { slot: 7, name: 'Lateral trasero', short: 'Lat. 2' },
    ],
  },
];

function findModel(vendorId, productId) {
  return MODELS.find((m) => m.vendorId === vendorId && m.products[productId]) || null;
}

module.exports = { MODELS, findModel };
