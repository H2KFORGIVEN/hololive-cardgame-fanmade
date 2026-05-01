// 白上フブキ deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// Each handler has the real zh-TW effect text in a 5-line spec block:
//   REAL       — the literal effect text
//   ACTION     — what the handler does
//   AMBIGUITY  — how it handles 0/1/multi candidates
//   LIMITS     — once-per-turn / once-per-game / etc.
//   CONDITIONS — required state for the effect to fire
//
// hBP02-001 (oshi マスコット創造 / フブキングダム) is already fully wired in
// phaseB-cards.js (F-3.5). NOT redefined here — registerAll's phaseB pass
// runs BEFORE deck packs, so its handlers stick unless overwritten.
// Redundant cards with no effect text (hBP02-008/010, hSD14-002/003/006)
// are skipped — there is nothing to register.

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

// Count mascots attached across own stage
function countOwnMascots(player) {
  let n = 0;
  for (const m of getStageMembers(player)) {
    n += (m.inst.attachedSupport || []).filter(s =>
      getCard(s.cardId)?.type === '支援・吉祥物'
    ).length;
  }
  return n;
}

// Count items+mascots+fans on own stage (used by hBP05-070 art2)
function countOwnSupportArtefacts(player) {
  let n = 0;
  for (const m of getStageMembers(player)) {
    for (const s of (m.inst.attachedSupport || [])) {
      const t = getCard(s.cardId)?.type || '';
      if (t === '支援・道具' || t === '支援・吉祥物' || t === '支援・粉絲') n++;
    }
  }
  return n;
}

