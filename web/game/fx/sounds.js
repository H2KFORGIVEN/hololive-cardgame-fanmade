// sounds.js — zero-asset sound system using Web Audio API.
//
// Generates short synthesized tones for game events (place, draw, attack,
// knockdown, bloom, oshi, cheer attach). Total payload: this file (~3KB).
// No external sound files, no CDN dependencies, no licensing concerns.
//
// Public API:
//   playSound(name, options?)   — fire a named sound preset
//   setMuted(boolean)           — global mute toggle (persisted in localStorage)
//   isMuted()                   — current mute state
//   tryUnlockAudio()            — unlock AudioContext on first user gesture
//                                 (browsers require this; called automatically
//                                 on document click/keydown by initSounds)
//   initSounds()                — wire global unlock listener (idempotent)
//
// Presets (stylistically distinct so the player can recognize events by ear):
//   'place'      — soft attack thump (low square, quick decay)
//   'draw'       — brief paper rustle (filtered noise burst)
//   'attack'     — descending chirp (sawtooth, glide down)
//   'crit'       — sharper hit (square pulse + click)
//   'knockdown'  — low rumble + dissonant cluster (FM modulation)
//   'bloom'      — ascending arpeggio (triangle, 3 quick notes)
//   'oshi'       — heroic chord stab (triangle, 3 simultaneous tones)
//   'collab'     — friendly two-note (sine, perfect 5th)
//   'cheer'      — twinkle (high sine, tiny glissando)
//   'click'      — UI tick (very short square)
//   'error'      — flat buzz (sawtooth, low)

const STORAGE_KEY = '__hocg_audio_muted';
let _ctx = null;
let _masterGain = null;
let _initialized = false;

function _ctxOK() {
  if (!_ctx) {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      _ctx = new Ctor();
      _masterGain = _ctx.createGain();
      _masterGain.gain.value = isMuted() ? 0 : 0.42;
      _masterGain.connect(_ctx.destination);
    } catch (_e) { return null; }
  }
  return _ctx;
}

export function tryUnlockAudio() {
  const ctx = _ctxOK();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function isMuted() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; }
  catch (_e) { return false; }
}
export function setMuted(muted) {
  try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch (_e) {}
  if (_masterGain) _masterGain.gain.value = muted ? 0 : 0.42;
}

export function initSounds() {
  if (_initialized) return;
  _initialized = true;
  // Unlock on any user gesture
  const unlock = () => {
    tryUnlockAudio();
    document.removeEventListener('click', unlock);
    document.removeEventListener('keydown', unlock);
    document.removeEventListener('touchstart', unlock);
  };
  document.addEventListener('click', unlock, { once: false });
  document.addEventListener('keydown', unlock, { once: false });
  document.addEventListener('touchstart', unlock, { once: false });
}

// ── Internal tone helpers ──────────────────────────────────────────────

function _osc({ freq = 440, type = 'sine', start = 0, attack = 0.005, decay = 0.15,
                gain = 1.0, freqEnd = null, freqRamp = 0.0 } = {}) {
  const ctx = _ctxOK();
  if (!ctx) return;
  const now = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  if (freqEnd != null && freqRamp > 0) {
    o.frequency.exponentialRampToValueAtTime(Math.max(0.1, freqEnd), now + freqRamp);
  }
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  o.connect(g).connect(_masterGain);
  o.start(now);
  o.stop(now + attack + decay + 0.05);
}

function _noiseBurst({ start = 0, attack = 0.002, decay = 0.08, gain = 0.3,
                       cutoff = 1200, q = 0.7 } = {}) {
  const ctx = _ctxOK();
  if (!ctx) return;
  const now = ctx.currentTime + start;
  const dur = attack + decay + 0.02;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = cutoff;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  src.connect(filter).connect(g).connect(_masterGain);
  src.start(now);
  src.stop(now + dur);
}

// ── Public sound presets ───────────────────────────────────────────────

