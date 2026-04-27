// Maps (cardId, hookType) -> handler function
// Handler signature: (state, context) => { state, prompt? }

const _handlers = new Map();

export function registerEffect(cardId, hookType, handler) {
  const key = `${cardId}|${hookType}`;
  _handlers.set(key, handler);
}

export function getHandler(cardId, hookType) {
  return _handlers.get(`${cardId}|${hookType}`) || null;
}

export function hasHandler(cardId, hookType) {
  return _handlers.has(`${cardId}|${hookType}`);
}

// Hook types
export const HOOK = {
  ON_PLAY: 'ON_PLAY',
  ON_BLOOM: 'ON_BLOOM',
  ON_COLLAB: 'ON_COLLAB',
  ON_ART_DECLARE: 'ON_ART_DECLARE',
  ON_ART_RESOLVE: 'ON_ART_RESOLVE',
  ON_DAMAGE_DEALT: 'ON_DAMAGE_DEALT',
  ON_DAMAGE_TAKEN: 'ON_DAMAGE_TAKEN',
  ON_KNOCKDOWN: 'ON_KNOCKDOWN',
  ON_TURN_START: 'ON_TURN_START',
  ON_TURN_END: 'ON_TURN_END',
  ON_OSHI_SKILL: 'ON_OSHI_SKILL',
  ON_PASSIVE_GLOBAL: 'ON_PASSIVE_GLOBAL', // effectG: while on stage
  ON_STAGE_SKILL: 'ON_STAGE_SKILL',       // stageSkill (oshi alt skill)
  ON_CHEER_ATTACH: 'ON_CHEER_ATTACH',     // yellEffect on cheer cards
  ON_PLACE: 'ON_PLACE',                   // when placed from hand to stage
  ON_RETURN_TO_DECK: 'ON_RETURN_TO_DECK', // when stage member returns to deck
};
