import { hidFromCode, keyName, isModifierCode, modsFromEvent, comboName } from './keymap.js';
import { mouseArt, mouseStage, CANVAS } from './mouse-art.js';
import { enhanceAll } from './dropdown.js';
import { t, setLang, getLang, fmt, translateDom, LANGUAGES } from './i18n.js';

const api = window.shark;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = {
  catalog: null,
  devices: [],
  key: null,
  entry: null,
  profileIdx: 0,
  tab: 'perf',
  dirty: false,
  slot: 0,
  macroIdx: 0,
  applying: false,
  applied: null, // copia de lo último aplicado (o cargado), para "Descartar"
};
const prof = () => S.entry.profiles[S.profileIdx];
const device = () => S.devices.find((d) => d.key === S.key);
const activeStage = () => prof().dpi.stages[prof().dpi.active];

/* ——— Secciones ——— */
const ICONS = {
  perf: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
  buttons: '<rect x="6" y="3" width="12" height="18" rx="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v6M6 10h12" stroke="currentColor" stroke-width="1.8"/>',
  light: '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  power: '<path d="M13 2 5 13h6l-1 9 8-11h-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  macros: '<rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 10h2M11 10h2M15 10h2M8 14h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  // Engranaje (trazado de Lucide, licencia ISC)
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/>',
};
const SECTIONS = ['perf', 'buttons', 'light', 'power', 'macros']; // títulos en i18n: sec.<clave>
const icon = (k, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;

/* ——— Persistencia ——— */
let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  const key = S.key, entry = S.entry, idx = S.profileIdx;
  saveTimer = setTimeout(() => api.saveDevice(key, { nickname: entry.nickname, activeProfile: idx, profiles: entry.profiles }), 250);
}
function setDirty(v) {
  S.dirty = v;
  // Aplicar / Descartar solo se muestran mientras haya cambios pendientes.
  const foot = $('#drawer-foot');
  foot.classList.toggle('collapsed', !v);
  foot.inert = !v;
}
function changed() { setDirty(true); persist(); renderStageFoot(); }
const snapshot = () => { S.applied = structuredClone(prof()); };

/* ——— Avisos y diálogos ——— */
let toastTimer;
function toast(msg, error = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (error ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, error ? 6000 : 3000);
}

function ask({ title, text = '', input = null, ok = t('dialog.ok') }) {
  const dlg = $('#dialog');
  $('#dialog-title').textContent = title;
  $('#dialog-text').textContent = text;
  $('#dialog-text').hidden = !text;
  const field = $('#dialog-input');
  field.hidden = input === null;
  field.value = input ?? '';
  $('#dialog-ok').textContent = ok;
  // Sin esto, pulsar Intro activaba "Cancelar" (el primer botón del formulario)
  // y un Esc tras un "Aceptar" anterior se tomaba como aceptado.
  dlg.returnValue = '';
  $('#dialog-cancel').onclick = () => dlg.close('cancel');
  dlg.showModal();
  if (input !== null) field.select();
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => {
      if (dlg.returnValue !== 'ok') return resolve(null);
      resolve(input === null ? true : field.value.trim() || null);
    }, { once: true });
  });
}

/* ——— Componentes ——— */
const toggle = (id, checked) => `<label class="toggle"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span></span></label>`;
const pills = (name, options, current) => `<div class="pills" data-pills="${name}">${options.map(([v, label]) =>
  `<button type="button" class="pill" data-v="${v}" aria-pressed="${String(v) === String(current)}">${esc(label)}</button>`).join('')}</div>`;
function bindPills(root, name, onPick) {
  const g = $(`[data-pills="${name}"]`, root);
  g.addEventListener('click', (e) => {
    const b = e.target.closest('.pill');
    if (!b) return;
    $$('.pill', g).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onPick(b.dataset.v);
  });
}
const setFill = (range) => {
  const p = ((range.value - range.min) / (range.max - range.min)) * 100;
  range.style.setProperty('--p', `${p}%`);
};
const group = (title, body, first = false) => `<div class="group"${first ? ' style="margin-top:12px"' : ''}><h3>${esc(title)}</h3>${body}</div>`;

/* ——— Selector de ratones ——— */
/** Nombre de un botón físico del ratón en el idioma actual. */
const btnName = (b) => t(`btn.${b.id}`);

function renderDeviceSwitch() {
  const nav = $('#device-switch');
  nav.hidden = S.devices.length < 2;
  nav.innerHTML = S.devices.map((d) => {
    const nick = (d.key === S.key && S.entry) ? S.entry.nickname : (d.nickname || d.modelName);
    const b = d.status?.battery;
    const bolt = ['charging', 'charged'].includes(d.status?.state) ? '⚡' : '';
    return `<button class="device-chip" data-key="${esc(d.key)}" aria-current="${d.key === S.key}">
      <span>${esc(nick)}</span>${b != null ? `<span class="mini-batt">${bolt}${b}%</span>` : ''}</button>`;
  }).join('');
  $$('.device-chip', nav).forEach((b) => b.addEventListener('click', () => selectDevice(b.dataset.key)));
}

