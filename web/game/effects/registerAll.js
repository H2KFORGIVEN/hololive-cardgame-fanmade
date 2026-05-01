// Master registration: loads effect analysis and registers all template handlers

import { registerDamageBoosts } from './handlers/damage-boost.js';
import { registerSpecialDamage } from './handlers/special-damage.js';
import { registerSearchDraw } from './handlers/search-draw.js';
import { registerCheerManage } from './handlers/cheer-manage.js';
import { registerHpRestore } from './handlers/hp-restore.js';
import { registerRestManipulate } from './handlers/rest-manipulate.js';
import { registerPositionChange } from './handlers/position-change.js';
import { registerPreventDamage } from './handlers/prevent-damage.js';
import { registerDiceRoll } from './handlers/dice-roll.js';
import { registerDeckManipulate } from './handlers/deck-manipulate.js';
import { registerConditionalBoost } from './handlers/conditional-boost.js';
import { registerTop50 } from './handlers/top50-cards.js';
import { registerPhaseB } from './handlers/phaseB-cards.js';
import { registerPhaseC1 } from './handlers/phaseC1-cards.js';
import { registerPhaseC2 } from './handlers/phaseC2-cards.js';
import { registerPhaseCFinal } from './handlers/phaseC-final.js';
import { registerPhaseDGenerated } from './handlers/phaseD-generated.js';
import { registerCleanup } from './handlers/cleanup.js';
import { registerLookTopBottom } from './handlers/look-top-bottom.js';
import { registerPassthrough } from './handlers/passthrough.js';
import { registerKuroniiDeck } from './handlers/kuronii-deck.js';
import { registerChocoyuDeck } from './handlers/chocoyu-deck.js';
import { registerMikoDeck } from './handlers/miko-deck.js';
import { registerSuiseiDeck } from './handlers/suisei-deck.js';
import { registerFlareDeck } from './handlers/flare-deck.js';
import { registerNeneDeck } from './handlers/nene-deck.js';

let _initialized = false;

export async function initEffects() {
  if (_initialized) return;
  _initialized = true;

  // Load effect analysis data
  let effectsData;
  try {
    const resp = await fetch('../game/effects/effect_analysis.json');
    const data = await resp.json();
    effectsData = data.effects || [];
  } catch (e) {
    console.warn('Could not load effect analysis, effects will be manual:', e);
    return { total: 0 };
  }

  const counts = {};

  // P1: Core effects (most specific patterns first)
  counts.damageBoost = registerDamageBoosts(effectsData);
  counts.specialDamage = registerSpecialDamage(effectsData);
  counts.searchDraw = registerSearchDraw(effectsData);
  counts.cheerManage = registerCheerManage(effectsData);

  // P2: Secondary effects
  counts.hpRestore = registerHpRestore(effectsData);
  counts.restManipulate = registerRestManipulate(effectsData);
  counts.positionChange = registerPositionChange(effectsData);
  counts.preventDamage = registerPreventDamage(effectsData);

  // P3: Complex effects
  counts.diceRoll = registerDiceRoll(effectsData);

  // P4: New template handlers
  counts.deckManipulate = registerDeckManipulate(effectsData);
  counts.conditionalBoost = registerConditionalBoost(effectsData);

  // P4.5: Card-specific handlers for top 50 high-usage cards
  // (registered AFTER templates so they OVERRIDE template handlers for these cards)
  counts.top50 = registerTop50();

  // P4.6: Phase B — handlers for ranks 51-200
  counts.phaseB = registerPhaseB();

  // P4.7: Phase C Batch 1 — next 100 cards
  counts.phaseC1 = registerPhaseC1();

  // P4.8: Phase C Batch 2 — next 110 cards
  counts.phaseC2 = registerPhaseC2();

  // P4.9: Phase C Final — all remaining 204 cards
  counts.phaseCFinal = registerPhaseCFinal();

  // P4.92: Phase D — auto-generated pattern-based handlers for cards not
  // covered by phaseB/C. Registers REAL handlers for matched patterns
  // (oshi color-boost factory, activity tag/name search, member draw-N,
  // cheer yellEffect stubs, support REGISTRY merge) and hint-logs for the
  // rest. Skips any (cardId, hook) already registered by earlier phases.
  counts.phaseDGenerated = registerPhaseDGenerated();

  // P4.95: Look-top-and-bottom — support cards that look at top X and order rest to bottom
  counts.lookTopBottom = registerLookTopBottom();

  // P4.99: Cleanup — fill secondary hook gaps (ON_ART_RESOLVE for cards with ON_ART_DECLARE, etc.)
  counts.cleanup = registerCleanup(effectsData);

  // P4.96: Deck-specific implementations (registered AFTER bulk handlers
  // so they override any earlier wrong stubs). Each card here has its
  // real zh-TW effect text in a comment, implemented per text only —
  // no guessing per ~/.claude/projects/.../feedback_no_guessing_card_effects.md.
  counts.kuroniiDeck = registerKuroniiDeck();
  counts.chocoyuDeck = registerChocoyuDeck();
  counts.mikoDeck = registerMikoDeck();
  counts.suiseiDeck = registerSuiseiDeck();
  counts.flareDeck = registerFlareDeck();
  counts.neneDeck = registerNeneDeck();

  // P5: Universal fallback — covers ALL remaining cards with effect text
  counts.passthrough = registerPassthrough(effectsData);

  const total = Object.values(counts).reduce((s, c) => s + c, 0);
  console.log(`Effects registered: ${total}`, counts);

  return { total, ...counts };
}
