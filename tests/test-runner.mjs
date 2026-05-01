// Comprehensive test runner for the hololive card game engine.
// Polyfills fetch so the browser effect system loads, then runs scripted battles
// and reports any discrepancies between card text and actual engine behavior.
//
// Run: node tests/test-runner.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;

// ─── Polyfill fetch (effects loader uses fetch to read effect_analysis.json) ──
globalThis.fetch = async (url) => {
  // Map browser-relative URLs to local paths
  let file = url;
  if (file.startsWith('../game/effects/'))     file = path.join(ROOT, 'web/game/effects/', file.slice('../game/effects/'.length));
  else if (file.startsWith('../data/'))        file = path.join(ROOT, 'web/data/', file.slice('../data/'.length));
  else if (file.startsWith('../'))             file = path.join(ROOT, 'web/', file.slice(3));
  else if (file.startsWith('/'))               file = path.join(ROOT, 'web', file);
  else                                         file = path.join(ROOT, 'web', file);
  const data = fs.readFileSync(file, 'utf8');
  return {
    ok: true,
    json: async () => JSON.parse(data),
    text: async () => data,
  };
};

// ─── Load modules ──
const CardDB = await import(new URL('../web/game/core/CardDatabase.js', import.meta.url));
await CardDB.loadCardsFromFile(path.join(ROOT, 'web/data/cards.json'));

const { PHASE, ZONE, ACTION, MEMBER_STATE, INITIAL_HAND_SIZE, parseCost, isMember } = await import(new URL('../web/game/core/constants.js', import.meta.url));
const { processAction }      = await import(new URL('../web/game/core/GameEngine.js', import.meta.url));
const { canPayArtCost, validateAction } = await import(new URL('../web/game/core/ActionValidator.js', import.meta.url));
const { initGameState, drawInitialHand, placeCenter, finalizeSetup, processMulligan, handHasDebut } =
  await import(new URL('../web/game/core/SetupManager.js', import.meta.url));
const { resolveEffectChoice } = await import(new URL('../web/game/core/EffectResolver.js', import.meta.url));
const { initEffects }         = await import(new URL('../web/game/effects/registerAll.js', import.meta.url));
const { getHandler, hasHandler, HOOK } = await import(new URL('../web/game/effects/EffectRegistry.js', import.meta.url));

// Silence the effects registration log a bit
const origLog = console.log;
console.log = (...args) => { if (typeof args[0] === 'string' && args[0].startsWith('Effects registered:')) return; origLog(...args); };
await initEffects();
console.log = origLog;

// ─── Build test decks from official_decks.json ──
const officialDecks = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/official_decks.json'), 'utf8'));
function makeDeckConfig(deckData) {
  return {
    oshi: deckData.oshi_card_id,
    mainDeck: deckData.main_deck.map(c => ({ cardId: c.card_id, count: c.count })),
    cheerDeck: deckData.cheer_deck.map(c => ({ cardId: c.card_id, count: c.count })),
  };
}

// ─── Test framework ──
let PASS = 0, FAIL = 0, WARN = 0;
const failures = [];
const warnings = [];

function pass(name) { PASS++; process.stdout.write(`  ✓ ${name}\n`); }
function fail(name, reason) {
  FAIL++;
  failures.push({ name, reason });
  process.stdout.write(`  ✗ ${name}\n    ${reason}\n`);
}
function warn(name, reason) {
  WARN++;
  warnings.push({ name, reason });
  process.stdout.write(`  ⚠ ${name}\n    ${reason}\n`);
}
function section(title) { process.stdout.write(`\n━━━ ${title} ━━━\n`); }

// ─── Helpers ──
function buildGame(deck0Key = '0', deck1Key = '1') {
  // Retry up to 20 times to get an initial hand with Debut for both players
  for (let attempt = 0; attempt < 20; attempt++) {
    const deck0 = makeDeckConfig(officialDecks[deck0Key]);
    const deck1 = makeDeckConfig(officialDecks[deck1Key]);
    let state = initGameState(deck0, deck1);
    state = drawInitialHand(state, 0);
    state = drawInitialHand(state, 1);
    if (handHasDebut(state, 0) && handHasDebut(state, 1)) return state;
  }
  // Fallback if we can't draw a Debut (unlikely)
  const deck0 = makeDeckConfig(officialDecks[deck0Key]);
  const deck1 = makeDeckConfig(officialDecks[deck1Key]);
  let state = initGameState(deck0, deck1);
  state = drawInitialHand(state, 0);
  state = drawInitialHand(state, 1);
  return state;
}

function setupToMain(state) {
  // Find a Debut/Spot member in hand for each player, place center
  for (let p = 0; p < 2; p++) {
    const hand = state.players[p].zones[ZONE.HAND];
    const idx = hand.findIndex(c => {
      const d = CardDB.getCard(c.cardId);
      return d && isMember(d.type) && (d.bloom === 'Debut' || d.bloom === 'Spot');
    });
    if (idx < 0) return null;
    state = placeCenter(state, p, idx);
  }
  state = finalizeSetup(state);
  return state;
}

function runToCheerPhase(state) {
  // Reset → Draw → Cheer (waits)
  for (let i = 0; i < 5 && state.phase !== PHASE.CHEER && state.phase !== PHASE.MAIN; i++) {
    const r = processAction(state, { type: ACTION.ADVANCE_PHASE });
    if (r.error) return { state, error: r.error };
    state = r.state;
  }
  return { state };
}

function runToMainPhase(state) {
  if (!state) return { state: null, error: 'null state' };
  // If in cheer phase, try to assign to center; else advance
  let guard = 0;
  while (state.phase !== PHASE.MAIN && state.phase !== PHASE.GAME_OVER && guard++ < 10) {
    if (state.phase === PHASE.CHEER) {
      const center = state.players[state.activePlayer].zones[ZONE.CENTER];
      if (!center) break;
      const r = processAction(state, { type: ACTION.CHEER_ASSIGN, targetInstanceId: center.instanceId });
      if (r.error) return { state, error: `CHEER_ASSIGN: ${r.error}` };
      state = r.state;
    } else {
      const r = processAction(state, { type: ACTION.ADVANCE_PHASE });
      if (r.error) return { state, error: `ADVANCE: ${r.error}` };
      state = r.state;
    }
  }
  return { state };
}

// ══════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════
section('Setup / Mulligan');

{
  // Test 1: Game state has correct structure
  const state = buildGame();
  if (state.phase === PHASE.SETUP && state.players.length === 2 && state.players[0].zones[ZONE.HAND].length === INITIAL_HAND_SIZE)
    pass('Initial game state has 2 players and 7-card hands');
  else
    fail('Initial game state', `phase=${state.phase}, hands=${state.players.map(p => p.zones[ZONE.HAND].length)}`);
}

{
  // Test 2: Life cards drawn from cheer deck based on oshi.life
  const state = buildGame();
  const lifeCount0 = state.players[0].zones[ZONE.LIFE].length;
  const oshiCard = CardDB.getCard(state.players[0].oshi.cardId);
  const expected = oshiCard?.life || 5;
  if (lifeCount0 === expected) pass(`Life count matches oshi.life (${expected})`);
  else fail('Life count', `expected ${expected}, got ${lifeCount0}`);
}

{
  // Test 3: handHasDebut detection
  const state = buildGame();
  if (typeof handHasDebut(state, 0) === 'boolean') pass('handHasDebut returns boolean');
  else fail('handHasDebut', 'does not return boolean');
}

{
  // Test 4: Mulligan reshuffles & draws 7
  let state = buildGame();
  const ms = { count: 0, maxHand: INITIAL_HAND_SIZE };
  const r = processMulligan(state, 0, ms);
  if (r.state.players[0].zones[ZONE.HAND].length === INITIAL_HAND_SIZE && ms.count === 1)
    pass('Mulligan redraw keeps 7 cards, count incremented');
  else
    fail('Mulligan redraw', `hand=${r.state.players[0].zones[ZONE.HAND].length} count=${ms.count}`);
}

{
  // Test 5: Mulligan maxHand reduction from 2nd redraw
  let state = buildGame();
  const ms = { count: 1, maxHand: 7 };
  processMulligan(state, 0, ms);
  if (ms.count === 2 && ms.maxHand === 6) pass('2nd mulligan reduces maxHand to 6');
  else fail('Mulligan hand reduction', `count=${ms.count} maxHand=${ms.maxHand}`);
}

section('Phase Progression');

{
  // Test 6: Setup → Main phase progression
  const state0 = buildGame();
  const setup = setupToMain(state0);
  if (!setup) { fail('Setup to main', 'no debut in hand'); }
  else {
    const { state, error } = runToMainPhase(setup);
    if (error) fail('Setup to main', error);
    else if (state.phase === PHASE.MAIN) pass(`Reached main phase (active=P${state.activePlayer+1}, firstPlayer=P${state.firstPlayer+1})`);
    else fail('Setup to main', `stuck at phase ${state.phase}`);
  }
}

{
  // Test 7: First player's first turn skips performance (implicit — rule says first player can't art turn 1)
  const state0 = buildGame();
  const setup = setupToMain(state0);
  if (setup) {
    const p = setup.activePlayer;
    if (setup.firstTurn[p] && p === setup.firstPlayer) pass(`First turn firstPlayer flag set for P${p+1}`);
    else fail('First turn flag', `activePlayer=${p} firstPlayer=${setup.firstPlayer}`);
  }
}

section('Main Phase Actions');

