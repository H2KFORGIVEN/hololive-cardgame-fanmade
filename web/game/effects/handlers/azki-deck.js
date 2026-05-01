// AZKi deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// 5-line spec block per handler: REAL / ACTION / AMBIGUITY / LIMITS / CONDITIONS.
//
// Already-wired AZKi cards (NOT redefined here):
//   - hBP01-045 (Debut effectG Overwrite): phaseB-cards.js (×2)
//   - hBP01-046 (1st effectB cheer distribute): phaseB-cards.js
//   - hBP07-006 (oshi 行くよ、開拓者): phaseB-cards.js
//   - hBP07-063 (Debut effectC ドキドキ夜キャンプ): phaseB-cards.js
//   - hBP07-064 (Debut art1 search 開拓者): phaseB-cards.js
//   - hBP07-065 (1st art1 draw-1 archive-1): phaseB-cards.js
//   - hBP07-066 (1st effectC heal+boost): phaseB-cards.js
//   - hBP07-067 (1st effectB+art1): top50-cards.js
//   - hBP07-069 (2nd art1+art2): phaseB-cards.js
//   - hSD01-002 (oshi 左手に地図): phaseB-cards.js
//   - hSD01-009 (Debut effectC dice ≤4): phaseB-cards.js
//
// Vanilla — skipped: hBP01-044, hSD01-008, hSD01-010.

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

// Count distinct-name #0期生 members on own stage
function countDistinct0thGen(player) {
  const names = new Set();
  for (const m of getStageMembers(player)) {
    if (hasTag(m.inst, '#0期生')) {
      const n = getCard(m.inst.cardId)?.name;
      if (n) names.add(n);
    }
  }
  return names.size;
}

