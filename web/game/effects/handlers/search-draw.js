// T03 & T04: Search deck / Draw cards
// T03: "look at top N, reveal X matching, add to hand, rest to bottom"
// T04: "draw N cards"

import { getCard } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { parseNumber, parseColor, drawCards, revealDeckTop } from './common.js';
import { ZONE } from '../../core/constants.js';

function createDrawHandler(count) {
  return function handler(state, context) {
    const p = context.player;
    const player = state.players[p];
    const drawn = drawCards(player, count);

    state.log.push({
      turn: state.turnNumber, player: p,
      msg: `  抽了 ${drawn.length} 張牌`,
      ts: Date.now()
    });

    return { state, resolved: true, log: `抽 ${count} 張牌` };
  };
}

function createSearchHandler(lookCount, addCondition = null, color = null) {
  return function handler(state, context) {
    const p = context.player;
    const player = state.players[p];

    const revealed = revealDeckTop(player, lookCount);
    if (revealed.length === 0) {
      return { state, resolved: true, log: '牌組為空' };
    }

    // For now, return a prompt for player to choose
    return {
      state,
      resolved: false,
      prompt: {
        type: 'SEARCH_SELECT',
        player: p,
        message: `查看牌組上方 ${lookCount} 張，選擇加入手牌的卡片`,
        cards: revealed.map(c => ({
          instanceId: c.instanceId,
          cardId: c.cardId,
          name: getCard(c.cardId)?.name || '',
        })),
        color, // optional color restriction
      },
    };
  };
}

export function registerSearchDraw(effectsData) {
  let registered = 0;

  for (const e of effectsData) {
    const text = e.text.toLowerCase();

    // T04: Draw cards
    if (e.categories?.includes('DRAW_CARD')) {
      const drawMatch = text.match(/draw\s+(\d+)\s+card/i);
      const count = drawMatch ? parseInt(drawMatch[1]) : 1;

      let hook = HOOK.ON_PLAY;
      if (e.hook === 'oshiSkill' || e.hook === 'spSkill') hook = HOOK.ON_OSHI_SKILL;
      else if (e.hook === 'effectC') hook = HOOK.ON_COLLAB;
      else if (e.hook === 'effectB') hook = HOOK.ON_BLOOM;
      else if (e.hook === 'art1' || e.hook === 'art2') hook = HOOK.ON_ART_RESOLVE;

      registerEffect(e.id, hook, createDrawHandler(count));
      registered++;
      continue;
    }

    // T03: Search deck
    if (e.categories?.includes('SEARCH_DECK')) {
      const lookMatch = text.match(/(?:look\s+at|reveal).*?(?:top\s+)?(\d+)/i);
      const lookCount = lookMatch ? parseInt(lookMatch[1]) : 4;
      const color = parseColor(text);

      let hook = HOOK.ON_PLAY;
      if (e.hook === 'oshiSkill' || e.hook === 'spSkill') hook = HOOK.ON_OSHI_SKILL;
      else if (e.hook === 'effectC') hook = HOOK.ON_COLLAB;
      else if (e.hook === 'effectB') hook = HOOK.ON_BLOOM;
      else if (e.hook === 'art1' || e.hook === 'art2') hook = HOOK.ON_ART_RESOLVE;

      registerEffect(e.id, hook, createSearchHandler(lookCount, null, color));
      registered++;
    }
  }

  return registered;
}
