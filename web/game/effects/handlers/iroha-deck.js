// 風真いろは deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// 5-line spec block per handler: REAL / ACTION / AMBIGUITY / LIMITS / CONDITIONS.
//
// Already-wired いろは cards (NOT redefined here):
//   - hBP01-050 (effectG passive + art1 cheer→holoX): phaseB-cards.js
//   - hBP01-051 (1st Buzz art1 cheer-count): phaseB-cards.js
//   - hBP03-024 (2nd effectB+art1): phaseC1-cards.js
//   - hBP06-003 (oshi 迷ったらまず実行 / SP): phaseB-cards.js
//   - hBP06-023 (Debut effectC post-attack first-turn search Buzz): top50-cards.js
//   - hBP06-025 (1st effectG +20 to other holoX): phaseB-cards.js
//   - hBP06-026 (1st Buzz effectG center-only on collab): phaseB-cards.js + top50
//   - hBP06-027 (2nd effectG/art): phaseB + top50
//   - hSD06-005 (1st effectB cheer→holoX): phaseB-cards.js
//   - hSD06-006 (1st Buzz effectB search チャキ丸/ぽこべぇ): phaseB-cards.js
//   - hSD06-007 (2nd art1): phaseB-cards.js
//
// Vanilla — skipped: hBP01-048, hBP01-049, hBP06-022, hBP06-024, hSD06-004.

import { getCard, getCardImage } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE, isMember } from '../../core/constants.js';
import { getStageMembers } from './common.js';

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

