#!/usr/bin/env node
// Pattern-based handler generator. Reads cards.json, classifies each
// uncovered card's effect text by regex patterns, and emits handler code.
//
// Outputs:
//   web/game/effects/handlers/phaseD-generated.js   — auto-generated handlers
//   web/game/core/AttachedSupportEffects-extra.js   — REGISTRY additions
//   tools/generate-handlers/report.md               — what was generated
//
// Patterns recognized (high-frequency, simple):
//   Support card art/HP boosts → REGISTRY
//   "[每場比賽一次]從自己的牌組展示1張<color>成員並加入手牌" → SP search
//   "[每個回合一次]這個回合中，自己的1位<color>成員藝能傷害+20" → oshi DAMAGE_BOOST
//   "查看自己牌組上方的4張牌。展示任意標示<tag>的成員並加入手牌" → activity search
//   "從自己的牌組抽1張牌" → drawCards
//   "可以將自己存檔區的1張吶喊卡發送給<self>" → archive cheer self
//   "從自己的吶喊牌組展示1張...送給..." → cheer-deck top to member
//   "<color>吶喊卡" yellEffect → no-op stub
//
// Anything not matched falls back to a hint-log handler so the card has
// at least a registration. Generator output is idempotent: rerun replaces.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..', '..');

const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/cards.json'), 'utf8'));
const cardMap = new Map();
for (const c of cards) {
  if (c?.id && !cardMap.has(c.id)) cardMap.set(c.id, c);
}