{
  // Test 8: PLACE_MEMBER adds debut/spot to backstage (retry for hand with Debut)
  let placed = false;
  for (let attempt = 0; attempt < 5 && !placed; attempt++) {
    let state = buildGame();
    state = setupToMain(state);
    ({ state } = runToMainPhase(state));
    if (state && state.phase === PHASE.MAIN) {
      const p = state.activePlayer;
      const hand = state.players[p].zones[ZONE.HAND];
      const idx = hand.findIndex(c => {
        const d = CardDB.getCard(c.cardId);
        return d && isMember(d.type) && (d.bloom === 'Debut' || d.bloom === 'Spot');
      });
      if (idx >= 0) {
        const beforeCount = state.players[p].zones[ZONE.BACKSTAGE].length;
        const r = processAction(state, { type: ACTION.PLACE_MEMBER, handIndex: idx });
        if (r.error) fail('PLACE_MEMBER', r.error);
        else if (r.state.players[p].zones[ZONE.BACKSTAGE].length === beforeCount + 1) {
          pass('PLACE_MEMBER adds to backstage');
          placed = true;
        } else fail('PLACE_MEMBER', `backstage count did not increase`);
        break;
      }
    }
  }
  if (!placed && PASS === 0 /* unreachable check to avoid false warning */) {}
}

{
  // Test 9: BLOOM is rejected on first turn (for both players per rules)
  let state = buildGame();
  state = setupToMain(state);
  ({ state } = runToMainPhase(state));
  if (state && state.phase === PHASE.MAIN) {
    const p = state.activePlayer;
    const hand = state.players[p].zones[ZONE.HAND];
    // Find any non-Debut member in hand
    const bloomIdx = hand.findIndex(c => {
      const d = CardDB.getCard(c.cardId);
      return d && isMember(d.type) && d.bloom !== 'Debut' && d.bloom !== 'Spot';
    });
    // And a center to target
    const center = state.players[p].zones[ZONE.CENTER];
    if (bloomIdx >= 0 && center) {
      const r = processAction(state, { type: ACTION.BLOOM, handIndex: bloomIdx, targetInstanceId: center.instanceId });
      if (r.error && r.error.includes('第一回合')) pass('BLOOM rejected on first turn');
      else if (r.error) warn('First turn BLOOM', `rejected but reason: "${r.error}"`);
      else fail('First turn BLOOM', 'allowed bloom on first turn — rule violation');
    } else {
      warn('First turn BLOOM', 'no bloomable card or no center to test');
    }
  }
}

{
  // Test 10: BATON_PASS requires active center and enough cheer
  let state = buildGame();
  state = setupToMain(state);
  if (!state) { warn('BATON_PASS setup', 'no debut in hand'); }
  else {
    ({ state } = runToMainPhase(state));
    if (state && state.phase === PHASE.MAIN) {
      const p = state.activePlayer;
      const backstage = state.players[p].zones[ZONE.BACKSTAGE];
      const center = state.players[p].zones[ZONE.CENTER];
      if (center && backstage.length > 0) {
        const centerCard = CardDB.getCard(center.cardId);
        const batonCost = parseCost(centerCard?.batonImage);
        const hasEnough = canPayArtCost(center, batonCost);
        const r = processAction(state, { type: ACTION.BATON_PASS, backstageIndex: 0 });
        if (hasEnough) {
          if (!r.error) pass('BATON_PASS succeeds when cheer sufficient');
          else fail('BATON_PASS', `rejected with sufficient cheer: ${r.error}`);
        } else {
          if (r.error && r.error.includes('吶喊卡不足')) pass('BATON_PASS rejected when insufficient cheer (color-aware)');
          else if (r.error) warn('BATON_PASS', `rejected with unexpected reason: "${r.error}"`);
          else fail('BATON_PASS', 'allowed without sufficient cheer');
        }
      }
    }
  }
}

section('Performance Phase');

{
  // Test 11: First player cannot use art on first turn — since engine auto-skips performance,
  // call USE_ART directly from main phase and expect rejection with first-turn reason
  let state = buildGame();
  state = setupToMain(state);
  ({ state } = runToMainPhase(state));
  if (state && state.phase === PHASE.MAIN) {
    const p = state.activePlayer;
    if (state.firstTurn[p] && p === state.firstPlayer) {
      // Try to bypass by calling USE_ART directly
      const r = processAction(state, { type: ACTION.USE_ART, position: 'center', artIndex: 0, targetPosition: 'center' });
      if (r.error && (r.error.includes('先攻玩家第一回合') || r.error.includes('不在表演階段'))) {
        pass(`First player turn 1 art blocked ("${r.error}")`);
      } else if (r.error) warn('First-turn art', `rejected with: "${r.error}"`);
      else fail('First-turn art', 'allowed art on first turn by first player');
    } else warn('First-turn art', 'not first player or not first turn');
  }
}

{
  // Test 12: canPayArtCost correctly handles color matching
  // Construct a fake member with 2 white cheer and an art needing 2 white
  const fakeMember = {
    attachedCheer: [
      { cardId: 'hY01-001' },  // white
      { cardId: 'hY01-001' },  // white
    ],
  };
  const cost2White = { total: 2, white: 2 };
  if (canPayArtCost(fakeMember, cost2White)) pass('canPayArtCost: 2 white cheer satisfies 2 white cost');
  else fail('canPayArtCost', '2 white cheer should satisfy 2 white cost');

  const cost3White = { total: 3, white: 3 };
  if (!canPayArtCost(fakeMember, cost3White)) pass('canPayArtCost: 2 white cheer rejects 3 white cost');
  else fail('canPayArtCost', '2 white cheer should NOT satisfy 3 white cost');

  const fakeMember2 = {
    attachedCheer: [
      { cardId: 'hY01-001' },  // white
      { cardId: 'hY02-001' },  // green
    ],
  };
  const cost1WhiteAnyColor = { total: 2, white: 1, colorless: 1 };
  if (canPayArtCost(fakeMember2, cost1WhiteAnyColor)) pass('canPayArtCost: 1 white + 1 green satisfies 1 white + 1 colorless');
  else fail('canPayArtCost', '1 white + 1 green should satisfy 1 white + 1 colorless');

  const cost2WhiteStrict = { total: 2, white: 2 };
  if (!canPayArtCost(fakeMember2, cost2WhiteStrict)) pass('canPayArtCost: 1 white + 1 green rejects 2 white');
  else fail('canPayArtCost', '1 white + 1 green should NOT satisfy 2 white (green cannot substitute)');
}

section('Card text vs handler audit');

{
  // Test 13: hBP01-009's art1 is center-only (rule text)
  const c = CardDB.getCard('hBP01-009');
  const effText = typeof c.art1.effect === 'object' ? c.art1.effect['zh-TW'] : c.art1.effect;
  if (effText && effText.includes('只能') && effText.includes('中心成員'))
    pass('hBP01-009 art1 text says center-only (GameController auto-targets center)');
  else warn('hBP01-009', 'effect text format differs from expected');
}

{
  // Test 14: LIMITED support cards marked correctly
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/cards.json'), 'utf8'));
  const seen = new Set();
  let limited = 0;
  d.forEach(card => {
    if (seen.has(card.id)) return; seen.add(card.id);
    const se = typeof card.supportEffect === 'object' ? (card.supportEffect['zh-TW'] || '') : (card.supportEffect || '');
    if (se.includes('LIMITED')) limited++;
  });
  if (limited > 30) pass(`${limited} LIMITED support cards exist (expected many)`);
  else fail('LIMITED audit', `only ${limited} LIMITED cards found`);

  // Sample: does GameEngine check player.usedLimited? grep the engine
  const engineSrc = fs.readFileSync(path.join(ROOT, 'web/game/core/GameEngine.js'), 'utf8');
  if (engineSrc.includes('usedLimited')) pass('GameEngine tracks usedLimited flag');
  else fail('LIMITED enforcement', 'GameEngine does not mention usedLimited');

  // Check ActionValidator rejects 2nd LIMITED use
  const validatorSrc = fs.readFileSync(path.join(ROOT, 'web/game/core/ActionValidator.js'), 'utf8');
  if (validatorSrc.includes('usedLimited')) pass('ActionValidator checks usedLimited flag');
  else fail('LIMITED enforcement', 'ActionValidator does not check usedLimited — two LIMITED cards per turn would be allowed!');
}

{
  // Test 15: Bloom rules — need same name, cannot bloom placed-this-turn
  const validatorSrc = fs.readFileSync(path.join(ROOT, 'web/game/core/ActionValidator.js'), 'utf8');
  if (validatorSrc.includes('placedThisTurn') && validatorSrc.includes('canBloomThisTurn'))
    pass('ActionValidator respects placedThisTurn + canBloomThisTurn bypass');
  else fail('Bloom placement rule', 'ActionValidator missing placedThisTurn check');

  if (validatorSrc.includes('bloomedThisTurn'))
    pass('ActionValidator prevents double-bloom same turn');
  else fail('Double bloom', 'ActionValidator does not check bloomedThisTurn');
}

{
  // Test 16: Collab rules — active-only, collab zone must be empty
  const validatorSrc = fs.readFileSync(path.join(ROOT, 'web/game/core/ActionValidator.js'), 'utf8');
  if (validatorSrc.includes('usedCollab')) pass('ActionValidator checks usedCollab (once per turn)');
  else fail('Collab per-turn', 'ActionValidator does not check usedCollab');

  if (validatorSrc.includes('休息狀態的成員不能聯動')) pass('Collab requires active member');
  else fail('Collab active check', 'missing active-state requirement in ActionValidator');
}