async function selectDevice(key) {
  if (S.key === key && S.entry) return;
  const d = S.devices.find((x) => x.key === key);
  if (!d) return;
  S.key = key;
  S.entry = await api.getDevice(key, d.modelName);
  d.nickname = S.entry.nickname;
  S.profileIdx = Math.min(S.entry.activeProfile || 0, S.entry.profiles.length - 1);
  S.slot = d.buttons[0].slot;
  S.macroIdx = 0;
  snapshot();
  $('#empty-state').hidden = true;
  $('#shell').hidden = false;
  setDirty(false);
  renderAll();
  if (S.entry.importedFromOem) {
    toast(t('toast.imported'));
    S.entry.importedFromOem = false;
    api.saveDevice(key, { importedFromOem: false });
  }
}

function showEmpty() {
  S.key = null; S.entry = null;
  $('#shell').hidden = true;
  $('#empty-state').hidden = false;
}

/* ——— Barra superior ——— */
const WIFI = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6.5a9 9 0 0 1 12 0M4.3 9a5.5 5.5 0 0 1 7.4 0M6.6 11.4a2 2 0 0 1 2.8 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const USB = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5v10M5.5 4 8 1.5 10.5 4M8 11.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM8 8.5 4.5 6.5V5M8 9.5l3.5-2V6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderTop() {
  $('#nickname').value = S.entry.nickname;
  const d = device();
  const st = d?.status || {};
  $('#status-text').textContent = t(`status.${st.state || 'online'}`);
  $('#status-dot').className = 'dot' + (st.state === 'sleeping' ? ' sleeping' : st.state === 'charging' ? ' charging' : '');
  $('#status-dot').title = $('#status-text').textContent;
  $('#top-chips').innerHTML = `
    <span class="chip">${d?.connection === 'wireless' ? `${WIFI}2.4 GHz` : `${USB}${t('conn.cable')}`}</span>
    ${batteryChip(st)}`;
}

/**
 * Pila de la barra superior. Al cargar, el relleno sube desde el nivel actual
 * hasta lleno en bucle y aparece un rayo; con la carga completa, el rayo queda fijo.
 * El firmware informa la batería en decenas (10–100 %).
 */
const BOLT = '<svg class="bolt" viewBox="0 0 6 9" aria-hidden="true"><path d="M3.9 0 0.4 5h2.2L2 9l3.6-5.2H3.4z"/></svg>';
function batteryChip(st) {
  const batt = st.battery;
  const charging = st.state === 'charging' || st.state === 'charged';
  const full = st.state === 'charged' || (charging && batt === 100);
  const tone = charging || batt == null ? '' : batt <= 10 ? 'low' : batt <= 30 ? 'mid' : '';
  const cls = ['batt', tone, charging ? 'charging' : '', full ? 'full' : ''].filter(Boolean).join(' ');
  const level = batt != null ? batt / 100 : 0;
  const label = batt != null ? `${batt}%` : '—';
  const note = full ? t('batt.full') : charging ? t('batt.charging') : '';
  const title = t('batt.title', { level: label }) + (note ? ` · ${note}` : '');
  return `<span class="chip${charging ? ' is-charging' : ''}" title="${title}" aria-label="${title}">
    <span class="${cls}" style="--lvl:${level}"><span class="cell"><i></i></span>${charging ? BOLT : ''}</span>${label}${note ? `<span class="batt-note">· ${note}</span>` : ''}</span>`;
}

/* ——— Escenario central ——— */
function lightColor() {
  const p = prof();
  if (DPI_COLOR_MODES.has(p.light.mode)) return activeStage()?.color || p.light.color;
  if (RAINBOW_MODES.includes(p.light.mode)) return '#ff3b5c';
  return p.light.color;
}
function glowClass() {
  const m = prof().light.mode;
  return [2, 6, 8].includes(m) ? 'breath' : RAINBOW_MODES.includes(m) ? 'rainbow' : '';
}
const glowSecs = () => (10 - prof().light.speed) * 0.45;

function fnLabel(b) {
  if (b.fn === S.catalog.fn.SHORTCUT && b.key) return comboName(b.mod, b.key);
  if (b.fn === S.catalog.fn.MACRO) return prof().macros.find((m) => m.id === b.macroId)?.name || 'Macro';
  return S.catalog.buttonFunctions.some((f) => f.id === b.fn) ? t(`fn.${b.fn}`) : '—';
}

function renderStage() {
  $('#sec-title').textContent = t(`sec.${S.tab}`);
  $('#sec-sub').textContent = t(`sec.${S.tab}.sub`);
  const withCallouts = S.tab === 'buttons';
  $('#stage-fit').innerHTML = mouseStage({
    buttons: withCallouts ? device().buttons.map((b) => ({ slot: b.slot, name: btnName(b), fn: fnLabel(prof().buttons[b.slot]) })) : null,
    selected: S.slot,
  });
  $('#canvas').classList.toggle('dim', withCallouts);
  refreshGlow();
  fitStage();
  renderStageFoot();
}
function refreshGlow() {
  const g = $('#glow');
  if (!g) return;
  const on = prof().light.mode !== 0;
  g.style.background = on ? lightColor() : 'transparent';
  g.className = 'glow ' + (on ? glowClass() : '');
  g.style.animationDuration = `${glowSecs()}s`;
}
// El lienzo es de tamaño fijo; se escala para caber en el escenario.
function fitStage() {
  const box = $('#stage-fit'), canvas = $('#canvas');
  if (!box || !canvas) return;
  const s = Math.min(1.12, (box.clientWidth - 24) / CANVAS.w, (box.clientHeight - 130) / CANVAS.h);
  canvas.style.setProperty('--s', Math.max(.4, s).toFixed(3));
}
function renderStageFoot() {
  const foot = $('#stage-foot');
  if (!foot || !S.entry) return;
  const p = prof();
  foot.innerHTML = `<span class="chip">${t('stage.sens')} <b>${fmt(activeStage()?.dpi || 0)} DPI</b></span>
    <span class="chip">${t('stage.polling')} <b>${S.catalog.pollingRates[p.pollingIndex]} Hz</b></span>`;
}

