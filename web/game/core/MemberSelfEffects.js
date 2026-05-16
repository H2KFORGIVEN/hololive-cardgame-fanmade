// Member-self passive registry — counterpart to AttachedSupportEffects.js, but
// for effects declared on the member's OWN effectG (or implicit) text rather
// than via an equipped support. Keyed by member cardId.
//
// Slots:
//   extraHp(memberInst) → +N HP added on top of base + equipment HP
//
// Mass-data note: extraHp here is read by DamageCalculator.applyDamage and
// GameEngine.sweepEffectKnockouts so a member's effective HP includes their
// own passive (e.g. hBP07-014 角巻わため: HP +10 per overlapping member).
//
// To add a new self-passive: add a row below. No engine changes needed.

const REGISTRY = {
  // hBP07-014 角巻わため 2nd: each overlapping (bloom-stack) member → HP +10
  'hBP07-014': {
    extraHp: (m) => (Array.isArray(m?.bloomStack) ? m.bloomStack.length : 0) * 10,
  },
  // hSD13-007 エリザベス・ローズ・ブラッドフレイム 2nd: each attached cheer → HP +10
  'hSD13-007': {
    extraHp: (m) => (Array.isArray(m?.attachedCheer) ? m.attachedCheer.length : 0) * 10,
  },
};

/** HP boost from a member's own passive (not equipment). */
export function getMemberSelfExtraHp(memberInst) {
  const decl = REGISTRY[memberInst?.cardId];
  if (!decl?.extraHp) return 0;
  return decl.extraHp(memberInst) || 0;
}
