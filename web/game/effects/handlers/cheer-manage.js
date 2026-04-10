// T07: Cheer management — attach/move/archive cheer cards

import { getCard } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { parseNumber, parseColor, getStageMembers, cheerFromArchive } from './common.js';
import { ZONE } from '../../core/constants.js';

// "Send 1 cheer from cheer deck to your member"
function createCheerFromDeckHandler(count = 1) {
  return function handler(state, context) {
    const p = context.player;
    const player = state.players[p];

    if (player.zones[ZONE.CHEER_DECK].length === 0) {
      return { state, resolved: true, log: '吶喊牌組為空' };
    }

    // Need player to choose target member
    const members = getStageMembers(player);
    if (members.length === 0) {
      return { state, resolved: true, log: '舞台無成員' };
    }

    return {
      state,
      resolved: false,
      prompt: {
        type: 'CHEER_ASSIGN',
        player: p,
        message: `選擇成員接收 ${count} 張吶喊卡`,
        count,
        source: 'cheerDeck',
        targets: members.map(m => m.inst.instanceId),
      },
    };
  };
}

// "Send 1 cheer from archive to your member"
function createCheerFromArchiveHandler(count = 1) {
  return function handler(state, context) {
    const p = context.player;
    const player = state.players[p];

    const cheerInArchive = player.zones[ZONE.ARCHIVE].filter(c => {
      const card = getCard(c.cardId);
      return card?.type === '吶喊';
    });

    if (cheerInArchive.length === 0) {
      return { state, resolved: true, log: '存檔區無吶喊卡' };
    }

    return {
      state,
      resolved: false,
      prompt: {
        type: 'CHEER_FROM_ARCHIVE',
        player: p,
        message: `從存檔區選擇 ${count} 張吶喊卡發送給成員`,
        count,
        availableCheer: cheerInArchive.map(c => ({ instanceId: c.instanceId, cardId: c.cardId })),
        targets: getStageMembers(player).map(m => m.inst.instanceId),
      },
    };
  };
}

// "Move cheer from one member to another"
function createCheerMoveHandler() {
  return function handler(state, context) {
    const p = context.player;
    const player = state.players[p];

    return {
      state,
      resolved: false,
      prompt: {
        type: 'CHEER_MOVE',
        player: p,
        message: '選擇要移動的吶喊卡和目標成員',
        members: getStageMembers(player).map(m => ({
          instanceId: m.inst.instanceId,
          cheerCount: m.inst.attachedCheer.length,
        })),
      },
    };
  };
}

// "Send N cheer from member to archive"
function createCheerToArchiveHandler(count = 1) {
  return function handler(state, context) {
    const p = context.player;
    return {
      state,
      resolved: false,
      prompt: {
        type: 'CHEER_TO_ARCHIVE',
        player: p,
        message: `將 ${count} 張吶喊卡從成員送到存檔區`,
        count,
        members: getStageMembers(state.players[p]).map(m => ({
          instanceId: m.inst.instanceId,
          cheerCount: m.inst.attachedCheer.length,
        })),
      },
    };
  };
}

export function registerCheerManage(effectsData) {
  let registered = 0;

  for (const e of effectsData) {
    if (!e.categories?.includes('CHEER_MANAGE') && !e.text?.toLowerCase().includes('cheer')) continue;

    const text = e.text.toLowerCase();
    const count = parseNumber(text.match(/(\d+)\s+(?:cheer|shouting|yell)/i)?.[0] || '1');

    let hook = HOOK.ON_PLAY;
    if (e.hook === 'oshiSkill' || e.hook === 'spSkill') hook = HOOK.ON_OSHI_SKILL;
    else if (e.hook === 'effectC') hook = HOOK.ON_COLLAB;
    else if (e.hook === 'effectB') hook = HOOK.ON_BLOOM;
    else if (e.hook === 'art1' || e.hook === 'art2') hook = HOOK.ON_ART_RESOLVE;

    if (text.includes('archive') && text.includes('send') && text.includes('member')) {
      registerEffect(e.id, hook, createCheerFromArchiveHandler(count));
      registered++;
    } else if (text.includes('cheer deck') || text.includes('shouting deck')) {
      registerEffect(e.id, hook, createCheerFromDeckHandler(count));
      registered++;
    } else if (text.includes('move') || text.includes('transfer')) {
      registerEffect(e.id, hook, createCheerMoveHandler());
      registered++;
    } else if (text.includes('put') && text.includes('archive')) {
      registerEffect(e.id, hook, createCheerToArchiveHandler(count));
      registered++;
    }
  }

  return registered;
}
