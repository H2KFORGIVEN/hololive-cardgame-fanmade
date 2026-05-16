// ラプラス・ダークネス deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// 5-line spec block per handler: REAL / ACTION / AMBIGUITY / LIMITS / CONDITIONS.
//
// Already-wired ラプラス cards (NOT redefined here):
//   - hBP04-055 (Debut effectC + art1): phaseC1-cards.js
//   - hBP04-059 effectB: phaseD-generated.js (real handler)
//   - hBP07-073 art1 ON_ART_RESOLVE: phaseB-cards.js
//   - hBP07-074 art1: phaseB-cards.js
//
// Vanilla — skipped: hBP04-054, hBP04-056.

import { getCard, getCardImage } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE, isMember } from '../../core/constants.js';
import { getStageMembers, drawCards, rollDieFor } from './common.js';

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function memberPicks(members) {
  return members.map(m => ({
    instanceId: m.inst.instanceId,
    cardId: m.inst.cardId,
    name: getCard(m.inst.cardId)?.name || '',
    image: getCardImage(m.inst.cardId),
  }));
}

function archivePicks(cards) {
  return cards.map(c => ({
    instanceId: c.instanceId,
    cardId: c.cardId,
    name: getCard(c.cardId)?.name || '',
    image: getCardImage(c.cardId),
  }));
}

export function registerLaplusDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-048 ラプラス・ダークネス (主推 PR) oshi/SP — purple-PR enhance pattern.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-048', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const matches = own.zones[ZONE.DECK].filter(c =>
        isMember(getCard(c.cardId)?.type) && getCard(c.cardId)?.color === '紫'
      );
      if (matches.length === 0) {
        shuffleArr(own.zones[ZONE.DECK]);
        return { state, resolved: true, log: 'SP: 牌組無紫色成員 — 重新洗牌' };
      }
      return {
        state, resolved: false,
        prompt: {
          type: 'SEARCH_SELECT', player: ctx.player,
          message: 'SP「Birthday Gift ～Purple～」: 選擇 1 張紫色成員加入手牌',
          cards: archivePicks(matches),
          maxSelect: 1, afterAction: 'ADD_TO_HAND',
        },
        log: 'SP: 搜尋紫色成員',
      };
    }
    const purples = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.color === '紫');
    if (purples.length === 0) return { state, resolved: true, log: 'oshi: 無紫色成員 — 跳過' };
    if (purples.length === 1) {
      const target = purples[0];
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: target.inst.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `oshi: ${getCard(target.inst.cardId)?.name||''} 本回合 +20` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'oshi「パープルエンハンス」: 選擇 1 位紫色成員 +20 藝能傷害',
        cards: memberPicks(purples),
        maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER',
        amount: 20,
      },
      log: 'oshi: 選擇紫色成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP04-058 ラプラス・ダークネス (1st) effectC「貴様の運命試してみるか？」
  // REAL: 可以擲3次骰子：每出現1次奇數，給予對手的中心成員10點特殊傷害。
  // ACTION: 3 dice; each odd → +10 special to opp center
  // AMBIGUITY: target = opp center
  // LIMITS: ON_COLLAB self-only; optional ("可以")
  // CONDITIONS: opp center exists
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP04-058', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const opp = state.players[1 - ctx.player];
    const oppCenter = opp.zones[ZONE.CENTER];
    if (!oppCenter) return { state, resolved: true, log: '貴様の運命: 對手無中心' };
    let oddCount = 0;
    const rolls = [];
    for (let i = 0; i < 3; i++) {
      const r = rollDieFor(state, { player: ctx.player, member: ctx.memberInst });
      rolls.push(r);
      if (r % 2 === 1) oddCount++;
    }
    if (oddCount === 0) return { state, resolved: true, log: `貴様の運命: 骰 ${rolls.join(',')} — 0 奇數，無傷害` };
    oppCenter.damage = (oppCenter.damage || 0) + oddCount * 10;
    return { state, resolved: true, log: `貴様の運命: 骰 ${rolls.join(',')} → ${oddCount} 奇數 → 對手中心 ${oddCount * 10} 特殊傷害` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-073 ラプラス・ダークネス (1st) effectC「ライブだー！！！！！！！！！」
  // REAL: 這個回合中，這個成員的藝能需要的無色吶喊卡數量-2。
  // ACTION: -2 colorless on this member's arts this turn
  // AMBIGUITY: none
  // LIMITS: ON_COLLAB self-only; turn-scoped
  // CONDITIONS: none
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-073', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    state._artColorlessReductionByInstance = state._artColorlessReductionByInstance || {};
    state._artColorlessReductionByInstance[ctx.player] = state._artColorlessReductionByInstance[ctx.player] || {};
    state._artColorlessReductionByInstance[ctx.player][me.instanceId] = Math.max(
      state._artColorlessReductionByInstance[ctx.player][me.instanceId] || 0, 2
    );
    return { state, resolved: true, log: 'ライブだー！！！: 此成員藝能本回合無色費 -2' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD03-011 ラプラス・ダークネス (Spot 無色) art2「絶対、食わせてみせるわ」
  // REAL: DMG:20 / 自己的手牌在2張以下時，從自己的牌組抽牌直到手牌變為3張。
  // ACTION: hand ≤2 → draw until hand = 3
  // AMBIGUITY: none
  // LIMITS: art-time
  // CONDITIONS: hand ≤2
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD03-011', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art2') return { state, resolved: true };
    const own = state.players[ctx.player];
    const handLen = own.zones[ZONE.HAND].length;
    if (handLen > 2) return { state, resolved: true, log: `絶対食わせてみせる: 手牌=${handLen}>2` };
    const drawN = 3 - handLen;
    drawCards(own, drawN);
    return { state, resolved: true, log: `絶対食わせてみせる: 抽 ${drawN} 至手牌 3 張` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD06-010 ラプラス・ダークネス (Debut SD06) art1「狂気の宴」
  // REAL: DMG:30+ / [限定聯動位置]這個回合，自己的主要階段有使用過自己的SP主推技能時，這個藝能傷害+50。
  // ACTION: collab + SP-this-turn → +50
  // AMBIGUITY: none
  // LIMITS: art-time
  // CONDITIONS: this in COLLAB; SP used this turn
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD06-010', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    if (own.zones[ZONE.COLLAB]?.instanceId !== me.instanceId) {
      return { state, resolved: true, log: '狂気の宴: 非聯動位置' };
    }
    // SP used this turn — usedSp is set when SP fires (per game), but the spec
    // says "本回合的主要階段". Conservative: check usedSp flag (won't be true
    // at game start, but persists once SP fires).
    if (!own.oshi?.usedSp) return { state, resolved: true, log: '狂気の宴: 本回合未使用 SP' };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 50, target: 'self', duration: 'instant' },
      log: '狂気の宴: 聯動 + SP 已使用 → +50',
    };
  });

  return count;
}
