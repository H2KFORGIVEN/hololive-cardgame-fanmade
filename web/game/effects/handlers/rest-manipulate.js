// T09: Rest state manipulation — put member to rest / prevent rest / force active

import { getCard } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { getStageMembers } from './common.js';
import { MEMBER_STATE, ZONE } from '../../core/constants.js';

function createRestHandler(targetType = 'opponent_center') {
  return function handler(state, context) {
    const p = context.player;
    const opponent = state.players[1 - p];

    if (targetType === 'opponent_center') {
      if (opponent.zones[ZONE.CENTER]) {
        opponent.zones[ZONE.CENTER].state = MEMBER_STATE.REST;
        return { state, resolved: true, log: '對手中心成員進入休息狀態' };
      }
    } else if (targetType === 'opponent_choose') {
      return {
        state, resolved: false,
        prompt: { type: 'SELECT_TARGET', player: p, message: '選擇對手的成員使其進入休息狀態',
          targets: getStageMembers(opponent).map(m => m.inst.instanceId) },
      };
    }
    return { state, resolved: true };
  };
}

function createActivateHandler() {
  return function handler(state, context) {
    const p = context.player;
    const player = state.players[p];
    return {
      state, resolved: false,
      prompt: { type: 'SELECT_OWN_MEMBER', player: p, message: '選擇己方成員使其恢復活動狀態',
        targets: getStageMembers(player).filter(m => m.inst.state === MEMBER_STATE.REST).map(m => m.inst.instanceId) },
    };
  };
}

export function registerRestManipulate(effectsData) {
  let registered = 0;
  for (const e of effectsData) {
    if (!e.categories?.includes('REST_MANIPULATE')) continue;
    const text = e.text.toLowerCase();

    let hook = HOOK.ON_PLAY;
    if (e.hook === 'oshiSkill' || e.hook === 'spSkill') hook = HOOK.ON_OSHI_SKILL;
    else if (e.hook === 'effectC') hook = HOOK.ON_COLLAB;
    else if (e.hook === 'effectB') hook = HOOK.ON_BLOOM;
    else if (e.hook === 'art1' || e.hook === 'art2') hook = HOOK.ON_ART_RESOLVE;

    if (text.includes('opponent') && text.includes('rest')) {
      registerEffect(e.id, hook, createRestHandler('opponent_choose'));
      registered++;
    } else if (text.includes('active') || text.includes('activate')) {
      registerEffect(e.id, hook, createActivateHandler());
      registered++;
    } else if (text.includes('rest')) {
      registerEffect(e.id, hook, createRestHandler('opponent_center'));
      registered++;
    }
  }
  return registered;
}
