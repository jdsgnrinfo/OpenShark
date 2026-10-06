// Desplegable con el estilo de la interfaz, en lugar de la lista nativa de Windows.
// Se monta sobre un <select> existente: el <select> queda oculto pero sigue guardando el valor
// y lanzando "change", así el código que lo usa no cambia.

const CHEV = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let closeOpen = null; // solo un desplegable abierto a la vez

export function enhanceSelect(sel) {
  if (sel.closest('.dd')) return;
  const wrap = document.createElement('div');
  wrap.className = 'dd';
  sel.after(wrap);
  wrap.append(sel);
  sel.hidden = true;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dd-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
  if (sel.id) btn.dataset.for = sel.id;

  const list = document.createElement('div');
  list.className = 'dd-list';
  list.setAttribute('role', 'listbox');
  const item = (o) => `<div class="dd-item" role="option" data-i="${o.index}" aria-selected="${o.selected}">${esc(o.text)}${CHECK}</div>`;
  list.innerHTML = [...sel.children].map((ch) => (ch.tagName === 'OPTGROUP'
    ? `<div class="dd-group" role="presentation">${esc(ch.label)}</div>${[...ch.children].map(item).join('')}`
    : item(ch))).join('');
  wrap.append(btn, list);

  const items = [...list.querySelectorAll('.dd-item')];
  let active = -1;
  const label = () => { btn.innerHTML = `<span>${esc(sel.selectedOptions[0]?.text ?? '')}</span>${CHEV}`; };
  const setActive = (k, scroll = true) => {
    active = Math.max(0, Math.min(items.length - 1, k));
    items.forEach((el, n) => el.classList.toggle('act', n === active));
    if (scroll) items[active]?.scrollIntoView({ block: 'nearest' });
  };
  // Posición fija para que no lo recorte el panel con desplazamiento; se abre hacia arriba si no cabe.
  const place = () => {
    const r = btn.getBoundingClientRect();
    const below = innerHeight - r.bottom - 12, above = r.top - 12;
    const up = below < 240 && above > below;
    list.classList.toggle('up', up);
    list.style.left = `${r.left}px`;
    list.style.width = `${r.width}px`;
    list.style.maxHeight = `${Math.min(340, up ? above : below)}px`;
    list.style.top = up ? '' : `${r.bottom + 6}px`;
    list.style.bottom = up ? `${innerHeight - r.top + 6}px` : '';
  };
  const onOutside = (e) => { if (!wrap.contains(e.target)) close(); };
  const onScroll = (e) => { if (e.target !== list) close(); };

  function open() {
    if (closeOpen && closeOpen !== close) closeOpen();
    closeOpen = close;
    wrap.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    place();
    setActive(items.findIndex((el) => Number(el.dataset.i) === sel.selectedIndex));
    document.addEventListener('pointerdown', onOutside, true);
    addEventListener('scroll', onScroll, true);
    addEventListener('resize', close);
  }
  function close() {
    if (!wrap.classList.contains('open')) return;
    wrap.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    removeEventListener('scroll', onScroll, true);
    removeEventListener('resize', close);
    if (closeOpen === close) closeOpen = null;
  }
  const choose = (k) => {
    const idx = Number(items[k].dataset.i);
    close();
    btn.focus();
    if (idx === sel.selectedIndex) return;
    sel.selectedIndex = idx;
    items.forEach((el) => el.setAttribute('aria-selected', String(Number(el.dataset.i) === idx)));
    label();
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  };

  btn.addEventListener('click', () => (wrap.classList.contains('open') ? close() : open()));
  list.addEventListener('click', (e) => { const it = e.target.closest('.dd-item'); if (it) choose(items.indexOf(it)); });
  list.addEventListener('pointermove', (e) => {
    const it = e.target.closest('.dd-item');
    if (it && items.indexOf(it) !== active) setActive(items.indexOf(it), false);
  });
  btn.addEventListener('keydown', (e) => {
    if (!wrap.classList.contains('open')) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
      return;
    }
    const moves = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: items.length - 1, PageDown: active + 6, PageUp: active - 6 };
    if (e.key in moves) { e.preventDefault(); setActive(moves[e.key]); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close();
    else if (e.key.length === 1) { // salta a la opción que empieza por esa letra
      const starts = (el) => el.textContent.trim().toLowerCase().startsWith(e.key.toLowerCase());
      const next = items.findIndex((el, n) => n > active && starts(el));
      const first = items.findIndex(starts);
      if (next >= 0 || first >= 0) setActive(next >= 0 ? next : first);
    }
  });
  label();
}

/** Convierte todos los <select> de `root` que aún no lo estén. */
export function enhanceAll(root) {
  root.querySelectorAll('select').forEach(enhanceSelect);
}
