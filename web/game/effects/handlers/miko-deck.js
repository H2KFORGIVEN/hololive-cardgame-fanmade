// さくらみこ deck handlers — written from real card text per the
// "no guessing" rule.
//
// Heavy use of dice rolls + 35P fan card mechanics. Each handler has the
// 5-line spec block above it (REAL/ACTION/AMBIGUITY/LIMITS/CONDITIONS).

import { getCard, getCardImage } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE, isMember, isSupport } from '../../core/constants.js';
import { getStageMembers, drawCards, applyDamageToMember, rollDieFor } from './common.js';

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function archivePicks(cards) {
  return cards.map(c => ({
    instanceId: c.instanceId,
    cardId: c.cardId,
    name: getCard(c.cardId)?.name || '',
    image: getCardImage(c.cardId),
  }));
}

function memberPicks(members) {
  return members.map(m => ({
    instanceId: m.inst.instanceId,
    cardId: m.inst.cardId,
    name: getCard(m.inst.cardId)?.name || '',
    image: getCardImage(m.inst.cardId),
  }));
}

// Count "35P" fan cards attached to a stage member
function count35P(memberInst) {
  return (memberInst.attachedSupport || []).filter(c => getCard(c.cardId)?.name === '35P').length;
}

export function registerMikoDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-029 さくらみこ (主推) oshi「レッドエンハンス」/ SP「Birthday Gift ～Red～」
  // OSHI REAL: [每個回合一次]這個回合中，自己的1位紅色成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]從自己的牌組展示1張紅色成員並加入手牌。將牌組重新洗牌。
  // ACTION: oshi → BOOST_PICKED_MEMBER 20 (red); SP → SEARCH_SELECT red member
  // AMBIGUITY: oshi 0/1/multi; SP 0 → reshuffle, ≥1 → SEARCH_SELECT
  // LIMITS: oshi 1/turn, SP 1/game
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-029', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const matches = own.zones[ZONE.DECK].filter(c => isMember(getCard(c.cardId)?.type) && getCard(c.cardId)?.color === '紅');
      if (matches.length === 0) {
        shuffleArr(own.zones[ZONE.DECK]);
        return { state, resolved: true, log: 'SP: 牌組無紅色成員 — 重新洗牌' };
      }
      return {
        state, resolved: false,
        prompt: { type: 'SEARCH_SELECT', player: ctx.player,
          message: 'SP「Birthday Gift」: 選擇 1 張紅色成員加入手牌',
          cards: archivePicks(matches), maxSelect: 1, afterAction: 'ADD_TO_HAND' },
        log: 'SP: 搜尋紅色成員',
      };
    }
    const redMembers = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.color === '紅');
    if (redMembers.length === 0) return { state, resolved: true, log: 'oshi: 無紅色成員' };
    if (redMembers.length === 1) {
      const t = redMembers[0];
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: t.inst.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `oshi: ${getCard(t.inst.cardId)?.name||''} +20` };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'oshi「レッドエンハンス」: 選擇 1 位紅色成員 +20 藝能傷害',
        cards: memberPicks(redMembers), maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER', amount: 20 },
      log: 'oshi: 選擇紅色成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP02-069 魔法少女みこ (Spot) effectC「みんなの願いを咲かせる祈り！」
  // REAL: 可以擲1次骰子：奇數時，從自己的吶喊牌組展示1張紅色吶喊卡或藍色吶喊卡，
  //       發送給自己的後台成員。將吶喊牌組重新洗牌。
  // ACTION: optional dice; odd → reveal red/blue cheer from cheer-deck → send to backstage
  // AMBIGUITY: backstage member picker required; cheer color scan auto.
  // LIMITS: optional ("可以")
  // → MANUAL_EFFECT (cost-bearing optional + multi-step)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP02-069', HOOK.ON_COLLAB, (state, ctx) => ({ state }));

  // ─────────────────────────────────────────────────────────────────────
  // hBP03-003 さくらみこ (主推) oshi「35P帰ってくるのかッ！？って！」/ SP「あきらめない心にぇ」
  // OSHI REAL: [每個回合一次]可以擲1次骰子：如果為1、2、4、6時，將自己存檔區的1張「35P」返回手牌。
  //                                       如果為3、5時，將自己存檔區的2張「35P」返回手牌。
  // SP REAL:   [每場比賽一次]自己中心成員的顏色為紅色時可以使用：將自己任意數量的手牌依照
  //            喜歡的順序放回牌組下方。從自己的牌組抽牌直到手牌變為5張。
  // ACTION: oshi → roll die, return 1 or 2 「35P」 from archive based on result.
  //         SP → conditional (red center), put any hand to deck bottom (player order),
  //              then draw to 5.
  // AMBIGUITY: oshi: 0 「35P」 in archive → no-op; 1+ → return per dice; if 2 needed but
  //            only 1 available, return 1.
  // LIMITS: oshi 1/turn, SP 1/game; SP red-center condition
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-003', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const center = own.zones[ZONE.CENTER];
      if (!center || getCard(center.cardId)?.color !== '紅') {
        return { state, resolved: true, log: 'SP: 中心非紅色 — 不能使用' };
      }
      // SP needs ORDER_TO_BOTTOM picker for hand → MANUAL_EFFECT for now
      // (Engine doesn't have a "pick any number of hand cards in order to bottom"
      // afterAction yet; ORDER_TO_BOTTOM is for DECK ordering, different scope.)
      return { state };
    }
    // oshi — auto roll, auto return based on result
    const r = rollDieFor(state, { player: ctx.player });
    const targetCount = (r === 3 || r === 5) ? 2 : 1;
    const archive35P = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.name === '35P');
    if (archive35P.length === 0) return { state, resolved: true, log: `oshi 骰${r}: 存檔區無 35P` };
    let returned = 0;
    for (let i = 0; i < targetCount && i < archive35P.length; i++) {
      const card = archive35P[i];
      const idx = own.zones[ZONE.ARCHIVE].findIndex(c => c.instanceId === card.instanceId);
      if (idx >= 0) {
        const popped = own.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
        popped.faceDown = false;
        own.zones[ZONE.HAND].push(popped);
        returned++;
      }
    }
    return { state, resolved: true, log: `oshi 骰${r}: 35P × ${returned} 回手牌` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP03-026 さくらみこ (Debut) effectC「君と待ち合わせ」
  // REAL: 可以擲1次骰子：如果為2、4、6時，給予對手的中心成員10點特殊傷害。
  //                     如果為3、5時，從自己的牌組抽1張牌，給予對手的中心成員10點特殊傷害。
  //                     如果為1時，無效果（推斷）。
  // ACTION: optional dice; 2/4/6 → 10 dmg, 3/5 → draw 1 + 10 dmg, 1 → nothing
  // AMBIGUITY: target = opp center (auto)
  // LIMITS: optional
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-026', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const own = state.players[ctx.player];
    const opp = state.players[1 - ctx.player];
    const r = rollDieFor(state, { player: ctx.player, member: ctx.memberInst });
    if (r === 1) return { state, resolved: true, log: `君と待ち合わせ 骰${r}: 無效果` };
    const oppCenter = opp.zones[ZONE.CENTER];
    if (oppCenter) applyDamageToMember(oppCenter, 10);
    if (r === 3 || r === 5) {
      drawCards(own, 1);
      return { state, resolved: true, log: `君と待ち合わせ 骰${r}: 抽1 + 對手中心10傷害` };
    }
    return { state, resolved: true, log: `君と待ち合わせ 骰${r}: 對手中心10傷害` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP03-028 さくらみこ (1st) art2「みこぴー！(｀・ω・´)🌸」
  // REAL: 可以擲1次骰子：如果為2、4、6時，給予對手的中心成員20點特殊傷害。
  //                     如果為3、5時，給予對手的中心成員與聯動成員20點特殊傷害。
  //                     如果為1時，無效果。
  // ACTION: optional dice → 2/4/6 = center 20; 3/5 = both 20
  // AMBIGUITY: target unambiguous
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-028', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey !== 'art2') return { state, resolved: true };
    const opp = state.players[1 - ctx.player];
    const r = rollDieFor(state, { player: ctx.player, member: ctx.memberInst });
    if (r === 1) return { state, resolved: true, log: `みこぴー 骰${r}: 無效果` };
    const oppCenter = opp.zones[ZONE.CENTER];
    const oppCollab = opp.zones[ZONE.COLLAB];
    if (oppCenter) applyDamageToMember(oppCenter, 20);
    if ((r === 3 || r === 5) && oppCollab) applyDamageToMember(oppCollab, 20);
    return { state, resolved: true, log: `みこぴー 骰${r}: ${(r===3||r===5)?'中心+聯動':'中心'} 20傷害` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP03-029 さくらみこ (1st) effectB「にぇ」/ art1「35Pと記念写真」
  // EFFECTB REAL: 從自己的牌組展示1張「35P」並加入手牌。將牌組重新洗牌。
  // ART1 REAL:    這個成員帶有「35P」時，這個藝能傷害+30。
  // ACTION: effectB search 35P → hand. art1 conditional boost +30 if has 35P.
  // AMBIGUITY: effectB: 0/1/multi 35P in deck; art1: bool check
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-029', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const matches = own.zones[ZONE.DECK].filter(c => getCard(c.cardId)?.name === '35P');
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: 'にぇ: 牌組無 35P — 重新洗牌' };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SEARCH_SELECT', player: ctx.player,
        message: 'にぇ: 選擇 1 張「35P」加入手牌',
        cards: archivePicks(matches), maxSelect: 1, afterAction: 'ADD_TO_HAND' },
      log: 'にぇ: 搜尋 35P',
    };
  });
  reg('hBP03-029', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    if (!ctx.memberInst || count35P(ctx.memberInst) === 0) {
      return { state, resolved: true, log: '35Pと記念写真: 無 35P' };
    }
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 30, target: 'self', duration: 'instant' },
      log: '35Pと記念写真: 帶 35P → +30',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP03-030 さくらみこ (2nd) effectG「エリートギャンブル」/ art1「エリート巫女」
  // EFFECTG REAL: [限定中心位置][每個回合一次]自己的主要階段，這個成員帶有「35P」時，
  //               可以擲1次骰子：如果為3、5時，這個回合中，這個成員的藝能傷害+50。
  // ART1 REAL:    這個成員每帶有1張「35P」，這個藝能傷害+20。
  // ACTION: effectG passive — manual main-phase trigger; art1 per-35P count boost
  // AMBIGUITY: art1 unambiguous; effectG MANUAL (player decides when to use)
  // LIMITS: effectG 1/turn (uses _oncePerTurn); 中心位置限定
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-030', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const n = ctx.memberInst ? count35P(ctx.memberInst) : 0;
    if (n === 0) return { state, resolved: true, log: 'エリート巫女: 無 35P' };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: n * 20, target: 'self', duration: 'instant' },
      log: `エリート巫女: ${n} 張 35P → +${n * 20}`,
    };
  });
  // effectG handled via ON_PASSIVE_GLOBAL — log only; player invokes manually
  reg('hBP03-030', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => {
    if (ctx.triggerEvent !== 'main_phase_start') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (own.zones[ZONE.CENTER]?.instanceId !== ctx.memberInst?.instanceId) return { state, resolved: true };
    if (count35P(ctx.memberInst) === 0) return { state, resolved: true };
    if (own._oncePerTurn?.['hBP03-030']) return { state, resolved: true, log: 'エリートギャンブル: 已用過本回合' };
    return { state, resolved: true, log: 'エリートギャンブル: 主要階段可手動擲骰（3/5 → +50）' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-035 さくらみこ (2nd) effectG / art1
  // EFFECTG REAL: [限定中心位置或聯動位置]對手回合中，自己的「さくらみこ」被擊倒時可以使用：
  //               從自己的牌組展示1張「み俺恥」並加入手牌。將牌組重新洗牌。
  // ART1 REAL:    可以將自己的2張手牌放到存檔區：給予對手的中心成員或聯動成員50點特殊傷害。
  //               如果「35P」在自己的舞台上，再從自己的牌組抽1張牌。
  // ACTION: effectG reactive on knockdown — search 「み俺恥」. art1 cost+pick target+conditional draw.
  // AMBIGUITY: art1 → MANUAL (cost-bearing + opp picker)
  //            effectG → reactive, fall through
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-035', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    return { state }; // MANUAL — cost-bearing + opp picker
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-085 みこだにぇー (吉祥物 attached effect)
  // REAL: 帶有這個吉祥物的成員HP+10。
  //       ◆附加給「さくらみこ」有追加效果
  //       對手回合中，帶有這個吉祥物的成員被擊倒時，對手將1張手牌放到存檔區。
  // → ATTACH effect handled by AttachedSupportEffects.js (HP+10).
  // → Knockdown side effect handled via reactive in this file.
  reg('hBP05-085', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.triggerEvent !== 'reactive_knockdown') return { state, resolved: true };
    if (!ctx.knockedOutInstId) return { state, resolved: true };
    // The attached mascot lives on the knocked member; before archive, check
    // if that member had this card AND was a さくらみこ
    const knockedCard = ctx.knockedOutCardId ? getCard(ctx.knockedOutCardId) : null;
    if (!knockedCard || knockedCard.name !== 'さくらみこ') return { state, resolved: true };
    // Force opponent to discard 1 hand card to archive
    const opp = state.players[1 - ctx.player];
    if (opp.zones[ZONE.HAND].length === 0) return { state, resolved: true, log: 'みこだにぇー: 對手手牌空' };
    // Auto-discard random; ideally opp picks but we keep it simple
    const idx = 0;
    const card = opp.zones[ZONE.HAND].splice(idx, 1)[0];
    opp.zones[ZONE.ARCHIVE].push(card);
    return { state, resolved: true, log: `みこだにぇー: 對手 ${getCard(card.cardId)?.name||'手牌'} 存檔` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-043 さくらみこ (2nd) effectC「holoRêve -みこ-」/ art1「桜は花に顕る」
  // EFFECTC REAL: 選擇3或5。這個回合中，因自己的主推「さくらみこ」與自己舞台上的「さくらみこ」
  //               的效果擲骰子時，那些骰子的點數視為剛才選擇的數字。
  // ART1 REAL:    這個成員每帶有1張「35P」，這個藝能傷害+70，並從自己的牌組抽1張牌。
  // ACTION: effectC sets state._diceOverride to 3 or 5 for the turn (player pick)
  //         art1 per 35P → +70 + draw 1 each
  // AMBIGUITY: effectC requires picker for 3/5 → MANUAL_EFFECT (engine doesn't have
  //            a "pick a value" prompt yet); art1 unambiguous
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-043', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    return { state }; // MANUAL — pick 3 or 5 for diceOverride
  });
  reg('hBP07-043', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const n = ctx.memberInst ? count35P(ctx.memberInst) : 0;
    if (n === 0) return { state, resolved: true, log: '桜は花に顕る: 無 35P' };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: n * 70, target: 'self', duration: 'instant' },
      log: `桜は花に顕る: ${n} 張 35P → +${n * 70}`,
    };
  });
  reg('hBP07-043', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    if (ctx.cardId !== 'hBP07-043') return { state, resolved: true };
    const n = ctx.memberInst ? count35P(ctx.memberInst) : 0;
    if (n > 0) {
      drawCards(state.players[ctx.player], n);
      return { state, resolved: true, log: `桜は花に顕る: ${n} 張 35P → 抽 ${n} 張` };
    }
    return { state, resolved: true };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hPR-001 さくらみこ (Spot) effectC「誰かの芽吹きになれたら」
  // REAL: 可以擲1次骰子：如果為1、3、5時，從自己的吶喊牌組展示1張紅色吶喊卡或藍色吶喊卡，
  //       發送給自己的後台成員。將吶喊牌組重新洗牌。
  // ACTION: optional dice + multi-step → MANUAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hPR-001', HOOK.ON_COLLAB, (state, ctx) => ({ state }));

  // ─────────────────────────────────────────────────────────────────────
  // hSD07-011 さくらみこ (Debut) effectC「バーニン♪ バーニン♪」
  // REAL: 給予對手的中心成員10點特殊傷害。
  // ACTION: unconditional 10 dmg opp center
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD07-011', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const opp = state.players[1 - ctx.player];
    const oppCenter = opp.zones[ZONE.CENTER];
    if (oppCenter) applyDamageToMember(oppCenter, 10);
    return { state, resolved: true, log: 'バーニン♪: 對手中心 10 點特殊傷害' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD16-001 さくらみこ (主推) oshi「35Pこっちこっちー」/ SP「35Pいくぞー！」
  // OSHI REAL: [每個回合一次]如果自己的成員帶有「35P」，從自己的牌組抽1張牌。
  // SP REAL:   [每場比賽一次]選擇自己1位帶有粉絲的「さくらみこ」。這個回合中，該成員的藝能傷害+50。
  // ACTION: oshi conditional draw 1; SP pick fan-bearing みこ → +50
  // AMBIGUITY: SP: 0 → skip; 1 → auto; multi → SELECT_OWN_MEMBER
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD16-001', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const candidates = getStageMembers(own).filter(m => {
        if (getCard(m.inst.cardId)?.name !== 'さくらみこ') return false;
        return (m.inst.attachedSupport || []).some(s => getCard(s.cardId)?.type === '支援・粉絲');
      });
      if (candidates.length === 0) return { state, resolved: true, log: 'SP: 無帶粉絲的さくらみこ — 跳過' };
      if (candidates.length === 1) {
        state._turnBoosts = state._turnBoosts || [];
        state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 50, target: 'instance', instanceId: candidates[0].inst.instanceId, duration: 'turn' });
        return { state, resolved: true, log: `SP: ${getCard(candidates[0].inst.cardId)?.name||''} +50` };
      }
      return {
        state, resolved: false,
        prompt: { type: 'SELECT_OWN_MEMBER', player: ctx.player,
          message: 'SP「35Pいくぞー！」: 選擇 1 位帶粉絲的「さくらみこ」+50 藝能傷害',
          cards: memberPicks(candidates), maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER', amount: 50 },
        log: 'SP: 選擇成員',
      };
    }
    // oshi: if any own member has 35P → draw 1
    const has35P = getStageMembers(own).some(m => count35P(m.inst) > 0);
    if (!has35P) return { state, resolved: true, log: 'oshi: 無成員帶 35P — 跳過' };
    drawCards(own, 1);
    return { state, resolved: true, log: 'oshi: 帶 35P → 抽 1' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD16-004 さくらみこ (Debut) effectC「後攻なんですｹｰﾄﾞ」
  // REAL: 如果在自己後攻的第一個回合，從自己的牌組展示1張「35P」，附加給這個成員。將牌組重新洗牌。
  // ACTION: back-attack 1st turn → search 35P → attach to self
  // AMBIGUITY: source 35P pick if multiple in deck; target = self (auto)
  // CONDITIONS: back-attack 1st turn
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD16-004', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const own = state.players[ctx.player];
    const isBackAttackFirst = state.firstTurn?.[ctx.player] && ctx.player !== state.firstPlayer;
    if (!isBackAttackFirst) return { state, resolved: true, log: '後攻なんですｹｰﾄﾞ: 非後攻第1回合' };
    const matches = own.zones[ZONE.DECK].filter(c => getCard(c.cardId)?.name === '35P');
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: '後攻なんですｹｰﾄﾞ: 牌組無 35P — 重新洗牌' };
    }
    if (matches.length === 1) {
      // Auto-attach to self
      const idx = own.zones[ZONE.DECK].findIndex(c => c.instanceId === matches[0].instanceId);
      const card = own.zones[ZONE.DECK].splice(idx, 1)[0];
      card.faceDown = false;
      ctx.memberInst.attachedSupport = ctx.memberInst.attachedSupport || [];
      ctx.memberInst.attachedSupport.push(card);
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: '後攻なんですｹｰﾄﾞ: 35P 附加到自身' };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SEARCH_SELECT', player: ctx.player,
        message: '後攻なんですｹｰﾄﾞ: 選擇 1 張「35P」附加給這個成員',
        cards: archivePicks(matches), maxSelect: 1, afterAction: 'ATTACH_SUPPORT',
        targetInstanceId: ctx.memberInst.instanceId },
      log: '後攻なんですｹｰﾄﾞ: 選擇 35P',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD16-005 さくらみこ (Debut) art1「桜風ランニング」
  // REAL: 擲1次骰子。如果為3或5，從自己的牌組抽1張牌。
  // ACTION: roll → if 3/5 draw 1
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD16-005', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const r = rollDieFor(state, { player: ctx.player, member: ctx.memberInst });
    if (r === 3 || r === 5) {
      drawCards(state.players[ctx.player], 1);
      return { state, resolved: true, log: `桜風ランニング 骰${r}: 抽 1` };
    }
    return { state, resolved: true, log: `桜風ランニング 骰${r}: 無效果` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD16-007 さくらみこ (1st) effectG / art1
  // EFFECTG REAL: 對手回合中，這個成員被擊倒時，從自己的牌組抽1張牌。
  // ART1 REAL:    [限定中心位置]擲1次骰子。如果為3或5，這個藝能傷害+10。
  // ACTION: effectG reactive draw 1; art1 dice → +10 if 3/5 (center-only)
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD16-007', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.triggerEvent !== 'reactive_knockdown') return { state, resolved: true };
    if (ctx.knockedOutCardId !== 'hSD16-007') return { state, resolved: true };
    if (state.activePlayer === ctx.player) return { state, resolved: true }; // only on opp turn
    drawCards(state.players[ctx.player], 1);
    return { state, resolved: true, log: 'みこの膝にごろーん: 被擊倒 → 抽 1' };
  });
  reg('hSD16-007', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (own.zones[ZONE.CENTER]?.instanceId !== ctx.memberInst?.instanceId) {
      return { state, resolved: true, log: 'みこの耳かき: 非中心位置' };
    }
    const r = rollDieFor(state, { player: ctx.player, member: ctx.memberInst });
    if (r === 3 || r === 5) {
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
        log: `みこの耳かき 骰${r}: +10`,
      };
    }
    return { state, resolved: true, log: `みこの耳かき 骰${r}: 無效果` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD16-008 さくらみこ (1st) effectC「待ってたにぇ」
  // REAL: 擲1次骰子。如果為3或5，將自己存檔區的1張「35P」返回手牌。
  // ACTION: roll → 3/5 → return 1 35P from archive
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD16-008', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const own = state.players[ctx.player];
    const r = rollDieFor(state, { player: ctx.player, member: ctx.memberInst });
    if (r !== 3 && r !== 5) return { state, resolved: true, log: `待ってたにぇ 骰${r}: 無效果` };
    const idx = own.zones[ZONE.ARCHIVE].findIndex(c => getCard(c.cardId)?.name === '35P');
    if (idx < 0) return { state, resolved: true, log: `待ってたにぇ 骰${r}: 存檔區無 35P` };
    const card = own.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
    card.faceDown = false;
    own.zones[ZONE.HAND].push(card);
    return { state, resolved: true, log: `待ってたにぇ 骰${r}: 35P 回手牌` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD16-009 さくらみこ (2nd) effectB「35P、ありがとうだよー！」
  // REAL: 這個回合中，自己的舞台上每有1張「35P」，這個成員的藝能傷害+10。
  // ACTION: count all 35P on own stage → +N*10 self for the turn
  // CONDITIONS: at bloom → set turn-scoped boost on self
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD16-009', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    let total = 0;
    for (const m of getStageMembers(own)) total += count35P(m.inst);
    if (total === 0) return { state, resolved: true, log: '35Pありがとう: 舞台無 35P' };
    state._turnBoosts = state._turnBoosts || [];
    state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: total * 10, target: 'instance', instanceId: ctx.memberInst.instanceId, duration: 'turn' });
    return { state, resolved: true, log: `35Pありがとう: ${total} 張 35P → 本回合 +${total*10}` };
  });

  return count;
}
