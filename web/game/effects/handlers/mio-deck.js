// 大神ミオ deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// 5-line spec block per handler: REAL / ACTION / AMBIGUITY / LIMITS / CONDITIONS.
//
// Already-wired ミオ cards (NOT redefined here):
//   - hBP02-024 (Debut art1 ON_ART_RESOLVE cheer→#JP): phaseB+C1
//   - hBP04-026 (2nd effectB+art1): phaseC1-cards.js
//   - hBP07-003 (oshi 神札の導き / SP みんなのママ): phaseB-cards.js
//   - hBP07-025 (1st art1 ON_ART_RESOLVE): phaseB-cards.js
//
// Vanilla — skipped: hBP02-025.

import { getCard, getCardImage } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE, isMember } from '../../core/constants.js';
import { getStageMembers, drawCards } from './common.js';

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isSupportCard(card) {
  const t = card?.type || '';
  return t === '支援・道具' || t === '支援・吉祥物' || t === '支援・粉絲' || t === '支援・活動' || t === '支援・場地';
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

// Mill 1 from deck top → archive; return the milled card or null
function millOne(player) {
  if (!player.zones[ZONE.DECK].length) return null;
  const top = player.zones[ZONE.DECK].shift();
  top.faceDown = false;
  player.zones[ZONE.ARCHIVE].push(top);
  return top;
}

export function registerMioDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-064 大神ミオ (主推 PR) oshi/SP — green-PR enhance pattern.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-064', HOOK.ON_OSHI_SKILL, (state, ctx) => {
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
  // hBP02-027 大神ミオ (1st Buzz) art1「タロットの導き」
  // REAL: DMG:60+ / 可以將自己牌組上方的1張牌放到存檔區：該牌為成員時，這個藝能傷害+20。該牌為支援卡時，這個藝能傷害+50。
  // ACTION: optional mill 1 → +20 if member, +50 if support
  // AMBIGUITY: none
  // LIMITS: art-time
  // CONDITIONS: deck non-empty
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP02-027', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const milled = millOne(own);
    if (!milled) return { state, resolved: true, log: 'タロットの導き: 牌組空' };
    const card = getCard(milled.cardId);
    let bonus = 0;
    if (isMember(card?.type)) bonus = 20;
    else if (isSupportCard(card)) bonus = 50;
    if (bonus === 0) return { state, resolved: true, log: `タロットの導き: 牌頂 ${card?.name||''} (吶喊) 無加成` };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: bonus, target: 'self', duration: 'instant' },
      log: `タロットの導き: 牌頂 ${card?.name||''} → +${bonus}`,
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-024 大神ミオ (Debut) effectG「ウチの大切な家族」/ art1「今日もいっぱい笑っていこう」
  // EFFECTG REAL: [每個回合一次]這個成員附加「ミオファ」時，從自己的牌組抽1張牌。
  // ART1 REAL: DMG:10+ / 可以將自己牌組上方的1張牌放到存檔區。如果該牌為支援卡，這個藝能傷害+30。
  // ACTION: effectG → ON_PLACE on attached "ミオファ" → 1/turn draw 1
  //         art1 → mill 1 → +30 if support
  // AMBIGUITY: none
  // LIMITS: effectG 1/turn; art-time
  // CONDITIONS: see REAL
  // Note: effectG triggers on "attached ミオファ" — engine doesn't expose
  //   support-attach hooks distinctly. Falls through to MANUAL_EFFECT for that path.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-024', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => ({
    state, resolved: true,
    log: 'ウチの大切な家族: 附加「ミオファ」時抽 1（引擎尚未支援 attachment-trigger hook，需手動）',
  }));
  reg('hBP07-024', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const milled = millOne(own);
    if (!milled) return { state, resolved: true, log: '今日もいっぱい笑っていこう: 牌組空' };
    if (isSupportCard(getCard(milled.cardId))) {
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 30, target: 'self', duration: 'instant' },
        log: `今日もいっぱい笑っていこう: 牌頂 ${getCard(milled.cardId)?.name||''} (支援) → +30`,
      };
    }
    return { state, resolved: true, log: `今日もいっぱい笑っていこう: 牌頂 ${getCard(milled.cardId)?.name||''} 無加成` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-026 大神ミオ (1st) effectB「早く来ないかな…」
  // REAL: 從自己的牌組展示1張「ハトタウロス」或「ミオファ」並加入手牌。將牌組重新洗牌。
  // ACTION: search by name → hand
  // AMBIGUITY: 0 → reshuffle / ≥1 → SEARCH_SELECT
  // LIMITS: ON_BLOOM self-only
  // CONDITIONS: deck has at least one of the two named items
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-026', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const matches = own.zones[ZONE.DECK].filter(c => {
      const n = getCard(c.cardId)?.name;
      return n === 'ハトタウロス' || n === 'ミオファ';
    });
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: '早く来ないかな…: 牌組無對應吉祥物' };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT', player: ctx.player,
        message: '早く来ないかな…: 選擇 1 張「ハトタウロス」或「ミオファ」加入手牌',
        cards: archivePicks(matches),
        maxSelect: 1, afterAction: 'ADD_TO_HAND',
      },
      log: '早く来ないかな…: 搜尋',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-027 大神ミオ (1st) effectB「ハートの女王の采配」/ art1「女王陛下と呼びなさい」
  // EFFECTB REAL: 選擇自己這個成員以外的1位後台成員。這個回合中，該成員的藝能傷害+30。
  // ART1 REAL: DMG:70 / [限定中心位置]使用這個藝能擊倒對手的成員時，從自己的牌組抽1張牌。
  // ACTION: effectB → pick non-self backstage +30 turn
  //         art1 → ON_KNOCKDOWN by self in CENTER → draw 1
  // AMBIGUITY: effectB backstage 0 → skip; 1 → auto; multi → SELECT_OWN_MEMBER
  // LIMITS: ON_BLOOM self-only / ON_KNOCKDOWN
  // CONDITIONS: see REAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-027', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    const backs = own.zones[ZONE.BACKSTAGE].filter(m => m.instanceId !== me.instanceId).map(m => ({ inst: m }));
    if (backs.length === 0) return { state, resolved: true, log: 'ハートの女王の采配: 後台無其他成員' };
    if (backs.length === 1) {
      const t = backs[0].inst;
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 30, target: 'instance', instanceId: t.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `ハートの女王の采配: ${getCard(t.cardId)?.name||''} 本回合 +30` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'ハートの女王の采配: 選擇 1 位後台成員 +30',
        cards: memberPicks(backs),
        maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER',
        amount: 30,
      },
      log: 'ハートの女王の采配: 選擇後台',
    };
  });
  reg('hBP07-027', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.attackerCardId !== 'hBP07-027') return { state, resolved: true };
    if (ctx.player === ctx.knockedOutPlayer) return { state, resolved: true };
    const own = state.players[ctx.attackerPlayer];
    if (own.zones[ZONE.CENTER]?.cardId !== 'hBP07-027') return { state, resolved: true };
    drawCards(own, 1);
    return { state, resolved: true, log: '女王陛下と呼びなさい: 中心擊倒對手 → 抽 1' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-028 大神ミオ (2nd) effectC「金瞳の綺羅星」/ art1「天まで届け、みんなの願い」
  // EFFECTC REAL: 查看自己牌組上方的2張牌。將其中的1張牌加入手牌。其餘放回牌組上方。
  // ART1 REAL: DMG:90+ / 可以將自己牌組上方的1張牌放到存檔區。如果該牌為支援卡，這個藝能傷害+50。
  // ACTION: effectC → look-2-pick-1 (multi-step → MANUAL_EFFECT — afterAction missing)
  //         art1 → mill 1 → +50 if support
  // AMBIGUITY: art1 none
  // LIMITS: ON_COLLAB self-only / art-time
  // CONDITIONS: see REAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-028', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    // Phase 2.4 #12: look top 2 → pick 1 to hand → rest stays on top
    const own = state.players[ctx.player];
    const top2 = own.zones[ZONE.DECK].slice(0, 2);
    if (top2.length === 0) return { state, resolved: true, log: '金瞳の綺羅星: 牌組空' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT', player: ctx.player,
        message: '金瞳の綺羅星: 牌組頂 2 張中選擇 1 張加入手牌（其餘放回牌組上方）',
        cards: top2.map(c => ({
          instanceId: c.instanceId, cardId: c.cardId,
          name: getCard(c.cardId)?.name || '',
          image: getCardImage(c.cardId),
        })),
        maxSelect: 1, afterAction: 'ADD_TO_HAND',
        noShuffle: true,
      },
      log: '金瞳の綺羅星: 選擇牌組頂 2 張之一',
    };
  });
  reg('hBP07-028', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const milled = millOne(own);
    if (!milled) return { state, resolved: true, log: '天まで届け: 牌組空' };
    if (isSupportCard(getCard(milled.cardId))) {
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 50, target: 'self', duration: 'instant' },
        log: `天まで届け: 牌頂 ${getCard(milled.cardId)?.name||''} (支援) → +50`,
      };
    }
    return { state, resolved: true, log: `天まで届け: 牌頂 ${getCard(milled.cardId)?.name||''} 無加成` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-029 大神ミオ (2nd) effectG「緑の地母神」/ art1「Upright Leading」
  // EFFECTG REAL: [每個回合一次]對手回合中，這個成員受到了傷害時，如果這個成員帶有支援卡，這個成員HP回復50點。
  // ART1 REAL: DMG:130+ / 可以將自己牌組上方的1張牌放到存檔區。如果該牌為成員，將自己吶喊牌組上方的1張牌發送給自己的成員。如果該牌為支援卡，這個藝能傷害+50。
  // ACTION: effectG → ON_DAMAGE_TAKEN on opp turn + has support → heal 50, 1/turn
  //         art1 → mill 1 → if member: cheer top → pick member; if support: +50
  // AMBIGUITY: art1 if-member needs target picker; if-support resolves auto
  // LIMITS: effectG 1/turn / art-time
  // CONDITIONS: effectG opp's turn + ≥1 support attached
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-029', HOOK.ON_DAMAGE_TAKEN, (state, ctx) => {
    if (ctx.cardId !== 'hBP07-029') return { state, resolved: true };
    if (ctx.player === state.activePlayer) return { state, resolved: true }; // own turn, skip
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    const hasSupport = (me.attachedSupport || []).length > 0;
    if (!hasSupport) return { state, resolved: true, log: '緑の地母神: 未帶支援卡' };
    const own = state.players[ctx.player];
    own._oncePerTurn = own._oncePerTurn || {};
    if (own._oncePerTurn['hBP07-029_effectG']) return { state, resolved: true, log: '緑の地母神: 本回合已觸發' };
    own._oncePerTurn['hBP07-029_effectG'] = true;
    me.damage = Math.max(0, (me.damage || 0) - 50);
    return { state, resolved: true, log: '緑の地母神: 受傷 + 帶支援卡 → 回 50HP' };
  });
  reg('hBP07-029', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const milled = millOne(own);
    if (!milled) return { state, resolved: true, log: 'Upright Leading: 牌組空' };
    const card = getCard(milled.cardId);
    if (isMember(card?.type)) {
      // Cheer top → pick member (multi-step → MANUAL)
      return { state, resolved: true, log: `Upright Leading: 牌頂 ${card?.name||''} (成員) — 後續吶喊發送為手動` };
    }
    if (isSupportCard(card)) {
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 50, target: 'self', duration: 'instant' },
        log: `Upright Leading: 牌頂 ${card?.name||''} (支援) → +50`,
      };
    }
    return { state, resolved: true, log: `Upright Leading: 牌頂 ${card?.name||''} 無加成` };
  });

  return count;
}
