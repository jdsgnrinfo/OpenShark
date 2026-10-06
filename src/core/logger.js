'use strict';
const fs = require('fs');
const path = require('path');

const MAX_BYTES = 1024 * 1024; // al superar 1 MB, el registro actual pasa a open-shark.old.log

/**
 * Registro de diagnóstico en texto plano, pensado para que quien pruebe otro
 * modelo pueda adjuntarlo a un issue: qué se detectó, qué se envió y qué falló.
 * Sin dir (tests, `npm run probe`) no escribe nada.
 */
class Logger {
  constructor(dir) {
    this.dir = dir || null;
    this.file = dir ? path.join(dir, 'open-shark.log') : null;
    if (dir) {
      fs.mkdirSync(dir, { recursive: true });
      this._rotate();
    }
  }

  _rotate() {
    try {
      if (fs.statSync(this.file).size > MAX_BYTES) fs.renameSync(this.file, path.join(this.dir, 'open-shark.old.log'));
    } catch (e) { /* aún no existe */ }
  }

  write(level, scope, msg, data) {
    if (!this.file) return;
    const time = new Date().toISOString().replace('T', ' ').slice(0, 23);
    let line = `${time} ${level.padEnd(5)} [${scope}] ${msg}`;
    if (data !== undefined) line += ' ' + (typeof data === 'string' ? data : JSON.stringify(data));
    try { fs.appendFileSync(this.file, line + '\n'); } catch (e) { /* sin permiso de escritura: se ignora */ }
  }

  info(scope, msg, data) { this.write('INFO', scope, msg, data); }
  warn(scope, msg, data) { this.write('WARN', scope, msg, data); }
  error(scope, msg, data) { this.write('ERROR', scope, msg, data); }
}

const hex4 = (n) => (Number.isFinite(n) ? '0x' + n.toString(16).padStart(4, '0') : '?');

module.exports = { Logger, hex4 };
