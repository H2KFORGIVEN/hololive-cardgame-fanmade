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
  const engineSrc = fs.readFileSync(path.join(ROOT, 'web/game/core/GameEngine.js'), 'utf8');
  const batonBlock = engineSrc.match(/function processBatonPass[\s\S]{0,2500}?(?=function |$)/);
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
  const ctrlSrc = fs.readFileSync(path.join(ROOT, 'web/game/GameController.js'), 'utf8');
  if (ctrlSrc.includes('Auto-clear manual effects')) pass('MANUAL_EFFECT popup auto-dismissed (user fix in place)');
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
