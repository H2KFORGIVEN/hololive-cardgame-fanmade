// effects.js — cinematic Pixi fx library.
// Each export takes screen-space coords and spawns a self-cleaning display object.

import { initPixi, getPixi, getRoot, tween, scheduleRemove, Ease } from './PixiStage.js';

async function ready() {
  await initPixi();
  return { PIXI: getPixi(), root: getRoot() };
}

// ── Impact burst: radial lines + bright flash at (x, y) ──
export async function impact(x, y, { color = 0xffee88, size = 120, lineCount = 14 } = {}) {
  const { PIXI, root } = await ready();
  const container = new PIXI.Container();
  container.position.set(x, y);
  root.addChild(container);

  // Central flash
  const flash = new PIXI.Graphics();
  flash.circle(0, 0, size * 0.4).fill({ color, alpha: 1 });
  container.addChild(flash);

  // Radial lines
  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    const angle = (i / lineCount) * Math.PI * 2 + Math.random() * 0.3;
    const line = new PIXI.Graphics();
    const length = size * (0.7 + Math.random() * 0.5);
    line.moveTo(0, 0).lineTo(Math.cos(angle) * length, Math.sin(angle) * length)
        .stroke({ color, width: 3 + Math.random() * 2, alpha: 1, cap: 'round' });
    container.addChild(line);
    lines.push({ g: line, baseLen: length, angle });
  }

  tween(500, (t) => {
    const e = Ease.outCubic(t);
    flash.scale.set(1 + e * 2);
    flash.alpha = 1 - e;
    for (const l of lines) {
      l.g.scale.set(1 + e * 0.8);
      l.g.alpha = 1 - e;
    }
  }, () => {
    if (container.parent) container.parent.removeChild(container);
    container.destroy({ children: true });
  });
}

// ── Shockwave ring expanding outward ──
export async function shockwave(x, y, { color = 0xff8844, maxRadius = 200, duration = 600 } = {}) {
  const { PIXI, root } = await ready();
  const ring = new PIXI.Graphics();
  ring.position.set(x, y);
  root.addChild(ring);

  tween(duration, (t) => {
    const e = Ease.outQuint(t);
    const r = maxRadius * e;
    const alpha = 1 - e;
    ring.clear();
    ring.circle(0, 0, r).stroke({ color, width: 6 * (1 - e * 0.5), alpha });
    if (t < 0.5) {
      ring.circle(0, 0, r * 0.85).stroke({ color: 0xffffff, width: 2, alpha: alpha * 0.8 });
    }
  }, () => {
    if (ring.parent) ring.parent.removeChild(ring);
    ring.destroy();
  });
}

// ── Rising gold sparkles (for bloom / power-up) ──
export async function sparkle(x, y, { count = 20, color = 0xffd84a, spread = 80, rise = 180, duration = 1200 } = {}) {
  const { PIXI, root } = await ready();
  const container = new PIXI.Container();
  container.position.set(x, y);
  root.addChild(container);

  const particles = [];
  for (let i = 0; i < count; i++) {
    const p = new PIXI.Graphics();
    const size = 3 + Math.random() * 4;
    p.star(0, 0, 4, size, size * 0.4).fill({ color, alpha: 1 });
    const startX = (Math.random() - 0.5) * spread;
    const startY = (Math.random() - 0.5) * 20;
    p.position.set(startX, startY);
    const targetY = startY - rise - Math.random() * 60;
    const targetX = startX + (Math.random() - 0.5) * 50;
    const delay = Math.random() * 300;
    const rotate = (Math.random() - 0.5) * 4;
    container.addChild(p);
    particles.push({ g: p, sx: startX, sy: startY, tx: targetX, ty: targetY, delay, rotate });
  }

  tween(duration, (t) => {
    const now = t * duration;
    for (const p of particles) {
      const local = Math.max(0, Math.min(1, (now - p.delay) / (duration - 300)));
      const e = Ease.outCubic(local);
      p.g.position.set(p.sx + (p.tx - p.sx) * e, p.sy + (p.ty - p.sy) * e);
      p.g.rotation = p.rotate * e;
      p.g.scale.set(1 + e * 0.5);
      p.g.alpha = local < 0.7 ? 1 : (1 - (local - 0.7) / 0.3);
    }
  }, () => {
    if (container.parent) container.parent.removeChild(container);
    container.destroy({ children: true });
  });
}

