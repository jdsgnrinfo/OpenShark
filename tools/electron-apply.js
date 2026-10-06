'use strict';
// Diagnóstico: aplica el perfil importado desde el proceso principal de Electron.
//   electron tools/electron-apply.js
const { app } = require('electron');
const { DeviceManager } = require('../src/core/device-manager');
const { importOemProfiles } = require('../src/core/oem-import');

app.whenReady().then(async () => {
  const dm = new DeviceManager();
  dm.start();
  const waitS = Number(process.argv.find((a) => a.startsWith('--wait='))?.slice(7) || 1.5);
  await new Promise((r) => setTimeout(r, waitS * 1000));
  const [d] = dm.list();
  const [p] = importOemProfiles();
  if (!d || !p) { console.log('sin ratón o sin perfil'); return app.quit(); }
  console.log(JSON.stringify(await dm.apply(d.key, p)));
  dm.stop();
  app.quit();
});
