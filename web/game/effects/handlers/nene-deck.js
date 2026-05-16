// 桃鈴ねね deck handlers — written from real card text per the
// "no guessing" rule. Themes: #5期生 / ねっ子 / ギラファノコギリクワガタ
// (a fan card), holoP gating.

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

export function registerNeneDeck() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ─────────────────────────────────────────────────────────────────────
  // hBD24-035 oshi/SP — yellow boost / search yellow (same as hBD24-036)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBD24-035', HOOK.ON_OSHI_SKILL, (state, ctx) => {
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
      state._turnBoosts = state._turnBoosts || [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'instance', instanceId: yellowMembers[0].inst.instanceId, duration: 'turn' });
      return { state, resolved: true, log: `oshi: ${getCard(yellowMembers[0].inst.cardId)?.name||''} +20` };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: 'oshi: 選擇 1 位黃色成員 +20',
        cards: memberPicks(yellowMembers), maxSelect: 1, afterAction: 'BOOST_PICKED_MEMBER', amount: 20 },
      log: 'oshi: 選擇黃色成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP04-083 art1「こんねね～」
  // REAL: 自己舞台上的成員在5位以下時，可以從自己的牌組展示1張標示#5期生的Debut成員
  //       並放到舞台上。將牌組重新洗牌。
  // ACTION: condition (≤5 stage) → search #5期生 Debut → place to stage
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP04-083', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (getStageMembers(own).length > 5) return { state, resolved: true, log: 'こんねね～: 舞台 >5' };
    const matches = own.zones[ZONE.DECK].filter(c => {
      const card = getCard(c.cardId);
      return card?.bloom === 'Debut' && hasTag(c, '#5期生');
    });
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: 'こんねね～: 牌組無 #5期生 Debut — 重新洗牌' };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SEARCH_SELECT_PLACE', player: ctx.player,
        message: 'こんねね～: 選擇 1 張 #5期生 Debut 放到舞台',
        cards: archivePicks(matches), maxSelect: 1, afterAction: 'PLACE_AND_SHUFFLE' },
      log: 'こんねね～: 選擇 #5期生 Debut',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP04-085 effectB「最高の気分!!!」
  // REAL: 從自己的吶喊牌組展示1張與自己舞台上1位標示#5期生的成員相同顏色的吶喊卡，
  //       發送給自己標示#5期生的成員。將吶喊牌組重新洗牌。
  // ACTION: pick #5期生 member → match-color cheer scan → attach
  // → uses CHEER_DECK_REVEAL_MATCH_TO_MEMBER
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP04-085', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const fiveths = getStageMembers(own).filter(m => hasTag(m.inst, '#5期生'));
    if (fiveths.length === 0) {
      shuffleArr(own.zones[ZONE.CHEER_DECK]);
      return { state, resolved: true, log: '最高の気分: 舞台無 #5期生' };
    }
    if (fiveths.length === 1) {
      const t = fiveths[0];
      const color = getCard(t.inst.cardId)?.color;
      const cheerDeck = own.zones[ZONE.CHEER_DECK];
      const idx = cheerDeck.findIndex(c => getCard(c.cardId)?.color === color);
      if (idx < 0) {
        shuffleArr(cheerDeck);
        return { state, resolved: true, log: `最高の気分: 吶喊牌組無 ${color} — 重新洗牌` };
      }
      const cheer = cheerDeck.splice(idx, 1)[0];
      cheer.faceDown = false;
      t.inst.attachedCheer = t.inst.attachedCheer || [];
      t.inst.attachedCheer.push(cheer);
      shuffleArr(cheerDeck);
      return { state, resolved: true, log: `最高の気分: ${color} 吶喊→${getCard(t.inst.cardId)?.name||''}` };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_OWN_MEMBER', player: ctx.player,
        message: '最高の気分: 選擇 1 位 #5期生 成員接收同色吶喊',
        cards: memberPicks(fiveths), maxSelect: 1, afterAction: 'CHEER_DECK_REVEAL_MATCH_TO_MEMBER' },
      log: '最高の気分: 選擇 #5期生 成員',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP04-086 art2「ギラギラパワー」
  // REAL: 自己的存檔區每有1張吶喊卡，這個藝能傷害+20。最多支持5張。
  // ACTION: count archive cheers (cap 5) → +N*20
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP04-086', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art2') return { state, resolved: true };
    const own = state.players[ctx.player];
    const n = Math.min(5, own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.type === '吶喊').length);
    if (n === 0) return { state, resolved: true, log: 'ギラギラパワー: 存檔無吶喊' };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: n * 20, target: 'self', duration: 'instant' },
      log: `ギラギラパワー: 存檔 ${n} 吶喊 → +${n*20}`,
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-007 oshi/SP「スーパーねぽらぼエナジー」/「ねねちの大・暴・走！」
  // OSHI REAL: [每個回合一次]將自己存檔區的吶喊卡發送給自己標示#5期生的所有2nd成員，每人各1張。
  // SP REAL:   [每場比賽一次]從自己的牌組展示1~4張Debut成員「桃鈴ねね」並放到舞台上。將牌組重新洗牌。
  // ACTION: oshi → for each #5期生 2nd, attach 1 archive cheer (auto pick)
  //         SP → search 1-4 Debut ねね → place all to stage (multi-pick)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-007', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'reactive') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const matches = own.zones[ZONE.DECK].filter(c => {
        const card = getCard(c.cardId);
        return card?.bloom === 'Debut' && card.name === '桃鈴ねね';
      });
      if (matches.length === 0) {
        shuffleArr(own.zones[ZONE.DECK]);
        return { state, resolved: true, log: 'SP: 牌組無 Debut ねね — 重新洗牌' };
      }
      // Place ALL up to 4 — but engine SEARCH_SELECT_PLACE only picks 1 then
      // ORDER_TO_BOTTOM the rest. For 1-4 multi-place we'd need a custom
      // afterAction. For now place 1; remaining as ORDER (player picks max
      // 1 to place; rest fall through to MANUAL).
      // Actually let's just allow user to pick how many via maxSelect.
      // ENGINE doesn't support multi-place yet. Use SEARCH_SELECT (just hand)
      // and tell player to manually place via Manual Adjust.
      return { state }; // MANUAL — multi-place not in resolver
    }
    // oshi: send 1 archive cheer to each #5期生 2nd member
    const fiveth2nds = getStageMembers(own).filter(m => {
      return hasTag(m.inst, '#5期生') && getCard(m.inst.cardId)?.bloom === '2nd';
    });
    if (fiveth2nds.length === 0) return { state, resolved: true, log: 'oshi: 無 #5期生 2nd 成員' };
    let attached = 0;
    for (const t of fiveth2nds) {
      const idx = own.zones[ZONE.ARCHIVE].findIndex(c => getCard(c.cardId)?.type === '吶喊');
      if (idx < 0) break;
      const cheer = own.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
      cheer.faceDown = false;
      t.inst.attachedCheer = t.inst.attachedCheer || [];
      t.inst.attachedCheer.push(cheer);
      attached++;
    }
    return { state, resolved: true, log: `oshi: ${attached} 張存檔吶喊→ #5期生 2nd 成員` };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-077 effectC「あぱぱ」
  // REAL: 如果在自己後攻的第一個回合，從自己的牌組展示1張標示#5期生的2nd成員並加入手牌。
  // ACTION: back-attack 1st turn → search #5期生 2nd to hand
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-077', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const own = state.players[ctx.player];
    const isBackAttackFirst = state.firstTurn?.[ctx.player] && ctx.player !== state.firstPlayer;
    if (!isBackAttackFirst) return { state, resolved: true, log: 'あぱぱ: 非後攻第1回合' };
    const matches = own.zones[ZONE.DECK].filter(c => {
      const card = getCard(c.cardId);
      return card?.bloom === '2nd' && hasTag(c, '#5期生');
    });
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: 'あぱぱ: 牌組無 #5期生 2nd — 重新洗牌' };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SEARCH_SELECT', player: ctx.player,
        message: 'あぱぱ: 選擇 1 張 #5期生 2nd 加入手牌',
        cards: archivePicks(matches), maxSelect: 1, afterAction: 'ADD_TO_HAND' },
      log: 'あぱぱ: 搜尋',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-078 effectC「君もこっちにおいで～！」
  // REAL: 查看自己牌組上方的5張牌。展示1張「ねっ子」並加入手牌。
  //       其餘依照喜歡的順序放回牌組下方。
  // ACTION: top 5 reveal → pick ねっ子 → others to bottom
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-078', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const own = state.players[ctx.player];
    const top5 = own.zones[ZONE.DECK].slice(0, Math.min(5, own.zones[ZONE.DECK].length));
    if (top5.length === 0) return { state, resolved: true, log: '牌組空' };
    const matches = top5.filter(c => getCard(c.cardId)?.name === 'ねっ子');
    if (matches.length === 0) {
      return {
        state, resolved: false,
        prompt: { type: 'ORDER_TO_BOTTOM', player: ctx.player,
          message: '君もこっちにおいで: 頂 5 張無「ねっ子」 — 選擇放回牌底順序',
          cards: archivePicks(top5) },
        log: '君もこっちにおいで: 頂 5 張無 ねっ子',
      };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SEARCH_SELECT', player: ctx.player,
        message: '君もこっちにおいで: 選擇 1 張「ねっ子」加入手牌',
        cards: archivePicks(matches), maxSelect: 1, afterAction: 'ADD_TO_HAND',
        remainingCards: archivePicks(top5), noShuffle: true },
      log: '君もこっちにおいで: 選擇 ねっ子',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-079 effectB / art1
  // EFFECTB REAL: 可以將自己存檔區的1張吶喊卡發送給這個成員。
  // ART1 REAL:    從自己的牌組展示1張「やめなー」，附加給自己的成員。將牌組重新洗牌。
  // ACTION: effectB → optional pick archive cheer → self (uses existing
  //         CHEER_FROM_ARCHIVE_TO_MEMBER); art1 → search 「やめなー」, attach
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-079', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    const own = state.players[ctx.player];
    const cheers = own.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.type === '吶喊');
    if (cheers.length === 0) return { state, resolved: true, log: 'ねねちライブ: 存檔無吶喊' };
    // Auto: send 1st cheer to self (only valid target is self per text)
    const idx = own.zones[ZONE.ARCHIVE].findIndex(c => c.instanceId === cheers[0].instanceId);
    const cheer = own.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
    cheer.faceDown = false;
    ctx.memberInst.attachedCheer = ctx.memberInst.attachedCheer || [];
    ctx.memberInst.attachedCheer.push(cheer);
    return { state, resolved: true, log: `ねねちライブ: ${getCard(cheer.cardId)?.color||'?'} 吶喊→自身` };
  });
  reg('hBP07-079', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const own = state.players[ctx.player];
    const matches = own.zones[ZONE.DECK].filter(c => getCard(c.cardId)?.name === 'やめなー');
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: 'ご自由に: 牌組無やめなー — 重新洗牌' };
    }
    const stage = getStageMembers(own);
    if (stage.length === 0) return { state, resolved: true, log: 'ご自由に: 舞台空' };
    if (stage.length === 1 && matches.length === 1) {
      const idx = own.zones[ZONE.DECK].findIndex(c => c.instanceId === matches[0].instanceId);
      const card = own.zones[ZONE.DECK].splice(idx, 1)[0];
      card.faceDown = false;
      stage[0].inst.attachedSupport = stage[0].inst.attachedSupport || [];
      stage[0].inst.attachedSupport.push(card);
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: 'ご自由に: やめなー附加' };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SEARCH_SELECT', player: ctx.player,
        message: 'ご自由に: 選擇 1 張「やめなー」附加給成員（先選やめなー再選成員 — 多步請手動）',
        cards: archivePicks(matches), maxSelect: 1, afterAction: 'ATTACH_SUPPORT',
        targetInstanceId: stage[0].inst.instanceId },
      log: 'ご自由に: 選擇 やめなー',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-080 effectG「オレンジアイドル！」
  // REAL: [每個回合一次]如果自己的主推為「桃鈴ねね」，自己的主要階段可以使用：
  //       將自己存檔區的1張「ねっ子」附加給這個成員。
  // ACTION: passive — player invokes manually; 1/turn
  // → MANUAL (player invokes via main-phase hint)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-080', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => {
    if (ctx.triggerEvent !== 'main_phase_start') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (getCard(own.oshi?.cardId)?.name !== '桃鈴ねね') return { state, resolved: true };
    if (own._oncePerTurn?.['hBP07-080']) return { state, resolved: true };
    const hasNekko = own.zones[ZONE.ARCHIVE].some(c => getCard(c.cardId)?.name === 'ねっ子');
    if (!hasNekko) return { state, resolved: true };
    return { state, resolved: true, log: 'オレンジアイドル: 主推ねね + 存檔有ねっ子 — 可手動觸發附加' };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-081 effectC / art1
  // EFFECTC REAL: 如果自己的holo能量區有4張以上，且對手沒有聯動成員，
  //               對手要將1位後台成員移動到聯動位置(這個移動不視為聯動)。
  // ART1 REAL:    如果這個成員帶有「ギラファノコギリクワガタ」，則這個藝能給予對手的中心成員與聯動成員藝能傷害。
  // ACTION: effectC → opp forced move (engine doesn't support — MANUAL)
  //         art1 → if has Stag Beetle, art hits both center + collab
  // → effectC MANUAL; art1 needs damage-multi-target which is engine-specific → MANUAL
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-081', HOOK.ON_COLLAB, (state, ctx) => ({ state })); // MANUAL
  reg('hBP07-081', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    return { state }; // MANUAL — needs multi-target art rule mod
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-082 effectC「ねぽらぼが最強です！！」
  // REAL: 從自己的牌組展示1張標示#5期生的2nd成員並加入手牌。將牌組重新洗牌。
  // ACTION: search #5期生 2nd → hand
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-082', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
    const own = state.players[ctx.player];
    const matches = own.zones[ZONE.DECK].filter(c => {
      const card = getCard(c.cardId);
      return card?.bloom === '2nd' && hasTag(c, '#5期生');
    });
    if (matches.length === 0) {
      shuffleArr(own.zones[ZONE.DECK]);
      return { state, resolved: true, log: 'ねぽらぼ最強: 牌組無 #5期生 2nd — 重新洗牌' };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SEARCH_SELECT', player: ctx.player,
        message: 'ねぽらぼ最強: 選擇 1 張 #5期生 2nd 加入手牌',
        cards: archivePicks(matches), maxSelect: 1, afterAction: 'ADD_TO_HAND' },
      log: 'ねぽらぼ最強: 搜尋',
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // hBP07-083 effectB / art1
  // EFFECTB REAL: [限定中心位置]直到下個對手回合結束，雙方舞台上的所有成員藝能傷害+40。
  //               自己舞台上的所有2nd成員「桃鈴ねね」藝能傷害再+60。
  // ART1 REAL:    將對手中心成員或聯動成員的1張吶喊卡放回吶喊牌組下方。
  // ACTION: effectB global +40 (both sides!) + per-2nd-ねね +60 → state-level
  //         art1 pick opp center/collab → remove 1 cheer to their cheer-deck bottom
  // → effectB needs new state field for "global art boost both sides until X"
  // → art1 MANUAL (custom afterAction needed for cheer-to-cheer-deck)
  // ─────────────────────────────────────────────────────────────────────
  reg('hBP07-083', HOOK.ON_BLOOM, (state, ctx) => {
    if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
    return { state }; // MANUAL — cross-side global modifier not yet supported
  });
  reg('hBP07-083', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    return { state }; // MANUAL
  });

  return count;
}
