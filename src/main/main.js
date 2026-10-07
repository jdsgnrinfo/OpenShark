'use strict';
const os = require('os');
const path = require('path');
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, nativeTheme, shell } = require('electron');
const { DeviceManager } = require('../core/device-manager');
const { Store } = require('../core/store');
const { Logger } = require('../core/logger');
const { defaultProfile } = require('../core/defaults');
const { importOemProfiles } = require('../core/oem-import');
const x6 = require('../core/protocol/x6');

let win;
let tray;
let quitting = false;
// Registro de diagnóstico: %APPDATA%\Open Shark\logs\open-shark.log
const LOG_DIR = app.getPath('logs');
const log = new Logger(LOG_DIR);
const devices = new DeviceManager({ log });
process.on('uncaughtException', (e) => log.error('main', 'Excepción no controlada', e.stack || e.message));
process.on('unhandledRejection', (e) => log.error('main', 'Promesa rechazada sin controlar', e?.stack || String(e)));
let store;
const ASSETS = path.join(__dirname, 'assets');
// `--hidden`: arranca solo en la bandeja (se usa al iniciar con Windows).
const startHidden = process.argv.includes('--hidden');

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function showWindow() {
  if (!win || win.isDestroyed()) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/* ——— Idioma: inglés por defecto; español si Windows está en español y no se eligió otro ——— */
const MAIN_TEXT = {
  en: {
    open: 'Open Open Shark', login: 'Start with Windows', quit: 'Quit',
    hintTitle: 'Open Shark is still running',
    hintBody: 'It is in the system tray. Click the icon to open it, or right-click to quit.',
  },
  es: {
    open: 'Abrir Open Shark', login: 'Iniciar con Windows', quit: 'Salir',
    hintTitle: 'Open Shark sigue activo',
    hintBody: 'Está en la bandeja del sistema. Haz clic en el icono para abrirlo o clic derecho para salir.',
  },
};
const LANGS = Object.keys(MAIN_TEXT);
// `--lang=en|es` fuerza un idioma sin guardarlo (útil para capturas).
const langArg = process.argv.find((a) => a.startsWith('--lang='))?.slice(7);
function currentLang() {
  if (LANGS.includes(langArg)) return langArg;
  const chosen = store?.prefs().lang;
  if (LANGS.includes(chosen)) return chosen;
  return app.getLocale().toLowerCase().startsWith('es') ? 'es' : 'en';
}
const T = () => MAIN_TEXT[currentLang()];

/* ——— Bandeja del sistema: la app sigue activa al cerrar la ventana ——— */
const loginArgs = () => (app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden']);
const startsWithWindows = () => app.getLoginItemSettings({ path: process.execPath, args: loginArgs() }).openAtLogin;

function buildTrayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: T().open, click: showWindow },
    { type: 'separator' },
    {
      label: T().login, type: 'checkbox', checked: startsWithWindows(),
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, path: process.execPath, args: loginArgs() });
        buildTrayMenu();
      },
    },
    { type: 'separator' },
    { label: T().quit, click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ASSETS, 'tray.png')));
  tray.setToolTip('Open Shark');
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
  buildTrayMenu();
}

/* ——— Tema: claro, oscuro o como Windows ———
   nativeTheme.themeSource hace que el renderer reciba el modo por prefers-color-scheme;
   aquí solo se recolorea la barra de título que dibuja Windows. */
const THEME_FRAME = {
  dark: { bg: '#0c0c0d', symbols: '#8b8b92' },
  light: { bg: '#ececef', symbols: '#62626a' },
};
const frameColors = () => THEME_FRAME[nativeTheme.shouldUseDarkColors ? 'dark' : 'light'];
function paintFrame() {
  if (!win || win.isDestroyed()) return;
  const c = frameColors();
  win.setBackgroundColor(c.bg);
  win.setTitleBarOverlay({ color: c.bg, symbolColor: c.symbols, height: 36 });
}
nativeTheme.on('updated', paintFrame);

