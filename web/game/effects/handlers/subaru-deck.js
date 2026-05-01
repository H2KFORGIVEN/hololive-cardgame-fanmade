// 大空スバル deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// Each handler has the real zh-TW effect text in a 5-line spec block:
//   REAL       — the literal effect text
//   ACTION     — what the handler does
//   AMBIGUITY  — how it handles 0/1/multi candidates
//   LIMITS     — once-per-turn / once-per-game / etc.
//   CONDITIONS — required state for the effect to fire
//
// Already-wired スバル cards (NOT redefined here):
//   - hBP04-006 (oshi メンタル！ / SP リアクション芸): phaseB-cards.js
//   - hBP04-068 (Debut effectG -20 from opp 1st): phaseB-cards.js
//   - hBP04-070 (1st effectC pick member +10/cheer): phaseB-cards.js
//   - hBP04-072 (2nd effectB+art1): phaseB-cards.js
//   - hBP06-080 (1st effectB+art1): phaseB-cards.js
//   - hBP06-081 (2nd effectB+art1): phaseB-cards.js
//
// Vanilla (no effect text) — skipped: hBP04-067, hBP04-069, hSD19-002, hSD19-006.

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

export function registerSubaruDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-056 大空スバル (主推 PR) oshi「イエローエンハンス」/ SP「Birthday Gift ～Yellow～」
  // OSHI REAL: [每個回合一次]這個回合中，自己的1位黃色成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]從自己的牌組展示1張黃色成員並加入手牌。將牌組重新洗牌。
  // ACTION: oshi → pick own yellow +20; SP → search yellow member
  // AMBIGUITY: oshi 0→skip / 1→auto / multi→SELECT_OWN_MEMBER
  //            SP    0→reshuffle / ≥1→SEARCH_SELECT
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: none
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-056', HOOK.ON_OSHI_SKILL, (state, ctx) => {
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
  // hBP04-071 大空スバル (1st) art1「しゅばっ！」
  // REAL: DMG:20 / 將自己吶喊牌組上方的1張牌，發送給這個成員。
  // ACTION: cheer top → self (mandatory)
  // AMBIGUITY: target = self
  // LIMITS: art-time
  // CONDITIONS: cheer deck non-empty
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP04-071', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (own.zones[ZONE.CHEER_DECK].length === 0) return { state, resolved: true, log: 'しゅばっ！: 吶喊牌組空' };
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    const cheer = own.zones[ZONE.CHEER_DECK].shift();
    cheer.faceDown = false;
    me.attachedCheer = me.attachedCheer || [];
    me.attachedCheer.push(cheer);
    return { state, resolved: true, log: 'しゅばっ！: 吶喊牌組頂 → 此成員' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP06-078 大空スバル (Debut yellow) effectC「地球&テラ」
  // REAL: 可以將這個成員的1張吶喊卡放到存檔區：從自己的牌組展示1張與自己主推相同卡名的Debut成員並加入手牌。將牌組重新洗牌。
  // ACTION: optional cost (own cheer→archive) + search same-oshi-name Debut → hand
  // AMBIGUITY: cost picker required (this member's cheer)
  // LIMITS: ON_COLLAB self-only; optional ("可以")
  // CONDITIONS: this member has ≥1 cheer; deck has ≥1 same-name Debut
  // Cost-bearing → MANUAL_EFFECT (cheer-archive afterAction missing for self-source).
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP06-078', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    // Phase 2.4 #1: cost-bearing afterAction with followupSearch.
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    const cheers = (me.attachedCheer || []).map(c => ({
      instanceId: c.instanceId, cardId: c.cardId,
      name: getCard(c.cardId)?.name || '吶喊',
      image: getCardImage(c.cardId),
    }));
    if (cheers.length === 0) return { state, resolved: true, log: '地球&テラ: 此成員無吶喊 — 跳過' };
    const oshiName = getCard(own.oshi?.cardId)?.name;
    if (!oshiName) return { state, resolved: true, log: '地球&テラ: 主推資訊缺失' };
    // Build followup search prompt (same-name Debut from deck → hand)
    const matches = own.zones[ZONE.DECK].filter(c => {
      const card = getCard(c.cardId);
      return card?.name === oshiName && card?.bloom === 'Debut';
    });
    if (matches.length === 0) {
      // Cost still gets paid; followup just no-ops (deck shuffle)
      return {
        state, resolved: false,
        prompt: {
          type: 'SELECT_OWN_CHEER', player: ctx.player,
          message: `地球&テラ: 選擇 1 張吶喊卡 → 存檔（牌組無「${oshiName}」Debut，洗牌跳過）`,
          cards: cheers, maxSelect: 1,
          afterAction: 'ARCHIVE_OWN_CHEER_THEN_DMG',
          damageAmount: 0, damageTarget: 'none',
        },
        log: '地球&テラ: 選吶喊（無對應 Debut）',
      };
    }
    const followupSearch = {
      type: 'SEARCH_SELECT', player: ctx.player,
      message: `地球&テラ: 選擇 1 張「${oshiName}」Debut 加入手牌`,
      cards: matches.map(c => ({
        instanceId: c.instanceId, cardId: c.cardId,
        name: getCard(c.cardId)?.name || '',
        image: getCardImage(c.cardId),
      })),
      maxSelect: 1, afterAction: 'ADD_TO_HAND',
    };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_CHEER', player: ctx.player,
        message: `地球&テラ: 選擇 1 張吶喊卡 → 存檔（→ 搜尋「${oshiName}」Debut）`,
        cards: cheers, maxSelect: 1,
        afterAction: 'ARCHIVE_OWN_CHEER_THEN_DMG',
        damageAmount: 0, damageTarget: 'none',
        followupSearch,
      },
      log: '地球&テラ: 選吶喊',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD04-010 大空スバル (Spot 無色) effectC「ちよこーーッ！！」
  // REAL: 自己的中心成員為「癒月ちょこ」時，可以將自己存檔區的1張吶喊卡發送給自己的成員。
  // ACTION: condition (center=ちょこ) + archive cheer → pick member
  // AMBIGUITY: archive 0 → skip; ≥1 → SELECT_FROM_ARCHIVE chained CHEER_FROM_ARCHIVE_TO_MEMBER
  // LIMITS: ON_COLLAB self-only; optional ("可以")
  // CONDITIONS: own center is 癒月ちょこ; ≥1 archive cheer; ≥1 stage member
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD04-010', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const center = own.zones[ZONE.CENTER];
    if (!center || getCard(center.cardId)?.name !== '癒月ちょこ') {
      return { state, resolved: true, log: 'ちよこーーッ！！: 中心非「癒月ちょこ」' };
    }
    const cheers = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.type === '吶喊');
    if (cheers.length === 0) return { state, resolved: true, log: 'ちよこーーッ！！: 存檔無吶喊' };
    const stage = getStageMembers(own);
    if (stage.length === 0) return { state, resolved: true };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: 'ちよこーーッ！！: 選擇 1 張吶喊卡 → 自己成員',
        cards: archivePicks(cheers),
        maxSelect: 1,
        afterAction: 'CHEER_FROM_ARCHIVE_TO_MEMBER',
        targets: memberPicks(stage),
      },
      log: 'ちよこーーッ！！: 選吶喊',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD19-001 大空スバル (主推 SD19) oshi「ごめんｹﾄﾞ」/ SP「おさんぽスバル」
  // OSHI REAL: [每個回合一次]將自己存檔區的1張成員返回手牌。
  // SP REAL:   [每場比賽一次]將自己存檔區的吶喊卡發送給自己1~2位「大空スバル」，每人各1張。
  // ACTION: oshi → SELECT_FROM_ARCHIVE (member) → RETURN_FROM_ARCHIVE
  //         SP → multi-distribute archive cheer to 1-2 スバル members; multi-step
  //               picker → MANUAL_EFFECT
  // AMBIGUITY: oshi: 0 archive members → skip; ≥1 → SELECT_FROM_ARCHIVE
  //            SP: multi-step distribution → MANUAL_EFFECT
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: oshi: archive has ≥1 member; SP: archive has cheer + 1~2 スバル
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD19-001', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    if (ctx.skillType === 'sp') {
      return { state }; // MANUAL_EFFECT — multi-distribution archive cheer to 1-2 スバル
    }
    const own = state.players[ctx.player];
    const members = own.zones[ZONE.ARCHIVE].filter(c => isMember(getCard(c.cardId)?.type));
    if (members.length === 0) return { state, resolved: true, log: 'oshi「ごめんｹﾄﾞ」: 存檔無成員 — 跳過' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: 'oshi「ごめんｹﾄﾞ」: 選擇 1 張成員回手牌',
        cards: archivePicks(members),
        maxSelect: 1, afterAction: 'RETURN_FROM_ARCHIVE',
      },
      log: 'oshi: 選擇成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD19-003 大空スバル (Debut SD19) art1「今日もあなたのそばに -スバル-」
  // REAL: DMG:20+ / 如果自己的生命值在2以下，這個藝能傷害+10。
  // ACTION: +10 if own life ≤ 2
  // AMBIGUITY: none
  // LIMITS: art-time
  // CONDITIONS: own life ≤ 2
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD19-003', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const life = own.zones[ZONE.LIFE].length;
    if (life > 2) return { state, resolved: true, log: `今日もあなたのそばに: 生命=${life}>2` };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
      log: `今日もあなたのそばに: 生命=${life} → +10`,
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD19-004 大空スバル (Debut SD19) effectC「大空スマイル」
  // REAL: 如果在自己後攻的第一個回合，從自己的牌組展示1張Debut成員，放到舞台上。將牌組重新洗牌。
  // ACTION: post-attack first-turn → search Debut → place on stage. Multi-step
  //         (search picker + zone picker for placement) → MANUAL_EFFECT.
  //         (afterAction "search → place on stage" missing.)
  // AMBIGUITY: stage placement requires zone picker
  // LIMITS: ON_COLLAB self-only; only own first turn AND going second
  // CONDITIONS: turnNumber=2 + state.firstPlayer != ctx.player
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD19-004', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const goingSecond = state.firstPlayer != null && state.firstPlayer !== ctx.player;
    const isFirstTurnForMe = state.turnNumber === 2 && goingSecond;
    if (!isFirstTurnForMe) return { state, resolved: true, log: '大空スマイル: 非後攻第一回合' };
    return { state }; // MANUAL_EFFECT — search Debut + place-on-stage chain afterAction missing
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD19-005 大空スバル (Debut SD19) effectG「ダンスレッスンなんですｹｰﾄﾞ」
  // REAL: 對手的中心成員對這個成員造成的傷害-10。
  // ACTION: passive damage reduction (-10 from opp center attacker)
  // AMBIGUITY: none
  // LIMITS: passive
  // CONDITIONS: dmg source = opp center
  // Engine has no preventDamage / damageReduction hook → MANUAL_EFFECT.
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD19-005', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => ({
    state, resolved: true,
    log: 'ダンスレッスンなんですｹｰﾄﾞ: 對手中心 → 此成員傷害 -10（已透過 DamageCalculator 觀察者鏈支援）',
  }));

  // ─────────────────────────────────────────────────────────────────────
  // hSD19-007 大空スバル (1st SD19) effectB「青春エール」/ art1「忘れてなんかやるもんか」
  // EFFECTB REAL: 將自己存檔區的1張吶喊卡發送給這個成員。
  // ART1 REAL: DMG:30+ / 如果這個成員有2張以上的吶喊卡，這個藝能傷害+20。
  // ACTION: effectB → archive cheer → self; art1 → +20 if ≥2 cheer attached
  // AMBIGUITY: effectB archive 0 → skip; ≥1 → SELECT_FROM_ARCHIVE chained
  // LIMITS: ON_BLOOM self-only; art-time
  // CONDITIONS: effectB: archive has cheer; art1: this has ≥2 cheer
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD19-007', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const cheers = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.type === '吶喊');
    if (cheers.length === 0) return { state, resolved: true, log: '青春エール: 存檔無吶喊' };
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: '青春エール: 選擇 1 張吶喊卡附給此成員',
        cards: archivePicks(cheers),
        maxSelect: 1,
        afterAction: 'CHEER_FROM_ARCHIVE_TO_MEMBER',
        targets: [{
          instanceId: me.instanceId, cardId: me.cardId,
          name: getCard(me.cardId)?.name || '', image: getCardImage(me.cardId),
        }],
      },
      log: '青春エール: 選擇吶喊',
    };
  });
  reg('hSD19-007', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    const cheerCount = (me.attachedCheer || []).length;
    if (cheerCount < 2) return { state, resolved: true, log: `忘れてなんかやるもんか: 吶喊=${cheerCount}<2` };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 20, target: 'self', duration: 'instant' },
      log: `忘れてなんかやるもんか: 吶喊=${cheerCount} → +20`,
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD19-008 大空スバル (1st SD19) art1「萌え萌えギュン」
  // REAL: DMG:20+ / [限定聯動位置]如果對手的舞台上有2nd成員，這個藝能傷害+20。
  // ACTION: collab-only + opp has any 2nd → +20
  // AMBIGUITY: none
  // LIMITS: art-time
  // CONDITIONS: this in COLLAB; opp stage has ≥1 2nd
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD19-008', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    if (own.zones[ZONE.COLLAB]?.instanceId !== me.instanceId) {
      return { state, resolved: true, log: '萌え萌えギュン: 非聯動位置' };
    }
    const opp = state.players[1 - ctx.player];
    const has2nd = getStageMembers(opp).some(m => getCard(m.inst.cardId)?.bloom === '2nd');
    if (!has2nd) return { state, resolved: true, log: '萌え萌えギュン: 對手無 2nd' };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 20, target: 'self', duration: 'instant' },
      log: '萌え萌えギュン: 聯動 + 對手有 2nd → +20',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD19-009 大空スバル (2nd SD19) art1「ダンシング・プレアデス」
  // REAL: DMG:80+ / 如果自己的生命值在2以下，這個藝能傷害+10。
  // ACTION: +10 if own life ≤ 2
  // AMBIGUITY: none
  // LIMITS: art-time
  // CONDITIONS: own life ≤ 2
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD19-009', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const life = own.zones[ZONE.LIFE].length;
    if (life > 2) return { state, resolved: true, log: `ダンシング・プレアデス: 生命=${life}>2` };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
      log: `ダンシング・プレアデス: 生命=${life} → +10`,
    };
  });

  return count;
}
