#!/usr/bin/env node
// Phase 1.1 — Comprehensive effect-handler coverage audit (v3).
//
// Walks every handler file, extracts every reg() call across five
// registration patterns, compares the handler body against the card's
// real zh-TW effect text, and classifies each entry into one of:
//
//   CORRECT-VERIFIED       — handler logic matches text on action / number / target / condition
//   CORRECT-AUTO-NO-AMBIGUITY — auto-resolve safe (1 candidate)
//   AUTO-PICK-BUG          — text says "選擇" but handler .find/[0] auto-picks
//   CONDITION-MISSING      — text has 「如果/時，/若/在...時」 but handler has no if
//   NUMBER-MISMATCH        — text says draw/dmg N, handler does M
//   TARGET-WRONG-SIDE      — text says opp but handler operates on own (or vice versa)
//   COST-IGNORED           — text has 「可以將 X 存檔: ...」 but handler skips cost
//   MULTI-STEP-MISSING     — text has「之後...」chain but handler only does step 1
//   RULE-MOD               — text modifies rules (first-turn bloom, etc.) — needs engine support
//   STUB-LOG               — handler returns log only (engine upgrades to MANUAL_EFFECT — safe)
//   DISABLED-FALLTHROUGH   — handler returns { state } → MANUAL_EFFECT (intentional)
//   NO-TEXT                — that hook has no effect text → safe no-op
//   PASSIVE-INTENT         — passive effectG / yellEffect description, intentional
//   UNCLASSIFIED           — heuristic could not classify
//
// Output:
//   /tmp/effect-coverage.json   — structured data for downstream scripts
//   stdout                       — summary table by category, by file, by hook
//
// Usage:
//   node tools/audit/effect-coverage.mjs
//   node tools/audit/effect-coverage.mjs --baseline   # write baseline.json
//   node tools/audit/effect-coverage.mjs --diff       # diff against baseline.json

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const cardsPath = path.join(REPO_ROOT, 'web', 'data', 'cards.json');
const handlerDir = path.join(REPO_ROOT, 'web', 'game', 'effects', 'handlers');
const outputPath = '/tmp/effect-coverage.json';
const baselinePath = path.join(__dirname, 'baseline.json');

// ─── Load card data ────────────────────────────────────────────────────────
const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
const cardById = new Map(cards.map(c => [c.id, c]));

function tw(e) {
  if (!e) return '';
  if (typeof e === 'string') return e;
  return e['zh-TW'] || e.zh_tw || e.zh || e.ja || e.en || '';
}

function realTextFor(card, hook) {
  if (!card) return '';
  switch (hook) {
    case 'ON_BLOOM':       return tw(card.effectB?.effect);
    case 'ON_COLLAB':      return tw(card.effectC?.effect);
    case 'ON_PLAY':        return tw(card.supportEffect);
    case 'ON_OSHI_SKILL':  return [tw(card.oshiSkill?.effect), tw(card.spSkill?.effect) ? 'SP:'+tw(card.spSkill.effect) : ''].filter(Boolean).join(' ||| ');
    case 'ON_PASSIVE_GLOBAL': return tw(card.effectG?.effect);
    case 'ON_STAGE_SKILL': return tw(card.stageSkill?.effect);
    case 'ON_CHEER_ATTACH': return tw(card.yellEffect);
    case 'ON_ART_DECLARE':
    case 'ON_ART_RESOLVE': {
      const a1 = card.art1 ? `[${card.art1.name||'art1'}] ${tw(card.art1.effect)}` : '';
      const a2 = card.art2 ? `[${card.art2.name||'art2'}] ${tw(card.art2.effect)}` : '';
      return [a1, a2].filter(Boolean).join(' ||| ');
    }
    default: return '';
  }
}