// ── Shatter / debris burst (for knockdown) ──
export async function shatter(x, y, { count = 18, color = 0xff4444, size = 140, duration = 900 } = {}) {
  const { PIXI, root } = await ready();
  const container = new PIXI.Container();
  container.position.set(x, y);
  root.addChild(container);

  const debris = [];
  for (let i = 0; i < count; i++) {
    const p = new PIXI.Graphics();
    const s = 4 + Math.random() * 6;
    // rough triangle
    p.poly([-s, -s, s, -s, 0, s]).fill({ color, alpha: 1 });
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const speed = size * (0.8 + Math.random() * 0.6);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 50; // slight upward bias
    container.addChild(p);
    debris.push({ g: p, vx, vy, spin: (Math.random() - 0.5) * 10 });
  }

  const gravity = 800;
  tween(duration, (t) => {
    const secs = (t * duration) / 1000;
    for (const d of debris) {
      d.g.position.set(d.vx * secs, d.vy * secs + 0.5 * gravity * secs * secs);
      d.g.rotation = d.spin * secs;
      d.g.alpha = Math.max(0, 1 - t * 1.3);
    }
  }, () => {
    if (container.parent) container.parent.removeChild(container);
    container.destroy({ children: true });
  });
}

// ── Ember trail (continuous, used as sub-fx for beams) ──
export async function ember(x, y, { color = 0xff8833, count = 8, spread = 30, rise = 40 } = {}) {
  const { PIXI, root } = await ready();
  const container = new PIXI.Container();
  container.position.set(x, y);
  root.addChild(container);

  for (let i = 0; i < count; i++) {
    const p = new PIXI.Graphics();
    const s = 2 + Math.random() * 3;
    p.circle(0, 0, s).fill({ color, alpha: 1 });
    p.position.set((Math.random() - 0.5) * spread, 0);
    container.addChild(p);

    const delay = Math.random() * 200;
    const targetY = -rise - Math.random() * 40;
    setTimeout(() => {
      tween(500 + Math.random() * 300, (t) => {
        const e = Ease.outCubic(t);
        p.position.y = targetY * e;
        p.alpha = 1 - t;
        p.scale.set(1 - t * 0.5);
      }, () => {});
    }, delay);
  }

  scheduleRemove(container, 1100);
}

// ── Radial bright flash (for oshi skill / life loss) ──
export async function flash(x, y, { color = 0xffffff, radius = 300, duration = 350 } = {}) {
  const { PIXI, root } = await ready();
  const g = new PIXI.Graphics();
  g.position.set(x, y);
  root.addChild(g);

  tween(duration, (t) => {
    const alpha = (1 - t) * 0.9;
    g.clear();
    g.circle(0, 0, radius * (0.5 + t * 0.5)).fill({ color, alpha });
  }, () => {
    if (g.parent) g.parent.removeChild(g);
    g.destroy();
  });
}

// ── Session 2: ON_PLAY entrance puff ──
// Quick gold-white sparkle ring + small bright flash + shockwave halo.
// Used when a member is placed onto stage. Lighter than impact() so it
// doesn't compete with combat VFX.
export async function entrancePuff(x, y, { color = 0xfff2c0, intense = false } = {}) {
  await impact(x, y, { color, size: intense ? 90 : 70, lineCount: 12 });
  await flash(x, y, { color: 0xffffff, radius: 110, duration: 280 });
  await shockwave(x, y, { color, maxRadius: 130, duration: 450 });
  await sparkle(x, y, { count: intense ? 18 : 12, color, spread: 70, rise: 90, duration: 900 });
}

// ── Session 2: per-color attack tint helper ──
// Maps a hololive card color (Chinese char) to a tinted attack profile:
// returns { beamColor, trailColor, embertColor, impactColor }.
// Used by GameController._animateArtAttack / _animateHitShake to theme
// the existing fx pipeline based on the attacker's color.
export function attackPaletteFor(color) {
  const palettes = {
    '紅': { beam: 0xffaa66, trail: 0xff3322, ember: 0xff5533, impact: 0xffcc88 }, // fire
    '藍': { beam: 0x99ddff, trail: 0x3366ee, ember: 0x4499ff, impact: 0xaaeeff }, // water
    '綠': { beam: 0xc8ff99, trail: 0x44aa44, ember: 0x66cc66, impact: 0xddffcc }, // earth
    '紫': { beam: 0xffaaff, trail: 0x9933cc, ember: 0xcc66ff, impact: 0xffccff }, // arcane
    '黃': { beam: 0xfff099, trail: 0xffcc22, ember: 0xffdd44, impact: 0xfff5cc }, // light
    '白': { beam: 0xffffff, trail: 0xeeeeff, ember: 0xffffff, impact: 0xffffff }, // pure
  };
  return palettes[color] || { beam: 0xffeeaa, trail: 0xff7733, ember: 0xffcc66, impact: 0xffeeaa };
}
