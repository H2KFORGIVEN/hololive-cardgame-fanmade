// beam.js — attack beam from attacker card to target card.
// A bright gradient streak travels along the path, trailing sparks, ending with an impact.

import { initPixi, getPixi, getRoot, tween, Ease } from './PixiStage.js';
import { impact, shockwave, ember } from './effects.js';

export async function attackBeam(fromEl, toEl, {
  color = 0xffeecc,
  trailColor = 0xff9933,
  width = 10,
  duration = 380,
  onImpact = null,
} = {}) {
  try {
    await initPixi();
  } catch (e) {
    console.warn('[attackBeam] initPixi failed, skipping beam fx', e);
    return;
  }
  const PIXI = getPixi();
  const root = getRoot();
  if (!PIXI || !root) {
    console.warn('[attackBeam] Pixi not ready (PIXI/root missing), skipping');
    return;
  }
  if (!fromEl || !toEl) return;

  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  const bx = b.left + b.width / 2;
  const by = b.top + b.height / 2;

  const angle = Math.atan2(by - ay, bx - ax);
  const distance = Math.hypot(bx - ax, by - ay);

  const container = new PIXI.Container();
  root.addChild(container);

  // Core beam
  const core = new PIXI.Graphics();
  container.addChild(core);

  // Outer glow
  const glow = new PIXI.Graphics();
  container.addChild(glow);

  // Small sparks along the trail
  const sparks = [];

  tween(duration, (t) => {
    const e = Ease.outQuint(t);
    const headX = ax + (bx - ax) * e;
    const headY = ay + (by - ay) * e;
    const tailProgress = Math.max(0, e - 0.35);
    const tailX = ax + (bx - ax) * tailProgress;
    const tailY = ay + (by - ay) * tailProgress;

    // Redraw beam as line from tail → head
    core.clear();
    core.moveTo(tailX, tailY).lineTo(headX, headY)
        .stroke({ color, width, alpha: 1, cap: 'round' });

    glow.clear();
    glow.moveTo(tailX, tailY).lineTo(headX, headY)
        .stroke({ color: trailColor, width: width * 2.5, alpha: 0.45, cap: 'round' });

    // Emit a spark every few frames along the head
    if (t < 0.9 && Math.random() < 0.4) {
      const sparkEl = new PIXI.Graphics();
      const s = 2 + Math.random() * 2;
      sparkEl.circle(0, 0, s).fill({ color, alpha: 1 });
      sparkEl.position.set(headX + (Math.random() - 0.5) * 10, headY + (Math.random() - 0.5) * 10);
      container.addChild(sparkEl);
      const vx = (Math.random() - 0.5) * 3;
      const vy = (Math.random() - 0.5) * 3 - 1;
      sparks.push({ g: sparkEl, vx, vy, born: performance.now() });
    }

    // Update sparks
    const now = performance.now();
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i];
      const age = (now - sp.born) / 400;
      sp.g.position.x += sp.vx;
      sp.g.position.y += sp.vy;
      sp.g.alpha = Math.max(0, 1 - age);
      if (age >= 1) {
        if (sp.g.parent) sp.g.parent.removeChild(sp.g);
        sp.g.destroy();
        sparks.splice(i, 1);
      }
    }
  }, () => {
    // Impact at target
    impact(bx, by, { color, size: 130 });
    shockwave(bx, by, { color: trailColor, maxRadius: 180, duration: 500 });

    // Cleanup
    setTimeout(() => {
      if (container.parent) container.parent.removeChild(container);
      container.destroy({ children: true });
    }, 500);

    onImpact?.();
  });
}
