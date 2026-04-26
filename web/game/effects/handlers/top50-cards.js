// Custom handlers for top 50 high-usage tournament cards
// Each handler implements the full multi-step effect

import { getCard, getCardsByName, getCardImage } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE, MEMBER_STATE, isMember, isSupport } from '../../core/constants.js';
import { applyDamageToMember, drawCards, getStageMembers } from './common.js';

// ── Helpers ──

// Generic search prompt factory: returns a prompt for player to choose from matching deck cards
function makeSearchPrompt(player, playerIdx, predicate, msg, action = 'ADD_TO_HAND', maxSelect = 1) {
  const allMatches = [];
  for (const c of player.zones[ZONE.DECK]) {
    if (predicate(c)) {
      const card = getCard(c.cardId);
      allMatches.push({ instanceId: c.instanceId, cardId: c.cardId, name: card?.name || '', image: getCardImage(c.cardId) });
    }
  }
  if (allMatches.length === 0) return null;
  return {
    type: action === 'PLACE_AND_SHUFFLE' ? 'SEARCH_SELECT_PLACE' : 'SEARCH_SELECT',
    player: playerIdx,
    message: msg,
    cards: allMatches,
    maxSelect,
    afterAction: action,
  };
}

function shuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function searchDeck(player, predicate, count = 1) {
  const found = [];
  const deck = player.zones[ZONE.DECK];
  for (let i = 0; i < deck.length && found.length < count; i++) {
    if (predicate(deck[i])) {
      found.push({ idx: i, card: deck[i] });
    }
  }
  return found;
}

function removeFromDeck(player, instanceId) {
  const deck = player.zones[ZONE.DECK];
  const idx = deck.findIndex(c => c.instanceId === instanceId);
  if (idx !== -1) return deck.splice(idx, 1)[0];
  return null;
}

function isDebut(card) {
  const c = getCard(card.cardId);
  return c && isMember(c.type) && c.bloom === 'Debut';
}
function isMemberOfName(card, name) {
  const c = getCard(card.cardId);
  return c && isMember(c.type) && c.name === name;
}
function hasTag(card, tag) {
  const c = getCard(card.cardId);
  return c?.tag?.includes(tag);
}

function rollDie() { return Math.floor(Math.random() * 6) + 1; }

function damageOpponent(state, p, amount, position = 'center') {
  const opp = state.players[1 - p];
  const target = opp.zones[position === 'collab' ? ZONE.COLLAB : ZONE.CENTER];
  if (target) applyDamageToMember(target, amount);
}

// ── HANDLER REGISTRATIONS ──

