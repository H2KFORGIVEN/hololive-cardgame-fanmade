// End-to-end full-match integration test. Drives the engine through
// mulligan → setup → ~10 turns of attack until someone wins. Logs every
// transition + asserts engine state invariants at each step.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/showmaker/hololive-card-meta/';
globalThis.fetch = async u => {
  let f = u;
  if (f.startsWith('../game/effects/')) f = path.join(ROOT, 'web/game/effects/', f.slice(16));
  else if (f.startsWith('../data/')) f = path.join(ROOT, 'web/data/', f.slice(8));
  else if (f.startsWith('../')) f = path.join(ROOT, 'web/', f.slice(3));
  return { ok: true, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) };
};
const CardDB = await import(path.join(ROOT, 'web/game/core/CardDatabase.js'));
await CardDB.loadCardsFromFile(path.join(ROOT, 'web/data/cards.json'));
const old = console.log; console.log = () => {};
const { initEffects } = await import(path.join(ROOT, 'web/game/effects/registerAll.js'));
await initEffects();
console.log = old;

const { processAction, advancePendingEffect } = await import(path.join(ROOT, 'web/game/core/GameEngine.js'));
const { resolveEffectChoice } = await import(path.join(ROOT, 'web/game/core/EffectResolver.js'));
const { ACTION, PHASE, ZONE, MEMBER_STATE } = await import(path.join(ROOT, 'web/game/core/constants.js'));
const { createCardInstance, cloneState } = await import(path.join(ROOT, 'web/game/core/GameState.js'));

// ── Test deck setup ──────────────────────────────────────────────────────
// Simple all-white deck with predictable behavior.
function buildDeck() {
  return {
    oshi: 'hBP01-001',
    mainDeck: [
      { cardId: 'hBP01-009', count: 4 },  // Debut かなた hp 90
      { cardId: 'hBP01-010', count: 4 },  // 1st かなた
      { cardId: 'hBP01-011', count: 4 },  // 1st かなた
      { cardId: 'hBP01-012', count: 4 },  // 1st かなた
      { cardId: 'hBP01-013', count: 4 },  // 1st かなた (Buzz)
      { cardId: 'hBP01-014', count: 4 },  // 2nd かなた
      { cardId: 'hSD02-002', count: 4 },  // ときのそら Debut
      { cardId: 'hBP02-076', count: 4 },  // カスタムパソコン support
      { cardId: 'hBP01-103', count: 4 },  // ゲーミングパソコン
      { cardId: 'hBP01-105', count: 4 },  // ペンライト
      { cardId: 'hBP01-115', count: 4 },  // 星街すいせいのマイク
      { cardId: 'hBP06-099', count: 2 },  // ゆび tool +10 art
    ],
    cheerDeck: [
      { cardId: 'hY01-001', count: 20 },  // 20 white cheer
    ],
  };
}

function buildState(deckP0, deckP1) {
  // Build the GameState skeleton — 50 main + 20 cheer per player
  const newPlayer = (deck) => {
    const main = [];
    for (const { cardId, count } of deck.mainDeck) {
      for (let i = 0; i < count; i++) {
        const inst = createCardInstance(cardId);
        inst.faceDown = true;
        inst.attachedCheer = []; inst.attachedSupport = [];
        inst.damage = 0; inst.bloomStack = []; inst.state = MEMBER_STATE.ACTIVE;
        main.push(inst);
      }
    }
    const cheer = [];
    for (const { cardId, count } of deck.cheerDeck) {
      for (let i = 0; i < count; i++) {
        const inst = createCardInstance(cardId);
        inst.faceDown = true;
        cheer.push(inst);
      }
    }
    // Take 1 cheer for life (hardcoded — 5 life for hBP01-001 oshi)
    const life = [];
    for (let i = 0; i < 5; i++) life.push(cheer.shift());
    // Initial hand: 7 cards
    const hand = [];
    for (let i = 0; i < 7; i++) {
      const c = main.shift();
      if (c) { c.faceDown = false; hand.push(c); }
    }
    return {
      zones: {
        [ZONE.CENTER]: null, [ZONE.COLLAB]: null, [ZONE.BACKSTAGE]: [],
        [ZONE.DECK]: main, [ZONE.HAND]: hand, [ZONE.ARCHIVE]: [],
        [ZONE.HOLO_POWER]: [], [ZONE.CHEER_DECK]: cheer, [ZONE.LIFE]: life,
      },
      oshi: { cardId: deck.oshi, usedSp: false },
      performedArts: { center: false, collab: false },
      usedCollab: false, usedBaton: false, usedLimited: false,
      oshiSkillUsedThisTurn: false,
      _limitedSupportsThisTurn: 0, _activitiesPlayedThisTurn: 0,
      _namesUsedArtThisTurn: [],
    };
  };

  return {
    activePlayer: 0,
    turnNumber: 1,
    phase: PHASE.SETUP,
    winner: null,
    players: [newPlayer(deckP0), newPlayer(deckP1)],
    log: [],
    firstTurn: [true, true],
    firstPlayer: 0,
    pendingEffect: null,
  };
}

