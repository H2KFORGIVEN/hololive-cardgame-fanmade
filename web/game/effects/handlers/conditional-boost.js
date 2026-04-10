// T18: Conditional damage boosts based on game state
// Examples:
// - "When this member has props/tools, damage +50"
// - "If you used a support card, damage +20"
// - "For every member marked #Promise, damage +20"
// - "When core member is marked #ID, damage +50"

import { getCard } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE } from '../../core/constants.js';
import { parseNumber } from './common.js';

function createConditionalBoostHandler(amount, conditionType, conditionValue) {
  return function handler(state, context) {
    const p = context.player;
    const player = state.players[p];

    let multiplier = 1;
    let conditionMet = false;

    switch (conditionType) {
      case 'has_tool':
      case 'has_mascot':
      case 'has_fan': {
        const member = context.memberInst;
        if (member?.attachedSupport?.length > 0) conditionMet = true;
        break;
      }
      case 'used_support': {
        if (player.usedLimited || (state._supportsPlayedThisTurn?.[p] > 0)) conditionMet = true;
        break;
      }
      case 'count_tag': {
        // Count members on stage with the matching tag
        const allMembers = [
          player.zones[ZONE.CENTER],
          player.zones[ZONE.COLLAB],
          ...player.zones[ZONE.BACKSTAGE]
        ].filter(Boolean);
        let count = 0;
        for (const m of allMembers) {
          const card = getCard(m.cardId);
          if (card?.tag?.includes(conditionValue)) count++;
        }
        multiplier = count;
        conditionMet = count > 0;
        break;
      }
      case 'has_tag': {
        const card = getCard(context.memberInst?.cardId);
        if (card?.tag?.includes(conditionValue)) conditionMet = true;
        break;
      }
      case 'cheer_count': {
        const member = context.memberInst;
        const cheerCount = member?.attachedCheer?.length || 0;
        if (cheerCount >= (conditionValue || 1)) conditionMet = true;
        break;
      }
    }

    if (conditionMet) {
      const total = amount * multiplier;
      return {
        state, resolved: true,
        effect: { type: 'DAMAGE_BOOST', amount: total, target: 'self', duration: 'instant' },
        log: `條件成立，傷害 +${total}`,
      };
    }
    return { state, resolved: true };
  };
}

export function registerConditionalBoost(effectsData) {
  let registered = 0;
  for (const e of effectsData) {
    const text = e.text.toLowerCase();
    if (!/damage.*\+|\+.*damage/i.test(text)) continue;

    const amountMatch = text.match(/\+\s*(\d+)|damage\s*(?:is\s*)?\+\s*(\d+)/i);
    const amount = amountMatch ? parseInt(amountMatch[1] || amountMatch[2]) : 0;
    if (amount === 0) continue;

    let conditionType = null;
    let conditionValue = null;

    if (/has\s+tool|with.*tool|attached.*tool/i.test(text)) conditionType = 'has_tool';
    else if (/has\s+mascot|with.*mascot/i.test(text)) conditionType = 'has_mascot';
    else if (/has\s+fan|with.*fan/i.test(text)) conditionType = 'has_fan';
    else if (/used.*support/i.test(text)) conditionType = 'used_support';
    else if (/for every.*marked|every.*tagged/i.test(text)) {
      conditionType = 'count_tag';
      const tagMatch = text.match(/#(\w+)/);
      if (tagMatch) conditionValue = '#' + tagMatch[1];
    } else if (/marked\s+#|tag(?:ged)?\s*#/i.test(text)) {
      conditionType = 'has_tag';
      const tagMatch = text.match(/#(\w+)/);
      if (tagMatch) conditionValue = '#' + tagMatch[1];
    } else if (/(\d+)\s+or more cheer/i.test(text)) {
      conditionType = 'cheer_count';
      const cheerMatch = text.match(/(\d+)\s+or more cheer/i);
      conditionValue = cheerMatch ? parseInt(cheerMatch[1]) : 1;
    }

    if (!conditionType) continue;

    let hook = HOOK.ON_ART_DECLARE;
    if (e.hook === 'effectB') hook = HOOK.ON_BLOOM;
    else if (e.hook === 'effectC') hook = HOOK.ON_COLLAB;
    else if (e.hook === 'oshiSkill' || e.hook === 'spSkill') hook = HOOK.ON_OSHI_SKILL;
    else if (e.hook === 'support') hook = HOOK.ON_PLAY;

    registerEffect(e.id, hook, createConditionalBoostHandler(amount, conditionType, conditionValue));
    registered++;
  }
  return registered;
}
