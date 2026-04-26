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
// Each maps cardId → { extraHp(member, card), colorlessReduction(member, card) }
// Functions get the EQUIPPED MEMBER (not the support), and return a number.
// `card` is the cached lookup of the member's card data, passed in to avoid re-resolving.
const REGISTRY = {
  // hBP06-097 カワイイスタジャン: ◆Buzz members: HP +30
  'hBP06-097': {
    extraHp: (memberInst, card) => (card?.bloom?.includes('Buzz') ? 30 : 0),
  },
  // hBP07-101 ASMRマイク: ◆Buzz members: arts colorless cheer cost -1
  'hBP07-101': {
    colorlessReduction: (memberInst, card) => (card?.bloom?.includes('Buzz') ? 1 : 0),
  },
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