{
  // Test 17: Knockdown / Life / Buzz -2
  const engineSrc = fs.readFileSync(path.join(ROOT, 'web/game/core/GameEngine.js'), 'utf8');
  if (engineSrc.includes('1st Buzz') && engineSrc.includes('lifeCost')) pass('GameEngine differentiates Buzz knockdown (2 life)');
  else fail('Buzz -2 life', 'GameEngine missing Buzz life cost differentiation');

  if (engineSrc.includes('LIFE_CHEER') && engineSrc.includes('pendingEffect'))
    pass('Life cheer assigned via pendingEffect (opponent chooses target)');
  else fail('Life cheer assignment', 'LIFE_CHEER pendingEffect missing');
}

{
  // Test 18: Deck out → lose
  const engineSrc = fs.readFileSync(path.join(ROOT, 'web/game/core/GameEngine.js'), 'utf8');
  if (engineSrc.includes('無法抽牌') && engineSrc.includes('GAME_OVER')) pass('Deck out triggers game over');
  else fail('Deck out', 'missing deck-out loss condition');
}

section('Effect system');

{
  // Test 19: Effect handlers registered for top cards
  const samples = ['hBP01-104', 'hBP02-084', 'hBP05-080', 'hSD01-018', 'hBP01-065'];
  let registered = 0;
  for (const id of samples) {
    if (hasHandler(id, HOOK.ON_PLAY) || hasHandler(id, HOOK.ON_BLOOM) || hasHandler(id, HOOK.ON_COLLAB)) {
      registered++;
    }
  }
  if (registered === samples.length) pass(`${samples.length}/${samples.length} sample cards have effect handlers`);
  else fail('Effect registration', `only ${registered}/${samples.length} have handlers: ${samples.join(', ')}`);
}

{
  // Test 20: EffectResolver handles all expected actions
  const resolverSrc = fs.readFileSync(path.join(ROOT, 'web/game/core/EffectResolver.js'), 'utf8');
  const expectedActions = ['PLACE_AND_SHUFFLE', 'ATTACH_SUPPORT', 'SEND_TO_ARCHIVE', 'SEARCH_SELECT', 'ADD_TO_HAND', 'ORDER_TO_BOTTOM', 'CHEER_MOVE', 'SUPPORT_MOVE', 'REVERT_TO_DEBUT', 'SELECT_FROM_ARCHIVE', 'BLOOM_FROM_ARCHIVE'];
  let missing = [];
  for (const a of expectedActions) if (!resolverSrc.includes(`'${a}'`)) missing.push(a);
  if (missing.length === 0) pass(`EffectResolver handles all ${expectedActions.length} action types`);
  else fail('EffectResolver coverage', `missing: ${missing.join(', ')}`);
}

{
  // Test 21: "Look top X, put rest at bottom" cards chain to ORDER_TO_BOTTOM
  const handlerSrc = fs.readFileSync(path.join(ROOT, 'web/game/effects/handlers/phaseB-cards.js'), 'utf8');
  const topBotSrc = fs.readFileSync(path.join(ROOT, 'web/game/effects/handlers/look-top-bottom.js'), 'utf8');
  const combined = handlerSrc + '\n' + topBotSrc;
  const hbp0285Block = combined.match(/hBP02-085[\s\S]{0,1000}/);
  if (hbp0285Block && (hbp0285Block[0].includes('remainingCards') || hbp0285Block[0].includes('ORDER_TO_BOTTOM')))
    pass('hBP02-085 chains to ORDER_TO_BOTTOM for remaining cards');
  else fail('hBP02-085', 'no remainingCards/ORDER_TO_BOTTOM chain found');
}

{
  // Test 22: Cards with "展示" effects have search select prompts, not auto-pick
  // hBP01-104 is the canonical example
  const handlerSrc = fs.readFileSync(path.join(ROOT, 'web/game/effects/handlers/top50-cards.js'), 'utf8');
  const match = handlerSrc.match(/'hBP01-104'[\s\S]{0,2000}?(SEARCH_SELECT|ADD_TO_HAND|auto)/);
  if (match && match[0].includes('SEARCH_SELECT')) pass('hBP01-104 uses SEARCH_SELECT prompt (no auto-pick)');
  else fail('hBP01-104', 'auto-picks instead of prompting player');
}

section('Full game playthrough smoke test');

{
  // Test 23: Full game from setup through several turns with no errors
  // NOTE: first player's first turn auto-skips performance phase,
  // so END_PERFORMANCE will fail for that turn — we must only call END_PERFORMANCE when in PERFORMANCE.
  let state = buildGame('0', '1');
  state = setupToMain(state);
  if (!state) { fail('Setup', 'no debut in hand'); }
  else {
    let turnCount = 0;
    let totalActions = 0;
    const MAX_TURNS = 8;
    try {
      while (state.phase !== PHASE.GAME_OVER && turnCount < MAX_TURNS) {
        ({ state } = runToMainPhase(state));
        if (state.phase !== PHASE.MAIN) break;

        const r1 = processAction(state, { type: ACTION.END_MAIN_PHASE });
        if (r1.error) { fail(`Turn ${turnCount} END_MAIN`, r1.error); break; }
        state = r1.state;
        totalActions++;

        // Only END_PERFORMANCE if we actually entered performance phase
        if (state.phase === PHASE.PERFORMANCE) {
          const r2 = processAction(state, { type: ACTION.END_PERFORMANCE });
          if (r2.error) { fail(`Turn ${turnCount} END_PERF`, r2.error); break; }
          state = r2.state;
          totalActions++;
        }
        turnCount++;
      }
      if (turnCount >= 4) pass(`Played ${turnCount} turns without error (${totalActions} actions)`);
      else fail('Playthrough', `only reached turn ${turnCount}, state.phase=${state.phase}`);
    } catch (e) {
      fail('Playthrough crashed', e.message + '\n' + e.stack?.split('\n').slice(0, 3).join('\n'));
    }
  }
}

{
  // Test 24: First player turn 1 auto-skips performance
  let state = buildGame('0', '1');
  state = setupToMain(state);
  if (state && state.phase) {
    ({ state } = runToMainPhase(state));
    const firstPlayer = state.activePlayer;
    const wasFirstTurn = state.firstTurn[firstPlayer];
    const r = processAction(state, { type: ACTION.END_MAIN_PHASE });
    if (r.error) { fail('Auto-skip perf', r.error); }
    else if (r.state.phase === PHASE.RESET || r.state.activePlayer !== firstPlayer) {
      if (wasFirstTurn) pass('First player turn 1 auto-skips performance (advances to next turn)');
      else warn('Auto-skip perf', 'unexpected behavior for non-first-turn');
    } else if (r.state.phase === PHASE.PERFORMANCE) {
      if (!wasFirstTurn) pass('Non-first-turn advances to performance');
      else fail('First-turn perf skip', 'first player turn 1 entered performance (rule violation)');
    }
  }
}

section('Runtime restriction enforcement');

// Helper to play past first-player turn 1 so P2 can use arts
function advanceToSecondPlayerTurn1(state) {
  // First player: end main (auto-skips to next turn)
  ({ state } = runToMainPhase(state));
  if (state.phase !== PHASE.MAIN) return { state, error: 'not in main' };
  const r = processAction(state, { type: ACTION.END_MAIN_PHASE });
  if (r.error) return { state, error: r.error };
  state = r.state;
  // Now should be P2's turn
  ({ state } = runToMainPhase(state));
  return { state };
}

{
  // Test 25: Double collab in one turn is rejected
  let state = buildGame();
  state = setupToMain(state);
  ({ state } = runToMainPhase(state));
  if (state.phase === PHASE.MAIN && state.players[state.activePlayer].zones[ZONE.BACKSTAGE].length > 0) {
    const r1 = processAction(state, { type: ACTION.COLLAB, backstageIndex: 0 });
    if (!r1.error) {
      state = r1.state;
      if (state.players[state.activePlayer].zones[ZONE.BACKSTAGE].length > 0) {
        const r2 = processAction(state, { type: ACTION.COLLAB, backstageIndex: 0 });
        if (r2.error && (r2.error.includes('進行過聯動') || r2.error.includes('已聯動') || r2.error.includes('已用') || r2.error.includes('聯動位置已'))) pass('Double collab rejected');
        else if (r2.error) warn('Double collab', `rejected with: "${r2.error}"`);
        else fail('Double collab', 'two collabs in one turn allowed');
      }
    }
  }
}

{
  // Test 26: Double baton in one turn is rejected
  let state = buildGame();
  state = setupToMain(state);
  ({ state } = runToMainPhase(state));
  if (state.phase === PHASE.MAIN) {
    const p = state.activePlayer;
    const center = state.players[p].zones[ZONE.CENTER];
    // Make center have lots of cheer so baton can succeed
    if (center) {
      // Attach 4 cheer cards for testing
      const cheerDeck = state.players[p].zones[ZONE.CHEER_DECK];
      for (let i = 0; i < 4 && cheerDeck.length > 0; i++) {
        center.attachedCheer.push(cheerDeck.shift());
      }
      if (state.players[p].zones[ZONE.BACKSTAGE].length > 0) {
        const r1 = processAction(state, { type: ACTION.BATON_PASS, backstageIndex: 0 });
        if (!r1.error) {
          state = r1.state;
          // Try baton pass again
          const r2 = processAction(state, { type: ACTION.BATON_PASS, backstageIndex: 0 });
          if (r2.error && r2.error.includes('已交棒')) pass('Double baton rejected');
          else if (r2.error) warn('Double baton', `rejected with: "${r2.error}"`);
          else fail('Double baton', 'two batons in one turn allowed');
        } else warn('Double baton first', `first baton failed: ${r1.error}`);
      }
    }
  }
}

