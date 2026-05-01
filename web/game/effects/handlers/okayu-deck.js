// 猫又おかゆ deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// 5-line spec block per handler: REAL / ACTION / AMBIGUITY / LIMITS / CONDITIONS.
//
// Already-wired おかゆ cards (NOT redefined here):
//   - hBP02-041 (1st Buzz effectG passive + art1 ON_ART_RESOLVE): phaseC1
//
// Vanilla — skipped: hSD03-002, hSD03-005, hSD03-008 (effectG only is informational
//   — the +20 to other oshi-named members would need passive global handler;
//   left as informational stub since it spans multiple oshi-named members).

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

export function registerOkayuDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-026 猫又おかゆ (主推 PR) oshi/SP — blue-PR enhance pattern.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-026', HOOK.ON_OSHI_SKILL, (state, ctx) => {
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
  // hBP05-004 猫又おかゆ (主推 hBP05) oshi「いっくよー」/ SP「ウマウマ！」
  // OSHI REAL: [每個回合一次]如果自己的中心成員為「猫又おかゆ」才可以使用：給予對手的1位成員10點特殊傷害。
  // SP REAL:   [每場比賽一次]可以將對手的中心成員與1位HP有減少的後台成員進行替換。之後，如果自己的中心成員為「猫又おかゆ」，從自己的牌組抽3張牌。
  // ACTION: oshi → center=おかゆ check + 10 special to picked opp member
  //         SP → swap opp center↔backstage damaged + maybe draw 3
  // AMBIGUITY: oshi: opp targets 0 → skip; 1 → auto; multi → MANUAL_EFFECT (target picker missing)
  //            SP: multi-step swap → MANUAL_EFFECT
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: oshi: own center name='猫又おかゆ'; SP: opp damaged backstage exists
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-004', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    if (ctx.skillType === 'sp') {
      return { state }; // MANUAL_EFFECT — opp center↔backstage swap chain
    }
    // oshi
    const own = state.players[ctx.player];
    const center = own.zones[ZONE.CENTER];
    if (!center || getCard(center.cardId)?.name !== '猫又おかゆ') {
      return { state, resolved: true, log: 'いっくよー: 中心非「猫又おかゆ」 — 跳過' };
    }
    const opp = state.players[1 - ctx.player];
    const oppTargets = [
      opp.zones[ZONE.CENTER], opp.zones[ZONE.COLLAB],
      ...(opp.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean);
    if (oppTargets.length === 0) return { state, resolved: true, log: 'いっくよー: 對手無成員' };
    if (oppTargets.length === 1) {
      oppTargets[0].damage = (oppTargets[0].damage || 0) + 10;
      return { state, resolved: true, log: `いっくよー: ${getCard(oppTargets[0].cardId)?.name||''} 10 特殊傷害` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_TARGET', player: ctx.player,
        message: 'いっくよー: 選擇對手 1 位成員（10 特殊傷害）',
        cards: oppTargets.map(m => ({
          instanceId: m.instanceId, cardId: m.cardId,
          name: getCard(m.cardId)?.name || '',
          image: getCardImage(m.cardId),
        })),
        maxSelect: 1, afterAction: 'OPP_MEMBER_DAMAGE',
        damageAmount: 10,
      },
      log: 'いっくよー: 選擇對手成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-041 猫又おかゆ (Debut) art1「ぐるぐる～」
  // REAL: DMG:20 / 給予對手的中心成員10點特殊傷害。
  // ACTION: 10 special to opp center
  // AMBIGUITY: target = opp center (single)
  // LIMITS: art-time
  // CONDITIONS: opp center exists
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-041', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const opp = state.players[1 - ctx.player];
    const oppCenter = opp.zones[ZONE.CENTER];
    if (!oppCenter) return { state, resolved: true, log: 'ぐるぐる～: 對手無中心' };
    oppCenter.damage = (oppCenter.damage || 0) + 10;
    return { state, resolved: true, log: 'ぐるぐる～: 對手中心 10 特殊傷害' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-042 猫又おかゆ (Debut) effectC「一緒に入ろ～！」
  // REAL: 如果在自己後攻的第一個回合，從自己的牌組展示1張標示#ゲーマーズ的2nd成員並加入手牌。將牌組重新洗牌。
  // ACTION: post-attack first turn → search #ゲーマーズ 2nd → hand
  // AMBIGUITY: 0 → reshuffle; ≥1 → SEARCH_SELECT
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: turnNumber=2 + state.firstPlayer != ctx.player
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-042', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const goingSecond = state.firstPlayer != null && state.firstPlayer !== ctx.player;
    const isFirstTurnForMe = state.turnNumber === 2 && goingSecond;
    if (!isFirstTurnForMe) return { state, resolved: true, log: '一緒に入ろ～！: 非後攻第一回合' };
    const own = state.players[ctx.player];
    const matches = own.zones[ZONE.DECK].filter(c => {
      const card = getCard(c.cardId);
      return hasTag(c, '#ゲーマーズ') && card?.bloom === '2nd';
    });
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: '一緒に入ろ～！: 牌組無 #ゲーマーズ 2nd' };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT', player: ctx.player,
        message: '一緒に入ろ～！: 選擇 1 張 #ゲーマーズ 2nd 成員加入手牌',
        cards: archivePicks(matches),
        maxSelect: 1, afterAction: 'ADD_TO_HAND',
      },
      log: '一緒に入ろ～！: 搜尋 #ゲーマーズ 2nd',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-057 猫又おかゆ (2nd) effectC「君と遊ぶとドキドキしちゃう…」
  // REAL: 給予對手的1位成員30點特殊傷害。
  // ACTION: 30 special to picked opp member
  // AMBIGUITY: opp targets 0 → skip; 1 → auto; multi → MANUAL (target picker missing)
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: ≥1 opp member
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-057', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const opp = state.players[1 - ctx.player];
    const oppTargets = [
      opp.zones[ZONE.CENTER], opp.zones[ZONE.COLLAB],
      ...(opp.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean);
    if (oppTargets.length === 0) return { state, resolved: true, log: '君と遊ぶと: 對手無成員' };
    if (oppTargets.length === 1) {
      oppTargets[0].damage = (oppTargets[0].damage || 0) + 30;
      return { state, resolved: true, log: `君と遊ぶと: ${getCard(oppTargets[0].cardId)?.name||''} 30 特殊傷害` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_TARGET', player: ctx.player,
        message: '君と遊ぶとドキドキ: 選擇對手 1 位成員（30 特殊傷害）',
        cards: oppTargets.map(m => ({
          instanceId: m.instanceId, cardId: m.cardId,
          name: getCard(m.cardId)?.name || '',
          image: getCardImage(m.cardId),
        })),
        maxSelect: 1, afterAction: 'OPP_MEMBER_DAMAGE',
        damageAmount: 30,
      },
      log: '君と遊ぶとドキドキ: 選擇對手成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD03-001 猫又おかゆ (主推 SD03) oshi「ブルーマイク」/ SP「バックショット」
  // OSHI REAL: [每個回合一次]這個回合中，自己的藍色中心成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]自己舞台上的成員給予了對手的後台成員傷害時可以使用：給予對手該1位後台成員50點特殊傷害。
  // ACTION: oshi → blue center auto +20; SP → REACTIVE: when own member damages opp backstage → +50 special
  // AMBIGUITY: SP needs ON_DAMAGE_DEALT trigger; complex — falls through to MANUAL_EFFECT
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: see REAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD03-001', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    if (ctx.skillType === 'sp') {
      // SP is REACTIVE on damage-dealt-to-opp-backstage; engine doesn't expose that
      // pre-damage trigger uniformly → MANUAL_EFFECT
      return { state, resolved: true, log: 'SP「バックショット」: 反應式特殊傷害（手動觸發）' };
    }
    const own = state.players[ctx.player];
    const center = own.zones[ZONE.CENTER];
    if (!center || getCard(center.cardId)?.color !== '藍') {
      return { state, resolved: true, log: 'oshi「ブルーマイク」: 中心非藍色 — 跳過' };
    }
    state._turnBoosts = state._turnBoosts || [];
    state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: center.instanceId, duration: 'turn' });
    return { state, resolved: true, log: `oshi: 中心 ${getCard(center.cardId)?.name||''} 本回合 +20` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // Phase 2.4 #1+2: cost-bearing afterAction conversions for おかゆ multi-target
  // damage cards. Each replaces the phaseC1 auto-spend with a proper picker.
  // Pattern: 「將這個成員的1張藍色吶喊卡放到存檔區」+ 「中心 N + 後台 1 位 N」.
  // ─────────────────────────────────────────────────────────────────────

  // helper: build cheer picker from a specific member's attachedCheer, filtered by color
  function buildBluePickerFromMember(member) {
    if (!member) return [];
    return (member.attachedCheer || [])
      .filter(c => getCard(c.cardId)?.color === '藍')
      .map(c => ({
        instanceId: c.instanceId, cardId: c.cardId,
        name: getCard(c.cardId)?.name || '吶喊',
        image: getCardImage(c.cardId),
      }));
  }

  // hBP02-041 おかゆ (1st Buzz) art1「ぽいずん猫」
  // REAL: DMG:50 / 可以將這個成員的1張藍色吶喊卡放到存檔區：給予對手的中心成員與1位後台成員20點特殊傷害。
  // Override at ON_ART_DECLARE; suppress phaseC1 ON_ART_RESOLVE auto-spend.
  reg('hBP02-041', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const cheers = buildBluePickerFromMember(ctx.memberInst);
    if (cheers.length === 0) return { state, resolved: true, log: 'ぽいずん猫: 此成員無藍色吶喊 — 跳過' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_CHEER', player: ctx.player,
        message: 'ぽいずん猫: 選擇 1 張藍色吶喊卡 → 存檔（→ 對手中心 + 後台各 20）',
        cards: cheers, maxSelect: 1,
        afterAction: 'ARCHIVE_OWN_CHEER_THEN_DMG',
        damageAmount: 20, damageTarget: 'opp_center_AND_pick_backstage',
      },
      log: 'ぽいずん猫: 選吶喊',
    };
  });
  reg('hBP02-041', HOOK.ON_ART_RESOLVE, (state, ctx) => ({ state, resolved: true })); // suppress C1 auto-spend

  // hBP05-043 おかゆ (1st) art1「まだまだ遊べるよね～？」
  // REAL: DMG:30 / 可以將這個成員的1張藍色吶喊卡放到存檔區：給予對手的中心成員與1位後台成員10點特殊傷害。
  reg('hBP05-043', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const cheers = buildBluePickerFromMember(ctx.memberInst);
    if (cheers.length === 0) return { state, resolved: true, log: 'まだまだ遊べる: 此成員無藍色吶喊 — 跳過' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_CHEER', player: ctx.player,
        message: 'まだまだ遊べるよね～？: 選擇 1 張藍色吶喊卡 → 存檔（→ 對手中心 + 後台各 10）',
        cards: cheers, maxSelect: 1,
        afterAction: 'ARCHIVE_OWN_CHEER_THEN_DMG',
        damageAmount: 10, damageTarget: 'opp_center_AND_pick_backstage',
      },
      log: 'まだまだ遊べる: 選吶喊',
    };
  });

  // hSD03-006 おかゆ (1st) art2「しゃー」
  // REAL: DMG:40 / 可以將這個成員的1張藍色吶喊卡放到存檔區：給予對手的中心成員與1位後台成員10點特殊傷害。
  reg('hSD03-006', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art2') return { state, resolved: true };
    const cheers = buildBluePickerFromMember(ctx.memberInst);
    if (cheers.length === 0) return { state, resolved: true, log: 'しゃー: 此成員無藍色吶喊 — 跳過' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_CHEER', player: ctx.player,
        message: 'しゃー: 選擇 1 張藍色吶喊卡 → 存檔（→ 對手中心 + 後台各 10）',
        cards: cheers, maxSelect: 1,
        afterAction: 'ARCHIVE_OWN_CHEER_THEN_DMG',
        damageAmount: 10, damageTarget: 'opp_center_AND_pick_backstage',
      },
      log: 'しゃー: 選吶喊',
    };
  });

  // hSD03-009 おかゆ (2nd) art2「おかゆ～」
  // REAL: DMG:100 / 可以將這個成員的2張藍色吶喊卡放到存檔區：給予對手的中心成員與1位後台成員30點特殊傷害。
  // Phase 2.4 #3: maxSelect=2 multi-cost — afterAction re-emits until both cheers archived,
  // then applies the multi-target damage on the final pick.
  reg('hSD03-009', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art2') return { state, resolved: true };
    const cheers = buildBluePickerFromMember(ctx.memberInst);
    if (cheers.length < 2) return { state, resolved: true, log: `おかゆ～: 此成員藍色吶喊 ${cheers.length}<2 — 跳過` };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_CHEER', player: ctx.player,
        message: 'おかゆ～: 選擇 2 張藍色吶喊卡 → 存檔（→ 對手中心 + 後台各 30）',
        cards: cheers, maxSelect: 2,
        afterAction: 'ARCHIVE_OWN_CHEER_THEN_DMG',
        damageAmount: 30, damageTarget: 'opp_center_AND_pick_backstage',
      },
      log: 'おかゆ～: 選 2 張吶喊',
    };
  });

  return count;
}
