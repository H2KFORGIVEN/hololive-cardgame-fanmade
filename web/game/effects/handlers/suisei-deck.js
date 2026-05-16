// 星街すいせい deck handlers — written from real card text per the
// "no guessing" rule. Heavy theme: special damage to opp BACKSTAGE.

import { getCard, getCardImage } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE, isMember } from '../../core/constants.js';
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
    instanceId: c.instanceId, cardId: c.cardId,
    name: getCard(c.cardId)?.name || '', image: getCardImage(c.cardId),
  }));
}

function memberPicks(members) {
  return members.map(m => ({
    instanceId: m.inst.instanceId, cardId: m.inst.cardId,
    name: getCard(m.inst.cardId)?.name || '', image: getCardImage(m.inst.cardId),
  }));
}

// Get all opponent backstage members as picker entries
function oppBackstagePicks(state, ownPlayerIdx) {
  const opp = state.players[1 - ownPlayerIdx];
  return (opp.zones[ZONE.BACKSTAGE] || []).filter(Boolean).map(inst => ({
    instanceId: inst.instanceId, cardId: inst.cardId,
    name: getCard(inst.cardId)?.name || '', image: getCardImage(inst.cardId),
  }));
}

export function registerSuiseiDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-034 星街すいせい (主推) oshi「ブルーエンハンス」/ SP「Birthday Gift ～Blue～」
  // OSHI REAL: [每個回合一次]這個回合中，自己的1位藍色成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]從自己的牌組展示1張藍色成員並加入手牌。將牌組重新洗牌。
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-034', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const matches = own.zones[ZONE.DECK].filter(c => isMember(getCard(c.cardId)?.type) && getCard(c.cardId)?.color === '藍');
      if (matches.length === 0) {
        shuffleArr(own.zones[ZONE.DECK]);
        return { state, resolved: true, log: 'SP: 牌組無藍色成員 — 重新洗牌' };
      }
      return {
        state, resolved: false,
        prompt: { type: 'SEARCH_SELECT', player: ctx.player,
          message: 'SP: 選擇 1 張藍色成員加入手牌',
          cards: archivePicks(matches), maxSelect: 1, afterAction: 'ADD_TO_HAND' },
        log: 'SP: 搜尋藍色成員',
      };
    }
    const blueMembers = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.color === '藍');
    if (blueMembers.length === 0) return { state, resolved: true, log: 'oshi: 無藍色成員' };
    if (blueMembers.length === 1) {
      const t = blueMembers[0];
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: t.inst.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `oshi: ${getCard(t.inst.cardId)?.name||''} +20` };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'oshi「ブルーエンハンス」: 選擇 1 位藍色成員 +20',
        cards: memberPicks(blueMembers), maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER', amount: 20 },
      log: 'oshi: 選擇藍色成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP01-007 星街すいせい (主推) oshi「ほうき星」/ SP「シューティングスター」
  // OSHI REAL: [每個回合一次]這個主推或自己的藍色成員給予了對手的後台成員傷害時可以使用：
  //            給予對手該1位後台成員50點特殊傷害。
  // SP REAL:   [每場比賽一次]自己的藍色成員給予了對手的中心成員或聯動成員傷害時可以使用：
  //            給予對手的1位後台成員相同數值的特殊傷害。
  // ACTION: oshi reactive — when own oshi/blue member damages opp backstage → +50 to that backstage
  //         SP reactive — when own blue damages opp center/collab → mirror dmg to picked opp backstage
  // → both reactive paths require state hook tracking; handler is reactive flow
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP01-007', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType !== 'reactive') return { state }; // non-reactive use → MANUAL
    return { state, resolved: true };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP01-076 星街すいせい (Debut) art1「スターの原石」
  // REAL: 給予對手的1位後台成員10點特殊傷害(即使擊倒對手的成員，也不會減少對手的生命值)。
  // ACTION: pick opp backstage → 10 special dmg (no life loss)
  // AMBIGUITY: 0 → skip; 1 → auto; multi → SELECT picker (opp side)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP01-076', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const oppBack = oppBackstagePicks(state, ctx.player);
    if (oppBack.length === 0) return { state, resolved: true, log: 'スターの原石: 對手後台空' };
    if (oppBack.length === 1) {
      const target = state.players[1 - ctx.player].zones[ZONE.BACKSTAGE].find(m => m && m.instanceId === oppBack[0].instanceId);
      if (target) target.damage = (target.damage || 0) + 10;
      return { state, resolved: true, log: `スターの原石: 對手後台 ${oppBack[0].name} 10傷害` };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_TARGET', player: ctx.player,
        message: 'スターの原石: 選擇 1 位對手後台成員受 10 點特殊傷害',
        cards: oppBack, maxSelect: 1, afterAction: 'OPP_MEMBER_DAMAGE',
        damageAmount: 10 },
      log: 'スターの原石: 選擇對手後台',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP01-077 星街すいせい (Debut) effectC「煌きのワードローブ」
  // REAL: 自己的主推為「星街すいせい」時，可以將這個成員的1張藍色吶喊卡放到存檔區：
  //       從自己的牌組抽2張牌。
  // ACTION: conditional cost — if oshi is すいせい, may archive 1 blue cheer of self → draw 2
  // AMBIGUITY: cost-bearing optional; unless we add a "pick attached cheer" prompt → MANUAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP01-077', HOOK.ON_COLLAB, (state, ctx) => ({ state }));

  // ─────────────────────────────────────────────────────────────────────
  // hBP01-079 星街すいせい (1st) effectB「あっと驚かせるから見逃さないでね！」
  // REAL: 給予對手的1位後台成員20點特殊傷害(即使擊倒對手的成員，也不會減少對手的生命值)。
  // ACTION: pick opp backstage → 20 dmg
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP01-079', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const oppBack = oppBackstagePicks(state, ctx.player);
    if (oppBack.length === 0) return { state, resolved: true, log: '對手後台空' };
    if (oppBack.length === 1) {
      const target = state.players[1 - ctx.player].zones[ZONE.BACKSTAGE].find(m => m && m.instanceId === oppBack[0].instanceId);
      if (target) target.damage = (target.damage || 0) + 20;
      return { state, resolved: true, log: `あっと驚かせる: 對手後台 ${oppBack[0].name} 20傷害` };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_TARGET', player: ctx.player,
        message: 'あっと驚かせる: 選擇 1 位對手後台成員受 20 點特殊傷害',
        cards: oppBack, maxSelect: 1, afterAction: 'OPP_MEMBER_DAMAGE',
        damageAmount: 20 },
      log: 'あっと驚かせる: 選擇對手後台',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP01-080 星街すいせい (1st) effectC「雪山の記憶」
  // REAL: 可以擲1次骰子：奇數時，擊倒對手1位HP減少40以上的後台成員
  //       (即使擊倒對手的成員，也不會減少對手的生命值)。
  // ACTION: optional dice; odd → pick opp backstage with damage ≥40, knock down
  // AMBIGUITY: 0 candidates → skip; 1 → auto; multi → picker
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP01-080', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const r = rollDieFor(state, { player: ctx.player, member: ctx.memberInst });
    if (r % 2 === 0) return { state, resolved: true, log: `雪山の記憶 骰${r}: 偶數無效果` };
    const opp = state.players[1 - ctx.player];
    const candidates = (opp.zones[ZONE.BACKSTAGE] || []).filter(m => m && (m.damage || 0) >= 40);
    if (candidates.length === 0) return { state, resolved: true, log: `雪山の記憶 骰${r}: 無 HP≥40 受傷後台` };
    if (candidates.length === 1) {
      const t = candidates[0];
      const card = getCard(t.cardId);
      const hp = card?.hp || 0;
      t.damage = hp; // knock down (no life loss)
      return { state, resolved: true, log: `雪山の記憶 骰${r}: 擊倒 ${card?.name||''}` };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_TARGET', player: ctx.player,
        message: `雪山の記憶 骰${r}: 選擇 1 位 HP 減少 ≥40 的對手後台 — 擊倒（無生命扣）`,
        cards: candidates.map(m => ({
          instanceId: m.instanceId, cardId: m.cardId,
          name: getCard(m.cardId)?.name||'', image: getCardImage(m.cardId),
        })),
        maxSelect: 1, afterAction: 'OPP_MEMBER_DAMAGE',
        damageAmount: 9999, // huge dmg to knock
      },
      log: `雪山の記憶 骰${r}: 選擇後台擊倒`,
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP01-081 星街すいせい (2nd) effectC「空を駆ける光」/ art1「輝く彗星」
  // EFFECTC REAL: 將自己吶喊牌組上方的1張牌發送給自己的藍色成員。
  // ART1 REAL:    可以將這個成員的2張藍色吶喊卡放到存檔區：每有1張與這個成員重疊的成員，
  //               這個藝能傷害+60(可以選擇對手的後台成員為對象)。
  // ACTION: effectC pick blue member → top cheer-deck. art1 cost-bearing → MANUAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP01-081', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const own = state.players[ctx.player];
    const blueMembers = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.color === '藍');
    if (blueMembers.length === 0) return { state, resolved: true, log: '空を駆ける光: 無藍色成員' };
    if (own.zones[ZONE.CHEER_DECK].length === 0) return { state, resolved: true, log: '吶喊牌組空' };
    if (blueMembers.length === 1) {
      const t = blueMembers[0];
      const cheer = own.zones[ZONE.CHEER_DECK].shift();
      cheer.faceDown = false;
      t.inst.attachedCheer = t.inst.attachedCheer || [];
      t.inst.attachedCheer.push(cheer);
      return { state, resolved: true, log: `空を駆ける光: 吶喊→${getCard(t.inst.cardId)?.name||''}` };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: '空を駆ける光: 選擇 1 位藍色成員接收頂部吶喊',
        cards: memberPicks(blueMembers), maxSelect: 1, afterAction: 'CHEER_FROM_DECK_TOP_TO_MEMBER' },
      log: '空を駆ける光: 選擇藍色成員',
    };
  });
  reg('hBP01-081', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    return { state }; // MANUAL — cost-bearing + opp picker
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP03-044 星街すいせい (1st) effectB「プラネットステージ」/ art1「バーチャルゴースト」
  // EFFECTB REAL: 查看自己牌組上方的4張牌。展示1張「星街すいせい」並加入手牌。
  //               其餘依照喜歡的順序放回牌組下方。
  // ART1 REAL:    自己的主推為「星街すいせい」時，可以將這個成員的1張藍色吶喊卡，
  //               替換給自己的後台成員「星街すいせい」。
  // ACTION: effectB → top 4 reveal → pick 1 すいせい member to hand
  //         art1 conditional cost-bearing two-step → MANUAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-044', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const top4 = own.zones[ZONE.DECK].slice(0, Math.min(4, own.zones[ZONE.DECK].length));
    if (top4.length === 0) return { state, resolved: true, log: '牌組空' };
    const matches = top4.filter(c => isMember(getCard(c.cardId)?.type) && getCard(c.cardId)?.name === '星街すいせい');
    if (matches.length === 0) {
      return {
        state, resolved: false,
        prompt: { type: 'ORDER_TO_BOTTOM', player: ctx.player,
          message: 'プラネットステージ: 頂 4 張無「星街すいせい」 — 選擇放回牌底順序',
          cards: archivePicks(top4) },
        log: 'プラネットステージ: 頂 4 張無 すいせい',
      };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SEARCH_SELECT', player: ctx.player,
        message: 'プラネットステージ: 選擇 1 張「星街すいせい」加入手牌',
        cards: archivePicks(matches), maxSelect: 1, afterAction: 'ADD_TO_HAND',
        remainingCards: archivePicks(top4), noShuffle: true },
      log: 'プラネットステージ: 選擇 すいせい',
    };
  });
  reg('hBP03-044', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    return { state }; // MANUAL — conditional + cost-bearing
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-036 星街すいせい (Debut) art1「声出し最高！」
  // REAL: 如果對手後台成員的HP有減少，這個藝能傷害+20。
  // ACTION: condition check → +20
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-036', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const opp = state.players[1 - ctx.player];
    const anyDamagedBack = (opp.zones[ZONE.BACKSTAGE] || []).some(m => m && (m.damage || 0) > 0);
    if (!anyDamagedBack) return { state, resolved: true, log: '声出し最高！: 對手後台無受傷' };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 20, target: 'self', duration: 'instant' },
      log: '声出し最高！: 對手後台受傷 → +20',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-037 星街すいせい (2nd) art1「Non-Limit Boost」/ art2「Shout in Crisis」
  // ART1 REAL: 如果這個成員有紅色吶喊卡與藍色吶喊卡，可以將自己存檔區的2張吶喊卡發送給這個成員。
  //            如果只有1種顏色的吶喊卡，可以將自己存檔區的1張吶喊卡發送給這個成員。
  // ART2 REAL: 將這個成員的所有吶喊卡放到存檔區。
  // ACTION: art1 — conditional self-cheer-attach (count source archive); art2 — strip own cheer
  // → art1 MANUAL (player decides which archive cheer to use); art2 auto-strip
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-037', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey === 'art2' && ctx.cardId === 'hBP05-037') {
      const own = state.players[ctx.player];
      if (!ctx.memberInst) return { state, resolved: true };
      const cheer = ctx.memberInst.attachedCheer || [];
      let moved = 0;
      while (cheer.length > 0) {
        const c = cheer.shift();
        own.zones[ZONE.ARCHIVE].push(c);
        moved++;
      }
      return { state, resolved: true, log: `Shout in Crisis: 自身 ${moved} 張吶喊存檔` };
    }
    return { state, resolved: true };
  });
  // art1 → MANUAL
  reg('hBP05-037', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    return { state };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD07-013 星街すいせい (Debut) effectC「ご飯が底をつきそう……」
  // REAL: 自己的中心成員為「不知火フレア」時，可以將自己存檔區的1張吶喊卡，
  //       發送給自己這個成員以外的成員。
  // ACTION: conditional + pick own non-self member + pick archive cheer → cost-bearing two-step → MANUAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD07-013', HOOK.ON_COLLAB, (state, ctx) => ({ state }));

  // ─────────────────────────────────────────────────────────────────────
  // hSD17-001 星街すいせい (主推) oshi「張り切ってがんばろーー!!!」/ SP「流れ星」
  // OSHI REAL: [每個回合一次]將自己吶喊牌組上方的1張牌發送給自己的成員。
  // SP REAL:   [每場比賽一次]如果自己的中心成員為「星街すいせい」，給予對手的1位後台成員50點特殊傷害。
  // ACTION: oshi pick own member → top cheer; SP conditional + pick opp backstage → 50 dmg
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD17-001', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const center = own.zones[ZONE.CENTER];
      if (!center || getCard(center.cardId)?.name !== '星街すいせい') {
        return { state, resolved: true, log: 'SP: 中心非「星街すいせい」' };
      }
      const oppBack = oppBackstagePicks(state, ctx.player);
      if (oppBack.length === 0) return { state, resolved: true, log: 'SP: 對手後台空' };
      if (oppBack.length === 1) {
        const t = state.players[1 - ctx.player].zones[ZONE.BACKSTAGE].find(m => m && m.instanceId === oppBack[0].instanceId);
        if (t) t.damage = (t.damage || 0) + 50;
        return { state, resolved: true, log: `SP: 對手後台 ${oppBack[0].name} 50傷害` };
      }
      return {
        state, resolved: false,
        prompt: { type: 'SELECT_TARGET', player: ctx.player,
          message: 'SP「流れ星」: 選擇 1 位對手後台成員受 50 點特殊傷害',
          cards: oppBack, maxSelect: 1, afterAction: 'OPP_MEMBER_DAMAGE',
          damageAmount: 50 },
        log: 'SP: 選擇對手後台',
      };
    }
    // oshi: pick own member → top cheer
    const stage = getStageMembers(own);
    if (stage.length === 0 || own.zones[ZONE.CHEER_DECK].length === 0) {
      return { state, resolved: true, log: 'oshi: 無成員 / 吶喊牌組空' };
    }
    if (stage.length === 1) {
      const cheer = own.zones[ZONE.CHEER_DECK].shift();
      cheer.faceDown = false;
      stage[0].inst.attachedCheer = stage[0].inst.attachedCheer || [];
      stage[0].inst.attachedCheer.push(cheer);
      return { state, resolved: true, log: `oshi: 吶喊→${getCard(stage[0].inst.cardId)?.name||''}` };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'oshi「張り切ってがんばろー」: 選擇 1 位成員接收頂部吶喊',
        cards: memberPicks(stage), maxSelect: 1, afterAction: 'CHEER_FROM_DECK_TOP_TO_MEMBER' },
      log: 'oshi: 選擇接收成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD17-004 星街すいせい (Debut) effectC「ファーストスター」
  // REAL: 如果在自己後攻的第一個回合，給予對手的1位後台成員20點特殊傷害。
  // ACTION: back-attack 1st turn → pick opp backstage → 20 dmg
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD17-004', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const isBackAttackFirst = state.firstTurn?.[ctx.player] && ctx.player !== state.firstPlayer;
    if (!isBackAttackFirst) return { state, resolved: true, log: 'ファーストスター: 非後攻第1回合' };
    const oppBack = oppBackstagePicks(state, ctx.player);
    if (oppBack.length === 0) return { state, resolved: true, log: '對手後台空' };
    if (oppBack.length === 1) {
      const t = state.players[1 - ctx.player].zones[ZONE.BACKSTAGE].find(m => m && m.instanceId === oppBack[0].instanceId);
      if (t) t.damage = (t.damage || 0) + 20;
      return { state, resolved: true, log: `ファーストスター: 對手後台 ${oppBack[0].name} 20傷害` };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_TARGET', player: ctx.player,
        message: 'ファーストスター: 選擇 1 位對手後台成員受 20 點特殊傷害',
        cards: oppBack, maxSelect: 1, afterAction: 'OPP_MEMBER_DAMAGE',
        damageAmount: 20 },
      log: 'ファーストスター: 選擇對手後台',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD17-005 art1, hSD17-007 effectB, hSD17-008 art1: same shape — pick opp back, 10 dmg
  // ─────────────────────────────────────────────────────────────────────
  function oppBack10Damage(state, ctx, label) {
    const oppBack = oppBackstagePicks(state, ctx.player);
    if (oppBack.length === 0) return { state, resolved: true, log: `${label}: 對手後台空` };
    if (oppBack.length === 1) {
      const t = state.players[1 - ctx.player].zones[ZONE.BACKSTAGE].find(m => m && m.instanceId === oppBack[0].instanceId);
      if (t) t.damage = (t.damage || 0) + 10;
      return { state, resolved: true, log: `${label}: ${oppBack[0].name} 10傷害` };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_TARGET', player: ctx.player,
        message: `${label}: 選擇 1 位對手後台成員受 10 點特殊傷害`,
        cards: oppBack, maxSelect: 1, afterAction: 'OPP_MEMBER_DAMAGE',
        damageAmount: 10 },
      log: `${label}: 選擇對手後台`,
    };
  }

  // hSD17-005 art1「よーし、レッスン開始だー！」: pick opp back 10 dmg
  reg('hSD17-005', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    return oppBack10Damage(state, ctx, 'レッスン開始');
  });

  // hSD17-007 effectB「Message for You -すいせい-」: [限定後台] pick opp back 10 dmg
  reg('hSD17-007', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const isBackstage = (own.zones[ZONE.BACKSTAGE] || []).some(m => m && m.instanceId === ctx.memberInst?.instanceId);
    if (!isBackstage) return { state, resolved: true, log: 'Message for You: 非後台位置' };
    return oppBack10Damage(state, ctx, 'Message for You');
  });

  // hSD17-008 effectG「明日への歌」 + art1「あなたの一番星」
  reg('hSD17-008', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.triggerEvent !== 'reactive_knockdown') return { state, resolved: true };
    if (ctx.knockedOutCardId !== 'hSD17-008') return { state, resolved: true };
    if (state.activePlayer === ctx.player) return { state, resolved: true };
    drawCards(state.players[ctx.player], 1);
    return { state, resolved: true, log: '明日への歌: 對手回合被擊倒 → 抽 1' };
  });
  reg('hSD17-008', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    return oppBack10Damage(state, ctx, 'あなたの一番星');
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD17-009 星街すいせい (2nd) effectC「踊ったもん勝ち！」
  // REAL: 這個回合中，這個成員的藝能傷害+20。
  // ACTION: self-boost +20 turn
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD17-009', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    if (!ctx.memberInst) return { state, resolved: true };
    state._turnBoosts = state._turnBoosts || [];
    state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: ctx.memberInst.instanceId, duration: 'turn' });
    return { state, resolved: true, log: '踊ったもん勝ち！: 自身本回合 +20' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hYS01-004 星街すいせい (主推) oshi「ブルーバトン」/ SP「バックショット」
  // OSHI REAL: [每個回合一次]這個回合中，自己的藍色聯動成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]自己的成員給予了對手的後台成員傷害時可以使用：
  //            給予對手該1位後台成員50點特殊傷害。
  // ACTION: oshi → boost own blue collab member +20 (target = COLLAB if blue)
  //         SP → reactive (handler runs in reactive flow)
  // ─────────────────────────────────────────────────────────────────────
  reg('hYS01-004', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') return { state }; // reactive — MANUAL trigger
    const collab = own.zones[ZONE.COLLAB];
    if (!collab || getCard(collab.cardId)?.color !== '藍') {
      return { state, resolved: true, log: 'oshi: 聯動非藍色 — 跳過' };
    }
    state._turnBoosts = state._turnBoosts || [];
    state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: collab.instanceId, duration: 'turn' });
    return { state, resolved: true, log: `oshi: 藍色聯動 ${getCard(collab.cardId)?.name||''} +20` };
  });

  return count;
}