{
  // Test 27: Art on rested member is rejected
  let state = buildGame();
  state = setupToMain(state);
  ({ state } = advanceToSecondPlayerTurn1(state));
  if (state.phase === PHASE.MAIN) {
    const p = state.activePlayer;
    const center = state.players[p].zones[ZONE.CENTER];
    if (center) {
      // Manually rest the center
      center.state = MEMBER_STATE.REST;
      // Advance to performance
      const r1 = processAction(state, { type: ACTION.END_MAIN_PHASE });
      if (!r1.error) {
        state = r1.state;
        const opp = state.players[1 - p].zones[ZONE.CENTER];
        if (state.phase === PHASE.PERFORMANCE && opp) {
          const r2 = processAction(state, { type: ACTION.USE_ART, position: 'center', artIndex: 0, targetPosition: 'center' });
          if (r2.error && r2.error.includes('休息')) pass('Rested member cannot use art');
          else if (r2.error) warn('Rested art', `rejected: "${r2.error}"`);
          else fail('Rested art', 'rested member used art — rule violation');
        }
      }
    }
  }
}

{
  // Test 28: Art target must be opponent center or collab
  let state = buildGame();
  state = setupToMain(state);
  ({ state } = advanceToSecondPlayerTurn1(state));
  if (state.phase === PHASE.MAIN) {
    const p = state.activePlayer;
    const r = processAction(state, { type: ACTION.END_MAIN_PHASE });
    if (!r.error && r.state.phase === PHASE.PERFORMANCE) {
      state = r.state;
      const r2 = processAction(state, { type: ACTION.USE_ART, position: 'center', artIndex: 0, targetPosition: 'center' });
      // Should either succeed or fail with a cost/target reason
      if (r2.error && (r2.error.includes('吶喊') || r2.error.includes('成員') || r2.error.includes('目標'))) {
        pass(`USE_ART cost/target validation works (got: "${r2.error}")`);
      } else if (!r2.error) {
        pass('USE_ART succeeded with valid target');
      } else {
        warn('USE_ART', `unexpected error: "${r2.error}"`);
      }
    }
  }
}

{
  // Test 29: Cannot use same art twice in one performance phase
  let state = buildGame();
  state = setupToMain(state);
  ({ state } = advanceToSecondPlayerTurn1(state));
  if (state.phase === PHASE.MAIN) {
    const p = state.activePlayer;
    const center = state.players[p].zones[ZONE.CENTER];
    // Stack cheer to enable any art
    if (center) {
      for (let i = 0; i < 5 && state.players[p].zones[ZONE.CHEER_DECK].length; i++) {
        center.attachedCheer.push(state.players[p].zones[ZONE.CHEER_DECK].shift());
      }
    }
    const r = processAction(state, { type: ACTION.END_MAIN_PHASE });
    if (!r.error && r.state.phase === PHASE.PERFORMANCE) {
      state = r.state;
      const r1 = processAction(state, { type: ACTION.USE_ART, position: 'center', artIndex: 0, targetPosition: 'center' });
      if (!r1.error) {
        state = r1.state;
        const r2 = processAction(state, { type: ACTION.USE_ART, position: 'center', artIndex: 0, targetPosition: 'center' });
        if (r2.error && (r2.error.includes('已使用過') || r2.error.includes('已用'))) pass('Cannot reuse art at same position');
        else if (r2.error) warn('Art reuse', `rejected: "${r2.error}"`);
        else fail('Art reuse', 'same art used twice');
      } else {
        warn('Art reuse', `first art failed: ${r1.error}`);
      }
    }
  }
}

{
  // Test 30: PLACE_MEMBER rejected when hand card is not Debut/Spot
  let state = buildGame();
  state = setupToMain(state);
  ({ state } = runToMainPhase(state));
  if (state.phase === PHASE.MAIN) {
    const p = state.activePlayer;
    const hand = state.players[p].zones[ZONE.HAND];
    const badIdx = hand.findIndex(c => {
      const d = CardDB.getCard(c.cardId);
      return d && isMember(d.type) && d.bloom !== 'Debut' && d.bloom !== 'Spot';
    });
    if (badIdx >= 0) {
      const r = processAction(state, { type: ACTION.PLACE_MEMBER, handIndex: badIdx });
      if (r.error) pass('Non-Debut member cannot be placed');
      else fail('PLACE_MEMBER', 'allowed placing non-Debut member');
    } else warn('PLACE_MEMBER non-Debut', 'no non-Debut member in hand to test');
  }
}

{
  // Test 31: Cheer assign on wrong phase is rejected
  let state = buildGame();
  state = setupToMain(state);
  ({ state } = runToMainPhase(state));
  if (state.phase === PHASE.MAIN) {
    const center = state.players[state.activePlayer].zones[ZONE.CENTER];
    if (center) {
      const r = processAction(state, { type: ACTION.CHEER_ASSIGN, targetInstanceId: center.instanceId });
      if (r.error) pass('CHEER_ASSIGN rejected in main phase (not cheer phase)');
      else fail('CHEER_ASSIGN phase', 'allowed cheer assign in main phase');
    }
  }
}

{
  // Test 32: Bloom order — cannot bloom 2nd from Debut directly (must go through 1st unless card has no 1st)
  // This is a rule nuance — check the validator
  const validatorSrc = fs.readFileSync(path.join(ROOT, 'web/game/core/ActionValidator.js'), 'utf8');
  // Look for BLOOM_ORDER usage
  if (validatorSrc.includes('BLOOM_ORDER') || validatorSrc.includes('bloom') && validatorSrc.includes('同名'))
    pass('Bloom validator references bloom order / name matching');
  else warn('Bloom order', 'validator may not enforce bloom level progression');
}

section('Bug hunt');

{
  // Test 24: Placed-this-turn can still collab? (User asked for this to work)
  const validatorSrc = fs.readFileSync(path.join(ROOT, 'web/game/core/ActionValidator.js'), 'utf8');
  // Look for the collab validator and see if placedThisTurn blocks it
  const collabBlock = validatorSrc.match(/validateCollab[\s\S]*?(?=function |$)/);
  if (collabBlock) {
    const body = collabBlock[0];
    if (body.includes('placedThisTurn')) fail('Collab placedThisTurn', 'ActionValidator still blocks collab for placed-this-turn (user wants this allowed)');
    else pass('Collab allows placed-this-turn members');
  }
}

{
  // Test 25: Art cost consumed vs retained? (Rule: cheer NOT consumed by arts)
  // Check that processUseArt does not remove cheer from the attacker
  const engineSrc = fs.readFileSync(path.join(ROOT, 'web/game/core/GameEngine.js'), 'utf8');
  const artBlock = engineSrc.match(/function processUseArt[\s\S]{0,2000}?(?=function |$)/);
  if (artBlock) {
    const body = artBlock[0];
    const removesCheer = body.match(/attacker\.attachedCheer.*(?:shift|pop|splice)/);
    if (!removesCheer) pass('USE_ART does NOT consume attacker cheer (correct per rules)');
    else fail('Art cheer consumption', 'USE_ART appears to consume cheer — rules say it should not');
  }
}

{
  // Test 26: BATON_PASS does consume cheer
  // Regex was previously capped at 2500 chars — too short for the current
  // function (~7000 chars). Bumped to 10000 to cover the full body.
  const engineSrc = fs.readFileSync(path.join(ROOT, 'web/game/core/GameEngine.js'), 'utf8');
  const batonBlock = engineSrc.match(/function processBatonPass[\s\S]{0,10000}?(?=\nfunction |$)/);
  if (batonBlock && batonBlock[0].includes('ARCHIVE') && batonBlock[0].includes('attachedCheer'))
    pass('BATON_PASS consumes cheer to archive (correct)');
  else fail('Baton cheer consumption', 'BATON_PASS does not archive cheer');
}

{
  // Test 27: Cheer assign in cheer phase sends from cheerDeck to member
  const engineSrc = fs.readFileSync(path.join(ROOT, 'web/game/core/GameEngine.js'), 'utf8');
  const cheerBlock = engineSrc.match(/case ACTION\.CHEER_ASSIGN[\s\S]{0,200}/);
  if (cheerBlock) pass('CHEER_ASSIGN action is handled');
  else fail('CHEER_ASSIGN', 'not handled in GameEngine');
}

{
  // Test 28: Deck size enforced at 50 main + 20 cheer
  const builderSrc = fs.readFileSync(path.join(ROOT, 'web/game/core/DeckBuilder.js'), 'utf8');
  if (builderSrc.includes('MAIN_DECK_SIZE') || builderSrc.includes('50')) pass('Deck size constants enforced');
  else warn('Deck size', 'constant reference not found');
}

{
  // Test 29: Validate restricted cards list
  const builderSrc = fs.readFileSync(path.join(ROOT, 'web/game/core/DeckBuilder.js'), 'utf8');
  const restrictedMatch = builderSrc.match(/RESTRICTED_CARDS\s*=\s*new Set\(\[([^\]]*)\]/);
  if (restrictedMatch) {
    const cards = restrictedMatch[1].match(/'([^']+)'/g)?.map(s => s.slice(1, -1)) || [];
    pass(`Restricted cards list: ${cards.join(', ')}`);
  } else warn('Restricted cards', 'RESTRICTED_CARDS set not found');
}

