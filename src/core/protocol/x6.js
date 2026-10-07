'use strict';
/**
 * Protocolo del Attack Shark X6 (receptor Beken 1D57:FA60 / cable 1D57:FA61).
 * Obtenido por ingeniería inversa de Mouse.exe v1.0 ("Attack SharkX6Mouse").
 * Ver docs/PROTOCOL.md para el detalle byte a byte.
 *
 * Todas las funciones son puras: reciben un perfil y devuelven Buffers listos
 * para HidD_SetFeature (el primer byte es el Report ID).
 */

const REPORT = { DPI: 0x04, LIGHT: 0x05, POLLING: 0x06, BUTTONS: 0x08, MACRO: 0x09, RESET: 0x0c };

// En el binario original el byte 3 del paquete DPI se rellena con "angle snap"
// (igual que el byte 6), aunque el cambio de LOD también dispara ese paquete.
// Lo más probable es que el firmware espere el LOD ahí; si notas que el LOD
// no cambia nada, pon esto a false para replicar exactamente la app original.
const LOD_AT_BYTE3 = true;

const POLLING_RATES = [125, 250, 500, 1000];
const POLLING_CODES = [0x08, 0x04, 0x02, 0x01];

// Nombres de referencia (inglés). La interfaz muestra los suyos según el idioma.
const LIGHT_MODES = [
  'Off', 'Static', 'Breathing', 'Neon', 'Multicolor breathing', 'DPI static',
  'DPI breathing', 'Rainbow wave', 'Lightning', 'Static blend', 'Marquee', 'Marquee 2',
];

/**
 * Funciones asignables a un botón: id interno de la app → bytes del firmware.
 * El nombre es de referencia (inglés); la interfaz lo traduce por id y el grupo por clave.
 */
const BUTTON_FUNCTIONS = [
  // [id, nombre, grupo, b0, b1, b2]
  [0x00, 'Disabled', 'mouse', 0x01, 0, 0],
  [0x01, 'Left click', 'mouse', 0x02, 0, 0],
  [0x02, 'Right click', 'mouse', 0x03, 0, 0],
  [0x03, 'Middle click', 'mouse', 0x04, 0, 0],
  [0x04, 'Forward', 'mouse', 0x06, 0, 0],
  [0x05, 'Back', 'mouse', 0x05, 0, 0],
  [0x09, 'Double click', 'mouse', 0x07, 0, 0],
  [0x0a, 'Rapid fire', 'mouse', 0x08, 0, 0],
  [0x0b, 'Scroll up', 'mouse', 0x09, 0, 0],
  [0x0c, 'Scroll down', 'mouse', 0x0a, 0, 0],
  [0x0d, 'Scroll left', 'mouse', 0x0b, 0, 0],
  [0x0e, 'Scroll right', 'mouse', 0x0c, 0, 0],
  [0x16, 'Easy Aim', 'mouse', 0x10, 0x00, 0x03],
  [0x06, 'DPI cycle', 'dpiLight', 0x0d, 0, 0],
  [0x07, 'DPI +', 'dpiLight', 0x0e, 0, 0],
  [0x08, 'DPI −', 'dpiLight', 0x0f, 0, 0],
  [0x17, 'Lighting cycle', 'dpiLight', 0x29, 0x00, 0x03],
  [0x34, 'Mode switch', 'dpiLight', 0x3c, 0, 0],
  [0x40, 'Media player', 'media', 0x15, 0, 0],
  [0x41, 'Play / pause', 'media', 0x18, 0, 0],
  [0x42, 'Stop', 'media', 0x19, 0, 0],
  [0x43, 'Previous track', 'media', 0x16, 0, 0],
  [0x44, 'Next track', 'media', 0x17, 0, 0],
  [0x45, 'Volume up', 'media', 0x1b, 0, 0],
  [0x46, 'Volume down', 'media', 0x1c, 0, 0],
  [0x47, 'Mute', 'media', 0x1a, 0, 0],
  [0x50, 'Browser home', 'browser', 0x25, 0, 0],
  [0x51, 'Favorites', 'browser', 0x11, 0x03, 0x12],
  [0x52, 'Browser forward', 'browser', 0x20, 0, 0],
  [0x53, 'Browser back', 'browser', 0x21, 0, 0],
  [0x54, 'Browser stop', 'browser', 0x22, 0, 0],
  [0x55, 'Refresh page', 'browser', 0x24, 0, 0],
  [0x56, 'Search', 'browser', 0x26, 0, 0],
  [0x57, 'Mail', 'browser', 0x1e, 0, 0],
  [0x58, 'Calculator', 'browser', 0x1d, 0, 0],
  [0x59, 'This PC', 'browser', 0x23, 0, 0],
  [0x20, 'Cut', 'shortcuts', 0x11, 0x01, 0x1b],
  [0x21, 'Copy', 'shortcuts', 0x11, 0x01, 0x06],
  [0x22, 'Paste', 'shortcuts', 0x11, 0x01, 0x19],
  [0x23, 'Open', 'shortcuts', 0x11, 0x01, 0x12],
  [0x24, 'Save', 'shortcuts', 0x11, 0x01, 0x16],
  [0x25, 'Find in page', 'shortcuts', 0x11, 0x01, 0x09],
  [0x27, 'Undo', 'shortcuts', 0x11, 0x01, 0x1d],
  [0x26, 'Redo', 'shortcuts', 0x11, 0x01, 0x1c],
  [0x28, 'Select all', 'shortcuts', 0x11, 0x01, 0x04],
  [0x29, 'Print', 'shortcuts', 0x11, 0x01, 0x13],
  [0x2a, 'Close window', 'shortcuts', 0x11, 0x04, 0x3d],
  [0x2b, 'Switch window', 'shortcuts', 0x11, 0x04, 0x2b],
  [0x2c, 'Show desktop', 'shortcuts', 0x11, 0x08, 0x07],
  [0x2d, 'Run', 'shortcuts', 0x11, 0x08, 0x15],
  [0x2e, 'Lock PC', 'shortcuts', 0x11, 0x08, 0x0f],
  [0x32, 'Screenshot', 'shortcuts', 0x11, 0x0a, 0x16],
  [0x10, 'Key combination…', 'custom', 0x11, 0, 0],
  [0x11, 'Macro…', 'custom', 0x12, 0, 0],
].map(([id, name, group, b0, b1, b2]) => ({ id, name, group, bytes: [b0, b1, b2] }));

