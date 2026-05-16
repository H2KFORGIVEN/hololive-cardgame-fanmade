// 兎田ぺこら deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// Each handler has the real zh-TW effect text in a 5-line spec block:
//   REAL       — the literal effect text
//   ACTION     — what the handler does
//   AMBIGUITY  — how it handles 0/1/multi candidates
//   LIMITS     — once-per-turn / once-per-game / etc.
//   CONDITIONS — required state for the effect to fire
//
// Already-wired ぺこら cards (NOT redefined here, since they ship correct):
//   - hBP01-004 (oshi 野兎たち～ / SP 幸運兎): phaseB-cards.js F-3.3
//   - hBP01-038 (Debut art1 dice→+20): phaseB-cards.js
//   - hBP01-041 (1st effectB cheer→center/collab): phaseB-cards.js
//     [minor: auto-picks center; player choice would be cleaner — deferred]
//   - hBP01-042 (1st art2 dice/pip): phaseC1-cards.js
//   - hBP01-043 (2nd effectB heal 50 / art1 3-dice): phaseC1-cards.js
//   - hBP01-096 (Spot effectC dice→search Buzz): phaseB-cards.js
//   - hBP03-023 (1st Buzz collab+art1): phaseC1-cards.js (uses usedCollab proxy)
//   - hBP05-016 (2nd effectG+art1 dice sum): phaseB-cards.js
//
// This file implements the gaps:
//   hBD24-017 (oshi/SP green enhance), hBP01-039, hBP05-014, hBP05-015,
//   hSD09-006, hYS01-002.
// Plus a refined hBP03-023 art1 that uses state._diceRollsThisTurn (Phase 2
// added that counter; the C1 handler still uses the older usedCollab proxy).

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

