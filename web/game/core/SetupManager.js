// SetupManager: Pure functions for game initialization, mulligan, and setup
// Used by both GameController (client) and ws-server (server)

import { PHASE, ZONE, INITIAL_HAND_SIZE, isMember } from './constants.js';
import { getCard } from './CardDatabase.js';
import { createGameState } from './GameState.js';
import { expandDeck, shuffle } from './DeckBuilder.js';

/**
 * Initialize a full game state from two deck configs.
 * @param {Object} deck0 - { oshi, mainDeck, cheerDeck, ... } from DeckBuilder
 * @param {Object} deck1 - Same for player 1
 * @returns {Object} state - Ready for mulligan phase
 */
export function initGameState(deck0, deck1) {
  const state = createGameState();

  [deck0, deck1].forEach((config, p) => {
    const player = state.players[p];
    player.oshi = { cardId: config.oshi, usedSp: false };

    const { mainDeck, cheerDeck } = expandDeck(config);
    shuffle(mainDeck);
    shuffle(cheerDeck);

    player.zones[ZONE.DECK] = mainDeck;
    player.zones[ZONE.CHEER_DECK] = cheerDeck;

    // Set life from oshi
    const oshiCard = getCard(config.oshi);
    const lifeCount = oshiCard?.life || 5;
    for (let i = 0; i < lifeCount; i++) {
      if (player.zones[ZONE.CHEER_DECK].length > 0) {
        const card = player.zones[ZONE.CHEER_DECK].shift();
        card.faceDown = true;
        player.zones[ZONE.LIFE].push(card);
      }
    }
  });

  state.phase = PHASE.SETUP;
  state.log.push({ turn: 0, player: -1, msg: '遊戲開始！', ts: Date.now() });
  return state;
}

/**
 * Draw initial hand for a player.
 * @param {Object} state
 * @param {number} playerNum - 0 or 1
 * @returns {Object} state
 */
export function drawInitialHand(state, playerNum) {
  const player = state.players[playerNum];
  for (let i = 0; i < INITIAL_HAND_SIZE; i++) {
    if (player.zones[ZONE.DECK].length > 0) {
      const card = player.zones[ZONE.DECK].shift();
      card.faceDown = false;
      player.zones[ZONE.HAND].push(card);
    }
  }
  return state;
}

/**
 * Check if a player's hand has at least one Debut/Spot member.
 */
export function handHasDebut(state, playerNum) {
  const hand = state.players[playerNum].zones[ZONE.HAND];
  return hand.some(c => {
    const card = getCard(c.cardId);
    return card && isMember(card.type) && (card.bloom === 'Debut' || card.bloom === 'Spot');
  });
}

/**
 * Process mulligan: reshuffle hand back to deck, redraw.
 * @param {Object} state
 * @param {number} playerNum
 * @param {Object} mulliganState - { count, maxHand }
 * @returns {{ state, mulliganState, gameOver: boolean }}
 */
export function processMulligan(state, playerNum, mulliganState) {
  const player = state.players[playerNum];

  // Put all hand cards back to deck
  while (player.zones[ZONE.HAND].length > 0) {
    player.zones[ZONE.DECK].push(player.zones[ZONE.HAND].pop());
  }
  shuffle(player.zones[ZONE.DECK]);

  mulliganState.count++;
  if (mulliganState.count >= 2) {
    mulliganState.maxHand = INITIAL_HAND_SIZE - (mulliganState.count - 1);
  }

  // Auto-lose if hand size would be 0
  if (mulliganState.maxHand <= 0) {
    state.winner = 1 - playerNum;
    state.phase = PHASE.GAME_OVER;
    state.log.push({ turn: 0, player: playerNum, msg: `P${playerNum + 1} 重抽次數過多，手牌歸零，判負！`, ts: Date.now() });
    return { state, mulliganState, gameOver: true };
  }

  // Draw 7 cards
  for (let i = 0; i < INITIAL_HAND_SIZE; i++) {
    if (player.zones[ZONE.DECK].length > 0) {
      const card = player.zones[ZONE.DECK].shift();
      card.faceDown = false;
      player.zones[ZONE.HAND].push(card);
    }
  }

  state.log.push({ turn: 0, player: playerNum, msg: `P${playerNum + 1} 第${mulliganState.count + 1}次抽牌（手牌上限 ${mulliganState.maxHand} 張）`, ts: Date.now() });
  return { state, mulliganState, gameOver: false };
}

/**
 * Return selected cards from hand to bottom of deck (for mulligan hand reduction).
 */
export function returnCardsFromHand(state, playerNum, indicesToReturn) {
  const player = state.players[playerNum];
  const sorted = [...indicesToReturn].sort((a, b) => b - a);
  for (const idx of sorted) {
    const card = player.zones[ZONE.HAND].splice(idx, 1)[0];
    if (card) player.zones[ZONE.DECK].push(card);
  }
  state.log.push({ turn: 0, player: playerNum, msg: `P${playerNum + 1} 放回 ${sorted.length} 張牌到牌組底部`, ts: Date.now() });
  return state;
}

/**
 * Place center member during setup and auto-place remaining Debut/Spot to backstage.
 * @param {Object} state
 * @param {number} playerNum
 * @param {number} handIndex - Index of chosen center member in hand
 * @returns {Object} state
 */
export function placeCenter(state, playerNum, handIndex) {
  const player = state.players[playerNum];
  const member = player.zones[ZONE.HAND].splice(handIndex, 1)[0];
  member.faceDown = false;
  player.zones[ZONE.CENTER] = member;

  // Auto-place remaining Debut/Spot to backstage
  for (let i = player.zones[ZONE.HAND].length - 1; i >= 0; i--) {
    const c = getCard(player.zones[ZONE.HAND][i].cardId);
    if (c && isMember(c.type) && (c.bloom === 'Debut' || c.bloom === 'Spot')) {
      const m = player.zones[ZONE.HAND].splice(i, 1)[0];
      m.faceDown = false;
      player.zones[ZONE.BACKSTAGE].push(m);
    }
  }

  state.log.push({ turn: 0, player: playerNum, msg: `P${playerNum + 1} 選擇 ${getCard(member.cardId)?.name} 為中心成員`, ts: Date.now() });
  return state;
}

/**
 * Finalize setup: randomly pick first player, set phase to RESET.
 */
export function finalizeSetup(state) {
  const fp = Math.random() < 0.5 ? 0 : 1;
  state.activePlayer = fp;
  state.firstPlayer = fp;
  state.phase = PHASE.RESET;
  state.log.push({ turn: 0, player: -1, msg: `P${fp + 1} 先攻！`, ts: Date.now() });
  return state;
}