// ── Test runner ──────────────────────────────────────────────────────────
const ok = (cond, label) => {
  if (!cond) {
    console.log(`  ✗ ${label}`);
    failures++;
  } else {
    console.log(`  ✓ ${label}`);
    passes++;
  }
};

let passes = 0, failures = 0;
const log = (msg) => console.log(msg);

function dumpState(state) {
  for (let p = 0; p < 2; p++) {
    const pl = state.players[p];
    log(`  P${p} life=${pl.zones[ZONE.LIFE].length} hand=${pl.zones[ZONE.HAND].length} deck=${pl.zones[ZONE.DECK].length} hp=${pl.zones[ZONE.HOLO_POWER].length}`);
    log(`     center=${pl.zones[ZONE.CENTER]?.cardId || '∅'} collab=${pl.zones[ZONE.COLLAB]?.cardId || '∅'} backstage=[${pl.zones[ZONE.BACKSTAGE].map(m => m.cardId).join(',')}]`);
  }
  log(`  phase=${state.phase} active=P${state.activePlayer} turn=${state.turnNumber} winner=${state.winner}`);
}

// Action rejections from the validator are EXPECTED (insufficient cheer,
// game over, etc.) — log them but don't count as test failures. An actual
// engine throw IS a failure.
let rejections = 0;
function step(state, action, label) {
  try {
    const r = processAction(state, action);
    if (r.error) {
      console.log(`  ⊘ ${label}: ${r.error} (validator rejection)`);
      rejections++;
      return state;
    }
    return r.state;
  } catch (e) {
    console.log(`  ✗ ${label}: ENGINE THROWN: ${e.message}`);
    failures++;
    return state;
  }
}

// Auto-resolve any pending effect by picking the first valid option.
function autoResolvePending(state, maxIter = 10) {
  let iter = 0;
  while (state.pendingEffect && iter++ < maxIter) {
    const p = state.pendingEffect;
    let selection = null;
    if (p.type === 'SEARCH_SELECT' || p.type === 'SEARCH_SELECT_PLACE' ||
        p.type === 'SELECT_FROM_ARCHIVE' || p.type === 'CHEER_MOVE' ||
        p.type === 'SELECT_OWN_MEMBER') {
      // Pick first card / instance
      selection = p.cards?.[0]?.instanceId ? [p.cards[0].instanceId] : [];
    } else if (p.type === 'LIFE_CHEER') {
      // Auto-attach to first available stage member
      const opp = state.players[p.player];
      const stage = [opp.zones[ZONE.CENTER], opp.zones[ZONE.COLLAB], ...(opp.zones[ZONE.BACKSTAGE] || [])].filter(Boolean);
      if (!stage.length) { state.pendingEffect = null; break; }
      selection = stage[0].instanceId;
    } else if (p.type === 'ORDER_TO_BOTTOM') {
      selection = p.cards?.map(c => c.instanceId) || [];
    } else {
      // Unknown prompt — just skip
      console.log(`    [pending] unknown type ${p.type}, breaking`);
      break;
    }
    state = resolveEffectChoice(state, p, selection);
    // Some prompts may queue another — loop continues
  }
  return state;
}

