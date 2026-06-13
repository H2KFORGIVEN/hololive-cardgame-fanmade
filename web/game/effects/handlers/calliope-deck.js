// 森カリオペ deck handlers — written from real card text per the
// "no guessing" rule (~/.claude/projects/.../feedback_no_guessing_card_effects.md).
//
// Each handler has the real zh-TW effect text in a 5-line spec block:
//   REAL       — the literal effect text
//   ACTION     — what the handler does
//   AMBIGUITY  — how it handles 0/1/multi candidates
//   LIMITS     — once-per-turn / once-per-game / etc.
//   CONDITIONS — required state for the effect to fire
//
// Already-wired カリオペ cards (NOT redefined here):
//   - hBP02-007 (oshi サンプリング / SP 死神ラップ): phaseB-cards.js F-1.4
//     [minor: auto-picks first 2 hand cards as cost; refinement deferred]
//   - hBP02-054 (Debut art1 +10 if archive has member): top50-cards.js
//   - hBP02-058 (1st effectB+art1): phaseC1-cards.js
//   - hBP02-059 (2nd effectB+art1): phaseC1-cards.js
//   - hBP02-057 (1st effectB cost+draw): phaseD-generated.js (handler exists)
//   - hBP06-057/058/059/060 (1st EN/2nd EN effects + arts): phaseB-cards.js
//   - hBP04-062 (1st Buzz art1 look-top-2): phaseC1-cards.js (auto-pick first;
//     IMPROVED below by adding effectG real boost)
//
// Vanilla (no effect text) — skipped: hBP02-056, hSD18-002, hSD18-003, hSD18-006.

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

