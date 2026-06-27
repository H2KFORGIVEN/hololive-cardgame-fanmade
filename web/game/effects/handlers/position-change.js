// T08: Move/swap member positions
// T12: Return cards from archive to hand

import { getCard } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { getStageMembers, parseNumber } from './common.js';
import { ZONE, isMember } from '../../core/constants.js';

// Swap center with backstage member
function createSwapCenterHandler() {
  return function handler(state, context) {
    const p = context.player;
    const player = state.players[p];
    if (!player.zones[ZONE.CENTER] || player.zones[ZONE.BACKSTAGE].length === 0) {
      return { state, resolved: true, log: '無法交換位置' };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_OWN_MEMBER', player: p, message: '選擇後台成員與中心成員交換',
        targets: player.zones[ZONE.BACKSTAGE].map(m => m.instanceId) },
    };
  };
}

// Return member from archive to hand
function createReturnToHandHandler(count = 1, filter = null) {
  return function handler(state, context) {
    const p = context.player;
    const player = state.players[p];
    const eligible = player.zones[ZONE.ARCHIVE].filter(c => {
      const card = getCard(c.cardId);
      if (!card) return false;
      if (filter === 'member') return isMember(card.type);
      return true;
    });
    if (eligible.length === 0) {
      return { state, resolved: true, log: '存檔區無可選卡片' };
    }
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_FROM_ARCHIVE', player: p,
        message: `從存檔區選擇 ${count} 張卡片加入手牌`,
        count, cards: eligible.map(c => ({ instanceId: c.instanceId, cardId: c.cardId, name: getCard(c.cardId)?.name })) },
    };
  };
}

export function registerPositionChange(effectsData) {
  let registered = 0;
  for (const e of effectsData) {
    const text = e.text.toLowerCase();
    let hook = HOOK.ON_PLAY;
    if (e.hook === 'oshiSkill' || e.hook === 'spSkill') hook = HOOK.ON_OSHI_SKILL;
    else if (e.hook === 'effectC') hook = HOOK.ON_COLLAB;
    else if (e.hook === 'effectB') hook = HOOK.ON_BLOOM;
    else if (e.hook === 'art1' || e.hook === 'art2') hook = HOOK.ON_ART_RESOLVE;

    if (e.categories?.includes('MOVE_MEMBER')) {
      if (text.includes('swap') || text.includes('replace') || text.includes('exchange') || text.includes('switch')) {
        registerEffect(e.id, hook, createSwapCenterHandler());
        registered++;
      }
    }
    if (e.categories?.includes('RETURN_TO_HAND')) {
      const count = parseNumber(text.match(/(\d+)\s+(?:card|member)/i)?.[0] || '1');
      const filter = text.includes('member') ? 'member' : null;
      registerEffect(e.id, hook, createReturnToHandHandler(count, filter));
      registered++;
    }
  }
  return registered;
}