{
  // Test 30: MANUAL_EFFECT auto-dismiss no longer shows popup (user request)
  // Look for the actual code that clears pendingEffect when type is MANUAL_EFFECT,
  // not a specific comment phrase that may have evolved.
  const ctrlSrc = fs.readFileSync(path.join(ROOT, 'web/game/GameController.js'), 'utf8');
  const manualBlock = ctrlSrc.match(/state\.pendingEffect\.type === 'MANUAL_EFFECT'[\s\S]{0,800}?s\.pendingEffect = null/);
  if (manualBlock) pass('MANUAL_EFFECT popup auto-dismissed (clears pendingEffect after toast)');
  else fail('MANUAL_EFFECT autoclear', 'popup may still appear');
}

section('Effect handler execution tests');

{
  // Test 33: hBP01-104 (ふつうのパソコン) handler returns SEARCH_SELECT_PLACE prompt
  // Setup a fake state with some Debut members in deck
  let state = buildGame();
  state = setupToMain(state);
  ({ state } = runToMainPhase(state));
  if (state && state.phase === PHASE.MAIN) {
    const p = state.activePlayer;
    const handler = getHandler('hBP01-104', HOOK.ON_PLAY);
    if (handler) {
      const r = handler(state, { cardId: 'hBP01-104', player: p });
      if (r.resolved === false && r.prompt && r.prompt.type === 'SEARCH_SELECT_PLACE') {
        pass(`hBP01-104 returns SEARCH_SELECT_PLACE with ${r.prompt.cards?.length || 0} choices`);
      } else if (r.resolved === true && r.log?.includes('無')) {
        pass('hBP01-104 handles empty deck case');
      } else fail('hBP01-104 execution', `unexpected result: resolved=${r.resolved} type=${r.prompt?.type}`);
    } else fail('hBP01-104 execution', 'no handler registered');
  }
}

{
  // Test 34: hBP02-084 みっころね24 — draws 2, then dice branch
  let state = buildGame();
  state = setupToMain(state);
  ({ state } = runToMainPhase(state));
  if (state && state.phase === PHASE.MAIN) {
    const p = state.activePlayer;
    const handBefore = state.players[p].zones[ZONE.HAND].length;
    const handler = getHandler('hBP02-084', HOOK.ON_PLAY);
    if (handler) {
      const r = handler(state, { cardId: 'hBP02-084', player: p });
      const handAfter = r.state.players[p].zones[ZONE.HAND].length;
      // Should have drawn 2 (may then show a prompt for search based on dice)
      if (handAfter >= handBefore + 2) pass(`hBP02-084 drew 2 cards (${handBefore} → ${handAfter})`);
      else fail('hBP02-084', `expected +2 hand, got ${handBefore} → ${handAfter}`);
    } else warn('hBP02-084', 'no handler registered');
  }
}

{
  // Test 35: EffectResolver — RETURN_FROM_ARCHIVE moves from archive to hand
  let state = buildGame();
  state = setupToMain(state);
  ({ state } = runToMainPhase(state));
  if (state && state.phase === PHASE.MAIN) {
    const p = state.activePlayer;
    // Put a card into archive
    const player = state.players[p];
    const fakeCardId = player.zones[ZONE.DECK][0]?.cardId || 'hY01-001';
    const fakeInstance = { instanceId: 99999, cardId: fakeCardId, faceDown: false, attachedCheer: [], attachedSupport: [] };
    player.zones[ZONE.ARCHIVE].push(fakeInstance);
    const handBefore = player.zones[ZONE.HAND].length;
    const archiveBefore = player.zones[ZONE.ARCHIVE].length;

    resolveEffectChoice(state, {
      type: 'SELECT_FROM_ARCHIVE',
      player: p,
      afterAction: 'RETURN_FROM_ARCHIVE',
    }, { instanceId: 99999, name: 'test' });

    if (player.zones[ZONE.HAND].length === handBefore + 1 && player.zones[ZONE.ARCHIVE].length === archiveBefore - 1)
      pass('RETURN_FROM_ARCHIVE moves instance archive → hand');
    else fail('RETURN_FROM_ARCHIVE', `hand ${handBefore}→${player.zones[ZONE.HAND].length}, archive ${archiveBefore}→${player.zones[ZONE.ARCHIVE].length}`);
  }
}

{
  // Test 36: EffectResolver — ORDER_TO_BOTTOM moves cards to deck bottom in order
  let state = buildGame();
  state = setupToMain(state);
  ({ state } = runToMainPhase(state));
  if (state && state.phase === PHASE.MAIN) {
    const p = state.activePlayer;
    const player = state.players[p];
    // Capture top 3 ids
    const topIds = player.zones[ZONE.DECK].slice(0, 3).map(c => c.instanceId);
    const deckSize = player.zones[ZONE.DECK].length;

    resolveEffectChoice(state, {
      type: 'ORDER_TO_BOTTOM',
      player: p,
    }, { orderedIds: topIds });

    // After ORDER_TO_BOTTOM, the cards should be at the bottom in the order they were listed
    const bottomIds = player.zones[ZONE.DECK].slice(-3).map(c => c.instanceId);
    if (player.zones[ZONE.DECK].length === deckSize && JSON.stringify(bottomIds) === JSON.stringify(topIds))
      pass('ORDER_TO_BOTTOM places selected cards at deck bottom in order');
    else fail('ORDER_TO_BOTTOM', `expected ${topIds.join(',')} at bottom, got ${bottomIds.join(',')}`);
  }
}

{
  // Test 37: hBP01-012 / hBP01-013 art cost validation — actually check specific cards
  const c13 = CardDB.getCard('hBP01-013');
  const c14 = CardDB.getCard('hBP01-014');
  if (c13 && c14) {
    const cost13Baton = parseCost(c13.batonImage);
    const cost13Art = parseCost(c13.art1.image);
    const cost14Baton = parseCost(c14.batonImage);
    const cost14Art = parseCost(c14.art1.image);

    let okCount = 0;
    if (cost13Baton.total === 1 && cost13Baton.colorless === 1) { pass('hBP01-013 baton = 1 colorless'); okCount++; }
    else fail('hBP01-013 baton', `expected {total:1,colorless:1}, got ${JSON.stringify(cost13Baton)}`);

    if (cost13Art.total === 2 && cost13Art.white === 1 && cost13Art.colorless === 1) { pass('hBP01-013 art = 1 white + 1 colorless'); okCount++; }
    else fail('hBP01-013 art', `expected {total:2,white:1,colorless:1}, got ${JSON.stringify(cost13Art)}`);

    if (cost14Baton.total === 2 && cost14Baton.colorless === 2) { pass('hBP01-014 baton = 2 colorless'); okCount++; }
    else fail('hBP01-014 baton', `expected {total:2,colorless:2}, got ${JSON.stringify(cost14Baton)}`);

    if (cost14Art.total === 3 && cost14Art.white === 3) { pass('hBP01-014 art = 3 white'); okCount++; }
    else fail('hBP01-014 art', `expected {total:3,white:3}, got ${JSON.stringify(cost14Art)}`);
  }
}

{
  // Test 38: Cheer card colors vs icon colors alignment
  const whiteCheer = CardDB.getCard('hY01-001');
  const greenCheer = CardDB.getCard('hY02-001');
  const redCheer = CardDB.getCard('hY03-001');
  const blueCheer = CardDB.getCard('hY04-001');
  const purpleCheer = CardDB.getCard('hY05-001');
  const yellowCheer = CardDB.getCard('hY06-001');

  const expected = { 'hY01-001': '白', 'hY02-001': '綠', 'hY03-001': '紅', 'hY04-001': '藍', 'hY05-001': '紫', 'hY06-001': '黃' };
  const checks = [whiteCheer, greenCheer, redCheer, blueCheer, purpleCheer, yellowCheer];
  let colorOk = 0;
  for (const c of checks) {
    if (c && expected[c.id] === c.color) colorOk++;
  }
  if (colorOk === 6) pass('All 6 cheer colors correctly defined in card data');
  else fail('Cheer colors', `only ${colorOk}/6 match expected colors`);
}

{
  // Test 39: Audit — members with art icons should have parseable cost, no NaN
  const cards = CardDB.getAllCards();
  let badCosts = 0;
  const samples = [];
  for (const c of cards) {
    if (!c.art1?.image) continue;
    const cost = parseCost(c.art1.image);
    if (isNaN(cost.total) || cost.total < 0 || cost.total > 10) {
      badCosts++;
      if (samples.length < 3) samples.push(`${c.id}:${JSON.stringify(cost)}`);
    }
  }
  if (badCosts === 0) pass('All card art costs parse to valid numbers');
  else fail('Art cost parsing', `${badCosts} bad costs, samples: ${samples.join(', ')}`);
}