/* ——— Sensibilidad ——— */
const DPI_MIN = 50, DPI_MAX = 26000;
const posFromDpi = (dpi) => Math.round((Math.log(dpi / DPI_MIN) / Math.log(DPI_MAX / DPI_MIN)) * 1000);
const dpiFromPos = (pos) => {
  const raw = DPI_MIN * Math.pow(DPI_MAX / DPI_MIN, pos / 1000);
  const step = raw >= 10000 ? 500 : raw >= 2000 ? 100 : 50;
  return Math.min(DPI_MAX, Math.max(DPI_MIN, Math.round(raw / step) * step));
};

function renderPerf(panel) {
  const p = prof();
  panel.innerHTML = `
    <div class="big-dpi"><b id="dpi-big"></b><span>${t('perf.dpiLevel')} <span id="dpi-lvl"></span></span></div>
    <div class="dpi-board" id="dpi-board"></div>
    ${group(t('perf.polling'), `${pills('polling', S.catalog.pollingRates.map((r, i) => [i, r]), p.pollingIndex)}
      <p class="hint">${t('perf.pollingHint')}</p>`)}
    ${group(t('perf.lod'), pills('lod', [[0, t('perf.lodLow')], [1, t('perf.lodHigh')]], p.sensor.lod))}
    ${group(t('perf.sensor'), `
      <div class="row"><span class="label">${t('perf.motion')}<small>${t('perf.motionHint')}</small></span>${toggle('motion', p.sensor.motionSync)}</div>
      <div class="row"><span class="label">${t('perf.ripple')}<small>${t('perf.rippleHint')}</small></span>${toggle('ripple', p.sensor.ripple)}</div>
      <div class="row"><span class="label">${t('perf.snap')}<small>${t('perf.snapHint')}</small></span>${toggle('snap', p.sensor.angleSnap)}</div>
      <div class="row"><span class="label">${t('perf.debounce')}<small>${t('perf.debounceHint')}</small></span>
        <input type="range" class="range" id="debounce" min="0" max="15" value="${p.debounce}"><span class="value" id="debounce-v">${p.debounce * 2} ms</span></div>`)}`;
  renderDpiBoard();
  bindPills(panel, 'polling', (v) => { p.pollingIndex = Number(v); changed(); });
  bindPills(panel, 'lod', (v) => { p.sensor.lod = Number(v); changed(); });
  $('#motion').addEventListener('change', (e) => { p.sensor.motionSync = e.target.checked; changed(); });
  $('#ripple').addEventListener('change', (e) => { p.sensor.ripple = e.target.checked; changed(); });
  $('#snap').addEventListener('change', (e) => { p.sensor.angleSnap = e.target.checked; changed(); });
  const deb = $('#debounce');
  setFill(deb);
  deb.addEventListener('input', () => { p.debounce = Number(deb.value); $('#debounce-v').textContent = `${p.debounce * 2} ms`; setFill(deb); changed(); });
}

function showActiveDpi() {
  const p = prof();
  const enabled = p.dpi.stages.filter((s) => s.enabled);
  if (!$('#dpi-big')) return;
  $('#dpi-big').textContent = fmt(activeStage().dpi);
  $('#dpi-lvl').textContent = enabled.indexOf(activeStage()) + 1;
}

