// Engine-level overrides for cards across multiple bulk handler files
// where the bulk implementation auto-picks instead of using a player picker.
//
// Each handler here has the real zh-TW effect text in a 5-line spec block:
//   REAL       — the literal effect text
//   ACTION     — what the handler does
//   AMBIGUITY  — how it handles 0/1/multi candidates
//   LIMITS     — once-per-turn / once-per-game / etc.
//   CONDITIONS — required state for the effect to fire
//
// Registered AFTER all bulk phase handlers so these overrides win at runtime.
// Audit static analysis can't see the override (it sees the older bulk handler
// in phaseB/C1/etc.), but the runtime behavior is correct.

import { getCard, getCardImage } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE } from '../../core/constants.js';
import { getStageMembers } from './common.js';

function memberPicks(members) {
  return members.map(m => ({
    instanceId: m.instanceId,
    cardId: m.cardId,
    name: getCard(m.cardId)?.name || '',
    image: getCardImage(m.cardId),
  }));
}

export function registerEngineOverrides() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBP04-031 セシリア・イマーグリーン (2nd) art1「マルチリンガル」
  // REAL: 選擇自己1位標示#語学的後台成員。從自己的吶喊牌組展示1張與該成員相同顏色的吶喊卡，發送給該成員。將吶喊牌組重新洗牌。
  // ACTION: pick own #語学 backstage; cheer-deck reveals matching color cheer + attach + reshuffle
  // AMBIGUITY: 0 #語学 backstage → skip; 1 → auto; multi → SELECT_OWN_MEMBER picker
  // LIMITS: ON_ART_RESOLVE single-fire
  // CONDITIONS: ≥1 #語学 backstage; cheer deck has matching color
  // (Overrides phaseC1 auto-pick of first #語学 backstage.)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP04-031', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.triggerEvent === 'member_used_art') return { state, resolved: true };
    const own = state.players[ctx.player];
    const candidates = own.zones[ZONE.BACKSTAGE].filter(m => {
      const tag = getCard(m.cardId)?.tag || '';
      return (typeof tag === 'string' ? tag : JSON.stringify(tag)).includes('#語学');
    });
    if (candidates.length === 0) return { state, resolved: true, log: 'マルチリンガル: 後台無 #語学' };
    if (candidates.length === 1) {
      // Auto-resolve same-color cheer attach
      const target = candidates[0];
      const targetColor = getCard(target.cardId)?.color;
      if (!targetColor) return { state, resolved: true };
      const ci = own.zones[ZONE.CHEER_DECK].findIndex(c => getCard(c.cardId)?.color === targetColor);
      if (ci >= 0) {
        const cheer = own.zones[ZONE.CHEER_DECK].splice(ci, 1)[0];
        cheer.faceDown = false;
        target.attachedCheer = target.attachedCheer || [];
        target.attachedCheer.push(cheer);
      }
      // Shuffle cheer deck (Fisher-Yates)
      const cd = own.zones[ZONE.CHEER_DECK];
      for (let i = cd.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cd[i], cd[j]] = [cd[j], cd[i]];
      }
      return { state, resolved: true, log: `マルチリンガル: ${getCard(target.cardId)?.name||''} → ${targetColor} 同色吶喊（自動）` };
    }
    // Multi-pick: emit picker. CHEER_DECK_REVEAL_MATCH_TO_MEMBER will pick
    // matching-color cheer for the chosen member.
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'マルチリンガル: 選擇 1 位 #語学 後台成員（吶喊牌組展示同色吶喊）',
        cards: memberPicks(candidates),
        maxSelect: 1,
        afterAction: 'CHEER_DECK_REVEAL_MATCH_TO_MEMBER',
      },
      log: 'マルチリンガル: 選 #語学 後台',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-066 AZKi (1st) effectC「仮想世界の伴走する歌姫」
  // REAL: 自己的1位成員HP回復30點。之後，選擇自己舞台上的1位成員。這個回合中，該成員的藝能傷害+10。
  // ACTION: pick own damaged member +30 heal; then pick any member +10 turn boost
  // AMBIGUITY: heal pick: 0 damaged → skip heal; 1 → auto; multi → SELECT_OWN_MEMBER
  //            boost pick: always emits picker (any stage member)
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: see REAL
  // (Overrides phaseB-cards.js auto-pick of first damaged + 'choose' boost target.)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-066', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const stage = getStageMembers(own);
    if (stage.length === 0) return { state, resolved: true, log: '仮想世界: 舞台無成員' };
    const damaged = stage.filter(m => (m.inst.damage || 0) > 0);
    // Boost picker (always presented, picks any stage member)
    const boostPrompt = {
      type: 'SELECT_OWN_MEMBER', player: ctx.player,
      message: '仮想世界: 選擇 1 位成員 +10 藝能傷害',
      cards: memberPicks(stage.map(m => m.inst)),
      maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER',
      amount: 10,
    };
    if (damaged.length === 0) {
      // No heal target → emit boost picker only
      return {
        state, resolved: false,
        prompt: boostPrompt,
        log: '仮想世界: 無受傷成員 — 直接選 +10 加成',
      };
    }
    if (damaged.length === 1) {
      // Auto-heal the only damaged + emit boost picker
      const t = damaged[0].inst;
      t.damage = Math.max(0, (t.damage || 0) - 30);
      return {
        state, resolved: false,
        prompt: boostPrompt,
        log: `仮想世界: ${getCard(t.cardId)?.name||''} 回 30HP（自動） — 選 +10 加成`,
      };
    }
    // Multi damaged: emit heal picker → followup boost picker
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: '仮想世界: 選擇 1 位受傷成員回 30HP',
        cards: memberPicks(damaged.map(m => m.inst)),
        maxSelect: 1, afterAction: 'HEAL_PICKED_MEMBER',
        amount: 30,
        followupPrompt: boostPrompt,
      },
      log: '仮想世界: 選受傷成員',
    };
  });

  return count;
}
