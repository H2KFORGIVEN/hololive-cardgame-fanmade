// シオリ・ノヴェラ deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// 5-line spec block per handler: REAL / ACTION / AMBIGUITY / LIMITS / CONDITIONS.
//
// Already-wired シオリ cards (NOT redefined here):
//   - hSD12-007 effectG ON_KNOCKDOWN (return support from archive): phaseB-cards.js
//
// Vanilla — skipped: hBP04-050, hBP04-051, hBP07-060.

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

function hasTag(inst, tag) {
  const t = getCard(inst.cardId)?.tag || '';
  return (typeof t === 'string' ? t : JSON.stringify(t)).includes(tag);
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

export function registerShioriDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-042 シオリ・ノヴェラ (主推 PR) oshi/SP — blue-PR enhance pattern.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-042', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const matches = own.zones[ZONE.DECK].filter(c =>
        isMember(getCard(c.cardId)?.type) && getCard(c.cardId)?.color === '藍'
      );
      if (matches.length === 0) {
        shuffleArr(own.zones[ZONE.DECK]);
        return { state, resolved: true, log: 'SP: 牌組無藍色成員 — 重新洗牌' };
      }
      return {
        state, resolved: false,
        prompt: {
          type: 'SEARCH_SELECT', player: ctx.player,
          message: 'SP「Birthday Gift ～Blue～」: 選擇 1 張藍色成員加入手牌',
          cards: archivePicks(matches),
          maxSelect: 1, afterAction: 'ADD_TO_HAND',
        },
        log: 'SP: 搜尋藍色成員',
      };
    }
    const blues = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.color === '藍');
    if (blues.length === 0) return { state, resolved: true, log: 'oshi: 無藍色成員 — 跳過' };
    if (blues.length === 1) {
      const target = blues[0];
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: target.inst.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `oshi: ${getCard(target.inst.cardId)?.name||''} 本回合 +20` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'oshi「ブルーエンハンス」: 選擇 1 位藍色成員 +20 藝能傷害',
        cards: memberPicks(blues),
        maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER',
        amount: 20,
      },
      log: 'oshi: 選擇藍色成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP04-053 シオリ・ノヴェラ (1st Buzz) effectB「禁断の知識」
  // REAL: 將自己吶喊牌組上方的1張牌，發送給自己標示#EN的成員。
  // ACTION: cheer top → #EN member (mandatory)
  // AMBIGUITY: 0 EN → skip; 1 → auto; multi → SELECT_OWN_MEMBER
  // LIMITS: ON_BLOOM self-only
  // CONDITIONS: cheer deck non-empty + ≥1 #EN member
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP04-053', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (own.zones[ZONE.CHEER_DECK].length === 0) return { state, resolved: true, log: '禁断の知識: 吶喊牌組空' };
    const ens = getStageMembers(own).filter(m => hasTag(m.inst, '#EN'));
    if (ens.length === 0) return { state, resolved: true, log: '禁断の知識: 無 #EN' };
    if (ens.length === 1) {
      const t = ens[0].inst;
      const cheer = own.zones[ZONE.CHEER_DECK].shift();
      cheer.faceDown = false;
      t.attachedCheer = t.attachedCheer || [];
      t.attachedCheer.push(cheer);
      return { state, resolved: true, log: `禁断の知識: 吶喊→${getCard(t.cardId)?.name||''}` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: '禁断の知識: 選擇 1 位 #EN 成員接收吶喊',
        cards: memberPicks(ens),
        maxSelect: 1, afterAction: 'CHEER_FROM_DECK_TOP_TO_MEMBER',
      },
      log: '禁断の知識: 選擇 #EN',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-059 シオリ・ノヴェラ (Debut) effectC「It's Time to Play Dress-up!」/ art1
  // EFFECTC REAL: 如果在自己後攻的第一個回合，將自己存檔區的1張支援卡返回手牌。
  // ART1 REAL: DMG:10 / 給予對手的1位成員10點特殊傷害。
  // ACTION: effectC: post-attack first-turn → SELECT_FROM_ARCHIVE support → hand
  //         art1: 10 special opp member (auto if 1)
  // AMBIGUITY: effectC archive 0 → skip; ≥1 → SELECT_FROM_ARCHIVE
  //            art1: opp 0 → skip; 1 → auto; multi → MANUAL_EFFECT (no opp picker)
  // LIMITS: ON_COLLAB self-only / art-time
  // CONDITIONS: see REAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-059', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const goingSecond = state.firstPlayer != null && state.firstPlayer !== ctx.player;
    const isFirstTurnForMe = state.turnNumber === 2 && goingSecond;
    if (!isFirstTurnForMe) return { state, resolved: true, log: 'Dress-up!: 非後攻第一回合' };
    const own = state.players[ctx.player];
    const supports = own.zones[ZONE.ARCHIVE].filter(c => isSupportCard(getCard(c.cardId)));
    if (supports.length === 0) return { state, resolved: true, log: 'Dress-up!: 存檔無支援卡' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: 'Dress-up!: 選擇 1 張支援卡回手牌',
        cards: archivePicks(supports),
        maxSelect: 1, afterAction: 'RETURN_FROM_ARCHIVE',
      },
      log: 'Dress-up!: 選擇支援卡',
    };
  });
  reg('hBP07-059', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const opp = state.players[1 - ctx.player];
    const oppTargets = [
      opp.zones[ZONE.CENTER], opp.zones[ZONE.COLLAB],
      ...(opp.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean);
    if (oppTargets.length === 0) return { state, resolved: true, log: 'A Cozy Night: 對手無成員' };
    if (oppTargets.length === 1) {
      oppTargets[0].damage = (oppTargets[0].damage || 0) + 10;
      return { state, resolved: true, log: `A Cozy Night: ${getCard(oppTargets[0].cardId)?.name||''} 10 特殊傷害` };
    }
    return { state }; // MANUAL_EFFECT — opp target picker missing
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD12-001 シオリ・ノヴェラ (主推 SD12) oshi「収集家」/ SP「リベリオン」
  // OSHI REAL: [每個回合一次]查看自己牌組上方的3張牌。展示1張支援卡並加入手牌。其餘依照喜歡的順序放回牌組下方。
  // SP REAL:   [每場比賽一次]自己的存檔區每有1張支援卡，給予對手1位Debut以外的後台成員10點特殊傷害。
  // ACTION: oshi → look top 3 + reveal 1 support → hand + order remainder bottom (multi-step → MANUAL)
  //         SP → archive support count × 10 to picked opp non-Debut backstage
  // AMBIGUITY: oshi: full multi-step picker → MANUAL_EFFECT
  //            SP: opp non-Debut backstage 0 → skip; 1 → auto; multi → MANUAL
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: see REAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD12-001', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    if (ctx.skillType === 'sp') {
      const own = state.players[ctx.player];
      const supportCount = own.zones[ZONE.ARCHIVE].filter(c => isSupportCard(getCard(c.cardId))).length;
      if (supportCount === 0) return { state, resolved: true, log: 'SP「リベリオン」: 存檔無支援卡 — 跳過' };
      const opp = state.players[1 - ctx.player];
      const oppBackstage = (opp.zones[ZONE.BACKSTAGE] || []).filter(m => getCard(m.cardId)?.bloom !== 'Debut');
      if (oppBackstage.length === 0) return { state, resolved: true, log: 'SP: 對手後台無 Debut 以外成員' };
      const dmg = supportCount * 10;
      if (oppBackstage.length === 1) {
        oppBackstage[0].damage = (oppBackstage[0].damage || 0) + dmg;
        return { state, resolved: true, log: `SP「リベリオン」: 支援 ${supportCount} → ${getCard(oppBackstage[0].cardId)?.name||''} ${dmg} 特殊傷害` };
      }
      return { state }; // MANUAL_EFFECT — opp backstage picker missing
    }
    return { state }; // oshi: MANUAL_EFFECT — look-3 + reveal-1 + reorder chain
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD12-003 シオリ・ノヴェラ (Debut SD12) effectC「パレ・モンローズのお話を…」
  // REAL: 給予對手的1位後台成員10點特殊傷害。
  // ACTION: 10 special to picked opp backstage
  // AMBIGUITY: opp backstage 0 → skip; 1 → auto; multi → MANUAL_EFFECT (picker missing)
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: ≥1 opp backstage
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD12-003', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const opp = state.players[1 - ctx.player];
    const back = (opp.zones[ZONE.BACKSTAGE] || []);
    if (back.length === 0) return { state, resolved: true, log: 'パレ・モンローズ: 對手後台無成員' };
    if (back.length === 1) {
      back[0].damage = (back[0].damage || 0) + 10;
      return { state, resolved: true, log: `パレ・モンローズ: ${getCard(back[0].cardId)?.name||''} 10 特殊傷害` };
    }
    return { state }; // MANUAL_EFFECT — opp backstage picker missing
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD12-005 シオリ・ノヴェラ (1st SD12) effectC「『異世界への旅立ちと幸せ』」
  // REAL: 將自己存檔區的1張吶喊卡發送給自己標示#Advent的成員。
  // ACTION: archive cheer picker → #Advent member
  // AMBIGUITY: archive 0 → skip; ≥1 + ≥1 #Advent → CHEER_FROM_ARCHIVE_TO_MEMBER
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: ≥1 archive cheer + ≥1 #Advent member
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD12-005', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const cheers = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.type === '吶喊');
    if (cheers.length === 0) return { state, resolved: true, log: '異世界への旅立ち: 存檔無吶喊' };
    const advents = getStageMembers(own).filter(m => hasTag(m.inst, '#Advent'));
    if (advents.length === 0) return { state, resolved: true, log: '異世界への旅立ち: 無 #Advent' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: '異世界への旅立ち: 選擇 1 張吶喊卡 → #Advent',
        cards: archivePicks(cheers),
        maxSelect: 1,
        afterAction: 'CHEER_FROM_ARCHIVE_TO_MEMBER',
        targets: memberPicks(advents),
      },
      log: '異世界への旅立ち: 選吶喊',
    };
  });

  return count;
}