{
  // Test 40: Audit — summary of "展示" card handler coverage
  const cards = CardDB.getAllCards();
  const handlerFiles = ['top50-cards.js', 'phaseB-cards.js', 'phaseC1-cards.js', 'phaseC2-cards.js', 'phaseC-final.js', 'look-top-bottom.js', 'cleanup.js', 'passthrough.js'];
  const handlerSrc = handlerFiles.map(f => {
    try { return fs.readFileSync(path.join(ROOT, 'web/game/effects/handlers', f), 'utf8'); }
    catch { return ''; }
  }).join('\n');

  const seen = new Set();
  let withExhibit = 0;
  let hasHandlerCount = 0;
  for (const c of cards) {
    if (seen.has(c.id)) continue; seen.add(c.id);
    if (!JSON.stringify(c).includes('展示')) continue;
    withExhibit++;
    if (handlerSrc.includes(`'${c.id}'`)) hasHandlerCount++;
  }
  pass(`"展示" cards with handlers: ${hasHandlerCount}/${withExhibit}`);
}

{
  // Test 41: Cards with '可以' (optional effect) — sampling check
  const optional = ['hBP01-012', 'hBP01-063', 'hBP01-071'];  // cards known to have "可以"
  let hasHandlers = 0;
  for (const id of optional) {
    if (hasHandler(id, HOOK.ON_BLOOM) || hasHandler(id, HOOK.ON_PLAY) || hasHandler(id, HOOK.ON_COLLAB)) hasHandlers++;
  }
  if (hasHandlers === optional.length) pass(`${hasHandlers}/${optional.length} optional-effect cards have handlers`);
  else fail('Optional effects', `only ${hasHandlers}/${optional.length} have handlers`);
}

{
  // Test 42: DamageCalculator — base damage extraction
  const c = CardDB.getCard('hBP01-009');
  // Direct damage calc requires an attacker instance — just verify parser parses numeric correctly
  const d = parseInt(c.art1.damage);
  if (d === 40) pass('hBP01-009 art1 damage parses as 40');
  else fail('Damage parse', `expected 40, got ${d}`);

  // hBP01-014 should be 100
  const c14 = CardDB.getCard('hBP01-014');
  const d14 = parseInt(c14.art1.damage);
  if (d14 === 100) pass('hBP01-014 art1 damage parses as 100');
  else fail('Damage parse 014', `expected 100, got ${d14}`);
}

// ══════════════════════════════════════════════════════════════════
// Effect-system boundary tests — stress the new hooks + edge cases
// ══════════════════════════════════════════════════════════════════
section('Effect system boundaries');

// Helpers for boundary tests
function freshGame() {
  let state = buildGame();
  state = setupToMain(state);
  return runToMainPhase(state).state;
}

function makeInstance(cardId, overrides = {}) {
  return {
    instanceId: Math.floor(Math.random() * 1e9),
    cardId,
    state: MEMBER_STATE.ACTIVE,
    damage: 0,
    attachedCheer: [],
    attachedSupport: [],
    bloomedThisTurn: false,
    placedThisTurn: false,
    bloomStack: [],
    faceDown: false,
    ...overrides,
  };
}

{
  // New hooks fire without throwing
  const state = freshGame();
  if (!state || state.phase !== PHASE.MAIN) {
    fail('Boundary setup', 'could not reach MAIN phase');
  } else {
    pass('Fresh game reaches MAIN phase after new hooks wired');
  }
}

{
  // ON_PLACE fires on place_member
  const state = freshGame();
  if (!state) { fail('ON_PLACE test', 'no state'); }
  else {
    const hand = state.players[state.activePlayer].zones[ZONE.HAND];
    const debutIdx = hand.findIndex(c => {
      const d = CardDB.getCard(c.cardId);
      return d && isMember(d.type) && d.bloom === 'Debut';
    });
    if (debutIdx < 0) {
      warn('ON_PLACE test', 'no debut in hand after setup (rare)');
    } else {
      const r = processAction(state, { type: ACTION.PLACE_MEMBER, handIndex: debutIdx });
      if (r.error) fail('ON_PLACE fires without error', r.error);
      else if (r.state.players[r.state.activePlayer].zones[ZONE.BACKSTAGE].length < 1) {
        fail('ON_PLACE side effect', 'backstage didn\'t grow');
      } else {
        pass('PLACE_MEMBER with ON_PLACE hook succeeds, backstage +1');
      }
    }
  }
}

{
  // End phase clears _turnBoosts
  const state = freshGame();
  state._turnBoosts = [{ type: 'DAMAGE_BOOST', amount: 999 }];
  // End main → performance (first player turn 1 auto-skips to next turn)
  const r = processAction(state, { type: ACTION.END_MAIN_PHASE });
  if (r.error) fail('End-phase boost clear', r.error);
  else if ((r.state._turnBoosts?.length ?? 0) !== 0) {
    fail('End phase clears _turnBoosts', `still has ${r.state._turnBoosts.length} boosts after end-of-turn`);
  } else {
    pass('End phase clears _turnBoosts (was leaking across turns)');
  }
}

{
  // Oshi skill once-per-turn is enforced by validator
  const state = freshGame();
  const p = state.players[state.activePlayer];
  p.oshiSkillUsedThisTurn = true;
  p.zones[ZONE.HOLO_POWER] = [makeInstance('__power__'), makeInstance('__power__')];
  const r = validateAction(state, { type: ACTION.USE_OSHI_SKILL, skillType: 'oshi' });
  if (r.valid) fail('Oshi skill once/turn enforced', 'validator let it through');
  else if (!r.reason.includes('每回合')) fail('Oshi once-per-turn error msg', `got ${r.reason}`);
  else pass('Oshi skill blocked by validator after use');
}

{
  // Baton Pass leaves outgoing center in REST
  let state = freshGame();
  const p = state.players[state.activePlayer];
  // Ensure a backstage member exists and center has enough cheer for the baton
  if (p.zones[ZONE.BACKSTAGE].length === 0) {
    p.zones[ZONE.BACKSTAGE].push(makeInstance(p.zones[ZONE.CENTER].cardId));
  }
  const center = p.zones[ZONE.CENTER];
  const batonCost = parseCost(CardDB.getCard(center.cardId)?.batonImage);
  // Attach enough fresh cheer for the cost
  for (let i = 0; i < batonCost.total; i++) {
    center.attachedCheer.push(makeInstance('hY01-001'));
  }
  const oldCenterId = center.instanceId;
  const r = processAction(state, { type: ACTION.BATON_PASS, backstageIndex: 0 });
  if (r.error) warn('Baton test', r.error); // skip if cost can't be met etc.
  else {
    const moved = r.state.players[state.activePlayer].zones[ZONE.BACKSTAGE].find(m => m.instanceId === oldCenterId);
    if (!moved) fail('Baton swap', 'outgoing center not found on backstage');
    else if (moved.state !== MEMBER_STATE.REST) fail('Baton outgoing REST', `state=${moved.state}, expected rest`);
    else pass('Baton outgoing center becomes REST');
  }
}

{
  // DeckBuilder: main deck exactly 50 enforced
  const { validateDeck } = await import(new URL('../web/game/core/DeckBuilder.js', import.meta.url));
  const tooSmall = {
    oshi: 'hBP02-001',
    mainDeck: [{ cardId: 'hBP02-008', count: 49 }],
    cheerDeck: [{ cardId: 'hY01-001', count: 20 }],
  };
  const r = validateDeck(tooSmall);
  if (r.valid) fail('Deck size=49 rejected', 'accepted 49-card main deck');
  else pass('Deck size != 50 rejected');

  const exactly = {
    oshi: 'hBP02-001',
    mainDeck: [
      { cardId: 'hBP02-008', count: 46 },
      { cardId: 'hBP02-010', count: 4 },
    ],
    cheerDeck: [{ cardId: 'hY01-001', count: 20 }],
  };
  const r2 = validateDeck(exactly);
  if (!r2.valid) fail('Deck size=50 accepted', r2.errors.join('; '));
  else pass('Deck size == 50 accepted');
}

{
  // bloomStack after knockdown: cards should be in archive as instances
  const state = freshGame();
  const p1 = state.players[1 - state.activePlayer];
  const target = p1.zones[ZONE.CENTER];
  if (!target) { fail('Knockdown archive test', 'no opponent center'); }
  else {
    // Seed a bloomStack
    target.bloomStack = [
      { cardId: 'hBP02-008', instanceId: 999001 },
      { cardId: 'hBP02-008', instanceId: 999002 },
    ];
    target.damage = 9999; // force knockdown
    const { archiveMember } = await import(new URL('../web/game/core/GameState.js', import.meta.url));
    archiveMember(p1, target.instanceId);
    const archived = p1.zones[ZONE.ARCHIVE].filter(c => c.cardId === 'hBP02-008');
    if (archived.length < 2) fail('bloomStack → archive', `expected ≥2 archived copies, got ${archived.length}`);
    else if (archived.some(c => !c.instanceId || typeof c.cardId !== 'string')) fail('Archived shape', 'not proper instances');
    else pass('bloomStack cards archived as proper instances on knockdown');
  }
}

{
  // REVERT_TO_DEBUT converts bloomStack entries to card instances
  const state = freshGame();
  const p = state.players[state.activePlayer];
  const center = p.zones[ZONE.CENTER];
  center.bloomStack = [{ cardId: 'hBP02-008', instanceId: 5000 }];
  const handBefore = p.zones[ZONE.HAND].length;
  state.pendingEffect = {
    type: 'REVERT_TO_DEBUT',
    player: state.activePlayer,
  };
  // EffectResolver expects `selected` with instanceId referring to a member on stage
  const r = resolveEffectChoice(state, state.pendingEffect, { instanceId: center.instanceId, name: 'test' });
  const hand = r.players[state.activePlayer].zones[ZONE.HAND];
  const addedCount = hand.length - handBefore;
  if (addedCount < 1) fail('REVERT_TO_DEBUT hand growth', `hand grew ${addedCount}`);
  else {
    const added = hand[hand.length - 1];
    if (!added || !added.instanceId || typeof added.cardId !== 'string') {
      fail('REVERT_TO_DEBUT instance shape', `hand top: ${JSON.stringify(added)?.slice(0, 80)}`);
    } else pass('REVERT_TO_DEBUT creates proper instances in hand (no more raw strings)');
  }
}