let trayHintShown = false;
function createWindow() {
  const frame = frameColors();
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: 'Open Shark',
    icon: path.join(ASSETS, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    show: !startHidden,
    backgroundColor: frame.bg,
    autoHideMenuBar: true,
    // Barra de título propia con el fondo del tema; Windows dibuja solo los botones.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: frame.bg, symbolColor: frame.symbols, height: 36 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Con --capture se dibuja fuera de pantalla: la captura sale aunque la pantalla esté bloqueada o apagada.
      offscreen: process.argv.some((a) => a.startsWith('--capture=')),
    },
  });
  // Con "Mantener en la bandeja" activo, cerrar la ventana la oculta; "Salir" en el icono cierra de verdad.
  win.on('close', (e) => {
    if (quitting || process.argv.some((a) => a.startsWith('--capture='))) return;
    if (!store.prefs().tray) { quitting = true; app.quit(); return; }
    e.preventDefault();
    win.hide();
    if (!trayHintShown) {
      trayHintShown = true;
      tray?.displayBalloon({ iconType: 'info', title: T().hintTitle, content: T().hintBody });
    }
  });
  win.webContents.on('console-message', (e) => {
    if (e.level !== 'error' && e.level !== 'warning') return;
    console.log(`[renderer ${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
    log[e.level === 'error' ? 'error' : 'warn']('ui', e.message, `${path.basename(e.sourceId || '')}:${e.lineNumber}`);
  });
  win.webContents.on('render-process-gone', (_e, details) => log.error('ui', 'La interfaz se cerró inesperadamente', details));
  // `--tab=botones|…` abre directamente una pestaña (útil para capturas y pruebas).
  const tabArg = process.argv.find((a) => a.startsWith('--tab='));
  win.loadFile(path.join(__dirname, '../renderer/index.html'), tabArg ? { query: { tab: tabArg.slice(6) } } : {});

  // `--capture=archivo.png` guarda una captura de la ventana a los 4 s (para revisar el diseño).
  const capArg = process.argv.find((a) => a.startsWith('--capture='));
  if (capArg) {
    const clickArg = process.argv.find((a) => a.startsWith('--click='));
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      // Varios selectores separados por "|" se pulsan en orden, con una pausa entre ellos.
      for (const sel of clickArg ? clickArg.slice(8).split('|') : []) {
        // "js:código" ejecuta código y "key:Tecla" pulsa una tecla real, en vez de pulsar un selector.
        if (sel.startsWith('key:')) {
          const keyCode = sel.slice(4);
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
          win.webContents.sendInputEvent({ type: 'char', keyCode: keyCode === 'Enter' ? '\r' : keyCode });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
        } else {
          await win.webContents.executeJavaScript(sel.startsWith('js:') ? sel.slice(3) : `document.querySelector(${JSON.stringify(sel)})?.click()`);
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      const heightArg = process.argv.find((a) => a.startsWith('--height='));
      if (heightArg) {
        win.setContentSize(1280, Number(heightArg.slice(9)) || 1400);
        await new Promise((r) => setTimeout(r, 800));
      }
      const img = await win.webContents.capturePage();
      require('fs').writeFileSync(capArg.slice(10), img.toPNG());
      console.log('captura guardada', img.isEmpty() ? '(vacía: la ventana no se está pintando)' : '');
      console.log(await win.webContents.executeJavaScript("document.querySelector('#panel')?.innerText || '(panel vacío)'"));
      console.log(await win.webContents.executeJavaScript(`JSON.stringify({
        tema: document.documentElement.dataset.theme,
        seccion: document.querySelector('#drawer-title')?.textContent,
        fotos: [...document.querySelectorAll('img.mouse, .mouse-art img')].map((i) => i.complete && i.naturalWidth ? i.naturalWidth + 'x' + i.naturalHeight : 'NO CARGA'),
        puntos: document.querySelectorAll('.hot').length,
        desplegables: [...document.querySelectorAll('.dd-btn')].map((b) => b.textContent.trim()),
        escala: document.querySelector('#canvas')?.style.getPropertyValue('--s'),
        dialogo: document.querySelector('#dialog')?.open,
        ajustes: document.querySelector('#settings')?.open,
      }, null, 1)`));
      // Termina solo y de forma ordenada (cerrar los procesos a la fuerza deja avisos falsos en la consola).
      quitting = true;
      app.quit();
    }, 4000));
  }
}

ipcMain.handle('catalog', () => ({
  lightModes: x6.LIGHT_MODES,
  pollingRates: x6.POLLING_RATES,
  buttonFunctions: x6.BUTTON_FUNCTIONS.map(({ id, name, group }) => ({ id, name, group })),
  fn: x6.FN,
  macroEventsMax: x6.MACRO_EVENTS_MAX,
}));
const fullPrefs = () => ({ ...store.prefs(), lang: currentLang(), login: startsWithWindows(), version: app.getVersion() });
ipcMain.handle('prefs:get', fullPrefs);
ipcMain.handle('logs:open', () => shell.openPath(LOG_DIR));
ipcMain.handle('prefs:set', (_e, patch) => {
  const { login, ...rest } = patch || {};
  if (login !== undefined) app.setLoginItemSettings({ openAtLogin: !!login, path: process.execPath, args: loginArgs() });
  if (rest.lang && !LANGS.includes(rest.lang)) delete rest.lang;
  const prefs = store.setPrefs(rest);
  if (rest.theme) nativeTheme.themeSource = prefs.theme;
  if (login !== undefined || rest.lang) buildTrayMenu();
  return fullPrefs();
});
ipcMain.handle('devices:list', () => devices.list());
ipcMain.handle('device:get', (_e, key, modelName) => store.device(key, modelName));
ipcMain.handle('device:save', (_e, key, patch) => store.update(key, patch));
ipcMain.handle('profile:default', (_e, name) => defaultProfile(name));
ipcMain.handle('oem:import', () => {
  try {
    const res = importOemProfiles();
    log.info('oem', `Importación del software original: ${res.length} perfiles`);
    return res;
  } catch (e) {
    log.warn('oem', 'No se pudo importar del software original', e.message);
    throw e;
  }
});
/** Resume un envío en una línea del registro: cuántos paquetes se confirmaron y cuáles no. */
function logSendSummary(action, results) {
  const failed = results.filter((r) => !r.acked && !(r.acked === null && r.ok)).map((r) => r.label);
  log[failed.length ? 'warn' : 'info']('send', `${action}: ${results.length - failed.length}/${results.length} correctos`, failed.length ? { fallidos: failed } : undefined);
}
ipcMain.handle('device:apply', async (_e, key, profile) => {
  try {
    const results = await devices.apply(key, profile, { onProgress: (p) => send('apply:progress', key, p) });
    logSendSummary('Aplicar perfil', results);
    return { ok: true, results };
  } catch (e) {
    log.error('send', 'Aplicar perfil falló', e.message);
    return { ok: false, code: e.code || 'unknown', problems: e.problems, error: e.message };
  }
});
ipcMain.handle('device:reset', async (_e, key) => {
  try {
    const results = await devices.reset(key);
    logSendSummary('Restaurar fábrica', results);
    return { ok: true, results };
  } catch (e) {
    log.error('send', 'Restaurar fábrica falló', e.message);
    return { ok: false, code: e.code || 'unknown', problems: e.problems, error: e.message };
  }
});

devices.on('change', (list) => send('devices:change', list));
devices.on('status', (key, status) => send('device:status', key, status));

// Una sola instancia: abrirla otra vez muestra la ventana existente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(() => {
    app.setAppUserModelId('com.openshark.app');
    log.info('main', `── Open Shark ${app.getVersion()} ${app.isPackaged ? 'portable' : 'desarrollo'} · Electron ${process.versions.electron} · Windows ${os.release()} ${process.arch}`);
    store = new Store(app.getPath('userData'));
    nativeTheme.themeSource = store.prefs().theme;
    createTray();
    createWindow();
    devices.start();
  });
}

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => devices.stop());
app.on('window-all-closed', () => {
  if (quitting) app.quit();
});
