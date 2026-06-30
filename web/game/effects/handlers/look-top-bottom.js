// Handlers for "查看牌組上方X張 → 選符合條件加入手牌 → 其餘放回牌底" pattern
// These support cards all follow the same template

import { getCard, getCardImage } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE, isMember, isSupport } from '../../core/constants.js';

function hasTag(c, t) { return getCard(c.cardId)?.tag?.includes(t); }

function lookTopAndBottom(reg, cardId, topCount, predicate, msg) {
  reg(cardId, HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    const count = Math.min(topCount, player.zones[ZONE.DECK].length);
    const topCards = player.zones[ZONE.DECK].slice(0, count);
    const allCards = topCards.map(c => {
      const d = getCard(c.cardId);
      return { instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) };
    });
    const matchCards = allCards.filter(c => {
      const inst = topCards.find(x => x.instanceId === c.instanceId);
      return inst && predicate(inst);
    });

    if (matchCards.length > 0) {
      return {
        state, resolved: false,
        prompt: {
          type: 'SEARCH_SELECT', player: ctx.player,
          message: msg,
          cards: matchCards, maxSelect: matchCards.length,
          afterAction: 'ADD_TO_HAND',
          remainingCards: allCards, noShuffle: true,
        },
      };
    }
    // No matches: order all to bottom
    return {
      state, resolved: false,
      prompt: {
        type: 'ORDER_TO_BOTTOM', player: ctx.player,
        message: `頂 ${topCount} 張無符合條件的卡，選擇放回牌底的順序`,
        cards: allCards,
      },
    };
  });
}

