// Common helpers for effect handlers
import { getCard, getCardImage, localized } from '../../core/CardDatabase.js';
import { ZONE, MEMBER_STATE } from '../../core/constants.js';
import { findInstance, cloneState } from '../../core/GameState.js';
import { getDamageReceivedModifier } from '../../core/AttachedSupportEffects.js';

// Get all stage members for a player
export function getStageMembers(player) {
  const members = [];
  if (player.zones[ZONE.CENTER]) members.push({ inst: player.zones[ZONE.CENTER], zone: ZONE.CENTER });
  if (player.zones[ZONE.COLLAB]) members.push({ inst: player.zones[ZONE.COLLAB], zone: ZONE.COLLAB });
  player.zones[ZONE.BACKSTAGE].forEach((m, i) => members.push({ inst: m, zone: ZONE.BACKSTAGE, index: i }));
  return members;
}

// Filter members by color
export function filterByColor(members, color) {
  return members.filter(m => {
    const card = getCard(m.inst.cardId);
    return card?.color === color;
  });
}

// Filter members by name
export function filterByName(members, name) {
  return members.filter(m => {
    const card = getCard(m.inst.cardId);
    return card?.name === name;
  });
}

// Filter members by tag
export function filterByTag(members, tag) {
  return members.filter(m => {
    const card = getCard(m.inst.cardId);
    return card?.tag?.includes(tag);
  });
}

// Apply damage to a member instance, check knockdown.
// Incoming damage is adjusted by equipment damageReceivedModifier so
// effect-driven special damage uniformly respects fan/prop modifiers.
export function applyDamageToMember(memberInst, amount) {
  const card = getCard(memberInst.cardId);
  const received = Math.max(0, amount + getDamageReceivedModifier(memberInst));
  memberInst.damage += received;
  return {
    knockedDown: card?.hp ? memberInst.damage >= card.hp : false,
    damage: memberInst.damage,
    hp: card?.hp || 0,
  };
}

// Remove damage from a member (heal)
export function healMember(memberInst, amount) {
  memberInst.damage = Math.max(0, memberInst.damage - amount);
  return memberInst.damage;
}

// Move cheer from one member to another
export function moveCheer(fromInst, toInst, cheerInstanceId) {
  const idx = fromInst.attachedCheer.findIndex(c => c.instanceId === cheerInstanceId);
  if (idx === -1) return false;
  const cheer = fromInst.attachedCheer.splice(idx, 1)[0];
  toInst.attachedCheer.push(cheer);
  return true;
}

// Send cheer from archive to a member
export function cheerFromArchive(player, memberInst, cheerInstanceId) {
  const idx = player.zones[ZONE.ARCHIVE].findIndex(c => c.instanceId === cheerInstanceId);
  if (idx === -1) return false;
  const cheer = player.zones[ZONE.ARCHIVE].splice(idx, 1)[0];
  memberInst.attachedCheer.push(cheer);
  return true;
}

// Draw N cards from deck to hand
export function drawCards(player, count) {
  const drawn = [];
  const baseTime = Date.now();
  for (let i = 0; i < count; i++) {
    if (player.zones[ZONE.DECK].length === 0) break;
    const card = player.zones[ZONE.DECK].shift();
    card.faceDown = false;
    card._drawnAt = baseTime + i * 120; // stagger animation by 120ms
    player.zones[ZONE.HAND].push(card);
    drawn.push(card);
  }
  return drawn;
}

// Reveal N cards from deck top (don't move them yet)
export function revealDeckTop(player, count) {
  return player.zones[ZONE.DECK].slice(0, count);
}

// Parse numbers from effect text (e.g., "+20" -> 20, "50 points" -> 50)
export function parseNumber(text) {
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

// Parse color from effect text
export function parseColor(text) {
  const colorMap = {
    'white': '白', 'green': '綠', 'red': '紅',
    'blue': '藍', 'purple': '紫', 'yellow': '黃',
  };
  for (const [en, zh] of Object.entries(colorMap)) {
    if (text.toLowerCase().includes(en)) return zh;
  }
  return null;
}

// ── Centralized dice rolling ────────────────────────────────────────────────
// All dice rolls SHOULD go through rollDieFor(state, ctx) so engine-level
// overrides (e.g. hBP01-004 SP "本回合擲骰=6") and per-roll rerolls
// (hBP03-108 はあとん, hBP01-123 野うさぎ同盟) can be applied uniformly.
//
// state — current game state (reads/writes _diceOverride and reroll flags)
// ctx   — { player?, member?, source? } describing who's rolling, used by
//         reroll handlers to decide eligibility. May be null.
//
// Behavior:
//   1. If state._diceOverride is a number → return it (overrides EVERYTHING).
//   2. Otherwise roll 1-6 via Math.random.
//   3. Reroll hook: if a member has hBP03-108 はあとん attached AND
//      state._allowDiceReroll != false, the support is auto-archived
//      and the die is rolled again (once). Same for hBP01-123 野うさぎ同盟.
//   4. Returns the final die value.
export function rollDieFor(state, ctx = null) {
  if (state && typeof state._diceOverride === 'number') {
    return state._diceOverride;
  }
  let result = Math.floor(Math.random() * 6) + 1;
  // Per-member reroll: walk attached supports for known reroll fans.
  // hBP03-108 はあとん: archive self → reroll (ignore previous result entirely)
  // hBP01-123 野うさぎ同盟: archive self → reroll (same logic)
  // Only one reroll per call (first match wins).
  const member = ctx?.member;
  const player = ctx?.player != null ? state?.players?.[ctx.player] : null;
  if (member && Array.isArray(member.attachedSupport) && state?._allowDiceReroll !== false) {
    const REROLL_SUPPORTS = new Set(['hBP03-108', 'hBP01-123']);
    const idx = member.attachedSupport.findIndex(s => REROLL_SUPPORTS.has(s.cardId));
    if (idx >= 0 && state?._diceRerollUsedThisRoll !== true) {
      const support = member.attachedSupport.splice(idx, 1)[0];
      if (player) player.zones[ZONE.ARCHIVE].push(support);
      state._diceRerollUsedThisRoll = true;
      result = Math.floor(Math.random() * 6) + 1;
      state._diceRerollUsedThisRoll = false;  // reset for next call
    }
  }
  return result;
}
