// TutorialScript: 5 lesson definitions + action matching logic.
// Each lesson has a startConfig (for jumpToMainPhase) and a list of steps.
// Each step defines an expectedAction matcher; when matched, the step advances.

import { ACTION, PHASE, ZONE } from '../core/constants.js';
import { getCard } from '../core/CardDatabase.js';
import { TUTORIAL_CARDS } from './tutorial-deck.js';

const { OSHI, DEBUT, FIRST, CHEER } = TUTORIAL_CARDS;

// ── Action matchers ──
// Returns true if the actual action satisfies the expected pattern.
// Supports direct field compare + special matchers:
//  - { type: 'PLACE_MEMBER', cardBloom: 'Debut' }  →  hand card's bloom must equal 'Debut'
//  - { type: 'BLOOM', targetZone: 'center' }       →  target instance must live in center
//  - { type: 'USE_ART', position: 'center' }       →  position must equal 'center'
export function matchAction(expected, actual, state) {
  if (!expected || !actual) return false;
  if (expected.type !== actual.type) return false;

  const activePlayer = state.activePlayer;
  const player = state.players?.[activePlayer];

  // cardBloom: check bloom of the card being placed/bloomed
  if (expected.cardBloom) {
    const hand = player?.zones?.[ZONE.HAND] || [];
    const inst = hand[actual.handIndex];
    if (!inst) return false;
    const card = getCard(inst.cardId);
    if (!card) return false;
    if (Array.isArray(expected.cardBloom)) {
      if (!expected.cardBloom.includes(card.bloom)) return false;
    } else if (card.bloom !== expected.cardBloom) return false;
  }

  // Direct field compare (skip pseudo-fields)
  const skipKeys = new Set(['type', 'cardBloom', 'targetZone']);
  for (const [k, v] of Object.entries(expected)) {
    if (skipKeys.has(k)) continue;
    if (actual[k] !== v) return false;
  }

  return true;
}

// ── Lesson definitions ──

// Shared: a simple "starting hand" for Main Phase so the player has things to play
const DEBUT_HAND = [DEBUT, DEBUT, DEBUT, DEBUT];
const BLOOM_HAND = [FIRST, FIRST, DEBUT];

