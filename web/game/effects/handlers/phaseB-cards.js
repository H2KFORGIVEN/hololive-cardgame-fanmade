// Phase B: Card-specific handlers for ranks 51-200 (122 cards)
// Each handler implements multi-step effect logic

import { getCard, getCardImage } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE, MEMBER_STATE, isMember, isSupport } from '../../core/constants.js';
import { applyDamageToMember, drawCards, getStageMembers } from './common.js';

// ── Helpers ──

function makeSearchPrompt(player, pIdx, pred, msg, action = 'ADD_TO_HAND', max = 1) {
  const m = [];
  for (const c of player.zones[ZONE.DECK]) {
    if (pred(c)) { const d = getCard(c.cardId); m.push({ instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) }); }
  }
  if (!m.length) return null;
  return { type: action === 'PLACE_AND_SHUFFLE' ? 'SEARCH_SELECT_PLACE' : 'SEARCH_SELECT', player: pIdx, message: msg, cards: m, maxSelect: max, afterAction: action };
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
  for (let i = 0; i < player.zones[ZONE.DECK].length && found.length < count; i++) {
    if (predicate(player.zones[ZONE.DECK][i])) found.push(i);
  }
  return found;
}
function pullFromDeck(player, indices) {
  const sorted = [...indices].sort((a, b) => b - a);
  const pulled = [];
  for (const i of sorted) pulled.push(player.zones[ZONE.DECK].splice(i, 1)[0]);
  return pulled;
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

function archiveFromHand(player, count = 1) {
  let archived = 0;
  while (archived < count && player.zones[ZONE.HAND].length > 0) {
    player.zones[ZONE.ARCHIVE].push(player.zones[ZONE.HAND].shift());
    archived++;
  }
  return archived;
}

function moveTopDeckToArchive(player, count = 1) {
  let moved = 0;
  while (moved < count && player.zones[ZONE.DECK].length > 0) {
    const c = player.zones[ZONE.DECK].shift();
    c.faceDown = false;
    player.zones[ZONE.ARCHIVE].push(c);
    moved++;
  }
  return moved;
}

function sendCheerFromDeckToMember(player, member) {
  if (!member || player.zones[ZONE.CHEER_DECK].length === 0) return false;
  const cheer = player.zones[ZONE.CHEER_DECK].shift();
  cheer.faceDown = false;
  member.attachedCheer.push(cheer);
  return true;
}

function findArchiveCheer(player, color = null) {
  return player.zones[ZONE.ARCHIVE].findIndex(c => {
    const card = getCard(c.cardId);
    if (card?.type !== '吶喊') return false;
    if (color && card.color !== color) return false;
    return true;
  });
}

function sendCheerFromArchiveToMember(player, member, color = null) {
  if (!member) return false;
  const idx = findArchiveCheer(player, color);
  if (idx < 0) return false;
  const cheer = player.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
  member.attachedCheer.push(cheer);
  return true;
}

function returnFromArchive(player, predicate, count = 1) {
  let returned = 0;
  while (returned < count) {
    const idx = player.zones[ZONE.ARCHIVE].findIndex(predicate);
    if (idx < 0) break;
    const c = player.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
    player.zones[ZONE.HAND].push(c);
    returned++;
  }
  return returned;
}

function makeArchivePrompt(player, pIdx, pred, msg, max = 1) {
  const m = [];
  for (const c of player.zones[ZONE.ARCHIVE]) {
    if (pred(c)) { const d = getCard(c.cardId); m.push({ instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) }); }
  }
  if (!m.length) return null;
  return { type: 'SELECT_FROM_ARCHIVE', player: pIdx, message: msg, cards: m, maxSelect: max, afterAction: 'RETURN_FROM_ARCHIVE' };
}

// ── HANDLERS ──