function renderDpiBoard() {
  const p = prof();
  const enabled = p.dpi.stages.map((s, i) => ({ s, i })).filter((x) => x.s.enabled);
  // Un deslizador vertical por nivel, con su valor exacto y su color debajo.
  $('#dpi-board').innerHTML = `
    <div class="dpi-axis" aria-hidden="true"><span>26 000</span><span>50</span></div>
    ${enabled.map(({ s, i }, n) => `
      <div class="dpi-col" data-stage="${i}" aria-current="${i === p.dpi.active}">
        <span class="dpi-n">${n + 1}</span>
        <div class="vslider" role="slider" tabindex="0" aria-label="${t('dpi.levelAria', { n: n + 1 })}" aria-valuemin="${DPI_MIN}"
          aria-valuemax="${DPI_MAX}" aria-valuenow="${s.dpi}" style="--t:${posFromDpi(s.dpi) / 1000}"><i></i><b></b></div>
        <input type="number" class="dpi-num" min="${DPI_MIN}" max="${DPI_MAX}" step="50" value="${s.dpi}" aria-label="${t('dpi.valueAria', { n: n + 1 })}">
        <input type="color" class="dpi-color" value="${esc(s.color)}" aria-label="${t('dpi.colorAria', { n: n + 1 })}">
      </div>`).join('')}`;
  showActiveDpi();

  const select = (col) => {
    const i = Number(col.dataset.stage);
    if (p.dpi.active === i) return;
    p.dpi.active = i;
    $$('.dpi-col[data-stage]').forEach((c) => c.setAttribute('aria-current', String(c === col)));
    showActiveDpi();
    changed(); refreshGlow();
  };
  const clamp = (v) => Math.min(DPI_MAX, Math.max(DPI_MIN, v));
  $$('.dpi-col[data-stage]').forEach((col) => {
    const st = p.dpi.stages[Number(col.dataset.stage)];
    const vs = $('.vslider', col), num = $('.dpi-num', col);
    const set = (dpi) => {
      if (dpi === st.dpi) return;
      st.dpi = dpi;
      vs.style.setProperty('--t', posFromDpi(dpi) / 1000);
      vs.setAttribute('aria-valuenow', dpi);
      num.value = dpi;
      if (activeStage() === st) showActiveDpi();
      changed();
    };
    const fromY = (e) => {
      const r = vs.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, 1 - (e.clientY - r.top - 9) / (r.height - 18)));
      return dpiFromPos(Math.round(t * 1000));
    };
    col.addEventListener('pointerdown', () => select(col));
    col.addEventListener('focusin', () => select(col));
    vs.addEventListener('pointerdown', (e) => { vs.setPointerCapture(e.pointerId); set(fromY(e)); });
    vs.addEventListener('pointermove', (e) => { if (vs.hasPointerCapture(e.pointerId)) set(fromY(e)); });
    vs.addEventListener('keydown', (e) => {
      const step = st.dpi >= 10000 ? 500 : st.dpi >= 2000 ? 100 : 50;
      const next = { ArrowUp: st.dpi + step, ArrowRight: st.dpi + step, ArrowDown: st.dpi - step, ArrowLeft: st.dpi - step,
        PageUp: st.dpi * 2, PageDown: st.dpi / 2, Home: DPI_MIN, End: DPI_MAX }[e.key];
      if (next == null) return;
      e.preventDefault();
      set(clamp(Math.round(next / 50) * 50));
    });
    num.addEventListener('change', () => { set(clamp(Math.round(Number(num.value) / 50) * 50 || DPI_MIN)); num.value = st.dpi; });
    $('.dpi-color', col).addEventListener('input', (e) => { st.color = e.target.value; changed(); refreshGlow(); });
  });
}

/* ——— Asignaciones ——— */
function pickSlot(slot) {
  S.slot = slot;
  renderButtons($('#panel'));
  renderStage();
}

