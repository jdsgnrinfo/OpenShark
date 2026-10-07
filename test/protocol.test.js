'use strict';
const test = require('node:test');
const assert = require('node:assert');
const x6 = require('../src/core/protocol/x6');
const { defaultProfile } = require('../src/core/defaults');

test('polling: código y complemento como la app original', () => {
  const p = defaultProfile();
  p.pollingIndex = 3;
  assert.deepStrictEqual([...x6.encodePolling(p)], [0x06, 0x09, 0x01, 0x01, 0xfe, 0, 0, 0, 0]);
  p.pollingIndex = 0;
  assert.deepStrictEqual([...x6.encodePolling(p)].slice(3, 5), [0x08, 0xf7]);
});

test('dpi: tamaño, valores /50−1, nivel activo y checksum', () => {
  const p = defaultProfile();
  const b = x6.encodeDpi(p);
  assert.strictEqual(b.length, 56);
  assert.strictEqual(b[8], 800 / 50 - 1);
  assert.strictEqual(b[8 + 5] | (b[16 + 5] << 8), 26000 / 50 - 1);
  assert.strictEqual(b[5], 0b00111111);
  assert.strictEqual(b[24], p.dpi.active + 1);
  assert.strictEqual((b[50] << 8) | b[51], x6.checksum(b, 3, 50));
});

test('luz: brillo solo en modos estáticos', () => {
  const p = defaultProfile();
  p.light.mode = 2;
  assert.strictEqual(x6.encodeLight(p)[5] & 0x0f, 8);
  p.light.mode = 1; p.light.brightness = 3;
  assert.strictEqual(x6.encodeLight(p)[5] & 0x0f, 3);
});

test('botones: atajo personalizado y macro', () => {
  const p = defaultProfile();
  p.buttons[6] = { fn: x6.FN.SHORTCUT, mod: 0x01, key: 0x06 };
  p.buttons[7] = { fn: x6.FN.MACRO, macroId: 'm1' };
  const b = x6.encodeButtons(p);
  assert.strictEqual(b.length, 59);
  assert.deepStrictEqual([...b.subarray(3, 6)], [0x02, 0, 0]); // clic izquierdo
  assert.deepStrictEqual([...b.subarray(3 + 18, 3 + 21)], [0x11, 0x01, 0x06]);
  assert.deepStrictEqual([...b.subarray(3 + 21, 3 + 24)], [0x12, 0x00, 8]);
});

test('macro: 3 trozos de 64 bytes que reconstruyen el paquete', () => {
  const m = { id: 'm1', loops: 2, mode: 1, events: [{ key: 0x04, down: true, delay: 50 }, { key: 0x04, down: false, delay: 3000 }] };
  const pkt = x6.encodeMacro(4, m);
  assert.strictEqual(pkt.length, 131);
  assert.strictEqual(pkt[28], 3); // 2 eventos + 1 retardo largo
  const chunks = x6.chunkMacro(pkt, true);
  assert.strictEqual(chunks.length, 3);
  assert.strictEqual(chunks[2][1], 0x0c);
  const data = Buffer.concat(chunks.map((c) => c.subarray(4)));
  assert.deepStrictEqual(data.subarray(0, 128), pkt.subarray(3, 131));
});

test('entrada: batería y ACK', () => {
  assert.deepStrictEqual(x6.parseInput(Buffer.from([3, 0x10, 0x40, 1, 10])), { type: 'status', state: 'online', battery: 100 });
  assert.deepStrictEqual(x6.parseInput(Buffer.from([3, 0x10, 0x50, 0, 6])), { type: 'ack', ok: true, reportId: 6 });
  assert.strictEqual(x6.parseInput(Buffer.from([3, 0x10, 0x40, 2, 6]), { wired: true }).state, 'charging');
  // V0 = 3: en reposo sin cable; con cable (capturado del X6 al 100 %) es carga completa
  assert.strictEqual(x6.parseInput(Buffer.from([3, 0x10, 0x40, 3, 10])).state, 'sleeping');
  assert.strictEqual(x6.parseInput(Buffer.from([3, 0x10, 0x40, 3, 10]), { wired: true }).state, 'charged');
});

test('validación: exige un clic izquierdo', () => {
  const p = defaultProfile();
  p.buttons[0].fn = x6.FN.OFF;
  assert.ok(x6.validate(p).length > 0);
});