{
  // LIFE_CHEER branch attaches cheer to chosen member
  const state = freshGame();
  const p = state.players[state.activePlayer];
  const cheerInst = makeInstance('hY01-001', { faceDown: true });
  state.pendingEffect = {
    type: 'LIFE_CHEER',
    player: state.activePlayer,
    cheerInstances: [cheerInst],
  };
  const target = p.zones[ZONE.CENTER];
  const cheerBefore = target.attachedCheer.length;
  const r = resolveEffectChoice(state, state.pendingEffect, { instanceId: target.instanceId });
  const tgtAfter = r.players[state.activePlayer].zones[ZONE.CENTER];
  if (tgtAfter.attachedCheer.length !== cheerBefore + 1) {
    fail('LIFE_CHEER attaches', `cheer count ${cheerBefore} → ${tgtAfter.attachedCheer.length}`);
  } else if (tgtAfter.attachedCheer.some(c => c.faceDown)) {
    fail('LIFE_CHEER face-up', 'cheer still face-down after life reveal');
  } else {
    pass('LIFE_CHEER: life card attached face-up to chosen member');
  }
}

{
  // Setup backstage capped at 5 — overflow Debut/Spot stays in hand
  const { placeCenter, initGameState, drawInitialHand } = await import(new URL('../web/game/core/SetupManager.js', import.meta.url));
  const deck = makeDeckConfig(officialDecks['0']);
  let state = initGameState(deck, deck);
  // Force a hand of 7 Debut cards to trigger overflow
  const allDebut = state.players[0].zones[ZONE.DECK].filter(c => {
    const d = CardDB.getCard(c.cardId);
    return d && isMember(d.type) && (d.bloom === 'Debut' || d.bloom === 'Spot');
  });
  if (allDebut.length >= 7) {
    const hand = state.players[0].zones[ZONE.HAND];
    hand.length = 0;
    for (let i = 0; i < 7; i++) hand.push(allDebut[i]);
    const forced = placeCenter(state, 0, 0);
    const back = forced.players[0].zones[ZONE.BACKSTAGE].length;
    if (back > 5) fail('Backstage cap', `backstage has ${back} members (>5)`);
    else pass(`Backstage capped at ${back} ≤ 5 even with overflow Debut in hand`);
  } else {
    warn('Backstage cap test', 'deck does not have 7 Debut to force overflow');
  }
}

{
  // ON_CHEER_ATTACH fires cleanly: force state back to CHEER phase so assign is legal
  const state = freshGame();
  const p = state.players[state.activePlayer];
  if (p.zones[ZONE.CHEER_DECK].length > 0) {
    state.phase = PHASE.CHEER;
    const r = processAction(state, { type: ACTION.CHEER_ASSIGN, targetInstanceId: p.zones[ZONE.CENTER].instanceId });
    if (r.error) fail('Cheer assign hook chain', r.error);
    else if (r.state.players[state.activePlayer].zones[ZONE.CENTER].attachedCheer.length < 1) {
      fail('Cheer attach result', 'cheer count did not grow');
    } else pass('ON_CHEER_ATTACH fires cleanly on cheer assignment');
  } else {
    warn('Cheer attach test', 'cheer deck empty, skipped');
  }
}

{
  // ORDER_TO_BOTTOM handles empty ordered list
  const state = freshGame();
  state.pendingEffect = { type: 'ORDER_TO_BOTTOM', player: state.activePlayer, cards: [] };
  const r = resolveEffectChoice(state, state.pendingEffect, { orderedIds: [] });
  if (!r) fail('ORDER_TO_BOTTOM empty', 'resolver returned null');
  else pass('ORDER_TO_BOTTOM handles empty ordered list without crash');
}

{
  // SEARCH_SELECT with missing instanceId in deck no-ops gracefully
  const state = freshGame();
  state.pendingEffect = { type: 'SEARCH_SELECT', player: state.activePlayer };
  const handBefore = state.players[state.activePlayer].zones[ZONE.HAND].length;
  const r = resolveEffectChoice(state, state.pendingEffect, { instanceId: 999999, name: 'ghost' });
  const handAfter = r.players[state.activePlayer].zones[ZONE.HAND].length;
  if (handAfter !== handBefore) fail('SEARCH_SELECT ghost', `hand unexpectedly changed ${handBefore} → ${handAfter}`);
  else pass('SEARCH_SELECT with unknown instanceId no-ops');
}

{
  // Archive + knockdown: ensure cheer + support are also archived
  const state = freshGame();
  const p1 = state.players[1 - state.activePlayer];
  const target = p1.zones[ZONE.CENTER];
  target.attachedCheer = [makeInstance('hY01-001'), makeInstance('hY01-001')];
  target.attachedSupport = [makeInstance('hBP01-108')];
  const archiveBefore = p1.zones[ZONE.ARCHIVE].length;
  const { archiveMember } = await import(new URL('../web/game/core/GameState.js', import.meta.url));
  archiveMember(p1, target.instanceId);
  const archiveAfter = p1.zones[ZONE.ARCHIVE].length;
  // 1 member + 2 cheer + 1 support = 4
  if (archiveAfter - archiveBefore !== 4) {
    fail('Full archive on knockdown', `archive grew by ${archiveAfter - archiveBefore}, expected 4`);
  } else pass('Knockdown archives member + all attached cheer + support');
}

{
  // Handler integrity: handlers for firing hooks should not crash on minimal context
  const state = freshGame();
  const { triggerEffect } = await import(new URL('../web/game/effects/EffectEngine.js', import.meta.url));
  let crashed = 0, tested = 0;
  const sampleCards = ['hBP02-008', 'hBP02-010', 'hBP01-013', 'hBP01-014', 'hBP02-001'];
  const allHooks = ['ON_PLACE', 'ON_TURN_START', 'ON_TURN_END', 'ON_CHEER_ATTACH', 'ON_KNOCKDOWN', 'ON_DAMAGE_DEALT', 'ON_DAMAGE_TAKEN', 'ON_PASSIVE_GLOBAL'];
  for (const cardId of sampleCards) {
    for (const hook of allHooks) {
      tested++;
      try {
        triggerEffect(state, hook, { cardId, player: 0 });
      } catch (e) {
        crashed++;
      }
    }
  }
  if (crashed > 0) fail('Handler minimal context', `${crashed}/${tested} crashed`);
  else pass(`${tested} handler/hook combos survive minimal context`);
}

// ══════════════════════════════════════════════════════════════════
// Phase 2.4 — cost-bearing cheer→archive afterAction tests
// ══════════════════════════════════════════════════════════════════
section('Cost-bearing cheer→archive (Phase 2.4)');

// Helpers — build a synthetic state inline; no need to play through.
function makeMember(cardId, instanceId, opts = {}) {
  return {
    cardId,
    instanceId,
    faceDown: false,
    damage: opts.damage || 0,
    attachedCheer: (opts.cheer || []).map((c, i) => ({
      cardId: c.cardId, instanceId: c.instanceId || (instanceId * 100 + i + 1), faceDown: false,
    })),
    attachedSupport: opts.support || [],
    bloomStack: [],
  };
}

function makeMinState(p0Center, p0Collab, p0Backstage, p1Center, p1Backstage = []) {
  return {
    turnNumber: 1,
    activePlayer: 0,
    phase: PHASE.PERFORMANCE,
    log: [],
    pendingEffect: null,
    pendingEffectQueue: [],
    players: [
      {
        oshi: { cardId: 'hBP01-001', usedSp: false },
        zones: {
          center: p0Center, collab: p0Collab, backstage: p0Backstage,
          hand: [], deck: [], cheerDeck: [], holoPower: [], life: [], archive: [],
        },
        usedCollab: false, usedBaton: false, usedLimited: false,
        performedArts: { center: false, collab: false },
        _oncePerTurn: {}, _oncePerGame: {},
      },
      {
        oshi: { cardId: 'hBP01-002', usedSp: false },
        zones: {
          center: p1Center, collab: null, backstage: p1Backstage,
          hand: [], deck: [], cheerDeck: [], holoPower: [], life: [], archive: [],
        },
        usedCollab: false, usedBaton: false, usedLimited: false,
        performedArts: { center: false, collab: false },
        _oncePerTurn: {}, _oncePerGame: {},
      },
    ],
  };
}