export function registerFubukiDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-004 白上フブキ (主推 PR) oshi「ホワイトエンハンス」/ SP「Birthday Gift ～White～」
  // OSHI REAL: [每個回合一次]這個回合中，自己的1位白色成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]從自己的牌組展示1張白色成員並加入手牌。將牌組重新洗牌。
  // ACTION: oshi → pick own white member + turn boost +20; SP → search 1 white member
  // AMBIGUITY: oshi: 0 → skip; 1 → auto; multi → SELECT_OWN_MEMBER
  //            SP: 0 → reshuffle + skip; ≥1 → SEARCH_SELECT
  // LIMITS: oshi 1/turn, SP 1/game (engine handles)
  // CONDITIONS: none beyond skill type
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-004', HOOK.ON_OSHI_SKILL, (state, ctx) => {
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
    // oshi (non-SP)
    const whiteMembers = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.color === '白');
    if (whiteMembers.length === 0) return { state, resolved: true, log: 'oshi: 無白色成員 — 跳過' };
    if (whiteMembers.length === 1) {
      const target = whiteMembers[0];
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: target.inst.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `oshi: ${getCard(target.inst.cardId)?.name||''} 本回合 +20` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'oshi「ホワイトエンハンス」: 選擇 1 位白色成員 +20 藝能傷害',
        cards: memberPicks(whiteMembers),
        maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER',
        amount: 20,
      },
      log: 'oshi: 選擇白色成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP02-009 白上フブキ (Debut) effectG「おはこんきーつね！」
  // REAL: [限定聯動位置]自己帶有吉祥物的所有成員藝能傷害+10。
  // ACTION: passive +10 buff to own members carrying a mascot, only when in COLLAB
  // AMBIGUITY: none — broadcast to attacker check
  // LIMITS: passive (every art declaration)
  // CONDITIONS: this card is in COLLAB zone; attacker has ≥1 attached mascot
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP02-009', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => {
    if (!ctx.attacker) return { state, resolved: true };
    if (ctx.player !== ctx.attackerPlayer) return { state, resolved: true };
    const me = ctx.memberInst;
    const myPlayer = state.players[ctx.player];
    if (myPlayer?.zones[ZONE.COLLAB]?.instanceId !== me?.instanceId) {
      return { state, resolved: true };
    }
    const hasMascot = (ctx.attacker.attachedSupport || []).some(s =>
      getCard(s.cardId)?.type === '支援・吉祥物'
    );
    if (!hasMascot) return { state, resolved: true };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
      log: 'おはこんきーつね！: 帶吉祥物攻擊者 +10',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP02-011 白上フブキ (1st) effectB「白上から目をそらしちゃ」
  // REAL: 從自己的牌組展示1張標示#白上'sキャラクター的牌並加入手牌。將牌組重新洗牌。
  // ACTION: search deck for 1 #白上'sキャラクター → hand, reshuffle
  // AMBIGUITY: 0 → skip + reshuffle; ≥1 → SEARCH_SELECT
  // LIMITS: ON_BLOOM (once when blooming into this card)
  // CONDITIONS: none
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP02-011', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const matches = own.zones[ZONE.DECK].filter(c => hasTag(c, "#白上'sキャラクター"));
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: '白上から目をそらしちゃ: 牌組無 #白上キャラ — 重新洗牌' };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT', player: ctx.player,
        message: '白上から目をそらしちゃ: 選擇 1 張 #白上\'sキャラクター加入手牌',
        cards: archivePicks(matches),
        maxSelect: 1, afterAction: 'ADD_TO_HAND',
      },
      log: '白上から目をそらしちゃ: 搜尋 #白上キャラ',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP02-012 白上フブキ (1st) effectB「ちょっと動かしますね」/ art1「力をかしてくださいね」
  // EFFECTB REAL: 可以將自己舞台上的1張吉祥物，替換給自己的成員。
  // ART1 REAL: 這個回合中，自己帶有吉祥物的中心成員與聯動成員藝能傷害+20。
  // ACTION: effectB → optional mascot move (source picker → target picker via SUPPORT_MOVE);
  //         art1 → flat +20 to mascot-bearing center+collab attackers (engine resolves at attack)
  // AMBIGUITY: effectB needs 2 picks (source mascot-bearer + target). Falls through to MANUAL_EFFECT —
  //         our SUPPORT_MOVE only handles fixed-source picker. Improvement deferred.
  //         art1: applied dynamically by engine via boostTurn('mascot_members'); we set the flag.
  // LIMITS: effectB optional (「可以」), art1 turn-scoped
  // CONDITIONS: effectB needs a mascot-bearing source + a different target
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP02-012', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    return { state }; // MANUAL_EFFECT — multi-step source+target picker
  });
  reg('hBP02-012', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    // art1: own center+collab with mascot get +20 this turn
    const own = state.players[ctx.player];
    const stage = [own.zones[ZONE.CENTER], own.zones[ZONE.COLLAB]].filter(Boolean);
    let added = 0;
    for (const m of stage) {
      const hasMascot = (m.attachedSupport || []).some(s => getCard(s.cardId)?.type === '支援・吉祥物');
      if (hasMascot) {
        state._turnBoosts = state._turnBoosts || [];
        state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: m.instanceId, duration: 'turn' });
        added++;
      }
    }
    return { state, resolved: true, log: `力をかしてくださいね: ${added} 位帶吉祥物中心/聯動 +20` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP02-013 白上フブキ (2nd) effectG「みんなと一緒！」/ art1「マスコットたちの饗宴」
  // EFFECTG REAL: 這個成員可以帶有2張不同卡名的吉祥物。
  // ART1 REAL: 自己的舞台上每有1張吉祥物，這個藝能傷害+20。
  // ACTION: effectG → informational (engine doesn't enforce mascot-cap so this is a permission grant);
  //         art1 → boost = +20 × mascot count
  // AMBIGUITY: none
  // LIMITS: passive permissive; art-time boost
  // CONDITIONS: none
  // Note: effectG grants RULE EXCEPTION (normally only 1 mascot/member). Engine
  // doesn't currently enforce the 1-mascot cap, so this is documented as a
  // RULE-MOD until ActionValidator adds the cap.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP02-013', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => ({
    state, resolved: true,
    log: 'みんなと一緒！: 此成員可帶 2 張不同卡名吉祥物（規則放寬，引擎目前未強制單張上限）',
  }));
  reg('hBP02-013', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const n = countOwnMascots(state.players[ctx.player]);
    if (n === 0) return { state, resolved: true, log: 'マスコットたちの饗宴: 0 吉祥物' };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: n * 20, target: 'self', duration: 'instant' },
      log: `マスコットたちの饗宴: ${n} 吉祥物 → +${n * 20}`,
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP04-014 白上フブキ (2nd) effectB「戻っておいで」/ art1「私の大切な人」
  // EFFECTB REAL: 可以將自己存檔區1~2張標示#白上'sキャラクター的牌返回手牌。
  // ART1 REAL: 「白上フブキ」以外標示#ゲーマーズ的成員在自己的舞台上時，這個藝能傷害+50。
  // ACTION: effectB → multi-pick (1-2) from archive matching #白上'sキャラクター → hand;
  //         art1 → +50 if any non-フブキ #ゲーマーズ on stage
  // AMBIGUITY: archive match: 0 → skip; ≥1 → SELECT_FROM_ARCHIVE multi
  // LIMITS: effectB optional ("可以"), art-time conditional
  // CONDITIONS: effectB no constraint; art1 needs another #ゲーマーズ
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP04-014', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const matches = own.zones[ZONE.ARCHIVE].filter(c => hasTag(c, "#白上'sキャラクター"));
    if (matches.length === 0) return { state, resolved: true, log: '戻っておいで: 存檔無 #白上キャラ' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: `戻っておいで: 選擇 1-${Math.min(2, matches.length)} 張 #白上'sキャラクター回手牌（可跳過）`,
        cards: archivePicks(matches),
        maxSelect: Math.min(2, matches.length),
        afterAction: 'RETURN_FROM_ARCHIVE',
      },
      log: `戻っておいで: 存檔有 ${matches.length} 張 #白上キャラ`,
    };
  });
  reg('hBP04-014', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const has = getStageMembers(state.players[ctx.player]).some(m =>
      getCard(m.inst.cardId)?.name !== '白上フブキ' && hasTag(m.inst, '#ゲーマーズ')
    );
    if (!has) return { state, resolved: true, log: '私の大切な人: 無其他 #ゲーマーズ' };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 50, target: 'self', duration: 'instant' },
      log: '私の大切な人: 有其他 #ゲーマーズ → +50',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-068 白上フブキ (Debut yellow) effectC「ゆるゆる休養日」
  // REAL: 如果這個成員帶有吉祥物，查看自己牌組上方的1張牌。將該牌放回牌組上方或下方。
  // ACTION: scry-1 (look top → place top or bottom)
  // AMBIGUITY: 0 deck → skip; ≥1 → ORDER_TO_BOTTOM-style picker (top vs bottom choice)
  //   But the engine's existing afterActions don't support a "top vs bottom" choice
  //   atomically (existing ORDER_TO_BOTTOM always sends to bottom). Falls through
  //   to MANUAL_EFFECT.
  // LIMITS: ON_COLLAB self-only (broadcast guard via wrapper)
  // CONDITIONS: this member carries a mascot; deck has ≥1 card
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-068', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    return { state }; // MANUAL_EFFECT — scry top↑/↓ choice not in afterAction set
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-069 白上フブキ (1st yellow) effectG「とびきりの笑顔」/ art1「満点じゃい！」
  // EFFECTG REAL: [限定舞台後方]這個成員不會受到對手傷害。
  // ART1 REAL: 可以將自己吶喊牌組上方的1張牌發送給這個成員。
  // ACTION: effectG → backstage-only damage immunity. Engine has no preventDamage hook,
  //         so this falls through to MANUAL_EFFECT (player applies via "no damage" override)
  //         art1 → cheer-deck top → this member (engine: CHEER_FROM_DECK_TOP_TO_MEMBER for self)
  // AMBIGUITY: art1 target is self only → auto if cheer deck has ≥1
  // LIMITS: effectG passive while in BACKSTAGE; art1 optional ("可以")
  // CONDITIONS: effectG: this member in BACKSTAGE; art1: cheer deck non-empty
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-069', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => ({
    state, resolved: true,
    log: 'とびきりの笑顔: [限定後台] 此成員不會受傷（引擎尚未支援 preventDamage hook，需手動）',
  }));
  reg('hBP05-069', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (own.zones[ZONE.CHEER_DECK].length === 0) {
      return { state, resolved: true, log: '満点じゃい！: 吶喊牌組空' };
    }
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    const cheer = own.zones[ZONE.CHEER_DECK].shift();
    cheer.faceDown = false;
    me.attachedCheer = me.attachedCheer || [];
    me.attachedCheer.push(cheer);
    return { state, resolved: true, log: '満点じゃい！: 吶喊牌組頂 → 此成員' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-070 白上フブキ (2nd yellow) art1「フブキカフェにようこそ」/ art2「国王兼喫茶経営者」
  // ART1 REAL: 可以選擇自己存檔區任意標示#白上'sキャラクター的吉祥物與粉絲，分配給自己的成員。
  // ART2 REAL: 如果自己的主推為「白上フブキ」或主推的顏色為黃色，且自己舞台上的道具、吉祥物與粉絲總和在4張以上，這個藝能傷害+100。
  // ACTION: art1 → multi-distribution from archive (mascot/fan with #白上'sキャラ) → own members.
  //         Multi-step (pick card → pick member → repeat); falls through to MANUAL_EFFECT.
  //         art2 → if oshi='白上フブキ' OR oshi color=='黄' AND ≥4 own support artefacts → +100
  // AMBIGUITY: art1 multi-step → manual; art2 boolean
  // LIMITS: art2 turn-scoped boost
  // CONDITIONS: art2 → oshi check + count check
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-070', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey === 'art2') {
      const own = state.players[ctx.player];
      const oshi = own.oshi ? getCard(own.oshi.cardId) : null;
      const oshiOk = oshi && (oshi.name === '白上フブキ' || oshi.color === '黃');
      if (!oshiOk) return { state, resolved: true, log: '国王兼喫茶経営者: 主推不符 — 跳過' };
      const n = countOwnSupportArtefacts(own);
      if (n < 4) return { state, resolved: true, log: `国王兼喫茶経営者: 道具+吉祥物+粉絲=${n}<4` };
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 100, target: 'self', duration: 'instant' },
        log: `国王兼喫茶経営者: 主推符合 + ${n} 張支援 → +100`,
      };
    }
    if (ctx.artKey === 'art1') {
      // Multi-step distribution — out of scope for current afterAction set
      return { state }; // MANUAL_EFFECT
    }
    return { state, resolved: true };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD02-010 白上フブキ (Spot 無色) effectC「帰ってきなさーい」
  // REAL: 可以將自己存檔區的1張吉祥物返回手牌。
  // ACTION: optional return 1 mascot from archive → hand
  // AMBIGUITY: 0 → skip; ≥1 → SELECT_FROM_ARCHIVE
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: at least 1 mascot in archive
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD02-010', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const matches = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.type === '支援・吉祥物');
    if (matches.length === 0) return { state, resolved: true, log: '帰ってきなさーい: 存檔無吉祥物' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: '帰ってきなさーい: 選擇 1 張吉祥物回手牌',
        cards: archivePicks(matches),
        maxSelect: 1, afterAction: 'RETURN_FROM_ARCHIVE',
      },
      log: '帰ってきなさーい: 選擇吉祥物',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD14-001 白上フブキ (主推 SD14) oshi「みんな一緒にいくぞぉおっ」/ SP「マスコッツ、アッセンブル!!」
  // OSHI REAL: [每個回合一次]選擇自己1位帶有吉祥物的「白上フブキ」。這個回合中，該成員的藝能傷害+20。
  // SP REAL:   [每場比賽一次]從自己的牌組展示1~2張吉祥物並加入手牌。將牌組重新洗牌。
  // ACTION: oshi → pick own 白上フブキ-with-mascot member +20 turn boost;
  //         SP → search 1-2 mascots from deck → hand, reshuffle
  // AMBIGUITY: oshi: 0 → skip; 1 → auto; multi → SELECT_OWN_MEMBER
  //            SP: 0 → reshuffle + skip; ≥1 → SEARCH_SELECT maxSelect=2
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: oshi target must be name='白上フブキ' AND have ≥1 attached mascot
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD14-001', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const matches = own.zones[ZONE.DECK].filter(c => getCard(c.cardId)?.type === '支援・吉祥物');
      if (matches.length === 0) {
        shuffleArr(own.zones[ZONE.DECK]);
        return { state, resolved: true, log: 'SP: 牌組無吉祥物 — 重新洗牌' };
      }
      return {
        state, resolved: false,
        prompt: {
          type: 'SEARCH_SELECT', player: ctx.player,
          message: `SP「マスコッツ、アッセンブル!!」: 選擇 1-${Math.min(2, matches.length)} 張吉祥物加入手牌（可跳過）`,
          cards: archivePicks(matches),
          maxSelect: Math.min(2, matches.length),
          afterAction: 'ADD_TO_HAND',
        },
        log: 'SP: 搜尋吉祥物 1-2 張',
      };
    }
    // oshi (non-SP): pick own フブキ with mascot
    const fubukiMembers = getStageMembers(own).filter(m => {
      if (getCard(m.inst.cardId)?.name !== '白上フブキ') return false;
      const sup = m.inst.attachedSupport || [];
      return sup.some(s => getCard(s.cardId)?.type === '支援・吉祥物');
    });
    if (fubukiMembers.length === 0) return { state, resolved: true, log: 'oshi: 無帶吉祥物的フブキ — 跳過' };
    if (fubukiMembers.length === 1) {
      const target = fubukiMembers[0];
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: target.inst.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `oshi: ${getCard(target.inst.cardId)?.name||''} (帶吉祥物) 本回合 +20` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'oshi「みんな一緒にいくぞぉおっ」: 選擇 1 位帶吉祥物的「白上フブキ」+20',
        cards: memberPicks(fubukiMembers),
        maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER',
        amount: 20,
      },
      log: 'oshi: 選擇帶吉祥物的フブキ',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD14-004 白上フブキ (Debut SD14) effectC「白上のとこにおいでー」
  // REAL: 如果在自己後攻的第一個回合，從自己的牌組展示1張吉祥物並加入手牌。將牌組重新洗牌。
  // ACTION: search 1 mascot from deck → hand, reshuffle
  // AMBIGUITY: 0 → reshuffle + skip; ≥1 → SEARCH_SELECT
  // LIMITS: only on own first turn AND own player went second
  // CONDITIONS: turnNumber relevant — heuristic: first time this player's
  //   turn comes around when they aren't first to act. Use _firstTurnSecond
  //   marker if engine sets it; else fall back to turnNumber check.
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD14-004', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    // Check: is this player going second AND this their first turn?
    // Engine convention: state.firstPlayer is which player went first;
    // turnNumber starts at 1 (first player's turn 1). Player going second
    // has their first turn = turnNumber 2 (overall) when activePlayer is them.
    const goingSecond = state.firstPlayer != null && state.firstPlayer !== ctx.player;
    const isFirstTurnForMe = state.turnNumber === 2 && goingSecond;
    if (!isFirstTurnForMe) return { state, resolved: true, log: '白上のとこにおいでー: 非後攻第一回合' };
    const own = state.players[ctx.player];
    const matches = own.zones[ZONE.DECK].filter(c => getCard(c.cardId)?.type === '支援・吉祥物');
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: '白上のとこにおいでー: 牌組無吉祥物' };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT', player: ctx.player,
        message: '白上のとこにおいでー: 選擇 1 張吉祥物加入手牌',
        cards: archivePicks(matches),
        maxSelect: 1, afterAction: 'ADD_TO_HAND',
      },
      log: '白上のとこにおいでー: 搜尋吉祥物',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD14-005 白上フブキ (Debut SD14) effectC「いっちにー、さんしー」
  // REAL: 選擇自己的中心成員。這個回合中，該成員的藝能傷害+10。
  // ACTION: pick own center → +10 turn boost
  // AMBIGUITY: center always 0 or 1 → if 1, auto-apply; if 0, skip
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: own center exists
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD14-005', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const center = own.zones[ZONE.CENTER];
    if (!center) return { state, resolved: true, log: 'いっちにー、さんしー: 中心無成員' };
    state._turnBoosts = state._turnBoosts || [];
    state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 10, target: 'instance', instanceId: center.instanceId, duration: 'turn' });
    return { state, resolved: true, log: `いっちにー、さんしー: 中心 ${getCard(center.cardId)?.name||''} 本回合 +10` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD14-007 白上フブキ (1st SD14) effectB「Message for You -フブキ-」
  // REAL: 選擇自己的中心成員。這個回合中，該成員的藝能傷害+10。
  // ACTION: same as hSD14-005 but on bloom
  // AMBIGUITY: same
  // LIMITS: ON_BLOOM self-only
  // CONDITIONS: own center exists
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD14-007', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const center = own.zones[ZONE.CENTER];
    if (!center) return { state, resolved: true, log: 'Message for You: 中心無成員' };
    state._turnBoosts = state._turnBoosts || [];
    state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 10, target: 'instance', instanceId: center.instanceId, duration: 'turn' });
    return { state, resolved: true, log: `Message for You: 中心 ${getCard(center.cardId)?.name||''} 本回合 +10` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD14-008 白上フブキ (1st SD14) effectC「大丈夫ですよ！」/ art1「一緒に行こう」
  // EFFECTC REAL: 將自己存檔區的1張吉祥物附加給這個成員。
  // ART1 REAL: [限定聯動位置]如果這個成員帶有吉祥物，這個藝能傷害+20。
  // ACTION: effectC → archive mascot → this member; art1 → +20 if has mascot AND in collab
  // AMBIGUITY: effectC archive: 0 → skip; ≥1 → SELECT_FROM_ARCHIVE then ATTACH_FROM_ARCHIVE_TO_MEMBER
  //   (target is fixed = this member, single recipient)
  // LIMITS: effectC self-only; art-time check
  // CONDITIONS: effectC: archive has mascot; art1: this card in COLLAB + has mascot
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD14-008', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const matches = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.type === '支援・吉祥物');
    if (matches.length === 0) return { state, resolved: true, log: '大丈夫ですよ！: 存檔無吉祥物' };
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: '大丈夫ですよ！: 選擇 1 張吉祥物附加給此成員',
        cards: archivePicks(matches),
        maxSelect: 1,
        afterAction: 'ATTACH_FROM_ARCHIVE_TO_MEMBER',
        targetInstanceId: me.instanceId,
      },
      log: '大丈夫ですよ！: 選擇吉祥物附加給自身',
    };
  });
  reg('hSD14-008', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    if (own.zones[ZONE.COLLAB]?.instanceId !== me.instanceId) {
      return { state, resolved: true, log: '一緒に行こう: 非聯動位置' };
    }
    const hasMascot = (me.attachedSupport || []).some(s => getCard(s.cardId)?.type === '支援・吉祥物');
    if (!hasMascot) return { state, resolved: true, log: '一緒に行こう: 未帶吉祥物' };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 20, target: 'self', duration: 'instant' },
      log: '一緒に行こう: 帶吉祥物 + 聯動 → +20',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD14-009 白上フブキ (2nd SD14) effectG「私は倒れちゃいけないな」
  // REAL: 對手回合中，這個成員被擊倒時，如果這個成員帶有吉祥物，從自己的牌組抽1張牌。
  // ACTION: ON_KNOCKDOWN → if knocked during opp turn AND this member had mascot → draw 1
  // AMBIGUITY: none
  // LIMITS: passive knockdown trigger
  // CONDITIONS: knocked during opp's turn; member had ≥1 mascot attached
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD14-009', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    // ctx.player = owner of knocked member (== this card's player); ctx.activePlayer = whoever's turn
    if (ctx.activePlayer === ctx.player) return { state, resolved: true, log: '私は倒れちゃいけない: 非對手回合' };
    const knocked = ctx.memberInst;
    if (!knocked) return { state, resolved: true };
    const hadMascot = (knocked.attachedSupport || []).some(s => getCard(s.cardId)?.type === '支援・吉祥物');
    if (!hadMascot) return { state, resolved: true, log: '私は倒れちゃいけない: 未帶吉祥物' };
    const own = state.players[ctx.player];
    drawCards(own, 1);
    return { state, resolved: true, log: '私は倒れちゃいけない: 帶吉祥物被擊倒 → 抽 1' };
  });

  return count;
}
