'use strict';
/**
 * Diagnóstico por consola.
 *   npm run probe                 lista ratones y escucha eventos 5 s
 *   npm run probe -- polling 3    envía solo la frecuencia de sondeo (0=125 … 3=1000 Hz)
 *   npm run probe -- oem          envía el perfil importado del software original
 */
const HID = require('node-hid');
const { DeviceManager } = require('../src/core/device-manager');
const { importOemProfiles } = require('../src/core/oem-import');
const { defaultProfile } = require('../src/core/defaults');

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ');

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const dm = new DeviceManager();
  dm.on('input', (key, ev) => console.log('  evento', key, JSON.stringify(ev)));
  dm.scan();
  const list = dm.list();
  if (!list.length) {
    console.log('No hay ratones Attack Shark compatibles. Dispositivos 1D57 vistos:');
    HID.devices().filter((d) => d.vendorId === 0x1d57).forEach((d) =>
      console.log(`  ${d.productId.toString(16)} up=${d.usagePage.toString(16)} ${d.path}`));
    return;
  }
  list.forEach((d) => console.log(`${d.modelName} [${d.connectionLabel}] ${d.key}`));
  const key = list[0].key;

  if (cmd === 'polling') {
    const p = defaultProfile();
    p.pollingIndex = Number(arg ?? 3);
    const dev = dm.devices.get(key);
    const pkt = dev.model.protocol.encodePolling(p);
    console.log('→', hex(pkt));
    const res = await dm._sendAll(dev, [{ label: 'Frecuencia de sondeo', data: pkt }]);
    console.log(res);
  } else if (cmd === 'oem') {
    const [p] = importOemProfiles();
    if (!p) return console.log('No se encontró pro.data');
    const res = await dm.apply(key, p, { onProgress: (s) => console.log(`  ${s.done}/${s.total} ${s.label}`) });
    console.log(res);
  } else {
    console.log('Escuchando eventos 5 s (mueve el ratón o pulsa el botón DPI)…');
    await new Promise((r) => setTimeout(r, 5000));
  }
  dm.stop();
}

main().catch((e) => { console.error(e); process.exit(1); });
