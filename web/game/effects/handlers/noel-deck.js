// 白銀ノエル deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// Each handler has the real zh-TW effect text in a 5-line spec block:
//   REAL       — the literal effect text
//   ACTION     — what the handler does
//   AMBIGUITY  — how it handles 0/1/multi candidates
//   LIMITS     — once-per-turn / once-per-game / etc.
//   CONDITIONS — required state for the effect to fire
//
// Already-wired ノエル cards (NOT redefined here):
//   - hBP05-001 (oshi 白銀の騎士達 / SP スーパーまずった太郎): phaseB-cards.js
//   - hBP02-017 (1st Buzz art2 #3期生 +20×n): phaseC1-cards.js
//   - hBP07-022 ON_KNOCKDOWN (return knocked center+stack to hand): phaseB-cards.js
//
// Improved (overrides earlier auto-pick / stub-log):
//   - hBP01-098 effectC: was auto-pick first cheer; now player picks cheer
//     AND target via afterAction chain
//
// Vanilla (no effect text) — skipped: hBP02-014, hBP02-015.
//
// Engine-gap fall-throughs (deferred to Phase 2.4 / engine work):
//   - hBP05-008 effectG: damage taken −20 (no preventDamage hook)
//   - hBP05-010 effectG: targeting redirect (no targeting modifier hook)
//   - hBP05-010 art1: "used 牛丼 this turn" (no activity-by-name tracking)

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

// Count distinct-name #3期生 members on own stage
function countDistinct3rdGen(player) {
  const names = new Set();
  for (const m of getStageMembers(player)) {
    if (hasTag(m.inst, '#3期生')) {
      const n = getCard(m.inst.cardId)?.name;
      if (n) names.add(n);
    }
  }
  return names.size;
}

