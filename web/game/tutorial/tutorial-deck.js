// Tutorial deck: built from hBP02 白上フブキ (Fubuki) cards with no auto effects.
// - Oshi hBP02-001 has oshi/SP skills but they're optional (player never triggers).
// - Debut hBP02-008 (no-limit card): 46 copies
// - 1st hBP02-010: 4 copies (art damage 40/60, needs 1 white cheer)
// - Cheer deck: 20 × hY01-001 白エール
//
// All member cards have no art effect text → no passthrough effect prompts.

export const TUTORIAL_DECK_P0 = {
  name: '教學用・白上フブキ',
  oshi: 'hBP02-001',
  mainDeck: [
    { cardId: 'hBP02-008', count: 46 },
    { cardId: 'hBP02-010', count: 4 },
  ],
  cheerDeck: [
    { cardId: 'hY01-001', count: 20 },
  ],
};

export const TUTORIAL_DECK_P1 = {
  name: '教學用・對手',
  oshi: 'hBP02-001',
  mainDeck: [
    { cardId: 'hBP02-008', count: 46 },
    { cardId: 'hBP02-010', count: 4 },
  ],
  cheerDeck: [
    { cardId: 'hY01-001', count: 20 },
  ],
};

export const TUTORIAL_CARDS = {
  OSHI: 'hBP02-001',
  DEBUT: 'hBP02-008',
  FIRST: 'hBP02-010',
  CHEER: 'hY01-001',
};
