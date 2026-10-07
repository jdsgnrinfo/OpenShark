'use strict';
const { EventEmitter } = require('events');
const HID = require('node-hid');
const { MODELS, findModel } = require('./models');
const { Logger, hex4 } = require('./logger');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UNKNOWN_INPUTS_LOGGED = 20; // reports sin interpretar que se guardan por ratón

/** Error con un código que la interfaz traduce (el mensaje es solo para el registro). */
function fail(code, message, problems) {
  return Object.assign(new Error(message), { code, problems });
}

/**
 * ¿Merece la pena registrar este dispositivo HID? Los de marcas conocidas, los
 * que se llaman "Shark"/"Attack" y cualquier ratón: así un modelo aún no
 * soportado deja en el registro su VID/PID y sus colecciones.
 */
function isCandidate(info, vendorIds) {
  if (vendorIds.has(info.vendorId)) return true;
  if (/shark|attack/i.test(`${info.manufacturer || ''} ${info.product || ''}`)) return true;
  return info.usagePage === 0x01 && info.usage === 0x02;
}

/** "\\?\HID#VID_1D57&PID_FA60&MI_02&Col04#7&3508fd94&0&0003#{…}" → "7&3508fd94&0" */
function instanceOf(path) {
  const m = /#([^#]+)#\{/.exec(path);
  return m ? m[1].replace(/&[0-9a-f]{4}$/i, '').toLowerCase() : path;
}

/**
 * Detecta ratones soportados, mantiene abierta la colección de eventos de cada
 * uno (batería, nivel de DPI, ACK) y envía perfiles.
 *
 * Eventos: 'change' (lista de dispositivos), 'status' (key, estado).
 */
class DeviceManager extends EventEmitter {
  constructor({ log } = {}) {
    super();
    this.devices = new Map(); // key → { key, model, productId, connection, configPath, eventPath, handle, status }
    this.timer = null;
    this.log = log || new Logger();
    this.lastHidSignature = '';
    this.warned = new Set(); // avisos que ya se registraron una vez (el escaneo se repite cada 2 s)
  }

