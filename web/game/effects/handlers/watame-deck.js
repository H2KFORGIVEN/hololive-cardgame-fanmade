// 角巻わため deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// 5-line spec block per handler: REAL / ACTION / AMBIGUITY / LIMITS / CONDITIONS.
//
// Already-wired わため cards (NOT redefined here):
//   - hBP03-068 art1 ON_ART_RESOLVE (cheer→黃色 picker): phaseC1
//   - hBP03-070 effectB+art1: phaseB-cards.js
//   - hBP03-072 effectG+art1+knockdown: phaseB+C1
//   - hBP07-001 oshi 角ドリル: phaseB-cards.js
//   - hBP07-008 effectC use-art-twice: phaseB-cards.js
//   - hBP07-009 art1 (in top50)
//   - hBP07-010 effectC: phaseB-cards.js
//   - hBP07-011 effectB+art1: top50-cards.js
//   - hBP07-012 effectB+art1: phaseB-cards.js
//   - hBP07-013 effectC+art1: phaseB-cards.js
//   - hBP07-014 effectG+art1: top50-cards.js
//   - hSD08-007 effectC: phaseB-cards.js
//
// Vanilla — skipped: hBP03-067, hBP03-069.

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

export function registerWatameDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-050 角巻わため (主推 PR) oshi/SP — yellow-PR enhance pattern.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-050', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const matches = own.zones[ZONE.DECK].filter(c =>
        isMember(getCard(c.cardId)?.type) && getCard(c.cardId)?.color === '黃'
      );
      if (matches.length === 0) {
        shuffleArr(own.zones[ZONE.DECK]);
        return { state, resolved: true, log: 'SP: 牌組無黃色成員 — 重新洗牌' };
      }
      return {
        state, resolved: false,
        prompt: {
          type: 'SEARCH_SELECT', player: ctx.player,
          message: 'SP「Birthday Gift ～Yellow～」: 選擇 1 張黃色成員加入手牌',
          cards: archivePicks(matches),
          maxSelect: 1, afterAction: 'ADD_TO_HAND',
        },
        log: 'SP: 搜尋黃色成員',
      };
    }
    const yellows = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.color === '黃');
    if (yellows.length === 0) return { state, resolved: true, log: 'oshi: 無黃色成員 — 跳過' };
    if (yellows.length === 1) {
      const target = yellows[0];
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: target.inst.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `oshi: ${getCard(target.inst.cardId)?.name||''} 本回合 +20` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'oshi「イエローエンハンス」: 選擇 1 位黃色成員 +20 藝能傷害',
        cards: memberPicks(yellows),
        maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER',
        amount: 20,
      },
      log: 'oshi: 選擇黃色成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP03-007 角巻わため (主推 hBP03) oshi「Member sheep いらっしゃい！」/ SP「わためは悪くないよねぇ？」
  // OSHI REAL: [每個回合一次]從自己的牌組展示1張粉絲並加入手牌。將牌組重新洗牌。
  // SP REAL:   [每場比賽一次]將自己吶喊牌組上方的2張牌，發送給自己的1位「角巻わため」。
  // ACTION: oshi → search 粉絲 from deck → hand;
  //         SP → 2× cheer-top → 1 picked わため
  // AMBIGUITY: oshi: 0 → reshuffle / ≥1 → SEARCH_SELECT
  //            SP: 0 わため → skip / 1 → auto / multi → SELECT_OWN_MEMBER
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: SP: cheer deck has ≥1 + ≥1 わため on stage
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-007', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      if (own.zones[ZONE.CHEER_DECK].length === 0) return { state, resolved: true, log: 'SP: 吶喊牌組空' };
      const watames = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.name === '角巻わため');
      if (watames.length === 0) return { state, resolved: true, log: 'SP: 舞台無「角巻わため」' };
      const attachOne = (target) => {
        if (own.zones[ZONE.CHEER_DECK].length === 0) return false;
        const cheer = own.zones[ZONE.CHEER_DECK].shift();
        cheer.faceDown = false;
        target.attachedCheer = target.attachedCheer || [];
        target.attachedCheer.push(cheer);
        return true;
      };
      if (watames.length === 1) {
        const t = watames[0].inst;
        attachOne(t); attachOne(t);
        return { state, resolved: true, log: `SP「わためは悪くない」: 2 張吶喊→${getCard(t.cardId)?.name||''}` };
      }
      // multi → MANUAL_EFFECT (the "1 picked わため" target picker + 2 cheers
      // is one-step but afterAction "attach 2 cheer to picked" doesn't exist)
      return { state }; // MANUAL_EFFECT — 2-cheer-to-picked-わため
    }
    // oshi: search 粉絲
    const matches = own.zones[ZONE.DECK].filter(c => getCard(c.cardId)?.type === '支援・粉絲');
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: 'oshi「Member sheep いらっしゃい！」: 牌組無粉絲' };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT', player: ctx.player,
        message: 'oshi「Member sheep いらっしゃい！」: 選擇 1 張粉絲加入手牌',
        cards: archivePicks(matches),
        maxSelect: 1, afterAction: 'ADD_TO_HAND',
      },
      log: 'oshi: 搜尋粉絲',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP03-071 角巻わため (1st) effectB「Member sheep おかえり～」/ art1「つのまきじゃんけん」
  // EFFECTB REAL: 可以將自己存檔區的1張「わためいと」返回手牌。
  // ART1 REAL: DMG:50 / 可以和對手猜拳，直到分出勝負為止：自己獲勝時，這個回合中，這個成員對紅色成員造成的傷害+30。
  // ACTION: effectB → optional return 「わためいと」 from archive → hand;
  //         art1 → rock-paper-scissors with opp; player wins → +30 vs red
  // AMBIGUITY: effectB archive 0 → skip; ≥1 → SELECT_FROM_ARCHIVE
  //            art1: RPS is interactive between two players → MANUAL_EFFECT
  // LIMITS: ON_BLOOM self-only / art-time
  // CONDITIONS: see REAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-071', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const matches = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.name === 'わためいと');
    if (matches.length === 0) return { state, resolved: true, log: 'Member sheep おかえり: 存檔無「わためいと」' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: 'Member sheep おかえり: 選擇 1 張「わためいと」回手牌',
        cards: archivePicks(matches),
        maxSelect: 1, afterAction: 'RETURN_FROM_ARCHIVE',
      },
      log: 'Member sheep おかえり: 選擇「わためいと」',
    };
  });
  reg('hBP03-071', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    return { state }; // MANUAL_EFFECT — RPS between two players is interactive
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-072 角巻わため (1st Buzz) art1「君と色違いのリュック」/ art2「わためと海辺デート」
  // ART1 REAL: DMG:50+ / [限定中心位置]如果這個成員有4張以上的吶喊卡，這個回合中，這個成員與自己的聯動成員藝能傷害+50。
  // ART2 REAL: DMG:80 / 如果自己的主推為「角巻わため」，可以將自己吶喊牌組上方的1張牌發送給自己的「角巻わため」。
  // ACTION: art1 center-only + ≥4 cheer → +50 self + collab turn boost
  //         art2 oshi=わため + cheer top → わため (auto if 1; picker if multi)
  // AMBIGUITY: art1 none; art2 target picker
  // LIMITS: art-time
  // CONDITIONS: see REAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-072', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    if (ctx.artKey === 'art1') {
      if (own.zones[ZONE.CENTER]?.instanceId !== me.instanceId) {
        return { state, resolved: true, log: '君と色違いのリュック: 非中心位置' };
      }
      const cheer = (me.attachedCheer || []).length;
      if (cheer < 4) return { state, resolved: true, log: `君と色違いのリュック: 吶喊=${cheer}<4` };
      // Apply +50 to self (already this art) + collab if exists
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 50, target: 'instance', instanceId: me.instanceId, duration: 'turn' });
      const collab = own.zones[ZONE.COLLAB];
      if (collab) {
        state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 50, target: 'instance', instanceId: collab.instanceId, duration: 'turn' });
      }
      return { state, resolved: true, log: `君と色違いのリュック: 中心+聯動 +50（吶喊=${cheer}）` };
    }
    if (ctx.artKey === 'art2') {
      if (getCard(own.oshi?.cardId)?.name !== '角巻わため') {
        return { state, resolved: true, log: 'わためと海辺デート: 主推非わため' };
      }
      if (own.zones[ZONE.CHEER_DECK].length === 0) return { state, resolved: true, log: '吶喊牌組空' };
      const watames = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.name === '角巻わため');
      if (watames.length === 0) return { state, resolved: true, log: '舞台無「角巻わため」' };
      if (watames.length === 1) {
        const t = watames[0].inst;
        const cheer = own.zones[ZONE.CHEER_DECK].shift();
        cheer.faceDown = false;
        t.attachedCheer = t.attachedCheer || [];
        t.attachedCheer.push(cheer);
        return { state, resolved: true, log: `わためと海辺デート: 吶喊→${getCard(t.cardId)?.name||''}` };
      }
      return {
        state, resolved: false,
        prompt: {
          type: 'SELECT_OWN_MEMBER', player: ctx.player,
          message: 'わためと海辺デート: 選擇 1 位「角巻わため」接收吶喊',
          cards: memberPicks(watames),
          maxSelect: 1, afterAction: 'CHEER_FROM_DECK_TOP_TO_MEMBER',
        },
        log: 'わためと海辺デート: 選擇わため',
      };
    }
    return { state, resolved: true };
  });

  return count;
}