export function registerPhaseB() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // 51. hSD01-016 春先のどか: draw 3
  reg('hSD01-016', HOOK.ON_PLAY, (state, ctx) => {
    drawCards(state.players[ctx.player], 3);
    return { state, resolved: true, log: '抽 3 張' };
  });

  // 52. hBP01-012 天音かなた effectB: dice ≤3 → search mascot, attach
  reg('hBP01-012', HOOK.ON_BLOOM, (state, ctx) => {
    const roll = rollDie();
    if (roll <= 3) {
      const player = state.players[ctx.player];
      const prompt = makeSearchPrompt(player, ctx.player, c => getCard(c.cardId)?.type === '支援・吉祥物', '搜尋吉祥物附加給成員', 'ATTACH_SUPPORT');
      if (prompt) {
        if (ctx.memberInst) prompt.targetInstanceId = ctx.memberInst.instanceId;
        return { state, resolved: false, prompt, log: `骰 ${roll}：搜尋吉祥物` };
      }
      shuffleArr(player.zones[ZONE.DECK]);
      return { state, resolved: true, log: `骰 ${roll}：牌組無吉祥物` };
    }
    return { state, resolved: true, log: `骰 ${roll}：無效果` };
  });

  // 53. hBP06-067 戌神ころね effectC: discard #ゲーマーズ → draw 1
  reg('hBP06-067', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    const idx = player.zones[ZONE.HAND].findIndex(c => hasTag(c, '#ゲーマーズ'));
    if (idx >= 0) {
      player.zones[ZONE.ARCHIVE].push(player.zones[ZONE.HAND].splice(idx, 1)[0]);
      drawCards(player, 1);
      return { state, resolved: true, log: '棄 #ゲーマーズ → 抽 1 張' };
    }
    return { state, resolved: true };
  });

  // 54. hBP06-099 ゆび tool: +10 dmg, return 戌神 from archive on attach
  reg('hBP06-099', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    const prompt = makeArchivePrompt(player, ctx.player, c => getCard(c.cardId)?.name === '戌神ころね', '選擇存檔區的戌神ころね回手牌');
    if (prompt) return { state, resolved: false, prompt, log: '存檔區戌神ころね回手牌' };
    return { state, resolved: true, log: '存檔區無戌神ころね' };
  });
  reg('hBP06-099', HOOK.ON_ART_DECLARE, (state, ctx) => ({
    state, resolved: true,
    effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
    log: '道具 +10',
  }));

  // 55. hBP02-029 宝鐘マリン effectC: 20 special dmg to opponent collab
  reg('hBP02-029', HOOK.ON_COLLAB, (state, ctx) => {
    damageOpponent(state, ctx.player, 20, 'collab');
    return { state, resolved: true, log: '對對手聯動 20 特殊傷害' };
  });

  // 56. hBP02-031 宝鐘マリン effectB: 20 special dmg to opponent collab
  reg('hBP02-031', HOOK.ON_BLOOM, (state, ctx) => {
    damageOpponent(state, ctx.player, 20, 'collab');
    return { state, resolved: true, log: '對對手聯動 20 特殊傷害' };
  });

  // 57. hBP03-036 小鳥遊キアラ effectB: reveal 1-4 同名 to archive
  reg('hBP03-036', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const prompt = makeSearchPrompt(player, ctx.player, c => getCard(c.cardId)?.name === '小鳥遊キアラ', '展示小鳥遊キアラ送入存檔', 'SEND_TO_ARCHIVE', 4);
    if (prompt) return { state, resolved: false, prompt, log: '搜尋小鳥遊キアラ進存檔' };
    shuffleArr(player.zones[ZONE.DECK]);
    return { state, resolved: true, log: '牌組無小鳥遊キアラ' };
  });

  // 58. hBP01-054 アイラニ effectB: send cheer to non-self #ID member
  reg('hBP01-054', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const target = getStageMembers(player).find(m => {
      const c = getCard(m.inst.cardId);
      return c?.tag?.includes('#ID') && c?.name !== 'アイラニ・イオフィフティーン';
    });
    if (target) sendCheerFromDeckToMember(player, target.inst);
    return { state, resolved: true, log: '送吶喊給其他 #ID 成員' };
  });

  // 59. hSD06-005 風真いろは effectB: send cheer to #秘密結社holoX member
  reg('hSD06-005', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const target = getStageMembers(player).find(m => hasTag(m.inst, '#秘密結社holoX'));
    if (target) sendCheerFromDeckToMember(player, target.inst);
    return { state, resolved: true, log: '送吶喊給 #holoX 成員' };
  });

  // 60. hBP06-035 百鬼あやめ effectC: 後攻第一回合 attach gear to あやめ
  reg('hBP06-035', HOOK.ON_COLLAB, (state, ctx) => {
    if (state.firstTurn[ctx.player] && ctx.player !== state.firstPlayer) {
      const player = state.players[ctx.player];
      const prompt = makeSearchPrompt(player, ctx.player, c => {
        const t = getCard(c.cardId)?.type || '';
        return t === '支援・道具' || t === '支援・吉祥物' || t === '支援・粉絲';
      }, '搜尋支援卡附加給百鬼あやめ', 'ATTACH_SUPPORT');
      if (prompt) {
        const ayame = getStageMembers(player).find(m => getCard(m.inst.cardId)?.name === '百鬼あやめ');
        if (ayame) prompt.targetInstanceId = ayame.inst.instanceId;
        return { state, resolved: false, prompt };
      }
      shuffleArr(player.zones[ZONE.DECK]);
    }
    return { state, resolved: true };
  });

  // 61. hBP06-038 百鬼あやめ effectC + art1
  reg('hBP06-038', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    if (player.zones[ZONE.CHEER_DECK].length > 0) {
      player.zones[ZONE.ARCHIVE].push(player.zones[ZONE.CHEER_DECK].shift());
      const prompt = makeArchivePrompt(player, ctx.player, c => getCard(c.cardId)?.name === '百鬼あやめ', '選擇存檔區的百鬼あやめ回手牌');
      if (prompt) return { state, resolved: false, prompt, log: '吶喊→存檔，百鬼あやめ回手牌' };
    }
    return { state, resolved: true, log: '存檔無百鬼あやめ' };
  });
  reg('hBP06-038', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    if (player.zones[ZONE.CHEER_DECK].length > 0) {
      player.zones[ZONE.ARCHIVE].push(player.zones[ZONE.CHEER_DECK].shift());
      const opp = state.players[1 - ctx.player];
      const target = opp.zones[ZONE.CENTER] || opp.zones[ZONE.COLLAB];
      if (target) applyDamageToMember(target, 20);
    }
    return { state, resolved: true, log: '20 特殊傷害' };
  });

  // 62. hSD02-014 ぽよ余 mascot: HP+20, draw on bloom (passive note)
  reg('hSD02-014', HOOK.ON_PLAY, (state, ctx) => ({ state, resolved: true, log: '吉祥物 HP +20' }));

  // 63. hBP07-063 AZKi effectC: 後攻一回合返回對手1張吶喊到牌組底
  reg('hBP07-063', HOOK.ON_COLLAB, (state, ctx) => {
    if (state.firstTurn[ctx.player] && ctx.player !== state.firstPlayer) {
      const player = state.players[ctx.player];
      if (getCard(player.oshi?.cardId)?.name === 'AZKi') {
        const opp = state.players[1 - ctx.player];
        // Find any cheer on opponent's stage
        for (const m of getStageMembers(opp)) {
          if (m.inst.attachedCheer.length > 0) {
            const cheer = m.inst.attachedCheer.pop();
            opp.zones[ZONE.CHEER_DECK].push(cheer);
            return { state, resolved: true, log: '對手 1 張吶喊回吶喊牌組底部' };
          }
        }
      }
    }
    return { state, resolved: true };
  });

  // 64. hBP07-064 AZKi art1: search 開拓者 attach to AZKi
  reg('hBP07-064', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    const prompt = makeSearchPrompt(player, ctx.player, c => getCard(c.cardId)?.name === '開拓者', '搜尋「開拓者」附加給 AZKi', 'ATTACH_SUPPORT');
    if (prompt) {
      const azki = getStageMembers(player).find(m => getCard(m.inst.cardId)?.name === 'AZKi');
      if (azki) prompt.targetInstanceId = azki.inst.instanceId;
      return { state, resolved: false, prompt, log: '搜尋「開拓者」' };
    }
    shuffleArr(player.zones[ZONE.DECK]);
    return { state, resolved: true, log: '牌組無「開拓者」' };
  });

  // 65. hBP07-069 AZKi art1 (draw 2) + art2 (sacrifice for life damage)
  reg('hBP07-069', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    if (ctx.artKey === 'art1') {
      drawCards(player, 2);
      return { state, resolved: true, log: '抽 2 張' };
    }
    // art2 — burn 4 holo power, if 4+ FS in archive → opp life -1
    if (player.zones[ZONE.HOLO_POWER].length >= 4 && getCard(player.oshi?.cardId)?.name === 'AZKi') {
      for (let i = 0; i < 4; i++) {
        const c = player.zones[ZONE.HOLO_POWER].shift();
        c.faceDown = false;
        player.zones[ZONE.ARCHIVE].push(c);
      }
      const fsCount = player.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.name === 'フロンティアスピリット').length;
      if (fsCount >= 4) {
        const opp = state.players[1 - ctx.player];
        if (opp.zones[ZONE.LIFE].length > 0) {
          const lc = opp.zones[ZONE.LIFE].shift();
          lc.faceDown = false;
          opp.zones[ZONE.ARCHIVE].push(lc);
        }
        return { state, resolved: true, log: '4×フロンティア → 對手生命 -1' };
      }
    }
    return { state, resolved: true };
  });

  // 66. hBP01-041 兎田ぺこら effectB: send cheer to center/collab
  reg('hBP01-041', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const target = player.zones[ZONE.CENTER] || player.zones[ZONE.COLLAB];
    if (target) sendCheerFromDeckToMember(player, target);
    return { state, resolved: true, log: '送吶喊給中心/聯動' };
  });

  // 67. hBP01-072 ハコス・ベールズ art1: red cheer + dice
  reg('hBP01-072', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const member = ctx.memberInst;
    const hasRed = member?.attachedCheer.some(c => getCard(c.cardId)?.color === '紅');
    if (hasRed) {
      const roll = rollDie();
      if (roll % 2 === 1) {
        damageOpponent(state, ctx.player, 20, 'collab');
        return { state, resolved: true, log: `骰 ${roll}：對手聯動 20 特殊傷害` };
      }
    }
    return { state, resolved: true };
  });

  // 68. hBP07-010 角巻わため effectC: deck top to holo power, look + add to hand
  reg('hBP07-010', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    if (player.zones[ZONE.DECK].length > 0) {
      const c = player.zones[ZONE.DECK].shift();
      c.faceDown = true;
      player.zones[ZONE.HOLO_POWER].push(c);
    }
    if (player.zones[ZONE.HOLO_POWER].length > 0) {
      const c = player.zones[ZONE.HOLO_POWER].pop();
      c.faceDown = false;
      player.zones[ZONE.HAND].push(c);
    }
    shuffleArr(player.zones[ZONE.HOLO_POWER]);
    return { state, resolved: true, log: '牌組→能量區→1 張回手牌' };
  });

  // 69. hBP07-012 角巻わため effectB + art1
  reg('hBP07-012', HOOK.ON_BLOOM, (state, ctx) => {
    const opp = state.players[1 - ctx.player];
    const target = opp.zones[ZONE.CENTER] || opp.zones[ZONE.COLLAB];
    if (target) applyDamageToMember(target, 30);
    drawCards(opp, 1);
    return { state, resolved: true, log: '對手中心/聯動 30 特殊傷害；對手抽 1 張' };
  });
  reg('hBP07-012', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    drawCards(state.players[ctx.player], 1);
    return { state, resolved: true, log: '抽 1 張' };
  });

  // 70. hBP01-066 小鳥遊キアラ art2: archive 1 stacked → 40 special dmg to collab
  reg('hBP01-066', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey === 'art2') {
      const stack = ctx.memberInst?.bloomStack || [];
      if (stack.length > 0) {
        // Archive a "stacked" member from bloom history
        ctx.memberInst.bloomStack.pop();
        damageOpponent(state, ctx.player, 40, 'collab');
        return { state, resolved: true, log: '棄 1 張重疊成員 → 對手聯動 40 特殊傷害' };
      }
    }
    return { state, resolved: true };
  });

  // 71. hBP01-067 小鳥遊キアラ art2: +10 per archive member, then return 6 to deck
  reg('hBP01-067', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art2') return { state, resolved: true };
    const player = state.players[ctx.player];
    const memberCount = player.zones[ZONE.ARCHIVE].filter(c => isMember(getCard(c.cardId)?.type)).length;
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: memberCount * 10, target: 'self', duration: 'instant' },
      log: `存檔 ${memberCount} 成員 → +${memberCount * 10}`,
    };
  });
  reg('hBP01-067', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey !== 'art2') return { state, resolved: true };
    const player = state.players[ctx.player];
    let returned = 0;
    while (returned < 6) {
      const idx = player.zones[ZONE.ARCHIVE].findIndex(c => isMember(getCard(c.cardId)?.type));
      if (idx < 0) break;
      const c = player.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
      player.zones[ZONE.DECK].push(c);
      returned++;
    }
    shuffleArr(player.zones[ZONE.DECK]);
    return { state, resolved: true, log: `${returned} 張存檔成員回牌組+洗牌` };
  });

  // 72. hBP01-077 星街すいせい effectC: archive blue cheer → draw 2
  reg('hBP01-077', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    if (getCard(player.oshi?.cardId)?.name !== '星街すいせい') return { state, resolved: true };
    const member = ctx.memberInst;
    const blueIdx = member?.attachedCheer.findIndex(c => getCard(c.cardId)?.color === '藍');
    if (blueIdx >= 0) {
      const cheer = member.attachedCheer.splice(blueIdx, 1)[0];
      player.zones[ZONE.ARCHIVE].push(cheer);
      drawCards(player, 2);
      return { state, resolved: true, log: '棄藍吶喊 → 抽 2 張' };
    }
    return { state, resolved: true };
  });

  // 73. hBP02-077 レトロパソコン: life ≤3, return 1 member from archive
  reg('hBP02-077', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    if (player.zones[ZONE.LIFE].length <= 3) {
      const prompt = makeArchivePrompt(player, ctx.player, c => isMember(getCard(c.cardId)?.type), '選擇存檔區的成員回手牌');
      if (prompt) return { state, resolved: false, prompt, log: '存檔成員回手牌' };
      return { state, resolved: true, log: '存檔無成員' };
    }
    return { state, resolved: true, log: '生命條件未達成' };
  });

  // 74. hSD01-012 アイラニ effectC: send white/green cheer from archive to center
  reg('hSD01-012', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    const center = player.zones[ZONE.CENTER];
    if (!center) return { state, resolved: true };
    if (sendCheerFromArchiveToMember(player, center, '白') || sendCheerFromArchiveToMember(player, center, '綠')) {
      return { state, resolved: true, log: '存檔白/綠吶喊→中心' };
    }
    return { state, resolved: true };
  });

  // 75. hBP02-094 Tatang mascot: +10 dmg
  reg('hBP02-094', HOOK.ON_ART_DECLARE, (state, ctx) => ({
    state, resolved: true,
    effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
    log: 'Tatang +10',
  }));

  // 76. hBP02-040 沙花叉クロヱ art1: reveal top 3, +20 per member, archive
  reg('hBP02-040', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const player = state.players[ctx.player];
    const top3 = player.zones[ZONE.DECK].splice(0, 3);
    let memberCount = 0;
    for (const c of top3) {
      c.faceDown = false;
      if (isMember(getCard(c.cardId)?.type)) memberCount++;
      player.zones[ZONE.ARCHIVE].push(c);
    }
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: memberCount * 20, target: 'self', duration: 'instant' },
      log: `${memberCount} 成員 → +${memberCount * 20}`,
    };
  });

  // 77. hBP02-085 HOLOLIVE FANTASY: look top 4, add #3期生 → hand, rest → order bottom
  reg('hBP02-085', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    const count = Math.min(4, player.zones[ZONE.DECK].length);
    const top4 = player.zones[ZONE.DECK].slice(0, count);
    const allCards = top4.map(c => { const d = getCard(c.cardId); return { instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) }; });
    const matchCards = [];
    for (const c of top4) {
      if (hasTag(c, '#3期生')) {
        const d = getCard(c.cardId);
        matchCards.push({ instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) });
      }
    }
    if (matchCards.length > 0) {
      return { state, resolved: false, prompt: { type: 'SEARCH_SELECT', player: ctx.player, message: '牌組頂 4 張中選擇 #3期生 成員加入手牌', cards: matchCards, maxSelect: matchCards.length, afterAction: 'ADD_TO_HAND', remainingCards: allCards, noShuffle: true } };
    }
    // No matches: order all to bottom
    return { state, resolved: false, prompt: { type: 'ORDER_TO_BOTTOM', player: ctx.player, message: '頂 4 張無 #3期生，選擇放回牌底的順序', cards: allCards } };
  });

  // 78. hBP02-095 ドクロくん mascot: +10
  reg('hBP02-095', HOOK.ON_ART_DECLARE, (state, ctx) => ({
    state, resolved: true,
    effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
    log: '吉祥物 +10',
  }));

  // 79. hBP01-001 天音かなた oshi: HP→50; SP: +50 dmg, +50 if white
  reg('hBP01-001', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 100, target: 'self', duration: 'turn' },
        log: 'SP: 1 位成員藝能 +50（白色再 +50）',
      };
    }
    // Set opp center HP "remaining" to 50 — implemented as damage to bring HP to 50
    const opp = state.players[1 - ctx.player];
    const center = opp.zones[ZONE.CENTER];
    if (center) {
      const card = getCard(center.cardId);
      if (card?.hp) center.damage = Math.max(center.damage, card.hp - 50);
    }
    return { state, resolved: true, log: '對手中心剩餘 HP = 50' };
  });

  // 80. hSD02-007 百鬼あやめ effectB: from Debut, look top 2, add 1
  reg('hSD02-007', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const top2 = player.zones[ZONE.DECK].slice(0, 2);
    if (top2.length > 0) {
      const cards = [];
      for (const c of top2) {
        const d = getCard(c.cardId);
        cards.push({ instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) });
      }
      return { state, resolved: false, prompt: { type: 'SEARCH_SELECT', player: ctx.player, message: '查看牌組頂 2 張，選擇 1 張加入手牌，其餘進存檔', cards, maxSelect: 1, afterAction: 'ADD_TO_HAND' } };
    }
    return { state, resolved: true, log: '牌組空' };
  });

  // 81. hBP03-065 戌神ころね effectG + art1
  reg('hBP03-065', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => ({
    state, resolved: true, log: '聯動位置：對手主要階段中心戌神 HP 不變',
  }));
  reg('hBP03-065', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    const target = getStageMembers(player).find(m => hasTag(m.inst, '#ゲーマーズ'));
    if (target) sendCheerFromDeckToMember(player, target.inst);
    return { state, resolved: true, log: '送吶喊給 #ゲーマーズ 成員' };
  });

  // 82. hBP06-040 ハコス・ベールズ art1: dice odd → 10 dmg both center+collab
  reg('hBP06-040', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const roll = rollDie();
    if (roll % 2 === 1) {
      damageOpponent(state, ctx.player, 10, 'center');
      damageOpponent(state, ctx.player, 10, 'collab');
      return { state, resolved: true, log: `骰 ${roll}：中心+聯動 10 特殊傷害` };
    }
    return { state, resolved: true, log: `骰 ${roll}：無效果` };
  });

  // 83. hBP07-065 AZKi art1: draw 1 + discard 1
  reg('hBP07-065', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    drawCards(player, 1);
    archiveFromHand(player, 1);
    return { state, resolved: true, log: '抽 1 棄 1' };
  });

  // 84. hBP07-066 AZKi effectC: heal 30 + +10 dmg
  reg('hBP07-066', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    const allMembers = getStageMembers(player);
    const healed = allMembers.find(m => m.inst.damage > 0);
    if (healed) healed.inst.damage = Math.max(0, healed.inst.damage - 30);
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'choose', duration: 'turn' },
      log: '回復 30 HP，1 位成員 +10 dmg',
    };
  });

  // 85. hBP07-008 角巻わため effectC: 後攻一回合 wata 雙重藝能
  reg('hBP07-008', HOOK.ON_COLLAB, (state, ctx) => {
    if (state.firstTurn[ctx.player] && ctx.player !== state.firstPlayer) {
      return { state, resolved: true, log: '後攻第一回合：1 位わため可再用同藝能' };
    }
    return { state, resolved: true };
  });

  // 86. hBP01-063 小鳥遊キアラ effectC: discard hand → search mascot
  reg('hBP01-063', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    const center = player.zones[ZONE.CENTER];
    if (!center || !hasTag(center, '#トリ')) return { state, resolved: true };
    if (player.zones[ZONE.HAND].length > 0) {
      archiveFromHand(player, 1);
      const prompt = makeSearchPrompt(player, ctx.player, c => getCard(c.cardId)?.type === '支援・吉祥物', '搜尋牌組中的吉祥物加入手牌');
      if (prompt) return { state, resolved: false, prompt, log: '棄 1 → 搜尋吉祥物' };
      shuffleArr(player.zones[ZONE.DECK]);
      return { state, resolved: true, log: '棄 1，牌組無吉祥物' };
    }
    return { state, resolved: true };
  });

  // 87. hBP01-055 アイラニ effectC + art1
  reg('hBP01-055', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    const idMembers = getStageMembers(player).filter(m => hasTag(m.inst, '#ID')).slice(0, 3);
    let sent = 0;
    for (const m of idMembers) {
      if (sendCheerFromArchiveToMember(player, m.inst)) sent++;
    }
    return { state, resolved: true, log: `存檔吶喊送給 ${sent} 位 #ID 成員` };
  });
  reg('hBP01-055', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const player = state.players[ctx.player];
    const hasOtherID = getStageMembers(player).some(m => {
      const c = getCard(m.inst.cardId);
      return c?.name !== 'アイラニ・イオフィフティーン' && hasTag(m.inst, '#ID');
    });
    if (hasOtherID) {
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 50, target: 'self', duration: 'instant' },
        log: '舞台有其他 #ID → +50',
      };
    }
    return { state, resolved: true };
  });

  // 88. hBP02-019 パヴォリア・レイネ effectC: send archive cheer to member
  reg('hBP02-019', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    const member = ctx.memberInst || player.zones[ZONE.CENTER];
    if (member && sendCheerFromArchiveToMember(player, member)) {
      return { state, resolved: true, log: '存檔吶喊送回成員' };
    }
    return { state, resolved: true };
  });

  // 89. hBP01-010 天音かなた effectC: center +10, +20 if #4期生
  reg('hBP01-010', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    const center = player.zones[ZONE.CENTER];
    let bonus = 10;
    if (center && hasTag(center, '#4期生')) bonus += 20;
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: bonus, target: 'center', duration: 'turn' },
      log: `中心 +${bonus}`,
    };
  });

  // 90. hBP05-079 み俺恥: draw 2 + condition cheer recovery
  reg('hBP05-079', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    drawCards(player, 2);
    // Conditional: if life less than opponent, send 1 archive cheer
    const opp = state.players[1 - ctx.player];
    if (player.zones[ZONE.LIFE].length < opp.zones[ZONE.LIFE].length) {
      const target = getStageMembers(player)[0];
      if (target) sendCheerFromArchiveToMember(player, target.inst);
    }
    return { state, resolved: true, log: '抽 2 張，條件性送吶喊' };
  });

  // 91. hBP06-090 ブルームステージ: draw 2 + bloom retry
  reg('hBP06-090', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    drawCards(player, 2);
    return { state, resolved: true, log: '抽 2 張；若生命≤4 可重新綻放' };
  });

  // 92. hBP01-050 風真いろは effectG + art1
  reg('hBP01-050', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => ({
    state, resolved: true, log: '聯動位置：對手藝能限定本成員為對象',
  }));
  reg('hBP01-050', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    const target = getStageMembers(player).find(m => {
      const c = getCard(m.inst.cardId);
      return c?.name !== '風真いろは' && hasTag(m.inst, '#秘密結社holoX');
    });
    if (target) sendCheerFromDeckToMember(player, target.inst);
    return { state, resolved: true, log: '送吶喊給其他 #holoX 成員' };
  });

  // 93. hSD02-006 百鬼あやめ effectB: discard 1 → 20 special dmg
  reg('hSD02-006', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    if (player.zones[ZONE.HAND].length > 0) {
      archiveFromHand(player, 1);
      const opp = state.players[1 - ctx.player];
      const target = opp.zones[ZONE.CENTER] || opp.zones[ZONE.COLLAB];
      if (target) applyDamageToMember(target, 20);
      return { state, resolved: true, log: '棄 1 → 20 特殊傷害' };
    }
    return { state, resolved: true };
  });

  // 94. hBP03-006 戌神ころね oshi: activate rest 戌神; SP: replace cheer
  reg('hBP03-006', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      return { state, resolved: true, log: 'SP: 黃色擊倒時可換吶喊' };
    }
    const player = state.players[ctx.player];
    const restKorone = player.zones[ZONE.BACKSTAGE].find(m => m.state === MEMBER_STATE.REST && getCard(m.cardId)?.name === '戌神ころね');
    if (restKorone) restKorone.state = MEMBER_STATE.ACTIVE;
    return { state, resolved: true, log: '休息中戌神ころね → 活動' };
  });

  // 95. hBP05-075 牛丼: choose member, baton -2, heal 20
  reg('hBP05-075', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    const target = player.zones[ZONE.CENTER];
    if (target) target.damage = Math.max(0, target.damage - 20);
    return { state, resolved: true, log: '本回合交棒費用 -2，回復 20 HP' };
  });

  // 96. hBP06-083 ラムダック effectC + art1
  reg('hBP06-083', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    const idx = player.zones[ZONE.HAND].findIndex(c => getCard(c.cardId)?.name === '大空スバル');
    if (idx >= 0) {
      const card = player.zones[ZONE.HAND].splice(idx, 1)[0];
      player.zones[ZONE.DECK].push(card);
      const archPrompt = makeArchivePrompt(player, ctx.player, c => {
        const n = getCard(c.cardId)?.name;
        return n === '角巻わため' || n === '大空スバル';
      }, '選擇存檔區的角巻わため或大空スバル回手牌');
      if (archPrompt) return { state, resolved: false, prompt: archPrompt };
    }
    return { state, resolved: true, log: '展示大空スバル → 存檔角巻/大空 回手牌' };
  });

  // 97. hBP01-080 星街すいせい effectC: dice odd → knockdown opp backstage
  reg('hBP01-080', HOOK.ON_COLLAB, (state, ctx) => {
    const roll = rollDie();
    if (roll % 2 === 1) {
      const opp = state.players[1 - ctx.player];
      const target = opp.zones[ZONE.BACKSTAGE].find(m => m.damage >= 40);
      if (target) {
        const card = getCard(target.cardId);
        if (card?.hp) target.damage = card.hp;
      }
      return { state, resolved: true, log: `骰 ${roll}：擊倒對手後台 ≥40 傷害成員` };
    }
    return { state, resolved: true, log: `骰 ${roll}：無效果` };
  });

  // 98. hBP03-044 星街すいせい effectB + art1
  reg('hBP03-044', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const top4 = player.zones[ZONE.DECK].slice(0, 4);
    const cards = [];
    for (const c of top4) {
      if (getCard(c.cardId)?.name === '星街すいせい') {
        const d = getCard(c.cardId);
        cards.push({ instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) });
      }
    }
    if (cards.length > 0) {
      return { state, resolved: false, prompt: { type: 'SEARCH_SELECT', player: ctx.player, message: '牌組頂 4 張中選擇星街すいせい加入手牌', cards, maxSelect: 1, afterAction: 'ADD_TO_HAND' } };
    }
    return { state, resolved: true, log: '頂 4 張無星街すいせい' };
  });
  reg('hBP03-044', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    if (getCard(player.oshi?.cardId)?.name !== '星街すいせい') return { state, resolved: true };
    const member = ctx.memberInst;
    const blueIdx = member?.attachedCheer.findIndex(c => getCard(c.cardId)?.color === '藍');
    if (blueIdx >= 0) {
      const cheer = member.attachedCheer.splice(blueIdx, 1)[0];
      const back = player.zones[ZONE.BACKSTAGE].find(m => getCard(m.cardId)?.name === '星街すいせい');
      if (back) back.attachedCheer.push(cheer);
    }
    return { state, resolved: true, log: '藍吶喊轉移到後台星街' };
  });

  // 99. hBP01-027 ベスティア・ゼータ effectG + art1
  reg('hBP01-027', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => ({
    state, resolved: true, log: '聯動位置：受傷時擲骰奇數→傷害=0',
  }));
  reg('hBP01-027', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const player = state.players[ctx.player];
    if (player.zones[ZONE.CENTER] && hasTag(player.zones[ZONE.CENTER], '#ID')) {
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 50, target: 'self', duration: 'instant' },
        log: '中心 #ID → +50',
      };
    }
    return { state, resolved: true };
  });

  // 100. hBP01-038 兎田ぺこら art1: dice even → +20
  reg('hBP01-038', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const roll = rollDie();
    if (roll % 2 === 0) {
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 20, target: 'self', duration: 'instant' },
        log: `骰 ${roll}：+20`,
      };
    }
    return { state, resolved: true, log: `骰 ${roll}：無效果` };
  });

  // 101. hBP01-071 尾丸ポルカ effectB + art1
  reg('hBP01-071', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const prompt = makeArchivePrompt(player, ctx.player, c => getCard(c.cardId)?.name === '座員', '選擇存檔區的「座員」回手牌');
    if (prompt) return { state, resolved: false, prompt, log: '存檔「座員」回手牌' };
    return { state, resolved: true, log: '存檔無「座員」' };
  });
  reg('hBP01-071', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const player = state.players[ctx.player];
    let fanCount = 0;
    for (const m of getStageMembers(player)) {
      fanCount += (m.inst.attachedSupport || []).filter(s => getCard(s.cardId)?.type === '支援・粉絲').length;
    }
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: fanCount * 20, target: 'self', duration: 'instant' },
      log: `${fanCount} 粉絲 → +${fanCount * 20}`,
    };
  });

  // 102. hBP01-070 尾丸ポルカ effectB
  reg('hBP01-070', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const prompt = makeSearchPrompt(player, ctx.player, c => getCard(c.cardId)?.type === '支援・粉絲', '搜尋牌組中的粉絲卡加入手牌');
    if (prompt) return { state, resolved: false, prompt, log: '搜尋粉絲' };
    shuffleArr(player.zones[ZONE.DECK]);
    return { state, resolved: true, log: '牌組無粉絲' };
  });

  // 103-105. Fan card passthroughs (no immediate trigger)
  reg('hBP01-123', HOOK.ON_PLAY, (state, ctx) => ({ state, resolved: true, log: '野うさぎ同盟附加' }));
  reg('hBP01-125', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    if (player.zones[ZONE.HAND].length > 0) {
      archiveFromHand(player, 1);
      drawCards(player, 1);
    }
    return { state, resolved: true, log: 'KFP 附加：棄 1 抽 1' };
  });
  reg('hBP01-126', HOOK.ON_PLAY, (state, ctx) => ({ state, resolved: true, log: '座員附加' }));

  // 106. hBP07-036 赤井はあと effectC: 後攻一回合 search 2 Debut あかい
  reg('hBP07-036', HOOK.ON_COLLAB, (state, ctx) => {
    if (state.firstTurn[ctx.player] && ctx.player !== state.firstPlayer) {
      const player = state.players[ctx.player];
      const prompt = makeSearchPrompt(player, ctx.player, c => {
        const card = getCard(c.cardId);
        return card?.name === '赤井はあと' && card.bloom === 'Debut';
      }, '搜尋最多 2 張 Debut 赤井はあと放置到舞台', 'PLACE_AND_SHUFFLE', 2);
      if (prompt) return { state, resolved: false, prompt };
      shuffleArr(player.zones[ZONE.DECK]);
      return { state, resolved: true, log: '牌組無 Debut 赤井はあと' };
    }
    return { state, resolved: true };
  });

  // 107. hBP07-037 赤井はあと effectC: if center is あかい, draw 1
  reg('hBP07-037', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    if (getCard(player.zones[ZONE.CENTER]?.cardId)?.name === '赤井はあと') {
      drawCards(player, 1);
    }
    return { state, resolved: true };
  });

  // 108. hBP07-039 赤井はあと effectG + art1
  reg('hBP07-039', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => ({
    state, resolved: true, log: '回手牌時可送吶喊',
  }));
  reg('hBP07-039', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    damageOpponent(state, ctx.player, 20, 'center');
    return { state, resolved: true, log: '對中心 20 特殊傷害' };
  });

  // 109. hBP07-040 赤井はあと effectC: return Debut to deck → search 1st/2nd
  reg('hBP07-040', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    const idx = player.zones[ZONE.BACKSTAGE].findIndex(m => {
      const c = getCard(m.cardId);
      return c?.name === '赤井はあと' && c.bloom === 'Debut';
    });
    if (idx >= 0) {
      const card = player.zones[ZONE.BACKSTAGE].splice(idx, 1)[0];
      player.zones[ZONE.DECK].push(card);
      const prompt = makeSearchPrompt(player, ctx.player, c => {
        const cd = getCard(c.cardId);
        return cd?.name === '赤井はあと' && cd.bloom !== '1st Buzz' && (cd.bloom === '1st' || cd.bloom === '2nd');
      }, '搜尋赤井はあと 1st/2nd 加入手牌');
      if (prompt) return { state, resolved: false, prompt };
      shuffleArr(player.zones[ZONE.DECK]);
    }
    return { state, resolved: true };
  });

  // 110. hBP07-042 赤井はあと art1 + art2
  reg('hBP07-042', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.artKey === 'art1') {
      damageOpponent(state, ctx.player, 40, 'center');
      damageOpponent(state, ctx.player, 40, 'collab');
      return { state, resolved: true, log: '中心+聯動 40 特殊傷害' };
    }
    return { state, resolved: true };
  });

  // 111. hBP07-096 ちゃま旅: return back あかい to deck, -1 colorless cost
  reg('hBP07-096', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    const idx = player.zones[ZONE.BACKSTAGE].findIndex(m => {
      const c = getCard(m.cardId);
      return c?.name === '赤井はあと' && c.bloom === 'Debut';
    });
    if (idx >= 0) {
      const card = player.zones[ZONE.BACKSTAGE].splice(idx, 1)[0];
      player.zones[ZONE.DECK].push(card);
      shuffleArr(player.zones[ZONE.DECK]);
    }
    return { state, resolved: true, log: '回 1 張赤井はあと到牌組底' };
  });

  // 112. hBP01-061 鷹嶺ルイ effectB + art1
  reg('hBP01-061', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const prompt = makeArchivePrompt(player, ctx.player, c => hasTag(c, '#秘密結社holoX'), '選擇存檔區的 #holoX 成員回手牌（最多 2 張）', 2);
    if (prompt) return { state, resolved: false, prompt, log: '存檔 holoX 成員回手牌' };
    return { state, resolved: true, log: '存檔無 holoX 成員' };
  });
  reg('hBP01-061', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const player = state.players[ctx.player];
    const max = Math.min(5, player.zones[ZONE.HAND].length);
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: max * 20, target: 'self', duration: 'instant' },
      log: `棄 ${max} 張 → +${max * 20}`,
    };
  });

  // 113. hBP01-051 風真いろは art1: +20 per cheer (max 5)
  reg('hBP01-051', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const cheerCount = Math.min(5, ctx.memberInst?.attachedCheer?.length || 0);
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: cheerCount * 20, target: 'self', duration: 'instant' },
      log: `${cheerCount} 吶喊 → +${cheerCount * 20}`,
    };
  });

  // 114. hSD06-011 ﾁｬｷ丸 tool: +10
  reg('hSD06-011', HOOK.ON_ART_DECLARE, (state, ctx) => ({
    state, resolved: true,
    effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
    log: '道具 +10',
  }));

  // 115. hSD02-013 阿修羅＆羅刹 tool: +10
  reg('hSD02-013', HOOK.ON_ART_DECLARE, (state, ctx) => ({
    state, resolved: true,
    effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
    log: '道具 +10',
  }));

  // 116. hBP04-070 大空スバル effectC: +10 dmg per cheer (max 3)
  reg('hBP04-070', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    const target = player.zones[ZONE.CENTER];
    const cheerCount = Math.min(3, target?.attachedCheer?.length || 0);
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: cheerCount * 10, target: 'choose', duration: 'turn' },
      log: `1 位成員 +${cheerCount * 10}`,
    };
  });

  // 117. hBP06-080 大空スバル
  reg('hBP06-080', HOOK.ON_BLOOM, (state, ctx) => ({ state, resolved: true }));

  // 118. hBP06-081 大空スバル effectB + art1
  reg('hBP06-081', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    if (getCard(player.oshi?.cardId)?.name !== '大空スバル') return { state, resolved: true };
    const allCheer = [];
    for (const m of getStageMembers(player)) {
      if (m.inst.attachedCheer.length > 0) allCheer.push(m.inst);
    }
    if (allCheer.length > 0) {
      const cheer = allCheer[0].attachedCheer.shift();
      player.zones[ZONE.ARCHIVE].push(cheer);
      const prompt = makeSearchPrompt(player, ctx.player, c => getCard(c.cardId)?.name === '大空スバル', '搜尋大空スバル加入手牌');
      if (prompt) return { state, resolved: false, prompt, log: '棄吶喊 → 搜尋大空スバル' };
      shuffleArr(player.zones[ZONE.DECK]);
    }
    return { state, resolved: true, log: '棄吶喊，牌組無大空スバル' };
  });
  reg('hBP06-081', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    if (player.zones[ZONE.LIFE].length <= 3) {
      const yellowMember = getStageMembers(player).find(m => getCard(m.inst.cardId)?.color === '黃');
      if (yellowMember) sendCheerFromDeckToMember(player, yellowMember.inst);
    }
    return { state, resolved: true, log: '生命 ≤3 → 送吶喊給黃色成員' };
  });

  // 119. hBP06-057 森カリオペ art1: draw 1, discard 1
  reg('hBP06-057', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    drawCards(player, 1);
    archiveFromHand(player, 1);
    return { state, resolved: true, log: '抽 1 棄 1' };
  });

  // 120. hBP06-058 森カリオペ effectC + art1
  reg('hBP06-058', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    drawCards(player, 3);
    archiveFromHand(player, 2);
    return { state, resolved: true, log: '抽 3 棄 2' };
  });
  reg('hBP06-058', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    const hasPurple = ctx.memberInst?.attachedCheer.some(c => getCard(c.cardId)?.color === '紫');
    if (hasPurple) {
      drawCards(player, 1);
      moveTopDeckToArchive(player, 2);
      return { state, resolved: true, log: '抽 1，牌組頂 2 張存檔' };
    }
    return { state, resolved: true };
  });

  // 121. hBP06-059 森カリオペ effectB
  reg('hBP06-059', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const enCount = getStageMembers(player).filter(m => hasTag(m.inst, '#EN')).length;
    if (enCount >= 3) {
      // Find blue or purple cheer in cheer deck
      const cheerIdx = player.zones[ZONE.CHEER_DECK].findIndex(c => {
        const col = getCard(c.cardId)?.color;
        return col === '藍' || col === '紫';
      });
      if (cheerIdx >= 0 && ctx.memberInst) {
        const cheer = player.zones[ZONE.CHEER_DECK].splice(cheerIdx, 1)[0];
        cheer.faceDown = false;
        ctx.memberInst.attachedCheer.push(cheer);
      }
      shuffleArr(player.zones[ZONE.CHEER_DECK]);
    }
    return { state, resolved: true, log: '#EN ≥3 → 送藍/紫吶喊' };
  });

  // 122. hBP06-060 森カリオペ art1 + art2
  reg('hBP06-060', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    if (ctx.artKey === 'art1') {
      if (getCard(player.oshi?.cardId)?.name === '森カリオペ') {
        const moved = moveTopDeckToArchive(player, 2);
        if (moved > 0) {
          const target = ctx.memberInst || player.zones[ZONE.CENTER];
          if (target) sendCheerFromDeckToMember(player, target);
        }
      }
      return { state, resolved: true };
    }
    // art2
    if (getCard(player.oshi?.cardId)?.name === '森カリオペ') {
      const memberCount = player.zones[ZONE.ARCHIVE].filter(c => isMember(getCard(c.cardId)?.type)).length;
      if (memberCount >= 8) drawCards(player, 1);
    }
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 20, target: 'tag:#Myth', duration: 'turn' },
      log: '#Myth +20',
    };
  });

  // 123. hBP07-046 エリザベス effectC: 後攻一回合 search 1st + Thorn
  reg('hBP07-046', HOOK.ON_COLLAB, (state, ctx) => {
    if (state.firstTurn[ctx.player] && ctx.player !== state.firstPlayer) {
      const player = state.players[ctx.player];
      const prompt = makeSearchPrompt(player, ctx.player, c => {
        const card = getCard(c.cardId);
        return (card?.name === 'エリザベス・ローズ・ブラッドフレイム' && card.bloom === '1st') || card?.name === 'Thorn';
      }, '搜尋エリザベス 1st 或 Thorn 加入手牌', 'ADD_TO_HAND', 2);
      if (prompt) return { state, resolved: false, prompt };
      shuffleArr(player.zones[ZONE.DECK]);
    }
    return { state, resolved: true };
  });

  // 124. hBP03-090: look top 4, add Debut → hand, rest → order bottom
  reg('hBP03-090', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    const count = Math.min(4, player.zones[ZONE.DECK].length);
    const top4 = player.zones[ZONE.DECK].slice(0, count);
    const allCards = top4.map(c => { const d = getCard(c.cardId); return { instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) }; });
    const matchCards = [];
    for (const c of top4) {
      const d = getCard(c.cardId);
      if (d && isMember(d.type) && d.bloom === 'Debut') {
        matchCards.push({ instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) });
      }
    }
    if (matchCards.length > 0) {
      return { state, resolved: false, prompt: { type: 'SEARCH_SELECT', player: ctx.player, message: '牌組頂 4 張中選擇 Debut 成員加入手牌', cards: matchCards, maxSelect: matchCards.length, afterAction: 'ADD_TO_HAND', remainingCards: allCards, noShuffle: true } };
    }
    return { state, resolved: false, prompt: { type: 'ORDER_TO_BOTTOM', player: ctx.player, message: '頂 4 張無 Debut，選擇放回牌底的順序', cards: allCards } };
  });

  // 125. hBP01-006 小鳥遊キアラ oshi: return archive member; SP: reduce life dmg
  reg('hBP01-006', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    const player = state.players[ctx.player];
    if (ctx.skillType !== 'sp') {
      const prompt = makeArchivePrompt(player, ctx.player, c => isMember(getCard(c.cardId)?.type), '選擇存檔區的成員回手牌');
      if (prompt) return { state, resolved: false, prompt, log: '存檔成員回手牌' };
      return { state, resolved: true, log: '存檔無成員' };
    }
    return { state, resolved: true, log: 'SP: 紅色被擊倒時減傷' };
  });

  // 126. hBP01-098 白銀ノエル effectC: send archive cheer to member
  reg('hBP01-098', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    sendCheerFromArchiveToMember(player, ctx.memberInst || player.zones[ZONE.CENTER]);
    return { state, resolved: true, log: '存檔吶喊回成員' };
  });

  // 127. hBP02-003 宝鐘マリン oshi
  reg('hBP02-003', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      const player = state.players[ctx.player];
      const center = player.zones[ZONE.CENTER];
      if (center && getCard(center.cardId)?.name === '宝鐘マリン') {
        const stack = (center.bloomStack?.length || 0) + 1;
        const opp = state.players[1 - ctx.player];
        const target = opp.zones[ZONE.CENTER] || opp.zones[ZONE.COLLAB];
        if (target) applyDamageToMember(target, stack * 50);
        return { state, resolved: true, log: `重疊 ${stack} → ${stack * 50} 特殊傷害` };
      }
    }
    return { state, resolved: true, log: '#3期生 重新綻放' };
  });

  // 128. hBP01-096 兎田ぺこら effectC: dice even → search Buzz
  reg('hBP01-096', HOOK.ON_COLLAB, (state, ctx) => {
    const roll = rollDie();
    if (roll % 2 === 0) {
      const player = state.players[ctx.player];
      const prompt = makeSearchPrompt(player, ctx.player, c => getCard(c.cardId)?.bloom === '1st Buzz', '搜尋 Buzz 成員加入手牌');
      if (prompt) return { state, resolved: false, prompt, log: `骰 ${roll}：搜尋 Buzz 成員` };
      shuffleArr(player.zones[ZONE.DECK]);
      return { state, resolved: true, log: `骰 ${roll}：牌組無 Buzz 成員` };
    }
    return { state, resolved: true, log: `骰 ${roll}：無效果` };
  });

  // 129. hBP07-006 AZKi oshi: search activity if member knocked down
  reg('hBP07-006', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    const player = state.players[ctx.player];
    const prompt = makeSearchPrompt(player, ctx.player, c => getCard(c.cardId)?.type === '支援・活動', '搜尋活動卡加入手牌');
    if (prompt) return { state, resolved: false, prompt, log: '搜尋活動卡' };
    shuffleArr(player.zones[ZONE.DECK]);
    return { state, resolved: true, log: '牌組無活動卡' };
  });

  // 130. hBP02-036 沙花叉クロヱ effectC: look top 3, search holoX 2nd
  reg('hBP02-036', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    const top3 = player.zones[ZONE.DECK].slice(0, 3);
    const cards = [];
    for (const c of top3) {
      const d = getCard(c.cardId);
      if (d && d.bloom === '2nd' && hasTag(c, '#秘密結社holoX')) {
        cards.push({ instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) });
      }
    }
    if (cards.length > 0) {
      return { state, resolved: false, prompt: { type: 'SEARCH_SELECT', player: ctx.player, message: '牌組頂 3 張中選擇 #holoX 2nd 加入手牌', cards, maxSelect: 1, afterAction: 'ADD_TO_HAND' } };
    }
    return { state, resolved: true, log: '頂 3 張無 holoX 2nd' };
  });

  // 131. hBP01-106 あとは任せた！: swap center with active backstage
  reg('hBP01-106', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    const center = player.zones[ZONE.CENTER];
    const idx = player.zones[ZONE.BACKSTAGE].findIndex(m => m.state === MEMBER_STATE.ACTIVE);
    if (center && idx >= 0) {
      const back = player.zones[ZONE.BACKSTAGE].splice(idx, 1)[0];
      player.zones[ZONE.BACKSTAGE].push(center);
      player.zones[ZONE.CENTER] = back;
      back.state = MEMBER_STATE.ACTIVE;
    }
    return { state, resolved: true, log: '中心 ↔ 活動後台交換' };
  });

  // 132. hBP04-068 大空スバル effectG: 1st 對此成員傷害 -20
  reg('hBP04-068', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => ({
    state, resolved: true, log: '對手 1st 傷害 -20',
  }));

  // 133. hBP04-072 大空スバル effectB + art1
  reg('hBP04-072', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    if (ctx.memberInst) sendCheerFromArchiveToMember(player, ctx.memberInst, '黃');
    return { state, resolved: true, log: '存檔黃吶喊→自身' };
  });
  reg('hBP04-072', HOOK.ON_ART_DECLARE, (state, ctx) => {
    let total = 0;
    for (const p of state.players) {
      for (const m of getStageMembers(p)) total += m.inst.attachedCheer.length;
    }
    const bonus = Math.min(8, total) * 10;
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: bonus, target: 'self', duration: 'instant' },
      log: `${total} 吶喊 → +${bonus}`,
    };
  });

  // 134. hBP06-097 カワイイスタジャン: HP +30 (passive)
  reg('hBP06-097', HOOK.ON_PLAY, (state, ctx) => ({ state, resolved: true, log: 'Buzz HP +30' }));

  // 135. hBP01-046 AZKi effectB: redistribute 1-3 cheer on stage
  reg('hBP01-046', HOOK.ON_BLOOM, (state, ctx) => {
    return { state, resolved: true, log: '可重新分配 1-3 張吶喊（手動）' };
  });

  // 136. hSD01-009 AZKi effectC: dice ≤4 → send cheer to backstage
  reg('hSD01-009', HOOK.ON_COLLAB, (state, ctx) => {
    const roll = rollDie();
    if (roll <= 4) {
      const player = state.players[ctx.player];
      const back = player.zones[ZONE.BACKSTAGE][0];
      if (back) sendCheerFromDeckToMember(player, back);
      if (roll === 1 && ctx.memberInst) {
        // Move this collab member to backstage
        if (player.zones[ZONE.COLLAB] === ctx.memberInst) {
          player.zones[ZONE.BACKSTAGE].push(ctx.memberInst);
          player.zones[ZONE.COLLAB] = null;
        }
      }
      return { state, resolved: true, log: `骰 ${roll}：送吶喊；若骰1則自身回後台` };
    }
    return { state, resolved: true, log: `骰 ${roll}：無效果` };
  });

  // 137. hSD08-007 角巻わため effectC: archive cheer → 4期生 2nd
  reg('hSD08-007', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    const target = getStageMembers(player).find(m => {
      const c = getCard(m.inst.cardId);
      return c?.bloom === '2nd' && hasTag(m.inst, '#4期生');
    });
    if (target) sendCheerFromArchiveToMember(player, target.inst);
    return { state, resolved: true, log: '存檔吶喊→#4期生 2nd' };
  });

  // 138. hBP01-007 星街すいせい oshi
  reg('hBP01-007', HOOK.ON_OSHI_SKILL, (state, ctx) => ({
    state, resolved: true,
    log: ctx.skillType === 'sp' ? 'SP: 對應傷害給後台' : '對 1 位後台 50 特殊傷害',
  }));

  // 139. hBP02-006 クレイジー・オリー oshi
  reg('hBP02-006', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      const player = state.players[ctx.player];
      drawCards(player, 4);
      archiveFromHand(player, 2);
      return { state, resolved: true, log: 'SP: 抽 4 棄 2，存檔成員可綻放' };
    }
    return { state, resolved: true, log: '#ID2期生 用存檔成員綻放' };
  });

  // 140. hSD01-019 スゴイパソコン: discard cheer → search 1st/2nd
  reg('hSD01-019', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    // Discard 1 cheer from any member
    const m = getStageMembers(player).find(x => x.inst.attachedCheer.length > 0);
    if (m) {
      player.zones[ZONE.ARCHIVE].push(m.inst.attachedCheer.shift());
      const prompt = makeSearchPrompt(player, ctx.player, c => {
        const card = getCard(c.cardId);
        return card?.bloom !== '1st Buzz' && (card?.bloom === '1st' || card?.bloom === '2nd');
      }, '搜尋 1st/2nd 成員加入手牌');
      if (prompt) return { state, resolved: false, prompt, log: '棄吶喊 → 搜尋 1st/2nd' };
      shuffleArr(player.zones[ZONE.DECK]);
      return { state, resolved: true, log: '棄吶喊，牌組無 1st/2nd' };
    }
    return { state, resolved: true };
  });

  // 141. hBP03-095 ホロキャップ tool: HP+30, immune special dmg (passive)
  reg('hBP03-095', HOOK.ON_PLAY, (state, ctx) => ({ state, resolved: true, log: 'Debut/Spot HP +30, 免疫特殊傷害' }));

  // 142. hBP03-034 赤井はあと effectB + art1
  reg('hBP03-034', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const prompt = makeArchivePrompt(player, ctx.player, c => {
      const card = getCard(c.cardId);
      return card?.bloom !== '1st Buzz' && (card?.bloom === '1st' || card?.bloom === '2nd') && hasTag(c, '#1期生');
    }, '選擇存檔區的 #1期生 1st/2nd 回手牌');
    if (prompt) return { state, resolved: false, prompt, log: '存檔 #1期生 1st/2nd 回手牌' };
    return { state, resolved: true, log: '存檔無符合條件的卡' };
  });
  reg('hBP03-034', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const roll = rollDie();
    if (roll % 2 === 1) {
      damageOpponent(state, ctx.player, 20, 'center');
      damageOpponent(state, ctx.player, 20, 'collab');
      return { state, resolved: true, log: `骰 ${roll}：中心+聯動 20 特殊傷害` };
    } else {
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 40, target: 'self', duration: 'instant' },
        log: `骰 ${roll}：+40`,
      };
    }
  });

  // 143. hBP07-041 赤井はあと effectC + art1
  reg('hBP07-041', HOOK.ON_COLLAB, (state, ctx) => {
    damageOpponent(state, ctx.player, 50, 'collab');
    return { state, resolved: true, log: '對手聯動 50 特殊傷害' };
  });
  reg('hBP07-041', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const player = state.players[ctx.player];
    let allRed = true;
    for (const m of getStageMembers(player)) {
      for (const c of m.inst.attachedCheer) {
        if (getCard(c.cardId)?.color !== '紅') { allRed = false; break; }
      }
      if (!allRed) break;
    }
    if (allRed) {
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 20, target: 'self', duration: 'instant' },
        log: '全紅吶喊 → +20',
      };
    }
    return { state, resolved: true };
  });

  // 144. hBP01-060 鷹嶺ルイ effectB: from Debut, discard 1 → draw 2
  reg('hBP01-060', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    if (player.zones[ZONE.HAND].length > 0) {
      archiveFromHand(player, 1);
      drawCards(player, 2);
      return { state, resolved: true, log: '棄 1 抽 2' };
    }
    return { state, resolved: true };
  });

  // 145. hBP06-003 風真いろは oshi
  reg('hBP06-003', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      const player = state.players[ctx.player];
      let total = 0;
      for (const m of getStageMembers(player)) total += m.inst.attachedCheer.length;
      const hasBuzz = getStageMembers(player).some(m => getCard(m.inst.cardId)?.bloom === '1st Buzz');
      if (hasBuzz) drawCards(player, 3);
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: total * 10, target: 'name:風真いろは', duration: 'turn' },
        log: `風真 +${total * 10}（有 Buzz 抽 3）`,
      };
    }
    const player = state.players[ctx.player];
    const target = getStageMembers(player).find(m => {
      const c = getCard(m.inst.cardId);
      return c?.bloom === '1st Buzz' || c?.name === '風真いろは';
    });
    if (target) sendCheerFromDeckToMember(player, target.inst);
    return { state, resolved: true, log: '送吶喊給 Buzz/風真' };
  });

  // 146. hSD06-006 風真いろは effectB: search ﾁｬｷ丸 or ぽこべぇ
  reg('hSD06-006', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const prompt = makeSearchPrompt(player, ctx.player, c => {
      const n = getCard(c.cardId)?.name;
      return n === 'ﾁｬｷ丸' || n === 'ぽこべぇ';
    }, '搜尋ﾁｬｷ丸或ぽこべぇ加入手牌');
    if (prompt) return { state, resolved: false, prompt, log: '搜尋ﾁｬｷ丸/ぽこべぇ' };
    shuffleArr(player.zones[ZONE.DECK]);
    return { state, resolved: true, log: '牌組無ﾁｬｷ丸/ぽこべぇ' };
  });

  // 147. hBP06-004 百鬼あやめ oshi
  reg('hBP06-004', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    const player = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const redCount = player.zones[ZONE.ARCHIVE].filter(c => {
        const card = getCard(c.cardId);
        return card?.type === '吶喊' && card?.color === '紅';
      }).length;
      const opp = state.players[1 - ctx.player];
      const target = opp.zones[ZONE.CENTER] || opp.zones[ZONE.COLLAB];
      if (target) applyDamageToMember(target, redCount * 20);
      return { state, resolved: true, log: `${redCount}×紅 → ${redCount * 20} 特殊傷害` };
    }
    let archived = 0;
    for (let i = 0; i < 2 && player.zones[ZONE.CHEER_DECK].length > 0; i++) {
      player.zones[ZONE.ARCHIVE].push(player.zones[ZONE.CHEER_DECK].shift());
      archived++;
    }
    drawCards(player, archived);
    return { state, resolved: true, log: `棄 ${archived} 吶喊 → 抽 ${archived}` };
  });

  // 148. hSD02-004 百鬼あやめ effectC: if has ぽよ余 → +20
  reg('hSD02-004', HOOK.ON_COLLAB, (state, ctx) => {
    const hasMascot = ctx.memberInst?.attachedSupport?.some(s => getCard(s.cardId)?.name === 'ぽよ余');
    if (hasMascot) {
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 20, target: 'center', duration: 'turn' },
        log: '有ぽよ余 → 中心 +20',
      };
    }
    return { state, resolved: true };
  });

  // 149. hBP01-107 アンコール: return 1-3 archive cheer to cheer deck
  reg('hBP01-107', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    let returned = 0;
    while (returned < 3) {
      const idx = findArchiveCheer(player);
      if (idx < 0) break;
      const cheer = player.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
      player.zones[ZONE.CHEER_DECK].push(cheer);
      returned++;
    }
    shuffleArr(player.zones[ZONE.CHEER_DECK]);
    return { state, resolved: true, log: `${returned} 吶喊回吶喊牌組` };
  });

  // 150. hBP06-098 鬼神刀「阿修羅」 tool
  reg('hBP06-098', HOOK.ON_ART_DECLARE, (state, ctx) => ({
    state, resolved: true,
    effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
    log: '道具 +10',
  }));

  // 151. hBP04-104 スバルドダック mascot
  reg('hBP04-104', HOOK.ON_ART_DECLARE, (state, ctx) => {
    let total = 0;
    for (const p of state.players) {
      for (const m of getStageMembers(p)) total += m.inst.attachedCheer.length;
    }
    const bonus = total >= 10 ? 20 : 0;
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: bonus, target: 'self', duration: 'instant' },
      log: bonus ? `總吶喊 ≥10 → +20` : 'HP +20',
    };
  });

  // 152. hBP06-104 スバ友 fan
  reg('hBP06-104', HOOK.ON_PLAY, (state, ctx) => ({ state, resolved: true, log: '粉絲附加' }));

  // 153. hBP07-003 大神ミオ oshi
  reg('hBP07-003', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    const player = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const top6 = player.zones[ZONE.DECK].splice(0, 6);
      const keep = top6.slice(0, 3);
      const back = top6.slice(3);
      keep.forEach(c => { c.faceDown = false; player.zones[ZONE.HAND].push(c); });
      player.zones[ZONE.DECK].unshift(...back);
      // Heal all members
      for (const m of getStageMembers(player)) {
        m.inst.damage = Math.max(0, m.inst.damage - 50);
      }
      return { state, resolved: true, log: 'SP: 看 6 取 3，所有成員回 50 HP' };
    }
    const top2 = player.zones[ZONE.DECK].splice(0, 2);
    if (top2.length > 0) {
      top2[0].faceDown = false;
      player.zones[ZONE.HAND].push(top2[0]);
      for (let i = 1; i < top2.length; i++) player.zones[ZONE.DECK].unshift(top2[i]);
    }
    return { state, resolved: true, log: '看頂 2 取 1' };
  });

  // 153b. hBP07-005 オーロ・クロニー oshi
  // oshiSkill: 【1/turn】 Draw 2 from BOTTOM of deck, then send 1 hand card to archive (= save area).
  // sp:        【1/game】 If center is 2nd オーロ・クロニー, take an extra turn after this round. (Round B)
  reg('hBP07-005', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    const player = state.players[ctx.player];

    if (ctx.skillType === 'sp') {
      // SP — placeholder until Round B implements the extra-turn logic
      return { state, resolved: true, log: 'SP（Round B 待實作：條件式追加回合）' };
    }

    // Draw 2 from BOTTOM (top of deck = front of array per processCheerAssign convention)
    const deck = player.zones[ZONE.DECK];
    const drawn = [];
    for (let i = 0; i < 2 && deck.length > 0; i++) {
      const c = deck.pop();  // pop = bottom
      c.faceDown = false;
      drawn.push(c);
      player.zones[ZONE.HAND].push(c);
    }

    if (player.zones[ZONE.HAND].length === 0) {
      return { state, resolved: true, log: `從牌底抽 ${drawn.length} 張，手牌空無法存檔` };
    }

    // Prompt the player to choose 1 hand card to send to archive (save area)
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT',
        player: ctx.player,
        message: '選 1 張手牌放到存檔區',
        cards: player.zones[ZONE.HAND].map(c => ({
          instanceId: c.instanceId,
          cardId: c.cardId,
          name: getCard(c.cardId)?.name || '',
          image: getCardImage(c.cardId),
        })),
        maxSelect: 1,
        afterAction: 'HAND_TO_ARCHIVE',
      },
      log: `從牌底抽 ${drawn.length} 張`,
    };
  });

  // 154. hBP01-074 ハコス・ベールズ effectB
  reg('hBP01-074', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const idx = player.zones[ZONE.ARCHIVE].findIndex(c => {
      const card = getCard(c.cardId);
      return card && isMember(card.type) && (card.bloom === 'Debut' || card.bloom === '1st');
    });
    if (idx >= 0) {
      const card = player.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
      player.zones[ZONE.HAND].push(card);
      if (hasTag(card, '#EN')) {
        damageOpponent(state, ctx.player, 20, 'collab');
      }
    }
    return { state, resolved: true, log: '存檔成員回手牌' };
  });

  // 155. hBP01-124 開拓者 fan
  reg('hBP01-124', HOOK.ON_PLAY, (state, ctx) => ({ state, resolved: true, log: '開拓者附加' }));

  // 156. hBP05-082 アキ・ローゼンタールの斧 tool
  reg('hBP05-082', HOOK.ON_ART_DECLARE, (state, ctx) => ({
    state, resolved: true,
    effect: { type: 'DAMAGE_BOOST', amount: 10, target: 'self', duration: 'instant' },
    log: '斧 +10',
  }));

  // 157. hSD01-002 AZKi oshi
  reg('hSD01-002', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      const player = state.players[ctx.player];
      const greenMember = getStageMembers(player).find(m => getCard(m.inst.cardId)?.color === '綠');
      if (greenMember) {
        let sent = 0;
        while (sent < 5) {
          const idx = findArchiveCheer(player);
          if (idx < 0) break;
          const cheer = player.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
          greenMember.inst.attachedCheer.push(cheer);
          sent++;
        }
        return { state, resolved: true, log: `送 ${sent} 張存檔吶喊給綠色成員` };
      }
    }
    return { state, resolved: true, log: '骰子點數宣言' };
  });

  // 158. hBP02-076 カスタムパソコン: reveal Debut → search same name 1st
  reg('hBP02-076', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    const handDebut = player.zones[ZONE.HAND].findIndex(c => {
      const card = getCard(c.cardId);
      return card && isMember(card.type) && card.bloom === 'Debut';
    });
    if (handDebut >= 0) {
      const debutCard = player.zones[ZONE.HAND].splice(handDebut, 1)[0];
      player.zones[ZONE.DECK].push(debutCard);
      const debutName = getCard(debutCard.cardId)?.name;
      const prompt = makeSearchPrompt(player, ctx.player, c => {
        const card = getCard(c.cardId);
        return card?.name === debutName && card.bloom === '1st' && card.bloom !== '1st Buzz';
      }, `展示 ${debutName} → 搜尋同名 1st 加入手牌`);
      if (prompt) return { state, resolved: false, prompt, log: '展示 Debut → 搜尋同名 1st' };
      shuffleArr(player.zones[ZONE.DECK]);
    }
    return { state, resolved: true, log: '展示 Debut，牌組無同名 1st' };
  });

  // 159. hBP07-004 赤井はあと oshi
  reg('hBP07-004', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    const player = state.players[ctx.player];
    const idx = player.zones[ZONE.BACKSTAGE].findIndex(m => {
      const c = getCard(m.cardId);
      return c?.name === '赤井はあと' && c.bloom === 'Debut';
    });
    if (idx >= 0) {
      const card = player.zones[ZONE.BACKSTAGE].splice(idx, 1)[0];
      player.zones[ZONE.DECK].push(card);
      shuffleArr(player.zones[ZONE.DECK]);
    }
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 50, target: 'name:赤井はあと', duration: 'turn' },
      log: '回 1 張 Debut → 1 位赤井はあと +50',
    };
  });

  // 160. hBP02-039 沙花叉クロヱ effectG + art1 (similar to hBP02-040)
  reg('hBP02-039', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => ({
    state, resolved: true, log: '展示牌中 1 張支援卡可加入手牌',
  }));
  reg('hBP02-039', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const player = state.players[ctx.player];
    const top3 = player.zones[ZONE.DECK].splice(0, 3);
    let memberCount = 0;
    for (const c of top3) {
      c.faceDown = false;
      if (isMember(getCard(c.cardId)?.type)) memberCount++;
      player.zones[ZONE.ARCHIVE].push(c);
    }
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: memberCount * 20, target: 'self', duration: 'instant' },
      log: `${memberCount} 成員 → +${memberCount * 20}`,
    };
  });

  // 161. hBP06-025 風真いろは effectG
  reg('hBP06-025', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => ({
    state, resolved: true, log: '中心/聯動位置：其他 #holoX +20 dmg',
  }));

  // 162. hBP03-066 戌神ころね effectG + art1
  reg('hBP03-066', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => ({
    state, resolved: true, log: '被擊倒時送吶喊給戌神',
  }));
  reg('hBP03-066', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const stack = ctx.memberInst?.bloomStack?.length || 0;
    if (stack > 0) {
      ctx.memberInst.bloomStack.pop();
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: 50, target: 'self', duration: 'instant' },
        log: '棄 1 張 1st 重疊 → +50',
      };
    }
    return { state, resolved: true };
  });

  // 163. hBP06-094 ワークアウト
  reg('hBP06-094', HOOK.ON_PLAY, (state, ctx) => ({
    state, resolved: true,
    effect: { type: 'DAMAGE_BOOST', amount: 20, target: 'choose', duration: 'turn' },
    log: '1 位成員 +20（Buzz/2nd 再 +50）',
  }));

  // 164. hBP04-006 大空スバル oshi
  reg('hBP04-006', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      const player = state.players[ctx.player];
      if (player.zones[ZONE.LIFE].length <= 3) {
        return {
          state, resolved: true,
          effect: { type: 'DAMAGE_BOOST', amount: 100, target: 'name:大空スバル', duration: 'turn' },
          log: 'SP: 中心大空スバル +100',
        };
      }
    }
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_REDUCTION', amount: 30, duration: 'persistent' },
      log: '所有大空スバル受傷 -30',
    };
  });

  // 165. hBP02-007 森カリオペ oshi
  reg('hBP02-007', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    const player = state.players[ctx.player];
    if (ctx.skillType !== 'sp') {
      archiveFromHand(player, 2);
      const prompt = makeArchivePrompt(player, ctx.player, c => isMember(getCard(c.cardId)?.type) && hasTag(c, '#EN'), '選擇存檔區的 #EN 成員回手牌（最多 2 張）', 2);
      if (prompt) return { state, resolved: false, prompt, log: '棄 2 → 存檔 #EN 成員回手牌' };
      return { state, resolved: true, log: '棄 2，存檔無 #EN 成員' };
    }
    return { state, resolved: true, log: 'SP: 森カリオペ可雙重藝能' };
  });

  // 166. hBP07-104 Thorn tool
  reg('hBP07-104', HOOK.ON_ART_DECLARE, (state, ctx) => {
    let bonus = 20;
    if (ctx.memberInst?.damage > 0) {
      const card = getCard(ctx.memberInst.cardId);
      if (card?.bloom === '2nd') bonus += 20;
    }
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: bonus, target: 'self', duration: 'instant' },
      log: `Thorn +${bonus}`,
    };
  });

  // 167. hBP07-001 角巻わため oshi
  reg('hBP07-001', HOOK.ON_OSHI_SKILL, (state, ctx) => ({
    state, resolved: true,
    effect: { type: 'DAMAGE_BOOST', amount: 100, target: 'name:角巻わため', duration: 'turn' },
    log: '所有角巻わため +100',
  }));

  // 168. hBP07-013 角巻わため effectC + art1
  reg('hBP07-013', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    const center = player.zones[ZONE.CENTER];
    if (center && center.attachedCheer.length >= 6) {
      drawCards(player, 2);
    }
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 20, target: 'name:角巻わため', duration: 'turn' },
      log: '所有角巻わため +20（中心 ≥6 吶喊則抽 2）',
    };
  });
  reg('hBP07-013', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const member = ctx.memberInst;
    const wataCount = (member?.attachedSupport || []).filter(s => getCard(s.cardId)?.name === 'わためいと').length;
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: wataCount * 50, target: 'self', duration: 'instant' },
      log: `${wataCount} わためいと → +${wataCount * 50}`,
    };
  });

  // 169. hBP03-070 角巻わため effectB + art1
  reg('hBP03-070', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    if (getStageMembers(player).length <= 5) {
      const prompt = makeSearchPrompt(player, ctx.player, c => {
        const card = getCard(c.cardId);
        return card?.name === '角巻わため' && card.bloom === 'Debut';
      }, '搜尋 Debut 角巻わため放置到舞台', 'PLACE_AND_SHUFFLE');
      if (prompt) return { state, resolved: false, prompt, log: '搜尋 Debut 角巻わため' };
      shuffleArr(player.zones[ZONE.DECK]);
    }
    return { state, resolved: true, log: '牌組無 Debut 角巻わため' };
  });
  reg('hBP03-070', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    const back = player.zones[ZONE.BACKSTAGE].find(m => getCard(m.cardId)?.name === '角巻わため');
    if (back) sendCheerFromDeckToMember(player, back);
    return { state, resolved: true, log: '送吶喊給後台角巻わため' };
  });

  // 170. hSD01-020 ホロリスの輪: dice ≥3 → send archive cheer
  reg('hSD01-020', HOOK.ON_PLAY, (state, ctx) => {
    const roll = rollDie();
    if (roll >= 3) {
      const player = state.players[ctx.player];
      const target = getStageMembers(player)[0];
      if (target) sendCheerFromArchiveToMember(player, target.inst);
      return { state, resolved: true, log: `骰 ${roll}：送存檔吶喊給成員` };
    }
    return { state, resolved: true, log: `骰 ${roll}：無效果` };
  });

  // 171. hBP01-045 AZKi effectG: life ≤3 → ignore bloom levels
  reg('hBP01-045', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => ({
    state, resolved: true, log: '生命≤3 → 可從手牌直接綻放為 2nd',
  }));

  // 172. hSD13-007 エリザベス effectG + art1
  reg('hSD13-007', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => {
    const cheerCount = ctx.memberInst?.attachedCheer?.length || 0;
    return { state, resolved: true, log: `每張吶喊 HP +10 (${cheerCount * 10})` };
  });
  reg('hSD13-007', HOOK.ON_ART_DECLARE, (state, ctx) => {
    const cheerCount = ctx.memberInst?.attachedCheer?.length || 0;
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: cheerCount * 20, target: 'self', duration: 'instant' },
      log: `${cheerCount} 吶喊 → +${cheerCount * 20}`,
    };
  });
  reg('hSD13-007', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    const player = state.players[ctx.player];
    if (ctx.memberInst) sendCheerFromDeckToMember(player, ctx.memberInst);
    return { state, resolved: true, log: '擊倒後送吶喊' };
  });

  return count;
}
