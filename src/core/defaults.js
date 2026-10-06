'use strict';
const { BUTTON_SLOTS } = require('./protocol/x6');

// Asignación de fábrica observada en pro.data (id de función por ranura).
const DEFAULT_BUTTON_FNS = [0x01, 0x02, 0x03, 0x06, 0x07, 0x08, 0x04, 0x05, 0x34,
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x0c, 0x0b];

const DEFAULT_COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#ff4000', '#ffffff'];

function defaultProfile(name = 'Perfil 1') {
  const dpis = [800, 1600, 3200, 6400, 12800, 26000, 0, 0];
  return {
    name,
    dpi: {
      active: 1,
      stages: dpis.map((dpi, i) => ({ dpi: dpi || 400 * (i + 1), color: DEFAULT_COLORS[i], enabled: dpi > 0 })),
    },
    sensor: { lod: 0, ripple: false, angleSnap: false, motionSync: true },
    pollingIndex: 3,
    debounce: 4,
    light: { mode: 1, brightness: 6, speed: 4, color: '#7f00ff' },
    power: { sleep: 1, deepSleep: 5 },
    buttons: Array.from({ length: BUTTON_SLOTS }, (_, k) => ({ fn: DEFAULT_BUTTON_FNS[k] ?? 0, mod: 0, key: 0, macroId: null })),
    macros: [],
  };
}

module.exports = { defaultProfile };
