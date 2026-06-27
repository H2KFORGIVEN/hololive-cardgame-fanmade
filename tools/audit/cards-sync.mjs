#!/usr/bin/env node
// Phase 4.3 — cards.json sync detector.
//
// Walks cards.json and produces (cardId, hook, textHash) tuples for every
// card with effect text. Compares against tools/audit/cards-baseline.json:
//   • new cards with effect text but no entry → ADDED (need handler)
//   • cards with same id but changed textHash → TEXT-CHANGED (review handler)
//   • cards no longer present (deleted) → REMOVED (handlers may be stale)
//
// Usage:
//   node tools/audit/cards-sync.mjs              # diff mode (default)
//   node tools/audit/cards-sync.mjs --snapshot   # write fresh baseline
//   node tools/audit/cards-sync.mjs --json       # emit JSON to stdout

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const CARDS_PATH = path.join(ROOT, 'web/data/cards.json');
const SNAPSHOT_PATH = path.join(__dirname, 'cards-baseline.json');

const args = new Set(process.argv.slice(2));
const isSnapshot = args.has('--snapshot');
const isJson = args.has('--json');

// ─── Build current card-effect tuples ───────────────────────────────
const cards = JSON.parse(fs.readFileSync(CARDS_PATH, 'utf8'));

// Each card may have effect text under several fields. We record the
// (cardId, hook, hash) triplet for every effect on every card. The hash
// is a SHA1 of the literal zh-TW text.
const HOOKS = [
  { field: 'effectB',   hook: 'ON_BLOOM' },
  { field: 'effectC',   hook: 'ON_COLLAB' },
  { field: 'effectG',   hook: 'ON_PASSIVE_GLOBAL' },
  { field: 'art1',      hook: 'ON_ART_DECLARE_art1' },
  { field: 'art2',      hook: 'ON_ART_DECLARE_art2' },
  { field: 'oshiSkill', hook: 'ON_OSHI_SKILL_oshi' },
  { field: 'spSkill',   hook: 'ON_OSHI_SKILL_sp' },
];

function effectText(field) {
  if (!field) return null;
  if (typeof field === 'string') return field;
  if (typeof field === 'object') {
    if (field.effect && typeof field.effect === 'object') {
      return field.effect['zh-TW'] || field.effect.ja || field.effect.en || null;
    }
    if (field['zh-TW']) return field['zh-TW'];
  }
  return null;
}

function shortHash(s) {
  return crypto.createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 12);
}

const seen = new Set();
const tuples = [];
for (const c of cards) {
  if (!c.id || seen.has(c.id)) continue;
  seen.add(c.id);
  for (const { field, hook } of HOOKS) {
    const text = effectText(c[field]);
    if (!text) continue;
    tuples.push({
      cardId: c.id,
      name: c.name || '',
      hook,
      hash: shortHash(text),
      text: text.slice(0, 80),
    });
  }
}

const current = {
  generatedAt: new Date().toISOString(),
  totalCards: seen.size,
  totalEffects: tuples.length,
  tuples: tuples.sort((a, b) => a.cardId.localeCompare(b.cardId) || a.hook.localeCompare(b.hook)),
};

if (isSnapshot) {
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(current, null, 2));
  console.log(`Snapshot written: ${SNAPSHOT_PATH}`);
  console.log(`  cards=${current.totalCards}  effects=${current.totalEffects}`);
  process.exit(0);
}

if (isJson) {
  console.log(JSON.stringify(current, null, 2));
  process.exit(0);
}

// ─── Diff against baseline ───────────────────────────────────────────
if (!fs.existsSync(SNAPSHOT_PATH)) {
  console.error('No baseline. Run with --snapshot to create one.');
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));

const baselineMap = new Map(baseline.tuples.map(t => [`${t.cardId}|${t.hook}`, t]));
const currentMap = new Map(current.tuples.map(t => [`${t.cardId}|${t.hook}`, t]));

const added = [];
const removed = [];
const changed = [];

for (const [key, t] of currentMap) {
  const prior = baselineMap.get(key);
  if (!prior) added.push(t);
  else if (prior.hash !== t.hash) changed.push({ ...t, oldHash: prior.hash, oldText: prior.text });
}
for (const [key, t] of baselineMap) {
  if (!currentMap.has(key)) removed.push(t);
}

console.log(`\n=== Cards.json sync diff ===`);
console.log(`Baseline: ${baseline.totalCards} cards, ${baseline.totalEffects} effects @ ${baseline.generatedAt}`);
console.log(`Current : ${current.totalCards} cards, ${current.totalEffects} effects`);
console.log('');
console.log(`  ADDED         : ${added.length}`);
console.log(`  TEXT-CHANGED  : ${changed.length}`);
console.log(`  REMOVED       : ${removed.length}`);

if (added.length > 0) {
  console.log('\n──── ADDED (new effects since snapshot — may need handlers) ────');
  added.slice(0, 30).forEach(t => console.log(`  + ${t.cardId} | ${t.hook} | ${t.name} | ${t.text}`));
  if (added.length > 30) console.log(`  ... and ${added.length - 30} more`);
}
if (changed.length > 0) {
  console.log('\n──── TEXT-CHANGED (handler may need re-review) ────');
  changed.slice(0, 30).forEach(t => console.log(`  ~ ${t.cardId} | ${t.hook} | ${t.name}\n      old: ${t.oldText}\n      new: ${t.text}`));
  if (changed.length > 30) console.log(`  ... and ${changed.length - 30} more`);
}
if (removed.length > 0) {
  console.log('\n──── REMOVED (effect text gone — handlers may be stale) ────');
  removed.slice(0, 30).forEach(t => console.log(`  - ${t.cardId} | ${t.hook} | ${t.name} | ${t.text}`));
  if (removed.length > 30) console.log(`  ... and ${removed.length - 30} more`);
}

if (added.length === 0 && changed.length === 0 && removed.length === 0) {
  console.log('\n✓ No cards.json changes since baseline.');
}

process.exit(0);