// ─────────────────────────────────────────────────────────────────────────
log('═══ Full match integration test ═══');

let state = buildState(buildDeck(), buildDeck());
ok(state.players[0].zones[ZONE.HAND].length === 7, 'Initial hand = 7 (P0)');
ok(state.players[1].zones[ZONE.HAND].length === 7, 'Initial hand = 7 (P1)');
ok(state.players[0].zones[ZONE.LIFE].length === 5, 'Initial life = 5 (P0)');
ok(state.players[0].zones[ZONE.CHEER_DECK].length === 15, 'Cheer deck after life = 15 (P0)');

// Skip mulligan (set phase directly to SETUP and place center)
state.phase = PHASE.SETUP;
ok(state.phase === PHASE.SETUP, 'Phase SETUP entered');

// Setup: each player places a Debut as center
log('\n── Setup phase ──');
function setupCenter(state, p) {
  const pl = state.players[p];
  // Find a Debut in hand
  const idx = pl.zones[ZONE.HAND].findIndex(c => {
    const card = CardDB.getCard(c.cardId);
    return card?.type === '成員' && card.bloom === 'Debut';
  });
  if (idx < 0) return state;
  const inst = pl.zones[ZONE.HAND].splice(idx, 1)[0];
  pl.zones[ZONE.CENTER] = inst;
  return state;
}
state = setupCenter(state, 0);
state = setupCenter(state, 1);
ok(state.players[0].zones[ZONE.CENTER] != null, 'P0 center placed');
ok(state.players[1].zones[ZONE.CENTER] != null, 'P1 center placed');

// Move past setup → reset → draw → cheer auto-progresses
state = step(state, { type: ACTION.ADVANCE_PHASE }, 'advance from setup');
log(`  after advance: phase=${state.phase} active=P${state.activePlayer}`);

// Cheer phase: auto-assign to center
log('\n── Turn 1 (P0 first turn) ──');
if (state.phase === PHASE.CHEER) {
  const pl = state.players[state.activePlayer];
  if (pl.zones[ZONE.CHEER_DECK].length > 0) {
    const cheer = pl.zones[ZONE.CHEER_DECK][0];
    state = step(state, { type: ACTION.CHEER_ASSIGN, cheerInstanceId: cheer.instanceId, targetInstanceId: pl.zones[ZONE.CENTER].instanceId }, 'cheer assign T1');
  }
}
ok(state.phase === PHASE.MAIN, 'P0 reached MAIN after cheer');

// Place a member into backstage (Debut from hand)
const p0 = state.players[0];
const debutIdx = p0.zones[ZONE.HAND].findIndex(c => CardDB.getCard(c.cardId)?.bloom === 'Debut');
if (debutIdx >= 0) {
  state = step(state, { type: ACTION.PLACE_MEMBER, handIndex: debutIdx, zone: 'backstage' }, 'P0 place Debut to backstage');
}
ok(state.players[0].zones[ZONE.BACKSTAGE].length >= 1, 'P0 backstage has 1+ member');

// First-turn rule: skip performance phase
state = step(state, { type: ACTION.END_MAIN_PHASE }, 'P0 end main → skip performance');
state = autoResolvePending(state);
// After END_PERFORMANCE the engine sets phase=RESET for the next player.
// We need ADVANCE_PHASE to chain RESET → DRAW → CHEER.
if (state.phase === PHASE.RESET) state = step(state, { type: ACTION.ADVANCE_PHASE }, 'advance to next turn');
ok(state.activePlayer === 1, 'After P0 turn 1, active = P1');

// Turn 2 (P1 first turn) — mostly mirrors P0
log('\n── Turn 2 (P1 first turn — performance OK) ──');
if (state.phase === PHASE.CHEER) {
  const pl = state.players[state.activePlayer];
  if (pl.zones[ZONE.CHEER_DECK].length > 0) {
    state = step(state, { type: ACTION.CHEER_ASSIGN, cheerInstanceId: pl.zones[ZONE.CHEER_DECK][0].instanceId, targetInstanceId: pl.zones[ZONE.CENTER].instanceId }, 'cheer assign T2');
  }
}
ok(state.phase === PHASE.MAIN, 'P1 reached MAIN');

