export const PHASE = {
  SETUP: 'setup',
  MULLIGAN: 'mulligan',
  RESET: 'reset',
  DRAW: 'draw',
  CHEER: 'cheer',
  MAIN: 'main',
  PERFORMANCE: 'performance',
  END: 'end',
  GAME_OVER: 'game_over',
};

export const ZONE = {
  CENTER: 'center',
  COLLAB: 'collab',
  BACKSTAGE: 'backstage',
  HAND: 'hand',
  DECK: 'deck',
  CHEER_DECK: 'cheerDeck',
  HOLO_POWER: 'holoPower',
  LIFE: 'life',
  ARCHIVE: 'archive',
};

export const COLOR = {
  WHITE: '白',
  GREEN: '綠',
  RED: '紅',
  BLUE: '藍',
  PURPLE: '紫',
  YELLOW: '黃',
  COLORLESS: '無',
};

export const CARD_TYPE = {
  OSHI: '主推',
  MEMBER: '成員',
  CHEER: '吶喊',
  SUPPORT_MASCOT: '支援・吉祥物',
  SUPPORT_ACTIVITY: '支援・活動',
  SUPPORT_ITEM: '支援・物品',
  SUPPORT_TOOL: '支援・道具',
  SUPPORT_FAN: '支援・粉絲',
  SUPPORT_STAFF: '支援・工作人員',
};

export const BLOOM_LEVEL = {
  DEBUT: 'Debut',
  FIRST: '1st',
  FIRST_BUZZ: '1st Buzz',
  SECOND: '2nd',
  SPOT: 'Spot',
};

export const BLOOM_ORDER = ['Debut', '1st', '1st Buzz', '2nd'];

export const ACTION = {
  START_GAME: 'START_GAME',
  MULLIGAN_DECISION: 'MULLIGAN_DECISION',
  SELECT_CENTER: 'SELECT_CENTER',
  SELECT_BACKSTAGE: 'SELECT_BACKSTAGE',
  CONFIRM_SETUP: 'CONFIRM_SETUP',
  ADVANCE_PHASE: 'ADVANCE_PHASE',
  CHEER_ASSIGN: 'CHEER_ASSIGN',
  PLACE_MEMBER: 'PLACE_MEMBER',
  BLOOM: 'BLOOM',
  PLAY_SUPPORT: 'PLAY_SUPPORT',
  USE_OSHI_SKILL: 'USE_OSHI_SKILL',
  COLLAB: 'COLLAB',
  BATON_PASS: 'BATON_PASS',
  USE_ART: 'USE_ART',
  EFFECT_CHOICE: 'EFFECT_CHOICE',
  END_MAIN_PHASE: 'END_MAIN_PHASE',
  END_PERFORMANCE: 'END_PERFORMANCE',
  MANUAL_ADJUST: 'MANUAL_ADJUST',
};

export const MEMBER_STATE = {
  ACTIVE: 'active',
  REST: 'rest',
};

export const MAX_STAGE_MEMBERS = 6;
export const MAIN_DECK_SIZE = 50;
export const CHEER_DECK_SIZE = 20;
export const MAX_COPIES_PER_CARD = 4;
export const INITIAL_HAND_SIZE = 7;

export function isSupport(type) {
  return type?.startsWith('支援');
}

export function isMember(type) {
  return type === CARD_TYPE.MEMBER;
}

export function isOshi(type) {
  return type === CARD_TYPE.OSHI;
}

export function isCheer(type) {
  return type === CARD_TYPE.CHEER;
}

// Parse art/baton cost from icon path arrays
// e.g. ["icons/arts_white.png", "icons/arts_null.png"] => { white: 1, colorless: 1, total: 2 }
export function parseCost(iconArray) {
  if (!iconArray || !Array.isArray(iconArray)) return { total: 0 };
  const cost = { total: iconArray.length };
  for (const icon of iconArray) {
    const match = icon.match(/arts_(\w+)\.png/);
    if (!match) continue;
    const color = match[1];
    if (color === 'null') {
      cost.colorless = (cost.colorless || 0) + 1;
    } else {
      cost[color] = (cost[color] || 0) + 1;
    }
  }
  return cost;
}

// Map icon color name to game color
export const ICON_TO_COLOR = {
  white: COLOR.WHITE,
  green: COLOR.GREEN,
  red: COLOR.RED,
  blue: COLOR.BLUE,
  purple: COLOR.PURPLE,
  yellow: COLOR.YELLOW,
};
