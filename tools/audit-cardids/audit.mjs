#!/usr/bin/env node
// Card-id integrity audit. Cross-checks every reg(cardId, HOOK) call site in
// the handler files against the canonical web/data/cards.json database.
//
// Detects three classes of mistake that crept into the original phaseC2
// dump (where the author worked from a different / fabricated card list):
//
//   A. NotInDB        — cardId does not exist in cards.json (ghost ID)
//   B. HookTypeMismatch — hook implies a member context but card is support
//                         (e.g. ON_BLOOM/ON_COLLAB/ON_ART_DECLARE registered
//                         on a 支援・* cardId — never fires)
//   C. CommentNameDrift — `// hBPxx-xxx CARDNAME ...` comment claims a name
//                         that doesn't match the card's actual name in cards.json
//                         (e.g. "ラプラス" comment on a まつり card)
//
// Some legitimate patterns are explicitly whitelisted:
//   • I-2 attached_support_wearer_knocked broadcast: 4 fan cards register
//     ON_KNOCKDOWN keyed on the support's cardId (engine fires that exact
//     hook for each attached support on KO). These are NOT type-mismatches.
//
// Exit codes:
//   0 — clean (or only whitelisted findings)
//   1 — at least one un-whitelisted issue
//
// Run from the repo root:
//   node tools/audit-cardids/audit.mjs
//
// CI: wire into a pre-commit / pre-push hook to block ghost-ID regressions.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..', '..');

const HANDLER_FILES = [
  'web/game/effects/handlers/top50-cards.js',
  'web/game/effects/handlers/phaseB-cards.js',
  'web/game/effects/handlers/phaseC1-cards.js',
  'web/game/effects/handlers/phaseC2-cards.js',
  'web/game/effects/handlers/phaseC-final.js',
];

const MEMBER_ONLY_HOOKS = new Set([
  // These hooks fire for the cardId of a stage MEMBER (or attacker / killed
  // member). Registering them on a support cardId means they never fire.
  'ON_BLOOM',
  'ON_COLLAB',
  'ON_ART_DECLARE',
  'ON_ART_RESOLVE',
  'ON_KNOCKDOWN',
  'ON_DAMAGE_DEALT',
  'ON_DAMAGE_TAKEN',
  'ON_PASSIVE_GLOBAL',
  'ON_PHASE_START',
  'ON_PHASE_END',
  'ON_RETURN_TO_DECK',
  'ON_PLACE',
]);

const OSHI_ONLY_HOOKS = new Set(['ON_OSHI_SKILL']);

// Whitelist: legitimate (cardId, hook) pairs where a support card receives
// a member-only hook through an explicit engine broadcast or design intent.
// Add a comment explaining the source. NEVER add to suppress real bugs.
const WHITELIST = new Set([
  // I-2: GameEngine.processKnockdown fires ON_KNOCKDOWN with
  // triggerEvent='attached_support_wearer_knocked' once per unique support
  // cardId attached to the killed member. The handler key IS the support id.
  'hBP01-124|ON_KNOCKDOWN',  // 開拓者
  'hBP03-109|ON_KNOCKDOWN',  // Ruffians
  'hBP03-112|ON_KNOCKDOWN',  // わためいと
  'hBP06-104|ON_KNOCKDOWN',  // スバ友
]);

// ─────────────────────────────────────────────────────────────────────────
// Load DB
const cardsPath = path.join(ROOT, 'web/data/cards.json');
const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
const cardMap = new Map();
for (const c of cards) {
  if (c?.id && !cardMap.has(c.id)) cardMap.set(c.id, c);
}

// ─────────────────────────────────────────────────────────────────────────
// Walk handler files
const findings = { notInDB: [], hookMismatch: [], commentDrift: [] };