export function registerNoelDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-012 白銀ノエル (主推 PR) oshi「ホワイトエンハンス」/ SP「Birthday Gift ～White～」
  // OSHI REAL: [每個回合一次]這個回合中，自己的1位白色成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]從自己的牌組展示1張白色成員並加入手牌。將牌組重新洗牌。
  // (Identical wording to hBD24-004 フブキ; same handler shape, separate cardId.)
  // ACTION: oshi → pick own white member +20; SP → search 1 white member
  // AMBIGUITY: oshi 0→skip / 1→auto / multi→SELECT_OWN_MEMBER
  //            SP    0→reshuffle / ≥1→SEARCH_SELECT
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: none beyond skill type
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-012', HOOK.ON_OSHI_SKILL, (state, ctx) => {
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
  // hBP01-098 白銀ノエル (Spot 無色) effectC「それは「俺」」 — IMPROVED
  // REAL: 可以將自己存檔區的1張吶喊卡發送給自己的成員。
  // ACTION: pick archive cheer → pick own member (multi-step picker chain)
  // AMBIGUITY: archive cheer 0 → skip; ≥1 → CHEER_FROM_ARCHIVE_TO_MEMBER picker
  //            target: stage members 0 → skip; 1 → auto with chain; multi → 2-step
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: archive has ≥1 cheer card; ≥1 stage member
  // Note: phaseB-cards has an older version that auto-picks — overridden here.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP01-098', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const cheers = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.type === '吶喊');
    if (cheers.length === 0) return { state, resolved: true, log: 'それは「俺」: 存檔無吶喊' };
    const stage = getStageMembers(own);
    if (stage.length === 0) return { state, resolved: true, log: 'それは「俺」: 無成員' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: 'それは「俺」: 選擇 1 張吶喊卡（之後選成員）',
        cards: archivePicks(cheers),
        maxSelect: 1,
        afterAction: 'CHEER_FROM_ARCHIVE_TO_MEMBER',
        targets: memberPicks(stage),
      },
      log: 'それは「俺」: 選吶喊',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP02-016 白銀ノエル (1st) effectB「ノエちゃんの勇姿……」
  // REAL: 從Debut綻放時，從自己的牌組展示1張標示#3期生的Debut成員、1st成員或Spot成員並加入手牌。將牌組重新洗牌。
  // ACTION: search deck for #3期生 Debut/1st/Spot member → hand
  // AMBIGUITY: 0 match → reshuffle + skip; ≥1 → SEARCH_SELECT
  // LIMITS: only on bloom-from-Debut (engine doesn't expose pre-bloom level
  //   yet; we accept all blooms — slightly looser than printed text)
  //   ctx.fromBloom would tell us — fall back: gate by bloomStack length=1
  //   (Debut → 1st leaves stack of 1)
  // CONDITIONS: prior level was Debut
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP02-016', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    // bloomStack length=1 means we just bloomed once, i.e. from Debut.
    const stackLen = (ctx.memberInst?.bloomStack || []).length;
    if (stackLen !== 1) return { state, resolved: true, log: 'ノエちゃんの勇姿: 非從 Debut 綻放' };
    const own = state.players[ctx.player];
    const matches = own.zones[ZONE.DECK].filter(c => {
      const card = getCard(c.cardId);
      if (!card || !hasTag(c, '#3期生')) return false;
      const bloom = card.bloom || '';
      return bloom === 'Debut' || bloom === '1st' || bloom === 'Spot';
    });
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: 'ノエちゃんの勇姿: 牌組無 #3期生 Debut/1st/Spot' };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT', player: ctx.player,
        message: 'ノエちゃんの勇姿: 選擇 1 張 #3期生 Debut/1st/Spot 成員加入手牌',
        cards: archivePicks(matches),
        maxSelect: 1, afterAction: 'ADD_TO_HAND',
      },
      log: 'ノエちゃんの勇姿: 搜尋 #3期生',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-008 白銀ノエル (Debut) effectG「まっするまっする」
  // REAL: [限定聯動位置]在自己中心位置標示#3期生的Debut成員受到的傷害-20。
  // ACTION: passive: when own #3期生 Debut center takes damage, reduce by 20
  // AMBIGUITY: none
  // LIMITS: passive while in COLLAB
  // CONDITIONS: this card in COLLAB; own center is #3期生 Debut
  // Implementation: engine has no preventDamage hook today — fall through
  // to MANUAL_EFFECT (player applies via "減傷 20" in damage adjust panel)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-008', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => ({
    state, resolved: true,
    log: 'まっするまっする: 中心 #3期生 Debut 減傷 20（已透過 DamageCalculator 觀察者鏈支援）',
  }));

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-009 白銀ノエル (Debut) effectC「夏深し」
  // REAL: 如果在自己後攻的第一個回合，從自己的牌組展示1張1st成員「白銀ノエル」並加入手牌。將牌組重新洗牌。
  // ACTION: post-attack first turn → search 1st 白銀ノエル
  // AMBIGUITY: 0 → reshuffle; ≥1 → SEARCH_SELECT
  // LIMITS: ON_COLLAB self-only; only own first turn AND going second
  // CONDITIONS: turnNumber=2 + state.firstPlayer != ctx.player
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-009', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const goingSecond = state.firstPlayer != null && state.firstPlayer !== ctx.player;
    const isFirstTurnForMe = state.turnNumber === 2 && goingSecond;
    if (!isFirstTurnForMe) return { state, resolved: true, log: '夏深し: 非後攻第一回合' };
    const own = state.players[ctx.player];
    const matches = own.zones[ZONE.DECK].filter(c => {
      const card = getCard(c.cardId);
      return card?.name === '白銀ノエル' && card?.bloom === '1st';
    });
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: '夏深し: 牌組無 1st 白銀ノエル' };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT', player: ctx.player,
        message: '夏深し: 選擇 1 張 1st「白銀ノエル」加入手牌',
        cards: archivePicks(matches),
        maxSelect: 1, afterAction: 'ADD_TO_HAND',
      },
      log: '夏深し: 搜尋 1st 白銀ノエル',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-010 白銀ノエル (1st) effectG「闘う団長」/ art1「生きる力」
  // EFFECTG REAL: [限定聯動位置]自己的中心成員標示#3期生時，對手成員的藝能只能選擇自己的聯動成員為對象，特殊傷害除外。
  // ART1 REAL: DMG:20+ / 如果這個回合自己有使用過「牛丼」，這個藝能傷害+30。
  // ACTION: effectG → opp targeting redirected to collab when this in collab + own center is #3期生.
  //   Engine has no targeting modifier hook → MANUAL_EFFECT.
  //   art1 → +30 if 牛丼 played this turn. Engine tracks activity COUNT only,
  //   not activity NAME → MANUAL_EFFECT until name tracking added.
  // AMBIGUITY: none
  // LIMITS: effectG passive; art-time conditional
  // CONDITIONS: see REAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-010', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => ({
    state, resolved: true,
    log: '闘う団長: 對手藝能必須選聯動為目標（已透過 ActionValidator 強制執行）',
  }));
  reg('hBP05-010', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    // Phase 2.4 #9: precise activity-by-name check via _activityNamesPlayedThisTurn
    const own = state.players[ctx.player];
    const names = own._activityNamesPlayedThisTurn || [];
    if (!names.includes('牛丼')) {
      return { state, resolved: true, log: '生きる力: 本回合未使用「牛丼」' };
    }
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 30, target: 'self', duration: 'instant' },
      log: '生きる力: 本回合使用過「牛丼」 → +30',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-011 白銀ノエル (1st) effectB「みんなが居てくれて」/ art1「団長幸せだよ」
  // EFFECTB REAL: 這個回合中，自己標示#3期生的中心成員與聯動成員藝能傷害+10。
  // ART1 REAL: DMG:40+ / 自己的舞台上每有1位標示#3期生且不同卡名的成員，這個藝能傷害+10。
  // ACTION: effectB → +10 turn boost to #3期生 center+collab; art1 → +10×distinct #3期生 names
  // AMBIGUITY: none
  // LIMITS: effectB on bloom; art1 art-time
  // CONDITIONS: at least 1 #3期生 center/collab for effectB
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-011', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const stage = [own.zones[ZONE.CENTER], own.zones[ZONE.COLLAB]].filter(Boolean);
    let added = 0;
    for (const m of stage) {
      if (hasTag(m, '#3期生')) {
        state._turnBoosts = state._turnBoosts || [];
        state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 10, target: 'instance', instanceId: m.instanceId, duration: 'turn' });
        added++;
      }
    }
    return { state, resolved: true, log: `みんなが居てくれて: ${added} 位 #3期生 中心/聯動 +10` };
  });
  reg('hBP05-011', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const n = countDistinct3rdGen(state.players[ctx.player]);
    if (n === 0) return { state, resolved: true, log: '団長幸せだよ: 0 #3期生' };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: n * 10, target: 'self', duration: 'instant' },
      log: `団長幸せだよ: ${n} 個不同名 #3期生 → +${n * 10}`,
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-012 白銀ノエル (2nd) art1「騎士団の道」/ art2「慈悲の一撃」
  // ART1 REAL: DMG:80+ / 如果這個成員的HP有減少，這個藝能傷害+40。
  // ART2 REAL: DMG:130+ / [限定中心位置]如果自己的聯動成員標示#3期生，這個藝能傷害+30。
  // ACTION: art1 → +40 if memberInst.damage > 0; art2 → +30 if center + collab is #3期生
  // AMBIGUITY: none
  // LIMITS: art-time
  // CONDITIONS: see above
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-012', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    if (ctx.artKey === 'art1') {
      if ((me.damage || 0) <= 0) return { state, resolved: true, log: '騎士団の道: HP 未減少' };
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 40, target: 'self', duration: 'instant' },
        log: '騎士団の道: HP 減少 → +40',
      };
    }
    if (ctx.artKey === 'art2') {
      // Limited center
      if (own.zones[ZONE.CENTER]?.instanceId !== me.instanceId) {
        return { state, resolved: true, log: '慈悲の一撃: 非中心位置' };
      }
      const collab = own.zones[ZONE.COLLAB];
      if (!collab || !hasTag(collab, '#3期生')) return { state, resolved: true, log: '慈悲の一撃: 聯動非 #3期生' };
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 30, target: 'self', duration: 'instant' },
        log: '慈悲の一撃: 聯動 #3期生 → +30',
      };
    }
    return { state, resolved: true };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-022 白銀ノエル (2nd) art1「元気もりもりさんでーまっする」
  // REAL: DMG:50 / 選擇自己1位標示#3期生的成員。這個回合中，該成員的藝能需要的無色吶喊卡數量-1。如果該成員是2nd成員「白銀ノエル」，則該成員的藝能需要的無色吶喊卡數量-2。
  // ACTION: pick own #3期生 member → -1 colorless cost (or -2 if 2nd 白銀ノエル)
  // AMBIGUITY: 0 #3期生 → skip; 1 → auto; multi → SELECT_OWN_MEMBER
  // LIMITS: turn-scoped
  // CONDITIONS: ≥1 own #3期生 member
  // Implementation: uses state._artColorlessReductionByInstance set in
  //                 ActionValidator.canPayArtCost (Phase 2 added this)
  // Note: BOOST_PICKED_MEMBER doesn't set colorless reduction; we apply
  // synchronously when the picker isn't needed, otherwise fall through to
  // MANUAL_EFFECT for multi-pick (no afterAction for cost reduction yet).
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-022', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const candidates = getStageMembers(own).filter(m => hasTag(m.inst, '#3期生'));
    if (candidates.length === 0) return { state, resolved: true, log: '元気もりもり: 無 #3期生 — 跳過' };
    const apply = (member) => {
      const card = getCard(member.cardId);
      const reduction = (card?.bloom === '2nd' && card?.name === '白銀ノエル') ? 2 : 1;
      state._artColorlessReductionByInstance = state._artColorlessReductionByInstance || {};
      state._artColorlessReductionByInstance[ctx.player] = state._artColorlessReductionByInstance[ctx.player] || {};
      state._artColorlessReductionByInstance[ctx.player][member.instanceId] = Math.max(
        state._artColorlessReductionByInstance[ctx.player][member.instanceId] || 0,
        reduction,
      );
      return reduction;
    };
    if (candidates.length === 1) {
      const target = candidates[0].inst;
      const r = apply(target);
      return { state, resolved: true, log: `元気もりもり: ${getCard(target.cardId)?.name||''} 本回合無色吶喊 -${r}` };
    }
    // Phase 2.4 #16: multi-pick → REDUCE_COLORLESS_PICKED_MEMBER picker.
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: '元気もりもりさんでーまっする: 選擇 1 位 #3期生 成員（本回合無色吶喊 -1，2nd「白銀ノエル」-2）',
        cards: candidates.map(m => ({
          instanceId: m.inst.instanceId, cardId: m.inst.cardId,
          name: getCard(m.inst.cardId)?.name || '',
          image: getCardImage(m.inst.cardId),
        })),
        maxSelect: 1, afterAction: 'REDUCE_COLORLESS_PICKED_MEMBER',
        amount: 1,
        bonusName: '白銀ノエル',
        bonusBloom: '2nd',
        bonusReduction: 2,
      },
      log: '元気もりもり: 選 #3期生',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD07-010 白銀ノエル (Debut SD07) effectC「大物の確証」
  // REAL: 這個回合中，自己的中心成員藝能傷害+10。
  // ACTION: own center +10 turn boost
  // AMBIGUITY: 0 center → skip; 1 → auto
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: own center exists
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD07-010', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const center = own.zones[ZONE.CENTER];
    if (!center) return { state, resolved: true, log: '大物の確証: 中心無成員' };
    state._turnBoosts = state._turnBoosts || [];
    state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 10, target: 'instance', instanceId: center.instanceId, duration: 'turn' });
    return { state, resolved: true, log: `大物の確証: 中心 ${getCard(center.cardId)?.name||''} 本回合 +10` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD09-005 白銀ノエル (Debut SD09) effectC「3期生の海の家」
  // REAL: 這個回合中，自己的舞台上每有1位標示#3期生且不同卡名的成員，自己中心位置的2nd成員藝能傷害+10。
  // ACTION: count distinct-name #3期生 → if center is 2nd → +10×count turn boost
  // AMBIGUITY: 0 center / non-2nd center → skip; 2nd center → auto
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: own center is 2nd member
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD09-005', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const center = own.zones[ZONE.CENTER];
    if (!center) return { state, resolved: true, log: '3期生の海の家: 中心無成員' };
    if (getCard(center.cardId)?.bloom !== '2nd') {
      return { state, resolved: true, log: '3期生の海の家: 中心非 2nd 成員' };
    }
    const n = countDistinct3rdGen(own);
    if (n === 0) return { state, resolved: true, log: '3期生の海の家: 0 #3期生' };
    state._turnBoosts = state._turnBoosts || [];
    state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: n * 10, target: 'instance', instanceId: center.instanceId, duration: 'turn' });
    return { state, resolved: true, log: `3期生の海の家: ${n} 個不同名 #3期生 → 中心 +${n * 10}` };
  });

  return count;
}