export function registerIrohaDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-054 風真いろは (主推 PR) oshi「グリーンエンハンス」/ SP「Birthday Gift ～Green～」
  // OSHI REAL: [每個回合一次]這個回合中，自己的1位綠色成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]從自己的牌組展示1張綠色成員並加入手牌。將牌組重新洗牌。
  // ACTION: oshi pick green +20 / SP search green member
  // AMBIGUITY: oshi 0→skip, 1→auto, multi→SELECT_OWN_MEMBER. SP 0→reshuffle, ≥1→SEARCH_SELECT
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: none
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-054', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const matches = own.zones[ZONE.DECK].filter(c =>
        isMember(getCard(c.cardId)?.type) && getCard(c.cardId)?.color === '綠'
      );
      if (matches.length === 0) {
        shuffleArr(own.zones[ZONE.DECK]);
        return { state, resolved: true, log: 'SP: 牌組無綠色成員 — 重新洗牌' };
      }
      return {
        state, resolved: false,
        prompt: {
          type: 'SEARCH_SELECT', player: ctx.player,
          message: 'SP「Birthday Gift ～Green～」: 選擇 1 張綠色成員加入手牌',
          cards: archivePicks(matches),
          maxSelect: 1, afterAction: 'ADD_TO_HAND',
        },
        log: 'SP: 搜尋綠色成員',
      };
    }
    const greens = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.color === '綠');
    if (greens.length === 0) return { state, resolved: true, log: 'oshi: 無綠色成員 — 跳過' };
    if (greens.length === 1) {
      const target = greens[0];
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: target.inst.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `oshi: ${getCard(target.inst.cardId)?.name||''} 本回合 +20` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'oshi「グリーンエンハンス」: 選擇 1 位綠色成員 +20 藝能傷害',
        cards: memberPicks(greens),
        maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER',
        amount: 20,
      },
      log: 'oshi: 選擇綠色成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-030 風真いろは (2nd) effectB「holoRêve -いろは-」/ art1「たくさんの宝物」
  // EFFECTB REAL: 從Buzz成員綻放時，自己的1位成員HP回復100點。
  // ART1 REAL: DMG:100 / 可以將這個成員的2張吶喊卡放到存檔區：從自己的牌組抽2張牌。
  // ACTION: effectB → if blooming from a Buzz, heal 100 to picked member;
  //         art1 → optional cost (this member's 2 cheer → archive) + draw 2
  // AMBIGUITY: effectB target picker (multi members possible)
  // LIMITS: effectB on bloom; art1 art-time
  // CONDITIONS: effectB: prior bloomStack entry has bloom='1st Buzz'
  //   art1: ≥2 cheer attached
  // Cost-bearing art1 → MANUAL_EFFECT.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-030', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    // bloomStack last entry tells us the previous level
    const stack = me.bloomStack || [];
    const prev = stack[stack.length - 1];
    if (!prev || getCard(prev.cardId)?.bloom !== '1st Buzz') {
      return { state, resolved: true, log: 'holoRêve: 非從 Buzz 綻放' };
    }
    const own = state.players[ctx.player];
    const damaged = getStageMembers(own).filter(m => (m.inst.damage || 0) > 0);
    if (damaged.length === 0) return { state, resolved: true, log: 'holoRêve: 無受傷成員' };
    if (damaged.length === 1) {
      const t = damaged[0].inst;
      t.damage = Math.max(0, t.damage - 100);
      return { state, resolved: true, log: `holoRêve: ${getCard(t.cardId)?.name||''} 回復 100HP` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'holoRêve: 選擇 1 位成員回復 100HP',
        cards: memberPicks(damaged),
        maxSelect: 1, afterAction: 'HEAL_PICKED_MEMBER',
        amount: 100,
      },
      log: 'holoRêve: 選擇受傷成員',
    };
  });
  reg('hBP07-030', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    return { state }; // MANUAL_EFFECT — optional cost (2 cheer → archive) + draw 2
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD06-001 風真いろは (主推 SD06) oshi「グリーンマイク」/ SP「みんな頑張ろー！」
  // OSHI REAL: [每個回合一次]這個回合中，自己的綠色中心成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]自己所有的綠色成員HP回復20點。
  // ACTION: oshi → green center auto +20; SP → heal 20 to all green members
  // AMBIGUITY: none (auto resolve, no picker needed)
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: oshi: own center exists AND color = 綠; SP: ≥1 green member
  // (Same wording as hYS01-002 but on different cardId.)
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD06-001', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const greens = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.color === '綠');
      if (greens.length === 0) return { state, resolved: true, log: 'SP: 無綠色成員 — 跳過' };
      let healed = 0;
      for (const m of greens) {
        if ((m.inst.damage || 0) > 0) {
          m.inst.damage = Math.max(0, m.inst.damage - 20);
          healed++;
        }
      }
      return { state, resolved: true, log: `SP「みんな頑張ろー！」: ${greens.length} 綠色成員回 20HP（實補 ${healed}）` };
    }
    const center = own.zones[ZONE.CENTER];
    if (!center || getCard(center.cardId)?.color !== '綠') {
      return { state, resolved: true, log: 'oshi「グリーンマイク」: 中心非綠色 — 跳過' };
    }
    state._turnBoosts = state._turnBoosts || [];
    state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: center.instanceId, duration: 'turn' });
    return { state, resolved: true, log: `oshi: 中心 ${getCard(center.cardId)?.name||''} 本回合 +20` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD06-002 風真いろは (Debut SD06) effectC「のっと！ﾆﾝﾆﾝ！！」
  // REAL: 自己的1位成員HP回復10點。
  // ACTION: heal 10 to picked own damaged member
  // AMBIGUITY: damaged 0 → skip; 1 → auto; multi → SELECT_OWN_MEMBER
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: ≥1 damaged member
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD06-002', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const damaged = getStageMembers(own).filter(m => (m.inst.damage || 0) > 0);
    if (damaged.length === 0) return { state, resolved: true, log: 'のっと！ﾆﾝﾆﾝ！！: 無受傷成員' };
    if (damaged.length === 1) {
      const t = damaged[0].inst;
      t.damage = Math.max(0, t.damage - 10);
      return { state, resolved: true, log: `のっと！ﾆﾝﾆﾝ！！: ${getCard(t.cardId)?.name||''} 回 10HP` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'のっと！ﾆﾝﾆﾝ！！: 選擇 1 位成員回 10HP',
        cards: memberPicks(damaged),
        maxSelect: 1, afterAction: 'HEAL_PICKED_MEMBER',
        amount: 10,
      },
      log: 'のっと！ﾆﾝﾆﾝ！！: 選擇受傷成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD06-003 風真いろは (Debut SD06) art1「一刀両断叩き斬る」
  // REAL: DMG:30+ / 自己中心成員的HP有減少時，這個藝能傷害+10。
  // ACTION: +10 if own center has damage > 0
  // AMBIGUITY: none
  // LIMITS: art-time
  // CONDITIONS: own center.damage > 0
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD06-003', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const center = own.zones[ZONE.CENTER];
    if (!center || (center.damage || 0) <= 0) {
      return { state, resolved: true, log: '一刀両断叩き斬る: 中心 HP 未減少' };
    }
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
      log: '一刀両断叩き斬る: 中心 HP 減少 → +10',
    };
  });

  return count;
}
