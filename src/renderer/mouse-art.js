import { t } from './i18n.js';
// Foto superior del ratón y su escenario: resplandor de la iluminación detrás y, en la
// sección de botones, un punto sobre cada botón con una línea hasta su nombre y su función.
// Coordenadas de los puntos en píxeles de la foto (402 × 750).
const PHOTO = { src: 'assets/x6-top.png', w: 402, h: 750 };

// Lienzo del escenario (se escala para caber) y posición de la foto dentro de él.
export const CANVAS = { w: 720, h: 520, photoX: 230, photoY: 18, photoW: 260 };

// Por ranura del firmware: punto sobre la foto, lado de la etiqueta y altura de la etiqueta.
const CALLOUTS = {
  0: { pt: [104, 174], side: 'left', y: 130 },
  1: { pt: [301, 174], side: 'right', y: 130 },
  2: { pt: [202, 150], side: 'right', y: 52 },
  3: { pt: [202, 298], side: 'right', y: 208 },
  8: { pt: [202, 360], side: 'right', y: 286 },
  6: { pt: [14, 288], side: 'left', y: 222 },
  7: { pt: [14, 385], side: 'left', y: 314 },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Foto sola (pantalla de "conecta un ratón"). */
export function mouseArt() {
  return `<div class="mouse-art"><img src="${PHOTO.src}" alt="${t('mouse.alt')}" draggable="false"></div>`;
}

/**
 * Escenario central.
 * @param {object} o
 * @param {Array<{slot:number,name:string,fn:string}>} [o.buttons]  si se pasa, dibuja las llamadas
 * @param {number} [o.selected]  ranura resaltada
 */
export function mouseStage({ buttons = null, selected = null } = {}) {
  const k = CANVAS.photoW / PHOTO.w;
  let paths = '', marks = '';
  for (const b of buttons || []) {
    const c = CALLOUTS[b.slot];
    if (!c) continue;
    const on = b.slot === selected ? ' on' : '';
    const x = CANVAS.photoX + c.pt[0] * k, y = CANVAS.photoY + c.pt[1] * k;
    const lx = c.side === 'left' ? 175 : 545, ly = c.y + 16;
    const elbow = c.side === 'left' ? lx + 22 : lx - 22;
    paths += `<path class="${on.trim()}" d="M${x} ${y} L${elbow} ${ly} L${lx} ${ly}"/>`;
    marks += `<button type="button" class="hot${on}" data-slot="${b.slot}" style="left:${x}px;top:${y}px" aria-label="${esc(b.name)}: ${esc(b.fn)}"></button>
      <button type="button" class="callout ${c.side}${on}" data-slot="${b.slot}" tabindex="-1" aria-hidden="true"
        style="left:${c.side === 'left' ? lx - 172 : lx + 8}px;top:${c.y}px"><small>${esc(b.name)}</small><span>${esc(b.fn)}</span></button>`;
  }
  return `<div class="canvas" id="canvas">
    <div class="glow" id="glow"></div>
    <img class="mouse" src="${PHOTO.src}" alt="${t('mouse.alt')}" draggable="false"
      style="left:${CANVAS.photoX}px;top:${CANVAS.photoY}px;width:${CANVAS.photoW}px">
    <svg class="lines" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}" aria-hidden="true">${paths}</svg>
    ${marks}
  </div>`;
}