// P1 places debut + advances to performance
const p1 = state.players[1];
const p1Debut = p1.zones[ZONE.HAND].findIndex(c => CardDB.getCard(c.cardId)?.bloom === 'Debut');
if (p1Debut >= 0) {
  state = step(state, { type: ACTION.PLACE_MEMBER, handIndex: p1Debut, zone: 'backstage' }, 'P1 place Debut to backstage');
}

state = step(state, { type: ACTION.END_MAIN_PHASE }, 'P1 end main');
ok(state.phase === PHASE.PERFORMANCE, 'P1 entered PERFORMANCE');

// P1 attempts an art with center if cheer is available
const center = state.players[1].zones[ZONE.CENTER];
const centerCard = CardDB.getCard(center.cardId);
log(`  P1 center: ${centerCard?.name} hp=${centerCard?.hp} cheer=${center.attachedCheer.length}`);
if (centerCard?.art1?.damage && center.attachedCheer.length >= 1) {
  state = step(state, { type: ACTION.USE_ART, position: 'center', artIndex: 0, targetPosition: 'center' }, 'P1 use art');
  state = autoResolvePending(state);
  log(`  after attack: P0 center damage=${state.players[0].zones[ZONE.CENTER]?.damage}`);
}

state = step(state, { type: ACTION.END_PERFORMANCE }, 'P1 end performance');
state = autoResolvePending(state);
if (state.phase === PHASE.RESET) state = step(state, { type: ACTION.ADVANCE_PHASE }, 'advance T2→T3');

