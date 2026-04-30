// Maps (cardId, hookType) -> handler function
// Handler signature: (state, context) => { state, prompt? }

const _handlers = new Map();

// Hooks that the engine BROADCASTS to non-self members
// (e.g. processCollab fires ON_COLLAB with triggerEvent='member_collabed'
// to every other own-stage member after the direct collabing card runs).
// For these hooks, the default behavior is "only fire on the direct
// trigger". A handler that wants observer-style broadcasts must opt in
// by reading ctx.triggerEvent itself — we detect that via toString().
//
// Without this wrapping, bulk handlers that don't check ctx.triggerEvent
// would fire on every broadcast, causing wrong-card effects to chain off
// any collab/bloom anywhere on the player's side. (User-reported bug:
// hBP07-051 "送吶喊" fired on every collab because the bulk handler
// never inspected triggerEvent.)
const BROADCAST_HOOKS = new Set(['ON_COLLAB', 'ON_BLOOM']);

export function registerEffect(cardId, hookType, handler) {
  const key = `${cardId}|${hookType}`;

  // Auto-wrap broadcast-receiving handlers that don't already opt in.
  if (BROADCAST_HOOKS.has(hookType) && typeof handler === 'function') {
    const src = String(handler);
    const optsIn = src.includes('triggerEvent');
    if (!optsIn) {
      const inner = handler;
      handler = (state, ctx) => {
        // Engine broadcasts use these triggerEvent values; skip them
        // unless the handler opted in.
        if (ctx && (ctx.triggerEvent === 'member_collabed' ||
                    ctx.triggerEvent === 'member_bloomed')) {
          return { state, resolved: true };
        }
        return inner(state, ctx);
      };
    }
  }

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
  ON_PHASE_START: 'ON_PHASE_START',       // K-5: any phase begin (own/opp)
  ON_PHASE_END: 'ON_PHASE_END',           // K-5: any phase end (own/opp)
};