const FN = { OFF: 0x00, LEFT: 0x01, SHORTCUT: 0x10, MACRO: 0x11 };
const FN_BY_ID = new Map(BUTTON_FUNCTIONS.map((f) => [f.id, f]));

const BUTTON_SLOTS = 18;
const MACRO_EVENTS_MAX = 50;

function checksum(buf, from, toExclusive) {
  let s = 0;
  for (let i = from; i < toExclusive; i++) s = (s + buf[i]) & 0xffff;
  return s;
}

function putChecksum(buf, from, toExclusive, at) {
  const s = checksum(buf, from, toExclusive);
  buf[at] = s >> 8;
  buf[at + 1] = s & 0xff;
  return buf;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Paquete 0x04: niveles de DPI, colores de nivel y opciones del sensor. 56 bytes. */
function encodeDpi(profile) {
  const { stages, active } = profile.dpi;
  const s = profile.sensor;
  const b = Buffer.alloc(0x38);
  b[0] = REPORT.DPI; b[1] = 0x38; b[2] = 0x01;
  b[3] = LOD_AT_BYTE3 ? clamp(s.lod, 0, 1) : (s.angleSnap ? 1 : 0);
  b[4] = s.ripple ? 1 : 0;
  let mask = 0;
  stages.forEach((st, i) => { if (st.enabled) mask |= 1 << i; });
  b[5] = mask;
  b[6] = s.angleSnap ? 1 : 0;
  b[7] = s.motionSync ? 1 : 0;
  for (let i = 0; i < 8; i++) {
    const st = stages[i];
    if (!st || !st.dpi) continue;
    const raw = Math.round(clamp(st.dpi, 50, 26000) / 50) - 1;
    b[8 + i] = raw & 0xff;
    b[16 + i] = (raw >> 8) & 0xff;
  }
  b[24] = clamp(active, 0, 7) + 1;
  for (let i = 0; i < 8; i++) {
    const [r, g, bl] = hexToRgb(stages[i] && stages[i].color);
    b[25 + i * 3] = r; b[26 + i * 3] = g; b[27 + i * 3] = bl;
  }
  b[49] = 0x01;
  return putChecksum(b, 3, 50, 50);
}

/** Paquete 0x05: iluminación, temporizadores de reposo y tiempo de respuesta. 15 bytes. */
function encodeLight(profile) {
  const { mode, brightness, speed, color } = profile.light;
  const deep = clamp(profile.power.deepSleep, 0, 15);
  const sleep = clamp(profile.power.sleep, 0, 255);
  const m = clamp(mode, 0, LIGHT_MODES.length - 1);
  const [r, g, bl] = hexToRgb(color);
  const b = Buffer.alloc(0x0f);
  b[0] = REPORT.LIGHT; b[1] = 0x0f; b[2] = 0x01;
  b[3] = (m << 4) & 0xff;
  b[4] = (deep & 0xf0) | ((9 - clamp(speed, 1, 8)) & 0x0f);
  b[5] = ((deep << 4) & 0xff) | (m === 1 || m === 9 ? clamp(brightness, 0, 8) : 8);
  b[6] = r; b[7] = g; b[8] = bl;
  b[9] = sleep;
  b[10] = clamp(profile.debounce, 0, 255);
  return putChecksum(b, 3, 11, 11);
}

/** Paquete 0x06: frecuencia de sondeo. 9 bytes. */
function encodePolling(profile) {
  const code = POLLING_CODES[clamp(profile.pollingIndex, 0, 3)];
  return Buffer.from([REPORT.POLLING, 0x09, 0x01, code, (~code) & 0xff, 0, 0, 0, 0]);
}

/** Paquete 0x08: asignación de los 18 botones. 59 bytes. */
function encodeButtons(profile) {
  const b = Buffer.alloc(0x3b);
  b[0] = REPORT.BUTTONS; b[1] = 0x3b; b[2] = 0x01;
  for (let k = 0; k < BUTTON_SLOTS; k++) {
    const btn = profile.buttons[k] || { fn: FN.OFF };
    const f = FN_BY_ID.get(btn.fn) || FN_BY_ID.get(FN.OFF);
    let bytes = f.bytes.slice();
    if (btn.fn === FN.SHORTCUT) bytes = [0x11, (btn.mod || 0) & 0xff, (btn.key || 0) & 0xff];
    if (btn.fn === FN.MACRO) bytes = [0x12, 0x00, k + 1];
    b.set(bytes, 3 + k * 3);
  }
  return putChecksum(b, 3, 0x39, 0x39);
}

/**
 * Paquete 0x09: macro para un botón (131 bytes, se envía en 3 trozos de 64).
 * events: [{ key: código HID, down: bool, delay: ms }]
 * mode: 1 = repetir N veces, 2 = hasta pulsar otra tecla, 3 = mientras se mantiene.
 */
function encodeMacro(slot, macro) {
  const b = Buffer.alloc(0x83);
  b[0] = REPORT.MACRO; b[1] = 0x83; b[2] = slot + 1;
  b[3] = 0;
  const loops = clamp(macro.loops || 1, 1, 255);
  b[4] = loops; b[5] = loops; b[6] = loops;
  b[7] = clamp(macro.mode || 1, 1, 3);
  let pos = 29, longDelays = 0;
  const events = (macro.events || []).slice(0, MACRO_EVENTS_MAX);
  const flag = (ev) => (ev.down ? 0x01 : 0x81);
  const delayByte = (ms) => Math.trunc(Math.max(ms, 1) / 10 + 0.5) & 0xff;
  for (const ev of events) {
    if (pos + 2 > 0x81) break;
    const delay = clamp(ev.delay, 0, 0xffff);
    if (delay > 0x4f6 && longDelays < 10 && pos + 4 <= 0x81) {
      const q = Math.floor(delay / 200);
      b[pos] = delayByte(delay - q * 200) | flag(ev); b[pos + 1] = ev.key & 0xff;
      b[pos + 2] = q & 0xff; b[pos + 3] = 0x03;
      pos += 4; longDelays++;
    } else {
      b[pos] = delayByte(Math.min(delay, 0x4f6)) | flag(ev); b[pos + 1] = ev.key & 0xff;
      pos += 2;
    }
  }
  b[28] = (events.length + longDelays) & 0xff;
  return putChecksum(b, 3, 0x81, 0x81);
}

/** Trocea un paquete de macro en 3 reports de 64 bytes, como hace la app original. */
function chunkMacro(packet, wireless) {
  const chunks = [];
  for (let i = 0; i < 3; i++) {
    const c = Buffer.alloc(0x40);
    c[0] = REPORT.MACRO;
    c[1] = wireless && i === 2 ? 0x0c : 0x40;
    c[2] = packet[2];
    c[3] = i;
    packet.copy(c, 4, 3 + i * 60, Math.min(packet.length, 3 + i * 60 + 60));
    chunks.push(c);
  }
  return chunks;
}

/** Paquete 0x0C: restaurar valores de fábrica en el ratón. */
function encodeReset() {
  return Buffer.from([REPORT.RESET, 0x0a, 0x01, 0xfe, 0x01, 0xfe, 0, 0, 0, 0]);
}

/** Lista ordenada de reports a enviar para aplicar un perfil completo. */
function encodeProfile(profile, { wireless = true } = {}) {
  const out = [
    // `label` va al registro; `key` (y `params`) permite a la interfaz nombrarlo en su idioma.
    { key: 'dpi', label: 'DPI y sensor', data: encodeDpi(profile) },
    { key: 'light', label: 'Iluminación y energía', data: encodeLight(profile) },
    { key: 'polling', label: 'Frecuencia de sondeo', data: encodePolling(profile) },
    { key: 'buttons', label: 'Botones', data: encodeButtons(profile) },
  ];
  profile.buttons.forEach((btn, k) => {
    if (btn.fn !== FN.MACRO) return;
    const macro = (profile.macros || []).find((m) => m.id === btn.macroId);
    if (!macro) return;
    chunkMacro(encodeMacro(k, macro), wireless).forEach((data, i) =>
      out.push({ key: 'macro', params: { button: k + 1, part: i + 1 }, label: `Macro botón ${k + 1} (${i + 1}/3)`, data, macro: true }));
  });
  return out;
}

/**
 * Report de entrada 0x03 (colección vendor 0x0A): [03, lo, hi, v0, v1].
 * Devuelve un evento o null.
 *
 * Estado (0x4010): V0 = 1 normal, 2 cargando, 3 en reposo. Con cable el ratón
 * no entra en reposo y envía 3 con la batería al 100 %: ahí significa carga completa.
 */
function parseInput(buf, { wired = false } = {}) {
  if (!buf || buf.length < 5 || buf[0] !== 0x03) return null;
  const code = buf[1] | (buf[2] << 8);
  const v0 = buf[3], v1 = buf[4];
  switch (code) {
    case 0x1010: return { type: 'dpiStage', stage: v0 - 1 };
    case 0x2010: return { type: 'polling', index: v0 };
    case 0x4010: return {
      type: 'status',
      state: v0 === 2 ? 'charging' : v0 === 3 ? (wired ? 'charged' : 'sleeping') : 'online',
      battery: v1 >= 1 && v1 <= 10 ? v1 * 10 : null,
    };
    case 0x5010: return { type: 'ack', ok: v0 === 0, reportId: v1 }; // V1 repite el Report ID confirmado
    case 0x7010: return { type: 'lightMode', mode: v0 };
    default: return { type: 'unknown', code, v0, v1 };
  }
}

/**
 * Valida un perfil antes de enviarlo. Devuelve códigos de problema
 * (la interfaz los traduce): needLeftClick, needDpiStage, activeDpiDisabled.
 */
function validate(profile) {
  const problems = [];
  if (!profile.buttons.some((b) => b.fn === FN.LEFT)) problems.push('needLeftClick');
  const enabled = profile.dpi.stages.filter((s) => s.enabled);
  if (!enabled.length) problems.push('needDpiStage');
  if (!profile.dpi.stages[profile.dpi.active] || !profile.dpi.stages[profile.dpi.active].enabled) {
    problems.push('activeDpiDisabled');
  }
  return problems;
}

module.exports = {
  REPORT, LOD_AT_BYTE3, POLLING_RATES, LIGHT_MODES, BUTTON_FUNCTIONS, BUTTON_SLOTS, FN, MACRO_EVENTS_MAX,
  checksum, encodeDpi, encodeLight, encodePolling, encodeButtons, encodeMacro, chunkMacro, encodeReset,
  encodeProfile, parseInput, validate,
};