export function playSound(name, options = {}) {
  if (isMuted()) return;
  const ctx = _ctxOK();
  if (!ctx) return;
  // If audio context not yet running, try to unlock; if still not, skip.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
    if (ctx.state === 'suspended') return;
  }
  switch (name) {
    case 'place':
      _osc({ type: 'square',   freq: 220, freqEnd: 130, freqRamp: 0.08, attack: 0.002, decay: 0.16, gain: 0.18 });
      _osc({ type: 'sine',     freq: 440, freqEnd: 220, freqRamp: 0.06, attack: 0.002, decay: 0.10, gain: 0.10 });
      break;
    case 'draw':
      _noiseBurst({ cutoff: 4500, q: 0.5, attack: 0.001, decay: 0.07, gain: 0.20 });
      _osc({ type: 'sine', freq: 1200, freqEnd: 800, freqRamp: 0.04, decay: 0.05, gain: 0.04 });
      break;
    case 'attack':
      _osc({ type: 'sawtooth', freq: 800, freqEnd: 200, freqRamp: 0.18, attack: 0.005, decay: 0.18, gain: 0.16 });
      _osc({ type: 'square',   freq: 400, freqEnd: 100, freqRamp: 0.18, attack: 0.005, decay: 0.18, gain: 0.08 });
      break;
    case 'crit':
      _osc({ type: 'square', freq: 660, freqEnd: 220, freqRamp: 0.14, attack: 0.002, decay: 0.16, gain: 0.22 });
      _noiseBurst({ start: 0.005, cutoff: 3000, q: 1.5, decay: 0.12, gain: 0.18 });
      break;
    case 'knockdown':
      _osc({ type: 'sawtooth', freq: 110, freqEnd: 55, freqRamp: 0.4, decay: 0.45, gain: 0.30 });
      _osc({ type: 'sawtooth', freq: 116, freqEnd: 58, freqRamp: 0.4, decay: 0.45, gain: 0.20 }); // detune for richer rumble
      _noiseBurst({ start: 0.05, cutoff: 800, q: 1.0, decay: 0.30, gain: 0.18 });
      break;
    case 'bloom': {
      // C-E-G ascending arpeggio
      const base = 523.25;  // C5
      _osc({ type: 'triangle', freq: base, decay: 0.18, gain: 0.18, start: 0.00 });
      _osc({ type: 'triangle', freq: base * 1.26, decay: 0.18, gain: 0.18, start: 0.07 });  // E5
      _osc({ type: 'triangle', freq: base * 1.50, decay: 0.22, gain: 0.20, start: 0.14 });  // G5
      _osc({ type: 'sine',     freq: base * 2.00, decay: 0.30, gain: 0.10, start: 0.14 });  // C6 sparkle
      break;
    }
    case 'oshi': {
      // Heroic chord stab: C major triad + bright top
      _osc({ type: 'triangle', freq: 261.63, attack: 0.005, decay: 0.5, gain: 0.20 });
      _osc({ type: 'triangle', freq: 329.63, attack: 0.005, decay: 0.5, gain: 0.18 });
      _osc({ type: 'triangle', freq: 392.00, attack: 0.005, decay: 0.5, gain: 0.18 });
      _osc({ type: 'sine',     freq: 1046.5, attack: 0.01,  decay: 0.5, gain: 0.10 });
      break;
    }
    case 'collab':
      _osc({ type: 'sine', freq: 523.25, decay: 0.22, gain: 0.18 });           // C5
      _osc({ type: 'sine', freq: 783.99, decay: 0.22, gain: 0.16, start: 0.07 }); // G5 (5th)
      break;
    case 'cheer':
      _osc({ type: 'sine', freq: 1568.00, freqEnd: 2093.00, freqRamp: 0.10, decay: 0.18, gain: 0.10 });
      break;
    case 'click':
      _osc({ type: 'square', freq: 1500, decay: 0.04, gain: 0.10 });
      break;
    case 'error':
      _osc({ type: 'sawtooth', freq: 180, decay: 0.18, gain: 0.20 });
      break;
    default:
      // Unknown sound — soft click fallback
      _osc({ type: 'square', freq: 600, decay: 0.05, gain: 0.06 });
  }
}
