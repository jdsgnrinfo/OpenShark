import { t } from './i18n.js';

// KeyboardEvent.code → código de uso HID (tabla 0x07 del estándar USB HID).
const CODES = {
  Enter: 0x28, Escape: 0x29, Backspace: 0x2a, Tab: 0x2b, Space: 0x2c, Minus: 0x2d, Equal: 0x2e,
  BracketLeft: 0x2f, BracketRight: 0x30, Backslash: 0x31, Semicolon: 0x33, Quote: 0x34, Backquote: 0x35,
  Comma: 0x36, Period: 0x37, Slash: 0x38, CapsLock: 0x39, PrintScreen: 0x46, ScrollLock: 0x47, Pause: 0x48,
  Insert: 0x49, Home: 0x4a, PageUp: 0x4b, Delete: 0x4c, End: 0x4d, PageDown: 0x4e,
  ArrowRight: 0x4f, ArrowLeft: 0x50, ArrowDown: 0x51, ArrowUp: 0x52, NumLock: 0x53,
  NumpadDivide: 0x54, NumpadMultiply: 0x55, NumpadSubtract: 0x56, NumpadAdd: 0x57, NumpadEnter: 0x58,
  NumpadDecimal: 0x63, IntlBackslash: 0x64, ContextMenu: 0x65,
  ControlLeft: 0xe0, ShiftLeft: 0xe1, AltLeft: 0xe2, MetaLeft: 0xe3,
  ControlRight: 0xe4, ShiftRight: 0xe5, AltRight: 0xe6, MetaRight: 0xe7,
};
for (let i = 0; i < 26; i++) CODES['Key' + String.fromCharCode(65 + i)] = 0x04 + i;
for (let i = 1; i <= 9; i++) CODES['Digit' + i] = 0x1d + i;
CODES.Digit0 = 0x27;
for (let i = 1; i <= 12; i++) CODES['F' + i] = 0x39 + i;
for (let i = 13; i <= 24; i++) CODES['F' + i] = 0x68 + (i - 13);
for (let i = 1; i <= 9; i++) CODES['Numpad' + i] = 0x58 + i;
CODES.Numpad0 = 0x62;

// Nombres visibles de las teclas especiales (clave de traducción); el resto se deriva del código.
const PRETTY = {
  ControlLeft: 'key.ctrl', ControlRight: 'key.ctrlRight', ShiftLeft: 'key.shift', ShiftRight: 'key.shiftRight',
  AltLeft: 'key.alt', AltRight: 'key.altGr', MetaLeft: 'key.win', MetaRight: 'key.winRight', Space: 'key.space',
  Escape: 'key.esc', Backspace: 'key.backspace', Enter: 'key.enter', Delete: 'key.delete', Insert: 'key.insert',
  PageUp: 'key.pageUp', PageDown: 'key.pageDown', CapsLock: 'key.capsLock',
};
const ARROWS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };

const CODE_BY_HID = {};
for (const [code, hid] of Object.entries(CODES)) CODE_BY_HID[hid] ??= code;

function nameOf(code) {
  if (PRETTY[code]) return t(PRETTY[code]);
  if (ARROWS[code]) return ARROWS[code];
  if (code.startsWith('Numpad')) return t('key.num', { k: code.slice(6) });
  return code.replace(/^Key|^Digit/, '');
}

export const MOD = { CTRL: 0x01, SHIFT: 0x02, ALT: 0x04, WIN: 0x08 };
const MODIFIER_CODES = new Set(['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);

export const hidFromCode = (code) => CODES[code] ?? null;
export const keyName = (hid) => (CODE_BY_HID[hid] ? nameOf(CODE_BY_HID[hid]) : `0x${hid.toString(16)}`);
export const isModifierCode = (code) => MODIFIER_CODES.has(code);

export function modsFromEvent(e) {
  return (e.ctrlKey ? MOD.CTRL : 0) | (e.shiftKey ? MOD.SHIFT : 0) | (e.altKey ? MOD.ALT : 0) | (e.metaKey ? MOD.WIN : 0);
}

export function comboName(mod, key) {
  const parts = [];
  if (mod & MOD.CTRL) parts.push(t('key.ctrl'));
  if (mod & MOD.SHIFT) parts.push(t('key.shift'));
  if (mod & MOD.ALT) parts.push(t('key.alt'));
  if (mod & MOD.WIN) parts.push(t('key.win'));
  if (key) parts.push(keyName(key));
  return parts.join(' + ');
}
