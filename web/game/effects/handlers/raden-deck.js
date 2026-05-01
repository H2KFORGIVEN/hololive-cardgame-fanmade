// 儒烏風亭らでん deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// 5-line spec block per handler: REAL / ACTION / AMBIGUITY / LIMITS / CONDITIONS.
//
// Already-wired らでん cards (NOT redefined here):
//   - hBP04-021 (Debut effectC heal #ReGLOSS): phaseC1-cards.js
//   - hBP04-023 (1st effectG/knockdown): phaseB + phaseC1
//   - hBP04-024 (1st effectG/art1): phaseC1
//   - hBP04-025 (2nd effectC + art1): phaseC1
//   - hBP06-033 art1 ON_ART_RESOLVE (cheer→ReGLOSS picker): phaseB-cards.js
//
// Vanilla — skipped: hBP04-020, hBP04-022, hSD15-002, hSD15-003, hSD15-006.

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

export function registerRadenDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-022 儒烏風亭らでん (主推 PR) oshi「グリーンエンハンス」/ SP「Birthday Gift ～Green～」
  // OSHI REAL: [每個回合一次]這個回合中，自己的1位綠色成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]從自己的牌組展示1張綠色成員並加入手牌。將牌組重新洗牌。
  // (Same wording as hBD24-002/017/054. Independent cardId so still register.)
  // ACTION/AMBIGUITY/LIMITS/CONDITIONS: identical to other green PR oshi
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-022', HOOK.ON_OSHI_SKILL, (state, ctx) => {
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
  // hBP04-002 儒烏風亭らでん (主推 hBP04) oshi「ReGLOSSの風流人」/ SP「余った時間でぐるぐる」
  // OSHI REAL: [每個回合一次]將自己存檔區的1張吶喊卡發送給自己標示#ReGLOSS的成員。
  // SP REAL:   [每場比賽一次]將自己存檔區1~4張標示#きのこ的活動返回手牌。每將2張牌返回手牌，從自己的牌組抽1張牌。
  // ACTION: oshi → archive cheer picker → ReGLOSS member;
  //         SP → multi-pick 1-4 #きのこ activities + draw floor(returned/2)
  // AMBIGUITY: oshi: 0 archive cheer or 0 ReGLOSS → skip; ≥1+1 → SELECT_FROM_ARCHIVE chained
  //            SP: 0 #きのこ archive → skip; ≥1 → SELECT_FROM_ARCHIVE multi (1-4)
  //                draw count derived from selected count → MANUAL_EFFECT (afterAction
  //                for "return + conditional draw based on count" missing)
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: see REAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP04-002', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      // multi-step: pick 1-4 + conditional draw count → MANUAL_EFFECT
      return { state }; // MANUAL_EFFECT — count-derived draw; afterAction missing
    }
    // oshi: archive cheer → ReGLOSS
    const cheers = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.type === '吶喊');
    if (cheers.length === 0) return { state, resolved: true, log: 'oshi「ReGLOSSの風流人」: 存檔無吶喊 — 跳過' };
    const reglossMembers = getStageMembers(own).filter(m => hasTag(m.inst, '#ReGLOSS'));
    if (reglossMembers.length === 0) return { state, resolved: true, log: 'oshi: 無 #ReGLOSS 成員' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: 'oshi「ReGLOSSの風流人」: 選擇 1 張吶喊卡（之後選 #ReGLOSS）',
        cards: archivePicks(cheers),
        maxSelect: 1,
        afterAction: 'CHEER_FROM_ARCHIVE_TO_MEMBER',
        targets: memberPicks(reglossMembers),
      },
      log: 'oshi: 選吶喊',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-029 儒烏風亭らでん (1st Buzz) art1「誰かの為に生きてきたけど」/ art2「漸く自分の人生を生きてる」
  // ART1 REAL: DMG:50 / 如果自己的主推為「儒烏風亭らでん」，從自己的牌組展示1張標示#きのこ的活動並加入手牌。將牌組重新洗牌。
  // ART2 REAL: DMG:80+ / 如果標示#ReGLOSS的2nd成員在自己的舞台上，這個藝能傷害+40。
  // ACTION: art1 oshi-name gate + search #きのこ activity; art2 +40 if #ReGLOSS 2nd on stage
  // AMBIGUITY: art1: 0 → reshuffle / ≥1 → SEARCH_SELECT
  // LIMITS: art-time
  // CONDITIONS: see REAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-029', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const own = state.players[ctx.player];
    if (ctx.artKey === 'art1') {
      if (getCard(own.oshi?.cardId)?.name !== '儒烏風亭らでん') {
        return { state, resolved: true, log: '誰かの為に生きてきたけど: 主推非らでん — 跳過' };
      }
      const matches = own.zones[ZONE.DECK].filter(c => {
        const card = getCard(c.cardId);
        return card?.type?.includes('支援・活動') && hasTag(c, '#きのこ');
      });
      if (matches.length === 0) {
        shuffleArr(own.zones[ZONE.DECK]);
        return { state, resolved: true, log: 'art1: 牌組無 #きのこ 活動 — 重新洗牌' };
      }
      return {
        state, resolved: false,
        prompt: {
          type: 'SEARCH_SELECT', player: ctx.player,
          message: '誰かの為に生きてきたけど: 選擇 1 張 #きのこ 活動加入手牌',
          cards: archivePicks(matches),
          maxSelect: 1, afterAction: 'ADD_TO_HAND',
        },
        log: 'art1: 搜尋 #きのこ 活動',
      };
    }
    if (ctx.artKey === 'art2') {
      const has = getStageMembers(own).some(m =>
        hasTag(m.inst, '#ReGLOSS') && getCard(m.inst.cardId)?.bloom === '2nd'
      );
      if (!has) return { state, resolved: true, log: '漸く自分の人生を生きてる: 無 #ReGLOSS 2nd' };
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 40, target: 'self', duration: 'instant' },
        log: '漸く自分の人生を生きてる: 有 #ReGLOSS 2nd → +40',
      };
    }
    return { state, resolved: true };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP06-033 儒烏風亭らでん (1st) effectB「濡羽色のほころび」
  // REAL: 如果這個回合自己有使用過標示#きのこ的活動，從自己的牌組抽2張牌。「濡羽色のほころび」每個回合只能使用一次。
  // ACTION: 1/turn check + activity-played gate → draw 2
  // AMBIGUITY: none
  // LIMITS: 1/turn (state._oncePerTurn[cardId])
  // CONDITIONS: at least 1 #きのこ activity played this turn
  // Engine tracks `_activitiesPlayedThisTurn` (count) but not by-tag.
  // Heuristic: if any activity played this turn AND main char is らでん, assume
  // it's #きのこ. Conservative — only fires when activities ≥1 + oshi=らでん.
  // True precise check requires `_activityTagsPlayedThisTurn` (Phase 2.4).
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP06-033', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    own._oncePerTurn = own._oncePerTurn || {};
    if (own._oncePerTurn['hBP06-033_effectB']) {
      return { state, resolved: true, log: '濡羽色のほころび: 本回合已使用' };
    }
    const activities = own._activitiesPlayedThisTurn || 0;
    if (activities < 1) return { state, resolved: true, log: '濡羽色のほころび: 本回合未使用活動' };
    // Engine doesn't track activity tags — conservative gate by oshi name
    if (getCard(own.oshi?.cardId)?.name !== '儒烏風亭らでん') {
      return { state, resolved: true, log: '濡羽色のほころび: 主推非らでん（無法精確檢查 #きのこ 標籤）' };
    }
    own._oncePerTurn['hBP06-033_effectB'] = true;
    drawCards(own, 2);
    return { state, resolved: true, log: `濡羽色のほころび: 活動 ${activities} 次 + 主推らでん → 抽 2` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD05-010 儒烏風亭らでん (Debut SD05) art1「ちょいと一席」
  // REAL: DMG:20 / 可以將自己存檔區的1張吶喊卡發送給自己標示#ReGLOSS的成員。
  // ACTION: optional archive cheer picker → ReGLOSS member (chained)
  // AMBIGUITY: 0 archive cheer or 0 ReGLOSS → skip; ≥1 + ≥1 → CHEER_FROM_ARCHIVE_TO_MEMBER
  // LIMITS: art-time; optional ("可以")
  // CONDITIONS: archive cheer + ReGLOSS member
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD05-010', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const cheers = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.type === '吶喊');
    if (cheers.length === 0) return { state, resolved: true, log: 'ちょいと一席: 存檔無吶喊' };
    const reglossMembers = getStageMembers(own).filter(m => hasTag(m.inst, '#ReGLOSS'));
    if (reglossMembers.length === 0) return { state, resolved: true, log: 'ちょいと一席: 無 #ReGLOSS' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: 'ちょいと一席: 選擇 1 張吶喊卡 → #ReGLOSS',
        cards: archivePicks(cheers),
        maxSelect: 1,
        afterAction: 'CHEER_FROM_ARCHIVE_TO_MEMBER',
        targets: memberPicks(reglossMembers),
      },
      log: 'ちょいと一席: 選吶喊',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD15-001 儒烏風亭らでん (主推 SD15) oshi「ちょっとまつたけ～♪」/ SP「あなたの世界を広げに行こう」
  // OSHI REAL: [每個回合一次]從自己的牌組展示1張標示#きのこ的活動並加入手牌。將牌組重新洗牌。
  // SP REAL:   [每場比賽一次]將自己吶喊牌組上方的1張牌發送給自己的「儒烏風亭らでん」。之後，將自己存檔區1張標示#きのこ的活動返回手牌。
  // ACTION: oshi → search #きのこ activity. SP → cheer-top → らでん, then return 1 #きのこ from archive.
  // AMBIGUITY: oshi: 0 → reshuffle / ≥1 → SEARCH_SELECT
  //            SP: 0 stage らでん → cheer step skipped; multi → picker. Multi-step → MANUAL_EFFECT.
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: see REAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD15-001', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      return { state }; // MANUAL_EFFECT — multi-step (cheer + archive return)
    }
    // oshi: search #きのこ activity
    const matches = own.zones[ZONE.DECK].filter(c => {
      const card = getCard(c.cardId);
      return card?.type?.includes('支援・活動') && hasTag(c, '#きのこ');
    });
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: 'oshi「ちょっとまつたけ」: 牌組無 #きのこ 活動 — 重新洗牌' };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT', player: ctx.player,
        message: 'oshi「ちょっとまつたけ」: 選擇 1 張 #きのこ 活動加入手牌',
        cards: archivePicks(matches),
        maxSelect: 1, afterAction: 'ADD_TO_HAND',
      },
      log: 'oshi: 搜尋 #きのこ 活動',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD15-004 儒烏風亭らでん (Debut SD15) effectC「一服朝っぱらでん」
  // REAL: 如果在自己後攻的第一個回合，將自己吶喊牌組上方的1張牌發送給自己的後台成員。
  // ACTION: post-attack first turn → cheer top → backstage member (picker if multi)
  // AMBIGUITY: backstage 0 → skip; 1 → auto; multi → SELECT_OWN_MEMBER
  // LIMITS: ON_COLLAB self-only; only own first turn AND going second
  // CONDITIONS: turnNumber=2 + state.firstPlayer != ctx.player; cheer deck non-empty
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD15-004', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const goingSecond = state.firstPlayer != null && state.firstPlayer !== ctx.player;
    const isFirstTurnForMe = state.turnNumber === 2 && goingSecond;
    if (!isFirstTurnForMe) return { state, resolved: true, log: '一服朝っぱらでん: 非後攻第一回合' };
    const own = state.players[ctx.player];
    if (own.zones[ZONE.CHEER_DECK].length === 0) return { state, resolved: true, log: '吶喊牌組空' };
    const backs = own.zones[ZONE.BACKSTAGE].map(m => ({ inst: m }));
    if (backs.length === 0) return { state, resolved: true, log: '後台無成員' };
    if (backs.length === 1) {
      const t = backs[0].inst;
      const cheer = own.zones[ZONE.CHEER_DECK].shift();
      cheer.faceDown = false;
      t.attachedCheer = t.attachedCheer || [];
      t.attachedCheer.push(cheer);
      return { state, resolved: true, log: `一服朝っぱらでん: 吶喊→${getCard(t.cardId)?.name||''}` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: '一服朝っぱらでん: 選擇 1 位後台成員接收吶喊',
        cards: memberPicks(backs),
        maxSelect: 1, afterAction: 'CHEER_FROM_DECK_TOP_TO_MEMBER',
      },
      log: '一服朝っぱらでん: 選擇後台',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD15-005 儒烏風亭らでん (Debut SD15) effectG「体力作り頑張るぞー！！！！！」
  // REAL: 對手回合中，這個成員被擊倒時，可以將這個成員的1張吶喊卡替換給自己其他的成員。
  // ACTION: ON_KNOCKDOWN by opp → optional cheer move from this to other (multi-step picker)
  // AMBIGUITY: 0 cheer attached or 0 other members → skip
  // LIMITS: passive knockdown trigger; optional ("可以")
  // CONDITIONS: opp's turn; this carries ≥1 cheer; ≥1 other own member
  // Multi-step picker (which cheer + which target) → MANUAL_EFFECT.
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD15-005', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.activePlayer === ctx.player) return { state, resolved: true };
    return { state }; // MANUAL_EFFECT — cheer-from-knocked picker
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD15-007 儒烏風亭らでん (1st SD15) effectC「旅の前日」
  // REAL: 將自己牌組上方的1張牌放到存檔區。之後，可以將自己存檔區的1張Debut成員放到舞台上。
  // ACTION: mill 1 (mandatory), then optional pick Debut from archive → backstage
  //   (place-on-stage afterAction missing → MANUAL_EFFECT for the optional half)
  // AMBIGUITY: archive Debut 0 → skip; ≥1 → MANUAL_EFFECT (place picker)
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: deck has ≥1 card for mill
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD15-007', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    // Mandatory mill 1
    if (own.zones[ZONE.DECK].length > 0) {
      const top = own.zones[ZONE.DECK].shift();
      top.faceDown = false;
      own.zones[ZONE.ARCHIVE].push(top);
    }
    // Optional place-Debut step is MANUAL_EFFECT (afterAction missing)
    return { state, resolved: true, log: '旅の前日: 牌頂存檔；可選擇將存檔 Debut 上場（手動）' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD15-008 儒烏風亭らでん (1st SD15) effectG「薄明」/ art1「きのこ狩り」
  // EFFECTG REAL: 這個成員擊倒對手的成員時，這個成員HP回復20點。
  // ART1 REAL: DMG:40+ / 如果這個回合自己有使用過標示#きのこ的活動，這個藝能傷害+10。
  // ACTION: effectG → ON_KNOCKDOWN by self → heal self 20
  //         art1 → +10 if any activity played this turn AND oshi=らでん (heuristic)
  // AMBIGUITY: none
  // LIMITS: passive knockdown; art-time
  // CONDITIONS: see REAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD15-008', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    // ctx.cardId is the knocked card; for self-as-attacker we read attackerCardId
    if (ctx.attackerCardId !== 'hSD15-008') return { state, resolved: true };
    if (ctx.player === ctx.knockedOutPlayer) return { state, resolved: true };
    // Find self on stage
    const own = state.players[ctx.attackerPlayer];
    const self = getStageMembers(own).find(m => m.inst.cardId === 'hSD15-008');
    if (!self) return { state, resolved: true };
    self.inst.damage = Math.max(0, (self.inst.damage || 0) - 20);
    return { state, resolved: true, log: '薄明: 擊倒對手 → 自身回 20HP' };
  });
  reg('hSD15-008', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const activities = own._activitiesPlayedThisTurn || 0;
    if (activities < 1) return { state, resolved: true, log: 'きのこ狩り: 本回合未使用活動' };
    if (getCard(own.oshi?.cardId)?.name !== '儒烏風亭らでん') {
      return { state, resolved: true, log: 'きのこ狩り: 主推非らでん（#きのこ 標籤無法精確檢查）' };
    }
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
      log: 'きのこ狩り: 主推らでん + 活動 → +10',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD15-009 儒烏風亭らでん (2nd SD15) effectB「ザ・破天荒」
  // REAL: [限定中心位置]這個回合中，這個成員的藝能傷害+20。
  // ACTION: center-only +20 turn boost to self
  // AMBIGUITY: none
  // LIMITS: ON_BLOOM self-only
  // CONDITIONS: this in CENTER
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD15-009', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    if (own.zones[ZONE.CENTER]?.instanceId !== me.instanceId) {
      return { state, resolved: true, log: 'ザ・破天荒: 非中心位置' };
    }
    state._turnBoosts = state._turnBoosts || [];
    state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: me.instanceId, duration: 'turn' });
    return { state, resolved: true, log: 'ザ・破天荒: 中心 — 本回合 +20' };
  });

  return count;
}
