// Session 1 VFX helpers — Shadowverse-style polish on top of DOM/Pixi.
// All functions are no-op safe: callers don't need to check for support.
//
// Public API:
//   getOrCreateAttackArrow()    — singleton SVG element, returns the root
//   showAttackArrow(fromEl, optionalToEl)  — start tracking; from = source
//                                             card element, to = optional fixed
//                                             target (otherwise follows mouse)
//   hideAttackArrow()           — hide + detach mouse listener
//   showEffectToast(text, atEl, tone='neutral') — float small text bubble
//                                                  near `atEl` (1.6s lifecycle)
//
// Tones: 'neutral' (default) | 'damage' | 'heal' | 'buff'

let _arrowEl = null;
let _arrowFromEl = null;
let _arrowToEl = null;
let _arrowMouseHandler = null;

export function getOrCreateAttackArrow() {
  if (_arrowEl && document.body.contains(_arrowEl)) return _arrowEl;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.id = 'vfx-attack-arrow';
  svg.setAttribute('xmlns', NS);
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');

  // Gradient defs
  const defs = document.createElementNS(NS, 'defs');
  const grad = document.createElementNS(NS, 'linearGradient');
  grad.id = 'vfx-arrow-grad';
  grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%');
  grad.setAttribute('x2', '100%'); grad.setAttribute('y2', '0%');
  for (const [off, color] of [['0%', '#ffd166'], ['50%', '#ff7a45'], ['100%', '#e8412f']]) {
    const stop = document.createElementNS(NS, 'stop');
    stop.setAttribute('offset', off);
    stop.setAttribute('stop-color', color);
    grad.appendChild(stop);
  }
  defs.appendChild(grad);
  svg.appendChild(defs);

  // Path + arrow head
  const path = document.createElementNS(NS, 'path');
  path.classList.add('vfx-arrow-path');
  svg.appendChild(path);

  const head = document.createElementNS(NS, 'polygon');
  head.classList.add('vfx-arrow-head');
  svg.appendChild(head);

  document.body.appendChild(svg);
  _arrowEl = svg;
  // Sync viewBox to window size on resize so coords map to pixels 1:1
  const syncViewBox = () => {
    svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
  };
  syncViewBox();
  window.addEventListener('resize', syncViewBox);
  return svg;
}

function _centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function _renderArrow(from, to) {
  const svg = getOrCreateAttackArrow();
  const path = svg.querySelector('.vfx-arrow-path');
  const head = svg.querySelector('.vfx-arrow-head');

  // Cubic bezier: lift the curve so it arcs over the table
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const lift = Math.min(120, Math.max(40, dist * 0.25));
  const c1 = { x: from.x + dx * 0.25, y: from.y - lift };
  const c2 = { x: from.x + dx * 0.75, y: to.y - lift };
  const d = `M ${from.x},${from.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${to.x},${to.y}`;
  path.setAttribute('d', d);

  // Arrow head: small triangle pointing in the direction of (to - c2)
  const tdx = to.x - c2.x;
  const tdy = to.y - c2.y;
  const tlen = Math.hypot(tdx, tdy) || 1;
  const ux = tdx / tlen, uy = tdy / tlen;
  const px = -uy, py = ux;  // perpendicular
  const size = 14;
  const tip = `${to.x},${to.y}`;
  const baseL = `${to.x - ux * size + px * size * 0.6},${to.y - uy * size + py * size * 0.6}`;
  const baseR = `${to.x - ux * size - px * size * 0.6},${to.y - uy * size - py * size * 0.6}`;
  head.setAttribute('points', `${tip} ${baseL} ${baseR}`);
}

export function showAttackArrow(fromEl, toEl = null) {
  if (!fromEl) return;
  const svg = getOrCreateAttackArrow();
  _arrowFromEl = fromEl;
  _arrowToEl = toEl;
  svg.classList.add('visible');

  if (toEl) {
    // Fixed-target mode: render once
    _renderArrow(_centerOf(fromEl), _centerOf(toEl));
  } else {
    // Follow-cursor mode: bind a mousemove listener that re-draws
    _arrowMouseHandler = (e) => {
      if (!_arrowFromEl || !document.body.contains(_arrowFromEl)) {
        hideAttackArrow();
        return;
      }
      _renderArrow(_centerOf(_arrowFromEl), { x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', _arrowMouseHandler);
    // Initial draw at center if no mouse event yet
    const r = fromEl.getBoundingClientRect();
    _renderArrow(_centerOf(fromEl), { x: r.left + r.width / 2, y: r.top - 80 });
  }
}

export function hideAttackArrow() {
  if (_arrowEl) _arrowEl.classList.remove('visible');
  if (_arrowMouseHandler) {
    window.removeEventListener('mousemove', _arrowMouseHandler);
    _arrowMouseHandler = null;
  }
  _arrowFromEl = null;
  _arrowToEl = null;
}

/**
 * Float a small text bubble near `atEl` (or at a fixed position) for ~1.6s.
 * Used for handler results: damage, heal, buff, "搜尋" etc.
 *
 * @param {string} text       Text content
 * @param {Element|object} at Element OR { x, y } client coords
 * @param {string} tone       'neutral' | 'damage' | 'heal' | 'buff'
 */
export function showEffectToast(text, at, tone = 'neutral') {
  if (!text) return;
  const el = document.createElement('div');
  el.className = 'vfx-effect-toast';
  if (tone && tone !== 'neutral') el.classList.add(`tone-${tone}`);
  el.textContent = text;
  let x = window.innerWidth / 2, y = window.innerHeight / 2;
  if (at instanceof Element) {
    const r = at.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top - 4;
  } else if (at && typeof at.x === 'number') {
    x = at.x; y = at.y;
  }
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  // Auto-cleanup after animation
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1700);
  return el;
}

/**
 * Convenience: pick a tone from a log/effect string by keyword.
 * Examples: "對 X 造成 30 傷害" → damage; "HP 回 20" → heal; "+30 藝能" → buff.
 */
export function inferTone(text) {
  if (!text) return 'neutral';
  if (/傷害|擊倒|−\d+\s*HP|-\d+\s*HP|生命\s*-/.test(text)) return 'damage';
  if (/回\s*\d+|回復|治癒|HP\s*\+/.test(text)) return 'heal';
  if (/\+\d+|加成|藝能傷害\+/.test(text)) return 'buff';
  return 'neutral';
}