export function registerCalliopeDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-037 森カリオペ (主推 PR) oshi「パープルエンハンス」/ SP「Birthday Gift ～Purple～」
  // OSHI REAL: [每個回合一次]這個回合中，自己的1位紫色成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]從自己的牌組展示1張紫色成員並加入手牌。將牌組重新洗牌。
  // ACTION: oshi → pick own purple +20; SP → search purple member
  // AMBIGUITY: oshi 0→skip / 1→auto / multi→SELECT_OWN_MEMBER
  //            SP    0→reshuffle / ≥1→SEARCH_SELECT
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: none
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-037', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const matches = own.zones[ZONE.DECK].filter(c =>
        isMember(getCard(c.cardId)?.type) && getCard(c.cardId)?.color === '紫'
      );
      if (matches.length === 0) {
        shuffleArr(own.zones[ZONE.DECK]);
        return { state, resolved: true, log: 'SP: 牌組無紫色成員 — 重新洗牌' };
      }
      return {
        state, resolved: false,
        prompt: {
          type: 'SEARCH_SELECT', player: ctx.player,
          message: 'SP「Birthday Gift ～Purple～」: 選擇 1 張紫色成員加入手牌',
          cards: archivePicks(matches),
          maxSelect: 1, afterAction: 'ADD_TO_HAND',
        },
        log: 'SP: 搜尋紫色成員',
      };
    }
    const purples = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.color === '紫');
    if (purples.length === 0) return { state, resolved: true, log: 'oshi: 無紫色成員 — 跳過' };
    if (purples.length === 1) {
      const target = purples[0];
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: target.inst.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `oshi: ${getCard(target.inst.cardId)?.name||''} 本回合 +20` };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'oshi「パープルエンハンス」: 選擇 1 位紫色成員 +20 藝能傷害',
        cards: memberPicks(purples),
        maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER',
        amount: 20,
      },
      log: 'oshi: 選擇紫色成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP01-100 森カリオペ (Spot 無色) effectC「ソウル収穫」
  // REAL: 可以將自己存檔區的1~3張吶喊卡返回吶喊牌組。將吶喊牌組重新洗牌。
  // ACTION: optional return 1-3 archive cheers → cheer deck (+ shuffle)
  // AMBIGUITY: archive cheer 0 → skip; ≥1 → SELECT_FROM_ARCHIVE multi-pick
  // LIMITS: ON_COLLAB self-only; optional ("可以")
  // CONDITIONS: archive has ≥1 cheer
  // Note: existing afterActions move cards to hand/deck, not cheer-deck.
  // Falls through to MANUAL_EFFECT (afterAction missing).
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP01-100', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    // Phase 2.4 #10: cheer→cheer-deck afterAction.
    const own = state.players[ctx.player];
    const cheers = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.type === '吶喊');
    if (cheers.length === 0) return { state, resolved: true, log: 'ソウル収穫: 存檔無吶喊 — 跳過' };
    const max = Math.min(3, cheers.length);
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: `ソウル収穫: 選擇 1-${max} 張吶喊卡返回吶喊牌組（可跳過）`,
        baseMessage: 'ソウル収穫: 選擇吶喊卡',
        cards: archivePicks(cheers),
        maxSelect: max,
        afterAction: 'CHEER_FROM_ARCHIVE_TO_CHEERDECK',
      },
      log: 'ソウル収穫: 選吶喊卡',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP02-055 森カリオペ (Debut) effectC「ショータイム」
  // REAL: 可以將自己手牌的1張成員放到存檔區：這個回合中，自己舞台上1位標示#Myth的成員藝能傷害+20。
  // ACTION: optional cost (hand member → archive) + +20 turn boost to picked #Myth
  // AMBIGUITY: hand member picker required; #Myth target picker required
  // LIMITS: ON_COLLAB self-only; optional ("可以")
  // CONDITIONS: hand has ≥1 member; ≥1 #Myth on stage
  // Cost-bearing two-step pick → MANUAL_EFFECT
  // ─────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────
  // hBP02-057 森カリオペ (1st) effectB「みんなで作る最高のfes」
  // REAL: 可以將自己手牌2張標示相同標籤的成員放到存檔區：從自己的牌組抽2張牌。
  // ACTION: 2 hand members sharing ≥1 tag → archive both + draw 2
  // AMBIGUITY: 1st pick free; 2nd pick filtered to tag-share via afterAction
  // LIMITS: ON_BLOOM self-only; optional ("可以")
  // CONDITIONS: ≥2 hand members exist (need to share a tag)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP02-057', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const handMembers = own.zones[ZONE.HAND].filter(c => isMember(getCard(c.cardId)?.type));
    if (handMembers.length < 2) return { state, resolved: true, log: 'みんなで作る最高のfes: 手牌成員 <2 — 跳過' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_HAND', player: ctx.player,
        message: 'みんなで作る最高のfes: 選擇 2 張共享標籤的手牌成員 → 存檔（→ 抽 2）',
        baseMessage: 'みんなで作る最高のfes: 選擇 2 張共享標籤的手牌成員',
        cards: handMembers.map(c => ({
          instanceId: c.instanceId, cardId: c.cardId,
          name: getCard(c.cardId)?.name || '',
          image: getCardImage(c.cardId),
        })),
        maxSelect: 2,
        afterAction: 'ARCHIVE_HAND_TAGSHARE_DRAW',
        drawCount: 2,
      },
      log: 'みんなで作る最高のfes: 選 1 張手牌成員',
    };
  });

  reg('hBP02-055', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    // Phase 2.4 #7: hand-cost + tag-filtered turn buff via picker afterAction.
    const own = state.players[ctx.player];
    const handMembers = own.zones[ZONE.HAND].filter(c => isMember(getCard(c.cardId)?.type));
    if (handMembers.length === 0) return { state, resolved: true, log: 'ショータイム: 手牌無成員 — 跳過' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_HAND', player: ctx.player,
        message: 'ショータイム: 選擇 1 張手牌成員 → 存檔（→ 1 位 #Myth 成員 +20）',
        cards: handMembers.map(c => ({
          instanceId: c.instanceId, cardId: c.cardId,
          name: getCard(c.cardId)?.name || '',
          image: getCardImage(c.cardId),
        })),
        maxSelect: 1,
        afterAction: 'ARCHIVE_HAND_THEN_BOOST',
        boostAmount: 20,
        boostTarget: 'pick_member',
        tagFilter: '#Myth',
      },
      log: 'ショータイム: 選手牌成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP04-062 森カリオペ (1st Buzz) effectG「永遠の休息」
  // REAL: [限定中心位置或聯動位置]這個成員帶有「森カリオペの鎌」或「Death-sensei」時，自己標示#Myth的中心成員藝能傷害+30。
  // ACTION: passive +30 to own #Myth center when this card has 鎌/Death-sensei
  //         AND this card is in CENTER or COLLAB
  // AMBIGUITY: none — broadcast-driven boost on ON_PASSIVE_GLOBAL
  // LIMITS: passive
  // CONDITIONS: this card carries 「森カリオペの鎌」 or 「Death-sensei」 (by name);
  //   this card in CENTER/COLLAB; attacker is own #Myth center
  // (Replaces the C1 hint-log with real boost emission.)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP04-062', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => {
    if (!ctx.attacker) return { state, resolved: true };
    if (ctx.player !== ctx.attackerPlayer) return { state, resolved: true };
    const myPlayer = state.players[ctx.player];
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    // Position gate
    const inCenter = myPlayer.zones[ZONE.CENTER]?.instanceId === me.instanceId;
    const inCollab = myPlayer.zones[ZONE.COLLAB]?.instanceId === me.instanceId;
    if (!inCenter && !inCollab) return { state, resolved: true };
    // Item gate (鎌 or Death-sensei attached to me by name)
    const hasItem = (me.attachedSupport || []).some(s => {
      const n = getCard(s.cardId)?.name;
      return n === '森カリオペの鎌' || n === 'Death-sensei';
    });
    if (!hasItem) return { state, resolved: true };
    // Attacker must be own center AND #Myth
    const attackerInst = ctx.attacker;
    const attackerInCenter = myPlayer.zones[ZONE.CENTER]?.instanceId === attackerInst.instanceId;
    if (!attackerInCenter) return { state, resolved: true };
    if (!hasTag(attackerInst, '#Myth')) return { state, resolved: true };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 30, target: 'self', duration: 'instant' },
      log: '永遠の休息: 帶 鎌/Death-sensei + #Myth 中心 → +30',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD18-001 森カリオペ (主推 SD18) oshi「ライミング」/ SP「世界を繋げるラップ」
  // OSHI REAL: [每個回合一次]將自己牌組上方的2張牌放到存檔區。之後，從自己的牌組抽1張牌。
  // SP REAL:   [每場比賽一次]如果自己的存檔區有6張以上的成員，這個回合中，自己舞台上所有的「森カリオペ」藝能傷害+30。
  // ACTION: oshi → mill 2 + draw 1 (full auto, mandatory); SP → if archive ≥6 members,
  //         all 森カリオペ stage members +30 turn (auto)
  // AMBIGUITY: none
  // LIMITS: oshi 1/turn, SP 1/game
  // CONDITIONS: SP requires ≥6 #member-type in archive
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD18-001', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const memberCount = own.zones[ZONE.ARCHIVE].filter(c => isMember(getCard(c.cardId)?.type)).length;
      if (memberCount < 6) {
        return { state, resolved: true, log: `SP「世界を繋げるラップ」: 存檔成員 ${memberCount}<6 — 跳過` };
      }
      const calliopes = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.name === '森カリオペ');
      if (calliopes.length === 0) {
        return { state, resolved: true, log: 'SP: 舞台無 森カリオペ — 跳過' };
      }
      state._turnBoosts = state._turnBoosts || [];
      for (const m of calliopes) {
        state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 30, target: 'instance', instanceId: m.inst.instanceId, duration: 'turn' });
      }
      return { state, resolved: true, log: `SP: ${calliopes.length} 個 森カリオペ +30（存檔成員 ${memberCount}）` };
    }
    // oshi: mill 2 + draw 1
    let milled = 0;
    for (let i = 0; i < 2 && own.zones[ZONE.DECK].length > 0; i++) {
      const c = own.zones[ZONE.DECK].shift();
      c.faceDown = false;
      own.zones[ZONE.ARCHIVE].push(c);
      milled++;
    }
    drawCards(own, 1);
    return { state, resolved: true, log: `oshi「ライミング」: 牌頂 ${milled} → 存檔，抽 1` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD18-004 森カリオペ (Debut SD18) effectC「みーなさんっ」
  // REAL: 如果在自己後攻的第一個回合，將自己牌組上方的1張牌放到存檔區。之後，從自己的牌組抽1張牌。
  // ACTION: post-attack first turn → mill 1 + draw 1
  // AMBIGUITY: none
  // LIMITS: ON_COLLAB self-only; only on this player's first turn AND going second
  // CONDITIONS: turnNumber=2 + state.firstPlayer != ctx.player; deck non-empty
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD18-004', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const goingSecond = state.firstPlayer != null && state.firstPlayer !== ctx.player;
    const isFirstTurnForMe = state.turnNumber === 2 && goingSecond;
    if (!isFirstTurnForMe) return { state, resolved: true, log: 'みーなさんっ: 非後攻第一回合' };
    const own = state.players[ctx.player];
    if (own.zones[ZONE.DECK].length === 0) return { state, resolved: true, log: 'みーなさんっ: 牌組空' };
    const top = own.zones[ZONE.DECK].shift();
    top.faceDown = false;
    own.zones[ZONE.ARCHIVE].push(top);
    drawCards(own, 1);
    return { state, resolved: true, log: 'みーなさんっ: 牌頂 → 存檔，抽 1' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD18-005 森カリオペ (Debut SD18) effectC「死神式ストレッチ」
  // REAL: 如果自己的成員帶有道具，給予對手的中心成員10點特殊傷害。
  // ACTION: conditional 10 special dmg to opp center
  // AMBIGUITY: target = opp center
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: ≥1 own member carries a 道具
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD18-005', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const opp = state.players[1 - ctx.player];
    const hasTool = getStageMembers(own).some(m =>
      (m.inst.attachedSupport || []).some(s => getCard(s.cardId)?.type === '支援・道具')
    );
    if (!hasTool) return { state, resolved: true, log: '死神式ストレッチ: 無成員帶道具' };
    const oppCenter = opp.zones[ZONE.CENTER];
    if (!oppCenter) return { state, resolved: true, log: '對手無中心' };
    oppCenter.damage = (oppCenter.damage || 0) + 10;
    return { state, resolved: true, log: '死神式ストレッチ: 對手中心 10 特殊傷害' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD18-007 森カリオペ (1st SD18) effectG「ちょっとした特別なプレゼント」/ art1「手伝ってもらって助かるよ」
  // EFFECTG REAL: 對手回合中，這個成員被擊倒時，將自己牌組上方的1張牌放到存檔區。
  // ART1 REAL: DMG:30+ / 如果這個成員帶有道具，這個藝能傷害+10。
  // ACTION: effectG → ON_KNOCKDOWN by opp turn → mill 1; art1 → +10 if carries 道具
  // AMBIGUITY: none
  // LIMITS: passive knockdown trigger; art-time
  // CONDITIONS: see REAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD18-007', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.activePlayer === ctx.player) return { state, resolved: true };
    const own = state.players[ctx.player];
    if (own.zones[ZONE.DECK].length === 0) return { state, resolved: true, log: 'ちょっとした特別なプレゼント: 牌組空' };
    const top = own.zones[ZONE.DECK].shift();
    top.faceDown = false;
    own.zones[ZONE.ARCHIVE].push(top);
    return { state, resolved: true, log: 'ちょっとした特別なプレゼント: 對手回合擊倒 → 牌頂存檔' };
  });
  reg('hSD18-007', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    const hasTool = (me.attachedSupport || []).some(s => getCard(s.cardId)?.type === '支援・道具');
    if (!hasTool) return { state, resolved: true, log: '手伝ってもらって: 未帶道具' };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
      log: '手伝ってもらって: 帶道具 → +10',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD18-008 森カリオペ (1st SD18) effectB「ロックンロールリッパー」/ art1「OK、もう一曲行こう！」
  // EFFECTB REAL: 將自己牌組上方的1張牌放到存檔區。
  // ART1 REAL: DMG:40 / [限定中心位置]將自己存檔區的1張道具返回手牌。
  // ACTION: effectB → mill 1 (mandatory); art1 → if center, pick 1 道具 from archive → hand
  // AMBIGUITY: art1 archive 0 → skip; ≥1 → SELECT_FROM_ARCHIVE
  // LIMITS: ON_BLOOM self-only; art-time
  // CONDITIONS: art1 needs this in CENTER + ≥1 道具 in archive
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD18-008', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (own.zones[ZONE.DECK].length === 0) return { state, resolved: true, log: 'ロックンロールリッパー: 牌組空' };
    const top = own.zones[ZONE.DECK].shift();
    top.faceDown = false;
    own.zones[ZONE.ARCHIVE].push(top);
    return { state, resolved: true, log: 'ロックンロールリッパー: 牌頂存檔' };
  });
  reg('hSD18-008', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    if (!me) return { state, resolved: true };
    if (own.zones[ZONE.CENTER]?.instanceId !== me.instanceId) {
      return { state, resolved: true, log: 'OK、もう一曲行こう！: 非中心位置' };
    }
    const tools = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.type === '支援・道具');
    if (tools.length === 0) return { state, resolved: true, log: 'OK、もう一曲行こう！: 存檔無道具' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: 'OK、もう一曲行こう！: 選擇 1 張道具回手牌',
        cards: archivePicks(tools),
        maxSelect: 1, afterAction: 'RETURN_FROM_ARCHIVE',
      },
      log: 'OK、もう一曲行こう！: 選擇道具',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD18-009 森カリオペ (2nd SD18) effectC「ペイルライダー」
  // REAL: 如果自己的存檔區有6張以上的成員，給予對手的中心成員20點特殊傷害。
  // ACTION: conditional 20 special dmg to opp center
  // AMBIGUITY: target = opp center
  // LIMITS: ON_COLLAB self-only
  // CONDITIONS: ≥6 members in archive; opp center exists
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD18-009', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const memberCount = own.zones[ZONE.ARCHIVE].filter(c => isMember(getCard(c.cardId)?.type)).length;
    if (memberCount < 6) return { state, resolved: true, log: `ペイルライダー: 存檔成員 ${memberCount}<6` };
    const opp = state.players[1 - ctx.player];
    const oppCenter = opp.zones[ZONE.CENTER];
    if (!oppCenter) return { state, resolved: true, log: '對手無中心' };
    oppCenter.damage = (oppCenter.damage || 0) + 20;
    return { state, resolved: true, log: `ペイルライダー: 存檔成員 ${memberCount} → 對手中心 20 特殊傷害` };
  });

  return count;
}