// ─── Brace / paren walker ───────────────────────────────────────────────────
function walkBlock(src, openIdx) {
  // Walks a `{...}` or `(...)` from openIdx (the opening char).
  const open = src[openIdx];
  const close = open === '{' ? '}' : open === '(' ? ')' : open === '[' ? ']' : null;
  if (!close) return openIdx;
  let depth = 1, i = openIdx + 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === open) depth++;
    else if (ch === close) depth--;
    i++;
  }
  return i; // points just past the closing
}

// Walk past arrow body (no opening brace). Stops at matching ), ], or ;
// while respecting nested ( [ { strings and template literals.
function walkArrowBody(src, startIdx) {
  let i = startIdx;
  let pDepth = 0, bDepth = 0, cDepth = 0;
  let inStr = null;
  while (i < src.length) {
    const ch = src[i];
    if (inStr) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === inStr) inStr = null;
      i++; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; i++; continue; }
    if (ch === '(') pDepth++;
    else if (ch === ')') {
      if (pDepth === 0) break;
      pDepth--;
    } else if (ch === '[') bDepth++;
    else if (ch === ']') {
      if (bDepth === 0) break;
      bDepth--;
    } else if (ch === '{') cDepth++;
    else if (ch === '}') {
      if (cDepth === 0) break;
      cDepth--;
    } else if (ch === ',' && pDepth === 0 && bDepth === 0 && cDepth === 0) break;
    else if (ch === ';' && pDepth === 0 && bDepth === 0 && cDepth === 0) break;
    i++;
  }
  return i;
}