{
  // Test: ARCHIVE_OWN_CHEER_THEN_DMG with damageTarget='opp_center' single target
  const cheer = { cardId: 'hY01-001', instanceId: 9001 };  // assume y card in db
  const member = makeMember('hBP05-028', 1, { cheer: [cheer] });
  const oppCenter = makeMember('hBP01-038', 100);
  const state = makeMinState(member, null, [], oppCenter, []);
  // Sanity: cheer attached
  if (state.players[0].zones.center.attachedCheer.length !== 1) {
    fail('ARCHIVE_OWN_CHEER_THEN_DMG setup', 'cheer not attached');
  } else {
    const archiveBefore = state.players[0].zones.archive.length;
    const dmgBefore = state.players[1].zones.center.damage;
    resolveEffectChoice(state, {
      type: 'SELECT_OWN_CHEER',
      player: 0,
      cards: [{ instanceId: 9001, cardId: 'hY01-001', name: 'cheer', image: '' }],
      maxSelect: 1,
      afterAction: 'ARCHIVE_OWN_CHEER_THEN_DMG',
      damageAmount: 30,
      damageTarget: 'opp_center',
    }, { instanceId: 9001, name: 'cheer' });

    const cheerArchived = state.players[0].zones.archive.length === archiveBefore + 1;
    const dmgApplied = state.players[1].zones.center.damage === dmgBefore + 30;
    const memberCheerCleared = state.players[0].zones.center.attachedCheer.length === 0;
    const noPending = state.pendingEffect === null;
    if (cheerArchived && dmgApplied && memberCheerCleared && noPending) {
      pass('ARCHIVE_OWN_CHEER_THEN_DMG opp_center: cheer→archive + 30 dmg + clean state');
    } else {
      fail('ARCHIVE_OWN_CHEER_THEN_DMG opp_center',
        `archived=${cheerArchived} dmg=${dmgApplied} cleared=${memberCheerCleared} noPending=${noPending}`);
    }
  }
}

{
  // Test: damageTarget='opp_center_or_collab' with both opp center+collab present → queues SELECT_TARGET
  const cheer = { cardId: 'hY01-001', instanceId: 9002 };
  const member = makeMember('hBP03-021', 2, { cheer: [cheer] });
  const oppCenter = makeMember('hBP01-038', 200);
  const oppCollab = makeMember('hBP01-040', 201);
  const state = makeMinState(null, member, [], oppCenter, []);
  state.players[1].zones.collab = oppCollab;

  resolveEffectChoice(state, {
    type: 'SELECT_OWN_CHEER',
    player: 0,
    cards: [{ instanceId: 9002, cardId: 'hY01-001', name: 'cheer', image: '' }],
    maxSelect: 1,
    afterAction: 'ARCHIVE_OWN_CHEER_THEN_DMG',
    damageAmount: 40,
    damageTarget: 'opp_center_or_collab',
  }, { instanceId: 9002, name: 'cheer' });

  const queuedPicker = state.pendingEffect &&
    state.pendingEffect.type === 'SELECT_TARGET' &&
    state.pendingEffect.afterAction === 'OPP_MEMBER_DAMAGE' &&
    state.pendingEffect.damageAmount === 40 &&
    Array.isArray(state.pendingEffect.cards) &&
    state.pendingEffect.cards.length === 2;
  if (queuedPicker) {
    pass('ARCHIVE_OWN_CHEER_THEN_DMG opp_center_or_collab: queues SELECT_TARGET picker with both targets');
  } else {
    fail('ARCHIVE_OWN_CHEER_THEN_DMG opp_center_or_collab queue',
      `pendingEffect=${JSON.stringify(state.pendingEffect)?.slice(0, 200)}`);
  }
}

{
  // Test: damageTarget='opp_center_AND_pick_backstage' applies to center, queues backstage picker
  const cheer = { cardId: 'hY02-001', instanceId: 9003 };  // blue cheer
  const member = makeMember('hSD03-006', 3, { cheer: [cheer] });
  const oppCenter = makeMember('hBP01-038', 300);
  const oppBackA = makeMember('hBP01-040', 301);
  const oppBackB = makeMember('hBP01-042', 302);
  const state = makeMinState(member, null, [], oppCenter, [oppBackA, oppBackB]);

  const centerDmgBefore = oppCenter.damage;
  resolveEffectChoice(state, {
    type: 'SELECT_OWN_CHEER',
    player: 0,
    cards: [{ instanceId: 9003, cardId: 'hY02-001', name: 'cheer', image: '' }],
    maxSelect: 1,
    afterAction: 'ARCHIVE_OWN_CHEER_THEN_DMG',
    damageAmount: 10,
    damageTarget: 'opp_center_AND_pick_backstage',
  }, { instanceId: 9003, name: 'cheer' });

  const centerDmgApplied = state.players[1].zones.center.damage === centerDmgBefore + 10;
  const backstagePickerQueued = state.pendingEffect &&
    state.pendingEffect.type === 'SELECT_TARGET' &&
    Array.isArray(state.pendingEffect.cards) &&
    state.pendingEffect.cards.length === 2;
  if (centerDmgApplied && backstagePickerQueued) {
    pass('ARCHIVE_OWN_CHEER_THEN_DMG opp_center_AND_pick_backstage: center hit + backstage picker queued');
  } else {
    fail('ARCHIVE_OWN_CHEER_THEN_DMG center+backstage',
      `centerDmg=${centerDmgApplied} pickerQueued=${backstagePickerQueued}`);
  }
}

{
  // Test: maxSelect=2 re-emit pattern — first pick re-emits, second pick applies damage
  const c1 = { cardId: 'hY02-001', instanceId: 9101 };  // blue
  const c2 = { cardId: 'hY02-001', instanceId: 9102 };  // blue
  const member = makeMember('hSD03-009', 4, { cheer: [c1, c2] });
  const oppCenter = makeMember('hBP01-038', 400);
  const state = makeMinState(member, null, [], oppCenter, []);

  // First pick — should re-emit, no damage yet
  const cards = [
    { instanceId: c1.instanceId, cardId: 'hY02-001', name: 'cheer1', image: '' },
    { instanceId: c2.instanceId, cardId: 'hY02-001', name: 'cheer2', image: '' },
  ];
  resolveEffectChoice(state, {
    type: 'SELECT_OWN_CHEER',
    player: 0,
    cards,
    maxSelect: 2,
    afterAction: 'ARCHIVE_OWN_CHEER_THEN_DMG',
    damageAmount: 30,
    damageTarget: 'opp_center',
  }, { instanceId: c1.instanceId, name: 'cheer1' });

  const firstReemitted = state.pendingEffect &&
    state.pendingEffect.maxSelect === 1 &&
    state.pendingEffect.cards?.length === 1;
  const cheerStillOnMember = state.players[0].zones.center.attachedCheer.length === 1;
  const noDmgYet = state.players[1].zones.center.damage === 0;
  if (!firstReemitted || !cheerStillOnMember || !noDmgYet) {
    fail('maxSelect=2 first pick re-emit',
      `reemit=${firstReemitted} cheerLeft=${cheerStillOnMember} noDmg=${noDmgYet}`);
  } else {
    // Second pick — should apply damage now
    resolveEffectChoice(state, state.pendingEffect, { instanceId: c2.instanceId, name: 'cheer2' });
    const finalDmg = state.players[1].zones.center.damage === 30;
    const cheerAllArchived = state.players[0].zones.center.attachedCheer.length === 0;
    const archiveHasBoth = state.players[0].zones.archive.length === 2;
    const noPending = state.pendingEffect === null;
    if (finalDmg && cheerAllArchived && archiveHasBoth && noPending) {
      pass('maxSelect=2 cheer cost: re-emit then apply 30 dmg on final pick');
    } else {
      fail('maxSelect=2 cheer cost final pick',
        `dmg=${finalDmg} cleared=${cheerAllArchived} archive2=${archiveHasBoth} noPending=${noPending}`);
    }
  }
}

{
  // Test: followupSearch field queues a SEARCH_SELECT after archive
  const cheer = { cardId: 'hY01-001', instanceId: 9201 };
  const member = makeMember('hBP06-078', 5, { cheer: [cheer] });
  const oppCenter = makeMember('hBP01-038', 500);
  const state = makeMinState(member, null, [], oppCenter, []);

  resolveEffectChoice(state, {
    type: 'SELECT_OWN_CHEER',
    player: 0,
    cards: [{ instanceId: 9201, cardId: 'hY01-001', name: 'cheer', image: '' }],
    maxSelect: 1,
    afterAction: 'ARCHIVE_OWN_CHEER_THEN_DMG',
    damageAmount: 0,
    damageTarget: 'none',
    followupSearch: {
      type: 'SEARCH_SELECT',
      player: 0,
      message: 'pick',
      cards: [{ instanceId: 999, cardId: 'hX', name: 'x', image: '' }],
      maxSelect: 1,
      afterAction: 'ADD_TO_HAND',
    },
  }, { instanceId: 9201, name: 'cheer' });

  const followupQueued = state.pendingEffect &&
    state.pendingEffect.type === 'SEARCH_SELECT' &&
    state.pendingEffect.afterAction === 'ADD_TO_HAND';
  const cheerArchived = state.players[0].zones.archive.length === 1;
  const noDmg = state.players[1].zones.center.damage === 0;
  if (followupQueued && cheerArchived && noDmg) {
    pass('followupSearch: cheer archived + SEARCH_SELECT queued + no damage');
  } else {
    fail('followupSearch chain',
      `queued=${followupQueued} archived=${cheerArchived} noDmg=${noDmg}`);
  }
}

// ══════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log(`TOTAL: ${PASS + FAIL + WARN}  |  ✓ ${PASS} passed  |  ✗ ${FAIL} failed  |  ⚠ ${WARN} warnings`);

if (failures.length) {
  console.log('\n──── FAILURES ────');
  failures.forEach((f, i) => console.log(`  ${i+1}. ${f.name}\n     ${f.reason}`));
}
if (warnings.length) {
  console.log('\n──── WARNINGS ────');
  warnings.forEach((w, i) => console.log(`  ${i+1}. ${w.name}\n     ${w.reason}`));
}

process.exit(FAIL > 0 ? 1 : 0);
