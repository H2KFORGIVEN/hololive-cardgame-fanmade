#!/usr/bin/env node
// Card-library effect coverage audit.
//
// For every (cardId, hook) entry in effect_analysis.json, classify:
//   REAL        — handler mutates state, queues a prompt, or returns a boost effect
//   PASSIVE     — handled at runtime via a non-hook registry (equipment HP/cost,
//                 cheer leave-stage cleanup). Effectively REAL but lives elsewhere.
//   LOG_ONLY    — registered handler only logs, no state change observed
//   PASSTHROUGH — universal fallback handler (logs effect text)
//   BROKEN      — handler threw on synthetic context (likely false positive)
//   MISSING     — no handler at all
//
// Cross-references card usage from decklog_decks.json (52 tournament decks) to
// produce a priority-sorted backlog.
//
// Outputs (in this directory):
//   report.md       — human-readable markdown
//   backlog.json    — full list of non-REAL/non-PASSIVE entries with usage counts
//
// Run:
//   node tools/effect-coverage/audit.mjs

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..', '..');

// Polyfill fetch for the browser-style relative paths used by the game's
// loader (so we can re-use registerAll.js unmodified).
globalThis.fetch = async u => {
  let f = u;
  if (f.startsWith('../game/effects/'))     f = path.join(ROOT, 'web/game/effects/', f.slice(16));
  else if (f.startsWith('../data/'))        f = path.join(ROOT, 'web/data/', f.slice(8));
  else if (f.startsWith('../'))             f = path.join(ROOT, 'web/', f.slice(3));
  return { ok: true, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) };
};
const CardDB = await import(path.join(ROOT, 'web/game/core/CardDatabase.js'));
await CardDB.loadCardsFromFile(path.join(ROOT, 'web/data/cards.json'));
const { initEffects } = await import(path.join(ROOT, 'web/game/effects/registerAll.js'));
const { getHandler, HOOK } = await import(path.join(ROOT, 'web/game/effects/EffectRegistry.js'));
const { ZONE, MEMBER_STATE } = await import(path.join(ROOT, 'web/game/core/constants.js'));
const { createCardInstance } = await import(path.join(ROOT, 'web/game/core/GameState.js'));

// Suppress effect-system init noise.
const old = console.log; console.log = () => {}; await initEffects(); console.log = old;

const analysis = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/game/effects/effect_analysis.json'), 'utf8'));
const decklogs = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/decklog_decks.json'), 'utf8'));
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/cards.json'), 'utf8'));
const cardById = new Map();
for (const c of cards) if (c.id) cardById.set(c.id, c);

const HOOK_MAP = {
  oshiSkill: HOOK.ON_OSHI_SKILL,
  spSkill: HOOK.ON_OSHI_SKILL,
  effectC: HOOK.ON_COLLAB,
  effectB: HOOK.ON_BLOOM,
  effectG: HOOK.ON_PASSIVE_GLOBAL,
  stageSkill: HOOK.ON_STAGE_SKILL,
  art1: HOOK.ON_ART_RESOLVE,
  art2: HOOK.ON_ART_RESOLVE,
  support: HOOK.ON_PLAY,
  cheer: HOOK.ON_CHEER_ATTACH,
};

// ---- Deck usage map: cardId → total copies across 52 tournament decks ----
const usage = new Map();
const bump = (id, n) => usage.set(id, (usage.get(id) || 0) + n);
for (const deck of decklogs) {
  for (const c of (deck.oshi_cards || [])) bump(c.card_id, c.count || 1);
  for (const c of (deck.main_deck || [])) bump(c.card_id, c.count || 1);
  for (const c of (deck.cheer_deck || [])) bump(c.card_id, c.count || 1);
}

// ---- Synthetic-state helpers (behavioral sampling) ----
function blankPlayer() {
  return {
    zones: {
      [ZONE.CENTER]: null, [ZONE.COLLAB]: null,
      [ZONE.BACKSTAGE]: [],
      [ZONE.DECK]: [],
      [ZONE.HAND]: [],
      [ZONE.ARCHIVE]: [],
      [ZONE.HOLO_POWER]: [],
      [ZONE.CHEER_DECK]: [],
      [ZONE.LIFE]: [],
    },
    oshi: { cardId: '', usedSp: false },
    usedBaton: false, usedCollab: false, usedLimited: false,
    performedArts: { center: false, collab: false },
  };
}

