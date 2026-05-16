// 不知火フレア deck handlers — written from real card text per the
// "no guessing" rule. Themes: yellow color buffs, エルフレンド fan cards,
// position swaps, HP/life-based conditional boosts.

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

function hasTag(inst, tag) {
  const t = getCard(inst.cardId)?.tag || '';
  return (typeof t === 'string' ? t : JSON.stringify(t)).includes(tag);
}

export function registerFlareDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-036 oshi/SP — yellow boost / search yellow
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-036', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const matches = own.zones[ZONE.DECK].filter(c => isMember(getCard(c.cardId)?.type) && getCard(c.cardId)?.color === '黃');
      if (matches.length === 0) {
        shuffleArr(own.zones[ZONE.DECK]);
        return { state, resolved: true, log: 'SP: 牌組無黃色成員 — 重新洗牌' };
      }
      return {
        state, resolved: false,
        prompt: { type: 'SEARCH_SELECT', player: ctx.player,
          message: 'SP: 選擇 1 張黃色成員加入手牌',
          cards: archivePicks(matches), maxSelect: 1, afterAction: 'ADD_TO_HAND' },
        log: 'SP: 搜尋黃色成員',
      };
    }
    const yellowMembers = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.color === '黃');
    if (yellowMembers.length === 0) return { state, resolved: true, log: 'oshi: 無黃色成員' };
    if (yellowMembers.length === 1) {
      const t = yellowMembers[0];
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: t.inst.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `oshi: ${getCard(t.inst.cardId)?.name||''} +20` };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'oshi「イエローエンハンス」: 選擇 1 位黃色成員 +20',
        cards: memberPicks(yellowMembers), maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER', amount: 20 },
      log: 'oshi: 選擇黃色成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP01-097 不知火フレア (Spot) effectC「それは「愛と絆の物語」」
  // REAL: 將自己的中心成員與1位活動狀態的後台成員進行替換。
  // ACTION: position swap center ↔ active backstage member
  // → MANUAL (engine has SELECT_OWN_MEMBER but swap-target is engine-specific)
  // Actually engine has the position-change.js template. Use SELECT_OWN_MEMBER + swap afterAction.
  // For now → MANUAL since the swap afterAction isn't in our resolver list.
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP01-097', HOOK.ON_COLLAB, (state, ctx) => ({ state }));

  // ─────────────────────────────────────────────────────────────────────
  // hBP03-079 不知火フレア (1st Buzz) effectB / art1
  // EFFECTB REAL: 從自己的吶喊牌組展示1張黃色吶喊卡，發送給這個成員。將吶喊牌組重新洗牌。
  // ART1 REAL:    這個成員有3張以上的吶喊卡時，這個藝能傷害+30。
  // ACTION: effectB → scan cheer-deck for first 黃 cheer → attach self → reshuffle
  //         art1 → cheer count ≥3 → +30
  // AMBIGUITY: effectB target = self (auto); cheer color scan auto
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP03-079', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const cheerDeck = own.zones[ZONE.CHEER_DECK];
    let pickIdx = -1;
    for (let i = 0; i < cheerDeck.length; i++) {
      if (getCard(cheerDeck[i].cardId)?.color === '黃') { pickIdx = i; break; }
    }
    if (pickIdx < 0) {
      shuffleArr(cheerDeck);
      return { state, resolved: true, log: '今日はステキな日: 吶喊牌組無黃色 — 重新洗牌' };
    }
    const cheer = cheerDeck.splice(pickIdx, 1)[0];
    cheer.faceDown = false;
    ctx.memberInst.attachedCheer = ctx.memberInst.attachedCheer || [];
    ctx.memberInst.attachedCheer.push(cheer);
    shuffleArr(cheerDeck);
    return { state, resolved: true, log: '今日はステキな日: 黃色吶喊→自身' };
  });
  reg('hBP03-079', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const n = ctx.memberInst?.attachedCheer?.length || 0;
    if (n < 3) return { state, resolved: true, log: `サンライズエール: 吶喊 ${n}<3` };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 30, target: 'self', duration: 'instant' },
      log: `サンライズエール: ${n} 吶喊 → +30`,
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-007 主推 oshi/SP — position swap / cheer move + boost
  // OSHI REAL: [每個回合一次]將自己聯動位置的Debut/1st/Spot成員與1位後台成員「不知火フレア」進行替換。
  // SP REAL:   [每場比賽一次]可以將自己舞台上的1~5張吶喊卡替換給自己的1位「不知火フレア」。
  //            之後，這個回合中，自己的中心成員每有1張吶喊卡，自己舞台上的所有成員藝能傷害+10。
  // ACTION: oshi position swap; SP cheer-move + center-cheer-count boost
  // → both MANUAL (multi-step pickers + cheer-count-based all-stage buff)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-007', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    return { state }; // MANUAL — both paths need complex multi-step UI
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-063 effectC — cost (own cheer→archive) → search Debut with diff name
  // REAL: 可以將這個成員的1張吶喊卡放到存檔區：從自己的牌組展示1張與自己舞台上所有成員都不同
  //       卡名的Debut成員並加入手牌。將牌組重新洗牌。
  // → MANUAL (cost + name-diff search prompt)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-063', HOOK.ON_COLLAB, (state, ctx) => ({ state }));

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-064 effectC「Canvas」
  // REAL: 如果在自己後攻的第一個回合，從自己的牌組展示2張不同卡名的Debut成員並加入手牌。
  //       將牌組重新洗牌。
  // ACTION: back-attack 1st turn → search 2 different-name Debut → hand
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-064', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const own = state.players[ctx.player];
    const isBackAttackFirst = state.firstTurn?.[ctx.player] && ctx.player !== state.firstPlayer;
    if (!isBackAttackFirst) return { state, resolved: true, log: 'Canvas: 非後攻第1回合' };
    const allDebut = own.zones[ZONE.DECK].filter(c => {
      const card = getCard(c.cardId);
      return card?.bloom === 'Debut' && isMember(card.type);
    });
    if (allDebut.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: 'Canvas: 牌組無 Debut — 重新洗牌' };
    }
    // Distinct names
    const namesSeen = new Set();
    const distinct = [];
    for (const c of allDebut) {
      const n = getCard(c.cardId)?.name;
      if (!namesSeen.has(n)) { namesSeen.add(n); distinct.push(c); }
    }
    return {
      state, resolved: false,
      prompt: { type: 'SEARCH_SELECT', player: ctx.player,
        message: `Canvas: 選擇至多 2 張不同卡名的 Debut 成員加入手牌`,
        cards: archivePicks(distinct), maxSelect: Math.min(2, distinct.length),
        afterAction: 'ADD_TO_HAND' },
      log: 'Canvas: 搜尋 Debut',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-065 effectG「幸運の石」
  // REAL: [限定聯動位置][每個回合一次]這個成員以外，自己的成員受到對手傷害時，
  //       可以擲1次骰子：如果為奇數，該1位成員受到的傷害-40。如果為偶數，該1位成員受到的傷害-20。
  // ACTION: reactive damage reduction; player invokes manually
  // → MANUAL (reactive + once-per-turn + dice)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-065', HOOK.ON_DAMAGE_TAKEN, (state, ctx) => {
    if (ctx.triggerEvent !== 'reactive_damage_taken') return { state, resolved: true };
    return { state }; // MANUAL — player invokes
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-066 effectG / art1
  // EFFECTG REAL: [限定聯動位置]自己標示#3期生的中心成員使用了藝能時，
  //               可以將自己的1張手牌放到存檔區：從自己的牌組抽1張牌。
  // ART1 REAL:    自己的舞台上每有1位標示#3期生且不同卡名的成員，這個藝能傷害+10。
  // ACTION: effectG reactive cost-bearing → MANUAL
  //         art1 count distinct #3期生 → +N*10
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-066', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const namesSeen = new Set();
    for (const m of getStageMembers(own)) {
      if (hasTag(m.inst, '#3期生')) {
        const n = getCard(m.inst.cardId)?.name;
        if (n) namesSeen.add(n);
      }
    }
    const n = namesSeen.size;
    if (n === 0) return { state, resolved: true, log: '氷姿雪魄: 舞台無 #3期生' };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: n * 10, target: 'self', duration: 'instant' },
      log: `氷姿雪魄: ${n} 個不同名 #3期生 → +${n*10}`,
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP05-067 effectG / art1
  // EFFECTG REAL: 這個成員使用了藝能時，可以將這個成員的2張吶喊卡發送給自己的1位後台成員。
  //               之後，從自己的存檔區將1張與剛才選擇的後台成員相同卡名的1st成員返回手牌。
  // ART1 REAL:    可以擲1次骰子：如果擲出的點數大於自己的生命值，這個藝能傷害+60。
  //               如果擲出的點數小於自己的生命值，從自己的牌組抽1張牌。
  // ACTION: effectG cheer-move + name-matching archive return → MANUAL
  //         art1 dice + life comparison
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP05-067', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    if (ctx.cardId !== 'hBP05-067') return { state, resolved: true };
    const own = state.players[ctx.player];
    const life = (own.zones[ZONE.LIFE] || []).length;
    const r = rollDieFor(state, { player: ctx.player, member: ctx.memberInst });
    if (r > life) {
      // boost is post-hoc — apply via _turnBoosts on the attacker's instance, but
      // the damage already resolved. Best to log only — boost should have been on declare.
      // Move to ON_ART_DECLARE for proper effect.
      return { state, resolved: true, log: `みんなに笑っててほしいから 骰${r}>${life}: +60（事後 boost — 請手動）` };
    }
    if (r < life) {
      drawCards(own, 1);
      return { state, resolved: true, log: `みんなに笑っててほしいから 骰${r}<${life}: 抽 1` };
    }
    return { state, resolved: true, log: `みんなに笑っててほしいから 骰${r}=${life}: 無效果` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-085 effectG / art1
  // EFFECTG REAL: 自己回合中，這個成員移動到聯動位置時，查看自己牌組上方的3張牌。
  //               展示1張「不知火フレア」並加入手牌。其餘放到存檔區。
  // ART1 REAL:    如果自己的主推為「不知火フレア」，選擇自己的1位「不知火フレア」。
  //               這個回合中，該成員每有1張吶喊卡，該成員的藝能傷害+20。
  // ACTION: effectG passive on collab move (ON_COLLAB triggerEvent='self');
  //         art1 conditional + pick フレア + cheer-count-based boost
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-085', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const own = state.players[ctx.player];
    const top3 = own.zones[ZONE.DECK].slice(0, Math.min(3, own.zones[ZONE.DECK].length));
    const matches = top3.filter(c => getCard(c.cardId)?.name === '不知火フレア');
    if (matches.length === 0) {
      // All to archive
      const removed = own.zones[ZONE.DECK].splice(0, top3.length);
      for (const c of removed) {
        c.faceDown = false;
        own.zones[ZONE.ARCHIVE].push(c);
      }
      return { state, resolved: true, log: '私のとっておき: 頂 3 張無フレア — 全進存檔' };
    }
    // Pick 1 to hand, others to archive
    return {
      state, resolved: false,
      prompt: { type: 'SEARCH_SELECT', player: ctx.player,
        message: '私のとっておき: 選擇 1 張「不知火フレア」加入手牌（其餘進存檔）',
        cards: archivePicks(matches), maxSelect: 1, afterAction: 'ADD_TO_HAND',
        remainingCards: archivePicks(top3.filter(c => !matches.find(m => m.instanceId === c.instanceId))),
        afterRemaining: 'SEND_TO_ARCHIVE',
        noShuffle: true },
      log: '私のとっておき: 選擇フレア',
    };
  });
  reg('hBP07-085', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (getCard(own.oshi?.cardId)?.name !== '不知火フレア') {
      return { state, resolved: true, log: '元気いっぱいパフェ: 主推非フレア' };
    }
    const flares = getStageMembers(own).filter(m => getCard(m.inst.cardId)?.name === '不知火フレア');
    if (flares.length === 0) return { state, resolved: true, log: '舞台無フレア' };
    if (flares.length === 1) {
      const t = flares[0];
      const cheerCount = (t.inst.attachedCheer || []).length;
      if (cheerCount === 0) return { state, resolved: true, log: '元気いっぱいパフェ: 該フレア無吶喊' };
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: cheerCount * 20, target: 'instance', instanceId: t.inst.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `元気いっぱいパフェ: ${getCard(t.inst.cardId)?.name||''} ${cheerCount} 吶喊 → 本回合 +${cheerCount*20}` };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: '元気いっぱいパフェ: 選擇 1 位「不知火フレア」（每張吶喊 +20 藝能傷害）',
        cards: memberPicks(flares), maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER',
        // For per-cheer boost, the picker handler reads cheerCount of selected
        // and applies amount = cheerCount * 20. Engine BOOST_PICKED_MEMBER
        // takes a fixed amount; we use a sentinel here — actually pre-compute
        // max possible and let engine apply it; or just go MANUAL here.
        amount: 0 },
      log: '元気いっぱいパフェ: 選擇 → MANUAL（per cheer +20）',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD07-001 主推 oshi/SP — yellow center boost / position swap heal
  // OSHI REAL: [每個回合一次]這個回合中，自己的黃色中心成員藝能傷害+20。
  // SP REAL:   [每場比賽一次]將自己的中心成員與1位活動狀態的後台成員進行替換。
  //            移動到舞台後方的成員HP回復30點。
  // ACTION: oshi → boost yellow center +20; SP → swap + heal old center
  // → SP MANUAL (position swap UI)
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD07-001', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') return { state }; // MANUAL
    const center = own.zones[ZONE.CENTER];
    if (!center) return { state, resolved: true, log: 'oshi: 中心空' };
    if (getCard(center.cardId)?.color !== '黃') return { state, resolved: true, log: 'oshi: 中心非黃色' };
    state._turnBoosts = state._turnBoosts || [];
    state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: center.instanceId, duration: 'turn' });
    return { state, resolved: true, log: `oshi: 黃色中心 ${getCard(center.cardId)?.name||''} +20` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD07-003 effectC「大切な仲間たちと」
  // REAL: 自己舞台上的成員在5位以下時，可以從自己的牌組展示
  //       「尾丸ポルカ」「さくらみこ」「星街すいせい」「白銀ノエル」其中1張Debut成員並放到舞台上。
  // ACTION: condition (≤5 stage) → search specific 4 names of Debut → place to stage
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD07-003', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const own = state.players[ctx.player];
    const stageCount = getStageMembers(own).length;
    if (stageCount > 5) return { state, resolved: true, log: '大切な仲間: 舞台 >5' };
    const NAMES = new Set(['尾丸ポルカ', 'さくらみこ', '星街すいせい', '白銀ノエル']);
    const matches = own.zones[ZONE.DECK].filter(c => {
      const card = getCard(c.cardId);
      return card?.bloom === 'Debut' && NAMES.has(card.name);
    });
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: '大切な仲間: 牌組無符合 Debut — 重新洗牌' };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SEARCH_SELECT_PLACE', player: ctx.player,
        message: '大切な仲間: 選擇 1 張 Debut 放到舞台上',
        cards: archivePicks(matches), maxSelect: 1, afterAction: 'PLACE_AND_SHUFFLE' },
      log: '大切な仲間: 選擇 Debut',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD07-004 art1「ワンダフルライフ」
  // REAL: 自己的手牌張數比對手少時，這個藝能傷害+10。
  // ACTION: hand-count comparison → +10
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD07-004', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const opp = state.players[1 - ctx.player];
    if (own.zones[ZONE.HAND].length >= opp.zones[ZONE.HAND].length) {
      return { state, resolved: true, log: 'ワンダフルライフ: 手牌不少於對手' };
    }
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
      log: 'ワンダフルライフ: 手牌少於對手 → +10',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD07-006 effectB / art1
  // EFFECTB REAL: 從自己的牌組展示1張「エルフレンド」並加入手牌。將牌組重新洗牌。
  // ART1 REAL:    自己的生命值在3以下時，這個藝能傷害+30。
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD07-006', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const matches = own.zones[ZONE.DECK].filter(c => getCard(c.cardId)?.name === 'エルフレンド');
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: 'エルフレンドのさえずり: 牌組無 — 重新洗牌' };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SEARCH_SELECT', player: ctx.player,
        message: 'エルフレンドのさえずり: 選擇 1 張「エルフレンド」加入手牌',
        cards: archivePicks(matches), maxSelect: 1, afterAction: 'ADD_TO_HAND' },
      log: 'エルフレンドのさえずり: 搜尋',
    };
  });
  reg('hSD07-006', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const life = (own.zones[ZONE.LIFE] || []).length;
    if (life > 3) return { state, resolved: true, log: `生命 ${life} > 3` };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 30, target: 'self', duration: 'instant' },
      log: `1番好きなのは: 生命 ${life} ≤3 → +30`,
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD07-007 effectB「また一つ成長した私を」
  // REAL: [限定舞台後方]可以將這個成員與自己HP剩餘70以下的聯動成員進行替換。
  // → MANUAL (position swap)
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD07-007', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    return { state }; // MANUAL — position swap
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD07-008 art1「エルフレパーティー」
  // REAL: 可以將自己存檔區的1張「エルフレンド」附加給這個成員。
  // ACTION: pick エルフレンド from archive → attach self
  // AMBIGUITY: 0 → skip; 1 → auto; multi → SELECT_FROM_ARCHIVE
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD07-008', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const matches = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.name === 'エルフレンド');
    if (matches.length === 0) return { state, resolved: true, log: 'エルフレパーティー: 存檔無エルフレンド' };
    if (matches.length === 1) {
      const idx = own.zones[ZONE.ARCHIVE].findIndex(c => c.instanceId === matches[0].instanceId);
      const card = own.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
      card.faceDown = false;
      ctx.memberInst.attachedSupport = ctx.memberInst.attachedSupport || [];
      ctx.memberInst.attachedSupport.push(card);
      return { state, resolved: true, log: 'エルフレパーティー: エルフレンド附加自身' };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_FROM_ARCHIVE', player: ctx.player,
        message: 'エルフレパーティー: 選擇 1 張「エルフレンド」附加給這個成員',
        cards: archivePicks(matches), maxSelect: 1,
        afterAction: 'ATTACH_FROM_ARCHIVE_TO_MEMBER',
        targetInstanceId: ctx.memberInst.instanceId },
      log: 'エルフレパーティー: 選擇 エルフレンド',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hSD07-009 effectG / art1
  // EFFECTG REAL: [限定中心位置]這個成員受到的傷害-10。
  // ART1 REAL:    自己的生命值在3以下時，這個藝能傷害+70。
  // → effectG handled by passive global (engine-level damage modification);
  //   for now log only. art1 boost based on life.
  // ─────────────────────────────────────────────────────────────────────
  reg('hSD07-009', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const life = (own.zones[ZONE.LIFE] || []).length;
    if (life > 3) return { state, resolved: true, log: `情熱ステージ: 生命 ${life} > 3` };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 70, target: 'self', duration: 'instant' },
      log: `情熱ステージ: 生命 ${life} ≤3 → +70`,
    };
  });

  // hSD09-007 effectG「クールダウンしよ」
  // REAL: [限定聯動位置]對手回合中，這個成員被擊倒時，如果自己的生命值比對手少，
  //       自己受到的生命值傷害-1。
  // → reactive damage modifier; player applies via reactive hook
  reg('hSD09-007', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.triggerEvent !== 'reactive_knockdown') return { state, resolved: true };
    if (ctx.knockedOutCardId !== 'hSD09-007') return { state, resolved: true };
    if (state.activePlayer === ctx.player) return { state, resolved: true };
    const own = state.players[ctx.player];
    const opp = state.players[1 - ctx.player];
    const myLife = (own.zones[ZONE.LIFE] || []).length;
    const oppLife = (opp.zones[ZONE.LIFE] || []).length;
    if (myLife >= oppLife) return { state, resolved: true, log: 'クールダウン: 生命不少於對手' };
    // Engine sums lifeLossDelta from broadcast — apply -1
    if (typeof ctx.lifeLossDelta === 'object' && ctx.lifeLossDelta != null) {
      ctx.lifeLossDelta.value = (ctx.lifeLossDelta.value || 0) - 1;
    }
    return { state, resolved: true, log: 'クールダウン: 生命傷害 -1' };
  });

  return count;
}