export const LESSONS = [
  // ───────────────────────── Lesson 1: 放置成員 ─────────────────────────
  {
    id: 'l1_placement',
    title: '第一課：放置成員',
    intro: '學習從手牌放置成員到後台，並將後台成員移到 Collab 出擊位置。',
    startConfig: {
      activePlayer: 0,
      firstPlayer: 0,
      turnNumber: 1,
      player0: {
        center: { cardId: DEBUT, state: 'active' },
        hand: [DEBUT, DEBUT, DEBUT, FIRST, FIRST],
      },
      player1: {
        center: { cardId: DEBUT, state: 'active' },
      },
    },
    steps: [
      {
        id: 'l1s1',
        prompt: '歡迎來到 hololive CARD GAME！你是先攻玩家。第一件事：從手牌點一張綠框的 Debut 卡，它會被放到「後台」。',
        expectedAction: { type: ACTION.PLACE_MEMBER, cardBloom: 'Debut' },
        highlightSelector: '.hand-area',
        hint: '點手牌中綠框的 Debut 卡，再確認放置到後台。',
        successToast: '很棒！Debut 放到後台了。',
      },
      {
        id: 'l1s2',
        prompt: '再放一張 Debut 到後台，準備下一課要介紹的「綻放」。',
        expectedAction: { type: ACTION.PLACE_MEMBER, cardBloom: 'Debut' },
        highlightSelector: '.hand-area',
        hint: '再選一張手牌中綠框的 Debut 卡放置。',
        successToast: '後台現在有 2 個 Debut。',
      },
      {
        id: 'l1s3',
        prompt: '已經學會放置了！點「結束主階段」結束這一回合的主階段。',
        expectedAction: { type: ACTION.END_MAIN_PHASE },
        highlightSelector: '[data-action="END_MAIN_PHASE"]',
        hint: '點畫面右邊或中間的「結束主要階段」按鈕。',
      },
    ],
    onComplete: { message: '第一課完成！', next: 'l2_bloom' },
  },

  // ───────────────────────── Lesson 2: 綻放 Bloom ─────────────────────────
  {
    id: 'l2_bloom',
    title: '第二課：綻放（Bloom）',
    intro: '綻放就是把 1st 卡疊在相同角色的 Debut 上，讓成員變強。',
    startConfig: {
      activePlayer: 0,
      firstPlayer: 0,
      turnNumber: 2,
      player0: {
        center: { cardId: DEBUT, state: 'active' },
        backstage: [
          { cardId: DEBUT, state: 'active' },
          { cardId: DEBUT, state: 'active' },
        ],
        hand: [FIRST, FIRST, FIRST, DEBUT, DEBUT],
      },
      player1: {
        center: { cardId: DEBUT, state: 'active' },
      },
    },
    steps: [
      {
        id: 'l2s1',
        prompt: '綻放能把 Debut 升級為 1st（藍框）。從手牌點一張 1st，然後點場上同名 Debut 執行綻放。',
        expectedAction: { type: ACTION.BLOOM, cardBloom: '1st' },
        highlightSelector: '.hand-area',
        hint: '點手牌中藍框的 1st 卡，再點中央 Center 的 Debut 成員。',
        successToast: 'Debut 綻放為 1st！HP 提升了。',
      },
      {
        id: 'l2s2',
        prompt: '點「結束主階段」結束此階段，進入下一課介紹的聯動。',
        expectedAction: { type: ACTION.END_MAIN_PHASE },
        highlightSelector: '[data-action="END_MAIN_PHASE"]',
        hint: '點「結束主階段」按鈕。',
      },
    ],
    onComplete: { message: '第二課完成！', next: 'l3_collab' },
  },

  // ───────────────────────── Lesson 3: 聯動 Collab ─────────────────────────
  {
    id: 'l3_collab',
    title: '第三課：聯動（Collab）',
    intro: '把後台成員移到 Collab 區，可以額外進行一次藝能攻擊。每回合只能 1 次，而且成員會變成休息狀態。',
    startConfig: {
      activePlayer: 0,
      firstPlayer: 0,
      turnNumber: 3,
      player0: {
        center: { cardId: FIRST, state: 'active', cheer: [CHEER] },
        backstage: [
          { cardId: DEBUT, state: 'active' },
          { cardId: DEBUT, state: 'active' },
          { cardId: DEBUT, state: 'active' },
        ],
        hand: [DEBUT],
      },
      player1: {
        center: { cardId: FIRST, state: 'active' },
      },
    },
    steps: [
      {
        id: 'l3s1',
        prompt: '點右側「聯動」按鈕，然後選一個後台成員讓它登上 Collab 位置。',
        expectedAction: { type: ACTION.COLLAB },
        highlightSelector: '[data-action="COLLAB"]',
        hint: '點「聯動」按鈕，再點任一個後台的 Debut 成員。',
        successToast: '成員登場到 Collab！',
      },
      {
        id: 'l3s2',
        prompt: '點「結束主階段」進入表演階段。',
        expectedAction: { type: ACTION.END_MAIN_PHASE },
        highlightSelector: '[data-action="END_MAIN_PHASE"]',
        hint: '點「結束主階段」按鈕。',
      },
    ],
    onComplete: { message: '第三課完成！', next: 'l4_art' },
  },

  // ───────────────────────── Lesson 4: 藝能攻擊 ─────────────────────────
  {
    id: 'l4_art',
    title: '第四課：藝能攻擊',
    intro: '成員的藝能需要消耗 Cheer（吶喊）能量。顏色要對得上才能使用彩色費用。',
    startConfig: {
      activePlayer: 0,
      firstPlayer: 0,
      turnNumber: 4,
      player0: {
        center: { cardId: FIRST, state: 'active', cheer: [CHEER, CHEER] },
        backstage: [
          { cardId: DEBUT, state: 'active' },
        ],
        hand: [],
      },
      player1: {
        center: { cardId: DEBUT, state: 'active' },
      },
    },
    steps: [
      {
        id: 'l4s1',
        prompt: '按「結束主階段」進入表演階段（這回合我們直接打藝能）。',
        expectedAction: { type: ACTION.END_MAIN_PHASE },
        highlightSelector: '[data-action="END_MAIN_PHASE"]',
        hint: '點「結束主階段」按鈕。',
      },
      {
        id: 'l4s2',
        prompt: '點右邊動作面板中的藝能按鈕（紅色方塊是 Cheer 能量費用，你的 Center 有 2 張白 Cheer 足以使用）。',
        expectedAction: { type: ACTION.USE_ART, position: 'center' },
        highlightSelector: '[data-action="USE_ART"][data-position="center"]',
        hint: '點右側動作面板中 Center 的藝能按鈕（會自動攻擊對手 Center）。',
        successToast: '攻擊命中！',
      },
      {
        id: 'l4s3',
        prompt: '點「結束表演」結束此回合的表演階段。',
        expectedAction: { type: ACTION.END_PERFORMANCE },
        highlightSelector: '[data-action="END_PERFORMANCE"]',
        hint: '點「結束表演」按鈕。',
      },
    ],
    onComplete: { message: '第四課完成！', next: 'l5_victory' },
  },

  // ───────────────────────── Lesson 5: 擊倒與勝利 ─────────────────────────
  {
    id: 'l5_victory',
    title: '第五課：擊倒與勝利',
    intro: '成員傷害超過 HP 會被擊倒，對手失去 1 點 Life。Life 歸 0 就輸了。對手只剩 1 Life，這回合可以擊倒對手結束比賽。',
    startConfig: {
      activePlayer: 0,
      firstPlayer: 0,
      turnNumber: 5,
      player0: {
        center: { cardId: FIRST, state: 'active', cheer: [CHEER, CHEER] },
        backstage: [
          { cardId: DEBUT, state: 'active' },
        ],
        hand: [],
      },
      player1: {
        // Center is Debut with full HP 100 — 1st's 60 damage art won't kill in 1 hit,
        // but we pre-apply 50 damage to make it killable in 1.
        center: { cardId: DEBUT, state: 'active', damage: 50 },
      },
    },
    // For lesson 5 we also override P1's initial life count to 1 so knockdown ends the game.
    postSetup: (state) => {
      const p1 = state.players[1];
      // Keep only 1 life card
      while (p1.zones[ZONE.LIFE].length > 1) {
        const card = p1.zones[ZONE.LIFE].pop();
        p1.zones[ZONE.CHEER_DECK].push(card);
      }
      return state;
    },
    steps: [
      {
        id: 'l5s1',
        prompt: '對手只剩 1 點 Life。按「結束主階段」開始表演。',
        expectedAction: { type: ACTION.END_MAIN_PHASE },
        highlightSelector: '[data-action="END_MAIN_PHASE"]',
        hint: '點「結束主階段」按鈕。',
      },
      {
        id: 'l5s2',
        prompt: '用你 Center 的第二個藝能「Thank You Friends♥」（60 傷害）攻擊。對手 Debut 剩餘 50 HP，60 > 50 會擊倒。',
        expectedAction: { type: ACTION.USE_ART, position: 'center', artIndex: 1 },
        highlightSelector: '[data-action="USE_ART"][data-position="center"][data-art="1"]',
        hint: '點右側動作面板中的「Thank You Friends♥」按鈕（art2, 60 傷害）。',
        successToast: '擊倒對手！Life -1，對手 Life 歸零。',
      },
    ],
    onComplete: { message: '基礎教學完成！繼續進階規則。', next: 'l6_cheer' },
  },

  // ───────────────────────── Lesson 6: Cheer 指派 ─────────────────────────
  {
    id: 'l6_cheer',
    title: '第六課：Cheer 能量指派',
    intro: '每回合的 Cheer 階段會自動從 Cheer 牌組頂翻 1 張，你要指派給場上某個成員。Cheer 是藝能的能量來源。',
    startConfig: {
      phase: PHASE.CHEER,
      activePlayer: 0,
      firstPlayer: 0,
      turnNumber: 2,
      player0: {
        center: { cardId: DEBUT, state: 'active' },
        backstage: [{ cardId: DEBUT, state: 'active' }],
        hand: [DEBUT, DEBUT],
      },
      player1: {
        center: { cardId: DEBUT, state: 'active' },
      },
    },
    steps: [
      {
        id: 'l6s1',
        prompt: 'Cheer 階段：從 Cheer 牌組頂翻出 1 張 Cheer，指派給中央的成員作為能量。',
        expectedAction: { type: ACTION.CHEER_ASSIGN },
        highlightSelector: '.local-field .zone-center',
        hint: '直接點中央 Center 的成員卡接收 Cheer。',
        successToast: 'Cheer 已指派！成員多了 1 點能量。',
      },
      {
        id: 'l6s2',
        prompt: '很好！接下來進入主階段，按「結束主階段」結束即可。',
        expectedAction: { type: ACTION.END_MAIN_PHASE },
        highlightSelector: '[data-action="END_MAIN_PHASE"]',
        hint: '點「結束主要階段」。',
      },
    ],
    onComplete: { message: '第六課完成！', next: 'l7_first_turn' },
  },

  // ───────────────────────── Lesson 7: 第一回合限制 ─────────────────────────
  {
    id: 'l7_first_turn',
    title: '第七課：第一回合限制',
    intro: '先攻第一回合有嚴格限制：不能綻放、不能攻擊（表演階段會自動跳過）。只能放置成員、使用支援卡、結束階段。',
    startConfig: {
      phase: PHASE.MAIN,
      activePlayer: 0,
      firstPlayer: 0,
      turnNumber: 1,
      firstTurn: [true, true],
      player0: {
        center: { cardId: DEBUT, state: 'active' },
        hand: [DEBUT, FIRST, DEBUT],
      },
      player1: {
        center: { cardId: DEBUT, state: 'active' },
      },
    },
    steps: [
      {
        id: 'l7s1',
        prompt: '你現在是先攻第一回合。觀察：綻放按鈕被禁用（顯示「第一回合禁止」）。先把 Debut 放到後台。',
        expectedAction: { type: ACTION.PLACE_MEMBER, cardBloom: 'Debut' },
        highlightSelector: '.hand-area',
        hint: '從手牌點綠框的 Debut 放到後台。',
        successToast: '第一回合放置 OK！',
      },
      {
        id: 'l7s2',
        prompt: '現在點「結束主階段」— 先攻第一回合會**自動跳過表演階段**（無法攻擊），直接進入下回合。',
        expectedAction: { type: ACTION.END_MAIN_PHASE },
        highlightSelector: '[data-action="END_MAIN_PHASE"]',
        hint: '點「結束主要階段」— 接下來會自動結束回合。',
        successToast: '先攻第一回合無法攻擊，已自動跳過表演。',
      },
    ],
    onComplete: { message: '第七課完成！', next: 'l8_baton' },
  },

  // ───────────────────────── Lesson 8: 交棒 Baton Pass ─────────────────────────
  {
    id: 'l8_baton',
    title: '第八課：交棒（Baton Pass）',
    intro: '交棒可以把 Center 和 Backstage 成員互換位置，需支付 Center 身上 Cheer 作為費用（卡片上的「Baton」圖示表示費用）。每回合限 1 次。',
    startConfig: {
      phase: PHASE.MAIN,
      activePlayer: 0,
      firstPlayer: 0,
      turnNumber: 3,
      player0: {
        center: { cardId: DEBUT, state: 'active', cheer: [CHEER, CHEER] },
        backstage: [
          { cardId: DEBUT, state: 'active' },
          { cardId: DEBUT, state: 'active' },
        ],
        hand: [DEBUT],
      },
      player1: {
        center: { cardId: DEBUT, state: 'active' },
      },
    },
    steps: [
      {
        id: 'l8s1',
        prompt: '按「交棒」，然後選一個後台成員，Center 身上 1 張 Cheer 會移到存檔，後台成員上來當新 Center。',
        expectedAction: { type: ACTION.BATON_PASS },
        highlightSelector: '[data-action="BATON_PASS"]',
        hint: '點「交棒」按鈕 → 選任一後台成員。',
        successToast: '交棒成功！後台成員上場。',
      },
      {
        id: 'l8s2',
        prompt: '按「結束主階段」結束這一步。',
        expectedAction: { type: ACTION.END_MAIN_PHASE },
        highlightSelector: '[data-action="END_MAIN_PHASE"]',
        hint: '點「結束主要階段」。',
      },
    ],
    onComplete: { message: '第八課完成！', next: 'l9_oshi' },
  },

  // ───────────────────────── Lesson 9: 推し技能 / SP 技能 ─────────────────────────
  {
    id: 'l9_oshi',
    title: '第九課：推し技能 / SP 技能',
    intro: '聯動後會產生 HoloPower（推し能量），可用來發動推し技能（每回合 1 次）或 SP 技能（每場比賽 1 次，威力更強）。能量從牌組頂翻出，消耗時送入存檔。',
    startConfig: {
      phase: PHASE.MAIN,
      activePlayer: 0,
      firstPlayer: 0,
      turnNumber: 3,
      player0: {
        center: { cardId: FIRST, state: 'active' },
        backstage: [{ cardId: DEBUT, state: 'active' }],
        hand: [DEBUT],
        holoPower: 3, // pre-seed 3 holoPower for testing oshi + sp skills
      },
      player1: {
        center: { cardId: DEBUT, state: 'active' },
      },
    },
    steps: [
      {
        id: 'l9s1',
        prompt: '你已有 3 張 HoloPower。按「推し技能」消耗 2 張發動（Fubuki 推し技能：從牌組找 Mascot 加入手牌）。',
        expectedAction: { type: ACTION.USE_OSHI_SKILL, skillType: 'oshi' },
        highlightSelector: '[data-action="USE_OSHI_SKILL"][data-skill="oshi"]',
        hint: '點「推し技能」按鈕（顯示成本 2）。',
        successToast: '推し技能發動！2 張 HoloPower 送入存檔。',
      },
      {
        id: 'l9s2',
        prompt: '推し技能本回合不能再用（每回合 1 次）。按「結束主階段」結束。',
        expectedAction: { type: ACTION.END_MAIN_PHASE },
        highlightSelector: '[data-action="END_MAIN_PHASE"]',
        hint: '點「結束主要階段」。',
      },
    ],
    onComplete: { message: '第九課完成！', next: 'l10_special_attack' },
  },

  // ───────────────────────── Lesson 10: 特攻顏色加成 ─────────────────────────
  {
    id: 'l10_special_attack',
    title: '第十課：特攻顏色加成',
    intro: '某些藝能對**特定顏色**的對手造成額外傷害（卡片上的「特攻」圖示表示加成顏色和數值）。若藝能有「特攻 +50 紅」且對手是紅色成員，傷害就會 +50。本課沒有實際特攻卡，以概念說明為主。',
    startConfig: {
      phase: PHASE.MAIN,
      activePlayer: 0,
      firstPlayer: 0,
      turnNumber: 4,
      player0: {
        center: { cardId: FIRST, state: 'active', cheer: [CHEER, CHEER] },
        backstage: [{ cardId: DEBUT, state: 'active' }],
        hand: [],
      },
      player1: {
        center: { cardId: DEBUT, state: 'active' },
      },
    },
    steps: [
      {
        id: 'l10s1',
        prompt: '按「結束主階段」進入表演階段。',
        expectedAction: { type: ACTION.END_MAIN_PHASE },
        highlightSelector: '[data-action="END_MAIN_PHASE"]',
        hint: '點「結束主要階段」。',
      },
      {
        id: 'l10s2',
        prompt: '用 Thank You Friends♥ 攻擊。如果這個藝能有「特攻 白」圖示且對手是白色（本課場景裡對手就是白色），傷害會額外 +50。',
        expectedAction: { type: ACTION.USE_ART, position: 'center', artIndex: 1 },
        highlightSelector: '[data-action="USE_ART"][data-position="center"][data-art="1"]',
        hint: '點「Thank You Friends♥」按鈕（art2）。',
        successToast: '攻擊命中！觀察操作紀錄確認是否有特攻加成。',
      },
      {
        id: 'l10s3',
        prompt: '按「結束表演」完成回合。',
        expectedAction: { type: ACTION.END_PERFORMANCE },
        highlightSelector: '[data-action="END_PERFORMANCE"]',
        hint: '點「結束表演」按鈕。',
      },
    ],
    onComplete: { message: '🏆 恭喜完成全部 10 課教學！', next: null, victory: true },
  },
];

export function getLesson(lessonId) {
  return LESSONS.find(l => l.id === lessonId);
}

export function getLessonIndex(lessonId) {
  return LESSONS.findIndex(l => l.id === lessonId);
}

export function getFirstLesson() {
  return LESSONS[0];
}