function renderButtons(panel) {
  const d = device();
  const p = prof();
  if (!d.buttons.some((x) => x.slot === S.slot)) S.slot = d.buttons[0].slot;
  const cur = d.buttons.find((x) => x.slot === S.slot);
  const b = p.buttons[S.slot];
  $('#drawer-kicker').textContent = t('kicker.assign');
  $('#drawer-title').textContent = btnName(cur);

  const groups = [...new Set(S.catalog.buttonFunctions.map((f) => f.group))];
  const fnOptions = groups.map((g) => `<optgroup label="${esc(t(`group.${g}`))}">${S.catalog.buttonFunctions.filter((f) => f.group === g)
    .map((f) => `<option value="${f.id}" ${f.id === b.fn ? 'selected' : ''}>${esc(t(`fn.${f.id}`))}</option>`).join('')}</optgroup>`).join('');
  // Control adicional: tecla capturada para "Combinación" o macro elegida.
  let extra = '';
  if (b.fn === S.catalog.fn.SHORTCUT) {
    extra = `<button class="capture" id="capture">${b.key ? esc(comboName(b.mod, b.key)) : t('btns.capture')}</button>`;
  } else if (b.fn === S.catalog.fn.MACRO) {
    extra = p.macros.length
      ? `<select id="macro-pick" aria-label="Macro"><option value="">${t('btns.pickMacro')}</option>${p.macros.map((m) =>
          `<option value="${esc(m.id)}" ${m.id === b.macroId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`
      : `<p class="hint">${t('btns.noMacros')}</p>`;
  }

  panel.innerHTML = `
    ${group(t('btns.function'), `<select id="fn" aria-label="${esc(t('btns.functionAria', { name: btnName(cur) }))}">${fnOptions}</select>${extra ? `<div class="extra">${extra}</div>` : ''}`, true)}
    ${group(t('btns.all'), `<div class="btn-list">${d.buttons.map((x) => `
      <button class="btn-item" data-slot="${x.slot}" aria-current="${x.slot === S.slot}"><span>${esc(btnName(x))}</span><span class="fn">${esc(fnLabel(p.buttons[x.slot]))}</span></button>`).join('')}</div>`)}`;

  $('#fn').addEventListener('change', (e) => {
    const fn = Number(e.target.value);
    const othersLeft = p.buttons.some((x, k) => k !== S.slot && x.fn === S.catalog.fn.LEFT);
    if (b.fn === S.catalog.fn.LEFT && fn !== S.catalog.fn.LEFT && !othersLeft) {
      toast(t('btns.keepLeft'), true);
      return renderButtons(panel);
    }
    b.fn = fn;
    if (fn !== S.catalog.fn.MACRO) b.macroId = null;
    changed();
    renderButtons(panel);
    renderStage();
    $('.dd-btn', panel)?.focus();
  });
  $('#macro-pick')?.addEventListener('change', (e) => { b.macroId = e.target.value || null; changed(); renderButtons(panel); renderStage(); });
  $$('.btn-item', panel).forEach((x) => x.addEventListener('click', () => pickSlot(Number(x.dataset.slot))));

  const cap = $('#capture');
  if (cap) {
    const onKey = (e) => {
      e.preventDefault(); e.stopPropagation();
      const mods = modsFromEvent(e);
      if (isModifierCode(e.code)) { cap.textContent = comboName(mods, 0) + ' + …'; return; }
      const hid = hidFromCode(e.code);
      if (!hid) { cap.textContent = t('btns.unsupported'); return; }
      b.mod = mods; b.key = hid;
      stop(); changed();
      renderButtons(panel); renderStage();
    };
    const stop = () => { cap.classList.remove('listening'); window.removeEventListener('keydown', onKey, true); };
    cap.addEventListener('click', () => {
      cap.classList.add('listening');
      cap.textContent = t('btns.listening');
      window.addEventListener('keydown', onKey, true);
    });
    cap.addEventListener('blur', stop);
  }
  enhanceAll(panel);
}

/* ——— Iluminación ——— */
const STATIC_MODES = new Set([1, 9]);
const DPI_COLOR_MODES = new Set([5, 6]); // toman el color del nivel de DPI activo
const RAINBOW_MODES = [3, 4, 7, 10, 11];
// Orden de los efectos: las variantes "color del nivel de DPI" junto a su efecto base.
const LIGHT_ORDER = [0, 1, 2, 5, 6, 3, 4, 7, 8, 9, 10, 11];
const S16 = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const LIGHT_ICONS = {
  0: `<circle cx="12" cy="12" r="7" ${S16} stroke-dasharray="2 3"/>`,
  1: '<circle cx="12" cy="12" r="7" fill="currentColor"/>',
  2: `<circle cx="12" cy="12" r="7" ${S16}/><circle cx="12" cy="12" r="3" fill="currentColor"/>`,
  5: `<rect x="5" y="5" width="14" height="14" rx="3" ${S16}/><circle cx="12" cy="12" r="3" fill="currentColor"/>`,
  6: `<rect x="5" y="5" width="14" height="14" rx="3" ${S16}/><circle cx="12" cy="12" r="3.5" ${S16}/>`,
  3: `<path d="M3 12h4l2-5 4 10 2-5h6" ${S16}/>`,
  4: `<circle cx="9" cy="12" r="5" ${S16}/><circle cx="15" cy="12" r="5" ${S16}/>`,
  7: `<path d="M3 15c3-6 6-6 9 0s6 6 9 0" ${S16}/>`,
  8: `<path d="M13 3 6 13h5l-1 8 7-10h-5z" ${S16}/>`,
  9: '<path d="M12 5a7 7 0 0 0 0 14z" fill="currentColor"/><path d="M12 5a7 7 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  10: '<circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor" opacity=".55"/><circle cx="19" cy="12" r="2" fill="currentColor" opacity=".25"/>',
  11: '<circle cx="5" cy="12" r="2" fill="currentColor" opacity=".25"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor" opacity=".25"/>',
};
const PALETTE = ['#ff2d2d', '#ff8a1f', '#ffe12b', '#22e04a', '#22e6ff', '#2f6bff', '#7c5cff', '#ff2bf1'];

function renderLight(panel) {
  const L = prof().light;
  const usesColor = L.mode !== 0 && !DPI_COLOR_MODES.has(L.mode) && !RAINBOW_MODES.includes(L.mode);
  const inPalette = PALETTE.includes(L.color.toLowerCase());
  panel.innerHTML = `
    ${group(t('light.effect'), `<div class="effects">${LIGHT_ORDER.map((i) => `
      <button data-mode="${i}" aria-pressed="${i === L.mode}"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">${LIGHT_ICONS[i]}</svg>${t(`mode.${i}`)}</button>`).join('')}</div>`, true)}
    ${usesColor ? group(t('light.color'), `<div class="swatches">${PALETTE.map((c) =>
      `<button data-color="${c}" style="background:${c}" aria-pressed="${c === L.color.toLowerCase()}" aria-label="${t('light.colorAria', { c })}"></button>`).join('')}
      <label class="${inPalette ? '' : 'on'}" title="${t('light.other')}"><input type="color" id="lcolor" value="${esc(L.color)}" aria-label="${t('light.other')}">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></label></div>`) : ''}
    ${L.mode !== 0 ? group(t('light.settings'), `
      <div class="row"><span class="label">${t('light.brightness')}<small>${t('light.brightnessHint')}</small></span>
        <input type="range" class="range" id="bright" min="0" max="8" value="${L.brightness}" ${STATIC_MODES.has(L.mode) ? '' : 'disabled'}><span class="value" id="bright-v">${L.brightness}/8</span></div>
      <div class="row"><span class="label">${t('light.speed')}</span>
        <input type="range" class="range" id="speed" min="1" max="8" value="${L.speed}"><span class="value" id="speed-v">${L.speed}/8</span></div>`) : ''}`;

  $$('[data-mode]', panel).forEach((b) => b.addEventListener('click', () => { L.mode = Number(b.dataset.mode); changed(); renderLight(panel); refreshGlow(); }));
  $$('[data-color]', panel).forEach((b) => b.addEventListener('click', () => { L.color = b.dataset.color; changed(); renderLight(panel); refreshGlow(); }));
  const lc = $('#lcolor');
  lc?.addEventListener('input', () => { L.color = lc.value; changed(); refreshGlow(); });
  lc?.addEventListener('change', () => renderLight(panel));
  const bright = $('#bright'), speed = $('#speed');
  if (bright) {
    setFill(bright); setFill(speed);
    bright.addEventListener('input', () => { L.brightness = Number(bright.value); $('#bright-v').textContent = `${L.brightness}/8`; setFill(bright); changed(); refreshGlow(); });
    speed.addEventListener('input', () => { L.speed = Number(speed.value); $('#speed-v').textContent = `${L.speed}/8`; setFill(speed); changed(); refreshGlow(); });
  }
}

/* ——— Energía ——— */
function renderPower(panel) {
  const P = prof().power;
  panel.innerHTML = `
    ${group(t('power.saving'), `
      <div class="row"><span class="label">${t('power.lightOff')}<small>${t('power.lightOffHint')}</small></span>
        <input type="range" class="range" id="sleep" min="1" max="15" value="${P.sleep}"><span class="value" id="sleep-v">${P.sleep} min</span></div>
      <div class="row"><span class="label">${t('power.deep')}<small>${t('power.deepHint')}</small></span>
        <input type="range" class="range" id="deep" min="1" max="15" value="${P.deepSleep}"><span class="value" id="deep-v">${P.deepSleep} min</span></div>
      <p class="hint">${t('power.wirelessHint')}</p>`, true)}
    ${group(t('power.maint'), `
      <div class="row"><span class="label">${t('power.factory')}<small>${t('power.factoryHint')}</small></span>
        <button class="btn ghost small" id="factory">${t('power.restore')}</button></div>`)}`;
  for (const [id, field] of [['sleep', 'sleep'], ['deep', 'deepSleep']]) {
    const r = $('#' + id);
    setFill(r);
    r.addEventListener('input', () => { P[field] = Number(r.value); $(`#${id}-v`).textContent = `${r.value} min`; setFill(r); changed(); });
  }
  $('#factory').addEventListener('click', factoryReset);
}

async function factoryReset() {
  const ok = await ask({ title: t('power.factoryTitle'), text: t('power.factoryText'), ok: t('power.restore') });
  if (!ok) return;
  const r = await api.reset(S.key);
  if (!r.ok) return toast(errorText(r), true);
  S.entry.profiles[S.profileIdx] = await api.defaultProfile(prof().name);
  persist(); renderAll();
  await applyProfile();
}

/* ——— Macros ——— */
const MACRO_MODES = [1, 2, 3]; // repetir N veces, hasta pulsar otra tecla, mientras se mantiene pulsado
let recorder = null;
function stopRecording() {
  if (!recorder) return;
  window.removeEventListener('keydown', recorder, true);
  window.removeEventListener('keyup', recorder, true);
  recorder = null;
}

function renderMacros(panel) {
  stopRecording();
  const p = prof();
  p.macros ||= [];
  S.macroIdx = Math.min(S.macroIdx, Math.max(0, p.macros.length - 1));
  const m = p.macros[S.macroIdx];
  const max = S.catalog.macroEventsMax;
  panel.innerHTML = `
    ${group(t('macros.yours'), `<div class="btn-list">${p.macros.map((x, i) => `<button class="btn-item" data-mi="${i}" aria-current="${i === S.macroIdx}">
      <span>${esc(x.name)}</span><span class="fn">${t('macros.steps', { n: x.events.length })}</span></button>`).join('') || `<p class="empty-note">${t('macros.none')}</p>`}</div>
      <div class="toolbar"><button class="btn ghost small" id="macro-new">${t('macros.new')}</button></div>`, true)}
    ${m ? group(t('macros.editor'), `
      <div class="row"><span class="label">${t('macros.name')}</span><input type="text" id="m-name" value="${esc(m.name)}" maxlength="24" style="width:200px"></div>
      <div class="row"><span class="label">${t('macros.playback')}</span><span style="display:flex;gap:8px;width:220px">
        <select id="m-mode" aria-label="${t('macros.playback')}">${MACRO_MODES.map((v) => `<option value="${v}" ${v === m.mode ? 'selected' : ''}>${t(`macros.mode${v}`)}</option>`).join('')}</select>
        <input type="number" id="m-loops" min="1" max="255" value="${m.loops}" ${m.mode === 1 ? '' : 'hidden'} aria-label="${t('macros.loops')}" style="width:64px;flex:none"></span></div>
      <div class="toolbar">
        <button class="btn primary small" id="m-rec">${t('macros.record')}</button>
        <button class="btn ghost small" id="m-clear">${t('macros.clear')}</button>
        <span id="m-status" class="muted"></span>
        <button class="link" id="m-del">${t('macros.delete')}</button>
      </div>
      <p class="hint" id="m-count">${t('macros.count', { n: m.events.length, max })}</p>
      ${m.events.length ? `<table class="events"><thead><tr><th>${t('macros.key')}</th><th>${t('macros.action')}</th><th>${t('macros.wait')}</th><th></th></tr></thead><tbody>
        ${m.events.map((ev, i) => `<tr><td><span class="kbd">${esc(keyName(ev.key))}</span></td><td>${ev.down ? t('macros.press') : t('macros.release')}</td>
          <td><input type="number" min="0" max="65535" value="${ev.delay}" data-delay="${i}" aria-label="${t('macros.waitAria')}"></td>
          <td><button class="link" data-del="${i}" aria-label="${t('macros.removeStep')}">✕</button></td></tr>`).join('')}
      </tbody></table>` : `<p class="empty-note">${t('macros.recordHint')}</p>`}`) : ''}`;

  $('#macro-new').addEventListener('click', () => {
    p.macros.push({ id: 'm' + Date.now().toString(36), name: t('macros.defaultName', { n: p.macros.length + 1 }), mode: 1, loops: 1, events: [] });
    S.macroIdx = p.macros.length - 1;
    changed(); renderMacros(panel);
  });
  $$('[data-mi]', panel).forEach((b) => b.addEventListener('click', () => { S.macroIdx = Number(b.dataset.mi); renderMacros(panel); }));
  if (!m) return;
  $('#m-name').addEventListener('input', (e) => { m.name = e.target.value || 'Macro'; changed(); });
  $('#m-mode').addEventListener('change', (e) => { m.mode = Number(e.target.value); $('#m-loops').hidden = m.mode !== 1; changed(); });
  $('#m-loops').addEventListener('change', (e) => { m.loops = Math.min(255, Math.max(1, Number(e.target.value) || 1)); changed(); });
  $('#m-clear').addEventListener('click', () => { m.events = []; changed(); renderMacros(panel); });
  $('#m-del').addEventListener('click', async () => {
    if (!(await ask({ title: t('macros.deleteTitle'), text: t('macros.deleteText', { name: m.name }), ok: t('macros.deleteOk') }))) return;
    p.buttons.forEach((b) => { if (b.macroId === m.id) { b.fn = 0; b.macroId = null; } });
    p.macros.splice(S.macroIdx, 1);
    changed(); renderMacros(panel);
  });
  $$('[data-delay]', panel).forEach((inp) => inp.addEventListener('change', () => {
    m.events[Number(inp.dataset.delay)].delay = Math.min(65535, Math.max(0, Number(inp.value) || 0)); changed();
  }));
  $$('[data-del]', panel).forEach((b) => b.addEventListener('click', () => { m.events.splice(Number(b.dataset.del), 1); changed(); renderMacros(panel); }));
  $('#m-rec').addEventListener('click', (e) => {
    if (recorder) { stopRecording(); renderMacros(panel); return; }
    let last = performance.now();
    recorder = (ev) => {
      if (ev.repeat) return;
      ev.preventDefault(); ev.stopPropagation();
      const key = hidFromCode(ev.code);
      if (!key) return;
      if (m.events.length >= max) { stopRecording(); renderMacros(panel); return toast(t('macros.full'), true); }
      const now = performance.now();
      m.events.push({ key, down: ev.type === 'keydown', delay: m.events.length ? Math.round(now - last) : 10 });
      last = now;
      changed();
      $('#m-count').textContent = t('macros.count', { n: m.events.length, max });
    };
    window.addEventListener('keydown', recorder, true);
    window.addEventListener('keyup', recorder, true);
    e.target.textContent = t('macros.stop');
    e.target.blur();
    const status = $('#m-status');
    status.textContent = t('macros.recording');
    status.classList.add('recording');
  });
  enhanceAll(panel);
}

/* ——— Render general ——— */
function renderRail() {
  $('#rail').innerHTML = SECTIONS.map((k) =>
    `<button role="tab" data-tab="${k}" aria-selected="${k === S.tab}" aria-label="${t(`sec.${k}`)}">${icon(k)}<span class="tip">${t(`sec.${k}`)}</span></button>`).join('')
    + `<button class="gear" id="open-settings" aria-label="${t('rail.settingsAria')}">${icon('gear')}<span class="tip">${t('rail.settings')}</span></button>`;
}
function renderPanel() {
  stopRecording();
  $$('#rail [role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === S.tab)));
  $('#drawer-kicker').textContent = t('kicker.settings');
  $('#drawer-title').textContent = t(`sec.${S.tab}`);
  const panel = $('#panel');
  ({ perf: renderPerf, buttons: renderButtons, light: renderLight, power: renderPower, macros: renderMacros })[S.tab](panel);
  panel.scrollTop = 0;
  renderStage();
}
function renderAll() {
  renderDeviceSwitch();
  renderTop();
  renderPanel();
}

/* ——— Aplicar y descartar ——— */
/** Mensaje de un error devuelto por el proceso principal ({ code, problems, error }). */
function errorText(r) {
  if (r.code === 'invalidProfile' && r.problems?.length) return r.problems.map((p) => t(`err.${p}`)).join(' ');
  const key = `err.${r.code}`;
  return t(key) !== key ? t(key) : t('err.unknown', { detail: r.error || r.code });
}
/** Nombre de un paquete enviado ("DPI y sensor", "Macro del botón 3 (1/3)"…). */
const packetName = (x) => (x.key ? t(`pkt.${x.key}`, x.params) : x.label);

async function applyProfile() {
  if (S.applying) return;
  S.applying = true;
  const btn = $('#apply');
  btn.disabled = true;
  btn.textContent = t('foot.sending');
  const r = await api.apply(S.key, prof());
  S.applying = false;
  btn.disabled = false;
  btn.textContent = t('foot.apply');
  if (!r.ok) return toast(errorText(r), true);
  const failed = r.results.filter((x) => !x.ok).map(packetName);
  const unconfirmed = r.results.filter((x) => x.ok && x.acked === null).map(packetName);
  if (failed.length) return toast(t('apply.failed', { list: failed.join(', ') }), true);
  setDirty(false);
  snapshot();
  S.entry.activeProfile = S.profileIdx;
  persist();
  if (unconfirmed.length) toast(t('apply.unconfirmed', { list: unconfirmed.join(', ') }), true);
  else toast(t('apply.ok'));
}

function discardChanges() {
  if (!S.dirty || !S.applied) return;
  S.entry.profiles[S.profileIdx] = structuredClone(S.applied);
  setDirty(false);
  persist();
  renderAll();
  toast(t('apply.discarded'));
}

/* ——— Configuración del programa ——— */
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
// El proceso principal fija el tema (claro, oscuro o el de Windows) y aquí llega como prefers-color-scheme.
const applyTheme = () => { document.documentElement.dataset.theme = darkQuery.matches ? 'dark' : 'light'; };
let prefs = { theme: 'dark', tray: true, login: false };
function renderPrefs() {
  $$('[data-theme-opt]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeOpt === prefs.theme)));
  for (const [id, on] of [['#opt-tray', prefs.tray], ['#opt-login', prefs.login]]) {
    $(id).classList.toggle('on', on);
    $(id).setAttribute('aria-checked', String(on));
  }
  $('#lang-pick').innerHTML = LANGUAGES.map(([code, name]) =>
    `<button type="button" role="radio" data-lang="${code}" lang="${code}" aria-checked="${code === getLang()}">${name}</button>`).join('');
  if (prefs.version) $('#app-version').textContent = `Open Shark ${prefs.version}`;
}
/** Cambia el idioma de toda la interfaz sin recargar (se conservan los cambios sin aplicar). */
function applyLanguage(lang) {
  setLang(lang);
  translateDom();
  $('#empty-mouse').innerHTML = mouseArt();
  renderRail();
  if (S.entry) renderAll();
  renderPrefs();
}
async function setPrefs(patch) {
  prefs = await api.setPrefs(patch);
  renderPrefs();
}
function bindSettings() {
  const dlg = $('#settings');
  $('#theme-pick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-opt]');
    if (b) setPrefs({ theme: b.dataset.themeOpt });
  });
  $('#lang-pick').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-lang]');
    if (!b || b.dataset.lang === getLang()) return;
    prefs = await api.setPrefs({ lang: b.dataset.lang });
    applyLanguage(prefs.lang);
  });
  $('#opt-tray').addEventListener('click', () => setPrefs({ tray: !prefs.tray }));
  $('#opt-login').addEventListener('click', () => setPrefs({ login: !prefs.login }));
  $('#open-logs').addEventListener('click', () => api.openLogs());
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  darkQuery.addEventListener('change', applyTheme);
}