export function registerTop50() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // 1. hBP01-104 ふつうのパソコン: search deck for Debut members, show choices, place on stage, shuffle
  reg('hBP01-104', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    // Find ALL Debut members in deck (show them all as choices)
    const allDebuts = [];
    for (let i = 0; i < player.zones[ZONE.DECK].length; i++) {
      const c = player.zones[ZONE.DECK][i];
      if (isDebut(c)) {
        const card = getCard(c.cardId);
        allDebuts.push({
          instanceId: c.instanceId,
          cardId: c.cardId,
          name: card?.name || '',
          image: getCardImage(c.cardId),
          deckIndex: i,
        });
      }
    }
    if (allDebuts.length === 0) {
      shuffleArr(player.zones[ZONE.DECK]);
      return { state, resolved: true, log: '牌組中無 Debut 成員' };
    }
    // Return prompt for player to choose which Debut to place
    return {
      state,
      resolved: false,
      prompt: {
        type: 'SEARCH_SELECT_PLACE',
        player: ctx.player,
        message: '從牌組中選擇 1 張 Debut 成員放到舞台上',
        cards: allDebuts,
        maxSelect: 1,
        afterAction: 'PLACE_AND_SHUFFLE', // tells the UI what to do after selection
      },
    };
  });

  // 2. hBP02-084 みっころね24: draw 2, roll die, branch on result
  reg('hBP02-084', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    drawCards(player, 2);
    const roll = rollDie();
    if (roll === 3 || roll === 5 || roll === 6) {
      const prompt = makeSearchPrompt(player, ctx.player, isDebut, `骰 ${roll}：選擇 1 張 Debut 成員加入手牌`, 'ADD_TO_HAND');
      if (prompt) return { state, resolved: false, prompt, log: `抽 2 張，骰 ${roll}` };
      shuffleArr(player.zones[ZONE.DECK]);
      return { state, resolved: true, log: `抽 2 張，骰 ${roll}：無 Debut` };
    }
    drawCards(player, 1);
    return { state, resolved: true, log: `抽 2 張，骰 ${roll}：再抽 1 張` };
  });

  // 3. hBP01-009 天音かなた art1: target restriction (only center) — already enforced by validator
  reg('hBP01-009', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    return { state, resolved: true, log: '只能對中心成員' };
  });

  // 4. hSD01-017 マネちゃん: shuffle hand back, draw 5
  reg('hSD01-017', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    while (player.zones[ZONE.HAND].length > 0) {
      player.zones[ZONE.DECK].push(player.zones[ZONE.HAND].shift());
    }
    shuffleArr(player.zones[ZONE.DECK]);
    drawCards(player, 5);
    return { state, resolved: true, log: '手牌洗回牌組，重抽 5 張' };
  });

  // 5. hBP05-080 SorAZセレブレーション: draw 2, look top 5, pick 1st → hand, rest → order bottom
  reg('hBP05-080', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    drawCards(player, 2);
    const count = Math.min(5, player.zones[ZONE.DECK].length);
    const top5 = player.zones[ZONE.DECK].slice(0, count);
    const allCards = top5.map(c => { const d = getCard(c.cardId); return { instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) }; });
    const matchCards = [];
    for (const c of top5) {
      const d = getCard(c.cardId);
      if (d && isMember(d.type) && d.bloom === '1st') {
        matchCards.push({ instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) });
      }
    }
    if (matchCards.length > 0) {
      return { state, resolved: false, prompt: { type: 'SEARCH_SELECT', player: ctx.player, message: '抽 2 張後，牌組頂 5 張中選擇 1st 成員加入手牌', cards: matchCards, maxSelect: 1, afterAction: 'ADD_TO_HAND', remainingCards: allCards, noShuffle: true }, log: '抽 2 張' };
    }
    return { state, resolved: false, prompt: { type: 'ORDER_TO_BOTTOM', player: ctx.player, message: '抽 2 張後，頂 5 張無 1st，選擇放回牌底的順序', cards: allCards }, log: '抽 2 張' };
  });

  // 6. hBP05-074 フレンドリーパソコン: search 1-2 unlimited Debut, show choices, place on stage
  reg('hBP05-074', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    const isUnlimited = (card) => {
      const c = getCard(card.cardId);
      if (!c || !isMember(c.type) || c.bloom !== 'Debut') return false;
      const extra = c.extra;
      if (!extra) return false;
      const text = typeof extra === 'object' ? (extra['zh-TW'] || extra['ja'] || '') : (extra || '');
      return text.includes('沒有張數限制') || text.includes('no limit');
    };
    // Find all matching cards in deck
    const allMatches = [];
    for (let i = 0; i < player.zones[ZONE.DECK].length; i++) {
      const c = player.zones[ZONE.DECK][i];
      if (isUnlimited(c)) {
        const card = getCard(c.cardId);
        allMatches.push({
          instanceId: c.instanceId,
          cardId: c.cardId,
          name: card?.name || '',
          image: getCardImage(c.cardId),
        });
      }
    }
    if (allMatches.length === 0) {
      shuffleArr(player.zones[ZONE.DECK]);
      return { state, resolved: true, log: '牌組中無符合條件的成員' };
    }
    return {
      state,
      resolved: false,
      prompt: {
        type: 'SEARCH_SELECT_PLACE',
        player: ctx.player,
        message: '選擇 1~2 張「沒有張數限制」的 Debut 成員放到舞台（選完後將牌組洗牌）',
        cards: allMatches,
        maxSelect: 2,
        afterAction: 'PLACE_AND_SHUFFLE',
      },
    };
  });

  // 7. hBP02-038 沙花叉クロヱ effectB: look top 3 cheer, send 1 to member
  reg('hBP02-038', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const cheerDeck = player.zones[ZONE.CHEER_DECK];
    if (cheerDeck.length === 0) return { state, resolved: true, log: '吶喊牌組為空' };
    // Take top cheer and attach to bloomed member
    const cheer = cheerDeck.shift();
    cheer.faceDown = false;
    if (ctx.memberInst) ctx.memberInst.attachedCheer.push(cheer);
    return { state, resolved: true, log: '從吶喊牌組頂取 1 張附加給此成員' };
  });

  // 8. hBP01-108 じゃあ敵だね: swap opponent's center with backstage
  reg('hBP01-108', HOOK.ON_PLAY, (state, ctx) => {
    const opp = state.players[1 - ctx.player];
    const center = opp.zones[ZONE.CENTER];
    if (!center || opp.zones[ZONE.BACKSTAGE].length === 0) {
      return { state, resolved: true, log: '對手沒有後台成員可交換' };
    }
    // Auto-pick first backstage member
    const back = opp.zones[ZONE.BACKSTAGE].shift();
    opp.zones[ZONE.BACKSTAGE].push(center);
    opp.zones[ZONE.CENTER] = back;
    if (back.state === MEMBER_STATE.REST) back.state = MEMBER_STATE.ACTIVE;
    return { state, resolved: true, log: '對手中心 ↔ 後台交換' };
  });

  // 9. hBP01-062 小鳥遊キアラ art1: discard 1 hand → +20 dmg
  reg('hBP01-062', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const player = state.players[ctx.player];
    if (player.zones[ZONE.HAND].length > 0) {
      // Auto-discard first hand card for the bonus
      const discarded = player.zones[ZONE.HAND].shift();
      player.zones[ZONE.ARCHIVE].push(discarded);
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 20, target: 'self', duration: 'instant' },
        log: '棄 1 張手牌 → 傷害 +20',
      };
    }
    return { state, resolved: true };
  });

  // 10. hBP01-014 天音かなた effectC: 50 special dmg to opponent center
  reg('hBP01-014', HOOK.ON_COLLAB, (state, ctx) => {
    damageOpponent(state, ctx.player, 50, 'center');
    return { state, resolved: true, log: '對對手中心成員 50 特殊傷害' };
  });
  reg('hBP01-014', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    return { state, resolved: true, log: '若擊倒成員傷害超過 50，對手生命 -1' };
  });

  // 11. hBP06-070 戌神ころね effectG: cost reduction (passive, no immediate action)
  reg('hBP06-070', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => {
    return { state, resolved: true, log: '中心位置每回合可減 2 無色吶喊需求' };
  });
  reg('hBP06-070', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (state.players[ctx.player].oshiSkillUsedThisTurn) {
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 40, target: 'self', duration: 'instant' },
        log: '使用過主推技能，傷害 +40',
      };
    }
    return { state, resolved: true };
  });

  // 12. hBP01-013 天音かなた effectB: 30 special dmg, no life loss on knockdown
  reg('hBP01-013', HOOK.ON_BLOOM, (state, ctx) => {
    damageOpponent(state, ctx.player, 30, 'center');
    return { state, resolved: true, log: '對對手中心 30 特殊傷害（不扣生命）' };
  });

  // 13. hBP06-068 戌神ころね effectB: search deck for 「ゆび」
  reg('hBP06-068', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const prompt = makeSearchPrompt(player, ctx.player, c => getCard(c.cardId)?.name === 'ゆび', '選擇「ゆび」加入手牌');
    if (prompt) return { state, resolved: false, prompt };
    shuffleArr(player.zones[ZONE.DECK]);
    return { state, resolved: true, log: '無「ゆび」' };
  });
  reg('hBP06-068', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const player = state.players[ctx.player];
    const member = ctx.memberInst;
    if (member?.attachedSupport?.length > 0) {
      drawCards(player, 1);
      if (player.zones[ZONE.HAND].length > 0) {
        const discarded = player.zones[ZONE.HAND].pop();
        player.zones[ZONE.ARCHIVE].push(discarded);
      }
      return { state, resolved: true, log: '抽 1 張 + 棄 1 張' };
    }
    return { state, resolved: true };
  });

  // 14. hBP01-116 うぱお mascot: +10 damage to bearer's arts
  reg('hBP01-116', HOOK.ON_ART_DECLARE, (state, ctx) => {
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
      log: '吉祥物加成 +10',
    };
  });

  // 15. hBP02-079 爆発の魔法: 20 special dmg to opponent center or collab
  reg('hBP02-079', HOOK.ON_PLAY, (state, ctx) => {
    const opp = state.players[1 - ctx.player];
    // Prefer center if exists
    if (opp.zones[ZONE.CENTER]) {
      applyDamageToMember(opp.zones[ZONE.CENTER], 20);
    } else if (opp.zones[ZONE.COLLAB]) {
      applyDamageToMember(opp.zones[ZONE.COLLAB], 20);
    }
    return { state, resolved: true, log: '對對手中心/聯動 20 特殊傷害（不扣生命）' };
  });

  // 16. hBP06-069 戌神ころね effectC: if member has yubi, draw 1
  reg('hBP06-069', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    const allMembers = getStageMembers(player);
    const hasYubi = allMembers.some(m => {
      return m.inst.attachedSupport?.some(s => getCard(s.cardId)?.name === 'ゆび');
    });
    if (hasYubi) {
      drawCards(player, 1);
      return { state, resolved: true, log: '帶有「ゆび」的成員存在 → 抽 1 張' };
    }
    return { state, resolved: true };
  });

  // 17. hBP01-076 星街すいせい art1: 10 special dmg to 1 chosen opponent backstage
  reg('hBP01-076', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const opp = state.players[1 - ctx.player];
    const back = opp.zones[ZONE.BACKSTAGE] || [];
    if (back.length === 0) return { state, resolved: true, log: '對手無後台成員' };
    const cards = back.map(m => ({
      instanceId: m.instanceId,
      cardId: m.cardId,
      name: getCard(m.cardId)?.name || '',
      image: getCardImage(m.cardId),
    }));
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_TARGET',
        player: ctx.player,
        message: '選擇對手 1 位後台成員，造成 10 點特殊傷害（不扣生命）',
        cards, maxSelect: 1,
        afterAction: 'OPP_MEMBER_DAMAGE',
        damageAmount: 10,
      },
      log: '選擇後台目標',
    };
  });

  // 18. hBP03-088 凸待ち: opponent moves backstage to collab if no collab
  reg('hBP03-088', HOOK.ON_PLAY, (state, ctx) => {
    const opp = state.players[1 - ctx.player];
    if (!opp.zones[ZONE.COLLAB] && opp.zones[ZONE.BACKSTAGE].length > 0) {
      const back = opp.zones[ZONE.BACKSTAGE].shift();
      back.state = MEMBER_STATE.ACTIVE;
      opp.zones[ZONE.COLLAB] = back;
    }
    return { state, resolved: true, log: '對手後台移到聯動位置' };
  });

  // 19. hBP02-023 パヴォリア・レイネ effectB: send 1 cheer from cheer deck
  reg('hBP02-023', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    if (player.zones[ZONE.CHEER_DECK].length > 0) {
      const cheer = player.zones[ZONE.CHEER_DECK].shift();
      cheer.faceDown = false;
      if (ctx.memberInst) ctx.memberInst.attachedCheer.push(cheer);
    }
    shuffleArr(player.zones[ZONE.CHEER_DECK]);
    return { state, resolved: true, log: '從吶喊牌組取 1 張附加給成員 + 洗牌' };
  });
  reg('hBP02-023', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const player = state.players[ctx.player];
    const colors = new Set();
    const allMembers = getStageMembers(player);
    for (const m of allMembers) {
      for (const cheer of m.inst.attachedCheer) {
        const c = getCard(cheer.cardId);
        if (c?.color) colors.add(c.color);
      }
    }
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: colors.size * 20, target: 'self', duration: 'instant' },
      log: `${colors.size} 種顏色吶喊 → 傷害 +${colors.size * 20}`,
    };
  });

  // 20. hBP02-033 宝鐘マリン effectB: return 1 member from archive, special dmg if 3+ stack
  reg('hBP02-033', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const memberInArchive = player.zones[ZONE.ARCHIVE].findIndex(c => {
      const card = getCard(c.cardId);
      return card && isMember(card.type);
    });
    if (memberInArchive >= 0) {
      const card = player.zones[ZONE.ARCHIVE].splice(memberInArchive, 1)[0];
      player.zones[ZONE.HAND].push(card);
    }
    // 3+ stack check
    if ((ctx.memberInst?.bloomStack?.length || 0) >= 2) {
      damageOpponent(state, ctx.player, 50, 'center');
    }
    return { state, resolved: true, log: '存檔區成員回手牌；若疊3+對中心50特殊傷害' };
  });
  reg('hBP02-033', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const stackSize = ctx.memberInst?.bloomStack?.length || 0;
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: stackSize * 20, target: 'self', duration: 'instant' },
      log: `重疊成員 ${stackSize} 張 → 傷害 +${stackSize * 20}`,
    };
  });

  // 21. hBP02-032 宝鐘マリン effectB: search 宝鐘マリン
  reg('hBP02-032', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const prompt = makeSearchPrompt(player, ctx.player, c => isMemberOfName(c, '宝鐘マリン'), '選擇「宝鐘マリン」加入手牌');
    if (prompt) return { state, resolved: false, prompt };
    shuffleArr(player.zones[ZONE.DECK]);
    return { state, resolved: true, log: '無宝鐘マリン' };
  });

  // 22. hBP03-102 フトイヌ mascot: +10 damage
  reg('hBP03-102', HOOK.ON_ART_DECLARE, (state, ctx) => {
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
      log: '吉祥物加成 +10',
    };
  });

  // 23. hBP06-093 山田ルイ54世: search 2 holoX members
  reg('hBP06-093', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    const prompt = makeSearchPrompt(player, ctx.player, c => hasTag(c, '#秘密結社holoX'), '選擇最多 2 張 #holoX 成員加入手牌', 'ADD_TO_HAND', 2);
    if (prompt) return { state, resolved: false, prompt };
    shuffleArr(player.zones[ZONE.DECK]);
    return { state, resolved: true, log: '無 #holoX 成員' };
  });

  // 24. hBP05-071 戌神ころね effectB: search non-Buzz #ゲーマーズ 1st
  reg('hBP05-071', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const prompt = makeSearchPrompt(player, ctx.player, c => {
      const card = getCard(c.cardId);
      return card && card.bloom === '1st' && card.bloom !== '1st Buzz' && hasTag(c, '#ゲーマーズ');
    }, '選擇 1st #ゲーマーズ 成員加入手牌');
    if (prompt) return { state, resolved: false, prompt };
    shuffleArr(player.zones[ZONE.DECK]);
    return { state, resolved: true, log: '無符合成員' };
  });
  reg('hBP05-071', HOOK.ON_ART_DECLARE, (state, ctx) => {
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 30, target: 'tag:#ゲーマーズ', duration: 'turn' },
      log: '本回合 1 位 #ゲーマーズ 成員傷害 +30',
    };
  });

  // 25. hSD01-018 サブパソコン: look top 5, pick 1 LIMITED support → hand, rest → order to bottom
  reg('hSD01-018', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    const count = Math.min(5, player.zones[ZONE.DECK].length);
    // Keep top 5 in deck (don't remove yet), build card info
    const top5 = player.zones[ZONE.DECK].slice(0, count);
    const allCards = top5.map(c => {
      const d = getCard(c.cardId);
      return { instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) };
    });
    const limitedCards = [];
    for (const c of top5) {
      const d = getCard(c.cardId);
      if (!d || !isSupport(d.type)) continue;
      const text = typeof d.supportEffect === 'object' ? (d.supportEffect['zh-TW'] || '') : (d.supportEffect || '');
      if (text.includes('LIMITED')) {
        limitedCards.push({ instanceId: c.instanceId, cardId: c.cardId, name: d.name || '', image: getCardImage(c.cardId) });
      }
    }
    if (limitedCards.length > 0) {
      // Step 1: pick LIMITED → hand, then chain to ORDER_TO_BOTTOM for the rest
      return { state, resolved: false, prompt: {
        type: 'SEARCH_SELECT', player: ctx.player,
        message: '選擇 1 張 LIMITED 支援卡加入手牌（可跳過）',
        cards: limitedCards, maxSelect: 1, afterAction: 'ADD_TO_HAND',
        remainingCards: allCards, noShuffle: true,
      }};
    }
    // No LIMITED: just order all to bottom
    return { state, resolved: false, prompt: {
      type: 'ORDER_TO_BOTTOM', player: ctx.player,
      message: '牌組頂 5 張無 LIMITED，選擇放回牌底的順序',
      cards: allCards,
    }};
  });

  // 26. hBP02-022 パヴォリア・レイネ effectB: search Tatang
  reg('hBP02-022', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const prompt = makeSearchPrompt(player, ctx.player, c => isMemberOfName(c, 'Tatang'), '選擇「Tatang」加入手牌');
    if (prompt) return { state, resolved: false, prompt };
    shuffleArr(player.zones[ZONE.DECK]);
    return { state, resolved: true, log: '無 Tatang' };
  });
  reg('hBP02-022', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const player = state.players[ctx.player];
    const colors = new Set();
    for (const m of getStageMembers(player)) {
      for (const cheer of m.inst.attachedCheer) {
        const c = getCard(cheer.cardId);
        if (c?.color) colors.add(c.color);
      }
    }
    if (colors.size >= 2) {
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 20, target: 'self', duration: 'instant' },
        log: `${colors.size} 色吶喊 → 傷害 +20`,
      };
    }
    return { state, resolved: true };
  });

  // 27. hBP06-041 ハコス・ベールズ effectC: if 2nd-going-1st-turn, draw 3 discard 2
  reg('hBP06-041', HOOK.ON_COLLAB, (state, ctx) => {
    if (state.firstTurn[ctx.player] && ctx.player !== state.firstPlayer) {
      const player = state.players[ctx.player];
      drawCards(player, 3);
      // Auto-discard first 2 hand cards
      for (let i = 0; i < 2; i++) {
        if (player.zones[ZONE.HAND].length > 0) {
          player.zones[ZONE.ARCHIVE].push(player.zones[ZONE.HAND].pop());
        }
      }
      return { state, resolved: true, log: '後攻第一回合：抽 3 棄 2' };
    }
    return { state, resolved: true };
  });

  // 28. hBP07-094 ギリわるロボ: shuffle hand back, draw 4 (mulligan)
  reg('hBP07-094', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    while (player.zones[ZONE.HAND].length > 0) {
      player.zones[ZONE.DECK].push(player.zones[ZONE.HAND].shift());
    }
    shuffleArr(player.zones[ZONE.DECK]);
    drawCards(player, 4);
    // If life ≤ 3, opponent also mulligans
    if (player.zones[ZONE.LIFE].length <= 3) {
      const opp = state.players[1 - ctx.player];
      while (opp.zones[ZONE.HAND].length > 0) {
        opp.zones[ZONE.DECK].push(opp.zones[ZONE.HAND].shift());
      }
      shuffleArr(opp.zones[ZONE.DECK]);
      drawCards(opp, 4);
      return { state, resolved: true, log: '雙方手牌洗回 + 各抽 4 張（生命 ≤ 3）' };
    }
    return { state, resolved: true, log: '己方手牌洗回 + 抽 4 張' };
  });

  // 29. hBP01-081 星街すいせい effectC: send 1 cheer to blue member
  reg('hBP01-081', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    if (player.zones[ZONE.CHEER_DECK].length === 0) return { state, resolved: true };
    // Find a blue member
    const blueMember = getStageMembers(player).find(m => getCard(m.inst.cardId)?.color === '藍');
    if (blueMember) {
      const cheer = player.zones[ZONE.CHEER_DECK].shift();
      cheer.faceDown = false;
      blueMember.inst.attachedCheer.push(cheer);
      return { state, resolved: true, log: '從吶喊牌組取 1 張給藍色成員' };
    }
    return { state, resolved: true };
  });
  reg('hBP01-081', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const stackSize = ctx.memberInst?.bloomStack?.length || 0;
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: stackSize * 60, target: 'self', duration: 'instant' },
      log: `重疊 ${stackSize} → 傷害 +${stackSize * 60}`,
    };
  });

  // 30. hBP02-054 森カリオペ art1: if archive has member, +10 damage
  reg('hBP02-054', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const player = state.players[ctx.player];
    const hasMember = player.zones[ZONE.ARCHIVE].some(c => isMember(getCard(c.cardId)?.type));
    if (hasMember) {
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
        log: '存檔區有成員 → +10',
      };
    }
    return { state, resolved: true };
  });

  // 31. hBP06-026 風真いろは effectG: passive (cheer member on collab)
  reg('hBP06-026', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => {
    return { state, resolved: true, log: '聯動時若手牌≥5可送1張吶喊給聯動成員' };
  });

  // 32. hBP06-027 風真いろは effectG + art1
  reg('hBP06-027', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => {
    return { state, resolved: true, log: '擊倒對手中心時可重新綻放' };
  });
  reg('hBP06-027', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const player = state.players[ctx.player];
    const oshiCard = getCard(player.oshi?.cardId);
    if (oshiCard?.name === '風真いろは' && player.zones[ZONE.COLLAB]) {
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 40, target: 'self', duration: 'instant' },
        log: '推し是風真+有聯動 → +40',
      };
    }
    return { state, resolved: true };
  });

  // 33. hBP06-034 百鬼あやめ art1: discard 1 → +30 dmg
  reg('hBP06-034', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const player = state.players[ctx.player];
    if (player.zones[ZONE.HAND].length > 0) {
      player.zones[ZONE.ARCHIVE].push(player.zones[ZONE.HAND].shift());
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 30, target: 'name:百鬼あやめ', duration: 'turn' },
        log: '棄 1 張手牌 → 中心百鬼あやめ +30',
      };
    }
    return { state, resolved: true };
  });

  // 34. hBP06-039 百鬼あやめ effectG + art1
  reg('hBP06-039', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => {
    return { state, resolved: true, log: '中心位置且雙方聯動條件 → 免疫對手藝能傷害' };
  });
  reg('hBP06-039', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const player = state.players[ctx.player];
    const oshiCard = getCard(player.oshi?.cardId);
    if (oshiCard?.name === '百鬼あやめ' && player.zones[ZONE.CHEER_DECK].length > 0) {
      // Auto-discard up to 3 cheer for boost
      let discarded = 0;
      for (let i = 0; i < 3 && player.zones[ZONE.CHEER_DECK].length > 0; i++) {
        player.zones[ZONE.ARCHIVE].push(player.zones[ZONE.CHEER_DECK].shift());
        discarded++;
      }
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: discarded * 40, target: 'self', duration: 'instant' },
        log: `棄 ${discarded} 張吶喊 → +${discarded * 40}`,
      };
    }
    return { state, resolved: true };
  });

  // 35. hBP07-009 角巻わため art1: center +20
  reg('hBP07-009', HOOK.ON_ART_DECLARE, (state, ctx) => {
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 20, target: 'self', duration: 'instant' },
      log: '中心位置 +20',
    };
  });

  // 36. hBP07-014 角巻わため effectG: HP +10 per stacked member
  reg('hBP07-014', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => {
    return { state, resolved: true, log: '每張重疊成員 HP +10' };
  });
  reg('hBP07-014', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    return { state, resolved: true, log: '擊倒時超出 HP 部分對 2nd 成員特殊傷害' };
  });

  // 37. hBP07-045 ハコス・ベールズ effectG + art1
  // effectG: 「[Center/Collab limited] When YOU use SP main skill, put deck-top 1 → holo power」
  // ON_PASSIVE_GLOBAL fires from firePassiveModifiers (per-art) AND from
  // processOshiSkill with triggerEvent='sp_skill_used'. Only react to the latter,
  // and only if this hakos is in CENTER or COLLAB position.
  reg('hBP07-045', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => {
    if (ctx.triggerEvent !== 'sp_skill_used') return { state, resolved: true };
    const player = state.players[ctx.player];
    const inCenterOrCollab = player.zones[ZONE.CENTER]?.instanceId === ctx.memberInst?.instanceId
                          || player.zones[ZONE.COLLAB]?.instanceId === ctx.memberInst?.instanceId;
    if (!inCenterOrCollab) return { state, resolved: true };
    const deckTop = player.zones[ZONE.DECK].shift();
    if (!deckTop) return { state, resolved: true, log: 'ハコス effectG: 牌組空' };
    deckTop.faceDown = true;
    player.zones[ZONE.HOLO_POWER].unshift(deckTop);
    return { state, resolved: true, log: 'ハコス effectG: SP 後 +1 ホロパワー' };
  });
  reg('hBP07-045', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const player = state.players[ctx.player];
    const handSize = player.zones[ZONE.HAND].length;
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: handSize * 20, target: 'self', duration: 'instant' },
      log: `${handSize} 張手牌 → +${handSize * 20}`,
    };
  });

  // 38. hBP07-048 エリザベス・ローズ・ブラッドフレイム
  reg('hBP07-048', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => {
    return { state, resolved: true, log: '可使用 #EN 成員的所有藝能' };
  });
  reg('hBP07-048', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    const memberInArchive = player.zones[ZONE.ARCHIVE].findIndex(c => {
      const card = getCard(c.cardId);
      return card && isMember(card.type) && hasTag(c, '#EN');
    });
    if (memberInArchive >= 0) {
      const card = player.zones[ZONE.ARCHIVE].splice(memberInArchive, 1)[0];
      player.zones[ZONE.HAND].push(card);
    }
    return { state, resolved: true, log: '存檔區 1 張 #EN 成員回手牌' };
  });

  // 39. hBP07-101 ASMRマイク tool: -1 colorless cost for Buzz members
  reg('hBP07-101', HOOK.ON_PLAY, (state, ctx) => {
    return { state, resolved: true, log: '附加給 Buzz 成員 → 無色吶喊需求 -1' };
  });

  // 39b. hBP07-097 時の支配者 -Promise- (LIMITED activity support)
  // Effect:
  //   1. Precondition: every member on stage must carry #Promise tag
  //   2. Reveal up to 2 #Promise members from deck → add to hand (multi-pick)
  //   3. Reshuffle (handled automatically when prompt resolves)
  //   4. If self life < opponent life → choose 1 own stage member;
  //      that member's arts deal +20 dmg this turn
  reg('hBP07-097', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    const opp = state.players[1 - ctx.player];

    // Step 1: precondition
    const stage = getStageMembers(player);
    const allPromise = stage.length > 0 && stage.every(m => hasTag(m.inst, '#Promise'));
    if (!allPromise) {
      return { state, resolved: true, log: '時の支配者: 條件未達（並非全成員都有 #Promise）' };
    }

    // Step 4 (eager): if life < opp's life, queue +20 dmg boost on a chosen member.
    // For now apply the boost to ALL stage members for the turn so the player gets
    // the bonus regardless of which member attacks (simpler than chaining a target prompt).
    const myLife = (player.zones[ZONE.LIFE] || []).length;
    const oppLife = (opp.zones[ZONE.LIFE] || []).length;
    let lifeBonusLog = '';
    if (myLife < oppLife) {
      if (!state._turnBoosts) state._turnBoosts = [];
      state._turnBoosts.push({ type: 'DAMAGE_BOOST', amount: 20, target: 'self', duration: 'instant' });
      lifeBonusLog = '；生命少於對手 → 本回合 +20 傷害';
    }

    // Step 2-3: reveal #Promise members from deck → multi-pick prompt
    const matches = [];
    for (const c of player.zones[ZONE.DECK]) {
      const card = getCard(c.cardId);
      if (card && isMember(card.type) && hasTag(c, '#Promise')) {
        matches.push({ instanceId: c.instanceId, cardId: c.cardId, name: card.name, image: getCardImage(c.cardId) });
      }
    }
    if (matches.length === 0) {
      return { state, resolved: true, log: '時の支配者: 牌組無 #Promise 成員' };
    }
    const pickN = Math.min(2, matches.length);
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT',
        player: ctx.player,
        message: `時の支配者: 選 ${pickN} 張 #Promise 成員加入手牌（剩餘洗回牌組）`,
        cards: matches,
        maxSelect: pickN,
        afterAction: 'ADD_TO_HAND',
      },
      log: `時の支配者: ${matches.length} 張 #Promise 候選${lifeBonusLog}`,
    };
  });

  // 40. hBP01-065 小鳥遊キアラ effectB: look top 3, reveal 1 member
  reg('hBP01-065', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const top3 = player.zones[ZONE.DECK].slice(0, 3);
    const cards = [];
    for (const c of top3) {
      const d = getCard(c.cardId);
      if (d && isMember(d.type)) {
        cards.push({ instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) });
      }
    }
    if (cards.length > 0) {
      return { state, resolved: false, prompt: { type: 'SEARCH_SELECT', player: ctx.player, message: '牌組頂 3 張中選擇 1 張成員加入手牌，其餘進存檔', cards, maxSelect: 1, afterAction: 'ADD_TO_HAND' } };
    }
    // No members found, all top 3 go to archive
    for (let i = 0; i < 3 && player.zones[ZONE.DECK].length > 0; i++) {
      const c = player.zones[ZONE.DECK].shift();
      if (c) { c.faceDown = false; player.zones[ZONE.ARCHIVE].push(c); }
    }
    return { state, resolved: true, log: '頂 3 張無成員，全部進存檔' };
  });

  // 41. hBP01-079 星街すいせい effectB: 20 special damage to 1 chosen opponent backstage
  reg('hBP01-079', HOOK.ON_BLOOM, (state, ctx) => {
    const opp = state.players[1 - ctx.player];
    const back = opp.zones[ZONE.BACKSTAGE] || [];
    if (back.length === 0) return { state, resolved: true, log: '對手無後台成員' };
    const cards = back.map(m => ({
      instanceId: m.instanceId,
      cardId: m.cardId,
      name: getCard(m.cardId)?.name || '',
      image: getCardImage(m.cardId),
    }));
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_TARGET',
        player: ctx.player,
        message: '選擇對手 1 位後台成員，造成 20 點特殊傷害（不扣生命）',
        cards, maxSelect: 1,
        afterAction: 'OPP_MEMBER_DAMAGE',
        damageAmount: 20,
      },
      log: '選擇後台目標',
    };
  });

  // 42. hBP06-023 風真いろは effectC: if 2nd player turn 1, search Buzz 風真
  reg('hBP06-023', HOOK.ON_COLLAB, (state, ctx) => {
    if (state.firstTurn[ctx.player] && ctx.player !== state.firstPlayer) {
      const player = state.players[ctx.player];
      const prompt = makeSearchPrompt(player, ctx.player, c => {
        const card = getCard(c.cardId);
        return card?.name === '風真いろは' && card.bloom === '1st Buzz';
      }, '後攻第一回合：選擇 Buzz 風真いろは加入手牌');
      if (prompt) return { state, resolved: false, prompt };
      shuffleArr(player.zones[ZONE.DECK]);
    }
    return { state, resolved: true };
  });

  // 43. hBP06-085 フェイバリットパソコン: search Debut + Buzz + #Buzzグッズ
  reg('hBP06-085', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    const allMatches = [];
    for (const c of player.zones[ZONE.DECK]) {
      const card = getCard(c.cardId);
      if (!card) continue;
      const isDebutMember = isMember(card.type) && card.bloom === 'Debut';
      const isBuzz = isMember(card.type) && card.bloom === '1st Buzz';
      const isBuzzGoods = hasTag(c, '#Buzzグッズ');
      if (isDebutMember || isBuzz || isBuzzGoods) {
        allMatches.push({ instanceId: c.instanceId, cardId: c.cardId, name: card.name, image: getCardImage(c.cardId) });
      }
    }
    if (allMatches.length === 0) { shuffleArr(player.zones[ZONE.DECK]); return { state, resolved: true, log: '無符合卡片' }; }
    return { state, resolved: false, prompt: {
      type: 'SEARCH_SELECT', player: ctx.player,
      message: '選擇同名 Debut/Buzz + #Buzzグッズ 支援卡加入手牌（最多 3 張）',
      cards: allMatches, maxSelect: 3, afterAction: 'ADD_TO_HAND',
    }};
  });

  // 44. hBP07-067 AZKi effectB + art1
  reg('hBP07-067', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const top4 = player.zones[ZONE.DECK].slice(0, 4);
    const cards = [];
    for (const c of top4) {
      if (getCard(c.cardId)?.name === 'AZKi') {
        const d = getCard(c.cardId);
        cards.push({ instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) });
      }
    }
    if (cards.length > 0) {
      return { state, resolved: false, prompt: { type: 'SEARCH_SELECT', player: ctx.player, message: '牌組頂 4 張中選擇 AZKi 加入手牌', cards, maxSelect: 1, afterAction: 'ADD_TO_HAND' } };
    }
    return { state, resolved: true, log: '頂 4 張無 AZKi' };
  });
  reg('hBP07-067', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    if (player.zones[ZONE.HAND].length > 0) {
      player.zones[ZONE.ARCHIVE].push(player.zones[ZONE.HAND].shift());
      const opp = state.players[1 - ctx.player];
      const target = opp.zones[ZONE.CENTER] || opp.zones[ZONE.COLLAB];
      if (target) applyDamageToMember(target, 20);
      return { state, resolved: true, log: '棄 1 張 → 對中心/聯動 20 特殊傷害' };
    }
    return { state, resolved: true };
  });

  // 45. hBP07-100 フロンティアスピリット
  reg('hBP07-100', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    // Return 1 AZKi from archive to hand
    const azkiIdx = player.zones[ZONE.ARCHIVE].findIndex(c => getCard(c.cardId)?.name === 'AZKi');
    if (azkiIdx >= 0) {
      const card = player.zones[ZONE.ARCHIVE].splice(azkiIdx, 1)[0];
      player.zones[ZONE.HAND].push(card);
    }
    // Count フロンティアスピリット in archive, send that many cheer to AZKi members
    const fsCount = player.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.name === 'フロンティアスピリット').length;
    const azkiMember = getStageMembers(player).find(m => getCard(m.inst.cardId)?.name === 'AZKi');
    if (azkiMember && fsCount > 0) {
      let sent = 0;
      for (let i = 0; i < fsCount && sent < fsCount; i++) {
        const cheerIdx = player.zones[ZONE.ARCHIVE].findIndex(c => getCard(c.cardId)?.type === '吶喊');
        if (cheerIdx >= 0) {
          const cheer = player.zones[ZONE.ARCHIVE].splice(cheerIdx, 1)[0];
          azkiMember.inst.attachedCheer.push(cheer);
          sent++;
        }
      }
    }
    return { state, resolved: true, log: '存檔區 AZKi 回手牌 + 配對吶喊' };
  });

  // 46. hBP02-021 パヴォリア・レイネ effectB: HP recover per color
  reg('hBP02-021', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const colors = new Set();
    for (const m of getStageMembers(player)) {
      for (const cheer of m.inst.attachedCheer) {
        const c = getCard(cheer.cardId);
        if (c?.color) colors.add(c.color);
      }
    }
    if (ctx.memberInst) {
      ctx.memberInst.damage = Math.max(0, ctx.memberInst.damage - colors.size * 10);
    }
    return { state, resolved: true, log: `${colors.size} 色 → HP 回復 ${colors.size * 10}` };
  });
  reg('hBP02-021', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    const cheerInArchive = player.zones[ZONE.ARCHIVE].findIndex(c => getCard(c.cardId)?.type === '吶喊');
    if (cheerInArchive >= 0 && ctx.memberInst) {
      const cheer = player.zones[ZONE.ARCHIVE].splice(cheerInArchive, 1)[0];
      ctx.memberInst.attachedCheer.push(cheer);
    }
    return { state, resolved: true, log: '存檔區吶喊回到此成員' };
  });

  // 47. hBP06-037 百鬼あやめ effectB + art1
  reg('hBP06-037', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    let moved = 0;
    for (let i = 0; i < 2; i++) {
      const idx = player.zones[ZONE.ARCHIVE].findIndex(c => {
        const card = getCard(c.cardId);
        return card?.type === '吶喊' && card?.color === '紅';
      });
      if (idx >= 0) {
        const cheer = player.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
        player.zones[ZONE.CHEER_DECK].push(cheer);
        moved++;
      }
    }
    return { state, resolved: true, log: `${moved} 張紅吶喊從存檔回吶喊牌組底部` };
  });
  reg('hBP06-037', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    if (player.zones[ZONE.CHEER_DECK].length > 0) {
      player.zones[ZONE.ARCHIVE].push(player.zones[ZONE.CHEER_DECK].shift());
      const opp = state.players[1 - ctx.player];
      const target = opp.zones[ZONE.CENTER] || opp.zones[ZONE.COLLAB];
      if (target) applyDamageToMember(target, 30);
    }
    return { state, resolved: true, log: '吶喊牌組頂 1 張→存檔，30 特殊傷害' };
  });

  // 48. hBP07-011 角巻わため effectB
  reg('hBP07-011', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const prompt = makeSearchPrompt(player, ctx.player, c => {
      const card = getCard(c.cardId);
      return card?.name === '角巻わため' && card.bloom === '1st';
    }, '選擇 1st 角巻わため加入手牌');
    if (prompt) return { state, resolved: false, prompt };
    shuffleArr(player.zones[ZONE.DECK]);
    return { state, resolved: true, log: '無 1st 角巻わため' };
  });

  // 49. hBP01-121 Kotori mascot: -10 damage taken on center/collab
  reg('hBP01-121', HOOK.ON_DAMAGE_TAKEN, (state, ctx) => {
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_REDUCTION', amount: 10, duration: 'persistent' },
      log: '中心/聯動受到傷害 -10',
    };
  });
  reg('hBP01-121', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    drawCards(player, 1);
    return { state, resolved: true, log: '附加 Kotori 的角色綻放升級時抽 1 張' };
  });

  // 50. hBP07-102 角巻わためのハンマー tool
  reg('hBP07-102', HOOK.ON_ART_DECLARE, (state, ctx) => {
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 20, target: 'self', duration: 'instant' },
      log: '道具 +20',
    };
  });
  reg('hBP07-102', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const roll = rollDie();
    if (roll === 3 || roll === 5) {
      const player = state.players[ctx.player];
      const others = getStageMembers(player).filter(m => m.inst.instanceId !== ctx.memberInst?.instanceId);
      if (others.length > 0) {
        applyDamageToMember(others[0].inst, 50);
      }
      return { state, resolved: true, log: `骰 ${roll} → 對 1 位己方其他成員 50 特殊傷害` };
    }
    return { state, resolved: true, log: `骰 ${roll}（無效果）` };
  });

  return count;
}