export function registerAzkiDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-055 AZKi (主推 PR) oshi/SP — green-PR enhance pattern.
  // (Same wording as other green PR oshi cards.)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-055', HOOK.ON_OSHI_SKILL, (state, ctx) => {
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
  // hBP01-047 AZKi (2nd) effectB「いのちの軌跡」
  // REAL: 這個成員HP回復40點。之後，可以擲1次骰子：奇數時，可以將自己存檔區的1~3張綠色吶喊卡發送給這個成員。
  // ACTION: heal self 40 (mandatory), then optional dice → odd → optional cheer move
  // AMBIGUITY: heal self auto; cheer move is multi-pick
  // LIMITS: ON_BLOOM self-only
  // CONDITIONS: cheer-move step only fires on odd dice + ≥1 green cheer in archive
  // Cost is "可以" optional — let player choose to roll. Multi-step → MANUAL_EFFECT
  // for the optional dice/distribute half. Heal self happens automatically.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP01-047', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    me.damage = Math.max(0, (me.damage || 0) - 40);
    return { state, resolved: true, log: 'いのちの軌跡: 自身回 40HP（後續擲骰/分配吶喊為手動）' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-024 AZKi (1st Buzz) art1「あずきんちでゆっくりしよ」/ art2「帰っちゃうの？」
  // ART1 REAL: DMG:50 / 如果「開拓者」在自己的舞台上，將自己吶喊牌組上方的1張牌發送給自己的「AZKi」。
  // ART2 REAL: DMG:80+ / 如果自己的主推為「AZKi」，這個成員每有1張吶喊卡，這個藝能傷害+20。
  // ACTION: art1 → if 開拓者 attached anywhere on stage, cheer-top → AZKi member.
  //         art2 → oshi-name=AZKi gate + +20 × this.attachedCheer.length
  // AMBIGUITY: art1 target: AZKi members 0 → skip; 1 → auto; multi → SELECT_OWN_MEMBER
  // LIMITS: art-time
  // CONDITIONS: art1: 「開拓者」 (item, name match) attached on own stage; cheer deck non-empty
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-024', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const own = state.players[ctx.player];
    if (ctx.artKey === 'art1') {
      const stage = getStageMembers(own);
      const has開拓者 = stage.some(m =>
        (m.inst.attachedSupport || []).some(s => getCard(s.cardId)?.name === '開拓者')
      );
      if (!has開拓者) return { state, resolved: true, log: 'あずきんちでゆっくりしよ: 舞台無「開拓者」' };
      if (own.zones[ZONE.CHEER_DECK].length === 0) return { state, resolved: true, log: '吶喊牌組空' };
      const azkis = stage.filter(m => getCard(m.inst.cardId)?.name === 'AZKi');
      if (azkis.length === 0) return { state, resolved: true, log: '舞台無「AZKi」' };
      if (azkis.length === 1) {
        const t = azkis[0].inst;
        const cheer = own.zones[ZONE.CHEER_DECK].shift();
        cheer.faceDown = false;
        t.attachedCheer = t.attachedCheer || [];
        t.attachedCheer.push(cheer);
        return { state, resolved: true, log: `あずきんちでゆっくりしよ: 吶喊→${getCard(t.cardId)?.name||''}` };
      }
      return {
        state, resolved: false,
        prompt: {
          type: 'SELECT_OWN_MEMBER', player: ctx.player,
          message: 'あずきんちでゆっくりしよ: 選擇 1 位「AZKi」接收吶喊',
          cards: memberPicks(azkis),
          maxSelect: 1, afterAction: 'CHEER_FROM_DECK_TOP_TO_MEMBER',
        },
        log: 'あずきんちでゆっくりしよ: 選擇 AZKi',
      };
    }
    if (ctx.artKey === 'art2') {
      if (getCard(own.oshi?.cardId)?.name !== 'AZKi') {
        return { state, resolved: true, log: '帰っちゃうの？: 主推非 AZKi' };
      }
      const me = ctx.memberInst;
      if (!me) return { state, resolved: true };
      const cheer = (me.attachedCheer || []).length;
      if (cheer === 0) return { state, resolved: true, log: '帰っちゃうの？: 0 吶喊' };
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: cheer * 20, target: 'self', duration: 'instant' },
        log: `帰っちゃうの？: ${cheer} 吶喊 → +${cheer * 20}`,
      };
    }
    return { state, resolved: true };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-068 AZKi (2nd) effectC「共に歩んできた軌跡」
  // REAL: 這個回合中，自己的舞台上每有1位標示#0期生且不同卡名的成員，這個成員的藝能傷害+20。
  // ACTION: +20 × distinct-name #0期生 turn boost (self only)
  // AMBIGUITY: none
  // LIMITS: ON_COLLAB self-only; turn-scoped
  // CONDITIONS: ≥1 distinct #0期生 on stage
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-068', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    const n = countDistinct0thGen(own);
    if (n === 0) return { state, resolved: true, log: '共に歩んできた軌跡: 0 #0期生' };
    state._turnBoosts = state._turnBoosts || [];
    state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: n * 20, target: 'instance', instanceId: me.instanceId, duration: 'turn' });
    return { state, resolved: true, log: `共に歩んできた軌跡: ${n} 不同名 #0期生 → +${n * 20}` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD01-011 AZKi (2nd SD01) art1「SorAZ グラビティ」/ art2「デスティニーソング」
  // ART1 REAL: DMG:60 / 「ときのそら」在自己的舞台上時，將自己吶喊牌組上方的1張牌，發送給自己的成員。
  // ART2 REAL: DMG:100+ / 可以擲1次骰子：奇數時，這個藝能傷害+50。如果為1，這個藝能傷害再+50。
  // ACTION: art1 → if そら on stage, cheer top → pick member
  //         art2 → roll d6: odd +50, 1 → another +50 (total +100)
  // AMBIGUITY: art1 target picker; art2 none
  // LIMITS: art-time
  // CONDITIONS: art1: ときのそら on stage + cheer deck non-empty
  // ─────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────
  // Phase 2.4 #6 — hBP07-067 art1 hand-cost override (top50 had auto-spend)
  // hBP07-067 art1「君と二人きりの夜」
  // REAL: DMG:40 / 可以將自己的1張手牌放到存檔區：給予對手的中心成員或聯動成員20點特殊傷害。
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-067', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (own.zones[ZONE.HAND].length === 0) return { state, resolved: true, log: '君と二人きりの夜: 手牌空 — 跳過' };
    const handPicker = own.zones[ZONE.HAND].map(c => ({
      instanceId: c.instanceId, cardId: c.cardId,
      name: getCard(c.cardId)?.name || '',
      image: getCardImage(c.cardId),
    }));
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_HAND', player: ctx.player,
        message: '君と二人きりの夜: 選擇 1 張手牌 → 存檔（→ 對手中心或聯動 20 特殊傷害）',
        cards: handPicker, maxSelect: 1,
        afterAction: 'ARCHIVE_HAND_THEN_OPP_DMG',
        damageAmount: 20, damageTarget: 'opp_center_or_collab',
      },
      log: '君と二人きりの夜: 選手牌',
    };
  });
  // Suppress top50's auto-spend ON_ART_RESOLVE
  reg('hBP07-067', HOOK.ON_ART_RESOLVE, (state, ctx) => ({ state, resolved: true }));

  reg('hSD01-011', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const own = state.players[ctx.player];
    if (ctx.artKey === 'art1') {
      const stage = getStageMembers(own);
      const hasSora = stage.some(m => getCard(m.inst.cardId)?.name === 'ときのそら');
      if (!hasSora) return { state, resolved: true, log: 'SorAZ グラビティ: 舞台無ときのそら' };
      if (own.zones[ZONE.CHEER_DECK].length === 0) return { state, resolved: true, log: '吶喊牌組空' };
      if (stage.length === 0) return { state, resolved: true };
      if (stage.length === 1) {
        const t = stage[0].inst;
        const cheer = own.zones[ZONE.CHEER_DECK].shift();
        cheer.faceDown = false;
        t.attachedCheer = t.attachedCheer || [];
        t.attachedCheer.push(cheer);
        return { state, resolved: true, log: `SorAZ グラビティ: 吶喊→${getCard(t.cardId)?.name||''}` };
      }
      return {
        state, resolved: false,
        prompt: {
          type: 'SELECT_OWN_MEMBER', player: ctx.player,
          message: 'SorAZ グラビティ: 選擇 1 位成員接收吶喊',
          cards: memberPicks(stage),
          maxSelect: 1, afterAction: 'CHEER_FROM_DECK_TOP_TO_MEMBER',
        },
        log: 'SorAZ グラビティ: 選擇成員',
      };
    }
    if (ctx.artKey === 'art2') {
      // import rollDieFor lazily to avoid circular
      const rollDieFor = (() => {
        const r = Math.floor(Math.random() * 6) + 1;
        // engine override
        if (state && typeof state._diceOverride === 'number') return state._diceOverride;
        // Track per-player dice rolls
        if (state.players?.[ctx.player]) {
          state.players[ctx.player]._diceRollsThisTurn = (state.players[ctx.player]._diceRollsThisTurn || 0) + 1;
        }
        return r;
      })();
      let bonus = 0;
      if (rollDieFor % 2 === 1) bonus += 50;
      if (rollDieFor === 1) bonus += 50;
      if (bonus === 0) return { state, resolved: true, log: `デスティニーソング: 骰 ${rollDieFor}（偶數）— 無加成` };
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: bonus, target: 'self', duration: 'instant' },
        log: `デスティニーソング: 骰 ${rollDieFor} → +${bonus}`,
      };
    }
    return { state, resolved: true };
  });

  return count;
}