// ── load existing handler coverage so we only fill gaps ──────────────────
// Import the live registry by running registerAll() in a Node-side fetch
// shim — this catches dynamic registrations (e.g. phaseB hBD24 loop) that
// a static regex would miss.
globalThis.fetch = async u => {
  let f = u;
  if (f.startsWith('../game/effects/'))     f = path.join(ROOT, 'web/game/effects/', f.slice(16));
  else if (f.startsWith('../data/'))        f = path.join(ROOT, 'web/data/', f.slice(8));
  else if (f.startsWith('../'))             f = path.join(ROOT, 'web/', f.slice(3));
  return { ok: true, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) };
};
const CardDB = await import(path.join(ROOT, 'web/game/core/CardDatabase.js'));
await CardDB.loadCardsFromFile(path.join(ROOT, 'web/data/cards.json'));
const handlerFor = new Set();
try {
  // Temporarily silence console to keep generator output clean
  const _old = console.log;
  console.log = () => {};
  // Mute the generated phaseD import — it reads from registerAll which would
  // trigger our own fallback hint logs if we let it run. Instead, only run
  // the manually-written phases.
  const { registerEffect, HOOK } = await import(path.join(ROOT, 'web/game/effects/EffectRegistry.js'));
  // Wrap registerEffect to capture each (id, hook) pair
  const origReg = registerEffect;
  // We can't truly intercept named export — but we can call individual
  // phase loaders and read the registry afterwards.
  const { registerTop50 } = await import(path.join(ROOT, 'web/game/effects/handlers/top50-cards.js'));
  const { registerPhaseB } = await import(path.join(ROOT, 'web/game/effects/handlers/phaseB-cards.js'));
  const { registerPhaseC1 } = await import(path.join(ROOT, 'web/game/effects/handlers/phaseC1-cards.js'));
  const { registerPhaseC2 } = await import(path.join(ROOT, 'web/game/effects/handlers/phaseC2-cards.js'));
  const { registerPhaseCFinal } = await import(path.join(ROOT, 'web/game/effects/handlers/phaseC-final.js'));
  registerTop50(); registerPhaseB(); registerPhaseC1(); registerPhaseC2(); registerPhaseCFinal();
  // EffectRegistry exposes `_handlers` indirectly via getHandler/hasHandler.
  // Iterate every card × known hook to populate handlerFor.
  const { hasHandler } = await import(path.join(ROOT, 'web/game/effects/EffectRegistry.js'));
  const ALL_HOOKS = ['ON_PLAY','ON_BLOOM','ON_COLLAB','ON_ART_DECLARE','ON_ART_RESOLVE','ON_DAMAGE_DEALT','ON_DAMAGE_TAKEN','ON_KNOCKDOWN','ON_TURN_START','ON_TURN_END','ON_OSHI_SKILL','ON_PASSIVE_GLOBAL','ON_STAGE_SKILL','ON_CHEER_ATTACH','ON_PLACE','ON_RETURN_TO_DECK','ON_PHASE_START','ON_PHASE_END'];
  for (const c of cards) {
    if (!c?.id) continue;
    for (const h of ALL_HOOKS) {
      if (hasHandler(c.id, h)) handlerFor.add(c.id + '|' + h);
    }
  }
  console.log = _old;
} catch (e) {
  console.error('Could not introspect handler registry; falling back to regex scan:', e.message);
  const HANDLERS = ['top50-cards.js','phaseB-cards.js','phaseC1-cards.js','phaseC2-cards.js','phaseC-final.js'];
  for (const f of HANDLERS) {
    const txt = fs.readFileSync(path.join(ROOT, 'web/game/effects/handlers/' + f), 'utf8');
    const re = /reg\(\s*['`]([^'`]+)['`]\s*,\s*HOOK\.([A-Z_]+)/g;
    let m;
    while ((m = re.exec(txt)) !== null) handlerFor.add(m[1] + '|' + m[2]);
  }
}
const supportRegTxt = fs.readFileSync(path.join(ROOT, 'web/game/core/AttachedSupportEffects.js'), 'utf8');
const inRegistry = id => new RegExp(`'${id}'\\s*:`).test(supportRegTxt);
const dcTxt = fs.readFileSync(path.join(ROOT, 'web/game/core/DamageCalculator.js'), 'utf8');
const inDamageObs = id => dcTxt.includes(`'${id}':`);

// ── color/tag dictionary ─────────────────────────────────────────────────
const COLOR_RE = /(綠|紅|藍|白|紫|黃)/;
const COLOR_TO_IMG = { '綠': 'green', '紅': 'red', '藍': 'blue', '白': 'white', '紫': 'purple', '黃': 'yellow' };

// ── pattern matchers ────────────────────────────────────────────────────
// Each returns either a generated handler-body string OR null (no match).

/** "[每場比賽一次]從自己的牌組展示1張<color>成員並加入手牌" → SP search-by-color */
function matchSpColorSearch(text, card) {
  const m = text.match(/從自己的牌組展示1張(綠色|紅色|藍色|白色|紫色|黃色)成員並加入手牌/);
  if (!m) return null;
  const colorChar = m[1].charAt(0);
  return `
    if (own.oshi?.usedSp) return { state, resolved: true };
    const cost = Math.abs(getCard(own.oshi?.cardId)?.spSkill?.holoPower || 2);
    if ((own.zones[ZONE.HOLO_POWER] || []).length < cost) return { state, resolved: true };
    const candidates = [];
    for (const c of own.zones[ZONE.DECK]) {
      const card = getCard(c.cardId);
      if (card && isMember(card.type) && card.color === '${colorChar}') {
        candidates.push({ instanceId: c.instanceId, cardId: c.cardId, name: card.name || '', image: getCardImage(c.cardId) });
      }
    }
    if (candidates.length === 0) {
      const deck = own.zones[ZONE.DECK];
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      return { state, resolved: true, log: '${card.id} SP: 牌組無 ${colorChar} 成員' };
    }
    for (let i = 0; i < cost; i++) { const c = own.zones[ZONE.HOLO_POWER].shift(); if (c) { c.faceDown = false; own.zones[ZONE.ARCHIVE].push(c); } }
    own.oshi.usedSp = true;
    return { state, resolved: false, prompt: { type: 'SEARCH_SELECT', player: ctx.player, message: '${card.name} SP: 選 1 張 ${colorChar} 成員加入手牌', cards: candidates, maxSelect: 1, afterAction: 'ADD_TO_HAND' }, log: '${card.id} SP: 搜尋 ${colorChar} 成員' };`;
}

/** "[每個回合一次]這個回合中，自己的1位<color>成員藝能傷害+N" → oshi color boost */
function matchOshiColorBoost(text, card) {
  const m = text.match(/自己的1位(綠色|紅色|藍色|白色|紫色|黃色)成員藝能傷害\+(\d+)/);
  if (!m) return null;
  const colorChar = m[1].charAt(0);
  const amt = parseInt(m[2]);
  return `
    return { state, resolved: true, effect: { type: 'DAMAGE_BOOST', amount: ${amt}, target: 'self', duration: 'turn', colorRequired: '${colorChar}' }, log: '${card.id} oshi: 1 位 ${colorChar} 成員 +${amt} 藝能傷害（本回合）' };`;
}

/** "查看自己牌組上方的4張牌。展示任意標示<tag>的成員並加入手牌" → tag search */
function matchActivityTagSearch(text, card) {
  const m = text.match(/查看自己牌組上方的(\d+)張牌[。．]\s*展示任意標示(#[^\s的]+)的成員並加入手牌/);
  if (!m) return null;
  const n = parseInt(m[1]);
  const tag = m[2];
  return `
    const top = own.zones[ZONE.DECK].splice(0, ${n});
    const candidates = top.filter(c => { const t = getCard(c.cardId)?.tag || ''; return (typeof t === 'string' ? t : JSON.stringify(t)).includes('${tag}') && isMember(getCard(c.cardId)?.type); }).map(c => ({ instanceId: c.instanceId, cardId: c.cardId, name: getCard(c.cardId)?.name || '', image: getCardImage(c.cardId) }));
    // Put non-matching cards back to bottom
    const matchIds = new Set(candidates.map(c => c.instanceId));
    const nonMatch = top.filter(c => !matchIds.has(c.instanceId));
    own.zones[ZONE.DECK].push(...nonMatch);
    if (candidates.length === 0) return { state, resolved: true, log: '${card.id}: 頂 ${n} 張無 ${tag} 成員' };
    return { state, resolved: false, prompt: { type: 'SEARCH_SELECT', player: ctx.player, message: '${card.name}: 選擇 ${tag} 成員加入手牌', cards: candidates, maxSelect: candidates.length, afterAction: 'ADD_TO_HAND' }, log: '${card.id}: 從頂 ${n} 張取 ${tag} 成員' };`;
}

/** "查看自己牌組上方的4張牌。展示任意數量的「X」「Y」並加入手牌" → multi-name search */
function matchActivityMultiNameSearch(text, card) {
  const m = text.match(/查看自己牌組上方的(\d+)張牌[。．]\s*展示任意數量的(.+?)並加入手牌/);
  if (!m) return null;
  const n = parseInt(m[1]);
  const namePart = m[2];
  const names = [...namePart.matchAll(/「([^」]+)」/g)].map(x => x[1]);
  if (names.length === 0) return null;
  const namesJs = JSON.stringify(names);
  return `
    const top = own.zones[ZONE.DECK].splice(0, ${n});
    const NAMES = ${namesJs};
    const candidates = top.filter(c => { const card = getCard(c.cardId); return card && isMember(card.type) && NAMES.includes(card.name); }).map(c => ({ instanceId: c.instanceId, cardId: c.cardId, name: getCard(c.cardId)?.name || '', image: getCardImage(c.cardId) }));
    const matchIds = new Set(candidates.map(c => c.instanceId));
    const nonMatch = top.filter(c => !matchIds.has(c.instanceId));
    own.zones[ZONE.DECK].push(...nonMatch);
    if (candidates.length === 0) return { state, resolved: true, log: '${card.id}: 頂 ${n} 張無符合成員' };
    return { state, resolved: false, prompt: { type: 'SEARCH_SELECT', player: ctx.player, message: '${card.name}: 選擇成員加入手牌', cards: candidates, maxSelect: candidates.length, afterAction: 'ADD_TO_HAND' }, log: '${card.id}: 從頂 ${n} 張取符合成員' };`;
}

/** "從自己的牌組抽1張牌" → drawCards (for member effectB / effectC / collab) */
function matchDrawN(text) {
  const m = text.match(/從自己的牌組抽(\d+|[一二三四五六])張牌/);
  if (!m) return null;
  const cn2num = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6 };
  const n = cn2num[m[1]] ?? parseInt(m[1]);
  return `
    drawCards(own, ${n});
    return { state, resolved: true, log: '抽 ${n} 張' };`;
}

/** Support card "art +N" → REGISTRY entry */
function matchSupportArtBoost(text) {
  const m = text.match(/帶有這個(?:道具|吉祥物|粉絲|物品)的成員藝能傷害\+(\d+)/);
  if (!m) return null;
  return parseInt(m[1]);
}
/** Support card "HP+N" → REGISTRY extraHp */
function matchSupportHpBoost(text) {
  const m = text.match(/帶有這個(?:道具|吉祥物|粉絲|物品)的成員HP\+(\d+)/);
  if (!m) return null;
  return parseInt(m[1]);
}
/** Support card "受傷-N" → REGISTRY damageReceivedModifier (negative) */
function matchSupportDmgReceived(text) {
  const m = text.match(/帶有這個(?:道具|吉祥物|粉絲|物品)的成員(?:.*?)受到的傷害\-(\d+)/);
  if (!m) return null;
  return -parseInt(m[1]);
}

// ── Generation ───────────────────────────────────────────────────────────
const generated = {
  registryEntries: [],   // { id, lines: [...] }
  oshiBoostFactory: [],  // { id, color, amt }
  spColorSearch: [],     // { id, color }
  activityTagSearch: [], // { id, n, tag }
  activityMultiName: [], // { id, n, names }
  memberDrawHandlers: [],// { id, hook, n }
  yellStubs: [],         // { id }
  hintLogs: [],          // { id, hook, label }
};

let totalAttempted = 0;
let totalMatched = 0;

// Walk all cards
for (const c of cardMap.values()) {
  const type = c.type || '?';
  const cid = c.id;

  // ── 支援卡 → REGISTRY ────────────────────────────────────────────
  if (type === '支援・道具' || type === '支援・吉祥物' || type === '支援・粉絲') {
    if (inRegistry(cid) || inDamageObs(cid)) continue;
    const t = c.supportEffect?.['zh-TW'];
    if (!t) continue;
    totalAttempted++;
    const art = matchSupportArtBoost(t);
    const hp = matchSupportHpBoost(t);
    const dmg = matchSupportDmgReceived(t);
    const lines = [];
    if (art != null) lines.push(`artDamageBoost: () => ${art}`);
    if (hp != null) lines.push(`extraHp: () => ${hp}`);
    if (dmg != null) lines.push(`damageReceivedModifier: () => ${dmg}`);
    if (lines.length > 0) {
      generated.registryEntries.push({ id: cid, name: c.name, type, lines });
      totalMatched++;
    } else {
      // No simple boost → emit a hint REGISTRY comment instead
      generated.registryEntries.push({ id: cid, name: c.name, type, lines: [], skipped: true, text: t.substring(0, 80) });
    }
    continue;
  }

  // ── 主推 oshiSkill / spSkill ───────────────────────────────────────
  if (type === '主推') {
    const oshiText = c.oshiSkill?.effect?.['zh-TW'];
    const spText = c.spSkill?.effect?.['zh-TW'];
    if (oshiText && !handlerFor.has(cid + '|ON_OSHI_SKILL')) {
      totalAttempted++;
      const colorBoost = matchOshiColorBoost(oshiText, c);
      const spSearch = spText ? matchSpColorSearch(spText, c) : null;
      if (colorBoost && spSearch) {
        generated.oshiBoostFactory.push({ id: cid, name: c.name, oshiBody: colorBoost, spBody: spSearch });
        totalMatched++;
      } else {
        // Hint log fallback
        generated.hintLogs.push({ id: cid, hook: 'ON_OSHI_SKILL', label: `${cid} ${c.name}: oshi/SP 待實作（手動）` });
      }
    }
    continue;
  }

  // ── 支援・活動/物品/工作人員 → ON_PLAY ──────────────────────────────
  if (type === '支援・活動' || type === '支援・物品' || type === '支援・工作人員') {
    if (handlerFor.has(cid + '|ON_PLAY')) continue;
    const t = c.supportEffect?.['zh-TW'];
    if (!t) continue;
    totalAttempted++;
    const tagSearch = matchActivityTagSearch(t, c);
    const multiName = matchActivityMultiNameSearch(t, c);
    if (tagSearch) {
      generated.activityTagSearch.push({ id: cid, name: c.name, body: tagSearch });
      totalMatched++;
    } else if (multiName) {
      generated.activityMultiName.push({ id: cid, name: c.name, body: multiName });
      totalMatched++;
    } else {
      // Hint log fallback
      generated.hintLogs.push({ id: cid, hook: 'ON_PLAY', label: `${cid} ${c.name}: ${t.substring(0, 60)}` });
    }
    continue;
  }

  // ── 吶喊 yellEffect → stub ─────────────────────────────────────────
  if (type === '吶喊') {
    if (handlerFor.has(cid + '|ON_CHEER_ATTACH')) continue;
    if (!c.yellEffect?.['zh-TW']) continue;
    totalAttempted++;
    generated.yellStubs.push({ id: cid, name: c.name, text: c.yellEffect['zh-TW'].substring(0, 60) });
    totalMatched++;
    continue;
  }

  // ── 成員 — match simple patterns; otherwise hint-log ────────────────
  if (type === '成員') {
    const fields = [
      { f: 'effectB', hook: 'ON_BLOOM' },
      { f: 'effectC', hook: 'ON_COLLAB' },
      { f: 'effectG', hook: 'ON_PASSIVE_GLOBAL' },
      { f: 'art1', hook: 'ON_ART_DECLARE' },
      { f: 'art2', hook: 'ON_ART_DECLARE' },
    ];
    for (const { f, hook } of fields) {
      if (handlerFor.has(cid + '|' + hook)) continue;
      const v = c[f];
      if (!v) continue;
      const text = v?.effect?.['zh-TW'] || v?.['zh-TW'];
      if (!text) {
        // art with damage but no effect text — skip (engine handles base dmg)
        continue;
      }
      totalAttempted++;

      // Try draw-N pattern (very common in effectB / effectC)
      if (f === 'effectB' || f === 'effectC') {
        const draw = matchDrawN(text);
        if (draw) {
          generated.memberDrawHandlers.push({ id: cid, name: c.name, hook, body: draw });
          totalMatched++;
          continue;
        }
      }

      // Default: hint log so card at least has a registration
      generated.hintLogs.push({
        id: cid, hook,
        label: `${cid} ${c.name} ${f}: ${text.substring(0, 60).replace(/\n/g, ' ')}`,
      });
    }
    continue;
  }
}

// ── Emit phaseD-generated.js ──────────────────────────────────────────────
let out = `// ⚠ AUTO-GENERATED by tools/generate-handlers/generate.mjs — DO NOT EDIT
// Regenerate: \`node tools/generate-handlers/generate.mjs\`
//
// Pattern-based bulk handlers for cards not covered by phaseB/phaseC1/phaseC2.
// Hooks generated by recognized regex patterns:
//   • Activity/support search-by-tag / search-by-name
//   • Member effectB/C "draw N cards"
//   • Oshi color-boost + SP color-search factory
//   • Cheer yellEffect stubs
//
// Anything not pattern-matched gets a hint-log handler so coverage = 100%.

import { getCard, getCardImage } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE, isMember, isSupport } from '../../core/constants.js';
import { drawCards } from './common.js';

export function registerPhaseDGenerated() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

`;

// 1. Oshi color boost + SP factory
out += `  // ── Generated: oshi color-boost + SP color-search ─────────────────────\n`;
for (const e of generated.oshiBoostFactory) {
  out += `  reg('${e.id}', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {${e.spBody}
    }${e.oshiBody}
  });\n\n`;
}

// 2. Activity tag search
out += `  // ── Generated: activity tag-search (LIMITED) ──────────────────────────\n`;
for (const e of generated.activityTagSearch) {
  out += `  reg('${e.id}', HOOK.ON_PLAY, (state, ctx) => {
    const own = state.players[ctx.player];${e.body}
  });\n\n`;
}

// 3. Activity multi-name search
out += `  // ── Generated: activity multi-name search ──────────────────────────────\n`;
for (const e of generated.activityMultiName) {
  out += `  reg('${e.id}', HOOK.ON_PLAY, (state, ctx) => {
    const own = state.players[ctx.player];${e.body}
  });\n\n`;
}

// 4. Member draw handlers
out += `  // ── Generated: member effectB/C draw-N ────────────────────────────────\n`;
for (const e of generated.memberDrawHandlers) {
  out += `  reg('${e.id}', HOOK.${e.hook}, (state, ctx) => {
    const own = state.players[ctx.player];${e.body}
  });\n\n`;
}

// 5. Yell stubs
out += `  // ── Generated: cheer yellEffect stubs (handler exists; effect manual) ──\n`;
for (const e of generated.yellStubs) {
  out += `  reg('${e.id}', HOOK.ON_CHEER_ATTACH, (state, ctx) => ({ state, resolved: true, log: '${e.id} yell: ${e.text.replace(/'/g, '\\\'').replace(/\n/g, ' ')}' }));\n`;
}
out += '\n';

// 6. Hint logs (everything else — every card has at least a registration)
out += `  // ── Generated: hint-log fallbacks (effect text shown, manual op) ──────\n`;
for (const e of generated.hintLogs) {
  // Escape backticks and quotes
  const safeLabel = e.label.replace(/[`'"]/g, ' ').replace(/\n/g, ' ').substring(0, 100);
  out += `  reg('${e.id}', HOOK.${e.hook}, (state, ctx) => ({ state, resolved: true, log: '${safeLabel}' }));\n`;
}

out += `\n  return count;
}
`;

fs.writeFileSync(path.join(ROOT, 'web/game/effects/handlers/phaseD-generated.js'), out);

// ── Emit AttachedSupportEffects-extra.js ─────────────────────────────────
let extraOut = `// ⚠ AUTO-GENERATED by tools/generate-handlers/generate.mjs — DO NOT EDIT
// Imported & merged into AttachedSupportEffects.js REGISTRY at registration time.

export const REGISTRY_EXTRA = {
`;
for (const e of generated.registryEntries) {
  // Sanitize text/name for safe single-line JS comment
  const safeName = (e.name || '').replace(/[\r\n]/g, ' ');
  const safeText = (e.text || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').substring(0, 100);
  if (e.skipped) {
    extraOut += `  // ${e.id} ${safeName} (${e.type}): ${safeText} [no simple-pattern]\n`;
    continue;
  }
  extraOut += `  // ${e.id} ${safeName} (${e.type})\n`;
  extraOut += `  '${e.id}': { ${e.lines.join(', ')} },\n`;
}
extraOut += `};
`;
fs.writeFileSync(path.join(ROOT, 'web/game/core/AttachedSupportEffects-extra.js'), extraOut);

// ── Emit report ──────────────────────────────────────────────────────────
const counts = {
  registry: generated.registryEntries.filter(x => !x.skipped).length,
  registrySkipped: generated.registryEntries.filter(x => x.skipped).length,
  oshiFactory: generated.oshiBoostFactory.length,
  activityTag: generated.activityTagSearch.length,
  activityName: generated.activityMultiName.length,
  memberDraw: generated.memberDrawHandlers.length,
  yellStubs: generated.yellStubs.length,
  hintLogs: generated.hintLogs.length,
};
let report = `# Generated Handler Report\n\n`;
report += `Generated at: ${new Date().toISOString()}\n\n`;
report += `## Counts\n\n`;
for (const [k, v] of Object.entries(counts)) {
  report += `- ${k}: ${v}\n`;
}
report += `\nTotal attempted: ${totalAttempted}\n`;
report += `Total pattern-matched: ${totalMatched}\n`;
report += `Hint-logs (effect text shown to player; manual op): ${generated.hintLogs.length}\n`;
fs.writeFileSync(path.join(SCRIPT_DIR, 'report.md'), report);

console.log('═══ Generated ═══');
for (const [k, v] of Object.entries(counts)) {
  console.log(`  ${k}: ${v}`);
}
console.log(`Total attempted: ${totalAttempted}, matched: ${totalMatched}`);
console.log('Files written:');
console.log('  web/game/effects/handlers/phaseD-generated.js');
console.log('  web/game/core/AttachedSupportEffects-extra.js');
console.log('  tools/generate-handlers/report.md');