  start(intervalMs = 2000) {
    this.scan();
    this.timer = setInterval(() => this.scan(), intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    for (const d of this.devices.values()) this._closeEvents(d);
    this.devices.clear();
  }

  scan() {
    const vendorIds = new Set(MODELS.map((m) => m.vendorId));
    const found = new Map();
    let all;
    try {
      all = HID.devices();
    } catch (e) {
      this.log.error('hid', 'No se pudo enumerar los dispositivos HID', e.message);
      return;
    }
    this._logHid(all, vendorIds);
    for (const info of all) {
      if (!vendorIds.has(info.vendorId)) continue;
      const model = findModel(info.vendorId, info.productId);
      if (!model) continue;
      const key = `${model.id}:${info.productId.toString(16)}:${instanceOf(info.path)}`;
      const entry = found.get(key) || { key, model, productId: info.productId, configPath: null, eventPath: null };
      if (info.usagePage === model.configUsagePage) entry.configPath = info.path;
      if (info.usagePage === model.eventUsagePage) entry.eventPath = info.path;
      found.set(key, entry);
    }

    const configured = new Set([...found.values()].filter((e) => e.configPath).map((e) => `${e.model.id}:${e.productId}`));
    let changed = false;
    for (const [key, d] of this.devices) {
      if (!found.has(key)) {
        this.log.info('device', `Desconectado: ${d.model.name} (${d.connectionLabel})`, key);
        this._closeEvents(d); this.devices.delete(key); changed = true;
      }
    }
    for (const [key, entry] of found) {
      const known = this.devices.get(key);
      if (known && !known.handle) this._openEvents(known); // el canal de fondo se cayó: reabrir
      if (!entry.configPath) {
        // Cada interfaz USB del receptor aparece con su propia instancia; solo es un problema si
        // ninguna de las de este PID trae la colección de configuración.
        if (configured.has(`${entry.model.id}:${entry.productId}`)) continue;
        this._warnOnce(`${entry.model.id}:${entry.productId}`, 'device', `${entry.model.name} sin colección de configuración (usage page ${hex4(entry.model.configUsagePage)}); no se puede configurar`, key);
        continue;
      }
      if (known) continue;
      const product = entry.model.products[entry.productId];
      const d = { ...entry, connection: product.connection, connectionLabel: product.label, handle: null,
        status: { state: 'online', battery: null, dpiStage: null }, unknownInputs: 0 };
      this.log.info('device', `Conectado: ${d.model.name} (${d.connectionLabel})`,
        { key, pid: hex4(d.productId), eventos: !!d.eventPath });
      this.devices.set(key, d);
      this._openEvents(d);
      changed = true;
    }
    if (changed) this.emit('change', this.list());
  }

  list() {
    return [...this.devices.values()].map((d) => ({
      key: d.key,
      modelId: d.model.id,
      modelName: d.model.name,
      connection: d.connection,
      connectionLabel: d.connectionLabel,
      buttons: d.model.buttons,
      status: d.status,
    }));
  }

  _warnOnce(id, scope, msg, data) {
    if (this.warned.has(id)) return;
    this.warned.add(id);
    this.log.warn(scope, msg, data);
  }

  /** Registra los dispositivos HID candidatos, solo cuando la lista cambia. */
  _logHid(all, vendorIds) {
    // El nombre se compara aparte: algunos receptores lo devuelven cortado ("U", "USB G"…)
    // en cada lectura, y eso no es un cambio de dispositivos.
    const ids = (i) => ({
      vid: hex4(i.vendorId), pid: hex4(i.productId),
      usagePage: hex4(i.usagePage), usage: hex4(i.usage), interfaz: i.interface,
    });
    const candidates = all.filter((i) => isCandidate(i, vendorIds));
    const signature = [...new Set(candidates.map((i) => JSON.stringify(ids(i))))].sort().join('\n');
    if (signature === this.lastHidSignature) return;
    this.lastHidSignature = signature;
    const rows = candidates.map((i) => ({
      ...ids(i), producto: i.product || '', fabricante: i.manufacturer || '',
      soportado: !!findModel(i.vendorId, i.productId),
    }));
    const lines = [...new Set(rows.map((r) => JSON.stringify(r)))].sort();
    this.log.info('hid', `Dispositivos HID relevantes (${lines.length}):`);
    for (const l of lines) this.log.info('hid', '  ' + l);
  }

  _openEvents(d) {
    if (!d.eventPath) {
      this._warnOnce(`${d.key}:noevents`, 'device', `${d.model.name}: no se encontró la colección de eventos (usage page ${hex4(d.model.eventUsagePage)}); no habrá batería, nivel DPI ni ACK`);
      return;
    }
    try {
      d.handle = new HID.HID(d.eventPath);
      d.handle.on('data', (buf) => this._onInput(d, buf));
      d.handle.on('error', (e) => {
        this.log.warn('device', `Canal de eventos cerrado por error: ${d.model.name}`, e?.message || String(e));
        this._closeEvents(d);
      });
    } catch (e) {
      // otra app puede tenerlo en exclusiva; se reintenta en el próximo escaneo
      this._warnOnce(`${d.key}:open`, 'device', `No se pudo abrir el canal de eventos de ${d.model.name}`, e.message);
      d.handle = null;
    }
  }

  _closeEvents(d) {
    if (!d.handle) return;
    try { d.handle.removeAllListeners(); d.handle.close(); } catch (e) { /* ya cerrado */ }
    d.handle = null;
  }

  _onInput(d, buf) {
    const ev = d.model.protocol.parseInput(Buffer.from(buf), { wired: d.connection === 'wired' });
    if (!ev) {
      // Reports que el protocolo no entiende: pistas para dar soporte a funciones o modelos nuevos.
      if (d.unknownInputs++ < UNKNOWN_INPUTS_LOGGED) this.log.info('input', `Report sin interpretar de ${d.model.name}`, Buffer.from(buf).toString('hex'));
      return;
    }
    this.emit('input', d.key, ev);
    if (ev.type === 'status') {
      if (ev.state !== d.status.state || ev.battery !== d.status.battery) {
        this.log.info('battery', `${d.model.name}: ${ev.state}, ${ev.battery ?? '?'} %`, Buffer.from(buf).toString('hex'));
      }
      Object.assign(d.status, { state: ev.state, battery: ev.battery ?? d.status.battery });
    } else if (ev.type === 'dpiStage') d.status.dpiStage = ev.stage;
    else return;
    this.emit('status', d.key, { ...d.status });
  }

  /**
   * Abre un canal de eventos propio para un envío. El canal de fondo puede
   * dejar de entregar datos tras horas abierto o después de que el ratón
   * duerma; uno recién abierto siempre recibe los ACK.
   */
  _openAckChannel(d) {
    let pending = null;
    let ch = null;
    try {
      ch = new HID.HID(d.eventPath);
      ch.on('data', (buf) => {
        const ev = d.model.protocol.parseInput(Buffer.from(buf));
        if (process.env.OPEN_SHARK_DEBUG) console.log('[ack] ←', Buffer.from(buf).toString('hex'));
        if (!ev || ev.type !== 'ack' || !pending) return;
        if (ev.reportId && ev.reportId !== pending.reportId) return;
        const p = pending; pending = null;
        clearTimeout(p.timer); p.resolve(ev.ok);
      });
      ch.on('error', () => {});
    } catch (e) {
      ch = null;
    }
    return {
      available: !!ch,
      wait(reportId, timeoutMs) {
        if (!ch) return sleep(80).then(() => null);
        return new Promise((resolve) => {
          pending = { reportId, resolve, timer: setTimeout(() => { pending = null; resolve(null); }, timeoutMs) };
        });
      },
      close() { try { ch && ch.removeAllListeners('data'); ch && ch.close(); } catch (e) { /* ya cerrado */ } },
    };
  }

  /**
   * Envía un perfil completo. Devuelve [{ label, ok, acked }].
   * En 2.4 GHz el receptor confirma cada paquete con un ACK (0x5010); si no
   * llega, se reintenta como hace la app original.
   */
  async apply(key, profile, { onProgress } = {}) {
    const d = this.devices.get(key);
    if (!d) throw fail('notConnected', 'El ratón ya no está conectado.');
    const proto = d.model.protocol;
    const problems = proto.validate(profile);
    if (problems.length) throw fail('invalidProfile', `Perfil no válido: ${problems.join(', ')}`, problems);

    const wireless = d.connection === 'wireless';
    const packets = proto.encodeProfile(profile, { wireless });
    return this._sendAll(d, packets, onProgress);
  }

  async reset(key) {
    const d = this.devices.get(key);
    if (!d) throw fail('notConnected', 'El ratón ya no está conectado.');
    return this._sendAll(d, [{ key: 'reset', label: 'Restaurar fábrica', data: d.model.protocol.encodeReset() }]);
  }

  async _sendAll(d, packets, onProgress) {
    const wireless = d.connection === 'wireless';
    this.log.info('send', `Enviando ${packets.length} paquetes a ${d.model.name} (${d.connectionLabel})`);
    let dev;
    try {
      dev = new HID.HID(d.configPath);
    } catch (e) {
      this.log.error('send', 'No se pudo abrir la colección de configuración', e.message);
      throw fail('openFailed', 'No se pudo abrir el ratón.');
    }
    const acks = wireless && d.eventPath ? this._openAckChannel(d) : null;
    if (wireless && !acks?.available) this.log.warn('send', 'Sin canal de ACK: no se podrá confirmar cada paquete');
    const results = [];
    try {
      for (let i = 0; i < packets.length; i++) {
        const p = packets[i];
        let ok = false, acked = null;
        for (let attempt = 0; attempt < (acks ? 4 : 1) && !acked; attempt++) {
          const ackP = acks ? acks.wait(p.data[0], 800) : null;
          try {
            ok = dev.sendFeatureReport([...p.data]) > 0;
          } catch (e) {
            ok = false;
            this.log.warn('send', `${p.label}: error al enviar (intento ${attempt + 1})`, e.message);
          }
          const t0 = Date.now();
          acked = acks ? await ackP : ok;
          if (process.env.OPEN_SHARK_DEBUG) console.log(`[send] ${p.label} intento ${attempt + 1}: ok=${ok} ack=${acked} (${Date.now() - t0} ms)`);
          if (!acks) await sleep(p.macro ? 200 : 40);
        }
        results.push({ key: p.key, params: p.params, label: p.label, ok, acked });
        const unconfirmed = acked === null && ok && !acks?.available;
        const verdict = acked ? 'OK' : acked === false && acks ? 'rechazado por el ratón'
          : acked === null && ok ? (unconfirmed ? 'enviado, sin confirmación' : 'sin ACK tras 4 intentos') : 'FALLÓ';
        this.log[acked || unconfirmed ? 'info' : 'warn']('send', `${p.label}: ${verdict}`,
          { report: hex4(p.data[0]), bytes: Buffer.from(p.data.slice(0, 16)).toString('hex') });
        if (onProgress) onProgress({ done: i + 1, total: packets.length, label: p.label });
      }
    } finally {
      dev.close();
      if (acks) acks.close();
    }
    return results;
  }
}

module.exports = { DeviceManager, instanceOf };
