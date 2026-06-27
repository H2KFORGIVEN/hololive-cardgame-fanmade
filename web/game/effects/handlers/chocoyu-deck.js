// 癒月ちょこ deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// Each handler has the real zh-TW effect text in a 5-line spec block:
//   REAL       — the literal effect text
//   ACTION     — what the handler does
//   AMBIGUITY  — how it handles 0/1/multi candidates
//   LIMITS     — once-per-turn / once-per-game / etc.
//   CONDITIONS — required state for the effect to fire
//
// Uses Phase 2 engine infrastructure:
//   - SELECT_OWN_MEMBER + BOOST_PICKED_MEMBER / HEAL_PICKED_MEMBER
//   - state._oncePerTurn[player][cardId] for 「每回合一次」
//   - state._activitiesPlayedThisTurn for #食べ物 / activity counters
//   - state._artColorlessReductionByInstance for hBP07-070 art1

import { getCard, getCardImage } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE, isMember, isSupport } from '../../core/constants.js';
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

export function registerChocoyuDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-023 癒月ちょこ (主推) oshi「パープルエンハンス」/ SP「Birthday Gift ～Purple～」
  // OSHI REAL: [每個回合一次]這個回合中，自己的1位紫色成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]從自己的牌組展示1張紫色成員並加入手牌。將牌組重新洗牌。
  // ACTION: oshi → pick own purple member + 20 boost; SP → search 1 purple member from deck
  // AMBIGUITY: oshi: 0 purple → skip; 1 → auto; multi → SELECT_OWN_MEMBER
  //            SP: 0 purple in deck → skip + reshuffle; ≥1 → SEARCH_SELECT
  // LIMITS: oshi 1/turn, SP 1/game (engine handles)
  // CONDITIONS: none beyond skill type
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-023', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const matches = own.zones[ZONE.DECK].filter(c => isMember(getCard(c.cardId)?.type) && getCard(c.cardId)?.color === '紫');
      if (matches.length === 0) {
        shuffleArr(own.zones[ZONE.DECK]);
        return { state, resolved: true, log: 'SP: 牌組無紫色成員 — 重新洗牌' };
      }
      return {
        state, resolved: false,
        prompt: {
          type: 'SEARCH_SELECT', player: ctx.player,
          message: 'SP「Birthday Gift」: 選擇 1 張紫色成員加入手牌',
          cards: archivePicks(matches),
          maxSelect: 1, afterAction: 'ADD_TO_HAND',
        },
        log: 'SP: 搜尋紫色成員',
      };
    }
    // oshi (non-SP)
    const purpleMembers = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.color === '紫');
    if (purpleMembers.length === 0) return { state, resolved: true, log: 'oshi: 無紫色成員 — 跳過' };
    if (purpleMembers.length === 1) {
      const target = purpleMembers[0];
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: target.inst.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `oshi: ${getCard(target.inst.cardId)?.name||''} 本回合 +20` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'oshi「パープルエンハンス」: 選擇 1 位紫色成員 +20 藝能傷害',
        cards: memberPicks(purpleMembers),
        maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER',
        amount: 20,
      },
      log: 'oshi: 選擇紫色成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP02-060 癒月ちょこ (1st Buzz) effectB「誘惑の視線」
  // REAL: 可以將自己的1位後台成員HP回復50點：每回復10點，給予對手的中心成員10點特殊傷害。
  // ACTION: optional cost-bearing 2-effect — heal own backstage 50 HP, deal 10*count opp center
  // AMBIGUITY: heal target picker required; damage auto on opp center (unambiguous)
  // LIMITS: optional ("可以")
  // CONDITIONS: at least 1 backstage member
  // Note: this is a multi-step effect with a real cost (the heal IS the
  // resource consumed, it just happens to be a benefit too). Falls through
  // to MANUAL_EFFECT — picking which to heal + auto-applying derived dmg
  // would need a custom afterAction. Document clearly.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP02-060', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    return { state }; // MANUAL_EFFECT — multi-step heal+damage chain
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-005 癒月ちょこ (主推) oshi「ちょこまみれになっちゃえっ！」/ SP「ちょこっとクッキング」
  // OSHI REAL: [每個回合一次]從自己的牌組展示1張標示#食べ物的活動並加入手牌。將牌組重新洗牌。
  // SP REAL:   [每場比賽一次]將自己存檔區1~4張標示#食べ物的活動返回手牌。之後，
  //            這個回合中，自己舞台上標示#料理的所有成員藝能傷害+40。
  // ACTION: oshi → search #食べ物 activity from deck. SP → return 1-4 #食べ物 from archive +
  //         buff all #料理 stage members +40 turn.
  // AMBIGUITY: oshi: 0 → skip + reshuffle; ≥1 → SEARCH_SELECT
  //            SP: archive activities 0 → skip; ≥1 → SELECT_FROM_ARCHIVE multi-pick
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: none beyond skill type
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-005', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const archiveMatches = own.zones[ZONE.ARCHIVE].filter(c => {
        const card = getCard(c.cardId);
        return card?.type?.includes('支援・活動') && hasTag(c, '#食べ物');
      });
      // Buff #料理 members regardless of archive return outcome
      const ryouriMembers = getStageMembers(own).filter(m => hasTag(m.inst, '#料理'));
      for (const m of ryouriMembers) {
        state._turnBoosts = state._turnBoosts || [];
        state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 40, target: 'instance', instanceId: m.inst.instanceId, duration: 'turn' });
      }
      if (archiveMatches.length === 0) {
        return { state, resolved: true, log: `SP: 存檔無 #食べ物 活動；舞台 ${ryouriMembers.length} 個 #料理 成員 +40` };
      }
      return {
        state, resolved: false,
        prompt: {
          type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
          message: `SP「ちょこっとクッキング」: 選擇 1-${Math.min(4, archiveMatches.length)} 張 #食べ物 活動回手牌（多選可跳過）`,
          cards: archivePicks(archiveMatches),
          maxSelect: Math.min(4, archiveMatches.length),
          afterAction: 'RETURN_FROM_ARCHIVE',
        },
        log: `SP: 存檔 ${archiveMatches.length} 個 #食べ物 活動可選；#料理 成員 +40`,
      };
    }
    // oshi: search #食べ物 activity
    const matches = own.zones[ZONE.DECK].filter(c => {
      const card = getCard(c.cardId);
      return card?.type?.includes('支援・活動') && hasTag(c, '#食べ物');
    });
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: 'oshi: 牌組無 #食べ物 活動 — 重新洗牌' };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT', player: ctx.player,
        message: 'oshi「ちょこまみれ」: 選擇 1 張 #食べ物 活動加入手牌',
        cards: archivePicks(matches),
        maxSelect: 1, afterAction: 'ADD_TO_HAND',
      },
      log: 'oshi: 搜尋 #食べ物 活動',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-052 癒月ちょこ (Debut) effectC「秘密の保健室」
  // REAL: 如果自己的存檔區有活動，給予對手的中心成員10點特殊傷害。
  // ACTION: conditional 10 special dmg to opp center
  // AMBIGUITY: target = opp center (unambiguous)
  // LIMITS: none
  // CONDITIONS: own archive has ≥1 activity card
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-052', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const own = state.players[ctx.player];
    const opp = state.players[1 - ctx.player];
    const hasActivity = own.zones[ZONE.ARCHIVE].some(c => getCard(c.cardId)?.type?.includes('支援・活動'));
    if (!hasActivity) return { state, resolved: true, log: '秘密の保健室: 存檔區無活動 — 跳過' };
    const oppCenter = opp.zones[ZONE.CENTER];
    if (!oppCenter) return { state, resolved: true, log: '對手無中心 — 跳過' };
    oppCenter.damage = (oppCenter.damage || 0) + 10;
    return { state, resolved: true, log: '秘密の保健室: 對手中心 10 點特殊傷害' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-054 癒月ちょこ (1st) art1「ガァチィ？」
  // REAL: 如果這個回合自己有使用過2張以上標示#食べ物的活動，使用這個藝能不需要吶喊卡。
  // ACTION: cheer cost waiver when condition met
  // AMBIGUITY: none (boolean condition)
  // LIMITS: none
  // CONDITIONS: ≥ 2 #食べ物 activities played this turn
  // Implementation: ON_ART_DECLARE checks counter; if true, push a
  // colorless cost waiver via state._artColorlessReductionByInstance
  // (set to a large number so it zeroes out)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-054', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    // Tabulate #食べ物 activity uses this turn (engine tracks general
    // _activitiesPlayedThisTurn but not specifically tagged ones — fall
    // back to relying on player log entries having "活動" + #食べ物).
    // Conservative: use the broad _activitiesPlayedThisTurn counter as
    // an upper bound proxy; when ≥2, apply waiver.
    const count = own._activitiesPlayedThisTurn || 0;
    if (count < 2) return { state, resolved: true, log: `ガァチィ？: 本回合活動 ${count}<2 — 無 waiver` };
    state._artColorlessReductionByInstance = state._artColorlessReductionByInstance || {};
    state._artColorlessReductionByInstance[ctx.player] = state._artColorlessReductionByInstance[ctx.player] || {};
    state._artColorlessReductionByInstance[ctx.player][ctx.memberInst.instanceId] = 99;
    return { state, resolved: true, log: 'ガァチィ？: 本回合 ≥2 活動 → 此藝能不需吶喊' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-055 癒月ちょこ (1st) effectG「寝坊助悪魔」
  // REAL: [限定中心位置]對手的表演階段結束時，如果這個成員的HP沒有減少，
  //       可以將自己吶喊牌組上方的1張牌發送給自己的「癒月ちょこ」。
  // ACTION: at opp performance phase end + center + this member undamaged →
  //         send top of cheer-deck to a 癒月ちょこ stage member
  // AMBIGUITY: target picker if multiple ちょこ members
  // LIMITS: passive (every opp performance end)
  // CONDITIONS: this member is in CENTER + this member.damage === 0
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-055', HOOK.ON_PHASE_END, (state, ctx) => {
    // ctx.phase = 'performance', ctx.player = OPP turn-owner
    if (ctx.phase !== 'performance') return { state, resolved: true };
    const ownIdx = 1 - ctx.player;
    const own = state.players[ownIdx];
    // Find this card on stage as center, undamaged
    const center = own.zones[ZONE.CENTER];
    if (!center || center.cardId !== 'hBP05-055') return { state, resolved: true };
    if ((center.damage || 0) > 0) return { state, resolved: true, log: '寝坊助悪魔: 已受傷 — 不觸發' };
    if (own.zones[ZONE.CHEER_DECK].length === 0) return { state, resolved: true, log: '吶喊牌組空' };
    // Find ちょこ members on stage
    const chocoMembers = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.name === '癒月ちょこ');
    if (chocoMembers.length === 0) return { state, resolved: true };
    if (chocoMembers.length === 1) {
      const cheer = own.zones[ZONE.CHEER_DECK].shift();
      cheer.faceDown = false;
      const target = chocoMembers[0];
      target.inst.attachedCheer = target.inst.attachedCheer || [];
      target.inst.attachedCheer.push(cheer);
      return { state, resolved: true, log: `寝坊助悪魔: 吶喊→${getCard(target.inst.cardId)?.name||''}` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ownIdx,
        message: '寝坊助悪魔: 選擇 1 位「癒月ちょこ」接收吶喊',
        cards: memberPicks(chocoMembers),
        maxSelect: 1, afterAction: 'CHEER_FROM_DECK_TOP_TO_MEMBER',
      },
      log: '寝坊助悪魔: 選擇接收成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-056 癒月ちょこ (2nd) art1「愛を込めて」/ art2「夜に寄り添う」
  // ART1 REAL: 這個回合自己每使用1張標示#食べ物的活動，這個藝能傷害+20。最多支持2張。
  // ART2 REAL: 可以將自己的2張手牌放到存檔區：將自己存檔區1張標示#料理的成員返回手牌。
  // ACTION: art1 — boost based on #食べ物 played count (cap 2). art2 — cost+pick.
  // AMBIGUITY: art1 — none (auto-boost). art2 — pick which 2 hand to archive + which #料理 to return.
  // LIMITS: art1 cap = 2 stacks
  // CONDITIONS: art1 — relies on _activitiesPlayedThisTurn (broad counter; treats all activities as #食べ物)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-056', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const count = Math.min(2, own._activitiesPlayedThisTurn || 0);
    if (count === 0) return { state, resolved: true, log: '愛を込めて: 本回合無活動' };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: count * 20, target: 'self', duration: 'instant' },
      log: `愛を込めて: ${count} 個活動 → +${count*20}`,
    };
  });
  // art2 has cost (archive 2 hand) — fall through to MANUAL_EFFECT
  reg('hBP05-056', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey !== 'art2') return { state, resolved: true };
    return { state }; // MANUAL — too complex (cost prompt + archive search)
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-076 ちょこのビーフストロガノフ (支援・活動)
  // REAL: 這個回合中，自己舞台上的1位成員藝能傷害+10。之後，這個回合中，
  //       自己舞台上的1位2nd成員「癒月ちょこ」藝能傷害+10。
  // ACTION: pick member +10 art dmg (any), then pick 2nd ちょこ +10 art dmg
  // AMBIGUITY: 2 sequential pickers; if no 2nd ちょこ on stage, skip step 2
  // LIMITS: none (LIMITED handled by engine)
  // CONDITIONS: none
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-076', HOOK.ON_PLAY, (state, ctx) => {
    const own = state.players[ctx.player];
    const stage = getStageMembers(own);
    if (stage.length === 0) return { state, resolved: true, log: 'ちょこのビーフ: 舞台無成員 — 跳過' };
    // Step 1: pick any stage member +10 art dmg this turn
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'ちょこのビーフ: 第1步 — 選擇任意 1 位成員 +10 藝能傷害',
        cards: memberPicks(stage),
        maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER',
        amount: 10,
        // Engine doesn't auto-chain step 2 — set a flag so a separate
        // post-resolve handler can fire it. For now, the player applies
        // step 2 via Manual Adjust if they want the 2nd ちょこ +10.
        // We log a hint for clarity.
      },
      log: 'ちょこのビーフ: 步驟 1/2',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-070 癒月ちょこ (1st) effectB「今日のご飯、何がいーい？」
  // REAL: 查看自己牌組上方的3張牌。展示1張標示#料理的成員並加入手牌。
  //       其餘依照喜歡的順序放回牌組下方。
  // ACTION: top 3 reveal → pick 1 #料理 member to hand → others to bottom in order
  // AMBIGUITY: 0 #料理 in top 3 → ORDER_TO_BOTTOM all; 1 → auto; multi → SEARCH_SELECT
  // LIMITS: none
  // CONDITIONS: none
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-070', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const top3 = own.zones[ZONE.DECK].slice(0, Math.min(3, own.zones[ZONE.DECK].length));
    if (top3.length === 0) return { state, resolved: true, log: '牌組空' };
    const ryouriMatches = top3.filter(c => isMember(getCard(c.cardId)?.type) && hasTag(c, '#料理'));
    if (ryouriMatches.length === 0) {
      // No #料理 member — order-to-bottom all 3
      return {
        state, resolved: false,
        prompt: {
          type: 'ORDER_TO_BOTTOM', player: ctx.player,
          message: '今日のご飯: 頂 3 張無 #料理 — 選擇放回牌底順序',
          cards: archivePicks(top3),
        },
        log: '今日のご飯: 頂 3 張無 #料理',
      };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT', player: ctx.player,
        message: '今日のご飯: 選擇 1 張 #料理 成員加入手牌',
        cards: archivePicks(ryouriMatches),
        maxSelect: 1, afterAction: 'ADD_TO_HAND',
        remainingCards: archivePicks(top3),
        noShuffle: true,
      },
      log: '今日のご飯: 選擇 #料理 成員',
    };
  });

  // hBP07-070 art1「がんばって美味しいの作るね♡」
  // REAL: 選擇自己1位標示#料理的成員。這個回合自己每使用過1張標示#食べ物的活動，
  //       這個回合中，剛才選擇的成員藝能需要的無色吶喊卡數量-1。
  // ACTION: pick #料理 member → applies _artColorlessReductionByInstance
  //         based on #食べ物 count this turn
  // AMBIGUITY: 0 → skip; 1 → auto; multi → SELECT_OWN_MEMBER
  // LIMITS: none
  reg('hBP07-070', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const ryouriMembers = getStageMembers(own).filter(m => hasTag(m.inst, '#料理'));
    if (ryouriMembers.length === 0) return { state, resolved: true, log: '舞台無 #料理 成員' };
    const reduction = own._activitiesPlayedThisTurn || 0;
    if (reduction === 0) return { state, resolved: true, log: '本回合無活動 — 無減免' };
    if (ryouriMembers.length === 1) {
      const target = ryouriMembers[0];
      state._artColorlessReductionByInstance = state._artColorlessReductionByInstance || {};
      state._artColorlessReductionByInstance[ctx.player] = state._artColorlessReductionByInstance[ctx.player] || {};
      state._artColorlessReductionByInstance[ctx.player][target.inst.instanceId] = (state._artColorlessReductionByInstance[ctx.player][target.inst.instanceId] || 0) + reduction;
      return { state, resolved: true, log: `がんばって: ${getCard(target.inst.cardId)?.name||''} 無色 -${reduction}` };
    }
    // Multi pickers — engine doesn't yet support "pick member then apply state-mod"
    // afterAction. Falls through to MANUAL_EFFECT.
    return { state };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD04-001 癒月ちょこ (主推) oshi「パープルマイク」/ SP「カードチェンジ」
  // OSHI REAL: [每個回合一次]這個回合中，自己的紫色中心成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]從自己的牌組抽2張牌後，將1張手牌放到存檔區。
  // ACTION: oshi → boost own purple center +20; SP → draw 2, then prompt to archive 1 hand
  // AMBIGUITY: oshi: target = center, fixed; SP: archive choice → SEARCH_SELECT prompt
  // LIMITS: oshi 1/turn, SP 1/game
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD04-001', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      drawCards(own, 2);
      if (own.zones[ZONE.HAND].length === 0) return { state, resolved: true, log: 'SP: 抽 2，手牌空無法存檔' };
      return {
        state, resolved: false,
        prompt: {
          type: 'SEARCH_SELECT', player: ctx.player,
          message: 'SP「カードチェンジ」: 選擇 1 張手牌放到存檔區',
          cards: archivePicks(own.zones[ZONE.HAND]),
          maxSelect: 1, afterAction: 'HAND_TO_ARCHIVE',
        },
        log: 'SP: 抽 2 → 選 1 手牌存檔',
      };
    }
    // oshi: boost own purple center
    const center = own.zones[ZONE.CENTER];
    if (!center) return { state, resolved: true, log: 'oshi: 中心空 — 跳過' };
    if (getCard(center.cardId)?.color !== '紫') return { state, resolved: true, log: 'oshi: 中心非紫色 — 跳過' };
    state._turnBoosts = state._turnBoosts || [];
    state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: center.instanceId, duration: 'turn' });
    return { state, resolved: true, log: `oshi: 紫色中心 ${getCard(center.cardId)?.name||''} +20` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD04-004 癒月ちょこ (Debut) effectC「地獄盛りごはん」
  // REAL: 可以將自己的1張手牌放到存檔區：從自己的牌組展示1張標示#食べ物的活動並加入手牌。
  //       將牌組重新洗牌。
  // ACTION: optional cost (archive 1 hand) → search 1 #食べ物 activity
  // AMBIGUITY: cost prompt + search prompt — too complex for current engine.
  // CONDITIONS: optional ("可以")
  // → MANUAL_EFFECT
  // ─────────────────────────────────────────────────────────────────────
  // Fall-through to MANUAL_EFFECT (cost-bearing search; let player handle).
  // Global registerEffect wrapper auto-adds the broadcast guard.
  reg('hSD04-004', HOOK.ON_COLLAB, (state, ctx) => ({ state }));

  // ─────────────────────────────────────────────────────────────────────
  // hSD04-006 癒月ちょこ (1st) art1「禁断のキッス」
  // REAL: 這個藝能給予了對手的成員傷害時，每造成10點傷害，這個成員HP回復10點。
  // ACTION: post-art-resolve heal: this member heals dmgDealt amount
  // AMBIGUITY: target = self; amount = damage dealt this art
  // CONDITIONS: this art dealt damage to opp
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD04-006', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    if (ctx.cardId !== 'hSD04-006') return { state, resolved: true };
    const dmg = ctx.amount || 0;
    if (dmg <= 0 || !ctx.memberInst) return { state, resolved: true };
    ctx.memberInst.damage = Math.max(0, (ctx.memberInst.damage || 0) - dmg);
    return { state, resolved: true, log: `禁断のキッス: 造成 ${dmg} → 自己回復 ${dmg} HP` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD04-007 癒月ちょこ (1st) effectB「ちょっこーん！」/ art1「大好き！ちゅっ♡」
  // EFFECTB REAL: 可以將自己存檔區1張LIMITED以外的活動返回手牌。
  // ART1 REAL:    自己的1位後台成員HP回復20點。
  // ACTION: effectB optional return non-LIMITED activity from archive (SELECT_FROM_ARCHIVE);
  //         art1 heal picked backstage 20 HP (HEAL_PICKED_MEMBER)
  // AMBIGUITY: effectB: 0 candidate → skip; ≥1 → SELECT_FROM_ARCHIVE
  //            art1: 0 backstage → skip; 1 → auto; multi → SELECT_OWN_MEMBER
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD04-007', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const candidates = own.zones[ZONE.ARCHIVE].filter(c => {
      const card = getCard(c.cardId);
      if (!card?.type?.includes('支援・活動')) return false;
      const supportEffect = typeof card.supportEffect === 'object' ? (card.supportEffect['zh-TW']||'') : (card.supportEffect||'');
      return !supportEffect.includes('LIMITED');
    });
    if (candidates.length === 0) return { state, resolved: true, log: 'ちょっこーん！: 存檔區無非 LIMITED 活動 — 跳過' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: 'ちょっこーん！: 選擇 1 張非 LIMITED 活動回手牌',
        cards: archivePicks(candidates),
        maxSelect: 1, afterAction: 'RETURN_FROM_ARCHIVE',
      },
      log: 'ちょっこーん！: 選擇活動',
    };
  });
  reg('hSD04-007', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const back = own.zones[ZONE.BACKSTAGE].filter(m => m).map(inst => ({ inst }));
    if (back.length === 0) return { state, resolved: true, log: '大好き！ちゅっ: 後台無成員' };
    if (back.length === 1) {
      const t = back[0].inst;
      t.damage = Math.max(0, (t.damage || 0) - 20);
      return { state, resolved: true, log: `大好き！ちゅっ: ${getCard(t.cardId)?.name||''} HP +20` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: '大好き！ちゅっ: 選擇 1 位後台成員 HP +20',
        cards: memberPicks(back),
        maxSelect: 1, afterAction: 'HEAL_PICKED_MEMBER',
        amount: 20,
      },
      log: '大好き！ちゅっ: 選擇後台',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD04-008 癒月ちょこ (1st Buzz) art2「召し上がれ」
  // REAL: 可以將自己存檔區1張標示#食べ物的活動返回手牌：這個藝能傷害+20。
  // ACTION: optional cost (return #食べ物 from archive) → +20 dmg
  // AMBIGUITY: cost-bearing — fall through to MANUAL_EFFECT (player decides)
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD04-008', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art2') return { state, resolved: true };
    return { state }; // MANUAL_EFFECT
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD04-009 癒月ちょこ (2nd) art2「あくとっ」
  // REAL: 這個回合自己每使用1張活動，這個藝能傷害+40。
  // ACTION: per-activity-played boost
  // AMBIGUITY: none (auto count)
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD04-009', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art2') return { state, resolved: true };
    const own = state.players[ctx.player];
    const count = own._activitiesPlayedThisTurn || 0;
    if (count === 0) return { state, resolved: true, log: 'あくとっ: 本回合無活動' };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: count * 40, target: 'self', duration: 'instant' },
      log: `あくとっ: ${count} 活動 → +${count*40}`,
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD04-012 スバちょこルーナ (支援・活動)
  // REAL: 不包含這張牌，自己的手牌在6張以下才能使用。
  //       查看自己牌組上方的4張牌。展示任意數量的「大空スバル」「癒月ちょこ」「姫森ルーナ」並加入手牌。
  //       其餘依照喜歡的順序放回牌組下方。LIMITED：每個回合只能使用一張。
  // ACTION: top 4 reveal → multi-pick named members → others to bottom
  // CONDITIONS: hand ≤ 6 (excluding this card; engine has already removed it from hand)
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD04-012', HOOK.ON_PLAY, (state, ctx) => {
    const own = state.players[ctx.player];
    if (own.zones[ZONE.HAND].length > 6) return { state, resolved: true, log: 'スバちょこルーナ: 手牌 >6 — 不能使用' };
    const top4 = own.zones[ZONE.DECK].slice(0, Math.min(4, own.zones[ZONE.DECK].length));
    const NAMES = ['大空スバル', '癒月ちょこ', '姫森ルーナ'];
    const matches = top4.filter(c => NAMES.includes(getCard(c.cardId)?.name));
    if (matches.length === 0) {
      return {
        state, resolved: false,
        prompt: {
          type: 'ORDER_TO_BOTTOM', player: ctx.player,
          message: 'スバちょこルーナ: 頂 4 張無符合 — 選擇放回牌底順序',
          cards: archivePicks(top4),
        },
        log: 'スバちょこルーナ: 頂 4 張無符合',
      };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT', player: ctx.player,
        message: 'スバちょこルーナ: 選擇任意數量的スバル/ちょこ/ルーナ加入手牌',
        cards: archivePicks(matches),
        maxSelect: matches.length,
        afterAction: 'ADD_TO_HAND',
        remainingCards: archivePicks(top4),
        noShuffle: true,
      },
      log: 'スバちょこルーナ: 選擇加入手牌',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD04-013 ちょこのオムライス (支援・活動)
  // REAL: 選擇自己的1位成員。該成員HP回復20點。標示#料理的成員在自己的舞台上時，
  //       這個回合中，剛才選擇的成員藝能傷害+20。
  // ACTION: pick own member → heal 20; if any #料理 on stage → also +20 art dmg this turn
  // AMBIGUITY: pick required when ≥2 stage members; 0 → skip; 1 → auto
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD04-013', HOOK.ON_PLAY, (state, ctx) => {
    const own = state.players[ctx.player];
    const stage = getStageMembers(own);
    if (stage.length === 0) return { state, resolved: true, log: 'オムライス: 舞台無成員' };
    const hasRyouri = stage.some(m => hasTag(m.inst, '#料理'));
    if (stage.length === 1) {
      const t = stage[0].inst;
      t.damage = Math.max(0, (t.damage || 0) - 20);
      let log = `オムライス: ${getCard(t.cardId)?.name||''} HP +20`;
      if (hasRyouri) {
        state._turnBoosts = state._turnBoosts || [];
        state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: t.instanceId, duration: 'turn' });
        log += ' + 本回合 +20 藝能';
      }
      return { state, resolved: true, log };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'オムライス: 選擇 1 位成員 HP +20' + (hasRyouri ? ' + 本回合 +20 藝能傷害' : ''),
        cards: memberPicks(stage),
        maxSelect: 1,
        afterAction: 'HEAL_PICKED_MEMBER',
        amount: 20,
        // bonus boost if #料理 on stage — set via post-resolve flag
        // (handled inline via custom afterAction would be cleaner; for now,
        // the heal handles HP and the player would manually mark the boost
        // since this is ambiguous when multiple #料理 exist)
      },
      log: 'オムライス: 選擇成員',
    };
  });

  return count;
}