export function registerLookTopBottom() {
  let count = 0;
  const reg = (id, hook, fn) => { registerEffect(id, hook, fn); count++; };

  // ── Tag-based: 查看上方4張，展示標示#TAG的成員 ──
  const tagCards = [
    ['hBP01-102', '#歌', '選擇 #歌 成員加入手牌'],
    ['hBP01-111', '#ID3期生', '選擇 #ID3期生 成員加入手牌'],
    ['hBP01-113', '#Promise', '選擇 #Promise 成員加入手牌'],
    ['hBP02-075', '#絵', '選擇 #絵 成員加入手牌'],
    ['hBP02-080', '#秘密結社holoX', '選擇 #holoX 成員加入手牌'],
    ['hBP02-081', '#ID2期生', '選擇 #ID2期生 成員加入手牌'],
    ['hBP02-082', '#ゲーマーズ', '選擇 #ゲーマーズ 成員加入手牌'],
    ['hBP03-091', '#ID1期生', '選擇 #ID1期生 成員加入手牌'],
    ['hBP03-092', '#0期生', '選擇 #0期生 成員加入手牌'],
    ['hBP03-093', '#4期生', '選擇 #4期生 成員加入手牌'],
    ['hBP03-094', '#シューター', '選擇 #シューター 成員加入手牌'],
    ['hBP04-092', '#5期生', '選擇 #5期生 成員加入手牌'],
    ['hBP04-093', '#2期生', '選擇 #2期生 成員加入手牌'],
    ['hBP04-096', '#Advent', '選擇 #Advent 成員加入手牌'],
    ['hBP05-078', '#お酒', '選擇 #お酒 成員加入手牌'],
    ['hBP06-091', '#1期生', '選擇 #1期生 成員加入手牌'],
    ['hPR-002', '#ReGLOSS', '選擇 #ReGLOSS 成員加入手牌'],
    ['hSD10-012', '#FLOW GLOW', '選擇 #FLOW GLOW 成員加入手牌'],
    ['hSD13-016', '#Justice', '選擇 #Justice 成員加入手牌'],
  ];
  for (const [id, tag, msg] of tagCards) {
    lookTopAndBottom(reg, id, 4, c => hasTag(c, tag) && isMember(getCard(c.cardId)?.type), `牌組頂 4 張中${msg}`);
  }

  // ── Name-based: 查看上方4張，展示指定角色名 ──
  const nameCards = [
    ['hBP01-109', ['兎田ぺこら', 'ムーナ・ホシノヴァ'], '選擇成員加入手牌'],
    ['hBP02-078', ['天音かなた', 'AZKi', '沙花叉クロヱ'], '選擇成員加入手牌'],
    ['hBP05-077', ['白上フブキ', '不知火フレア', '角巻わため', '尾丸ポルカ'], '選擇成員加入手牌'],
    ['hSD01-021', ['ときのそら', 'AZKi'], '選擇成員加入手牌'],
    ['hSD02-012', ['白上フブキ', '大神ミオ', '百鬼あやめ'], '選擇成員加入手牌'],
    ['hSD03-012', ['猫又おかゆ', '鷹嶺ルイ', '大神ミオ', '白上フブキ', 'ラプラス・ダークネス', '戌神ころね'], '選擇成員加入手牌'],
    ['hSD04-012', ['大空スバル', '癒月ちょこ', '姫森ルーナ'], '選擇成員加入手牌'],
    ['hSD07-014', ['不知火フレア', '尾丸ポルカ', 'さくらみこ', '星街すいせい', '白銀ノエル'], '選擇成員加入手牌'],
  ];
  for (const [id, names, msg] of nameCards) {
    lookTopAndBottom(reg, id, 4, c => {
      const d = getCard(c.cardId);
      return d && names.includes(d.name);
    }, `牌組頂 4 張中${msg}`);
  }

  // ── Special: hBP03-085 スーパーパソコン — 展示1張Debut+1張1st ──
  reg('hBP03-085', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    const count = Math.min(4, player.zones[ZONE.DECK].length);
    const top4 = player.zones[ZONE.DECK].slice(0, count);
    const allCards = top4.map(c => {
      const d = getCard(c.cardId);
      return { instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) };
    });
    // Find Debut and 1st members
    const matchCards = allCards.filter(c => {
      const d = getCard(c.cardId);
      return d && isMember(d.type) && (d.bloom === 'Debut' || d.bloom === '1st');
    });
    if (matchCards.length > 0) {
      return { state, resolved: false, prompt: {
        type: 'SEARCH_SELECT', player: ctx.player,
        message: '牌組頂 4 張中選擇 Debut 成員和 1st 成員各1張加入手牌（最多2張）',
        cards: matchCards, maxSelect: 2, afterAction: 'ADD_TO_HAND',
        remainingCards: allCards, noShuffle: true,
      }};
    }
    return { state, resolved: false, prompt: { type: 'ORDER_TO_BOTTOM', player: ctx.player, message: '頂 4 張無符合條件，選擇放回牌底的順序', cards: allCards } };
  });

  // ── Special: hBP04-090 作業用パソコン — 展示1張成員+1張support ──
  reg('hBP04-090', HOOK.ON_PLAY, (state, ctx) => {
    const player = state.players[ctx.player];
    const count = Math.min(4, player.zones[ZONE.DECK].length);
    const top4 = player.zones[ZONE.DECK].slice(0, count);
    const allCards = top4.map(c => {
      const d = getCard(c.cardId);
      return { instanceId: c.instanceId, cardId: c.cardId, name: d?.name || '', image: getCardImage(c.cardId) };
    });
    const matchCards = allCards.filter(c => {
      const d = getCard(c.cardId);
      if (!d) return false;
      return isMember(d.type) || d.type === '支援・道具' || d.type === '支援・吉祥物' || d.type === '支援・粉絲';
    });
    if (matchCards.length > 0) {
      return { state, resolved: false, prompt: {
        type: 'SEARCH_SELECT', player: ctx.player,
        message: '牌組頂 4 張中選擇1張成員和1張道具/吉祥物/粉絲加入手牌（最多2張）',
        cards: matchCards, maxSelect: 2, afterAction: 'ADD_TO_HAND',
        remainingCards: allCards, noShuffle: true,
      }};
    }
    return { state, resolved: false, prompt: { type: 'ORDER_TO_BOTTOM', player: ctx.player, message: '頂 4 張無符合條件，選擇放回牌底的順序', cards: allCards } };
  });

  return count;
}
