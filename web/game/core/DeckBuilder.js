import { MAIN_DECK_SIZE, CHEER_DECK_SIZE, MAX_COPIES_PER_CARD, isSupport, isMember, isOshi, isCheer } from './constants.js';
import { getCard } from './CardDatabase.js';
import { createCardInstance } from './GameState.js';

// Restricted cards: max 1 copy per deck
// Note: hBP01-010 and hBP01-014 were unrestricted as of 2025-12-08
const RESTRICTED_CARDS = new Set(['hBP01-030', 'hBP02-094']);

// Cards with "no copy limit" (這個成員沒有張數限制)
const NO_LIMIT_CARDS = new Set([
  'hBP01-009','hBP01-015','hBP01-021','hBP01-024','hBP01-028','hBP01-032','hBP01-038',
  'hBP01-044','hBP01-048','hBP01-052','hBP01-056','hBP01-062','hBP01-068','hBP01-072',
  'hBP01-076','hBP01-082','hBP01-088','hBP01-092','hBP02-008','hBP02-014','hBP02-018',
  'hBP02-024','hBP02-028','hBP02-035','hBP02-042','hBP02-048','hBP02-054','hBP02-061',
  'hBP02-065','hBP03-009','hBP03-016','hBP03-025','hBP03-031','hBP03-037','hBP03-040',
  'hBP03-046','hBP03-051','hBP03-057','hBP03-061','hBP03-067','hBP03-073','hBP03-080',
  'hBP04-008','hBP04-016','hBP04-020','hBP04-028','hBP04-032','hBP04-039','hBP04-043',
  'hBP04-050','hBP04-054','hBP04-063','hBP04-067','hBP04-073','hBP04-079','hBP04-083',
  'hBP06-015','hSD02-002','hSD03-002','hSD04-002','hSD05-002','hSD07-002','hSD10-002',
  'hSD10-007','hSD11-002','hSD11-007','hSD13-003','hSD13-008',
]);

function getMaxCopies(cardId) {
  if (RESTRICTED_CARDS.has(cardId)) return 1;
  if (NO_LIMIT_CARDS.has(cardId)) return 50; // effectively unlimited within deck size
  return MAX_COPIES_PER_CARD;
}

// Validate a deck configuration
// deckConfig: { oshi: cardId, mainDeck: [{cardId, count}], cheerDeck: [{cardId, count}] }
export function validateDeck(deckConfig) {
  const errors = [];

  // Oshi validation
  if (!deckConfig.oshi) {
    errors.push('必須選擇 1 張推しホロメン');
  } else {
    const oshiCard = getCard(deckConfig.oshi);
    if (!oshiCard || !isOshi(oshiCard.type)) {
      errors.push(`${deckConfig.oshi} 不是有效的推しホロメン`);
    }
  }

  // Main deck validation
  let mainTotal = 0;
  const mainCounts = new Map();
  for (const { cardId, count } of (deckConfig.mainDeck || [])) {
    const card = getCard(cardId);
    if (!card) {
      errors.push(`找不到卡片 ${cardId}`);
      continue;
    }
    if (!isMember(card.type) && !isSupport(card.type)) {
      errors.push(`${cardId} (${card.name}) 不能放入主牌組（只能放成員或支援卡）`);
    }
    const existing = mainCounts.get(cardId) || 0;
    const newCount = existing + count;
    const maxAllowed = getMaxCopies(cardId);
    if (newCount > maxAllowed) {
      errors.push(`${cardId} (${card.name}) 超過上限 ${maxAllowed} 張（目前 ${newCount} 張）${RESTRICTED_CARDS.has(cardId) ? '【制限卡】' : ''}`);
    }
    mainCounts.set(cardId, newCount);
    mainTotal += count;
  }
  if (mainTotal > MAIN_DECK_SIZE) {
    errors.push(`主牌組不能超過 ${MAIN_DECK_SIZE} 張（目前 ${mainTotal} 張）`);
  } else if (mainTotal === 0) {
    errors.push(`主牌組至少需要 1 張卡片`);
  }

  // Check at least 1 Debut member
  let hasDebut = false;
  for (const { cardId } of (deckConfig.mainDeck || [])) {
    const card = getCard(cardId);
    if (card && isMember(card.type) && (card.bloom === 'Debut' || card.bloom === 'Spot')) {
      hasDebut = true;
      break;
    }
  }
  if (!hasDebut) {
    errors.push('主牌組至少需要 1 張 Debut 或 Spot 成員');
  }

  // Cheer deck validation
  let cheerTotal = 0;
  for (const { cardId, count } of (deckConfig.cheerDeck || [])) {
    const card = getCard(cardId);
    if (!card) {
      errors.push(`找不到吶喊卡 ${cardId}`);
      continue;
    }
    if (!isCheer(card.type)) {
      errors.push(`${cardId} (${card.name}) 不是吶喊卡`);
    }
    // Cheer deck has no per-card limit
    cheerTotal += count;
  }
  if (cheerTotal !== CHEER_DECK_SIZE) {
    errors.push(`吶喊牌組需要剛好 ${CHEER_DECK_SIZE} 張（目前 ${cheerTotal} 張）`);
  }

  return { valid: errors.length === 0, errors };
}

// Expand deck config into card instance arrays
export function expandDeck(deckConfig) {
  const mainDeck = [];
  for (const { cardId, count } of (deckConfig.mainDeck || [])) {
    for (let i = 0; i < count; i++) {
      mainDeck.push(createCardInstance(cardId));
    }
  }

  const cheerDeck = [];
  for (const { cardId, count } of (deckConfig.cheerDeck || [])) {
    for (let i = 0; i < count; i++) {
      cheerDeck.push(createCardInstance(cardId));
    }
  }

  return { mainDeck, cheerDeck };
}

// Fisher-Yates shuffle (in-place)
export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export { RESTRICTED_CARDS, NO_LIMIT_CARDS, getMaxCopies };
