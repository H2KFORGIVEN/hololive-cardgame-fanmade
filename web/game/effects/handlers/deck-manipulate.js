// New template handlers for deck manipulation
// - Put to top/bottom of deck
// - Shuffle deck
// - Show/look at hand
// - Reveal hand

import { getCard } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE } from '../../core/constants.js';
import { parseNumber } from './common.js';

function createDeckBottomHandler() {
  return function handler(state, context) {
    const p = context.player;
    return {
      state, resolved: false,
      prompt: { type: 'CHOOSE_DECK_POSITION', player: p, message: '選擇將卡牌放到牌組頂部或底部' },
      log: '操作牌組',
    };
  };
}

function createShuffleHandler() {
  return function handler(state, context) {
    const p = context.player;
    const player = state.players[p];
    // Fisher-Yates shuffle
    const deck = player.zones[ZONE.DECK];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return { state, resolved: true, log: '牌組洗牌' };
  };
}

function createShowHandHandler() {
  return function handler(state, context) {
    const p = context.player;
    return {
      state, resolved: false,
      prompt: { type: 'REVEAL_HAND', player: p, message: '展示手牌' },
      log: '展示手牌',
    };
  };
}

export function registerDeckManipulate(effectsData) {
  let registered = 0;
  for (const e of effectsData) {
    const text = e.text.toLowerCase();

    let hook = HOOK.ON_PLAY;
    if (e.hook === 'oshiSkill' || e.hook === 'spSkill') hook = HOOK.ON_OSHI_SKILL;
    else if (e.hook === 'effectC') hook = HOOK.ON_COLLAB;
    else if (e.hook === 'effectB') hook = HOOK.ON_BLOOM;
    else if (e.hook === 'art1' || e.hook === 'art2') hook = HOOK.ON_ART_RESOLVE;

    let matched = false;
    if (/top.*deck|deck.*top|bottom.*deck|deck.*bottom/i.test(text)) {
      registerEffect(e.id, hook, createDeckBottomHandler());
      matched = true;
    } else if (/shuffle|reshuffle/i.test(text)) {
      registerEffect(e.id, hook, createShuffleHandler());
      matched = true;
    } else if (/(?:show|reveal).*hand/i.test(text)) {
      registerEffect(e.id, hook, createShowHandHandler());
      matched = true;
    }
    if (matched) registered++;
  }
  return registered;
}
