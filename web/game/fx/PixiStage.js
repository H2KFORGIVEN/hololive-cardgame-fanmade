// PixiStage: singleton fullscreen transparent canvas for WebGL particle effects.
// Overlay sits above the game DOM with pointer-events: none so it never blocks clicks.
// Pixi is loaded from CDN as ESM — no build step required.

let _pixi = null;
let _app = null;
let _root = null;
let _ready = false;
let _initPromise = null;

export async function initPixi() {
  if (_ready) return { pixi: _pixi, app: _app, root: _root };
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Dynamic import from CDN so no bundler/npm needed
    _pixi = await import('https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/+esm');

    _app = new _pixi.Application();
    await _app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    const canvas = _app.canvas;
    canvas.id = 'pixiStage';
    canvas.style.cssText = [
      'position: fixed',
      'inset: 0',
      'width: 100vw',
      'height: 100vh',
      'pointer-events: none',
      'z-index: 500',
    ].join(';');
    document.body.appendChild(canvas);

    _root = new _pixi.Container();
    _app.stage.addChild(_root);

    // Resize handler
    window.addEventListener('resize', () => {
      _app.renderer.resize(window.innerWidth, window.innerHeight);
    });

    _ready = true;
    return { pixi: _pixi, app: _app, root: _root };
  })();

  return _initPromise;
}

export function getPixi() { return _pixi; }
export function getApp() { return _app; }
export function getRoot() { return _root; }
export function isReady() { return _ready; }

// Utility: get screen-space center of a DOM element
export function getElementCenter(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
}

// Utility: remove a display object after N ms (or after a tween completes)
export function scheduleRemove(obj, ms) {
  setTimeout(() => {
    if (obj && obj.parent) obj.parent.removeChild(obj);
    if (obj && typeof obj.destroy === 'function') obj.destroy({ children: true });
  }, ms);
}

// Utility: ticker-driven tween (time-normalized 0..1, delta-aware)
export function tween(durationMs, onUpdate, onComplete) {
  if (!_app) return;
  const start = performance.now();
  const fn = () => {
    const t = Math.min(1, (performance.now() - start) / durationMs);
    onUpdate(t);
    if (t >= 1) {
      _app.ticker.remove(fn);
      onComplete?.();
    }
  };
  _app.ticker.add(fn);
  return () => _app.ticker.remove(fn);
}

// Easing helpers
export const Ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outExpo: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
};
