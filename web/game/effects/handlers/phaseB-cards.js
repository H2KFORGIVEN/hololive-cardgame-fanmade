// Phase B: Card-specific handlers for ranks 51-200 (122 cards)
// Each handler implements multi-step effect logic

import { getCard, getCardImage } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE, MEMBER_STATE, isMember, isSupport } from '../../core/constants.js';
import { applyDamageToMember, drawCards, getStageMembers } from './common.js';
import { removeInstance } from '../../core/GameState.js';

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

  // 54. hBP06-099 ゆび tool:
  //   • +10 art damage to equipped member — handled by AttachedSupportEffects
  //     registry (read by processUseArt); this handler is only for the
  //     on-attach archive trigger.
  //   • Spec: "attached from hand to 戌神ころね → may return 1 戌神ころね from
  //     archive to hand". Only fires when the attached-to target is a
  //     戌神ころね. Locate the equipped member by walking own stage and
  //     finding the just-attached ゆび.
  reg('hBP06-099', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    // Find which stage member just received this ゆび (cardId match — there
    // can be at most one new attach per ON_PLAY event since processPlaySupport
    // handles one support at a time).
    let attachedTo = null;
    const stage = [
      player.zones[ZONE.CENTER],
      player.zones[ZONE.COLLAB],
      ...(player.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean);
    for (const m of stage) {
      if ((m.attachedSupport || []).some(s => s.cardId === ctx.cardId)) {
        attachedTo = m; break;
      }
    }
    if (!attachedTo) {
      return { state, resolved: true, log: 'ゆび: 未附加成員' };
    }
    const targetName = getCard(attachedTo.cardId)?.name;
    if (targetName !== '戌神ころね') {
      return { state, resolved: true, log: `ゆび 附加給 ${targetName}（非戌神ころね，無觸發）` };
    }
    const prompt = makeArchivePrompt(
      player, ctx.player,
      c => getCard(c.cardId)?.name === '戌神ころね',
      '附加給戌神ころね觸發：選擇存檔區的戌神ころね回手牌'
    );
    if (prompt) return { state, resolved: false, prompt, log: 'ゆび → 戌神ころね 觸發' };
    return { state, resolved: true, log: 'ゆび → 戌神ころね 觸發（存檔無戌神）' };
  });

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
  // effectC: distribute 1-3 archive cheer to 1-3 #ID members (one each).
  // Player picks 1-3 #ID members; for each pick, the next archive cheer
  // (any color) attaches. Uses CHEER_FROM_ARCHIVE_TO_MEMBER multi-pick chain.
  reg('hBP01-055', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    const archiveCheer = player.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.type === '吶喊');
    if (archiveCheer.length === 0) return { state, resolved: true, log: '存檔區無吶喊' };
    const idMembers = getStageMembers(player).filter(m => hasTag(m.inst, '#ID'));
    if (idMembers.length === 0) return { state, resolved: true, log: '無 #ID 成員' };
    const max = Math.min(3, idMembers.length, archiveCheer.length);
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER',
        player: ctx.player,
        message: `選擇 1-${max} 位 #ID 成員接收吶喊（每人各 1 張，可跳過）`,
        cards: idMembers.map(m => ({
          instanceId: m.inst.instanceId,
          cardId: m.inst.cardId,
          name: getCard(m.inst.cardId)?.name || '',
          image: getCardImage(m.inst.cardId),
        })),
        maxSelect: max,
        afterAction: 'CHEER_FROM_ARCHIVE_TO_MEMBER',
        cheerColors: null,
      },
      log: '存檔吶喊分配給 #ID 成員',
    };
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

  // 88. hBP02-019 パヴォリア・レイネ effectC: send 1 archive cheer to a chosen own member
  reg('hBP02-019', HOOK.ON_COLLAB, (state, ctx) => {
    const player = state.players[ctx.player];
    const archiveCheer = player.zones[ZONE.ARCHIVE].filter(c => getCard(c.cardId)?.type === '吶喊');
    if (archiveCheer.length === 0) return { state, resolved: true, log: '存檔區無吶喊' };
    const stage = getStageMembers(player);
    if (stage.length === 0) return { state, resolved: true, log: '舞台無成員' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_OWN_MEMBER',
        player: ctx.player,
        message: '選擇接收 1 張存檔吶喊的己方成員',
        cards: stage.map(m => ({
          instanceId: m.inst.instanceId,
          cardId: m.inst.cardId,
          name: getCard(m.inst.cardId)?.name || '',
          image: getCardImage(m.inst.cardId),
        })),
        maxSelect: 1,
        afterAction: 'CHEER_FROM_ARCHIVE_TO_MEMBER',
        cheerColors: null,
      },
      log: '選擇成員接收存檔吶喊',
    };
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

  // 132. hBP04-068 大空スバル Debut effectG:
  //   [Limited center/collab] Damage from opponent 1st-bloom members to THIS
  //   member is −20.
  // Pushes DAMAGE_REDUCTION 20 when:
  //   • This passive owner is the target of the current attack
  //   • The attacker is opp side
  //   • The attacker's bloom is '1st' (NOT '1st Buzz', NOT '2nd')
  reg('hBP04-068', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => {
    if (!ctx.target || !ctx.attacker) return { state, resolved: true };
    if (ctx.target.instanceId !== ctx.memberInst?.instanceId) return { state, resolved: true };
    if (ctx.player === ctx.attackerPlayer) return { state, resolved: true };
    const atkCard = getCard(ctx.attacker.cardId);
    if (atkCard?.bloom !== '1st') return { state, resolved: true };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_REDUCTION', amount: 20, target: 'self', duration: 'instant' },
      log: 'スバル passive: 對手 1st 傷害 -20',
    };
  });

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

  // 135. hBP01-046 AZKi effectB: redistribute 1-3 cheer on stage to own members.
  // The full spec is "1-3 cheer", but a single CHEER_MOVE prompt only handles
  // ONE move. We surface ONE interactive cheer-move (auto-source = first
  // member with attached cheer; player picks target). Additional 1-2 moves
  // remain available via Manual Adjust — the log nudges the player.
  reg('hBP01-046', HOOK.ON_BLOOM, (state, ctx) => {
    const player = state.players[ctx.player];
    const stage = getStageMembers(player);
    const src = stage.find(m => (m.inst.attachedCheer || []).length > 0);
    if (!src) return { state, resolved: true, log: '舞台無吶喊可重新分配' };
    const targets = stage.filter(m => m.inst.instanceId !== src.inst.instanceId);
    if (targets.length === 0) return { state, resolved: true, log: '無其他成員可接收' };
    return {
      state, resolved: false,
      prompt: {
        type: 'CHEER_MOVE',
        player: ctx.player,
        message: `從「${getCard(src.inst.cardId)?.name || ''}」取 1 張吶喊轉給其他成員`,
        cards: targets.map(m => ({
          instanceId: m.inst.instanceId,
          cardId: m.inst.cardId,
          name: getCard(m.inst.cardId)?.name || '',
          image: getCardImage(m.inst.cardId),
        })),
        maxSelect: 1,
        afterAction: 'CHEER_MOVE',
        sourceInstanceId: src.inst.instanceId,
        cheerPredicate: 'any',
      },
      log: '可重新分配 1 張吶喊（剩餘 1-2 張可手動調整）',
    };
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
      // SP【1/game】: if center is 2nd オーロ・クロニー, take an extra turn
      //              after this round. Engine processEndPhase reads
      //              state.extraTurnQueued to skip the player switch.
      const center = player.zones[ZONE.CENTER];
      const TWO_ND_KURONII = ['hBP07-055', 'hBP07-056'];
      if (!center || !TWO_ND_KURONII.includes(center.cardId)) {
        return { state, resolved: true, log: 'SP 條件未達成（中心非 2nd オーロ・クロニー）' };
      }
      state.extraTurnQueued = ctx.player;
      return { state, resolved: true, log: 'SP: 本回合結束後追加 1 個回合' };
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

  // 153c. hBP07-056 オーロ・クロニー 2nd effectG「時界を統べし者」
  // 【Center limited】At your performance phase start, ONE other "オーロ・クロニー"
  // member can use the card overlapping with this member to bloom.
  //
  // The cross-bloom action (transferring this 2nd's bloom-stack 1st card to
  // bloom a different クロニー Debut) is too engine-specific to fully
  // automate without a custom action type. We surface it as a player-visible
  // hint at the right moment so the user can perform it via Manual Adjust.
  reg('hBP07-056', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => {
    if (ctx.triggerEvent !== 'performance_start') return { state, resolved: true };
    const player = state.players[ctx.player];
    // Center-only
    if (player.zones[ZONE.CENTER]?.instanceId !== ctx.memberInst?.instanceId) {
      return { state, resolved: true };
    }
    // Find another クロニー on stage at lower bloom (Debut)
    const KURONII_DEBUT = ['hBP07-050', 'hBP07-051', 'hBP01-092'];
    const otherKuronii = [];
    const checkMember = (m, label) => {
      if (m && m.instanceId !== ctx.memberInst.instanceId && KURONII_DEBUT.includes(m.cardId)) {
        otherKuronii.push({ inst: m, label });
      }
    };
    checkMember(player.zones[ZONE.CENTER], 'center');
    checkMember(player.zones[ZONE.COLLAB], 'collab');
    (player.zones[ZONE.BACKSTAGE] || []).forEach((m, i) => checkMember(m, `back#${i}`));

    if (otherKuronii.length === 0) {
      return { state, resolved: true }; // silent — no eligible target
    }
    return {
      state, resolved: true,
      log: `時界を統べし者: 表演開始 — 可手動將此 2nd 的 bloom 堆移轉給其他 ${otherKuronii.length} 隻 クロニー`,
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

  // 161. hBP06-025 風真いろは 1st effectG:
  //   [Limited center/collab] All other own #秘密結社holoX members +20 art damage.
  // Fires per art declaration through firePassiveModifiers. We're a real
  // boost push when:
  //   • This passive owner is in own center or collab
  //   • The attacker is also own (same player) and not this member
  //   • The attacker has the #秘密結社holoX tag
  reg('hBP06-025', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => {
    if (!ctx.attacker) return { state, resolved: true };
    if (ctx.player !== ctx.attackerPlayer) return { state, resolved: true };
    if (ctx.attacker.instanceId === ctx.memberInst?.instanceId) return { state, resolved: true };
    const me = ctx.memberInst;
    const myPlayer = state.players[ctx.player];
    const myZone = myPlayer?.zones[ZONE.CENTER]?.instanceId === me?.instanceId ? 'center'
                 : myPlayer?.zones[ZONE.COLLAB]?.instanceId === me?.instanceId ? 'collab'
                 : null;
    if (!myZone) return { state, resolved: true };
    const atkCard = getCard(ctx.attacker.cardId);
    const atkTag = (atkCard?.tag || '');
    const tagStr = typeof atkTag === 'string' ? atkTag : JSON.stringify(atkTag);
    if (!tagStr.includes('#秘密結社holoX')) return { state, resolved: true };
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 20, target: 'self', duration: 'instant' },
      log: 'いろは passive: holoX 友方 +20',
    };
  });

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

  // ── Round E-1: ON_KNOCKDOWN target-side reactive ─────────────────────────
  // For each card the trigger condition is "this member is the one being
  // knocked out": ctx.cardId === <my id> AND ctx.memberInst is the dying
  // instance. The handler runs BEFORE archiveMember, so target.attachedCheer
  // and own.zones still hold the live state. Mutating ctx.memberInst.
  // attachedCheer here is fine — archiveMember will then push only the
  // REMAINING cheer to archive.

  // E-1.1 hBP03-066 戌神ころね 2nd:
  //   "When this member is knocked, send 1 from cheer deck top to your 戌神ころね."
  reg('hBP03-066', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP03-066') return { state, resolved: true };
    const own = state.players[ctx.player];
    // Find another own 戌神ころね on stage (not self)
    const stage = [
      own.zones[ZONE.CENTER], own.zones[ZONE.COLLAB],
      ...(own.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean);
    const target = stage.find(m =>
      m.instanceId !== ctx.memberInst?.instanceId &&
      getCard(m.cardId)?.name === '戌神ころね'
    );
    if (!target) return { state, resolved: true, log: 'hBP03-066: 無其他戌神ころね' };
    if (sendCheerFromDeckToMember(own, target)) {
      return { state, resolved: true, log: 'hBP03-066: 吶喊牌組頂送給戌神ころね' };
    }
    return { state, resolved: true, log: 'hBP03-066: 吶喊牌組空' };
  });

  // E-1.2 hBP03-072 角巻わため 2nd:
  //   "When this member is knocked, may move 1 of this member's cheer to
  //    another of your 角巻わため."
  reg('hBP03-072', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP03-072') return { state, resolved: true };
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    if (!me?.attachedCheer?.length) return { state, resolved: true, log: 'hBP03-072: 自身無吶喊' };
    const stage = [
      own.zones[ZONE.CENTER], own.zones[ZONE.COLLAB],
      ...(own.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean);
    const target = stage.find(m =>
      m.instanceId !== me.instanceId &&
      getCard(m.cardId)?.name === '角巻わため'
    );
    if (!target) return { state, resolved: true, log: 'hBP03-072: 無其他角巻わため' };
    const cheer = me.attachedCheer.shift();
    if (!target.attachedCheer) target.attachedCheer = [];
    target.attachedCheer.push(cheer);
    return { state, resolved: true, log: 'hBP03-072: 1 張吶喊→其他わため' };
  });

  // E-1.3 hBP04-063 古石ビジュー Debut:
  //   "During opp turn, when this member is knocked, draw 1."
  reg('hBP04-063', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP04-063') return { state, resolved: true };
    if (state.activePlayer !== ctx.attackerPlayer) return { state, resolved: true };
    const own = state.players[ctx.player];
    drawCards(own, 1);
    return { state, resolved: true, log: 'hBP04-063: 抽 1' };
  });

  // E-1.4 hBP04-079 夏色まつり Debut:
  //   "During opp turn, when this member is knocked, may move 1 cheer
  //    of this member to another of your members."
  reg('hBP04-079', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP04-079') return { state, resolved: true };
    if (state.activePlayer !== ctx.attackerPlayer) return { state, resolved: true };
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    if (!me?.attachedCheer?.length) return { state, resolved: true, log: 'hBP04-079: 自身無吶喊' };
    const stage = [
      own.zones[ZONE.CENTER], own.zones[ZONE.COLLAB],
      ...(own.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean);
    const target = stage.find(m => m.instanceId !== me.instanceId);
    if (!target) return { state, resolved: true, log: 'hBP04-079: 無其他成員' };
    const cheer = me.attachedCheer.shift();
    if (!target.attachedCheer) target.attachedCheer = [];
    target.attachedCheer.push(cheer);
    return { state, resolved: true, log: 'hBP04-079: 1 張吶喊→其他成員' };
  });

  // E-1.5 hBP04-088 ジジ・ムリン Spot:
  //   "During opp turn, when this member is knocked, send cheer-deck top
  //    to one of your members."
  reg('hBP04-088', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP04-088') return { state, resolved: true };
    if (state.activePlayer !== ctx.attackerPlayer) return { state, resolved: true };
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    const stage = [
      own.zones[ZONE.CENTER], own.zones[ZONE.COLLAB],
      ...(own.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean);
    const target = stage.find(m => m.instanceId !== me?.instanceId);
    if (!target) return { state, resolved: true, log: 'hBP04-088: 無其他成員' };
    if (sendCheerFromDeckToMember(own, target)) {
      return { state, resolved: true, log: 'hBP04-088: 吶喊牌組頂→成員' };
    }
    return { state, resolved: true, log: 'hBP04-088: 吶喊牌組空' };
  });

  // ── End of Round E-1 ──

  // ── Round E-2: ON_KNOCKDOWN target-side conditional / return-to-hand ─────
  // Helper: archive attached parts, then push the member card to hand —
  // used for "return self to hand" patterns. Caller still sets
  // ctx.cancelKnockdown = true so processKnockdown skips its own archive.
  function returnSelfToHand(state, ownPlayerIdx, memberInst) {
    const own = state.players[ownPlayerIdx];
    const inst = removeInstance(own, memberInst.instanceId);
    if (!inst) return false;
    // Spec: only the member card returns; cheer / support / stack go to archive.
    for (const c of (inst.attachedCheer || [])) own.zones[ZONE.ARCHIVE].push(c);
    for (const s of (inst.attachedSupport || [])) own.zones[ZONE.ARCHIVE].push(s);
    // Bloom-stack entries are stored as cardIds (or {cardId} markers); we
    // don't have createCardInstance here, so leave them as-is — archiveMember
    // wouldn't run for cancelled knockdown so they just disappear. That's
    // close enough to RAW for the pragmatic batch.
    inst.attachedCheer = []; inst.attachedSupport = []; inst.bloomStack = [];
    inst.damage = 0;
    own.zones[ZONE.HAND].push(inst);
    return true;
  }

  // E-2.1 hBP04-023 儒烏風亭らでん 1st:
  //   "During opp turn, when this member is knocked, may move 1 of this
  //    member's cheer to another own #ReGLOSS member."
  reg('hBP04-023', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP04-023') return { state, resolved: true };
    if (state.activePlayer !== ctx.attackerPlayer) return { state, resolved: true };
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    if (!me?.attachedCheer?.length) return { state, resolved: true, log: 'hBP04-023: 自身無吶喊' };
    const stage = [
      own.zones[ZONE.CENTER], own.zones[ZONE.COLLAB],
      ...(own.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean);
    const target = stage.find(m => {
      if (m.instanceId === me.instanceId) return false;
      const tag = getCard(m.cardId)?.tag || '';
      return (typeof tag === 'string' ? tag : JSON.stringify(tag)).includes('#ReGLOSS');
    });
    if (!target) return { state, resolved: true, log: 'hBP04-023: 無其他 #ReGLOSS 成員' };
    const cheer = me.attachedCheer.shift();
    if (!target.attachedCheer) target.attachedCheer = [];
    target.attachedCheer.push(cheer);
    return { state, resolved: true, log: 'hBP04-023: 1 張吶喊→其他 #ReGLOSS' };
  });

  // E-2.2 hBP04-077 アーニャ・メルフィッサ 1st:
  //   "During opp turn, when this member is knocked, choose 1 from this member
  //    and all overlapping members; that one returns to hand."
  // Pragmatic: auto-pick self (the most-bloomed member is usually the most
  // valuable to save). Stack-entry option deferred to a future batch since
  // it would need a player-prompt that fires INSIDE processKnockdown
  // synchronously, which the engine doesn't support cleanly.
  reg('hBP04-077', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP04-077') return { state, resolved: true };
    if (state.activePlayer !== ctx.attackerPlayer) return { state, resolved: true };
    const own = state.players[ctx.player];
    if (!returnSelfToHand(state, ctx.player, ctx.memberInst)) {
      return { state, resolved: true, log: 'hBP04-077: 無法返回手牌' };
    }
    ctx.cancelKnockdown = true;
    return { state, resolved: true, log: 'hBP04-077: 自身返回手牌（自動選擇本體）' };
  });

  // E-2.3 hBP06-020 響咲リオナ 2nd:
  //   "During opp turn, when this member is knocked, may put deck-top 2 to
  //    archive. If done, draw 1 per distinct-named #FLOW GLOW on stage."
  // Auto-do (no explicit skip option in pragmatic implementation).
  reg('hBP06-020', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP06-020') return { state, resolved: true };
    if (state.activePlayer !== ctx.attackerPlayer) return { state, resolved: true };
    const own = state.players[ctx.player];
    // Put deck top 2 → archive
    let placed = 0;
    for (let i = 0; i < 2 && own.zones[ZONE.DECK].length > 0; i++) {
      const c = own.zones[ZONE.DECK].shift();
      c.faceDown = false;
      own.zones[ZONE.ARCHIVE].push(c);
      placed++;
    }
    if (placed === 0) return { state, resolved: true, log: 'hBP06-020: 牌組空' };
    // Count distinct-named #FLOW GLOW on stage (the dying member is still on stage here)
    const stage = [
      own.zones[ZONE.CENTER], own.zones[ZONE.COLLAB],
      ...(own.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean);
    const names = new Set();
    for (const m of stage) {
      const card = getCard(m.cardId);
      const tag = card?.tag || '';
      const tagStr = typeof tag === 'string' ? tag : JSON.stringify(tag);
      if (tagStr.includes('#FLOW GLOW')) names.add(card.name);
    }
    const drawN = names.size;
    if (drawN > 0) drawCards(own, drawN);
    return { state, resolved: true, log: `hBP06-020: 棄 ${placed} → 抽 ${drawN}` };
  });

  // E-2.4 hBP07-084 夏色まつり 2nd:
  //   "During opp turn, when this member is knocked, may put 1 LIMITED support
  //    from archive to deck bottom. If done, return this member to hand."
  reg('hBP07-084', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP07-084') return { state, resolved: true };
    if (state.activePlayer !== ctx.attackerPlayer) return { state, resolved: true };
    const own = state.players[ctx.player];
    // Find a LIMITED support in archive
    const idx = own.zones[ZONE.ARCHIVE].findIndex(c => {
      const card = getCard(c.cardId);
      if (!card?.type?.startsWith('支援')) return false;
      const s = typeof card.supportEffect === 'object'
        ? (card.supportEffect['zh-TW'] || card.supportEffect.ja || card.supportEffect.en || '')
        : (card.supportEffect || '');
      return s.includes('LIMITED');
    });
    if (idx < 0) return { state, resolved: true, log: 'hBP07-084: 存檔無 LIMITED 支援' };
    const support = own.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
    own.zones[ZONE.DECK].push(support);
    if (!returnSelfToHand(state, ctx.player, ctx.memberInst)) {
      // Couldn't return to hand — undo the support move (defensive)
      own.zones[ZONE.DECK].pop();
      own.zones[ZONE.ARCHIVE].push(support);
      return { state, resolved: true, log: 'hBP07-084: 無法返回手牌' };
    }
    ctx.cancelKnockdown = true;
    return { state, resolved: true, log: 'hBP07-084: LIMITED→牌底，自身返回手牌' };
  });

  // ── End of Round E-2 ──

  // ── Round E-3: ON_KNOCKDOWN broadcast — "this member knocks opp" ─────────
  // These handlers register on ON_KNOCKDOWN and gate on
  // ctx.triggerEvent === 'member_knocked' (the broadcast fan-out from
  // processKnockdown). For "THIS member is the killer" cards, also gate on
  // ctx.attacker?.instanceId — but ctx.attacker isn't carried in the broadcast
  // (the attacker info is implicit: ctx.attackerPlayer says which side did
  // the killing). For "this is the attacker" we check that this member is
  // currently in the attacker's center or collab (since arts only come from
  // those positions); for "any own member kills" we just check ctx.player
  // === ctx.attackerPlayer.

  function isAttackingMember(state, ctx) {
    // True if ctx.memberInst is in own center or collab on the attacking side
    if (ctx.player !== ctx.attackerPlayer) return false;
    const own = state.players[ctx.player];
    if (!own || !ctx.memberInst) return false;
    return own.zones[ZONE.CENTER]?.instanceId === ctx.memberInst.instanceId
        || own.zones[ZONE.COLLAB]?.instanceId === ctx.memberInst.instanceId;
  }

  // E-3.1 hBP05-061 ネリッサ・レイヴンクロフト 2nd:
  //   "When this member knocks opp → draw 2."
  reg('hBP05-061', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP05-061') return { state, resolved: true };
    if (ctx.triggerEvent !== 'member_knocked') return { state, resolved: true };
    if (!isAttackingMember(state, ctx)) return { state, resolved: true };
    drawCards(state.players[ctx.player], 2);
    return { state, resolved: true, log: 'hBP05-061: 擊倒對手 → 抽 2' };
  });

  // E-3.2 hBP04-013 博衣こより 2nd:
  //   "When this member knocks opp → put deck top 1 to holopower; then look
  //    at holopower, reveal 1 and add to hand. Reshuffle holopower."
  // Pragmatic: auto-pull a member-type card if available; otherwise skip.
  reg('hBP04-013', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP04-013') return { state, resolved: true };
    if (ctx.triggerEvent !== 'member_knocked') return { state, resolved: true };
    if (!isAttackingMember(state, ctx)) return { state, resolved: true };
    const own = state.players[ctx.player];
    // Step 1: deck top → holopower (face-down)
    if (own.zones[ZONE.DECK].length > 0) {
      const top = own.zones[ZONE.DECK].shift();
      top.faceDown = true;
      own.zones[ZONE.HOLO_POWER].push(top);
    }
    // Step 2: pick 1 holopower card to add to hand. Auto-pick a member if
    // available, else first card.
    const hp = own.zones[ZONE.HOLO_POWER];
    if (hp.length === 0) return { state, resolved: true, log: 'hBP04-013: holo 能量區空' };
    let pickIdx = hp.findIndex(c => isMember(getCard(c.cardId)?.type));
    if (pickIdx < 0) pickIdx = 0;
    const picked = hp.splice(pickIdx, 1)[0];
    picked.faceDown = false;
    own.zones[ZONE.HAND].push(picked);
    // Step 3: shuffle holopower
    for (let i = hp.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [hp[i], hp[j]] = [hp[j], hp[i]];
    }
    return { state, resolved: true, log: 'hBP04-013: 擊倒 → holopower 操作' };
  });

  // E-3.3 hBP05-023 アイラニ・イオフィフティーン 2nd:
  //   "When this member knocks opp → may send 1 cheer from archive to an own
  //    #ID1期生 member."
  // Pragmatic: auto-pick first own #ID1期生 member, send first cheer from
  // archive (any color).
  reg('hBP05-023', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP05-023') return { state, resolved: true };
    if (ctx.triggerEvent !== 'member_knocked') return { state, resolved: true };
    if (!isAttackingMember(state, ctx)) return { state, resolved: true };
    const own = state.players[ctx.player];
    const stage = [
      own.zones[ZONE.CENTER], own.zones[ZONE.COLLAB],
      ...(own.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean);
    const target = stage.find(m => {
      const tag = getCard(m.cardId)?.tag || '';
      return (typeof tag === 'string' ? tag : JSON.stringify(tag)).includes('#ID1期生');
    });
    if (!target) return { state, resolved: true, log: 'hBP05-023: 無 #ID1期生 成員' };
    if (sendCheerFromArchiveToMember(own, target)) {
      return { state, resolved: true, log: 'hBP05-023: 存檔吶喊 → #ID1期生' };
    }
    return { state, resolved: true, log: 'hBP05-023: 存檔無吶喊' };
  });

  // E-3.4 hSD12-007 シオリ・ノヴェラ 2nd:
  //   "[Once per turn] When this member knocks opp → return 1 non-LIMITED
  //    support from archive to hand."
  // Pragmatic: auto-pick first non-LIMITED support. The "once per turn"
  // limit is not enforced server-side yet (no per-turn ability tracking
  // for effectG ON_KNOCKDOWN); in practice this fires once per art attack
  // which already implicitly limits to ~1-2 per turn.
  reg('hSD12-007', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hSD12-007') return { state, resolved: true };
    if (ctx.triggerEvent !== 'member_knocked') return { state, resolved: true };
    if (!isAttackingMember(state, ctx)) return { state, resolved: true };
    const own = state.players[ctx.player];
    const idx = own.zones[ZONE.ARCHIVE].findIndex(c => {
      const card = getCard(c.cardId);
      if (!card?.type?.startsWith('支援')) return false;
      const s = typeof card.supportEffect === 'object'
        ? (card.supportEffect['zh-TW'] || card.supportEffect.ja || card.supportEffect.en || '')
        : (card.supportEffect || '');
      return !s.includes('LIMITED');
    });
    if (idx < 0) return { state, resolved: true, log: 'hSD12-007: 存檔無非 LIMITED 支援' };
    const support = own.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
    own.zones[ZONE.HAND].push(support);
    return { state, resolved: true, log: 'hSD12-007: 擊倒 → 非 LIMITED 支援回手牌' };
  });

  // E-3.5 hBP07-049 エリザベス・ローズ・ブラッドフレイム 2nd:
  //   "[Limited center/collab] When ANY own member knocks opp → choose 1
  //    own member; that member's arts colorless cost -2 this turn."
  // Pushes a per-turn modifier to a state-side registry. Since we don't
  // have a "per-member colorless modifier" channel yet, for pragmatic batch
  // we push DAMAGE_REDUCTION 0 (no-op) and emit a clear log so the player
  // can manually resolve via Manual Adjust if needed. Mark it as a
  // partial implementation in the log.
  // TODO: extend AttachedSupportEffects-style registry with a per-turn
  // colorless-cost reduction channel.
  reg('hBP07-049', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP07-049') return { state, resolved: true };
    if (ctx.triggerEvent !== 'member_knocked') return { state, resolved: true };
    // Position requirement: this is in own center or collab, AND any own
    // member is the killer (so ctx.attackerPlayer === ctx.player + this is
    // on attacker's stage in center/collab).
    if (ctx.player !== ctx.attackerPlayer) return { state, resolved: true };
    const own = state.players[ctx.player];
    const isCenterOrCollab =
      own.zones[ZONE.CENTER]?.instanceId === ctx.memberInst.instanceId
      || own.zones[ZONE.COLLAB]?.instanceId === ctx.memberInst.instanceId;
    if (!isCenterOrCollab) return { state, resolved: true };
    return {
      state, resolved: true,
      log: 'hBP07-049: 擊倒對手 → 可選 1 成員藝能無色需求 -2（手動調整）',
    };
  });

  // ── End of Round E-3 ──

  // ── Round E-4: art-use triggers ──────────────────────────────────────────
  // Five effectG cards that fire on "this member used art" or "ally used art".
  // The attacker case uses the existing ON_ART_RESOLVE single-fire. The
  // observer case uses the new ctx.triggerEvent === 'member_used_art' broadcast
  // fan-out (see processUseArt).

  // E-4.1 hBP05-016 兎田ぺこら 2nd:
  //   Effect chain split across hooks:
  //     • art1 ON_ART_DECLARE: roll N=bloomStack.length dice, sum, +10 dmg
  //       per pip; stash sum on state._lastArtDiceSum so effectG can read it.
  //     • effectG ON_ART_RESOLVE (target-side single-fire on attacker):
  //       check stashed sum's parity → odd: draw 1, even: draw 2.
  reg('hBP05-016', HOOK.ON_ART_DECLARE, (state, ctx) => {
    if (ctx.artKey !== 'art1') return { state, resolved: true };
    const n = (ctx.memberInst?.bloomStack || []).length || 1;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.floor(Math.random() * 6) + 1;
    state._lastArtDiceSum = sum;
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: sum * 10, target: 'self', duration: 'instant' },
      log: `hBP05-016 art1: 擲 ${n} 顆骰子總和 ${sum} → +${sum * 10}`,
    };
  });
  reg('hBP05-016', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    // Only react to legacy single-fire (the attacker is THIS member)
    if (ctx.triggerEvent === 'member_used_art') return { state, resolved: true };
    if (ctx.cardId !== 'hBP05-016') return { state, resolved: true };
    const sum = state._lastArtDiceSum;
    state._lastArtDiceSum = undefined; // consume
    if (typeof sum !== 'number') return { state, resolved: true };
    const draws = (sum % 2 === 0) ? 2 : 1;
    drawCards(state.players[ctx.player], draws);
    return { state, resolved: true, log: `hBP05-016: 骰和 ${sum} → 抽 ${draws}` };
  });

  // E-4.2 hBP06-014 ラオーラ・パンテーラ 2nd:
  //   "When this used art → look at holopower, reveal 1 to hand. If added to
  //    hand, put 1 hand card to holopower. Reshuffle holopower."
  reg('hBP06-014', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.triggerEvent === 'member_used_art') return { state, resolved: true };
    if (ctx.cardId !== 'hBP06-014') return { state, resolved: true };
    const own = state.players[ctx.player];
    const hp = own.zones[ZONE.HOLO_POWER];
    if (hp.length === 0) return { state, resolved: true, log: 'hBP06-014: holo 能量區空' };
    // Auto-pick first card to hand
    const picked = hp.shift();
    picked.faceDown = false;
    own.zones[ZONE.HAND].push(picked);
    // Replacement: 1 hand card → holopower (if hand has any)
    if (own.zones[ZONE.HAND].length > 1) {
      const handCard = own.zones[ZONE.HAND].shift(); // first (oldest) hand card
      handCard.faceDown = true;
      hp.push(handCard);
    }
    // Shuffle holopower
    for (let i = hp.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [hp[i], hp[j]] = [hp[j], hp[i]];
    }
    return { state, resolved: true, log: 'hBP06-014: holo 能量區交換 1 張' };
  });

  // E-4.3 hBP05-066 不知火フレア 1st:
  //   "[Limited collab] When own #3期生 center uses art → may archive 1 hand,
  //    then draw 1."
  // Broadcast observer pattern: fires on triggerEvent='member_used_art' when
  // attacker is on own side, in own center, and has #3期生 tag.
  reg('hBP05-066', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.triggerEvent !== 'member_used_art') return { state, resolved: true };
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    if (own?.zones[ZONE.COLLAB]?.instanceId !== me?.instanceId) return { state, resolved: true };
    // Attacker must be own center with #3期生
    if (own.zones[ZONE.CENTER]?.instanceId !== ctx.attacker?.instanceId) return { state, resolved: true };
    const atkCard = getCard(ctx.attacker.cardId);
    const tag = atkCard?.tag || '';
    if (!(typeof tag === 'string' ? tag : JSON.stringify(tag)).includes('#3期生')) {
      return { state, resolved: true };
    }
    // Auto-do: discard 1 hand → draw 1
    if (own.zones[ZONE.HAND].length === 0) return { state, resolved: true, log: 'hBP05-066: 手牌空' };
    const discarded = own.zones[ZONE.HAND].shift();
    own.zones[ZONE.ARCHIVE].push(discarded);
    drawCards(own, 1);
    return { state, resolved: true, log: 'hBP05-066: 棄 1 → 抽 1' };
  });

  // E-4.4 hBP06-065 ロボ子さん 1st Buzz:
  //   "When THIS member (bloomed from 1st) uses art → 50 special damage to
  //    opp center or collab (player choice)."
  // Pragmatic: auto-pick opp center; fall back to collab if no center.
  reg('hBP06-065', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.triggerEvent === 'member_used_art') return { state, resolved: true };
    if (ctx.cardId !== 'hBP06-065') return { state, resolved: true };
    // "從1st成員綻放" — bloomStack contains an entry that's a 1st-bloom member
    const stack = ctx.memberInst?.bloomStack || [];
    const bloomedFrom1st = stack.some(entry => {
      const cardId = typeof entry === 'string' ? entry : entry?.cardId;
      const card = getCard(cardId);
      return card?.bloom === '1st';
    });
    if (!bloomedFrom1st) return { state, resolved: true, log: 'hBP06-065: 非從 1st 綻放' };
    const opp = state.players[1 - ctx.player];
    const target = opp.zones[ZONE.CENTER] || opp.zones[ZONE.COLLAB];
    if (!target) return { state, resolved: true, log: 'hBP06-065: 對手無中心/聯動' };
    applyDamageToMember(target, 50);
    return { state, resolved: true, log: 'hBP06-065: 50 特殊傷害 → 對手' };
  });

  // E-4.5 hBP06-066 ロボ子さん 2nd:
  //   "[Limited center] When own #0期生 collab uses art → reveal 1 deck top
  //    to archive, reshuffle deck."
  // Broadcast observer: fires when attacker is own collab + has #0期生.
  reg('hBP06-066', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.triggerEvent !== 'member_used_art') return { state, resolved: true };
    const own = state.players[ctx.player];
    const me = ctx.memberInst;
    if (own?.zones[ZONE.CENTER]?.instanceId !== me?.instanceId) return { state, resolved: true };
    if (own.zones[ZONE.COLLAB]?.instanceId !== ctx.attacker?.instanceId) return { state, resolved: true };
    const atkCard = getCard(ctx.attacker.cardId);
    const tag = atkCard?.tag || '';
    if (!(typeof tag === 'string' ? tag : JSON.stringify(tag)).includes('#0期生')) {
      return { state, resolved: true };
    }
    if (own.zones[ZONE.DECK].length === 0) return { state, resolved: true, log: 'hBP06-066: 牌組空' };
    const top = own.zones[ZONE.DECK].shift();
    top.faceDown = false;
    own.zones[ZONE.ARCHIVE].push(top);
    // Reshuffle deck
    const deck = own.zones[ZONE.DECK];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return { state, resolved: true, log: 'hBP06-066: 牌頂 1 張 → 存檔，洗牌組' };
  });

  // ── End of Round E-4 ──

  // ── Round E-5: own ally knocked broadcast (5 cards) ──────────────────────
  // Helper: pop the most recently archived member-card off the archive (the
  // killed member from the just-completed processKnockdown). archiveMember
  // pushes member last after attached cheer/support/stack, so archive[len-1]
  // is the killed member; the N entries before it are the new stack instances.
  // Reverses for the "return killed + stack to hand" pattern.
  function returnKilledAndStackToHand(state, ownerIdx, knockedOutInstanceId, stackCount) {
    const own = state.players[ownerIdx];
    const archive = own.zones[ZONE.ARCHIVE];
    // Find the killed member by instanceId
    const memberIdx = archive.findIndex(c => c.instanceId === knockedOutInstanceId);
    if (memberIdx < 0) return false;
    const member = archive.splice(memberIdx, 1)[0];
    own.zones[ZONE.HAND].push(member);
    // The N stack instances were pushed immediately before the member, in
    // bloomStack order. After splicing the member, they're now at the end.
    const stackEntries = archive.splice(archive.length - (stackCount || 0), stackCount || 0);
    for (const e of stackEntries) own.zones[ZONE.HAND].push(e);
    return true;
  }

  // E-5.1 hBP07-022 白銀ノエル 2nd:
  //   "[Limited collab] During opp turn, when own #3期生 center is knocked,
  //    return that center + all overlapping members to hand."
  reg('hBP07-022', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP07-022') return { state, resolved: true };
    if (ctx.triggerEvent !== 'member_knocked') return { state, resolved: true };
    if (state.activePlayer !== ctx.attackerPlayer) return { state, resolved: true };
    if (ctx.player !== ctx.knockedOutPlayer) return { state, resolved: true };
    const own = state.players[ctx.player];
    // I must be in own collab
    if (own?.zones[ZONE.COLLAB]?.instanceId !== ctx.memberInst?.instanceId) return { state, resolved: true };
    // Killed must have been in own center
    if (ctx.knockedOutZone !== 'center') return { state, resolved: true };
    // Killed must have #3期生 tag
    const killedCard = getCard(ctx.knockedOutCardId);
    const tag = killedCard?.tag || '';
    if (!(typeof tag === 'string' ? tag : JSON.stringify(tag)).includes('#3期生')) {
      return { state, resolved: true };
    }
    const stackCount = (ctx.knockedOutStackIds || []).length;
    if (returnKilledAndStackToHand(state, ctx.player, ctx.knockedOutInstanceId, stackCount)) {
      return { state, resolved: true, log: 'hBP07-022: 中心 + 重疊成員返回手牌' };
    }
    return { state, resolved: true, log: 'hBP07-022: 找不到擊倒成員' };
  });

  // E-5.2 hBP05-035 さくらみこ 2nd:
  //   "[Limited center/collab] During opp turn, when own さくらみこ is knocked,
  //    may use: search deck for "み俺恥" → hand. Reshuffle deck."
  reg('hBP05-035', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP05-035') return { state, resolved: true };
    if (ctx.triggerEvent !== 'member_knocked') return { state, resolved: true };
    if (state.activePlayer !== ctx.attackerPlayer) return { state, resolved: true };
    if (ctx.player !== ctx.knockedOutPlayer) return { state, resolved: true };
    const own = state.players[ctx.player];
    const isCenterOrCollab =
      own?.zones[ZONE.CENTER]?.instanceId === ctx.memberInst?.instanceId
      || own?.zones[ZONE.COLLAB]?.instanceId === ctx.memberInst?.instanceId;
    if (!isCenterOrCollab) return { state, resolved: true };
    // Killed must be a さくらみこ
    if (getCard(ctx.knockedOutCardId)?.name !== 'さくらみこ') return { state, resolved: true };
    // Search deck for み俺恥 by name
    const idx = own.zones[ZONE.DECK].findIndex(c => getCard(c.cardId)?.name === 'み俺恥');
    if (idx < 0) {
      // Shuffle deck even on miss (per "將牌組重新洗牌")
      const deck = own.zones[ZONE.DECK];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      return { state, resolved: true, log: 'hBP05-035: 牌組無「み俺恥」' };
    }
    const card = own.zones[ZONE.DECK].splice(idx, 1)[0];
    card.faceDown = false;
    own.zones[ZONE.HAND].push(card);
    // Shuffle remaining deck
    const deck = own.zones[ZONE.DECK];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return { state, resolved: true, log: 'hBP05-035: 搜尋「み俺恥」加入手牌' };
  });

  // E-5.3 hBP07-044 尾丸ポルカ 2nd:
  //   "[Limited center/collab] During opp turn, when own Buzz member with a
  //    fan is knocked, if own oshi is 尾丸ポルカ → life loss -1."
  // Sets ctx.lifeLossDelta = -1 when conditions met. The broadcast accumulator
  // in processKnockdown picks this up before computing the final life cost.
  reg('hBP07-044', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP07-044') return { state, resolved: true };
    if (ctx.triggerEvent !== 'member_knocked') return { state, resolved: true };
    if (state.activePlayer !== ctx.attackerPlayer) return { state, resolved: true };
    if (ctx.player !== ctx.knockedOutPlayer) return { state, resolved: true };
    const own = state.players[ctx.player];
    const isCenterOrCollab =
      own?.zones[ZONE.CENTER]?.instanceId === ctx.memberInst?.instanceId
      || own?.zones[ZONE.COLLAB]?.instanceId === ctx.memberInst?.instanceId;
    if (!isCenterOrCollab) return { state, resolved: true };
    // oshi must be 尾丸ポルカ
    if (getCard(own.oshi?.cardId)?.name !== '尾丸ポルカ') return { state, resolved: true };
    // Killed must be Buzz with at least 1 fan (粉絲) attached at time of knockdown
    if (!getCard(ctx.knockedOutCardId)?.bloom?.includes('Buzz')) return { state, resolved: true };
    const hadFan = (ctx.knockedOutSupportCardIds || []).some(supId =>
      getCard(supId)?.type === '支援・粉絲'
    );
    if (!hadFan) return { state, resolved: true };
    ctx.lifeLossDelta = (ctx.lifeLossDelta || 0) - 1;
    return { state, resolved: true, log: 'hBP07-044: Buzz+粉絲 被擊倒 → 生命損失 -1' };
  });

  // E-5.4 hSD08-005 姫森ルーナ Debut:
  //   "[Limited collab] During opp turn, when own member is knocked, if own
  //    life < opp life, may return 1 archive card whose name contains
  //    パソコン (computer) to hand."
  reg('hSD08-005', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hSD08-005') return { state, resolved: true };
    if (ctx.triggerEvent !== 'member_knocked') return { state, resolved: true };
    if (state.activePlayer !== ctx.attackerPlayer) return { state, resolved: true };
    if (ctx.player !== ctx.knockedOutPlayer) return { state, resolved: true };
    const own = state.players[ctx.player];
    if (own?.zones[ZONE.COLLAB]?.instanceId !== ctx.memberInst?.instanceId) return { state, resolved: true };
    const opp = state.players[ctx.attackerPlayer];
    const myLife = own.zones[ZONE.LIFE]?.length || 0;
    const oppLife = opp?.zones[ZONE.LIFE]?.length || 0;
    if (myLife >= oppLife) return { state, resolved: true };
    // Find first archive item with name containing パソコン
    const idx = own.zones[ZONE.ARCHIVE].findIndex(c => {
      const name = getCard(c.cardId)?.name || '';
      return name.includes('パソコン');
    });
    if (idx < 0) return { state, resolved: true, log: 'hSD08-005: 存檔無パソコン' };
    const item = own.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
    own.zones[ZONE.HAND].push(item);
    return { state, resolved: true, log: 'hSD08-005: パソコン 從存檔回手牌' };
  });

  // E-5.5 hSD13-005 エリザベス・ローズ・ブラッドフレイム 1st:
  //   "During opp turn, when own #Justice member is knocked, send 1 cheer
  //    deck top to THIS member. Once per turn."
  // The "once per turn" cap isn't enforced server-side yet (no per-turn
  // ability tracking for effectG broadcast); broadcast naturally limits to
  // per-knockdown. The action attaches cheer to the SURVIVING ERB
  // instance — i.e. the effectG owner (ctx.memberInst), NOT the killed one.
  reg('hSD13-005', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hSD13-005') return { state, resolved: true };
    if (ctx.triggerEvent !== 'member_knocked') return { state, resolved: true };
    if (state.activePlayer !== ctx.attackerPlayer) return { state, resolved: true };
    if (ctx.player !== ctx.knockedOutPlayer) return { state, resolved: true };
    // Killed must have #Justice tag
    const killedCard = getCard(ctx.knockedOutCardId);
    const tag = killedCard?.tag || '';
    if (!(typeof tag === 'string' ? tag : JSON.stringify(tag)).includes('#Justice')) {
      return { state, resolved: true };
    }
    const own = state.players[ctx.player];
    if (sendCheerFromDeckToMember(own, ctx.memberInst)) {
      return { state, resolved: true, log: 'hSD13-005: 吶喊牌組頂 → 此成員' };
    }
    return { state, resolved: true, log: 'hSD13-005: 吶喊牌組空' };
  });

  // ── End of Round E-5 ──

  // ── Round E-6: special triggers (6 cards) ───────────────────────────────

  // E-6.1 hBP01-045 AZKi Debut effectG:
  //   "When own life ≤ 3, this can bloom from hand directly to a 2nd member,
  //    bypassing the 1st step."
  // Implementation: rule lives in BloomRuleOverrides.js (consulted by
  // ActionValidator.validateBloom). The handler here is informational —
  // a hint log so the player knows the override is in effect.
  reg('hBP01-045', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => {
    const own = state.players[ctx.player];
    const life = own?.zones?.[ZONE.LIFE]?.length || 0;
    if (life <= 3) {
      return { state, resolved: true, log: 'hBP01-045: 生命≤3 → 可從手牌直接綻放為 2nd（已啟用）' };
    }
    return { state, resolved: true, log: 'hBP01-045: 生命>3 → 一般綻放規則' };
  });

  // E-6.2 hBP07-039 赤井はあと 1st effectG:
  //   "[Once per turn] Own turn, when own 赤井はあと is returned from stage
  //    to deck, may send 1 archive cheer to THIS member."
  // Trigger event (member returned to deck) isn't fired by the engine today;
  // no current cards in this set actually return members to deck during play.
  // Hint log only.
  reg('hBP07-039', HOOK.ON_PASSIVE_GLOBAL, (state, ctx) => ({
    state, resolved: true, log: 'hBP07-039: 赤井はあと 從舞台放回牌組時觸發（未來事件，手動）',
  }));

  // E-6.3 hBP06-026 風真いろは 1st Buzz effectG:
  //   "[Limited center] When own member collabs and own hand ≥ 5, may send
  //    cheer-deck top to the collab member."
  // Uses ON_COLLAB broadcast (added in this batch).
  reg('hBP06-026', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.cardId !== 'hBP06-026') return { state, resolved: true };
    if (ctx.triggerEvent !== 'member_collabed') return { state, resolved: true };
    const own = state.players[ctx.player];
    // I must be in own center
    if (own?.zones[ZONE.CENTER]?.instanceId !== ctx.memberInst?.instanceId) return { state, resolved: true };
    // Own hand ≥ 5
    if ((own.zones[ZONE.HAND] || []).length < 5) return { state, resolved: true, log: 'hBP06-026: 手牌 <5' };
    // Send cheer-deck top to the collab member
    const collab = ctx.collabingMember;
    if (!collab) return { state, resolved: true };
    if (sendCheerFromDeckToMember(own, collab)) {
      return { state, resolved: true, log: 'hBP06-026: 吶喊牌組頂 → 聯動成員' };
    }
    return { state, resolved: true, log: 'hBP06-026: 吶喊牌組空' };
  });

  // E-6.4 hBP07-017 ベスティア・ゼータ 1st effectG:
  //   "[Limited center] When own #ID3期生 Buzz member collabs → choose 1
  //    own member; that member's arts +30 damage this turn."
  // Pragmatic: auto-pick the collabing member as the recipient (most likely
  // intended target since it's the one collabing). +30 boost queued via
  // _turnBoosts; consumed by the next art declaration.
  reg('hBP07-017', HOOK.ON_COLLAB, (state, ctx) => {
    if (ctx.cardId !== 'hBP07-017') return { state, resolved: true };
    if (ctx.triggerEvent !== 'member_collabed') return { state, resolved: true };
    const own = state.players[ctx.player];
    if (own?.zones[ZONE.CENTER]?.instanceId !== ctx.memberInst?.instanceId) return { state, resolved: true };
    // The collabing member must be #ID3期生 Buzz
    const collab = ctx.collabingMember;
    if (!collab) return { state, resolved: true };
    const cCard = getCard(collab.cardId);
    if (!cCard?.bloom?.includes('Buzz')) return { state, resolved: true };
    const tag = cCard?.tag || '';
    if (!(typeof tag === 'string' ? tag : JSON.stringify(tag)).includes('#ID3期生')) {
      return { state, resolved: true };
    }
    // Push a turn-scoped +30 damage boost (auto-targets the next art use)
    return {
      state, resolved: true,
      effect: { type: 'DAMAGE_BOOST', amount: 30, target: 'self', duration: 'turn' },
      log: 'hBP07-017: #ID3期生 Buzz 聯動 → 1 成員 +30 藝能傷害（本回合）',
    };
  });

  // E-6.5 hBP05-067 不知火フレア 2nd effectG:
  //   "When this used art → may send 2 of this's cheer to 1 own backstage
  //    member; then return 1 1st member with same name from archive to hand."
  // Uses ON_ART_RESOLVE single-fire (this is the attacker).
  reg('hBP05-067', HOOK.ON_ART_RESOLVE, (state, ctx) => {
    if (ctx.triggerEvent === 'member_used_art') return { state, resolved: true };
    if (ctx.cardId !== 'hBP05-067') return { state, resolved: true };
    const me = ctx.memberInst;
    if (!me?.attachedCheer || me.attachedCheer.length < 2) {
      return { state, resolved: true, log: 'hBP05-067: 自身吶喊不足 2 張' };
    }
    const own = state.players[ctx.player];
    const back = (own.zones[ZONE.BACKSTAGE] || []).filter(Boolean);
    if (back.length === 0) return { state, resolved: true, log: 'hBP05-067: 後台無成員' };
    // Auto-pick first backstage member
    const target = back[0];
    if (!target.attachedCheer) target.attachedCheer = [];
    // Move 2 cheer
    target.attachedCheer.push(me.attachedCheer.shift());
    target.attachedCheer.push(me.attachedCheer.shift());
    // Return 1st with same name from archive to hand
    const targetName = getCard(target.cardId)?.name;
    if (!targetName) return { state, resolved: true, log: 'hBP05-067: 移動 2 吶喊' };
    const idx = own.zones[ZONE.ARCHIVE].findIndex(c => {
      const card = getCard(c.cardId);
      return card?.name === targetName && card?.bloom === '1st' && isMember(card.type);
    });
    if (idx < 0) {
      return { state, resolved: true, log: `hBP05-067: 吶喊→${targetName}（存檔無同名 1st）` };
    }
    const recovered = own.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
    own.zones[ZONE.HAND].push(recovered);
    return { state, resolved: true, log: `hBP05-067: 吶喊→${targetName}，存檔同名 1st 回手牌` };
  });

  // E-6.6 hBP06-027 風真いろは 2nd effectG:
  //   "When this knocks opp center → another own 風真いろは (already bloomed
  //    this turn) may use a member from hand to bloom again."
  // The "re-bloom from hand" rule override is engine-complex (would need a
  // new BLOOM action variant or per-turn bloom-count tracking). Hint log
  // only — player can resolve via Manual Adjust.
  reg('hBP06-027', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    if (ctx.cardId !== 'hBP06-027') return { state, resolved: true };
    if (ctx.triggerEvent !== 'member_knocked') return { state, resolved: true };
    if (ctx.player !== ctx.attackerPlayer) return { state, resolved: true };
    if (ctx.knockedOutZone !== 'center') return { state, resolved: true };
    return {
      state, resolved: true,
      log: 'hBP06-027: 擊倒對手中心 → 已綻放的另一隻風真可再次綻放（手動）',
    };
  });

  // ── End of Round E-6 ──

  // ── Round F-1: tournament-played oshi skills (5 cards) ───────────────────
  // Five oshi cards that show tournament play. Each has both an oshiSkill
  // (regular, ≥1/turn) and a spSkill (1/game). Reactive sp skills (those
  // triggered by an event mid-game like "when own member knocked") require
  // engine support that doesn't exist yet — handled as hint-logs. Active
  // oshi skills (player-triggered via USE_OSHI_SKILL) get full handlers.

  // F-1.1 hBP03-006 戌神ころね oshi
  //   oshi: [1/turn] Change 1 own resting 戌神ころね to active state.
  //   sp:   [1/game] When own yellow member is knocked, may use:
  //         replace 1 cheer of that member to another own member, choose
  //         1 from that member + bloomStack to return to hand.
  reg('hBP03-006', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      // Reactive trigger — engine doesn't support reactive oshi activation
      // mid-knockdown yet. Hint log for Manual Adjust resolution.
      return { state, resolved: true, log: 'hBP03-006 SP: 黃色成員被擊倒時觸發（手動調整）' };
    }
    // Find a resting 戌神ころね on stage and set to ACTIVE
    const own = state.players[ctx.player];
    const stage = [
      own.zones[ZONE.CENTER], own.zones[ZONE.COLLAB],
      ...(own.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean);
    const target = stage.find(m =>
      getCard(m.cardId)?.name === '戌神ころね' && m.state === MEMBER_STATE.REST
    );
    if (!target) return { state, resolved: true, log: 'hBP03-006 oshi: 無休息中的戌神ころね' };
    target.state = MEMBER_STATE.ACTIVE;
    return { state, resolved: true, log: `hBP03-006 oshi: ${getCard(target.cardId)?.name} 改為活動狀態` };
  });

  // F-1.2 hBP01-006 小鳥遊キアラ oshi
  //   oshi: [1/turn] Return 1 member from archive to hand.
  //   sp:   [1/game] When own red member knocked during opp turn, may use:
  //         life loss -1 + that member + stack returns to hand.
  reg('hBP01-006', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      return { state, resolved: true, log: 'hBP01-006 SP: 紅色成員被擊倒時觸發（手動調整）' };
    }
    // Active: archive → hand prompt for a member
    const own = state.players[ctx.player];
    const candidates = own.zones[ZONE.ARCHIVE]
      .filter(c => isMember(getCard(c.cardId)?.type))
      .map(c => ({
        instanceId: c.instanceId, cardId: c.cardId,
        name: getCard(c.cardId)?.name || '',
        image: getCardImage(c.cardId),
      }));
    if (candidates.length === 0) return { state, resolved: true, log: 'hBP01-006 oshi: 存檔無成員' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE',
        player: ctx.player,
        message: 'キアラ oshi: 選擇 1 張存檔成員返回手牌',
        cards: candidates, maxSelect: 1,
        afterAction: 'RETURN_FROM_ARCHIVE',
      },
      log: 'hBP01-006 oshi: 存檔成員回手牌',
    };
  });

  // F-1.3 hBP01-007 星街すいせい oshi
  //   oshi: [1/turn] When this oshi or own blue member dealt damage to opp
  //         backstage, may use: 50 special dmg to that backstage member.
  //   sp:   [1/game] When own blue member dealt damage to opp center/collab,
  //         may use: same-amount special dmg to opp 1 backstage member.
  // Both are reactive (post-damage activation) — hint logs only.
  reg('hBP01-007', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      return { state, resolved: true, log: 'hBP01-007 SP: 藍色成員給中心/聯動傷害時觸發（手動）' };
    }
    return { state, resolved: true, log: 'hBP01-007 oshi: 對後台造成傷害時觸發 50 特殊傷害（手動）' };
  });

  // F-1.4 hBP02-007 森カリオペ oshi
  //   oshi: [1/turn] Archive 2 hand cards, then return 2 #EN members from
  //         archive to hand.
  //   sp:   [1/game] If own center is カリオペ, may use: this turn, own
  //         カリオペ that used art uses same art again.
  reg('hBP02-007', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      return { state, resolved: true, log: 'hBP02-007 SP: 中心カリオペ → 藝能再次使用（手動）' };
    }
    // Archive 2 hand cards (player choice — auto-pick first 2 for pragmatic)
    const own = state.players[ctx.player];
    if (own.zones[ZONE.HAND].length < 2) {
      return { state, resolved: true, log: 'hBP02-007 oshi: 手牌不足 2 張' };
    }
    own.zones[ZONE.ARCHIVE].push(own.zones[ZONE.HAND].shift());
    own.zones[ZONE.ARCHIVE].push(own.zones[ZONE.HAND].shift());
    // Search archive for #EN members → prompt to pick up to 2
    const candidates = own.zones[ZONE.ARCHIVE]
      .filter(c => {
        const card = getCard(c.cardId);
        if (!isMember(card?.type)) return false;
        const tag = card.tag || '';
        return (typeof tag === 'string' ? tag : JSON.stringify(tag)).includes('#EN');
      })
      .map(c => ({
        instanceId: c.instanceId, cardId: c.cardId,
        name: getCard(c.cardId)?.name || '',
        image: getCardImage(c.cardId),
      }));
    if (candidates.length === 0) {
      return { state, resolved: true, log: 'hBP02-007 oshi: 存檔無 #EN 成員' };
    }
    const max = Math.min(2, candidates.length);
    return {
      state, resolved: false,
      prompt: {
        type: 'SELECT_FROM_ARCHIVE',
        player: ctx.player,
        message: `カリオペ oshi: 選擇 1-${max} 張 #EN 成員返回手牌（已棄 2）`,
        cards: candidates, maxSelect: max,
        afterAction: 'RETURN_FROM_ARCHIVE',
      },
      log: 'hBP02-007 oshi: 棄 2 → 取回 #EN 成員',
    };
  });

  // F-1.5 hBP07-007 桃鈴ねね oshi
  //   oshi: [1/turn] Send archive cheer to all own #5期生 2nd members,
  //         1 each.
  //   sp:   [1/game] Reveal 1-4 Debut 桃鈴ねね from deck and place on stage.
  //         Reshuffle deck.
  reg('hBP07-007', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      // Search deck for Debut 桃鈴ねね → prompt to place
      const candidates = [];
      for (const c of own.zones[ZONE.DECK]) {
        const card = getCard(c.cardId);
        if (card?.name === '桃鈴ねね' && card.bloom === 'Debut') {
          candidates.push({
            instanceId: c.instanceId, cardId: c.cardId,
            name: card.name, image: getCardImage(c.cardId),
          });
        }
      }
      if (candidates.length === 0) {
        // Shuffle deck even on miss
        const deck = own.zones[ZONE.DECK];
        for (let i = deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return { state, resolved: true, log: 'hBP07-007 SP: 牌組無 Debut 桃鈴ねね' };
      }
      const max = Math.min(4, candidates.length);
      return {
        state, resolved: false,
        prompt: {
          type: 'SEARCH_SELECT_PLACE',
          player: ctx.player,
          message: `ねね SP: 選 1-${max} 張 Debut 桃鈴ねね 放到舞台`,
          cards: candidates, maxSelect: max,
          afterAction: 'PLACE_AND_SHUFFLE',
        },
        log: 'hBP07-007 SP: Debut 桃鈴ねね 上場',
      };
    }
    // oshi (regular): distribute archive cheer to all own #5期生 2nd members
    const targets = [
      own.zones[ZONE.CENTER], own.zones[ZONE.COLLAB],
      ...(own.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean).filter(m => {
      const card = getCard(m.cardId);
      if (card?.bloom !== '2nd') return false;
      const tag = card.tag || '';
      return (typeof tag === 'string' ? tag : JSON.stringify(tag)).includes('#5期生');
    });
    if (targets.length === 0) {
      return { state, resolved: true, log: 'hBP07-007 oshi: 無 #5期生 2nd 成員' };
    }
    let sent = 0;
    for (const t of targets) {
      if (sendCheerFromArchiveToMember(own, t)) sent++;
    }
    return { state, resolved: true, log: `hBP07-007 oshi: 存檔吶喊→${sent} 位 #5期生 2nd` };
  });

  // ── End of Round F-1 ──

  // ── Round F-2: hBD24 birthday-deck oshi (67 cards) ───────────────────────
  // All hBD24 oshi follow the exact same template, parameterized by color:
  //   • oshi (cost 2, 1/turn): "[1/turn] This turn, 1 own X-color member's
  //     arts +20 damage." → push DAMAGE_BOOST {amount:20, colorRequired:X,
  //     duration:'turn'}. Engine consumes only on a same-color attack and
  //     keeps the boost in _turnBoosts otherwise.
  //   • sp (cost 2, 1/game): "[1/game] Reveal 1 X-color member from deck and
  //     add to hand. Reshuffle." → SEARCH_SELECT prompt with color filter.
  //
  // Implementation: walk the card DB at registration time, iterate every
  // hBD24-* oshi card, and register one factory-built handler per card with
  // its declared color baked in. ~67 entries flipped from LOG_ONLY → REAL
  // in one shot.
  const hbd24Oshi = [];
  // Iterate _cards via getCard? No — getCard only knows IDs we pass.
  // Pull from the analysis JSON which listed hBD24 oshi entries, OR walk
  // a known prefix range. Simpler: hard-code the 67 IDs from the audit.
  for (let i = 1; i <= 67; i++) {
    hbd24Oshi.push(`hBD24-${String(i).padStart(3, '0')}`);
  }
  for (const oshiId of hbd24Oshi) {
    const oshiCard = getCard(oshiId);
    if (!oshiCard || oshiCard.type !== '主推') continue;
    const oshiColor = oshiCard.color; // e.g. '綠', '黃', '白', '紅', '藍', '紫'
    if (!oshiColor) continue;

    reg(oshiId, HOOK.ON_OSHI_SKILL, (state, ctx) => {
      const own = state.players[ctx.player];
      if (ctx.skillType === 'sp') {
        // SP — search deck for any member of `oshiColor`
        const candidates = [];
        for (const c of own.zones[ZONE.DECK]) {
          const card = getCard(c.cardId);
          if (card && isMember(card.type) && card.color === oshiColor) {
            candidates.push({
              instanceId: c.instanceId, cardId: c.cardId,
              name: card.name || '', image: getCardImage(c.cardId),
            });
          }
        }
        if (candidates.length === 0) {
          // Shuffle deck regardless
          const deck = own.zones[ZONE.DECK];
          for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
          }
          return { state, resolved: true, log: `${oshiId} SP: 牌組無 ${oshiColor} 成員` };
        }
        return {
          state, resolved: false,
          prompt: {
            type: 'SEARCH_SELECT',
            player: ctx.player,
            message: `Birthday Gift: 選 1 張 ${oshiColor} 成員加入手牌`,
            cards: candidates, maxSelect: 1,
            afterAction: 'ADD_TO_HAND',
          },
          log: `${oshiId} SP: 搜尋 ${oshiColor} 成員`,
        };
      }
      // oshi (regular): push color-conditional +20 boost for the turn
      return {
        state, resolved: true,
        effect: {
          type: 'DAMAGE_BOOST', amount: 20,
          target: 'self', duration: 'turn',
          colorRequired: oshiColor,
        },
        log: `${oshiId} oshi: 1 位 ${oshiColor} 成員 +20 藝能傷害（本回合）`,
      };
    });
  }

  // ── End of Round F-2 ──

  // ── Round F-3: 5 unique-logic oshi cards ────────────────────────────────

  // F-3.1 hBP01-002 七詩ムメイ
  //   oshi: REACTIVE (own #Promise dmg -50). Hint log.
  //   sp:   Search 1 活動 from deck → hand. Reshuffle.
  reg('hBP01-002', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType !== 'sp') {
      return { state, resolved: true, log: 'hBP01-002 oshi: 反應觸發（手動）' };
    }
    const own = state.players[ctx.player];
    const candidates = [];
    for (const c of own.zones[ZONE.DECK]) {
      const card = getCard(c.cardId);
      if (card?.type === '支援・活動') {
        candidates.push({
          instanceId: c.instanceId, cardId: c.cardId,
          name: card.name || '', image: getCardImage(c.cardId),
        });
      }
    }
    if (candidates.length === 0) {
      const deck = own.zones[ZONE.DECK];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      return { state, resolved: true, log: 'hBP01-002 SP: 牌組無活動卡' };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT',
        player: ctx.player,
        message: 'ムメイ SP: 選 1 張活動卡加入手牌',
        cards: candidates, maxSelect: 1,
        afterAction: 'ADD_TO_HAND',
      },
      log: 'hBP01-002 SP: 搜尋活動卡',
    };
  });

  // F-3.2 hBP01-003 アキ・ローゼンタール
  //   oshi: Search 石の斧 from deck, attach to own 綠 member. Reshuffle.
  //   sp:   Own 綠 center fully heals (damage=0).
  reg('hBP01-003', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const center = own.zones[ZONE.CENTER];
      if (!center) return { state, resolved: true, log: 'hBP01-003 SP: 中心無成員' };
      if (getCard(center.cardId)?.color !== '綠') {
        return { state, resolved: true, log: 'hBP01-003 SP: 中心非綠色' };
      }
      const before = center.damage;
      center.damage = 0;
      return { state, resolved: true, log: `hBP01-003 SP: 中心 HP 完全回復（${before} → 0）` };
    }
    // Search 石の斧 (any matching name) → attach to a 綠 member
    const candidates = [];
    for (const c of own.zones[ZONE.DECK]) {
      const card = getCard(c.cardId);
      if (card?.name === '石の斧') {
        candidates.push({
          instanceId: c.instanceId, cardId: c.cardId,
          name: card.name, image: getCardImage(c.cardId),
        });
      }
    }
    if (candidates.length === 0) {
      const deck = own.zones[ZONE.DECK];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      return { state, resolved: true, log: 'hBP01-003 oshi: 牌組無「石の斧」' };
    }
    // Find first 綠 member to attach to
    const stage = [
      own.zones[ZONE.CENTER], own.zones[ZONE.COLLAB],
      ...(own.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean);
    const target = stage.find(m => getCard(m.cardId)?.color === '綠');
    if (!target) return { state, resolved: true, log: 'hBP01-003 oshi: 無綠色成員' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT',
        player: ctx.player,
        message: '選 1 張「石の斧」附加給綠色成員',
        cards: candidates, maxSelect: 1,
        afterAction: 'ATTACH_SUPPORT',
        targetInstanceId: target.instanceId,
      },
      log: 'hBP01-003 oshi: 搜尋「石の斧」',
    };
  });

  // F-3.3 hBP01-004 兎田ぺこら
  //   oshi: REACTIVE (own knocked → redistribute green cheer). Hint log.
  //   sp:   This turn, own dice rolls all count as 6.
  // Engine doesn't have a centralized rollDie that consults overrides yet,
  // so the dice-override is hint-only for now. State flag is set so a
  // future centralizer can pick it up.
  reg('hBP01-004', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      state._diceOverride = 6;
      return { state, resolved: true, log: 'hBP01-004 SP: 本回合擲骰視為 6（手動）' };
    }
    return { state, resolved: true, log: 'hBP01-004 oshi: 反應觸發（手動）' };
  });

  // F-3.4 hBP01-005 鷹嶺ルイ
  //   oshi: REACTIVE (red member effect archives hand → use holopower instead).
  //   sp:   Next opp turn, opp center & collab can't baton/move/replace.
  // Both require engine plumbing (cost-redirect for archive ops, position-
  // lock during opp turn). Hint logs only; SP sets a state flag.
  reg('hBP01-005', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      state._oppPositionLockedNextTurn = true;
      return { state, resolved: true, log: 'hBP01-005 SP: 對手下回合中心/聯動鎖定（手動）' };
    }
    return { state, resolved: true, log: 'hBP01-005 oshi: 反應觸發（手動）' };
  });

  // F-3.5 hBP02-001 白上フブキ
  //   oshi: Search 1 吉祥物 from deck → hand. Reshuffle.
  //   sp:   REACTIVE (white knocks opp → dice based on stage mascot count).
  //   Hint log for sp.
  reg('hBP02-001', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      return { state, resolved: true, log: 'hBP02-001 SP: 白色擊倒對手時觸發（手動）' };
    }
    const own = state.players[ctx.player];
    const candidates = [];
    for (const c of own.zones[ZONE.DECK]) {
      const card = getCard(c.cardId);
      if (card?.type === '支援・吉祥物') {
        candidates.push({
          instanceId: c.instanceId, cardId: c.cardId,
          name: card.name || '', image: getCardImage(c.cardId),
        });
      }
    }
    if (candidates.length === 0) {
      const deck = own.zones[ZONE.DECK];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      return { state, resolved: true, log: 'hBP02-001 oshi: 牌組無吉祥物' };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT',
        player: ctx.player,
        message: 'フブキ oshi: 選 1 張吉祥物加入手牌',
        cards: candidates, maxSelect: 1,
        afterAction: 'ADD_TO_HAND',
      },
      log: 'hBP02-001 oshi: 搜尋吉祥物',
    };
  });

  // ── End of Round F-3 ──

  // ── Round F-4: 5 unique-logic oshi cards ────────────────────────────────

  // F-4.1 hBP02-004 沙花叉クロヱ
  //   oshi: [1/turn, center=クロヱ] Look at deck top 3; archive them OR
  //         reorder to deck top.
  //         Pragmatic: auto-archive all 3 (the order-back-to-top variant
  //         needs a multi-step prompt; surfaced as a log hint).
  //   sp:   [1/game] Count own hand size N; return hand + all archive
  //         members to deck, reshuffle, draw N from deck.
  reg('hBP02-004', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const n = own.zones[ZONE.HAND].length;
      // Move all hand to deck
      while (own.zones[ZONE.HAND].length > 0) {
        own.zones[ZONE.DECK].push(own.zones[ZONE.HAND].shift());
      }
      // Move archive members to deck (members only, not cheer/support)
      const remainingArchive = [];
      for (const c of own.zones[ZONE.ARCHIVE]) {
        if (isMember(getCard(c.cardId)?.type)) {
          own.zones[ZONE.DECK].push(c);
        } else {
          remainingArchive.push(c);
        }
      }
      own.zones[ZONE.ARCHIVE] = remainingArchive;
      // Shuffle deck
      const deck = own.zones[ZONE.DECK];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      // Draw N
      drawCards(own, n);
      return { state, resolved: true, log: `hBP02-004 SP: 手牌+存檔成員洗回，抽 ${n}` };
    }
    // oshi: must be center=クロヱ
    if (getCard(own.zones[ZONE.CENTER]?.cardId)?.name !== '沙花叉クロヱ') {
      return { state, resolved: true, log: 'hBP02-004 oshi: 中心非クロヱ' };
    }
    // Pragmatic: archive top 3
    let archived = 0;
    for (let i = 0; i < 3 && own.zones[ZONE.DECK].length > 0; i++) {
      const c = own.zones[ZONE.DECK].shift();
      c.faceDown = false;
      own.zones[ZONE.ARCHIVE].push(c);
      archived++;
    }
    return { state, resolved: true, log: `hBP02-004 oshi: 牌頂 ${archived} 張進存檔（如需保留可手動）` };
  });

  // F-4.2 hBP03-001 姫森ルーナ
  //   oshi: Search a "パソコン" item from deck → hand. Reshuffle.
  //   sp:   REACTIVE-ish (center=ルーナ + multi-distribute ルーナイト).
  //         Hint log.
  reg('hBP03-001', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      return { state, resolved: true, log: 'hBP03-001 SP: 1-4 ルーナイト 分配給成員（手動）' };
    }
    const own = state.players[ctx.player];
    const candidates = [];
    for (const c of own.zones[ZONE.DECK]) {
      const card = getCard(c.cardId);
      if ((card?.name || '').includes('パソコン')) {
        candidates.push({
          instanceId: c.instanceId, cardId: c.cardId,
          name: card.name, image: getCardImage(c.cardId),
        });
      }
    }
    if (candidates.length === 0) {
      const deck = own.zones[ZONE.DECK];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      return { state, resolved: true, log: 'hBP03-001 oshi: 牌組無パソコン' };
    }
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT',
        player: ctx.player,
        message: 'ルーナ oshi: 選 1 張パソコン 加入手牌',
        cards: candidates, maxSelect: 1,
        afterAction: 'ADD_TO_HAND',
      },
      log: 'hBP03-001 oshi: 搜尋 パソコン',
    };
  });

  // F-4.3 hBP04-003 一条莉々華
  //   oshi: [1/turn, when own center has #ReGLOSS] 50 special damage to
  //         opp collab member. Real handler — uses applyDamageToMember
  //         then sweepEffectKnockouts auto-fires via fireEffect chain.
  //   sp:   REACTIVE (when own 莉々華 knocked → search). Hint log.
  reg('hBP04-003', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      return { state, resolved: true, log: 'hBP04-003 SP: 莉々華 被擊倒時觸發（手動）' };
    }
    const own = state.players[ctx.player];
    const center = own.zones[ZONE.CENTER];
    const tag = getCard(center?.cardId)?.tag || '';
    if (!(typeof tag === 'string' ? tag : JSON.stringify(tag)).includes('#ReGLOSS')) {
      return { state, resolved: true, log: 'hBP04-003 oshi: 中心非 #ReGLOSS' };
    }
    const opp = state.players[1 - ctx.player];
    const collab = opp.zones[ZONE.COLLAB];
    if (!collab) return { state, resolved: true, log: 'hBP04-003 oshi: 對手無聯動' };
    applyDamageToMember(collab, 50);
    return { state, resolved: true, log: 'hBP04-003 oshi: 對手聯動 50 特殊傷害' };
  });

  // F-4.4 hBP04-007 アーニャ・メルフィッサ
  //   oshi: Search 古代武器 from deck → attach to own member. Reshuffle.
  //   sp:   Distribute archive cheer to all members with 古代武器 attached
  //         (1 each).
  reg('hBP04-007', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    const own = state.players[ctx.player];
    if (ctx.skillType === 'sp') {
      const stage = [
        own.zones[ZONE.CENTER], own.zones[ZONE.COLLAB],
        ...(own.zones[ZONE.BACKSTAGE] || []),
      ].filter(Boolean);
      const targets = stage.filter(m =>
        (m.attachedSupport || []).some(s => getCard(s.cardId)?.name === '古代武器')
      );
      if (targets.length === 0) {
        return { state, resolved: true, log: 'hBP04-007 SP: 無持有古代武器的成員' };
      }
      let sent = 0;
      for (const t of targets) {
        if (sendCheerFromArchiveToMember(own, t)) sent++;
      }
      return { state, resolved: true, log: `hBP04-007 SP: 存檔吶喊→${sent} 位古代武器持有者` };
    }
    // oshi: search 古代武器 → attach
    const candidates = [];
    for (const c of own.zones[ZONE.DECK]) {
      const card = getCard(c.cardId);
      if (card?.name === '古代武器') {
        candidates.push({
          instanceId: c.instanceId, cardId: c.cardId,
          name: card.name, image: getCardImage(c.cardId),
        });
      }
    }
    if (candidates.length === 0) {
      const deck = own.zones[ZONE.DECK];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      return { state, resolved: true, log: 'hBP04-007 oshi: 牌組無古代武器' };
    }
    // Auto-target first own member
    const stage = [
      own.zones[ZONE.CENTER], own.zones[ZONE.COLLAB],
      ...(own.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean);
    if (stage.length === 0) return { state, resolved: true, log: 'hBP04-007 oshi: 無成員可附加' };
    return {
      state, resolved: false,
      prompt: {
        type: 'SEARCH_SELECT',
        player: ctx.player,
        message: '選 1 張「古代武器」附加給成員',
        cards: candidates, maxSelect: 1,
        afterAction: 'ATTACH_SUPPORT',
        targetInstanceId: stage[0].instanceId,
      },
      log: 'hBP04-007 oshi: 搜尋古代武器',
    };
  });

  // F-4.5 hBP05-001 白銀ノエル
  //   oshi: REACTIVE (when own knocks opp → search #3期生).
  //   sp:   REACTIVE (when own #3期生 knocked → life -1 + Buzz/2nd → draw 2).
  // Both reactive — engine doesn't support reactive oshi activation. Hints.
  reg('hBP05-001', HOOK.ON_OSHI_SKILL, (state, ctx) => {
    if (ctx.skillType === 'sp') {
      return { state, resolved: true, log: 'hBP05-001 SP: 3期生被擊倒時觸發（手動）' };
    }
    return { state, resolved: true, log: 'hBP05-001 oshi: 擊倒對手時觸發 #3期生 搜尋（手動）' };
  });

  // ── End of Round F-4 ──

  // 173. hSD09-007 不知火フレア Debut effectG:
  //   [Limited collab] During opp turn, when this member is knocked out, if
  //   own life < opp life, life loss is reduced by 1.
  // ON_KNOCKDOWN ctx.lifeLossDelta = -1 (the engine clamps to ≥0).
  reg('hSD09-007', HOOK.ON_KNOCKDOWN, (state, ctx) => {
    // Only when THIS knocked-down member is the hSD09-007 instance
    if (ctx.cardId !== 'hSD09-007') return { state, resolved: true };
    // Position requirement: was in collab. After damage but before archive,
    // the member is still in the zones — check own collab.
    const own = state.players[ctx.player];
    if (own?.zones[ZONE.COLLAB]?.instanceId !== ctx.memberInst?.instanceId) {
      return { state, resolved: true };
    }
    // Opp turn requirement: attacker is the active player (i.e. it's their turn)
    if (state.activePlayer !== ctx.attackerPlayer) {
      return { state, resolved: true };
    }
    // Life condition: own life < opp life
    const opp = state.players[ctx.attackerPlayer];
    const myLife = own.zones[ZONE.LIFE]?.length || 0;
    const oppLife = opp?.zones[ZONE.LIFE]?.length || 0;
    if (myLife >= oppLife) return { state, resolved: true };
    ctx.lifeLossDelta = (ctx.lifeLossDelta || 0) - 1;
    return { state, resolved: true, log: 'フレア passive: 生命劣勢 → 生命損失 -1' };
  });

  return count;
}