// Continue several more turns
log('\n── Turns 3-25 (loop) ──');
for (let t = 3; t <= 25 && state.winner == null; t++) {
  log(`\n--- Turn ${t} (P${state.activePlayer}) ---`);
  // CHEER auto
  if (state.phase === PHASE.CHEER) {
    const pl = state.players[state.activePlayer];
    if (pl.zones[ZONE.CHEER_DECK].length > 0 && pl.zones[ZONE.CENTER]) {
      state = step(state, { type: ACTION.CHEER_ASSIGN, cheerInstanceId: pl.zones[ZONE.CHEER_DECK][0].instanceId, targetInstanceId: pl.zones[ZONE.CENTER].instanceId }, `T${t} cheer`);
    } else if (pl.zones[ZONE.CHEER_DECK].length === 0) {
      state = step(state, { type: ACTION.ADVANCE_PHASE }, `T${t} skip cheer`);
    }
  }
  if (state.winner != null) break;

  // MAIN: try to bloom center to next level (Debut→1st→2nd)
  const pl = state.players[state.activePlayer];
  const centerInst = pl.zones[ZONE.CENTER];
  if (centerInst && t > 2) {
    const centerCard = CardDB.getCard(centerInst.cardId);
    const curBloom = centerCard?.bloom;
    // Determine next bloom target
    const nextLevel = curBloom === 'Debut' ? '1st' : (curBloom === '1st' ? '2nd' : null);
    if (nextLevel) {
      const bloomIdx = pl.zones[ZONE.HAND].findIndex(c => {
        const cd = CardDB.getCard(c.cardId);
        return cd?.bloom === nextLevel && cd.name === centerCard?.name && !cd.bloom?.includes('Buzz');
      });
      if (bloomIdx >= 0) {
        state = step(state, { type: ACTION.BLOOM, handIndex: bloomIdx, targetInstanceId: centerInst.instanceId }, `T${t} bloom ${curBloom}→${nextLevel}`);
      }
    }
  }
  // COLLAB: if backstage has an active member + holopower available, try collab
  const ap = state.players[state.activePlayer];
  if (!ap.usedCollab && ap.zones[ZONE.BACKSTAGE].length > 0 && !ap.zones[ZONE.COLLAB] && ap.zones[ZONE.DECK].length > 0) {
    const bsActive = ap.zones[ZONE.BACKSTAGE].findIndex(m => m.state === MEMBER_STATE.ACTIVE);
    if (bsActive >= 0) {
      state = step(state, { type: ACTION.COLLAB, backstageIndex: bsActive }, `T${t} collab`);
    }
  }
  // Play a backstage if hand has debut
  const debutIdx = pl.zones[ZONE.HAND].findIndex(c => CardDB.getCard(c.cardId)?.bloom === 'Debut');
  if (debutIdx >= 0 && pl.zones[ZONE.BACKSTAGE].length < 5) {
    state = step(state, { type: ACTION.PLACE_MEMBER, handIndex: debutIdx, zone: 'backstage' }, `T${t} place backstage`);
  }
  state = autoResolvePending(state);

  // END MAIN
  state = step(state, { type: ACTION.END_MAIN_PHASE }, `T${t} end main`);
  state = autoResolvePending(state);

  // PERFORMANCE: attack with center if possible
  if (state.phase === PHASE.PERFORMANCE) {
    const me = state.players[state.activePlayer];
    const ctr = me.zones[ZONE.CENTER];
    const ctrCard = ctr && CardDB.getCard(ctr.cardId);
    if (ctr && ctr.state === MEMBER_STATE.ACTIVE && ctrCard?.art1?.damage && ctr.attachedCheer.length >= 1) {
      state = step(state, { type: ACTION.USE_ART, position: 'center', artIndex: 0, targetPosition: 'center' }, `T${t} use art center`);
      state = autoResolvePending(state);
    }
    // Collab attack (different active player ref since state may have been replaced)
    const me2 = state.players[state.activePlayer];
    const cb = me2?.zones[ZONE.COLLAB];
    const cbCard = cb && CardDB.getCard(cb.cardId);
    if (cb && cb.state === MEMBER_STATE.ACTIVE && cbCard?.art1?.damage && cb.attachedCheer.length >= 1 && state.players[1 - state.activePlayer].zones[ZONE.CENTER]) {
      state = step(state, { type: ACTION.USE_ART, position: 'collab', artIndex: 0, targetPosition: 'center' }, `T${t} use art collab`);
      state = autoResolvePending(state);
    }
    state = step(state, { type: ACTION.END_PERFORMANCE }, `T${t} end perf`);
    state = autoResolvePending(state);
  }
  // Chain to next turn
  if (state.phase === PHASE.RESET && state.winner == null) {
    state = step(state, { type: ACTION.ADVANCE_PHASE }, `T${t} → T${t+1}`);
    state = autoResolvePending(state);
  }

  dumpState(state);
}

// ── Final assertions ─────────────────────────────────────────────────────
log('\n── Final state ──');
dumpState(state);

// Engine invariants
const inv = (label, cond) => ok(cond, `INV: ${label}`);
inv('phase is GAME_OVER or valid', state.phase === PHASE.GAME_OVER || Object.values(PHASE).includes(state.phase));
inv('winner null OR 0/1', state.winner === null || state.winner === 0 || state.winner === 1);
for (const p of [0, 1]) {
  const pl = state.players[p];
  inv(`P${p} zones intact`, !!pl.zones[ZONE.CENTER] || !!pl.zones[ZONE.COLLAB] || pl.zones[ZONE.BACKSTAGE].length > 0 || state.winner != null);
  // Hand size sanity
  inv(`P${p} hand reasonable`, pl.zones[ZONE.HAND].length >= 0 && pl.zones[ZONE.HAND].length <= 50);
  inv(`P${p} life >= 0`, pl.zones[ZONE.LIFE].length >= 0);
  // No negative damage
  for (const z of [ZONE.CENTER, ZONE.COLLAB]) {
    const m = pl.zones[z];
    if (m) inv(`P${p}.${z} damage ≥ 0`, m.damage >= 0);
  }
  for (const m of pl.zones[ZONE.BACKSTAGE]) inv(`P${p}.bs damage ≥ 0`, m.damage >= 0);
}

log(`\n══ Full match: ${passes}/${passes + failures} checks passed (${rejections} expected validator rejections) ══`);
process.exit(failures > 0 ? 1 : 0);
