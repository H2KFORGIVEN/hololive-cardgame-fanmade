import { getHandler, hasHandler } from './EffectRegistry.js';
import { getCard, localized } from '../core/CardDatabase.js';

// Trigger an effect hook. Returns { state, prompt? }
// If no automated handler exists, returns a MANUAL prompt with the card's effect text.
export function triggerEffect(state, hookType, context) {
  const { cardId } = context;

  if (hasHandler(cardId, hookType)) {
    const handler = getHandler(cardId, hookType);
    return handler(state, context);
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
