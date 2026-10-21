// Panneaux de l'interface déplaçables à la souris.
// Script classique (chargé par index.html dans l'ordre). Dépend de : aucune.
// =====================================================================
// Panneaux déplaçables (position mémorisée dans le navigateur)
// =====================================================================
let topZ = 10;
function makeDraggable(panel, key) {
  const handle = panel.querySelector('.panel-head');
  const storeKey = 'chess3d:panel:' + key;
  const place = (x, y) => {
    const r = panel.getBoundingClientRect();
    x = Math.min(Math.max(0, x), Math.max(0, innerWidth - r.width));
    y = Math.min(Math.max(0, y), Math.max(0, innerHeight - 48));
    Object.assign(panel.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
  };
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey));
    if (saved) place(saved.x, saved.y);
  } catch { /* stockage indisponible : position par défaut */ }

  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();
    const r = panel.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    panel.style.zIndex = ++topZ;
    panel.classList.add('dragging');
    handle.setPointerCapture(e.pointerId);
    const move = ev => place(ev.clientX - dx, ev.clientY - dy);
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      panel.classList.remove('dragging');
      const p = panel.getBoundingClientRect();
      try { localStorage.setItem(storeKey, JSON.stringify({ x: p.left, y: p.top })); } catch { }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  // Garder le panneau visible si la fenêtre rétrécit
  window.addEventListener('resize', () => {
    if (panel.style.left) { const r = panel.getBoundingClientRect(); place(r.left, r.top); }
  });
}