function hasTag(inst, tag) {
  const t = getCard(inst.cardId)?.tag || '';
  return (typeof t === 'string' ? t : JSON.stringify(t)).includes(tag);
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

export function registerPekoraDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-017 兎田ぺこら (主推 PR) oshi「グリーンエンハンス」/ SP「Birthday Gift ～Green～」
  // OSHI REAL: [每個回合一次]這個回合中，自己的1位綠色成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]從自己的牌組展示1張綠色成員並加入手牌。將牌組重新洗牌。
  // ACTION: oshi → pick own green member +20; SP → search 1 green member
  // AMBIGUITY: oshi 0→skip / 1→auto / multi→SELECT_OWN_MEMBER
  //            SP    0→reshuffle / ≥1→SEARCH_SELECT
  // LIMITS: oshi 1/turn, SP 1/game (engine handles)
  // CONDITIONS: none beyond skill type
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-017', HOOK.ON_OSHI_SKILL, (state, ctx) => {
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
    // oshi
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
  // hBP01-039 兎田ぺこら (Debut) effectC「ギャラクシーアイドル」
  // REAL: 自己的主推為「兎田ぺこら」時，可以擲1次骰子：偶數時，將自己吶喊牌組上方的1張牌發送給自己的成員。
  // ACTION: oshi-name gate + roll d6, even → cheer top → pick own member
  // AMBIGUITY: stage 0→skip / 1→auto / multi→SELECT_OWN_MEMBER + CHEER_FROM_DECK_TOP_TO_MEMBER
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: oshi name = 兎田ぺこら; cheer deck non-empty; even roll
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP01-039', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (getCard(own.oshi?.cardId)?.name !== '兎田ぺこら') {
      return { state, resolved: true, log: 'ギャラクシーアイドル: 主推非ぺこら — 跳過' };
    }
    const r = rollDieFor(state, { player: ctx.player, member: ctx.memberInst });
    if (r % 2 !== 0) return { state, resolved: true, log: `骰 ${r}（奇數）: 無效果` };
    if (own.zones[ZONE.CHEER_DECK].length === 0) {
      return { state, resolved: true, log: `骰 ${r}（偶數）: 吶喊牌組空 — 跳過` };
    }
    const stage = getStageMembers(own);
    if (stage.length === 0) return { state, resolved: true };
    if (stage.length === 1) {
      const target = stage[0];
      const cheer = own.zones[ZONE.CHEER_DECK].shift();
      cheer.faceDown = false;
      target.inst.attachedCheer = target.inst.attachedCheer || [];
      target.inst.attachedCheer.push(cheer);
      return { state, resolved: true, log: `骰 ${r}（偶數）: 吶喊→${getCard(target.inst.cardId)?.name||''}` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: `骰 ${r}（偶數）: 選擇 1 位成員接收吶喊`,
        cards: memberPicks(stage),
        maxSelect: 1, afterAction: 'CHEER_FROM_DECK_TOP_TO_MEMBER',
      },
      log: `骰 ${r}（偶數）: 選擇接收成員`,
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-014 兎田ぺこら (Debut white) art1「かわいいぺこか？」
  // REAL: DMG:20 / 可以擲1次骰子：如果為偶數，從自己的牌組抽1張牌。
  // ACTION: optional dice → even draws 1
  // AMBIGUITY: none (auto-roll, no target)
  // LIMITS: art-time
  // CONDITIONS: deck has ≥1 card to draw
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-014', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const r = rollDieFor(state, { player: ctx.player, member: ctx.memberInst });
    if (r % 2 !== 0) return { state, resolved: true, log: `骰 ${r}（奇數）: 無效果` };
    drawCards(state.players[ctx.player], 1);
    return { state, resolved: true, log: `骰 ${r}（偶數）: 抽 1` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-015 兎田ぺこら (1st white) art1「にんじん…」/ art2「いらないぺこ？」
  // ART1 REAL: DMG:30 / 如果自己的舞台上有3位以上標示#3期生的成員，將自己吶喊牌組上方的1張牌發送給這個成員。
  // ART2 REAL: DMG:30 / 如果自己主推的顏色為白色，從自己的牌組抽1張牌。
  // ACTION: art1 cond → cheer top → self; art2 cond → draw 1
  // AMBIGUITY: art1 target is self (auto); art2 no target
  // LIMITS: art-time conditions
  // CONDITIONS: art1 ≥3 #3期生 on stage; art2 oshi color=白
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-015', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const own = state.players[ctx.player];
    if (ctx.artKey === 'art1') {
      const count3rd = getStageMembers(own).filter(m => hasTag(m.inst, '#3期生')).length;
      if (count3rd < 3) return { state, resolved: true, log: `にんじん…: #3期生=${count3rd}<3` };
      if (own.zones[ZONE.CHEER_DECK].length === 0) return { state, resolved: true, log: 'にんじん…: 吶喊牌組空' };
      const me = ctx.memberInst;
      if (!me) return { state, resolved: true };
      const cheer = own.zones[ZONE.CHEER_DECK].shift();
      cheer.faceDown = false;
      me.attachedCheer = me.attachedCheer || [];
      me.attachedCheer.push(cheer);
      return { state, resolved: true, log: 'にんじん…: 吶喊牌組頂 → 此成員' };
    }
    if (ctx.artKey === 'art2') {
      const oshi = own.oshi ? getCard(own.oshi.cardId) : null;
      if (oshi?.color !== '白') return { state, resolved: true, log: 'いらないぺこ？: 主推非白色' };
      drawCards(own, 1);
      return { state, resolved: true, log: 'いらないぺこ？: 主推白色 → 抽 1' };
    }
    return { state, resolved: true };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD09-006 兎田ぺこら (Debut SD09) effectC「あんたたち働くぺこー！」
  // REAL: 如果在自己後攻的第一個回合，將自己吶喊牌組上方的1張牌，發送給自己標示#3期生的成員。
  // ACTION: post-attack first turn check → pick own #3期生 + cheer top
  // AMBIGUITY: 0 #3期生→skip; 1→auto; multi→SELECT_OWN_MEMBER
  // LIMITS: ON_COLLAB self-only; only on this player's first turn AND going second
  // CONDITIONS: turnNumber=2 + state.firstPlayer != ctx.player
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD09-006', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const goingSecond = state.firstPlayer != null && state.firstPlayer !== ctx.player;
    const isFirstTurnForMe = state.turnNumber === 2 && goingSecond;
    if (!isFirstTurnForMe) return { state, resolved: true, log: 'あんたたち働くぺこー！: 非後攻第一回合' };
    const own = state.players[ctx.player];
    if (own.zones[ZONE.CHEER_DECK].length === 0) return { state, resolved: true, log: '吶喊牌組空' };
    const targets = getStageMembers(own).filter(m => hasTag(m.inst, '#3期生'));
    if (targets.length === 0) return { state, resolved: true, log: '舞台無 #3期生' };
    if (targets.length === 1) {
      const target = targets[0];
      const cheer = own.zones[ZONE.CHEER_DECK].shift();
      cheer.faceDown = false;
      target.inst.attachedCheer = target.inst.attachedCheer || [];
      target.inst.attachedCheer.push(cheer);
      return { state, resolved: true, log: `あんたたち働くぺこー！: 吶喊→${getCard(target.inst.cardId)?.name||''}` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'あんたたち働くぺこー！: 選擇 1 位 #3期生 接收吶喊',
        cards: memberPicks(targets),
        maxSelect: 1, afterAction: 'CHEER_FROM_DECK_TOP_TO_MEMBER',
      },
      log: 'あんたたち働くぺこー！: 選擇 #3期生',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hYS01-002 兎田ぺこら (主推 hYS01) oshi「グリーンバトン」/ SP「みんな頑張ろー！」
  // OSHI REAL: [每個回合一次]這個回合中，自己的綠色聯動成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]自己所有的綠色成員HP回復20點。
  // ACTION: oshi → if own collab is green, +20 turn boost (auto, no picker);
  //         SP → heal 20 to all own green members (auto)
  // AMBIGUITY: oshi: 0 green collab → skip; ≥1 (only ever 0/1) → auto
  //            SP: applies to every green stage member
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: oshi: own collab exists AND color = 綠; SP: ≥1 green member
  // ─────────────────────────────────────────────────────────────────────
  reg('hYS01-002', HOOK.ON_OSHI_SKILL, (state, ctx) => {
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
      return { state, resolved: true, log: `SP「みんな頑張ろー！」: ${greens.length} 綠色成員回復 20HP（實際補 ${healed} 位）` };
    }
    // oshi: only the green collab gets +20
    const collab = own.zones[ZONE.COLLAB];
    if (!collab || getCard(collab.cardId)?.color !== '綠') {
      return { state, resolved: true, log: 'oshi「グリーンバトン」: 聯動無綠色成員 — 跳過' };
    }
    state._turnBoosts = state._turnBoosts || [];
    state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: collab.instanceId, duration: 'turn' });
    return { state, resolved: true, log: `oshi: 聯動 ${getCard(collab.cardId)?.name||''} 本回合 +20` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP03-023 兎田ぺこら (1st Buzz) art1 refinement
  // REAL: DMG:80+ / 這個回合，因自己「兎田ぺこら」的效果擲了骰子1次以上時，這個藝能傷害+40。
  // ACTION: replace the C1 proxy (usedCollab) with state._diceRollsThisTurn check
  //         (Phase 2 added the counter; this gate is now precise)
  // AMBIGUITY: none
  // LIMITS: art-time
  // CONDITIONS: own _diceRollsThisTurn ≥ 1
  // Note: registered AFTER the C1 file (registerAll order: phaseC1 → ...
  //       → pekoraDeck), so this OVERRIDES the C1 stub.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-023', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const rolls = own._diceRollsThisTurn || 0;
    if (rolls < 1) return { state, resolved: true, log: `カードするぺこ: 本回合擲骰 ${rolls} 次 — 無加成` };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 40, target: 'self', duration: 'instant' },
      log: `カードするぺこ: 本回合擲骰 ${rolls} 次 → +40`,
    };
  });

  return count;
}