function mkSyntheticState(cardId) {
  const memberInst = createCardInstance(cardId);
  memberInst.attachedCheer = [];
  memberInst.attachedSupport = [];
  memberInst.damage = 0;
  memberInst.bloomStack = [];
  memberInst.state = MEMBER_STATE.ACTIVE;

  const p0 = blankPlayer();
  const p1 = blankPlayer();
  p0.zones[ZONE.CENTER] = memberInst;
  p1.zones[ZONE.CENTER] = createCardInstance('hBP07-051');
  for (const id of ['hBP07-051','hBP07-051','hBP07-051','hY01-001','hY01-001']) {
    p0.zones[ZONE.DECK].push(createCardInstance(id));
  }
  for (const id of ['hY01-001','hY01-001']) p0.zones[ZONE.CHEER_DECK].push(createCardInstance(id));
  for (const id of ['hY01-001','hY01-001','hY01-001']) p0.zones[ZONE.LIFE].push(createCardInstance(id));
  for (const id of ['hY01-001']) p0.zones[ZONE.HOLO_POWER].push(createCardInstance(id));
  for (const id of ['hBP07-051','hBP07-051']) p0.zones[ZONE.HAND].push(createCardInstance(id));
  p0.oshi.cardId = cardId;

  return {
    state: {
      activePlayer: 0, turnNumber: 5, phase: 'main', winner: null,
      players: [p0, p1], log: [], firstTurn: [false, false], firstPlayer: 0,
    },
    memberInst,
  };
}

function mkContext(hook, cardId, memberInst) {
  switch (hook) {
    case 'oshiSkill': return { player: 0, cardId, skillType: 'regular' };
    case 'spSkill':   return { player: 0, cardId, skillType: 'sp' };
    case 'effectB':
    case 'effectC':
    case 'effectG':   return { player: 0, cardId, memberInst };
    case 'art1':      return { player: 0, cardId, memberInst, artKey: 'art1', target: { cardId: 'hBP07-051', damage: 0, attachedCheer: [], attachedSupport: [] } };
    case 'art2':      return { player: 0, cardId, memberInst, artKey: 'art2', target: { cardId: 'hBP07-051', damage: 0, attachedCheer: [], attachedSupport: [] } };
    case 'stageSkill':return { player: 0, cardId, memberInst };
    case 'support':
    case 'cheer':
    default: return { player: 0, cardId };
  }
}

function snapshotKeyFields(state) {
  const p = state.players[0];
  const zoneSizes = Object.fromEntries(Object.entries(p.zones).map(([k,v]) => [k, Array.isArray(v) ? v.length : (v ? 1 : 0)]));
  const center = p.zones[ZONE.CENTER];
  return JSON.stringify({
    zoneSizes,
    centerDamage: center?.damage ?? null,
    centerCheer: center?.attachedCheer?.length ?? 0,
    centerSupport: center?.attachedSupport?.length ?? 0,
    centerStack: center?.bloomStack?.length ?? 0,
    centerOppDamage: state.players[1].zones[ZONE.CENTER]?.damage ?? null,
    extraTurnQueued: state.extraTurnQueued ?? null,
    turnBoosts: (state._turnBoosts || []).length,
    turnModifiers: (state._turnModifiers || []).length,
    pendingEffect: state.pendingEffect ? 1 : 0,
  });
}

function tryInvoke(handler, cardId, hook, ctxOverride = {}) {
  const { state, memberInst } = mkSyntheticState(cardId);
  const ctx = { ...mkContext(hook, cardId, memberInst), ...ctxOverride };
  const before = snapshotKeyFields(state);
  let result;
  try {
    result = handler(state, ctx);
  } catch (e) {
    return { kind: 'BROKEN', err: e.message };
  }
  if (!result || typeof result !== 'object') return { kind: 'BROKEN', err: 'no result' };
  const after = snapshotKeyFields(state);
  if (result.prompt) return { kind: 'INTERACTIVE' };
  if (result.effect) return { kind: 'BOOST' };
  if (before !== after) return { kind: 'MUTATING' };
  return { kind: 'LOG_ONLY' };
}

