// hololive Card Game — WebSocket Server
// Server-authoritative: runs GameEngine, clients are views

import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';
import { loadCardsFromFile, getCard } from '../core/CardDatabase.js';
import { processAction } from '../core/GameEngine.js';
import { PHASE, ZONE, ACTION, INITIAL_HAND_SIZE, isMember } from '../core/constants.js';
import { resolveEffectChoice } from '../core/EffectResolver.js';
import { initGameState, drawInitialHand, handHasDebut, processMulligan, returnCardsFromHand, placeCenter, finalizeSetup } from '../core/SetupManager.js';

const PORT = parseInt(process.env.PORT || '3000');
const RECONNECT_TIMEOUT = 30000;
const HEARTBEAT_INTERVAL = 15000;
const ROOM_CLEANUP_INTERVAL = 60000;

// ── Room Management ──

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous I/O/0/1
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function createRoom(ws) {
  const code = generateRoomCode();
  const room = {
    code,
    players: [ws, null],
    phase: 'lobby',        // lobby → deck_select → mulligan → setup → playing → finished
    decks: [null, null],
    state: null,
    mulliganState: [
      { count: 0, maxHand: INITIAL_HAND_SIZE, done: false },
      { count: 0, maxHand: INITIAL_HAND_SIZE, done: false },
    ],
    setupDone: [false, false],
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  ws._roomCode = code;
  ws._playerIndex = 0;
  send(ws, { type: 'ROOM_CREATED', roomCode: code, playerIndex: 0 });
  console.log(`Room ${code} created`);
  return room;
}

function joinRoom(ws, code) {
  code = (code || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) return send(ws, { type: 'ERROR', message: `房間 ${code} 不存在` });
  if (room.players[1] && room.players[1].readyState === 1) {
    return send(ws, { type: 'ERROR', message: '房間已滿' });
  }

  // Reconnection check
  if (room.phase !== 'lobby' && room.disconnectedPlayer != null) {
    const p = room.disconnectedPlayer;
    room.players[p] = ws;
    ws._roomCode = code;
    ws._playerIndex = p;
    room.disconnectedPlayer = null;
    send(ws, { type: 'ROOM_JOINED', roomCode: code, playerIndex: p });
    send(room.players[1 - p], { type: 'OPPONENT_RECONNECTED' });
    // Resend current state
    if (room.state) {
      send(ws, { type: 'STATE_UPDATE', state: redactState(room.state, p) });
      // Re-send pending effect if targeting this player
      if (room.state.pendingEffect?.player === p) {
        send(ws, { type: 'EFFECT_PROMPT', prompt: room.state.pendingEffect });
      }
    }
    console.log(`Room ${code}: P${p} reconnected`);
    return;
  }

  room.players[1] = ws;
  ws._roomCode = code;
  ws._playerIndex = 1;
  room.phase = 'deck_select';

  send(ws, { type: 'ROOM_JOINED', roomCode: code, playerIndex: 1 });
  send(room.players[0], { type: 'OPPONENT_JOINED' });
  console.log(`Room ${code}: P1 joined, deck select phase`);
}

// ── Message Handlers ──

function handleMessage(ws, data) {
  let msg;
  try { msg = JSON.parse(data); } catch { return send(ws, { type: 'ERROR', message: 'Invalid JSON' }); }

  if (msg.type === 'JOIN_ROOM') {
    if (msg.roomCode) joinRoom(ws, msg.roomCode);
    else createRoom(ws);
    return;
  }

  if (msg.type === 'PING') return send(ws, { type: 'PONG' });

  const room = rooms.get(ws._roomCode);
  if (!room) return send(ws, { type: 'ERROR', message: '不在任何房間中' });

  const p = ws._playerIndex;

  switch (msg.type) {
    case 'SELECT_DECK': return handleDeckSelect(room, p, msg.deckConfig);
    case 'MULLIGAN_DECISION': return handleMulligan(room, p, msg);
    case 'SETUP_CENTER': return handleSetup(room, p, msg.handIndex);
    case 'GAME_ACTION': return handleGameAction(room, p, msg.action);
    case 'EFFECT_RESPONSE': return handleEffectResponse(room, p, msg.selection);
    default: return send(ws, { type: 'ERROR', message: `Unknown message type: ${msg.type}` });
  }
}

function handleDeckSelect(room, p, deckConfig) {
  if (room.phase !== 'deck_select') return send(room.players[p], { type: 'ERROR', message: '目前不在選牌組階段' });
  room.decks[p] = deckConfig;
  send(room.players[p], { type: 'DECK_CONFIRMED' });

  const opp = room.players[1 - p];
  if (opp) send(opp, { type: 'OPPONENT_DECK_READY' });

  // Both decks ready → initialize game
  if (room.decks[0] && room.decks[1]) {
    room.state = initGameState(room.decks[0], room.decks[1]);
    drawInitialHand(room.state, 0);
    drawInitialHand(room.state, 1);
    room.phase = 'mulligan';
    room.mulliganState = [
      { count: 0, maxHand: INITIAL_HAND_SIZE, done: false },
      { count: 0, maxHand: INITIAL_HAND_SIZE, done: false },
    ];
    // Send mulligan prompt to both players
    sendMulliganPrompt(room, 0);
    sendMulliganPrompt(room, 1);
    console.log(`Room ${room.code}: game initialized, mulligan phase`);
  }
}

function sendMulliganPrompt(room, p) {
  const hand = room.state.players[p].zones[ZONE.HAND];
  const ms = room.mulliganState[p];
  const hasDebut = handHasDebut(room.state, p);
  send(room.players[p], {
    type: 'MULLIGAN_PROMPT',
    hand: hand.map(c => ({ instanceId: c.instanceId, cardId: c.cardId })),
    mulliganCount: ms.count,
    maxHand: ms.maxHand,
    hasDebut,
  });
}

function handleMulligan(room, p, msg) {
  if (room.phase !== 'mulligan') return;
  if (room.mulliganState[p].done) return;

  if (msg.keep) {
    // Keep hand — check if need to return cards
    if (msg.returnIndices && msg.returnIndices.length > 0) {
      returnCardsFromHand(room.state, p, msg.returnIndices);
    }
    room.mulliganState[p].done = true;
    send(room.players[p], { type: 'MULLIGAN_DONE' });

    if (room.mulliganState[0].done && room.mulliganState[1].done) {
      // Both done → setup phase
      room.phase = 'setup';
      sendSetupPrompt(room, 0);
      sendSetupPrompt(room, 1);
      console.log(`Room ${room.code}: setup phase`);
    } else {
      send(room.players[p], { type: 'WAIT', message: '等待對手完成重抽...' });
    }
  } else {
    // Redraw
    const result = processMulligan(room.state, p, room.mulliganState[p]);
    if (result.gameOver) {
      room.phase = 'finished';
      broadcastState(room);
      return;
    }
    sendMulliganPrompt(room, p);
  }
}

function sendSetupPrompt(room, p) {
  const hand = room.state.players[p].zones[ZONE.HAND];
  const eligible = [];
  hand.forEach((c, i) => {
    const card = getCard(c.cardId);
    if (card && isMember(card.type) && (card.bloom === 'Debut' || card.bloom === 'Spot')) {
      eligible.push(i);
    }
  });
  send(room.players[p], {
    type: 'SETUP_PROMPT',
    hand: hand.map(c => ({ instanceId: c.instanceId, cardId: c.cardId })),
    eligibleIndices: eligible,
  });
}

function handleSetup(room, p, handIndex) {
  if (room.phase !== 'setup') return;
  if (room.setupDone[p]) return;

  placeCenter(room.state, p, handIndex);
  room.setupDone[p] = true;

  if (room.setupDone[0] && room.setupDone[1]) {
    finalizeSetup(room.state);
    room.phase = 'playing';
    broadcastState(room);
    console.log(`Room ${room.code}: game started, P${room.state.activePlayer + 1} first`);
  } else {
    send(room.players[p], { type: 'WAIT', message: '等待對手選擇中心成員...' });
  }
}

function handleGameAction(room, p, action) {
  if (room.phase !== 'playing') return send(room.players[p], { type: 'ERROR', message: '遊戲未開始' });

  // Turn enforcement: only active player can send most actions
  if (room.state.activePlayer !== p) {
    // Exception: LIFE_CHEER assignment goes to the player whose life was lost
    if (room.state.pendingEffect?.type === 'LIFE_CHEER' && room.state.pendingEffect.player === p) {
      // Allow cheer assign
    } else {
      return send(room.players[p], { type: 'ERROR', message: '不是你的回合' });
    }
  }

  // Block manual adjust in online mode
  if (action.type === ACTION.MANUAL_ADJUST) {
    return send(room.players[p], { type: 'ERROR', message: '線上模式不能使用手動調整' });
  }

  const result = processAction(room.state, action);
  if (result.error) {
    return send(room.players[p], { type: 'ERROR', message: result.error });
  }

  room.state = result.state;
  broadcastState(room);

  // Check pending effect routing
  if (room.state.pendingEffect) {
    routePendingEffect(room);
  }

  // Check game over
  if (room.state.phase === PHASE.GAME_OVER) {
    room.phase = 'finished';
  }
}

function handleEffectResponse(room, p, selection) {
  if (!room.state?.pendingEffect) return;

  // Only the targeted player can respond
  if (room.state.pendingEffect.player !== p) {
    return send(room.players[p], { type: 'ERROR', message: '不是你需要回應的效果' });
  }

  resolveEffectChoice(room.state, room.state.pendingEffect, selection);
  broadcastState(room);

  // Check for chained effects
  if (room.state.pendingEffect) {
    routePendingEffect(room);
  }
}

// ── State Broadcasting ──

function routePendingEffect(room) {
  const pending = room.state.pendingEffect;
  if (!pending) return;
  const targetP = pending.player;
  send(room.players[targetP], { type: 'EFFECT_PROMPT', prompt: pending });
  const otherP = 1 - targetP;
  if (room.players[otherP]) {
    send(room.players[otherP], { type: 'WAIT', message: '等待對手做出選擇...' });
  }
}

function broadcastState(room) {
  for (let p = 0; p < 2; p++) {
    if (room.players[p]) {
      send(room.players[p], { type: 'STATE_UPDATE', state: redactState(room.state, p) });
    }
  }
}

function redactState(state, forPlayer) {
  const clone = JSON.parse(JSON.stringify(state));
  const opp = 1 - forPlayer;

  // Redact opponent's hidden zones
  const oppPlayer = clone.players[opp];
  oppPlayer.zones.hand = oppPlayer.zones.hand.map(() => ({ hidden: true }));
  oppPlayer.zones.deck = oppPlayer.zones.deck.map(() => ({ hidden: true }));
  oppPlayer.zones.cheerDeck = oppPlayer.zones.cheerDeck.map(() => ({ hidden: true }));
  oppPlayer.zones.holoPower = oppPlayer.zones.holoPower.map(() => ({ hidden: true }));
  oppPlayer.zones.life = oppPlayer.zones.life.map(() => ({ hidden: true }));

  // Redact own hidden zones (you shouldn't see your deck order either)
  const myPlayer = clone.players[forPlayer];
  myPlayer.zones.deck = myPlayer.zones.deck.map(() => ({ hidden: true }));
  myPlayer.zones.life = myPlayer.zones.life.map(() => ({ hidden: true }));
  myPlayer.zones.holoPower = myPlayer.zones.holoPower.map(() => ({ hidden: true }));

  // Remove pendingEffect card data if it targets the other player
  if (clone.pendingEffect && clone.pendingEffect.player !== forPlayer) {
    clone.pendingEffect = { ...clone.pendingEffect, cards: undefined, message: '等待對手選擇...' };
  }

  return clone;
}

// ── Disconnection Handling ──

function handleDisconnect(ws) {
  const code = ws._roomCode;
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;

  const p = ws._playerIndex;
  console.log(`Room ${code}: P${p} disconnected`);

  if (room.phase === 'lobby' || room.phase === 'finished') {
    // Clean up immediately
    rooms.delete(code);
    return;
  }

  // Mark disconnected, give reconnect window
  room.disconnectedPlayer = p;
  room.disconnectedAt = Date.now();

  const opp = room.players[1 - p];
  if (opp && opp.readyState === 1) {
    send(opp, { type: 'OPPONENT_DISCONNECTED' });
  }

  // Auto-forfeit after timeout
  setTimeout(() => {
    if (room.disconnectedPlayer === p) {
      room.state && (room.state.winner = 1 - p);
      room.state && (room.state.phase = PHASE.GAME_OVER);
      room.phase = 'finished';
      if (opp && opp.readyState === 1) {
        send(opp, { type: 'STATE_UPDATE', state: redactState(room.state, 1 - p) });
      }
      rooms.delete(code);
      console.log(`Room ${code}: P${p} forfeit (disconnect timeout)`);
    }
  }, RECONNECT_TIMEOUT);
}

// ── Utilities ──

function send(ws, data) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

// ── Server Startup ──

async function main() {
  // Load card database. Use fileURLToPath so paths with spaces (e.g. packaged ".app"
  // bundles with "Fan-made" in the name) decode correctly — pathname would keep %20.
  const cardsPath = fileURLToPath(new URL('../../data/cards.json', import.meta.url));
  await loadCardsFromFile(cardsPath);
  console.log('Card database loaded');

  const wss = new WebSocketServer({ port: PORT });

  wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', (data) => handleMessage(ws, data.toString()));
    ws.on('close', () => handleDisconnect(ws));
    ws.on('error', (err) => console.error('WS error:', err.message));

    // Heartbeat
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  });

  // Heartbeat check
  setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);

  // Room cleanup
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (room.phase === 'lobby' && now - room.createdAt > 5 * 60 * 1000) {
        rooms.delete(code);
        console.log(`Room ${code}: cleaned up (idle lobby)`);
      }
    }
  }, ROOM_CLEANUP_INTERVAL);

  console.log(`hololive Card Game server running on ws://localhost:${PORT}`);
}

main().catch(err => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
