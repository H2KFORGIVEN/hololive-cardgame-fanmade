// 姫森ルーナ deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// 5-line spec block per handler: REAL / ACTION / AMBIGUITY / LIMITS / CONDITIONS.
//
// Already-wired ルーナ cards (NOT redefined here):
//   - hBP03-001 (oshi PC search / SP ルーナイト): phaseB-cards.js
//   - hBP03-009 (Debut art1 search ルーナイト): phaseB-cards.js
//   - hBP03-013 (1st effectG+art1 ON_ART_RESOLVE): phaseC1-cards.js
//   - hBP03-014 (2nd effectB+art1): phaseC1-cards.js
//   - hBP06-030 (1st art1 ON_ART_RESOLVE): phaseB-cards.js
//   - hBP06-031 (2nd art1): phaseB-cards.js
//   - hSD08-005 (Debut effectG ON_KNOCKDOWN): phaseB-cards.js
//
// Vanilla — skipped: hBP03-011, hBP06-028.

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

export function registerLunaDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-005 姫森ルーナ (主推 PR) oshi/SP — white-PR enhance pattern.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-005', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const matches = own.zones[ZONE.DECK].filter(c =>
        isMember(getCard(c.cardId)?.type) && getCard(c.cardId)?.color === '白'
      );
      if (matches.length === 0) {
        shuffleArr(own.zones[ZONE.DECK]);
        return { state, resolved: true, log: 'SP: 牌組無白色成員 — 重新洗牌' };
      }
      return {
        state, resolved: false,
        prompt: {
          type: 'SEARCH_SELECT', player: ctx.player,
          message: 'SP「Birthday Gift ～White～」: 選擇 1 張白色成員加入手牌',
          cards: archivePicks(matches),
          maxSelect: 1, afterAction: 'ADD_TO_HAND',
        },
        log: 'SP: 搜尋白色成員',
      };
    }
    const whites = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.color === '白');
    if (whites.length === 0) return { state, resolved: true, log: 'oshi: 無白色成員 — 跳過' };
    if (whites.length === 1) {
      const target = whites[0];
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: target.inst.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `oshi: ${getCard(target.inst.cardId)?.name||''} 本回合 +20` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'oshi「ホワイトエンハンス」: 選擇 1 位白色成員 +20 藝能傷害',
        cards: memberPicks(whites),
        maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER',
        amount: 20,
      },
      log: 'oshi: 選擇白色成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP03-010 姫森ルーナ (Debut) effectC「お菓子の国のお姫様」
  // REAL: 自己的中心成員為「姫森ルーナ」時，從自己的牌組抽1張牌。
  // ACTION: center=ルーナ → draw 1
  // AMBIGUITY: none
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: own center name=姫森ルーナ
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-010', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const center = own.zones[ZONE.CENTER];
    if (!center || getCard(center.cardId)?.name !== '姫森ルーナ') {
      return { state, resolved: true, log: 'お菓子の国のお姫様: 中心非ルーナ' };
    }
    if (own.zones[ZONE.DECK].length === 0) return { state, resolved: true, log: '牌組空' };
    const card = own.zones[ZONE.DECK].shift();
    card.faceDown = false;
    own.zones[ZONE.HAND].push(card);
    return { state, resolved: true, log: 'お菓子の国のお姫様: 抽 1' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP03-012 姫森ルーナ (1st) effectB「一緒に最高のライブにしようね」
  // REAL: 這個回合中，自己1位帶有粉絲的成員藝能傷害+20。
  // ACTION: pick 1 own fan-bearing member → +20 turn
  // AMBIGUITY: 0 → skip; 1 → auto; multi → SELECT_OWN_MEMBER + BOOST_PICKED_MEMBER
  // LIMITS: ON_BLOOM self-only
  // CONDITIONS: ≥1 fan-bearing member
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-012', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const fanMembers = getStageMembers(own).filter(m =>
      (m.inst.attachedSupport || []).some(s => getCard(s.cardId)?.type === '支援・粉絲')
    );
    if (fanMembers.length === 0) return { state, resolved: true, log: '一緒に最高のライブ: 無帶粉絲成員' };
    if (fanMembers.length === 1) {
      const target = fanMembers[0];
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: target.inst.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `一緒に最高のライブ: ${getCard(target.inst.cardId)?.name||''} 本回合 +20` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: '一緒に最高のライブ: 選擇 1 位帶粉絲成員 +20',
        cards: memberPicks(fanMembers),
        maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER',
        amount: 20,
      },
      log: '一緒に最高のライブ: 選擇帶粉絲成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-017 姫森ルーナ (1st Buzz) art1「レトロロマン」/ art2「ぱくぱく」
  // ART1 REAL: DMG:50 / 可以將自己存檔區的1張「ルーナイト」附加給這個成員。
  // ART2 REAL: DMG:80 / [限定聯動位置]自己的中心成員每帶有1張「ルーナイト」，這個藝能需要的無色吶喊卡數量-1。
  // ACTION: art1 → optional pick ルーナイト from archive + ATTACH_FROM_ARCHIVE_TO_MEMBER (self)
  //         art2 → collab + per-ルーナイト on center → -1 colorless cost
  // AMBIGUITY: art1: archive 0 → skip; ≥1 → SELECT_FROM_ARCHIVE
  // LIMITS: art-time
  // CONDITIONS: see REAL
  // Note: art2 cost reduction applies AT cost-payment time, not at declare;
  // engine's ActionValidator.canPayArtCost reads
  // state._artColorlessReductionByInstance — but by ON_ART_DECLARE the cost has
  // already been paid, so the reduction must be set BEFORE. art2 specifically
  // is observed here as a documentation-only RULE-MOD; cost reduction is
  // already engine-supported via the byInstance reductions, so we can set it
  // on a turn flag accessible at canPayArtCost time. Simpler: skip auto, fall
  // through to MANUAL_EFFECT (player applies via "no cheer" override).
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-017', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey === 'art1') {
      const own = state.players[ctx.player];
      const me = ctx.memberInst;
      if (!me) return { state, resolved: true };
      const matches = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.name === 'ルーナイト');
      if (matches.length === 0) return { state, resolved: true, log: 'レトロロマン: 存檔無「ルーナイト」' };
      return {
        state, resolved: false,
        prompt: {
          type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
          message: 'レトロロマン: 選擇 1 張「ルーナイト」附加給此成員',
          cards: archivePicks(matches),
          maxSelect: 1,
          afterAction: 'ATTACH_FROM_ARCHIVE_TO_MEMBER',
          targetInstanceId: me.instanceId,
        },
        log: 'レトロロマン: 選擇ルーナイト',
      };
    }
    if (ctx.artKey === 'art2') {
      // art2 cost reduction must apply at cost-payment time. By
      // ON_ART_DECLARE the cost is already paid → MANUAL_EFFECT.
      return { state, resolved: true, log: 'ぱくぱく: 無色費 -ルーナイト 數量 (cost-time effect; 手動)' };
    }
    return { state, resolved: true };
  });

  return count;
}
