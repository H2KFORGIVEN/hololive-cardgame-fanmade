// クロニー (オーロ・クロニー) deck handlers — written from real card text
// per the "no guessing" rule (~/.claude/projects/-Users-showmaker/memory/feedback_no_guessing_card_effects.md).
//
// All handlers below have the real zh-TW effect text in a comment above
// and implement that effect specifically. ON_BLOOM / ON_COLLAB include
// broadcast guards; the global registerEffect wrapper would add them
// otherwise but we make them explicit so the wrapper detection is
// reliable.

import { getCard, getCardImage } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE, isMember, isSupport } from '../../core/constants.js';
import { getStageMembers, drawCards } from './common.js';

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hasTag(inst, tag) {
  const t = getCard(inst.cardId)?.tag || '';
  return (typeof t === 'string' ? t : JSON.stringify(t)).includes(tag);
}

// Find #Promise members on own stage
function getPromiseMembers(player) {
  return getStageMembers(player).filter(m => hasTag(m.inst, '#Promise'));
}

export function registerKuroniiDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBP01-094 オーロ・クロニー (1st) effectB「クロにちは！」
  // 「從自己的吶喊牌組展示1張與自己1位標示#Promise的成員相同顏色的吶喊卡，
  //  發送給自己標示#Promise的成員。將吶喊牌組重新洗牌。」
  //
  // Auto-implementable: scan cheer-deck top→bottom for a card whose color
  // matches any #Promise member on stage. If found, attach to that member.
  // Reshuffle cheer-deck regardless (real text says reshuffle after).
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP01-094', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const promiseMembers = getPromiseMembers(own);
    if (promiseMembers.length === 0) {
      shuffleArr(own.zones[ZONE.CHEER_DECK]);
      return { state, resolved: true, log: 'クロにちは！: 場上無 #Promise 成員 — 跳過' };
    }
    const promiseColors = new Set(promiseMembers.map(m => getCard(m.inst.cardId)?.color).filter(Boolean));
    // Find a cheer card in cheer-deck whose color matches
    const cheerDeck = own.zones[ZONE.CHEER_DECK];
    let pickIdx = -1;
    for (let i = 0; i < cheerDeck.length; i++) {
      const cheer = cheerDeck[i];
      const color = getCard(cheer.cardId)?.color;
      if (color && promiseColors.has(color)) { pickIdx = i; break; }
    }
    if (pickIdx < 0) {
      shuffleArr(own.zones[ZONE.CHEER_DECK]);
      return { state, resolved: true, log: 'クロにちは！: 吶喊牌組無同色卡 — 重新洗牌' };
    }
    const cheer = cheerDeck.splice(pickIdx, 1)[0];
    cheer.faceDown = false;
    // Attach to the matching-color member (or first match). Auto-pick first match.
    const cheerColor = getCard(cheer.cardId)?.color;
    const target = promiseMembers.find(m => getCard(m.inst.cardId)?.color === cheerColor) || promiseMembers[0];
    target.inst.attachedCheer = target.inst.attachedCheer || [];
    target.inst.attachedCheer.push(cheer);
    shuffleArr(own.zones[ZONE.CHEER_DECK]);
    return { state, resolved: true, log: `クロにちは！: ${cheerColor} 吶喊→ ${getCard(target.inst.cardId)?.name||'?'}` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-050 オーロ・クロニー (Debut) effectC「この日が来た！」
  // 「如果在自己後攻的第一個回合，自己的中心成員「オーロ・クロニー」，
  //  可以使用自己手牌的1st成員進行綻放。這個效果可以在第一個回合進行綻放。」
  //
  // This is a RULE MODIFICATION (allows first-turn bloom for back-attacker).
  // Engine doesn't currently support this dynamic bloom-validation override.
  // Set a flag and surface MANUAL_EFFECT with text — player can manually
  // bloom via Manual Adjust if they want to use the permission.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-050', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const own = state.players[ctx.player];
    const isBackAttackFirst = state.firstTurn?.[ctx.player] && ctx.player !== state.firstPlayer;
    if (!isBackAttackFirst) return { state, resolved: true, log: 'この日が来た！: 非後攻第1回合 — 無效' };
    const center = own.zones[ZONE.CENTER];
    if (!center || getCard(center.cardId)?.name !== 'オーロ・クロニー') {
      return { state, resolved: true, log: 'この日が来た！: 中心非「オーロ・クロニー」— 無效' };
    }
    state._firstTurnBloomAvailable = state._firstTurnBloomAvailable || {};
    state._firstTurnBloomAvailable[ctx.player] = true;
    return { state, resolved: true, log: 'この日が来た！: 後攻第1回合可開花到中心オーロ・クロニー（手動）' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-051 オーロ・クロニー (Debut) effectC「TAKE YOUR TIME」
  // 「可以將自己舞台上的1張吶喊卡替換給自己這個成員以外標示#Promise的成員。」
  //
  // Optional cheer-move between #Promise members (excluding self). Without
  // a proper picker UI for "which cheer from where → which target", this
  // falls through to MANUAL_EFFECT.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-051', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    return { state }; // MANUAL_EFFECT — needs source picker + target picker
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-052 オーロ・クロニー (1st) effectC「お時間ですわ！」
  // 「可以將自己存檔區的1張吉祥物附加給這個成員。」
  //
  // Auto-fire (optional but only beneficial; no negative side-effect).
  // Find first 吉祥物 in archive, attach to self.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-052', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const own = state.players[ctx.player];
    const archive = own.zones[ZONE.ARCHIVE];
    const idx = archive.findIndex(c => getCard(c.cardId)?.type === '支援・吉祥物');
    if (idx < 0) return { state, resolved: true, log: 'お時間ですわ！: 存檔區無吉祥物' };
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true, log: 'お時間ですわ！: 找不到成員' };
    const mascot = archive.splice(idx, 1)[0];
    mascot.faceDown = false;
    me.attachedSupport = me.attachedSupport || [];
    me.attachedSupport.push(mascot);
    return { state, resolved: true, log: `お時間ですわ！: 附加 ${getCard(mascot.cardId)?.name||'?'}` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-053 オーロ・クロニー (1st) effectB「時を超えた約束」
  // 「選擇自己舞台上1位標示#Promise的成員。這個回合中，該成員的藝能傷害+20。」
  //
  // Requires picker (which #Promise member). Without a picker prompt,
  // fall through to MANUAL_EFFECT so player chooses + applies.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-053', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    return { state }; // MANUAL_EFFECT
  });

  // hBP07-053 art1「Everlasting Flower」
  // 「將自己吶喊牌組上方的1張牌發送給自己標示#Promise的成員。」
  // Auto-fire: send top cheer to first #Promise member found on stage.
  reg('hBP07-053', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const own = state.players[ctx.player];
    const promiseMembers = getPromiseMembers(own);
    if (promiseMembers.length === 0) return { state, resolved: true, log: '無 #Promise 成員可送吶喊' };
    const cheerDeck = own.zones[ZONE.CHEER_DECK];
    if (cheerDeck.length === 0) return { state, resolved: true, log: '吶喊牌組空' };
    const cheer = cheerDeck.shift();
    cheer.faceDown = false;
    const target = promiseMembers[0];
    target.inst.attachedCheer = target.inst.attachedCheer || [];
    target.inst.attachedCheer.push(cheer);
    return { state, resolved: true, log: `Everlasting Flower: 吶喊→${getCard(target.inst.cardId)?.name||'?'}` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-054 オーロ・クロニー (1st Buzz) art1「I'm pretty shy…uwu」
  // 「將自己吶喊牌組上方的1張牌發送給自己標示#Promise的Buzz成員。」
  //
  // Auto-fire: send top cheer to first #Promise Buzz member.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-054', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const own = state.players[ctx.player];
    const buzzPromise = getStageMembers(own).filter(m => {
      const c = getCard(m.inst.cardId);
      return hasTag(m.inst, '#Promise') && (c?.bloom || '').includes('Buzz');
    });
    if (buzzPromise.length === 0) return { state, resolved: true, log: '無 #Promise Buzz 成員' };
    const cheerDeck = own.zones[ZONE.CHEER_DECK];
    if (cheerDeck.length === 0) return { state, resolved: true, log: '吶喊牌組空' };
    const cheer = cheerDeck.shift();
    cheer.faceDown = false;
    const target = buzzPromise[0];
    target.inst.attachedCheer = target.inst.attachedCheer || [];
    target.inst.attachedCheer.push(cheer);
    return { state, resolved: true, log: `I'm pretty shy: 吶喊→Buzz ${getCard(target.inst.cardId)?.name||'?'}` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-055 オーロ・クロニー (2nd) effectB「約束の未来へ」
  // 「選擇自己舞台上1位標示#Promise的成員。這個回合中，該成員的藝能傷害+50。」
  //
  // Requires target-picker. Fall through to MANUAL_EFFECT.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-055', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    return { state }; // MANUAL_EFFECT
  });

  return count;
}
