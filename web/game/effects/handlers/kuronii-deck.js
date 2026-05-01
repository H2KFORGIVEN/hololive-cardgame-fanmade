// クロニー (オーロ・クロニー) deck handlers — written from real card text
// per the "no guessing" rule (~/.claude/projects/-Users-showmaker/memory/feedback_no_guessing_card_effects.md).
//
// 2026-05-01 v2: ALL "pick a member" / "pick a card from archive" cases
// now use proper SELECT_OWN_MEMBER / SELECT_FROM_ARCHIVE prompts so the
// player chooses, instead of the handler auto-picking "first match".
// Auto-fire only when target/source is unambiguous (single candidate).

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

// Build SELECT_OWN_MEMBER prompt cards array from member-info objects
function memberPicks(members) {
  return members.map(m => ({
    instanceId: m.inst.instanceId,
    cardId: m.inst.cardId,
    name: getCard(m.inst.cardId)?.name || '',
    image: getCardImage(m.inst.cardId),
  }));
}

export function registerKuroniiDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBP01-094 オーロ・クロニー (1st) effectB「クロにちは！」
  // 「從自己的吶喊牌組展示1張與自己1位標示#Promise的成員相同顏色的吶喊卡，
  //  發送給自己標示#Promise的成員。將吶喊牌組重新洗牌。」
  //
  // Behavior: player picks WHICH #Promise member receives the cheer; engine
  // then scans cheer-deck for a card matching that member's color. If only
  // one #Promise member exists, auto-resolve.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP01-094', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const promiseMembers = getPromiseMembers(own);
    if (promiseMembers.length === 0) {
      shuffleArr(own.zones[ZONE.CHEER_DECK]);
      return { state, resolved: true, log: 'クロにちは！: 場上無 #Promise — 跳過' };
    }
    if (promiseMembers.length === 1) {
      // Unambiguous — auto-resolve
      const target = promiseMembers[0];
      const color = getCard(target.inst.cardId)?.color;
      const cheerDeck = own.zones[ZONE.CHEER_DECK];
      let idx = cheerDeck.findIndex(c => getCard(c.cardId)?.color === color);
      if (idx >= 0) {
        const cheer = cheerDeck.splice(idx, 1)[0];
        cheer.faceDown = false;
        target.inst.attachedCheer = target.inst.attachedCheer || [];
        target.inst.attachedCheer.push(cheer);
        shuffleArr(cheerDeck);
        return { state, resolved: true, log: `クロにちは！: ${color} 吶喊→ ${getCard(target.inst.cardId)?.name||'?'}` };
      }
      shuffleArr(cheerDeck);
      return { state, resolved: true, log: 'クロにちは！: 吶喊牌組無同色卡 — 重新洗牌' };
    }
    // Multiple #Promise members → let player pick which receives
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER',
        player: ctx.player,
        message: 'クロにちは！: 選擇 1 位 #Promise 成員接收同色吶喊',
        cards: memberPicks(promiseMembers),
        maxSelect: 1,
        afterAction: 'CHEER_DECK_REVEAL_MATCH_TO_MEMBER',
      },
      log: 'クロにちは！: 選擇接收成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-050 オーロ・クロニー (Debut) effectC「この日が来た！」
  // 「如果在自己後攻的第一個回合，自己的中心成員「オーロ・クロニー」，
  //  可以使用自己手牌的1st成員進行綻放。這個效果可以在第一個回合進行綻放。」
  //
  // RULE MODIFICATION (allows first-turn bloom for back-attacker).
  // Engine doesn't currently support this dynamic bloom-validation override.
  // Set a state flag and surface MANUAL_EFFECT — player can manually bloom
  // via Manual Adjust if they want to use the permission.
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
  // Optional cheer-move: pick source cheer location, pick target. Two-step
  // picker not implemented yet — fall through to MANUAL_EFFECT.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-051', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    return { state }; // MANUAL_EFFECT — needs source picker + target picker
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-052 オーロ・クロニー (1st) effectC「お時間ですわ！」
  // 「可以將自己存檔區的1張吉祥物附加給這個成員。」
  //
  // Target is fixed (this member). Source — pick which 吉祥物 from archive.
  // If 0 → skip; if 1 → auto; multiple → SELECT_FROM_ARCHIVE picker.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-052', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true, log: 'お時間ですわ！: 找不到成員' };
    const mascots = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.type === '支援・吉祥物');
    if (mascots.length === 0) return { state, resolved: true, log: 'お時間ですわ！: 存檔區無吉祥物' };
    if (mascots.length === 1) {
      // Unambiguous — auto-attach
      const idx = own.zones[ZONE.ARCHIVE].findIndex(c => c.instanceId === mascots[0].instanceId);
      const mascot = own.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
      mascot.faceDown = false;
      me.attachedSupport = me.attachedSupport || [];
      me.attachedSupport.push(mascot);
      return { state, resolved: true, log: `お時間ですわ！: 附加 ${getCard(mascot.cardId)?.name||'?'}` };
    }
    // Multiple mascots in archive → let player pick which one
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE',
        player: ctx.player,
        message: 'お時間ですわ！: 選擇 1 張吉祥物附加給這個成員',
        cards: mascots.map(c => ({
          instanceId: c.instanceId, cardId: c.cardId,
          name: getCard(c.cardId)?.name || '', image: getCardImage(c.cardId),
        })),
        maxSelect: 1,
        afterAction: 'ATTACH_FROM_ARCHIVE_TO_MEMBER',
        targetInstanceId: me.instanceId,
      },
      log: 'お時間ですわ！: 選擇吉祥物',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-053 オーロ・クロニー (1st) effectB「時を超えた約束」
  // 「選擇自己舞台上1位標示#Promise的成員。這個回合中，該成員的藝能傷害+20。」
  //
  // Target picker for art-damage boost. Without a "boost picked member"
  // afterAction, fall through to MANUAL_EFFECT — player picks via Manual.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-053', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    return { state }; // MANUAL_EFFECT
  });

  // hBP07-053 art1「Everlasting Flower」
  // 「將自己吶喊牌組上方的1張牌發送給自己標示#Promise的成員。」
  // Player picks WHICH #Promise member receives the top cheer.
  reg('hBP07-053', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const own = state.players[ctx.player];
    const promiseMembers = getPromiseMembers(own);
    if (promiseMembers.length === 0) return { state, resolved: true, log: '無 #Promise 成員可送吶喊' };
    if (own.zones[ZONE.CHEER_DECK].length === 0) return { state, resolved: true, log: '吶喊牌組空' };
    if (promiseMembers.length === 1) {
      const target = promiseMembers[0];
      const cheer = own.zones[ZONE.CHEER_DECK].shift();
      cheer.faceDown = false;
      target.inst.attachedCheer = target.inst.attachedCheer || [];
      target.inst.attachedCheer.push(cheer);
      return { state, resolved: true, log: `Everlasting Flower: 吶喊→${getCard(target.inst.cardId)?.name||'?'}` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER',
        player: ctx.player,
        message: 'Everlasting Flower: 選擇 1 位 #Promise 成員接收吶喊',
        cards: memberPicks(promiseMembers),
        maxSelect: 1,
        afterAction: 'CHEER_FROM_DECK_TOP_TO_MEMBER',
      },
      log: 'Everlasting Flower: 選擇接收成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-054 オーロ・クロニー (1st Buzz) art1「I'm pretty shy…uwu」
  // 「將自己吶喊牌組上方的1張牌發送給自己標示#Promise的Buzz成員。」
  //
  // Player picks WHICH #Promise Buzz member.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-054', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const own = state.players[ctx.player];
    const buzzPromise = getStageMembers(own).filter(m => {
      const c = getCard(m.inst.cardId);
      return hasTag(m.inst, '#Promise') && (c?.bloom || '').includes('Buzz');
    });
    if (buzzPromise.length === 0) return { state, resolved: true, log: '無 #Promise Buzz 成員' };
    if (own.zones[ZONE.CHEER_DECK].length === 0) return { state, resolved: true, log: '吶喊牌組空' };
    if (buzzPromise.length === 1) {
      const target = buzzPromise[0];
      const cheer = own.zones[ZONE.CHEER_DECK].shift();
      cheer.faceDown = false;
      target.inst.attachedCheer = target.inst.attachedCheer || [];
      target.inst.attachedCheer.push(cheer);
      return { state, resolved: true, log: `I'm pretty shy: 吶喊→Buzz ${getCard(target.inst.cardId)?.name||'?'}` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER',
        player: ctx.player,
        message: 'I\'m pretty shy: 選擇 1 位 #Promise Buzz 成員接收吶喊',
        cards: memberPicks(buzzPromise),
        maxSelect: 1,
        afterAction: 'CHEER_FROM_DECK_TOP_TO_MEMBER',
      },
      log: 'I\'m pretty shy: 選擇接收 Buzz 成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-055 オーロ・クロニー (2nd) effectB「約束の未来へ」
  // 「選擇自己舞台上1位標示#Promise的成員。這個回合中，該成員的藝能傷害+50。」
  //
  // Target-picker for boost. Engine doesn't have a "boost picked member"
  // afterAction yet — fall through to MANUAL_EFFECT.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-055', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    return { state }; // MANUAL_EFFECT
  });

  return count;
}