/* ——— Eventos globales ——— */
function bindChrome() {
  renderRail();
  $('#rail').addEventListener('click', (e) => {
    if (e.target.closest('#open-settings')) { renderPrefs(); $('#settings').showModal(); return; }
    const t = e.target.closest('[data-tab]');
    if (!t || !S.entry) return;
    S.tab = t.dataset.tab;
    renderPanel();
  });
  $('#stage-fit').addEventListener('click', (e) => {
    const t = e.target.closest('[data-slot]');
    if (t) pickSlot(Number(t.dataset.slot));
  });
  new ResizeObserver(fitStage).observe($('#stage-fit'));
  $('#apply').addEventListener('click', applyProfile);
  $('#discard').addEventListener('click', discardChanges);
  $('#nickname').addEventListener('change', (e) => {
    S.entry.nickname = e.target.value.trim() || device().modelName;
    e.target.value = S.entry.nickname;
    device().nickname = S.entry.nickname;
    persist(); renderDeviceSwitch();
  });
  bindSettings();

  api.onDevicesChange((list) => {
    const prev = new Map(S.devices.map((d) => [d.key, d]));
    S.devices = list.map((d) => ({ ...d, nickname: prev.get(d.key)?.nickname, status: prev.get(d.key)?.status || d.status }));
    if (S.key && !S.devices.some((d) => d.key === S.key)) {
      toast(t('toast.disconnected'), true);
      showEmpty();
    }
    if (S.key) renderDeviceSwitch();
    if (!S.key && S.devices.length) selectDevice(S.devices[0].key);
  });
  api.onStatus((key, status) => {
    const d = S.devices.find((x) => x.key === key);
    if (!d) return;
    d.status = status;
    renderDeviceSwitch();
    if (key !== S.key) return;
    renderTop();
    // El botón DPI del ratón cambia de nivel: lo reflejamos sin marcar cambios.
    if (status.dpiStage != null && prof().dpi.stages[status.dpiStage]?.enabled && prof().dpi.active !== status.dpiStage) {
      prof().dpi.active = status.dpiStage;
      if (S.applied) S.applied.dpi.active = status.dpiStage;
      persist();
      refreshGlow();
      renderStageFoot();
      if (S.tab === 'perf') renderDpiBoard();
    }
  });
}

async function init() {
  applyTheme();
  S.catalog = await api.catalog();
  prefs = await api.getPrefs();
  setLang(prefs.lang);
  translateDom();
  $('#empty-mouse').innerHTML = mouseArt();
  const tab = new URLSearchParams(location.search).get('tab');
  if (SECTIONS.includes(tab)) S.tab = tab;
  bindChrome();
  S.devices = await api.listDevices();
  if (S.devices.length) selectDevice(S.devices[0].key);
}

init();