// Static source heuristic — handlers that condition-gate on tags or specific
// deck contents may not fire on the synthetic state but still contain real
// state-mutating code.
const MUTATING_PATTERNS = [
  /\bprompt\s*:/, /\beffect\s*:/,
  /\bdrawCards\s*\(/, /\bdamageOpp\s*\(/, /\barchiveHand\s*\(/,
  /\bsendCheerDeck\s*\(/, /\bsendCheerArchive\s*\(/, /\breturnArchive\s*\(/,
  /\bapplyDamage\s*\(/,
  /\bboost\s*\(/, /\bboostTurn\s*\(/, /\bPB\s*\(/,
  /\bshuffleArr\s*\(/,
  /\.zones\s*\[[^\]]+\]\.push\s*\(/,
  /\.zones\s*\[[^\]]+\]\.shift\s*\(/,
  /\.zones\s*\[[^\]]+\]\.splice\s*\(/,
  /\.zones\s*\[[^\]]+\]\s*=\s*[^/]/,
  /\bstate\._turnBoosts/, /\bstate\._turnModifiers/,
  /\bstate\.pendingEffect\s*=/, /\bstate\.extraTurnQueued\s*=/,
  /\bmemberInst\.\w+\s*=/, /\bmemberInst\.damage\s*[=+-]/,
  /\bmemberInst\.attachedCheer/, /\bmemberInst\.attachedSupport/, /\bmemberInst\.bloomStack/,
  /\bdamage\s*=\s*Math\.max/, /\bplayer\.usedSp/,
];

function staticLooksMutating(handler) {
  let src = '';
  try { src = handler.toString(); } catch { return false; }
  src = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return MUTATING_PATTERNS.some(re => re.test(src));
}

function classifyBehavior(handler, cardId, hook) {
  const variants = [{}];
  if (hook === 'effectG') {
    variants.push({ triggerEvent: 'sp_skill_used' });
    variants.push({ triggerEvent: 'performance_start' });
    variants.push({ triggerEvent: 'turn_start' });
  }
  if (hook === 'oshiSkill') { variants.length = 0; variants.push({ skillType: 'regular' }); }
  if (hook === 'spSkill')   { variants.length = 0; variants.push({ skillType: 'sp' }); }

  let firstNonReal = null;
  for (const ov of variants) {
    const r = tryInvoke(handler, cardId, hook, ov);
    if (['INTERACTIVE','BOOST','MUTATING'].includes(r.kind)) return r;
    if (!firstNonReal) firstNonReal = r;
  }
  if (firstNonReal?.kind === 'LOG_ONLY' && staticLooksMutating(handler)) {
    return { kind: 'GATED' };
  }
  return firstNonReal;
}

// IDs whose effect is handled via AttachedSupportEffects.js registry rather
// than a hook handler (kept in sync with REGISTRY in that file).
const PASSIVE_EQUIP_IDS = new Set(['hBP06-097', 'hBP07-101']);

const STATUS = {
  REAL: 'REAL', LOG_ONLY: 'LOG_ONLY', PASSTHROUGH: 'PASSTHROUGH',
  MISSING: 'MISSING', BROKEN: 'BROKEN', PASSIVE: 'PASSIVE',
};

const records = [];
for (const e of analysis.effects) {
  const hookConst = HOOK_MAP[e.hook];
  if (!hookConst) continue;
  const handler = getHandler(e.id, hookConst);
  let altHandler = null;
  if (e.hook === 'art1' || e.hook === 'art2') {
    altHandler = getHandler(e.id, HOOK.ON_ART_DECLARE);
  }
  let status, behaviorKind = null, behaviorErr = null;

  if (!handler && !altHandler) status = STATUS.MISSING;
  else if (handler?._passthrough && (!altHandler || altHandler._passthrough)) status = STATUS.PASSTHROUGH;
  else if (PASSIVE_EQUIP_IDS.has(e.id) && e.hook === 'support') {
    status = STATUS.PASSIVE; behaviorKind = 'PASSIVE_EQUIP';
  } else if (e.hook === 'cheer') {
    status = STATUS.PASSIVE; behaviorKind = 'PASSIVE_CHEER_CLEANUP';
  } else {
    let bestKind = 'LOG_ONLY';
    for (const h of [handler, altHandler].filter(Boolean)) {
      if (h._passthrough) continue;
      const b = classifyBehavior(h, e.id, e.hook);
      if (['INTERACTIVE','BOOST','MUTATING','GATED'].includes(b.kind)) { bestKind = b.kind; break; }
      if (b.kind === 'BROKEN' && bestKind === 'LOG_ONLY') { bestKind = 'BROKEN'; behaviorErr = b.err; }
    }
    behaviorKind = bestKind;
    status = bestKind === 'LOG_ONLY' ? STATUS.LOG_ONLY
           : bestKind === 'BROKEN' ? STATUS.BROKEN
           : STATUS.REAL;
  }

  const card = cardById.get(e.id);
  records.push({
    id: e.id,
    name: card?.name || '(unknown)',
    hook: e.hook,
    type: e.type,
    expansion: (e.id || '').split('-')[0],
    text: e.text || '',
    status,
    behaviorKind,
    behaviorErr,
    usage: usage.get(e.id) || 0,
  });
}

// Dedup (cardId, hook) — analysis JSON has duplicate rows per language
const dedupedMap = new Map();
for (const r of records) {
  const key = `${r.id}|${r.hook}`;
  const prev = dedupedMap.get(key);
  if (!prev || r.usage > prev.usage) dedupedMap.set(key, r);
}
const dedup = [...dedupedMap.values()];

// Aggregate
const total = dedup.length;
const counts = { REAL: 0, LOG_ONLY: 0, PASSTHROUGH: 0, MISSING: 0, BROKEN: 0, PASSIVE: 0 };
for (const r of dedup) counts[r.status]++;

const byHook = {}, byExpansion = {};
const seedBucket = () => ({ REAL:0, PASSIVE:0, LOG_ONLY:0, PASSTHROUGH:0, MISSING:0, BROKEN:0, total:0 });
for (const r of dedup) {
  if (!byHook[r.hook]) byHook[r.hook] = seedBucket();
  byHook[r.hook][r.status]++;
  byHook[r.hook].total++;
  if (!byExpansion[r.expansion]) byExpansion[r.expansion] = seedBucket();
  byExpansion[r.expansion][r.status]++;
  byExpansion[r.expansion].total++;
}

const backlog = dedup
  .filter(r => r.status !== STATUS.REAL && r.status !== STATUS.PASSIVE)
  .sort((a, b) => (b.usage - a.usage) || a.id.localeCompare(b.id));

const deckCoverage = [];
for (const deck of decklogs) {
  const ids = new Set();
  for (const c of (deck.main_deck || [])) ids.add(c.card_id);
  for (const c of (deck.oshi_cards || [])) ids.add(c.card_id);
  let real=0, log=0, pass=0, miss=0;
  for (const id of ids) {
    const ms = dedup.filter(r => r.id === id);
    if (!ms.length) continue;
    if (ms.every(m => m.status === STATUS.REAL || m.status === STATUS.PASSIVE)) { real++; continue; }
    if (ms.some(m => m.status === STATUS.MISSING))     { miss++; continue; }
    if (ms.some(m => m.status === STATUS.PASSTHROUGH)) { pass++; continue; }
    if (ms.some(m => m.status === STATUS.LOG_ONLY))    { log++;  continue; }
    real++;
  }
  const totalCards = real + log + pass + miss;
  deckCoverage.push({
    deck_id: deck.deck_id, title: deck.title, placement: deck.placement,
    real, log, pass, miss, totalCards,
    realPct: totalCards ? Math.round(real * 100 / totalCards) : 0,
  });
}
deckCoverage.sort((a, b) => a.realPct - b.realPct);

// ---- Format report ----
const lines = [];
const fmtPct = (n, d) => d ? `${Math.round(n * 100 / d)}%` : '0%';
lines.push(`# Card Library Effect Coverage Audit`);
lines.push(`Generated: ${new Date().toISOString()}\n`);
lines.push(`## Headline\n`);
lines.push(`- **Total unique (cardId, hook) entries**: ${total}`);
lines.push(`- **REAL (mutates state / queues prompt or boost)**: ${counts.REAL} (${fmtPct(counts.REAL, total)})`);
lines.push(`- **PASSIVE (registry-driven: equipment HP/cost, cheer leave-stage)**: ${counts.PASSIVE} (${fmtPct(counts.PASSIVE, total)})`);
lines.push(`- **LOG_ONLY (placeholder logs only)**: ${counts.LOG_ONLY} (${fmtPct(counts.LOG_ONLY, total)})`);
lines.push(`- **PASSTHROUGH fallback**: ${counts.PASSTHROUGH} (${fmtPct(counts.PASSTHROUGH, total)})`);
lines.push(`- **BROKEN (handler threw on synthetic context)**: ${counts.BROKEN} (${fmtPct(counts.BROKEN, total)})`);
lines.push(`- **MISSING (no handler at all)**: ${counts.MISSING} (${fmtPct(counts.MISSING, total)})`);
const eff = counts.REAL + counts.PASSIVE;
lines.push(`- **Effective coverage (REAL + PASSIVE)**: ${eff} (${fmtPct(eff, total)})`);
lines.push('');

lines.push(`## By hook type\n`);
lines.push(`| Hook | Total | REAL | PASSIVE | LOG_ONLY | PASSTHROUGH | MISS | BROKEN | Effective % |`);
lines.push(`|---|---|---|---|---|---|---|---|---|`);
const hookOrder = ['oshiSkill','spSkill','art1','art2','effectB','effectC','effectG','support','stageSkill','cheer'];
for (const h of hookOrder) {
  const b = byHook[h]; if (!b) continue;
  lines.push(`| ${h} | ${b.total} | ${b.REAL} | ${b.PASSIVE} | ${b.LOG_ONLY} | ${b.PASSTHROUGH} | ${b.MISSING} | ${b.BROKEN} | ${fmtPct(b.REAL+b.PASSIVE, b.total)} |`);
}
lines.push('');

lines.push(`## By expansion\n`);
lines.push(`| Set | Total | REAL | PASSIVE | LOG_ONLY | PASSTHROUGH | MISS | BROKEN | Effective % |`);
lines.push(`|---|---|---|---|---|---|---|---|---|`);
for (const ex of Object.keys(byExpansion).sort()) {
  const b = byExpansion[ex];
  lines.push(`| ${ex} | ${b.total} | ${b.REAL} | ${b.PASSIVE} | ${b.LOG_ONLY} | ${b.PASSTHROUGH} | ${b.MISSING} | ${b.BROKEN} | ${fmtPct(b.REAL+b.PASSIVE, b.total)} |`);
}
lines.push('');

lines.push(`## Tournament backlog: top 60 most-played cards still on LOG_ONLY/PASSTHROUGH/MISSING\n`);
lines.push(`Usage = total copies across 52 tournament decks.\n`);
lines.push(`| # | ID | Name | Hook | Status | Usage | Effect (truncated) |`);
lines.push(`|---|---|---|---|---|---|---|`);
backlog.slice(0, 60).forEach((r, i) => {
  const text = (r.text || '').replace(/\n/g, ' ').slice(0, 90);
  lines.push(`| ${i+1} | ${r.id} | ${r.name} | ${r.hook} | ${r.status} | ${r.usage} | ${text} |`);
});
lines.push('');

lines.push(`## Tournament-deck coverage (52 community decks)\n`);
lines.push(`Sorted ascending by REAL %. Each card counted once.\n`);
lines.push(`| Deck | Placement | REAL | LOG | PASS | MISS | Total | REAL % |`);
lines.push(`|---|---|---|---|---|---|---|---|`);
for (const d of deckCoverage.slice(0, 30)) {
  lines.push(`| ${d.title} | ${d.placement || '-'} | ${d.real} | ${d.log} | ${d.pass} | ${d.miss} | ${d.totalCards} | ${d.realPct}% |`);
}
lines.push('');

lines.push(`## Definitions\n`);
lines.push(`- **REAL** — handler mutates state, returns a prompt, or returns a damage-boost effect when invoked with a synthetic-but-realistic context. Includes \`GATED\` (handlers whose source contains state-mutating code that doesn't fire on the default sample due to condition gates).`);
lines.push(`- **PASSIVE** — effect is handled via a separate registry (e.g. \`web/game/core/AttachedSupportEffects.js\` for equipment HP/cost; cheer leave-stage cleanup in GameEngine knockdown path). Counts as covered.`);
lines.push(`- **LOG_ONLY** — handler is registered (often in \`phaseC-final.js\` dictionaries) but only emits a log line. Indistinguishable from PASSTHROUGH from the engine's perspective.`);
lines.push(`- **PASSTHROUGH** — universal fallback handler tagged \`_passthrough\`. Logs the effect text only.`);
lines.push(`- **BROKEN** — handler threw on synthetic context. May be a false positive; check manually.`);
lines.push(`- **MISSING** — no handler at all.`);
lines.push('');
lines.push(`## Caveats\n`);
lines.push(`Behavioral classification uses synthetic states. The static fallback ("GATED" handlers) catches code that wouldn't fire on the sample, but cannot distinguish "handler is a real implementation pending the right trigger" from "handler is dead code". Treat the LOG_ONLY count as an approximate upper bound — some real handlers gated on rare conditions may be undercounted, and some handlers that intentionally only log (e.g. validator-enforced restrictions like hBP01-009 art1's "target center only") are overcounted.`);
lines.push('');

const out = lines.join('\n');
const REPORT_PATH = path.join(SCRIPT_DIR, 'report.md');
const BACKLOG_PATH = path.join(SCRIPT_DIR, 'backlog.json');
fs.writeFileSync(REPORT_PATH, out);
fs.writeFileSync(BACKLOG_PATH, JSON.stringify(backlog, null, 2));

console.log(`Wrote ${path.relative(ROOT, REPORT_PATH)} (${out.length} bytes)`);
console.log(`Wrote ${path.relative(ROOT, BACKLOG_PATH)} (${backlog.length} entries)`);
console.log(`Total: ${total} | REAL ${counts.REAL} (${fmtPct(counts.REAL, total)}) | PASSIVE ${counts.PASSIVE} | LOG_ONLY ${counts.LOG_ONLY} | Effective ${eff} (${fmtPct(eff, total)})`);
