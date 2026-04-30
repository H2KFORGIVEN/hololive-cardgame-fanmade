import { getHandler, hasHandler } from './EffectRegistry.js';
import { getCard, localized } from '../core/CardDatabase.js';

// Detect stub-only handler results. phaseD-generated.js registers a
// "hint-log" fallback for every card so coverage = 100%, but those stubs
// just return { state, resolved: true, log: '<cardId> <name>: ...' }
// without doing the effect — silently skipping the card's real action.
//
// We detect those at the engine level and convert them to MANUAL_EFFECT
// prompts (which the GameController surfaces as a toast + log entry).
function isStubLog(result, cardId) {
  if (!result || result.prompt) return false;
  if (result.resolved !== true) return false;
  if (typeof result.log !== 'string') return false;
  // Stub log starts with the cardId (e.g. "hBP01-018 七詩ムメイ art1: ...")
  // or contains "待實作"/"待補"/"placeholder"/"TODO"/"effect manual"
  if (result.log.startsWith(cardId)) return true;
  if (/(待實作|待實做|待補|TODO|placeholder|手動處理)/.test(result.log)) return true;
  return false;
}

// Trigger an effect hook. Returns { state, prompt? }
// If no automated handler exists, returns a MANUAL prompt with the card's effect text.
export function triggerEffect(state, hookType, context) {
  const { cardId } = context;

  if (hasHandler(cardId, hookType)) {
    const handler = getHandler(cardId, hookType);
    const result = handler(state, context);
    // If handler returned a stub-log without doing real work, upgrade to
    // MANUAL_EFFECT so the player gets a visible toast + log.
    if (isStubLog(result, cardId)) {
      const card = getCard(cardId);
      const effectText = getEffectText(card, hookType);
      if (effectText) {
        return {
          state: result.state,
          prompt: {
            type: 'MANUAL_EFFECT',
            cardId,
            hookType,
            text: effectText,
            cardName: card?.name,
          },
        };
      }
    }
    return result;
  }

  // No handler — check if the card has effect text to show
  const card = getCard(cardId);

  // Skip MANUAL_EFFECT for attachment-type support cards (mascot/tool/fan)
  // Their supportEffect text describes passive bonuses, not actions needing player input
  if (hookType === 'ON_PLAY') {
    const attachTypes = ['支援・吉祥物', '支援・道具', '支援・粉絲'];
    if (card && attachTypes.includes(card.type)) return { state };
  }
  if (!card) return { state };

  const effectText = getEffectText(card, hookType);
  if (!effectText) return { state };

  // Return manual prompt
  return {
    state,
    prompt: {
      type: 'MANUAL_EFFECT',
      cardId,
      hookType,
      text: effectText,
      cardName: card.name,
    },
  };
}

function getEffectText(card, hookType) {
  switch (hookType) {
    case 'ON_BLOOM':
      return localized(card.effectB?.effect);
    case 'ON_COLLAB':
      return localized(card.effectC?.effect);
    case 'ON_ART_DECLARE':
    case 'ON_ART_RESOLVE':
      return localized(card.art1?.effect) || localized(card.art2?.effect);
    case 'ON_PLAY':
      return localized(card.supportEffect);
    case 'ON_OSHI_SKILL':
      return localized(card.oshiSkill?.effect) || localized(card.spSkill?.effect);
    default:
      return '';
  }
}
