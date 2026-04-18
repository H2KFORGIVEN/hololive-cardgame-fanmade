import { PHASE, ZONE, MEMBER_STATE } from './constants.js';
export { MEMBER_STATE } from './constants.js';

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

// Jump an initialized state directly to Main phase with cards pre-placed.
// Used by tutorial mode to skip mulligan/setup and start from a known state.
//
// config: {
//   player0: { center?, collab?, backstage?, hand? },
//   player1: { center?, collab?, backstage?, hand? },
//   activePlayer?, firstPlayer?, turnNumber?
// }
// Each member entry: { cardId, cheer?: ['white'|'green'|..., ...], state?: 'active'|'rest', damage? }
// Each hand entry: { cardId } (just a cardId string also accepted)
//
// Cards are pulled from the player's deck if available; otherwise a fresh instance is made.
// Cheer attachments are pulled from cheerDeck (same rule).
export function jumpToMainPhase(state, config = {}) {
  const pullFromDeck = (deck, cardId) => {
    const idx = deck.findIndex(c => c?.cardId === cardId);
    if (idx !== -1) {
      const card = deck.splice(idx, 1)[0];
      card.faceDown = false;
      return card;
    }
    return createCardInstance(cardId, false);
  };

  const attachCheer = (member, cheerDeck, colorOrId) => {
    // If cheerDeck has any cheer, grab the first; otherwise create a fresh instance by id.
    if (cheerDeck.length > 0) {
      const card = cheerDeck.shift();
      card.faceDown = false;
      member.attachedCheer.push(card);
      return;
    }
    // Fallback: create a fresh cheer instance (color passed as cardId for simplicity)
    const inst = createCardInstance(colorOrId, false);
    member.attachedCheer.push(inst);
  };

  const placeMember = (entry, playerState, zoneArrayOrSetter) => {
    const member = pullFromDeck(playerState.zones[ZONE.DECK], entry.cardId);
    member.state = entry.state || MEMBER_STATE.ACTIVE;
    member.damage = entry.damage || 0;
    const cheerList = entry.cheer || [];
    for (const cheerId of cheerList) {
      attachCheer(member, playerState.zones[ZONE.CHEER_DECK], cheerId);
    }
    if (typeof zoneArrayOrSetter === 'function') {
      zoneArrayOrSetter(member);
    } else {
      zoneArrayOrSetter.push(member);
    }
    return member;
  };

  for (let p = 0; p < 2; p++) {
    const cfg = config[`player${p}`] || {};
    const player = state.players[p];

    if (cfg.center) {
      placeMember(cfg.center, player, (m) => { player.zones[ZONE.CENTER] = m; });
    }
    if (cfg.collab) {
      placeMember(cfg.collab, player, (m) => { player.zones[ZONE.COLLAB] = m; });
    }
    if (cfg.backstage) {
      for (const entry of cfg.backstage) {
        placeMember(entry, player, player.zones[ZONE.BACKSTAGE]);
      }
    }
    if (cfg.hand) {
      for (const entry of cfg.hand) {
        const cardId = typeof entry === 'string' ? entry : entry.cardId;
        const card = pullFromDeck(player.zones[ZONE.DECK], cardId);
        player.zones[ZONE.HAND].push(card);
      }
    }
  }

  state.phase = PHASE.MAIN;
  state.activePlayer = config.activePlayer ?? 0;
  state.firstPlayer = config.firstPlayer ?? 0;
  state.turnNumber = config.turnNumber ?? 1;
  // Mark both players as past-first-turn so Performance phase isn't skipped for activePlayer
  // (first player's turn 1 auto-skips Performance — not what we want for Lesson 4/5)
  state.firstTurn = [false, false];
  state.mulliganDone = [true, true];
  state.setupDone = [true, true];
  return state;
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
