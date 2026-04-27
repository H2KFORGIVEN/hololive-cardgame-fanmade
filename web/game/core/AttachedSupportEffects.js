// Equipment effect lookups — pure, side-effect-free helpers that read a member's
// `attachedSupport` array and return aggregated buffs/debuffs.
//
// Mass-data note: attaching is fully automatic via GameEngine.processPlaySupport
// (which writes into target.attachedSupport when the support is type 道具/吉祥物
// /粉絲). The job of effect handlers is just to register whatever auxiliary
// behaviour the support has (e.g. trigger-on-SP); the buff itself lives here as
// a static lookup so DamageCalculator + ActionValidator can read it without
// importing handler modules.
//
// To add a new equipment effect: add a row to the registry below. No engine
// changes needed.

import { getCard } from './CardDatabase.js';

// Per-card effect declarations.
// Slots:
//   extraHp(member, card)               → +N HP
//   colorlessReduction(member, card)    → −N colorless cost
//   artDamageBoost(member, card)        → +N art damage when this member attacks
//   damageReceivedModifier(member, card)→ ±N damage TAKEN by this member (negative = take less)
// Functions take (equippedMember, card) where card is the equipped member's
// card data (cached so we don't resolve it twice).
const REGISTRY = {
  // ── 道具 (tools) ────────────────────────────────────────────────────────
  // hBP06-097 カワイイスタジャン: ◆Buzz: HP +30
  'hBP06-097': { extraHp: (m, c) => (c?.bloom?.includes('Buzz') ? 30 : 0) },
  // hBP07-101 ASMRマイク: ◆Buzz: colorless cheer cost −1
  'hBP07-101': { colorlessReduction: (m, c) => (c?.bloom?.includes('Buzz') ? 1 : 0) },
  // hBP06-099 ゆび: art damage +10 (universal)
  'hBP06-099': { artDamageBoost: () => 10 },
  // hBP05-082 アキ・ローゼンタールの斧: art +10; +40 more on 1st+ アキ
  'hBP05-082': {
    artDamageBoost: (m, c) => {
      let n = 10;
      if (c?.name === 'アキ・ローゼンタール' && (c.bloom === '1st' || c.bloom === '2nd')) n += 40;
      return n;
    },
  },
  // hBP02-086 ホロスパークリング: art +20; if no #お酒, takes +10 dmg
  'hBP02-086': {
    artDamageBoost: () => 20,
    damageReceivedModifier: (m, c) => {
      const tag = c?.tag || '';
      const tagStr = typeof tag === 'string' ? tag : JSON.stringify(tag);
      return tagStr.includes('#お酒') ? 0 : 10;
    },
  },
  // hBP02-087 紫咲シオンの魔法のステッキ: art +10
  'hBP02-087': { artDamageBoost: () => 10 },
  // hSD02-013 阿修羅＆羅刹: art +10; +10 more on 1st+ 百鬼あやめ
  'hSD02-013': {
    artDamageBoost: (m, c) => {
      let n = 10;
      if (c?.name === '百鬼あやめ' && (c.bloom === '1st' || c.bloom === '2nd')) n += 10;
      return n;
    },
  },
  // hBP07-103 ギラファノコギリクワガタ: ねね art +20 (only when on ねね)
  'hBP07-103': { artDamageBoost: (m, c) => (c?.name === '桃鈴ねね' ? 20 : 0) },
  // hBP03-095 ホロキャップ: ◆Debut/Spot: HP +30
  'hBP03-095': {
    extraHp: (m, c) => (c?.bloom === 'Debut' || c?.bloom === 'Spot' ? 30 : 0),
  },

  // ── 吉祥物 (mascots) ────────────────────────────────────────────────────
  // hBP01-118 あん肝: HP +10 (general; +白色 cheer when on ときのそら is engine-complex, skipped)
  'hBP01-118': { extraHp: () => 10 },
  // hBP01-119 ジョブズ: HP +10 (heal-on-art trigger for アキ skipped)
  'hBP01-119': { extraHp: () => 10 },
  // hBP02-090 ネジマキツネ: HP +20
  'hBP02-090': { extraHp: () => 20 },
  // hBP02-093 ミテイル: HP +20
  'hBP02-093': { extraHp: () => 20 },
  // hBP02-098 Death-sensei: HP +20 (all-cheer-color override for カリオペ skipped)
  'hBP02-098': { extraHp: () => 20 },
  // hSD02-014 ぽよ余: HP +20 (bloom-draw trigger for あやめ skipped)
  'hSD02-014': { extraHp: () => 20 },

  // ── 粉絲 (fans) ─────────────────────────────────────────────────────────
  // hBP02-099 すこん部: HP +10 (フブキ-only fan)
  'hBP02-099': { extraHp: () => 10 },
  // hBP02-100 白銀聖騎士団: damage taken −10 (ノエル-only fan)
  'hBP02-100': { damageReceivedModifier: () => -10 },
  // hBP01-126 座員: damage taken +10 (ポルカ-only fan; "counts as red cheer" rule skipped)
  'hBP01-126': { damageReceivedModifier: () => 10 },
};

function _eachAttachedEffect(memberInst, fnName) {
  if (!memberInst || !Array.isArray(memberInst.attachedSupport)) return 0;
  const card = getCard(memberInst.cardId);
  let sum = 0;
  for (const sup of memberInst.attachedSupport) {
    const supId = typeof sup === 'string' ? sup : sup?.cardId;
    if (!supId) continue;
    const decl = REGISTRY[supId];
    if (!decl) continue;
    const fn = decl[fnName];
    if (typeof fn === 'function') {
      sum += fn(memberInst, card) || 0;
    }
  }
  return sum;
}

/** Sum of HP boosts from equipped items applicable to this member. */
export function getExtraHp(memberInst) {
  return _eachAttachedEffect(memberInst, 'extraHp');
}

/** Sum of colorless-cheer cost reductions from equipped items. */
export function getColorlessReduction(memberInst) {
  return _eachAttachedEffect(memberInst, 'colorlessReduction');
}

/** Sum of art-damage boosts from equipped items (e.g. ゆび: +10). */
export function getArtDamageBoost(memberInst) {
  return _eachAttachedEffect(memberInst, 'artDamageBoost');
}

/**
 * Net modifier applied to damage TAKEN by this member, summed across all
 * equipment. Positive = takes more damage; negative = takes less.
 * Read by DamageCalculator.applyDamage and EffectHandler.applyDamageToMember.
 */
export function getDamageReceivedModifier(memberInst) {
  return _eachAttachedEffect(memberInst, 'damageReceivedModifier');
}
