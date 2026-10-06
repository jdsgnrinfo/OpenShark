'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Logger, hex4 } = require('../src/core/logger');

test('el registro escribe una línea por evento con nivel, ámbito y datos', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openshark-log-'));
  const log = new Logger(dir);
  log.info('device', 'Conectado', { pid: hex4(0xfa60) });
  log.warn('send', 'DPI: FALLÓ');
  const lines = fs.readFileSync(path.join(dir, 'open-shark.log'), 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 2);
  assert.match(lines[0], /INFO  \[device\] Conectado \{"pid":"0xfa60"\}$/);
  assert.match(lines[1], /WARN  \[send\] DPI: FALLÓ$/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('sin carpeta el registro no escribe nada', () => {
  assert.doesNotThrow(() => new Logger().info('x', 'y'));
});
