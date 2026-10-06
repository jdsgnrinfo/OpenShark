'use strict';
/**
 * Guarda, por cada ratón (clave del DeviceManager), su apodo, sus perfiles y
 * el perfil activo. Como el ratón no permite leer su configuración, este
 * archivo es la fuente de verdad.
 */
const fs = require('fs');
const path = require('path');
const { defaultProfile } = require('./defaults');
const { importOemProfiles } = require('./oem-import');

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'open-shark.json');
    this.data = { version: 1, devices: {} };
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { /* primer arranque */ }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  /** Devuelve la entrada del ratón, creándola (con lo importado del software original si existe). */
  device(key, modelName) {
    let d = this.data.devices[key];
    if (!d) {
      const imported = importOemProfiles();
      d = {
        nickname: modelName,
        activeProfile: 0,
        profiles: imported.length ? imported : [defaultProfile()],
        importedFromOem: imported.length > 0,
      };
      this.data.devices[key] = d;
      this.save();
    }
    return d;
  }

  update(key, patch) {
    this.data.devices[key] = { ...this.data.devices[key], ...patch };
    this.save();
    return this.data.devices[key];
  }

  /** Preferencias del programa (no del ratón). */
  prefs() {
    return { theme: 'dark', tray: true, ...this.data.prefs };
  }

  setPrefs(patch) {
    this.data.prefs = { ...this.prefs(), ...patch };
    this.save();
    return this.prefs();
  }
}

module.exports = { Store };