// ─── Extract handlers from one file ────────────────────────────────────────
function extractFromFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  const entries = [];

  // Pattern A: direct reg('id', HOOK.X, (...) => ...)
  {
    const re = /(?<![\w.])reg(?:isterEffect)?\(\s*['"]([^'"]+)['"],\s*HOOK\.([A-Z_]+),\s*\(([^)]*)\)\s*=>\s*/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const id = m[1], hook = m[2];
      const startIdx = m.index + m[0].length;
      const lineNum = src.slice(0, m.index).split('\n').length;
      let body, endIdx;
      if (src[startIdx] === '{') {
        endIdx = walkBlock(src, startIdx);
        body = src.slice(startIdx + 1, endIdx - 1);
      } else if (src[startIdx] === '(') {
        // expression-bodied wrapped in parens: (s,c) => ({...})
        endIdx = walkBlock(src, startIdx);
        body = src.slice(startIdx + 1, endIdx - 1);
      } else {
        endIdx = walkArrowBody(src, startIdx);
        body = src.slice(startIdx, endIdx);
      }
      entries.push({ file: fileName, line: lineNum, id, hook, body, kind: 'direct' });
    }
  }

  // Pattern B: bulk array entry ['id', HOOK.X, (...) => ...]
  {
    const re = /\[\s*['"]([^'"]+)['"]\s*,\s*HOOK\.([A-Z_]+)\s*,\s*\(([^)]*)\)\s*=>\s*/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const id = m[1], hook = m[2];
      const startIdx = m.index + m[0].length;
      const lineNum = src.slice(0, m.index).split('\n').length;
      let body, endIdx;
      if (src[startIdx] === '{') {
        endIdx = walkBlock(src, startIdx);
        body = src.slice(startIdx + 1, endIdx - 1);
      } else if (src[startIdx] === '(') {
        endIdx = walkBlock(src, startIdx);
        body = src.slice(startIdx + 1, endIdx - 1);
      } else {
        endIdx = walkArrowBody(src, startIdx);
        body = src.slice(startIdx, endIdx);
      }
      entries.push({ file: fileName, line: lineNum, id, hook, body, kind: 'bulk-hook' });
    }
  }

  // Pattern C: bulk array hook inferred from for-loop
  {
    const arrRe = /const\s+(\w+)\s*=\s*\[([\s\S]*?)\];\s*[\n\r]+\s*for\s*\(\s*const\s*\[\s*id\s*,\s*fn\s*\]\s*of\s+\1\s*\)\s*\{\s*reg(?:isterEffect)?\s*\(\s*id\s*,\s*HOOK\.([A-Z_]+)/gm;
    let mm;
    while ((mm = arrRe.exec(src)) !== null) {
      const arrayBody = mm[2], hook = mm[3];
      const arrayStart = mm.index;
      const entryRe = /\[\s*['"]([^'"]+)['"]\s*,\s*\(([^)]*)\)\s*=>\s*/g;
      let em;
      while ((em = entryRe.exec(arrayBody)) !== null) {
        const id = em[1];
        const localStart = em.index + em[0].length;
        let body, endIdx;
        if (arrayBody[localStart] === '{') {
          endIdx = walkBlock(arrayBody, localStart);
          body = arrayBody.slice(localStart + 1, endIdx - 1);
        } else if (arrayBody[localStart] === '(') {
          endIdx = walkBlock(arrayBody, localStart);
          body = arrayBody.slice(localStart + 1, endIdx - 1);
        } else {
          endIdx = walkArrowBody(arrayBody, localStart);
          body = arrayBody.slice(localStart, endIdx);
        }
        const lineNum = src.slice(0, arrayStart + arrayBody.indexOf(em[0])).split('\n').length;
        entries.push({ file: fileName, line: lineNum, id, hook, body, kind: 'bulk-loop' });
      }
    }
  }

  // Pattern D: passive-global object entries `'id': '<log>'`
  {
    const objRe = /const\s+(\w+)\s*=\s*\{([\s\S]*?)\};\s*[\n\r]+\s*for\s*\(\s*const\s*\[\s*id\s*,\s*log\s*\]\s*of\s+Object\.entries\(\s*\1\s*\)\s*\)\s*\{\s*reg(?:isterEffect)?\s*\(\s*id\s*,\s*HOOK\.([A-Z_]+)/gm;
    let mm;
    while ((mm = objRe.exec(src)) !== null) {
      const objBody = mm[2], hook = mm[3];
      const entryRe = /['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g;
      let em;
      while ((em = entryRe.exec(objBody)) !== null) {
        const id = em[1];
        const lineNum = src.slice(0, mm.index).split('\n').length;
        entries.push({ file: fileName, line: lineNum, id, hook, body: `PL(s,"${em[2]}")`, kind: 'bulk-passive-log' });
      }
    }
  }

  // Pattern E: bulk array `for (const id of yellCards) reg(id, HOOK.ON_CHEER_ATTACH, ...)`
  {
    const re = /for\s*\(\s*const\s+id\s+of\s+\w+\s*\)\s*\{[\s\S]*?reg(?:isterEffect)?\s*\(\s*id\s*,\s*HOOK\.([A-Z_]+)\s*,\s*\(([^)]*)\)\s*=>\s*([^;}]+)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const hook = m[1];
      const lineNum = src.slice(0, m.index).split('\n').length;
      // Find the array name
      const arrayName = src.slice(0, m.index).match(/const\s+(\w+)\s*=\s*\[([\s\S]*?)\];\s*[\n\r]+\s*for\s*\(\s*const\s+id\s+of\s+\1\s*\)/);
      if (!arrayName) continue;
      const arrBody = arrayName[2];
      const idRe = /['"]([^'"]+)['"]/g;
      let em;
      while ((em = idRe.exec(arrBody)) !== null) {
        entries.push({ file: fileName, line: lineNum, id: em[1], hook, body: m[3].trim(), kind: 'bulk-id-only' });
      }
    }
  }

  return entries;
}

// ─── Action fingerprint extraction ──────────────────────────────────────────
function extractActions(body) {
  const actions = [];
  let m;

  if ((m = body.match(/drawCards\([^,]+,\s*(\d+)/))) actions.push(`draw${m[1]}`);
  if (/archiveHand\b|archiveFromHand\b/.test(body)) actions.push('archiveHand');
  if ((m = body.match(/damageOpp(?:onent)?\([^,]+,[^,]+,\s*(\d+)/))) actions.push(`oppDmg${m[1]}`);
  if ((m = body.match(/applyDamageToMember\([^,]+,\s*(\d+)/))) actions.push(`applyDmg${m[1]}`);
  if (/sendCheerDeck\b/.test(body)) actions.push('sendCheerDeck');
  if (/sendCheerArchive\b|CHEER_FROM_ARCHIVE_TO_MEMBER\b/.test(body)) actions.push('sendCheerArchive');
  if (/CHEER_FROM_DECK_TOP_TO_MEMBER\b|CHEER_DECK_REVEAL_MATCH_TO_MEMBER\b/.test(body)) actions.push('sendCheerDeckPick');
  if (/attachedCheer\.push/.test(body)) actions.push('attachCheer');
  if (/attachedSupport\.push/.test(body)) actions.push('attachSupport');
  if (/searchDeck\b|makeSearchPrompt\b|makeArchivePrompt\b|SEARCH_SELECT/.test(body)) actions.push('search');
  if (/rollDie\b/.test(body)) actions.push('rollDie');
  if (/boost\b|boostTurn\b|DAMAGE_BOOST/.test(body)) actions.push('boost');
  if (/\.damage\s*=\s*Math\.max\(0,/.test(body)) actions.push('hpRestore');
  if (/triggerEvent/.test(body)) actions.push('hasTriggerCheck');
  if (/SELECT_OWN_MEMBER|SELECT_FROM_ARCHIVE|SELECT_TARGET/.test(body)) actions.push('hasPicker');
  if (/oshiSkillUsedThisTurn|usedSp\b/.test(body)) actions.push('hasOnceCheck');

  return actions;
}

function extractWanted(realText) {
  const wanted = [];
  let m;

  if ((m = realText.match(/抽\s*(\d+)\s*張/))) wanted.push(`draw${m[1]}`);
  if (/(放到存檔|存檔區).*手牌|將.*手牌.*存檔/.test(realText)) wanted.push('archiveHand');
  if ((m = realText.match(/(\d+)\s*點?\s*特殊傷害/))) wanted.push(`oppDmg${m[1]}`);
  if ((m = realText.match(/藝能傷害\s*\+\s*(\d+)/))) wanted.push('boost');
  if (/從.*吶喊牌組[上下方]?.*?(展示|發送)|將.*吶喊牌組[上下方]?的1張.*發送/.test(realText)) wanted.push('sendCheerDeck');
  if (/從(自己)?存檔區.*吶喊卡|可以將自己存檔區.*吶喊/.test(realText)) wanted.push('sendCheerArchive');
  if (/附加給/.test(realText)) wanted.push('attachSupport');
  if (/從自己的牌組(展示|搜尋|查看)/.test(realText)) wanted.push('search');
  if (/擲\s*(\d+)?\s*次?\s*骰子/.test(realText)) wanted.push('rollDie');
  if (/HP\s*回復|HP回\s*\d+/.test(realText)) wanted.push('hpRestore');

  return wanted;
}

// ─── Categorize ─────────────────────────────────────────────────────────────
const CONDITION_MARKERS = ['如果', '時，', 'のとき', '若', '中心成員為', '主推為', '比對手', '在自己', '當'];
const RULE_MOD_MARKERS = ['第一個回合', '使用自己手牌的1st成員進行綻放', '無色吶喊卡數量-', '無色吶喊卡數量+'];
const COST_OPTIONAL_MARKERS = ['可以將自己', '可以將這個', '可以擲'];
const MULTI_STEP_MARKERS = ['之後，', '之後。', '。之後'];
const PICK_MARKERS = ['選擇自己', '選擇 1', '可以選擇'];

function categorize(entry) {
  const card = cardById.get(entry.id);
  if (!card) return { category: 'NO_CARD', reason: 'not in cards.json' };
  const realText = realTextFor(card, entry.hook);
  const body = entry.body.trim();

  if (entry.kind === 'bulk-passive-log') {
    return { category: 'PASSIVE-INTENT', reason: 'effectG description, engine does not auto-apply', realText };
  }

  if (!realText) {
    return { category: 'NO-TEXT', reason: 'no card effect for hook', realText: '' };
  }

  // DISABLED-FALLTHROUGH: handler returns just `{ state }` (no resolved/prompt)
  const trimmed = body.replace(/\s+/g, ' ').trim();
  if (/^(?:\/\/[^\n]*)*\s*return\s*\{\s*state\s*\}\s*;?\s*$/.test(body) ||
      trimmed === 'return { state };' || trimmed === 'return {state};' ||
      trimmed === 'return { state }' || trimmed === 'return {state}') {
    return { category: 'DISABLED-FALLTHROUGH', reason: 'falls through to MANUAL_EFFECT', realText: realText.slice(0, 110) };
  }

  // STUB-LOG: handler returns { state, resolved: true, log: '<cardId> ...' }
  // This is the phaseD-generated pattern that engine now upgrades to MANUAL_EFFECT.
  if (/return\s*\{\s*state[^}]*resolved:\s*true[^}]*log:\s*['"`][^'"`]*\b/.test(body) &&
      !/(drawCards|damageOpp|sendCheerDeck|sendCheerArchive|archiveHand|attachedCheer\.push|attachedSupport\.push|searchDeck|rollDie|boost\b|boostTurn|DAMAGE_BOOST|\.damage\s*=)/.test(body)) {
    return { category: 'STUB-LOG', reason: 'log only — engine upgrades to MANUAL_EFFECT', realText: realText.slice(0, 110) };
  }

  // Build action / wanted fingerprints
  const actions = extractActions(body);
  const wanted = extractWanted(realText);
  const hasGuard = actions.includes('hasTriggerCheck');
  const hasPicker = actions.includes('hasPicker');

  // RULE-MOD: text modifies rules (first-turn-bloom etc.)
  if (RULE_MOD_MARKERS.some(m => realText.includes(m))) {
    return {
      category: 'RULE-MOD',
      reason: 'text modifies game rules — needs engine support',
      realText: realText.slice(0, 110),
      handlerActions: actions,
    };
  }

  // NUMBER-MISMATCH: handler does drawN but text says drawM (M≠N)
  for (const w of wanted) {
    if (w.startsWith('draw') || w.startsWith('oppDmg')) {
      const matchingHandler = actions.find(a => a.startsWith(w.replace(/\d+$/, '')));
      if (matchingHandler && matchingHandler !== w) {
        return {
          category: 'NUMBER-MISMATCH',
          reason: `text=${w} handler=${matchingHandler}`,
          realText: realText.slice(0, 110),
          handlerActions: actions,
        };
      }
    }
  }

  // TARGET-WRONG-SIDE: text mentions opponent but handler operates on own (or reverse)
  // Heuristic: text has 「對手的」 but body lacks references to `1 - ctx.player` or `opp` zones; or vice versa
  const textTargetsOpp = /對手的|給予對手|對手成員/.test(realText);
  const textTargetsOwn = /自己的|自己成員|自己舞台/.test(realText);
  const bodyTargetsOpp = /1\s*-\s*ctx\.player|1\s*-\s*c\.player|state\.players\[1-/.test(body);
  if (textTargetsOpp && !textTargetsOwn && actions.length > 0 && !bodyTargetsOpp && !hasPicker) {
    // text says opp only, handler doesn't touch opp side — possibly wrong
    if (actions.some(a => a === 'attachSupport' || a.startsWith('draw') || a === 'attachCheer')) {
      return {
        category: 'TARGET-WRONG-SIDE',
        reason: 'text targets opponent but handler operates on own',
        realText: realText.slice(0, 110),
        handlerActions: actions,
      };
    }
  }

  // COST-IGNORED: text has 「可以將 X 存檔: ...」optional cost but handler skips check
  if (COST_OPTIONAL_MARKERS.some(m => realText.includes(m)) && actions.length > 0) {
    // Skip false positives:
    //  - For ON_ART_DECLARE / ON_ART_RESOLVE: real text combines art1 + art2.
    //    If body has artKey gating (`ctx.artKey !== 'art1'` early-return), it's
    //    only handling one of the arts, the other one's cost text doesn't apply.
    const hasArtKeyGate = /ctx\.artKey\s*!==\s*['"`]art[12]['"`]/.test(body) ||
                         /ctx\.artKey\s*===\s*['"`]art[12]['"`]/.test(body);
    //  - MANUAL_EFFECT fall-through: body returns `{ state }` (no `resolved`)
    //    after the optional trigger guard. Engine then prompts the user — the
    //    cost is not auto-skipped; player consents.
    const isManualFallthrough = /return\s*\{\s*state\s*\}\s*;?\s*(\/\/.*)?\s*$/.test(body.trim()) ||
                                /^\s*(if[^{]+\{[^}]*\}\s*)?return\s*\{\s*state\s*\}\s*;?\s*$/m.test(body.trim()) ||
                                actions.every(a => a === 'hasTriggerCheck'); // only trigger guard, no real action
    if (hasArtKeyGate && (entry.hook === 'ON_ART_DECLARE' || entry.hook === 'ON_ART_RESOLVE')) {
      // skip — handler is gated on a specific art
    } else if (isManualFallthrough) {
      // skip — MANUAL_EFFECT fall-through, engine handles
    } else if (/(可以將自己\d?張?手牌|可以將.*存檔|可以擲)/.test(realText) && !actions.includes('archiveHand') && !actions.includes('rollDie') && !hasPicker) {
      // It IS firing the after-cost effect without paying. But many "可以" effects auto-fire the beneficial part — only flag if TEXT explicitly says "存檔" as cost
      if (/可以將.*手牌.*存檔|可以將.*手牌.*放到存檔/.test(realText)) {
        return {
          category: 'COST-IGNORED',
          reason: 'optional archive cost ignored',
          realText: realText.slice(0, 110),
          handlerActions: actions,
        };
      }
    }
  }

  // AUTO-PICK-BUG: text says "1 位 #tag" or "選擇" with multiple potential candidates,
  // handler uses .find/[0] without picker prompt
  if (PICK_MARKERS.some(m => realText.includes(m)) && !hasPicker) {
    if (/\.find\(|\[0\]/.test(body) && (actions.includes('attachSupport') || actions.includes('attachCheer') || actions.includes('sendCheerDeck') || actions.includes('sendCheerArchive') || actions.includes('boost') || actions.includes('hpRestore'))) {
      return {
        category: 'AUTO-PICK-BUG',
        reason: 'text says 選擇 but handler auto-picks via .find/[0]',
        realText: realText.slice(0, 110),
        handlerActions: actions,
      };
    }
  }

  // CONDITION-MISSING: text has condition markers but handler has no if
  if (CONDITION_MARKERS.some(m => realText.includes(m))) {
    const hasIf = /\bif\s*\(/.test(body);
    if (!hasIf && actions.length > 0 && !hasPicker) {
      return {
        category: 'CONDITION-MISSING',
        reason: 'text has condition but handler unconditional',
        realText: realText.slice(0, 110),
        handlerActions: actions,
      };
    }
  }

  // MULTI-STEP-MISSING: text has 「之後，」chain but handler is too simple
  if (MULTI_STEP_MARKERS.some(m => realText.includes(m)) && actions.length === 1) {
    return {
      category: 'MULTI-STEP-MISSING',
      reason: 'text describes multi-step but handler does only 1',
      realText: realText.slice(0, 110),
      handlerActions: actions,
    };
  }

  // CORRECT-VERIFIED: handler has at least one action that maps to wanted, plus picker if needed
  if (actions.length > 0 && wanted.length > 0) {
    const overlap = actions.some(a => wanted.includes(a) || wanted.some(w => a.startsWith(w.replace(/\d+$/, ''))));
    if (overlap) {
      if (PICK_MARKERS.some(m => realText.includes(m)) && !hasPicker && /\.find\(|\[0\]/.test(body)) {
        // Has overlap but uses auto-pick where it shouldn't
        return {
          category: 'AUTO-PICK-BUG',
          reason: 'overlapping action but auto-picks',
          realText: realText.slice(0, 110),
          handlerActions: actions,
        };
      }
      return {
        category: 'CORRECT-VERIFIED',
        reason: `actions:[${actions.join(',')}] wanted:[${wanted.join(',')}]`,
        realText: realText.slice(0, 110),
        handlerActions: actions,
      };
    }
  }

  if (actions.length === 0) {
    return {
      category: 'STUB-LOG',
      reason: 'no actions detected',
      realText: realText.slice(0, 110),
      handlerActions: actions,
    };
  }

  return {
    category: 'UNCLASSIFIED',
    reason: `actions:[${actions.join(',')}] wanted:[${wanted.join(',')}]`,
    realText: realText.slice(0, 110),
    handlerActions: actions,
  };
}

// ─── Run audit ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isBaseline = args.includes('--baseline');
const isDiff = args.includes('--diff');
const isJson = args.includes('--json');

const handlerFiles = fs.readdirSync(handlerDir)
  .filter(f => f.endsWith('.js'))
  .sort()
  .map(f => path.join(handlerDir, f));

const allEntries = [];
for (const file of handlerFiles) {
  const subEntries = extractFromFile(file);
  // De-dupe within same file (some patterns can match the same reg twice)
  const seen = new Set();
  for (const e of subEntries) {
    const key = `${e.file}|${e.line}|${e.id}|${e.hook}`;
    if (seen.has(key)) continue;
    seen.add(key);
    allEntries.push(e);
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  totalCards: cards.length,
  totalRegistrations: allEntries.length,
  totals: {},
  byFile: {},
  byHook: {},
  entries: [],
};

for (const e of allEntries) {
  const cat = categorize(e);
  const merged = { ...e, ...cat };
  out.entries.push(merged);
  out.totals[cat.category] = (out.totals[cat.category] || 0) + 1;
  out.byFile[e.file] = out.byFile[e.file] || { total: 0 };
  out.byFile[e.file].total++;
  out.byFile[e.file][cat.category] = (out.byFile[e.file][cat.category] || 0) + 1;
  out.byHook[e.hook] = out.byHook[e.hook] || { total: 0 };
  out.byHook[e.hook].total++;
  out.byHook[e.hook][cat.category] = (out.byHook[e.hook][cat.category] || 0) + 1;
}

// Coverage analysis: cards in cards.json that have effect text but no handler
const cardsByEffect = {
  ON_BLOOM: cards.filter(c => c.effectB?.effect),
  ON_COLLAB: cards.filter(c => c.effectC?.effect),
  ON_PLAY: cards.filter(c => c.supportEffect),
  ON_OSHI_SKILL: cards.filter(c => c.oshiSkill?.effect || c.spSkill?.effect),
  ON_PASSIVE_GLOBAL: cards.filter(c => c.effectG?.effect),
  ON_ART_DECLARE: cards.filter(c => c.art1?.effect || c.art2?.effect),
};
const handlerKeys = new Set(allEntries.map(e => `${e.id}|${e.hook}`));
const missingByHook = {};
for (const [hook, cardList] of Object.entries(cardsByEffect)) {
  const missing = cardList.filter(c => !handlerKeys.has(`${c.id}|${hook}`));
  missingByHook[hook] = { hookTotal: cardList.length, missing: missing.length };
}
out.coverageGaps = missingByHook;

// Severity-bucket: which categories indicate a real problem the user could hit
const SEVERITY_BUCKETS = {
  HIGH:  ['AUTO-PICK-BUG', 'NUMBER-MISMATCH', 'TARGET-WRONG-SIDE', 'COST-IGNORED'],
  MED:   ['CONDITION-MISSING', 'MULTI-STEP-MISSING'],
  LOW:   ['UNCLASSIFIED', 'NO_CARD'],
  INFO:  ['CORRECT-VERIFIED', 'STUB-LOG', 'DISABLED-FALLTHROUGH', 'NO-TEXT', 'PASSIVE-INTENT', 'RULE-MOD'],
};
out.severity = {
  HIGH: 0, MED: 0, LOW: 0, INFO: 0,
};
for (const [cat, n] of Object.entries(out.totals)) {
  for (const [bucket, cats] of Object.entries(SEVERITY_BUCKETS)) {
    if (cats.includes(cat)) { out.severity[bucket] += n; break; }
  }
}

fs.writeFileSync(outputPath, JSON.stringify(out, null, 2));

if (isBaseline) {
  fs.writeFileSync(baselinePath, JSON.stringify({
    generatedAt: out.generatedAt,
    totals: out.totals,
    severity: out.severity,
  }, null, 2));
  console.log(`Baseline written to ${baselinePath}`);
}

if (isDiff) {
  if (!fs.existsSync(baselinePath)) {
    console.error('No baseline to diff against. Run --baseline first.');
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const allCats = new Set([...Object.keys(out.totals), ...Object.keys(baseline.totals || {})]);
  console.log('\n=== DIFF (current vs baseline) ===');
  for (const cat of [...allCats].sort()) {
    const cur = out.totals[cat] || 0;
    const base = baseline.totals[cat] || 0;
    if (cur !== base) {
      const sign = cur > base ? '+' : '';
      console.log(`  ${cat.padEnd(22)}: ${base} → ${cur} (${sign}${cur - base})`);
    }
  }
  // Block if HIGH severity went up
  if (out.severity.HIGH > (baseline.severity?.HIGH || 0)) {
    console.error(`\n❌ HIGH severity issues increased: ${baseline.severity?.HIGH || 0} → ${out.severity.HIGH}`);
    process.exit(1);
  }
  console.log('\n✓ No new HIGH severity issues');
  process.exit(0);
}

if (isJson) {
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

// ─── Print summary ──────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════════════════════════`);
console.log(`  Effect Handler Coverage Audit v3`);
console.log(`  Generated: ${out.generatedAt}`);
console.log(`═══════════════════════════════════════════════════════════════\n`);
console.log(`Total cards:           ${out.totalCards}`);
console.log(`Total registrations:   ${out.totalRegistrations}\n`);

console.log('── Severity ──');
for (const [k, v] of Object.entries(out.severity)) {
  const icon = k === 'HIGH' ? '🔴' : k === 'MED' ? '🟡' : k === 'LOW' ? '🟢' : '⚪';
  console.log(`  ${icon} ${k.padEnd(6)}: ${v}`);
}

console.log('\n── By Category ──');
const catEntries = Object.entries(out.totals).sort((a, b) => b[1] - a[1]);
for (const [cat, n] of catEntries) {
  const pct = (n / out.totalRegistrations * 100).toFixed(1);
  console.log(`  ${cat.padEnd(24)}: ${String(n).padStart(4)} (${pct}%)`);
}

console.log('\n── By File ──');
for (const [file, c] of Object.entries(out.byFile).sort((a, b) => b[1].total - a[1].total)) {
  const issues = Object.entries(c).filter(([k]) => k !== 'total' && SEVERITY_BUCKETS.HIGH.includes(k)).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(`  ${file.padEnd(30)}: total=${String(c.total).padStart(4)}  ${issues ? '🔴 ' + issues : ''}`);
}

console.log('\n── Coverage Gaps (cards with effect text but no handler) ──');
for (const [hook, info] of Object.entries(out.coverageGaps)) {
  const pct = ((info.hookTotal - info.missing) / info.hookTotal * 100).toFixed(1);
  console.log(`  ${hook.padEnd(22)}: ${info.hookTotal - info.missing}/${info.hookTotal} covered (${pct}%, ${info.missing} missing)`);
}

console.log(`\n📄 Full data: ${outputPath}`);
console.log(`📊 Run with --baseline to set baseline, --diff to compare.\n`);
