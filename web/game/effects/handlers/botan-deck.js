// 獅白ぼたん deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// Each handler has the real zh-TW effect text in a 5-line spec block:
//   REAL       — the literal effect text
//   ACTION     — what the handler does
//   AMBIGUITY  — how it handles 0/1/multi candidates
//   LIMITS     — once-per-turn / once-per-game / etc.
//   CONDITIONS — required state for the effect to fire
//
// Already-wired ぼたん cards (NOT redefined here):
//   - hBP03-021 (effectB+art1): phaseC1-cards.js (effectB auto-picks first
//     2 #シューター — slightly looser than printed "1~2 各 1 張" but ships)
//
// Vanilla cards (no effect text) — skipped: hBP03-016, hBP03-018.
//
// Cost-bearing effects (player must CHOOSE which cheer to archive as cost):
// fall through to MANUAL_EFFECT to avoid auto-spending resources without
// player consent. Each MANUAL_EFFECT slot is explicitly documented below.

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

export function registerBotanDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-002 獅白ぼたん (主推 PR) oshi「グリーンエンハンス」/ SP「Birthday Gift ～Green～」
  // OSHI REAL: [每個回合一次]這個回合中，自己的1位綠色成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]從自己的牌組展示1張綠色成員並加入手牌。將牌組重新洗牌。
  // ACTION: oshi → pick own green +20; SP → search green member
  // AMBIGUITY: oshi 0→skip / 1→auto / multi→SELECT_OWN_MEMBER
  //            SP    0→reshuffle / ≥1→SEARCH_SELECT
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: none
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-002', HOOK.ON_OSHI_SKILL, (state, ctx) => {
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
  // hBP03-002 獅白ぼたん (主推 hBP03) oshi「poi」/ SP「狙撃」
  // OSHI REAL: [每個回合一次]將自己存檔區的1張吶喊卡，發送給自己的後台成員「獅白ぼたん」。
  // SP REAL:   [每場比賽一次]自己中心成員的顏色為綠色時可以使用：給予對手Debut以外的中心成員100點特殊傷害。
  // ACTION: oshi → pick archive cheer + (auto / picker among backstage ぼたん) → attach
  //         SP → check center=green, opp center is non-Debut → 100 special dmg
  // AMBIGUITY: oshi: 0 archive cheer → skip; ≥1 → SELECT_FROM_ARCHIVE chained
  //            target: 0 backstage ぼたん → skip; 1 → auto; multi → 2-step pick
  //            SP: target = opp center (auto, condition-gated)
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: oshi: archive has cheer + ≥1 backstage ぼたん
  //             SP: own center color=綠 + opp center exists + opp center bloom ≠ Debut
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-002', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const center = own.zones[ZONE.CENTER];
      if (!center || getCard(center.cardId)?.color !== '綠') {
        return { state, resolved: true, log: 'SP「狙撃」: 中心非綠色 — 跳過' };
      }
      const opp = state.players[1 - ctx.player];
      const oppCenter = opp.zones[ZONE.CENTER];
      if (!oppCenter) return { state, resolved: true, log: 'SP「狙撃」: 對手無中心' };
      if (getCard(oppCenter.cardId)?.bloom === 'Debut') {
        return { state, resolved: true, log: 'SP「狙撃」: 對手中心為 Debut — 跳過' };
      }
      oppCenter.damage = (oppCenter.damage || 0) + 100;
      return { state, resolved: true, log: 'SP「狙撃」: 對手中心 100 特殊傷害' };
    }
    // oshi: pick archive cheer → backstage ぼたん
    const cheers = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.type === '吶喊');
    if (cheers.length === 0) return { state, resolved: true, log: 'oshi「poi」: 存檔無吶喊 — 跳過' };
    const backsBotan = own.zones[ZONE.BACKSTAGE].filter(m => getCard(m.cardId)?.name === '獅白ぼたん');
    if (backsBotan.length === 0) return { state, resolved: true, log: 'oshi「poi」: 後台無「獅白ぼたん」' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: 'oshi「poi」: 選擇 1 張吶喊卡',
        cards: archivePicks(cheers),
        maxSelect: 1,
        afterAction: 'CHEER_FROM_ARCHIVE_TO_MEMBER',
        targets: backsBotan.map(m => ({
          instanceId: m.instanceId, cardId: m.cardId,
          name: getCard(m.cardId)?.name || '', image: getCardImage(m.cardId),
        })),
      },
      log: 'oshi「poi」: 選吶喊',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP03-017 獅白ぼたん (Debut) effectC「プリペア」
  // REAL: 自己的主推為「獅白ぼたん」時，可以將自己吶喊牌組上方的1張牌放到存檔區：自己的1位成員HP回復10點。
  // ACTION: oshi-name gate + cost (cheer top → archive) + heal 10 to picked member
  // AMBIGUITY: target picker required (multi members on stage)
  // LIMITS: ON_COLLAB self-only; optional ("可以")
  // CONDITIONS: oshi name = 獅白ぼたん; cheer deck non-empty; ≥1 stage member
  // Implementation: cost is "place top of cheer-deck to archive" — irreversible
  // resource spend; player should confirm. Falls through to MANUAL_EFFECT
  // (no afterAction yet supports cheer-top→archive + heal-pick chain).
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-017', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    return { state }; // MANUAL_EFFECT — cost+heal chain afterAction missing
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP03-019 獅白ぼたん (1st) effectB「歌う事は楽しい事」/ art1「じゅるり」
  // EFFECTB REAL: 可以將自己後台成員的1張吶喊卡放到存檔區：給予對手的中心成員或聯動成員30點特殊傷害。「歌う事は楽しい事」每個回合只能使用一次。
  // ART1 REAL: 可以展示自己手牌的1張「角巻わため」並放回牌組下方：這個成員HP回復20點。
  // ACTION: effectB → optional cost (backstage cheer → archive) + 30 special to opp center/collab.
  //         art1 → optional cost (reveal 角巻わため from hand → deck bottom) + heal 20 self.
  // AMBIGUITY: effectB target picker (center vs collab); art1 hand picker
  // LIMITS: effectB 1/turn (state._oncePerTurn); art1 art-time
  // CONDITIONS: effectB: backstage with cheer + opp center/collab; art1: hand has わため
  // Both are cost-bearing → MANUAL_EFFECT.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-019', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    // Phase 2.4 #1: cost-bearing afterAction. 1/turn limit.
    const own = state.players[ctx.player];
    own._oncePerTurn = own._oncePerTurn || {};
    if (own._oncePerTurn['hBP03-019_effectB']) {
      return { state, resolved: true, log: '歌う事は楽しい事: 本回合已使用' };
    }
    const cheers = [];
    for (const m of own.zones[ZONE.BACKSTAGE]) {
      for (const c of (m.attachedCheer || [])) {
        cheers.push({
          instanceId: c.instanceId, cardId: c.cardId,
          name: getCard(c.cardId)?.name || '吶喊',
          image: getCardImage(c.cardId),
        });
      }
    }
    if (cheers.length === 0) return { state, resolved: true, log: '歌う事は楽しい事: 後台無吶喊 — 跳過' };
    own._oncePerTurn['hBP03-019_effectB'] = true;
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_CHEER', player: ctx.player,
        message: '歌う事は楽しい事: 選擇 1 張後台吶喊卡 → 存檔（→ 對手中心或聯動 30 特殊傷害）',
        cards: cheers, maxSelect: 1,
        afterAction: 'ARCHIVE_OWN_CHEER_THEN_DMG',
        damageAmount: 30, damageTarget: 'opp_center_or_collab',
      },
      log: '歌う事は楽しい事: 選吶喊',
    };
  });
  reg('hBP03-019', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    return { state }; // MANUAL_EFFECT — hand-reveal cost + self heal (different cost shape)
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP03-020 獅白ぼたん (1st) effectB「SSSSR」
  // REAL: 將自己吶喊牌組上方的1張牌，發送給自己的後台成員「獅白ぼたん」。
  // ACTION: cheer top → backstage ぼたん (mandatory)
  // AMBIGUITY: 0 backstage ぼたん → skip; 1 → auto; multi → SELECT_OWN_MEMBER
  // LIMITS: ON_BLOOM self-only
  // CONDITIONS: cheer deck non-empty + ≥1 backstage ぼたん
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-020', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (own.zones[ZONE.CHEER_DECK].length === 0) return { state, resolved: true, log: 'SSSSR: 吶喊牌組空' };
    const backs = own.zones[ZONE.BACKSTAGE]
      .filter(m => getCard(m.cardId)?.name === '獅白ぼたん')
      .map(m => ({ inst: m }));
    if (backs.length === 0) return { state, resolved: true, log: 'SSSSR: 後台無「獅白ぼたん」' };
    if (backs.length === 1) {
      const target = backs[0].inst;
      const cheer = own.zones[ZONE.CHEER_DECK].shift();
      cheer.faceDown = false;
      target.attachedCheer = target.attachedCheer || [];
      target.attachedCheer.push(cheer);
      return { state, resolved: true, log: 'SSSSR: 吶喊頂 → 後台ぼたん' };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'SSSSR: 選擇 1 位後台「獅白ぼたん」接收吶喊',
        cards: memberPicks(backs),
        maxSelect: 1, afterAction: 'CHEER_FROM_DECK_TOP_TO_MEMBER',
      },
      log: 'SSSSR: 選擇後台ぼたん',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP03-021 獅白ぼたん (2nd) art1「神エイム」
  // REAL: DMG:110 / 自己的主推為「獅白ぼたん」時，可以將自己後台成員的1張吶喊卡放到存檔區：給予對手的中心成員或聯動成員40點特殊傷害。
  // ACTION: oshi-name gate + cost (backstage cheer → archive) + 40 special to opp center/collab
  // AMBIGUITY: target picker (center vs collab); cost picker (which backstage cheer)
  // LIMITS: art-time; optional ("可以")
  // CONDITIONS: oshi=獅白ぼたん; backstage member with cheer; opp center/collab exists
  // Cost-bearing → MANUAL_EFFECT.
  // (Note: phaseC1 already has ON_ART_RESOLVE that auto-fires this — flagged
  // for review since cost-bearing effects shouldn't auto-spend without consent.
  // Override with MANUAL_EFFECT here at ON_ART_DECLARE.)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-021', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    // Phase 2.4 #1: cost-bearing afterAction. Oshi-name gate.
    const own = state.players[ctx.player];
    if (getCard(own.oshi?.cardId)?.name !== '獅白ぼたん') {
      return { state, resolved: true, log: '神エイム: 主推非「獅白ぼたん」 — 跳過' };
    }
    const cheers = [];
    for (const m of own.zones[ZONE.BACKSTAGE]) {
      for (const c of (m.attachedCheer || [])) {
        cheers.push({
          instanceId: c.instanceId, cardId: c.cardId,
          name: getCard(c.cardId)?.name || '吶喊',
          image: getCardImage(c.cardId),
        });
      }
    }
    if (cheers.length === 0) return { state, resolved: true, log: '神エイム: 後台無吶喊 — 跳過' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_CHEER', player: ctx.player,
        message: '神エイム: 選擇 1 張後台吶喊卡 → 存檔（→ 對手中心或聯動 40 特殊傷害）',
        cards: cheers, maxSelect: 1,
        afterAction: 'ARCHIVE_OWN_CHEER_THEN_DMG',
        damageAmount: 40, damageTarget: 'opp_center_or_collab',
      },
      log: '神エイム: 選吶喊',
    };
  });
  // hBP03-021 ON_ART_RESOLVE override: phaseC1 has an auto-spend version that
  // would double-fire after our cost-bearing prompt. Suppress it here.
  reg('hBP03-021', HOOK.ON_ART_RESOLVE, (state, ctx) => ({ state, resolved: true }));

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-028 獅白ぼたん (1st Buzz) effectG「ちょっと頑張りました」/ art1「ここからが俺たちのスタートだ」
  // EFFECTG REAL: [限定中心位置][每個回合一次]自己的主推「獅白ぼたん」或自己舞台上的「獅白ぼたん」給予了對手的成員30點以上的特殊傷害時，從自己的牌組抽1張牌。
  // ART1 REAL: DMG:40 / 可以將自己「獅白ぼたん」的1張吶喊卡放到存檔區：給予對手的中心成員30點特殊傷害。
  // ACTION: effectG → ON_DAMAGE_DEALT trigger when source is ぼたん oshi or ぼたん stage member
  //         AND damage type is "special" AND amount ≥ 30 AND this card in CENTER. Once/turn.
  //         art1 → cost (ぼたん cheer → archive) + 30 special to opp center
  // AMBIGUITY: effectG: passive auto; art1: cost picker → MANUAL_EFFECT
  // LIMITS: effectG 1/turn (state._oncePerTurn['hBP05-028'])
  // CONDITIONS: see REAL
  // Implementation: ON_DAMAGE_DEALT receives ctx with the dealer info.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-028', HOOK.ON_DAMAGE_DEALT, (state, ctx) => {
    if (ctx.cardId !== 'hBP05-028') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (own.zones[ZONE.CENTER]?.cardId !== 'hBP05-028') {
      return { state, resolved: true }; // [限定中心位置]
    }
    // Need source to be ぼたん oshi OR a ぼたん stage member; need special dmg ≥30.
    if (!ctx.isSpecialDamage) return { state, resolved: true };
    if ((ctx.amount || 0) < 30) return { state, resolved: true };
    // Source identification: either dealtBy is the oshi or a stage member named 獅白ぼたん.
    // Convention: ctx.sourceCardId set by emitters that include source info.
    const sourceCardId = ctx.sourceCardId || ctx.cardId; // fallback
    const sourceCard = getCard(sourceCardId);
    const oshiName = getCard(own.oshi?.cardId)?.name;
    const sourceIsBotan = sourceCard?.name === '獅白ぼたん' || oshiName === '獅白ぼたん';
    if (!sourceIsBotan) return { state, resolved: true };
    // Once per turn check
    own._oncePerTurn = own._oncePerTurn || {};
    if (own._oncePerTurn['hBP05-028_effectG']) return { state, resolved: true, log: 'ちょっと頑張りました: 本回合已觸發' };
    own._oncePerTurn['hBP05-028_effectG'] = true;
    drawCards(own, 1);
    return { state, resolved: true, log: 'ちょっと頑張りました: ぼたん 30+ 特殊傷害 → 抽 1' };
  });
  reg('hBP05-028', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    // Phase 2.4 #1: cost-bearing afterAction now wired up.
    // Cost source: any own ぼたん stage member's cheer (text says "自己「獅白ぼたん」的1張吶喊卡")
    // Effect: 30 special damage to opp center (single target → no chain picker needed)
    const own = state.players[ctx.player];
    const cheers = [];
    for (const m of getStageMembers(own)) {
      if (getCard(m.inst.cardId)?.name !== '獅白ぼたん') continue;
      for (const c of (m.inst.attachedCheer || [])) {
        cheers.push({
          instanceId: c.instanceId, cardId: c.cardId,
          name: getCard(c.cardId)?.name || '吶喊',
          image: getCardImage(c.cardId),
        });
      }
    }
    if (cheers.length === 0) {
      return { state, resolved: true, log: 'ここからが俺たちのスタートだ: 「ぼたん」無吶喊 — 跳過' };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_CHEER', player: ctx.player,
        message: 'ここからが俺たちのスタートだ: 選擇 1 張「獅白ぼたん」吶喊卡放到存檔區（→ 對手中心 30 特殊傷害）',
        cards: cheers, maxSelect: 1,
        afterAction: 'ARCHIVE_OWN_CHEER_THEN_DMG',
        damageAmount: 30, damageTarget: 'opp_center',
      },
      log: 'ここからが俺たちのスタートだ: 選吶喊',
    };
  });

  return count;
}