for (const relPath of HANDLER_FILES) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) continue;
  const txt = fs.readFileSync(fullPath, 'utf8');
  const lines = txt.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/reg\(\s*['`"]([^'`"]+)['`"]\s*,\s*HOOK\.([A-Z_]+)/);
    if (!m) continue;
    const cardId = m[1];
    const hook = m[2];
    const card = cardMap.get(cardId);

    if (!card) {
      findings.notInDB.push({ file: relPath, line: i + 1, cardId, hook });
      continue;
    }

    const type = card.type || '';
    const isMember = type === '成員';
    const isOshi = type === '主推';
    const isSupport = type.startsWith('支援');
    const wlKey = `${cardId}|${hook}`;
    const whitelisted = WHITELIST.has(wlKey);

    if (!whitelisted) {
      if (MEMBER_ONLY_HOOKS.has(hook) && !isMember) {
        findings.hookMismatch.push({
          file: relPath, line: i + 1, cardId, hook,
          actualType: type, name: card.name || '',
        });
      } else if (OSHI_ONLY_HOOKS.has(hook) && !isOshi && !isMember) {
        // ON_OSHI_SKILL fires for the player's oshi.cardId. Member cards
        // can register here too because the engine fires reactive_*
        // ON_OSHI_SKILL events keyed on the player's oshi (skipped here).
        findings.hookMismatch.push({
          file: relPath, line: i + 1, cardId, hook,
          actualType: type, name: card.name || '',
        });
      }
    }

    // Comment drift: scan a few preceding lines for `// hBPxx-xxx NAME ...`
    for (let j = Math.max(0, i - 3); j < i; j++) {
      const prev = lines[j];
      // Match: optional whitespace + // + (id) + (chunk that looks like a name)
      const cm = prev.match(/\/\/.*?\b([a-zA-Z]{2,4}\d+-\d{3,})\b\s+([^\s/]+)/);
      if (!cm || cm[1] !== cardId) continue;
      const claimed = cm[2].trim();
      const real = (card.name || '').trim();
      if (!claimed || !real) break;

      // Reject obvious structural words / ASCII tags from triggering this
      const noise = /^(effect[A-Z]?|art\d+|oshi|sp|tool|mascot|fan|support|REMOVED|REGISTRY|skill|effect|see|via|was|has|the|a|an|is|in|of|on|to)$/i;
      if (noise.test(claimed)) break;
      if (claimed.length < 2 || claimed.length > 30) break;
      // ASCII-only without Unicode letters → likely English, skip
      if (!/[぀-ゟ゠-ヿ一-鿿]/.test(claimed)) break;

      const claimedNorm = claimed.replace(/[・\.]/g, '');
      const realNorm = real.replace(/[・\.]/g, '');
      if (!realNorm.includes(claimedNorm) && !claimedNorm.includes(realNorm)) {
        findings.commentDrift.push({
          file: relPath, line: i + 1, cardId,
          claimed, real, type,
        });
      }
      break;
    }
  }
}

// Dedupe commentDrift on (file, cardId)
{
  const seen = new Set();
  findings.commentDrift = findings.commentDrift.filter(x => {
    const k = `${x.file}|${x.cardId}|${x.claimed}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Report
const totalProblems =
  findings.notInDB.length +
  findings.hookMismatch.length +
  findings.commentDrift.length;

const W = (s) => process.stdout.write(s);

W('═'.repeat(72) + '\n');
W('  Card-ID Integrity Audit\n');
W('═'.repeat(72) + '\n\n');

W(`scanned files: ${HANDLER_FILES.length}\n`);
W(`cards in DB:   ${cardMap.size}\n`);
W(`whitelist:     ${WHITELIST.size}\n`);
W('\n');

W('─── A. cardId NOT in cards.json (ghost IDs) ───\n');
W(`count: ${findings.notInDB.length}\n`);
for (const x of findings.notInDB) {
  W(`  ✗ ${x.file}:${x.line}  ${x.cardId} (${x.hook})\n`);
}
W('\n');

W('─── B. hook ↔ card-type mismatch (would never fire) ───\n');
W(`count: ${findings.hookMismatch.length}\n`);
for (const x of findings.hookMismatch) {
  W(`  ✗ ${x.file}:${x.line}  ${x.cardId} ${x.name} (${x.actualType}) ← ${x.hook}\n`);
}
W('\n');

W('─── C. comment "// id NAME" vs DB.name drift ───\n');
W(`count: ${findings.commentDrift.length}\n`);
for (const x of findings.commentDrift) {
  W(`  ✗ ${x.file}:${x.line}  ${x.cardId} (${x.type})\n`);
  W(`         comment claims: "${x.claimed}"\n`);
  W(`         DB says:        "${x.real}"\n`);
}
W('\n');

W('═'.repeat(72) + '\n');
if (totalProblems === 0) {
  W('  ✓ CLEAN — no card-id issues detected\n');
  W('═'.repeat(72) + '\n');
  process.exit(0);
} else {
  W(`  ✗ ${totalProblems} issue(s) found\n`);
  W('═'.repeat(72) + '\n');
  process.exit(1);
}
