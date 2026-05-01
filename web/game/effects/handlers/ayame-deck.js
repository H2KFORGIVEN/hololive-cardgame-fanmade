// 百鬼あやめ deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// 5-line spec block per handler: REAL / ACTION / AMBIGUITY / LIMITS / CONDITIONS.
//
// Already-wired あやめ cards (NOT redefined here):
//   - hBP06-004 (oshi 鬼閻魔 / SP 二刀一閃): phaseB-cards.js
//   - hBP06-034 (Debut art1 cost+ +30 center boost): top50-cards.js
//   - hBP06-035 (Debut effectC search 道具/吉祥物/粉絲): phaseB-cards.js
//   - hBP06-037 (1st effectB+art1+art ResolveResolve): top50-cards.js
//   - hBP06-038 (1st effectC+art1): phaseB-cards.js
//   - hBP06-039 (2nd effectG+art1): top50-cards.js
//   - hSD02-004 (Debut effectC ぽよ余 +20): phaseB-cards.js
//   - hSD02-006 (1st effectB cost+ 20 special): phaseB-cards.js
//   - hSD02-007 (1st effectB look-2): phaseB-cards.js
//
// Vanilla — skipped: hSD02-002, hSD02-005, hSD02-008 (only art1).

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

export function registerAyameDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-015 百鬼あやめ (主推 PR) oshi「レッドエンハンス」/ SP「Birthday Gift ～Red～」
  // OSHI REAL: [每個回合一次]這個回合中，自己的1位紅色成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]從自己的牌組展示1張紅色成員並加入手牌。將牌組重新洗牌。
  // (Same wording pattern as other color-PR oshi cards.)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-015', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const matches = own.zones[ZONE.DECK].filter(c =>
        isMember(getCard(c.cardId)?.type) && getCard(c.cardId)?.color === '紅'
      );
      if (matches.length === 0) {
        shuffleArr(own.zones[ZONE.DECK]);
        return { state, resolved: true, log: 'SP: 牌組無紅色成員 — 重新洗牌' };
      }
      return {
        state, resolved: false,
        prompt: {
          type: 'SEARCH_SELECT', player: ctx.player,
          message: 'SP「Birthday Gift ～Red～」: 選擇 1 張紅色成員加入手牌',
          cards: archivePicks(matches),
          maxSelect: 1, afterAction: 'ADD_TO_HAND',
        },
        log: 'SP: 搜尋紅色成員',
      };
    }
    const reds = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.color === '紅');
    if (reds.length === 0) return { state, resolved: true, log: 'oshi: 無紅色成員 — 跳過' };
    if (reds.length === 1) {
      const target = reds[0];
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: target.inst.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `oshi: ${getCard(target.inst.cardId)?.name||''} 本回合 +20` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'oshi「レッドエンハンス」: 選擇 1 位紅色成員 +20 藝能傷害',
        cards: memberPicks(reds),
        maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER',
        amount: 20,
      },
      log: 'oshi: 選擇紅色成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP02-034 百鬼あやめ (1st Buzz) art2「オーガニックショット」
  // REAL: DMG:80 / 這個成員帶有道具或吉祥物時，給予對手的中心成員或聯動成員30點特殊傷害。
  // ACTION: art2 → if this carries 道具/吉祥物 → +30 special to opp center or collab (player picks)
  // AMBIGUITY: opp center vs collab → 0 → skip; 1 → auto; 2 → MANUAL_EFFECT (no
  //   afterAction yet for picking opp target with special damage).
  // LIMITS: art-time
  // CONDITIONS: this carries ≥1 道具 or 吉祥物
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP02-034', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art2') return { state, resolved: true };
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    const has = (me.attachedSupport || []).some(s => {
      const t = getCard(s.cardId)?.type;
      return t === '支援・道具' || t === '支援・吉祥物';
    });
    if (!has) return { state, resolved: true, log: 'オーガニックショット: 未帶道具/吉祥物' };
    const opp = state.players[1 - ctx.player];
    const center = opp.zones[ZONE.CENTER];
    const collab = opp.zones[ZONE.COLLAB];
    if (center && !collab) {
      center.damage = (center.damage || 0) + 30;
      return { state, resolved: true, log: 'オーガニックショット: 對手中心 30 特殊傷害' };
    }
    if (!center && collab) {
      collab.damage = (collab.damage || 0) + 30;
      return { state, resolved: true, log: 'オーガニックショット: 對手聯動 30 特殊傷害' };
    }
    if (!center && !collab) {
      return { state, resolved: true, log: 'オーガニックショット: 對手前場無成員' };
    }
    // Both: SELECT_TARGET picker → OPP_MEMBER_DAMAGE (Phase 2.4 follow-up)
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_TARGET', player: ctx.player,
        message: 'オーガニックショット: 選擇對手中心或聯動（30 特殊傷害）',
        cards: [center, collab].map(m => ({
          instanceId: m.instanceId, cardId: m.cardId,
          name: getCard(m.cardId)?.name || '',
          image: getCardImage(m.cardId),
        })),
        maxSelect: 1, afterAction: 'OPP_MEMBER_DAMAGE',
        damageAmount: 30,
      },
      log: 'オーガニックショット: 選擇對手中心/聯動',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD02-001 百鬼あやめ (主推 SD02) oshi「レッドマイク」/ SP「さあ！もう一度！」
  // OSHI REAL: [每個回合一次]這個回合中，自己的紅色中心成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]將自己存檔區的1張紅色成員返回手牌。
  // ACTION: oshi → red center auto +20; SP → SELECT_FROM_ARCHIVE red member → hand
  // AMBIGUITY: oshi: red center 0 → skip; 1 → auto
  //            SP: red archive members 0 → skip; ≥1 → SELECT_FROM_ARCHIVE
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: see REAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD02-001', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const matches = own.zones[ZONE.ARCHIVE].filter(c =>
        isMember(getCard(c.cardId)?.type) && getCard(c.cardId)?.color === '紅'
      );
      if (matches.length === 0) return { state, resolved: true, log: 'SP「さあ！もう一度！」: 存檔無紅色成員' };
      return {
        state, resolved: false,
        prompt: {
          type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
          message: 'SP「さあ！もう一度！」: 選擇 1 張紅色成員回手牌',
          cards: archivePicks(matches),
          maxSelect: 1, afterAction: 'RETURN_FROM_ARCHIVE',
        },
        log: 'SP: 選擇紅色成員',
      };
    }
    const center = own.zones[ZONE.CENTER];
    if (!center || getCard(center.cardId)?.color !== '紅') {
      return { state, resolved: true, log: 'oshi「レッドマイク」: 中心非紅色 — 跳過' };
    }
    state._turnBoosts = state._turnBoosts || [];
    state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: center.instanceId, duration: 'turn' });
    return { state, resolved: true, log: `oshi: 中心 ${getCard(center.cardId)?.name||''} 本回合 +20` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD02-003 百鬼あやめ (Debut SD02) effectC「業」
  // REAL: 給予對手的聯動成員10點特殊傷害。
  // ACTION: 10 special to opp collab
  // AMBIGUITY: target = opp collab (single)
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: opp collab exists
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD02-003', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const opp = state.players[1 - ctx.player];
    const oppCollab = opp.zones[ZONE.COLLAB];
    if (!oppCollab) return { state, resolved: true, log: '業: 對手無聯動' };
    oppCollab.damage = (oppCollab.damage || 0) + 10;
    return { state, resolved: true, log: '業: 對手聯動 10 特殊傷害' };
  });

  return count;
}
