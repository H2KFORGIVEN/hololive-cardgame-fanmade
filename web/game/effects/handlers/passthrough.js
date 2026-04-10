// Universal fallback handler — registers EVERY card with effect text
// to use a passthrough handler. This ensures no game flow blocks on a manual prompt.
// The effect text is logged so the player can read it and use Manual Adjust if needed.

import { registerEffect, hasHandler, HOOK } from '../EffectRegistry.js';
import { getCard, localized } from '../../core/CardDatabase.js';

function createPassthroughHandler(text, cardName) {
  return function handler(state, context) {
    return {
      state, resolved: true,
      log: `${cardName}: ${text.substring(0, 80)}${text.length > 80 ? '...' : ''}`,
    };
  };
}

function getEffectText(card, hookType) {
  const get = (obj) => {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj['zh-TW'] || obj['ja'] || obj['en'] || '';
  };
  const getNested = (obj, key) => obj?.[key] ? get(obj[key].effect || obj[key]) : '';

  switch (hookType) {
    case HOOK.ON_BLOOM: return get(card.effectB?.effect);
    case HOOK.ON_COLLAB: return get(card.effectC?.effect);
    case HOOK.ON_PLAY: return get(card.supportEffect);
    case HOOK.ON_OSHI_SKILL: return get(card.oshiSkill?.effect) || get(card.spSkill?.effect);
    case HOOK.ON_ART_DECLARE:
    case HOOK.ON_ART_RESOLVE:
      return get(card.art1?.effect) || get(card.art2?.effect);
    default: return '';
  }
}

// Register a passthrough handler for every (cardId, hook) that has effect text
// but no automated handler yet
export function registerPassthrough(effectsData) {
  let registered = 0;
  for (const e of effectsData) {
    const card = getCard(e.id);
    if (!card) continue;

    // Map hook key to HOOK constant
    let hook;
    switch (e.hook) {
      case 'oshiSkill':
      case 'spSkill': hook = HOOK.ON_OSHI_SKILL; break;
      case 'effectC': hook = HOOK.ON_COLLAB; break;
      case 'effectB': hook = HOOK.ON_BLOOM; break;
      case 'effectG': hook = HOOK.ON_PASSIVE_GLOBAL; break;
      case 'stageSkill': hook = HOOK.ON_STAGE_SKILL; break;
      case 'art1':
      case 'art2': hook = HOOK.ON_ART_RESOLVE; break;
      case 'support': hook = HOOK.ON_PLAY; break;
      case 'cheer': hook = HOOK.ON_CHEER_ATTACH; break;
      default: continue;
    }

    // Skip if a real handler already exists
    if (hasHandler(e.id, hook)) continue;

    const cardName = card.name || e.id;
    registerEffect(e.id, hook, createPassthroughHandler(e.text, cardName));
    registered++;
  }
  return registered;
}
