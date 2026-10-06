'use strict';
/**
 * Lee los perfiles guardados por el software original
 * (%APPDATA%\Attack SharkX6Mouse\ms_1\pro.data): cabecera de 4 bytes y
 * 6 perfiles de 0x80E0 bytes. Offsets sacados de Mouse.exe.
 */
const fs = require('fs');
const path = require('path');
const { BUTTON_SLOTS } = require('./protocol/x6');
const { defaultProfile } = require('./defaults');

const PROFILE_SIZE = 0x80e0;
const HEADER = 4;
const BTN_BASE = 0x9a0, BTN_STRIDE = 0x4f8;

function oemDataPath() {
  return path.join(process.env.APPDATA || '', 'Attack SharkX6Mouse', 'ms_1', 'pro.data');
}

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

function parseProfile(p) {
  const i32 = (o) => p.readInt32LE(o);
  const name = p.subarray(0, 64).toString('utf16le').split('\0')[0];
  if (!name) return null;
  const prof = defaultProfile(name);
  prof.dpi.stages = Array.from({ length: 8 }, (_, i) => {
    const raw = i32(0x8c4 + 4 * i);
    const c = 0x960 + 4 * i;
    return { dpi: raw ? raw * 50 : 400 * (i + 1), color: hex(p[c], p[c + 1], p[c + 2]), enabled: i32(0x904 + 4 * i) === 1 };
  });
  prof.dpi.active = i32(0x934);
  prof.sensor = { lod: i32(0x8b4), ripple: !!i32(0x940), angleSnap: !!i32(0x944), motionSync: !!i32(0x948) };
  prof.pollingIndex = i32(0x938);
  prof.debounce = i32(0x958);
  prof.light = { mode: i32(0x94c), brightness: i32(0x924), speed: i32(0x928), color: hex(p[0x95c], p[0x95d], p[0x95e]) };
  prof.power = { deepSleep: i32(0x92c), sleep: i32(0x930) };
  prof.buttons = Array.from({ length: BUTTON_SLOTS }, (_, k) => {
    const s = BTN_BASE + k * BTN_STRIDE;
    return { fn: p[s + 1], mod: p[s + 7], key: p[s + 3], macroId: null };
  });
  return prof;
}

function importOemProfiles(file = oemDataPath()) {
  if (!fs.existsSync(file)) return [];
  const d = fs.readFileSync(file);
  const out = [];
  for (let off = HEADER; off + PROFILE_SIZE <= d.length; off += PROFILE_SIZE) {
    const prof = parseProfile(d.subarray(off, off + PROFILE_SIZE));
    if (prof) out.push(prof);
  }
  return out;
}

module.exports = { importOemProfiles, oemDataPath };
