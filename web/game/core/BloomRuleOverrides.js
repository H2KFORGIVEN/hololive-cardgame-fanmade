// Bloom rule override registry — allows specific cards to bypass the
// standard "must be exactly +1 bloom level" check in ActionValidator's
// BLOOM action. Keyed on the TARGET (the member being bloomed), so a
// Debut AZKi being asked to receive a 2nd-level bloom can opt-in based
// on the player's state.
//
// Each entry is a predicate: (handCard, targetMember, ownPlayer) → boolean.
// Returns true to ALLOW skipping levels; false/undefined leaves the
// standard rule in place.

import { getCard } from './CardDatabase.js';
import { ZONE } from './constants.js';

const REGISTRY = {
  // hBP01-045 AZKi Debut effectG: "When own life ≤ 3, this can bloom from
  // hand directly to a 2nd member, bypassing the 1st step."
  'hBP01-045': (handCard, target, ownPlayer) => {
    if (handCard?.bloom !== '2nd') return false;
    if (getCard(target?.cardId)?.name !== 'AZKi') return false;
    const life = ownPlayer?.zones?.[ZONE.LIFE]?.length || 0;
    return life <= 3;
  },
};

/**
 * Returns true if the BLOOM action should bypass the standard
 * "exactly +1 level" rule for this hand-card → target combination.
 * Caller still checks all other invariants (same name, not already
 * bloomed this turn, etc.).
 */
export function isBloomLevelOverridden(handCard, targetMember, ownPlayer) {
  const targetId = targetMember?.cardId;
  if (!targetId) return false;
  const fn = REGISTRY[targetId];
  if (typeof fn !== 'function') return false;
  return !!fn(handCard, targetMember, ownPlayer);
}
