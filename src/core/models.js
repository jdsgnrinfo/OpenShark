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
    // `id` es la clave con la que la interfaz nombra el botón en cada idioma.
    buttons: [
      { slot: 0, id: 'left', name: 'Left button' },
      { slot: 1, id: 'right', name: 'Right button' },
      { slot: 2, id: 'wheel', name: 'Wheel' },
      { slot: 3, id: 'dpi', name: 'DPI button' },
      { slot: 8, id: 'mode', name: 'Mode button' }, // segundo botón bajo la rueda (de fábrica: "Cambio de modo")
      { slot: 6, id: 'sideFront', name: 'Front side button' },
      { slot: 7, id: 'sideBack', name: 'Rear side button' },
    ],
  },
];

function findModel(vendorId, productId) {
  return MODELS.find((m) => m.vendorId === vendorId && m.products[productId]) || null;
}

module.exports = { MODELS, findModel };
