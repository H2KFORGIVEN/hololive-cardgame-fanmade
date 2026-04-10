import { PHASE, ZONE, MEMBER_STATE } from './constants.js';

let _nextInstanceId = 1;

export function createCardInstance(cardId, faceDown = false) {
  return {
    instanceId: _nextInstanceId++,
    cardId,
    state: MEMBER_STATE.ACTIVE,
    damage: 0,
    attachedCheer: [],
    attachedSupport: [],
    bloomedThisTurn: false,
    placedThisTurn: false,
    bloomStack: [],
    faceDown,
  };
}

export function createPlayerState() {
  return {
    oshi: null, // { cardId, usedSp: false }
    zones: {
      [ZONE.CENTER]: null,
      [ZONE.COLLAB]: null,
      [ZONE.BACKSTAGE]: [],
      [ZONE.HAND]: [],
      [ZONE.DECK]: [],
      [ZONE.CHEER_DECK]: [],
      [ZONE.HOLO_POWER]: [],
      [ZONE.LIFE]: [],
      [ZONE.ARCHIVE]: [],
    },
    usedCollab: false,
    usedBaton: false,
    usedLimited: false,
    performedArts: { center: false, collab: false },
    oshiSkillUsedThisTurn: false,
  };
}

export function createGameState() {
  return {
    turnNumber: 0,
    activePlayer: 0,
    phase: PHASE.SETUP,
    firstTurn: [true, true], // each player's first turn flag
    firstPlayer: 0, // who goes first (set during setup)
    winner: null,
    players: [createPlayerState(), createPlayerState()],
    pendingEffect: null,
    log: [],
    mulliganDone: [false, false],
    setupDone: [false, false],
  };
}

// Deep clone state (for immutability)
export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

// Get all members on a player's stage (center + collab + backstage)
export function getStageMembers(playerState) {
  const members = [];
  if (playerState.zones[ZONE.CENTER]) members.push(playerState.zones[ZONE.CENTER]);
  if (playerState.zones[ZONE.COLLAB]) members.push(playerState.zones[ZONE.COLLAB]);
  members.push(...playerState.zones[ZONE.BACKSTAGE]);
  return members;
}

// Count total members on stage
export function getStageCount(playerState) {
  let count = 0;
  if (playerState.zones[ZONE.CENTER]) count++;
  if (playerState.zones[ZONE.COLLAB]) count++;
  count += playerState.zones[ZONE.BACKSTAGE].length;
  return count;
}

// Find a CardInstance by instanceId across all zones
export function findInstance(playerState, instanceId) {
  for (const [zoneName, zone] of Object.entries(playerState.zones)) {
    if (Array.isArray(zone)) {
      const found = zone.find(c => c?.instanceId === instanceId);
      if (found) return { card: found, zone: zoneName };
    } else if (zone?.instanceId === instanceId) {
      return { card: zone, zone: zoneName };
    }
  }
  return null;
}

// Remove a CardInstance from its zone, return the instance
export function removeInstance(playerState, instanceId) {
  for (const [zoneName, zone] of Object.entries(playerState.zones)) {
    if (Array.isArray(zone)) {
      const idx = zone.findIndex(c => c?.instanceId === instanceId);
      if (idx !== -1) return zone.splice(idx, 1)[0];
    } else if (zone?.instanceId === instanceId) {
      playerState.zones[zoneName] = null;
      return zone;
    }
  }
  return null;
}

// Move cards to archive (member + all attached cheer/support)
export function archiveMember(playerState, instanceId) {
  const inst = removeInstance(playerState, instanceId);
  if (!inst) return;
  const archive = playerState.zones[ZONE.ARCHIVE];
  // Archive attached cheer
  for (const cheer of inst.attachedCheer) {
    archive.push(cheer);
  }
  // Archive attached support
  for (const sup of inst.attachedSupport) {
    archive.push(sup);
  }
  inst.attachedCheer = [];
  inst.attachedSupport = [];
  inst.damage = 0;
  archive.push(inst);
}
