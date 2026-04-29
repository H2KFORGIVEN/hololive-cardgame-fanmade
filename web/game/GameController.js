import { loadCards, getCard, getCardImage } from './core/CardDatabase.js';
import { createGameState, createCardInstance, cloneState } from './core/GameState.js';
import { expandDeck, shuffle } from './core/DeckBuilder.js';
import { PHASE, ZONE, ACTION, INITIAL_HAND_SIZE, isMember, isSupport } from './core/constants.js';
import { resolveEffectChoice } from './core/EffectResolver.js';
import { initGameState, drawInitialHand, handHasDebut, processMulligan, returnCardsFromHand, placeCenter, finalizeSetup } from './core/SetupManager.js';
import { LocalAdapter } from './net/LocalAdapter.js';
import { renderDeckSelect, loadRecommendedDecks } from './ui/DeckSelectScreen.js';
import { renderGameBoard } from './ui/GameBoard.js';
import { renderActionPanel } from './ui/ActionPanel.js';
import { renderCardPreview } from './ui/CardRenderer.js';
import { initEffects } from './effects/registerAll.js';
import { showManualAdjustModal, showEffectPromptModal } from './ui/ManualAdjustModal.js';
import { showAttackArrow, hideAttackArrow, showEffectToast, inferTone } from './fx/vfx-helpers.js';
import { initSounds, playSound, isMuted, setMuted } from './fx/sounds.js';
// Wire global audio unlock (browsers require user gesture for first sound).
initSounds();

export class GameController {
  constructor(container) {
    this.container = container;
    this.adapter = new LocalAdapter();
    this.mode = 'local'; // 'local' | 'online'
    this.decks = [null, null];
    this.selectingPlayer = 0;
    this.interactionMode = null;
    this.pendingAction = null;
  }

  async start() {
    this.mode = 'local';
    this.adapter = new LocalAdapter();
    await loadCards('../data/cards.json');
    const result = await initEffects();
    console.log('Effects system initialized:', result);
    this._warmPixi();
    // Rebuild recommended decks from latest tournament data (top 1/2/3/6 of
    // most recent event with enough placements). Small fetch, worth awaiting
    // so the deck-select sidebar shows the right list on first paint.
    await loadRecommendedDecks();
    this.showDeckSelect(0);
  }

  _warmPixi() {
    // Fire-and-forget pre-load so first effect has no import delay
    this._getFx().catch(err => console.warn('Pixi FX warm-up failed (effects will still work on demand):', err));
  }

  async startOnline() {
    this.mode = 'online';
    await loadCards('../data/cards.json');
    await initEffects();
    this._warmPixi();
    await loadRecommendedDecks();
    this.showLobby();
  }

  async startTutorial() {
    this.mode = 'tutorial';
    await loadCards('../data/cards.json');
    await initEffects();
    this._warmPixi();

    const { LESSONS } = await import('./tutorial/TutorialScript.js');
    this.tutorialLessons = LESSONS;

    // Show the lesson picker first — user chooses which lesson to start at
    this._showTutorialLessonPicker();
  }

  _showTutorialLessonPicker() {
    // Split lessons into basic (1-5) and advanced (6+) groupings for a two-column list
    const lessons = this.tutorialLessons || [];
    const basicCount = 5;

    const card = (lesson, idx) => `
      <button class="tutorial-picker-card" data-lesson-idx="${idx}">
        <div class="tutorial-picker-num">第 ${idx + 1} 課</div>
        <div class="tutorial-picker-title">${lesson.title?.replace(/^第.+?課：/, '') || '未命名'}</div>
        <div class="tutorial-picker-intro">${lesson.intro || ''}</div>
      </button>
    `;

    this.container.innerHTML = `
      <div class="tutorial-picker-screen">
        <div class="tutorial-picker-header">
          <button class="tutorial-picker-back">← 返回</button>
          <h1 class="tutorial-picker-title-main">新手教學</h1>
          <p class="tutorial-picker-subtitle">選擇要開始的課程。建議從第一課循序漸進，也可以直接跳到想複習的段落。</p>
        </div>
        <div class="tutorial-picker-sections">
          <section class="tutorial-picker-section">
            <div class="tutorial-picker-section-label">基礎（L1–L5）</div>
            <div class="tutorial-picker-grid">
              ${lessons.slice(0, basicCount).map((l, i) => card(l, i)).join('')}
            </div>
          </section>
          <section class="tutorial-picker-section">
            <div class="tutorial-picker-section-label">進階規則（L6–L${lessons.length}）</div>
            <div class="tutorial-picker-grid">
              ${lessons.slice(basicCount).map((l, i) => card(l, i + basicCount)).join('')}
            </div>
          </section>
        </div>
      </div>
    `;

    this.container.querySelectorAll('.tutorial-picker-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.lessonIdx, 10);
        this._startTutorialAtLesson(idx);
      });
    });
    this.container.querySelector('.tutorial-picker-back').addEventListener('click', () => this._exitTutorial());
  }

  async _startTutorialAtLesson(lessonIndex) {
    const { TutorialAdapter } = await import('./tutorial/TutorialAdapter.js');
    const { TutorialOverlay } = await import('./tutorial/TutorialOverlay.js');
    const { jumpToMainPhase } = await import('./core/GameState.js');
    const { TUTORIAL_DECK_P0, TUTORIAL_DECK_P1 } = await import('./tutorial/tutorial-deck.js');

    this.adapter = new TutorialAdapter();
    this.tutorialOverlay = new TutorialOverlay();
    this.tutorialJump = jumpToMainPhase;

    const baseState = initGameState(TUTORIAL_DECK_P0, TUTORIAL_DECK_P1);
    this.adapter.init(baseState);
    this.adapter.setLocalPlayer(0);
    this.adapter.onStateUpdate((s) => this.onStateUpdate(s));
    this.adapter.onError((msg) => this._tutorialError(msg));

    this.tutorialOverlay.mount();
    this.tutorialOverlay.setCallbacks({
      onSkipLesson: () => this._skipTutorialLesson(),
      onExit: () => this._exitTutorial(),
    });
    this.adapter.setScriptCallbacks({
      onStepAdvance: ({ step }) => {
        if (step?.successToast) this.tutorialOverlay.toast(step.successToast);
        this._refreshTutorialPrompt();
      },
      onLessonComplete: ({ lesson }) => this._onLessonComplete(lesson),
      onActionBlocked: ({ hint }) => this.tutorialOverlay.showHint(hint),
    });

    this._loadTutorialLesson(lessonIndex);
  }

  async _loadTutorialLesson(index) {
    const lesson = this.tutorialLessons[index];
    if (!lesson) return;
    this.adapter.setLessonIndex(index);

    const { TUTORIAL_DECK_P0, TUTORIAL_DECK_P1 } = await import('./tutorial/tutorial-deck.js');
    const base = initGameState(TUTORIAL_DECK_P0, TUTORIAL_DECK_P1);
    this.tutorialJump(base, lesson.startConfig);
    if (typeof lesson.postSetup === 'function') {
      lesson.postSetup(base);
    }
    this.adapter.init(base);
    this.renderBoard();
    this._refreshTutorialPrompt();
  }

  _refreshTutorialPrompt() {
    if (!this.tutorialOverlay) return;
    const lesson = this.adapter.getCurrentLesson?.();
    const step = this.adapter.getCurrentStep?.();
    if (!lesson || !step) return;
    this.tutorialOverlay.showStep(lesson, step, this.adapter.getStepIndex(), lesson.steps.length);
    this._applyTutorialHighlight(step.highlightSelector);
  }

  _applyTutorialHighlight(selector) {
    document.querySelectorAll('.tutorial-highlight-pulse').forEach(el => el.classList.remove('tutorial-highlight-pulse'));
    if (!selector) return;
    // Delay so DOM is rendered after renderBoard
    setTimeout(() => {
      document.querySelectorAll(selector).forEach(el => el.classList.add('tutorial-highlight-pulse'));
    }, 50);
  }

  _onLessonComplete(lesson) {
    this.tutorialOverlay.showLessonCompleteModal(
      lesson,
      () => {
        // Next lesson
        const nextIndex = this.adapter.getLessonIndex() + 1;
        if (nextIndex < this.tutorialLessons.length) {
          this._loadTutorialLesson(nextIndex);
        } else {
          this.tutorialOverlay.showVictoryModal(() => this._exitTutorial());
        }
      },
      () => this._exitTutorial()
    );
  }

  _skipTutorialLesson() {
    const idx = this.adapter.getLessonIndex();
    if (idx + 1 >= this.tutorialLessons.length) {
      this.tutorialOverlay.showVictoryModal(() => this._exitTutorial());
    } else {
      this._loadTutorialLesson(idx + 1);
    }
  }

  _exitTutorial() {
    if (this.tutorialOverlay) {
      this.tutorialOverlay.unmount();
      this.tutorialOverlay = null;
    }
    document.querySelectorAll('.tutorial-highlight-pulse').forEach(el => el.classList.remove('tutorial-highlight-pulse'));
    // Return to mode selection
    location.reload();
  }

  _tutorialError(msg) {
    // In tutorial mode, show inline toast instead of red error toast
    if (this.tutorialOverlay) {
      this.tutorialOverlay.showHint(msg);
    } else {
      this.showError(msg);
    }
  }

  showLobby() {
    this.container.innerHTML = `
      <div class="lobby-screen">
        <div class="lobby-title">線上對戰</div>
        <div class="lobby-actions">
          <button class="lobby-btn" id="lobbyCreate">建立房間</button>
        </div>
        <div style="display:flex;gap:.5rem;align-items:center">
          <input class="lobby-input" id="lobbyCodeInput" maxlength="4" placeholder="房間碼">
          <button class="lobby-btn" id="lobbyJoin">加入</button>
        </div>
        <div class="lobby-status" id="lobbyStatus"></div>
      </div>
    `;

    const statusEl = document.getElementById('lobbyStatus');
    const showStatus = (msg, waiting) => {
      statusEl.textContent = msg;
      statusEl.className = 'lobby-status' + (waiting ? ' lobby-waiting' : '');
    };

    const wsUrl = `ws://${location.hostname}:3000`;

    document.getElementById('lobbyCreate').addEventListener('click', async () => {
      const { WebSocketAdapter } = await import('./net/WebSocketAdapter.js');
      this.adapter = new WebSocketAdapter();
      try {
        await this.adapter.connect(wsUrl);
        this.adapter.setMessageHandler(msg => this._handleServerMessage(msg));
        this.adapter.joinRoom(null);
        showStatus('建立房間中...', true);
      } catch (e) {
        showStatus('連線失敗，請確認 server 是否啟動 (npm run server)', false);
      }
    });

    document.getElementById('lobbyJoin').addEventListener('click', async () => {
      const code = document.getElementById('lobbyCodeInput').value.trim();
      if (!code || code.length !== 4) return showStatus('請輸入 4 碼房間碼', false);
      const { WebSocketAdapter } = await import('./net/WebSocketAdapter.js');
      this.adapter = new WebSocketAdapter();
      try {
        await this.adapter.connect(wsUrl);
        this.adapter.setMessageHandler(msg => this._handleServerMessage(msg));
        this.adapter.joinRoom(code);
        showStatus('加入房間中...', true);
      } catch (e) {
        showStatus('連線失敗', false);
      }
    });
  }

  _handleServerMessage(msg) {
    switch (msg.type) {
      case 'ROOM_CREATED':
        this.container.innerHTML = `
          <div class="lobby-screen">
            <div class="lobby-title">等待對手加入</div>
            <div class="lobby-room-code">${msg.roomCode}</div>
            <div class="lobby-status lobby-waiting">將此房間碼告訴對手</div>
          </div>
        `;
        break;

      case 'ROOM_JOINED':
      case 'OPPONENT_JOINED':
        // Both players connected → show deck select
        this._showOnlineDeckSelect();
        break;

      case 'DECK_CONFIRMED':
        this.container.querySelector('.lobby-status')?.remove();
        const waitDiv = document.createElement('div');
        waitDiv.className = 'lobby-status lobby-waiting';
        waitDiv.textContent = '等待對手選擇牌組...';
        this.container.appendChild(waitDiv);
        break;

      case 'OPPONENT_DECK_READY':
        // Just informational
        break;

      case 'MULLIGAN_PROMPT':
        this._showOnlineMulligan(msg);
        break;

      case 'MULLIGAN_DONE':
        this.container.innerHTML = `<div class="lobby-screen"><div class="lobby-status lobby-waiting">等待對手完成重抽...</div></div>`;
        break;

      case 'SETUP_PROMPT':
        this._showOnlineSetup(msg);
        break;

      case 'STATE_UPDATE':
        // Main game state update from server
        this.adapter.init(msg.state);
        this.adapter.setLocalPlayer(this.adapter.getLocalPlayer());
        if (msg.state.phase && msg.state.phase !== 'setup') {
          this.renderBoard();
        }
        break;

      case 'EFFECT_PROMPT':
        // Server asks us to resolve a pending effect
        this.adapter.init({ ...this.adapter.getState(), pendingEffect: msg.prompt });
        this.renderBoard();
        break;

      case 'WAIT':
        this.showHint(msg.message);
        break;

      case 'ERROR':
        this.showError(msg.message);
        break;

      case 'OPPONENT_DISCONNECTED':
        this.showHint('對手已斷線，等待重連 (30秒)...');
        break;

      case 'OPPONENT_RECONNECTED':
        this.showHint('對手已重連');
        break;

      case 'CONNECTION_CLOSED':
        this.showHint('與伺服器連線中斷');
        break;
    }
  }

  _showOnlineDeckSelect() {
    renderDeckSelect(this.container, this.adapter.getLocalPlayer(), (deckConfig) => {
      this.adapter.selectDeck(deckConfig);
      this.container.innerHTML = `<div class="lobby-screen"><div class="lobby-status lobby-waiting">等待對手選擇牌組...</div></div>`;
    }, null);
  }

  _showOnlineMulligan(msg) {
    // Reuse the existing mulligan UI but with server-provided hand data
    // We need to reconstruct a temporary state for the UI
    const s = this.adapter.getState() || { players: [{zones:{}},{zones:{}}], log: [] };
    // Server sends hand card IDs - reconstruct for UI
    const p = this.adapter.getLocalPlayer();
    if (s.players[p]) {
      s.players[p].zones[ZONE.HAND] = msg.hand;
    }
    this.adapter.init(s);

    const hasDebut = msg.hasDebut;
    const ms = { count: msg.mulliganCount, maxHand: msg.maxHand };
    const hand = msg.hand;
    const needReturnCount = Math.max(0, hand.length - ms.maxHand);
    const isOverLimit = needReturnCount > 0;

    this.container.innerHTML = `
      <div class="mulligan-screen">
        <h2>重抽階段 ${ms.count === 0 ? '— 初始手牌' : `— 重抽 #${ms.count + 1}`}</h2>
        <div class="mulligan-info">
          <span>重抽次數: ${ms.count}</span><span>手牌上限: ${ms.maxHand}</span>
          ${isOverLimit ? `<span class="mulligan-warning">需要放回 ${needReturnCount} 張</span>` : ''}
        </div>
        ${!hasDebut ? '<p class="mulligan-warning">手牌中沒有 Debut 成員，必須重抽！</p>' : ''}
        <div class="mulligan-hand">
          ${hand.map((c, i) => {
            const card = getCard(c.cardId);
            const isD = card && isMember(card.type) && (card.bloom === 'Debut' || card.bloom === 'Spot');
            return `<div class="mulligan-card ${isD ? 'mulligan-debut' : ''}" data-index="${i}">
              <img src="${getCardImage(c.cardId)}" alt="${card?.name || ''}">
              <div class="mulligan-card-name">${card?.name || ''}</div>
              ${isD ? '<div class="mulligan-badge">Debut</div>' : ''}
            </div>`;
          }).join('')}
        </div>
        <div class="mulligan-actions">
          ${hasDebut && !isOverLimit ? '<button class="action-btn action-primary mulligan-btn" id="mulliganKeep">確認手牌</button>' : ''}
          ${hasDebut && isOverLimit ? `<p class="mulligan-select-hint">請點選 ${needReturnCount} 張牌放回牌組底部</p>` : ''}
          ${!isOverLimit ? '<button class="action-btn mulligan-btn" id="mulliganRedraw">重新抽牌</button>' : ''}
        </div>
      </div>
    `;

    const selectedToReturn = new Set();

    if (isOverLimit && hasDebut) {
      this.container.querySelectorAll('.mulligan-card').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.dataset.index);
          if (selectedToReturn.has(idx)) { selectedToReturn.delete(idx); el.classList.remove('mulligan-selected-return'); }
          else if (selectedToReturn.size < needReturnCount) { selectedToReturn.add(idx); el.classList.add('mulligan-selected-return'); }
          if (selectedToReturn.size === needReturnCount) {
            let btn = this.container.querySelector('#mulliganReturnConfirm');
            if (!btn) {
              btn = document.createElement('button');
              btn.id = 'mulliganReturnConfirm';
              btn.className = 'action-btn action-primary mulligan-btn';
              btn.textContent = `確認放回 ${needReturnCount} 張`;
              this.container.querySelector('.mulligan-actions').appendChild(btn);
              btn.addEventListener('click', () => {
                this.adapter.sendMulliganDecision({ keep: true, returnIndices: [...selectedToReturn] });
              });
            }
          } else {
            this.container.querySelector('#mulliganReturnConfirm')?.remove();
          }
        });
      });
    }

    document.getElementById('mulliganKeep')?.addEventListener('click', () => {
      this.adapter.sendMulliganDecision({ keep: true });
    });
    document.getElementById('mulliganRedraw')?.addEventListener('click', () => {
      this.adapter.sendMulliganDecision({ keep: false });
    });
  }

  _showOnlineSetup(msg) {
    const hand = msg.hand;
    const eligible = msg.eligibleIndices;

    this.container.innerHTML = `
      <div class="setup-screen">
        <h2>選擇中心成員</h2>
        <p>從手牌中選擇 1 張 Debut 或 Spot 成員放到中心位置</p>
        <div class="setup-hand">
          ${hand.map((c, i) => {
            const card = getCard(c.cardId);
            const ok = eligible.includes(i);
            return `<div class="setup-card ${ok ? 'setup-eligible' : 'setup-ineligible'}" data-index="${i}">
              <img src="${getCardImage(c.cardId)}" alt="${card?.name || ''}">
              <div class="setup-card-name">${card?.name || ''}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;

    this.container.querySelectorAll('.setup-eligible').forEach(el => {
      el.addEventListener('click', () => {
        this.adapter.sendSetupCenter(parseInt(el.dataset.index));
        this.container.innerHTML = `<div class="lobby-screen"><div class="lobby-status lobby-waiting">等待對手選擇中心成員...</div></div>`;
      });
    });
  }

  showDeckSelect(playerNum) {
    this.selectingPlayer = playerNum;
    const onBack = playerNum === 1 ? () => this.showDeckSelect(0) : null;
    renderDeckSelect(this.container, playerNum, (deckConfig) => {
      this.decks[playerNum] = deckConfig;
      if (playerNum === 0) {
        this.showDeckSelect(1);
      } else {
        this.startGame();
      }
    }, onBack);
  }

  startGame() {
    const state = initGameState(this.decks[0], this.decks[1]);

    this.mulliganState = [
      { count: 0, maxHand: INITIAL_HAND_SIZE, done: false },
      { count: 0, maxHand: INITIAL_HAND_SIZE, done: false },
    ];

    this.adapter.init(state);
    this.adapter.onStateUpdate((newState) => this.onStateUpdate(newState));
    this.adapter.onError((msg) => this.showError(msg));

    // Draw initial hands and start mulligan for P1
    this._drawInitialHand(0);
    this._drawInitialHand(1);
    this.adapter.setLocalPlayer(0);
    this.showMulligan(0);
  }

  _drawInitialHand(playerNum) {
    const state = this.adapter.getState();
    const player = state.players[playerNum];
    const baseTime = Date.now();
    // Draw 7 cards with staggered animation timing
    for (let i = 0; i < INITIAL_HAND_SIZE; i++) {
      if (player.zones[ZONE.DECK].length > 0) {
        const card = player.zones[ZONE.DECK].shift();
        card.faceDown = false;
        card._drawnAt = baseTime + i * 80; // stagger by 80ms each
        player.zones[ZONE.HAND].push(card);
      }
    }
    this.adapter.init(state);
  }

  _handHasDebut(playerNum) {
    const state = this.adapter.getState();
    const hand = state.players[playerNum].zones[ZONE.HAND];
    return hand.some(c => {
      const card = getCard(c.cardId);
      return card && isMember(card.type) && (card.bloom === 'Debut' || card.bloom === 'Spot');
    });
  }

  _mulliganReshuffle(playerNum) {
    const state = this.adapter.getState();
    const player = state.players[playerNum];
    const ms = this.mulliganState[playerNum];

    // Put all hand cards back to deck
    while (player.zones[ZONE.HAND].length > 0) {
      player.zones[ZONE.DECK].push(player.zones[ZONE.HAND].pop());
    }
    shuffle(player.zones[ZONE.DECK]);

    ms.count++;
    // Per rules: 2nd redraw = draw 7 keep 6, 3rd = draw 7 keep 5, etc.
    // count=1: first redraw (free, keep 7)
    // count=2: second redraw (draw 7, keep 6)
    // count=3: third redraw (draw 7, keep 5)
    if (ms.count >= 2) {
      ms.maxHand = INITIAL_HAND_SIZE - (ms.count - 1);
    }

    // Check if hand size would be 0 → auto-lose
    if (ms.maxHand <= 0) {
      state.winner = 1 - playerNum;
      state.phase = PHASE.GAME_OVER;
      state.log.push({ turn: 0, player: playerNum, msg: `P${playerNum + 1} 重抽次數過多，手牌歸零，判負！`, ts: Date.now() });
      this.adapter.init(state);
      this.renderBoard();
      return false;
    }

    // Draw 7 cards
    for (let i = 0; i < INITIAL_HAND_SIZE; i++) {
      if (player.zones[ZONE.DECK].length > 0) {
        const card = player.zones[ZONE.DECK].shift();
        card.faceDown = false;
        player.zones[ZONE.HAND].push(card);
      }
    }

    state.log.push({ turn: 0, player: playerNum, msg: `P${playerNum + 1} 第${ms.count + 1}次抽牌（手牌上限 ${ms.maxHand} 張）`, ts: Date.now() });
    this.adapter.init(state);
    return true;
  }

  showMulligan(playerNum) {
    const state = this.adapter.getState();
    const player = state.players[playerNum];
    const hand = player.zones[ZONE.HAND];
    const ms = this.mulliganState[playerNum];
    const hasDebut = this._handHasDebut(playerNum);

    // From 2nd mulligan, if no Debut → must show hand to opponent and auto-redraw
    if (ms.count >= 1 && !hasDebut) {
      this.container.innerHTML = `
        <div class="mulligan-screen">
          <h2>Player ${playerNum + 1} - 重抽 #${ms.count + 1}</h2>
          <p class="mulligan-warning">手牌中沒有 Debut 成員！必須公開手牌後重抽。</p>
          <div class="mulligan-hand">
            ${hand.map(c => {
              const card = getCard(c.cardId);
              return `<div class="mulligan-card">
                <img src="${getCardImage(c.cardId)}" alt="${card?.name || ''}">
                <div class="mulligan-card-name">${card?.name || ''}</div>
              </div>`;
            }).join('')}
          </div>
          <button class="action-btn action-primary mulligan-btn" id="mulliganForceRedraw">
            確認公開，重新抽牌
          </button>
        </div>
      `;
      document.getElementById('mulliganForceRedraw')?.addEventListener('click', () => {
        if (this._mulliganReshuffle(playerNum)) {
          this.showMulligan(playerNum);
        }
      });
      return;
    }

    // Normal mulligan screen: show hand, choose keep or redraw
    const needReturnCount = Math.max(0, hand.length - ms.maxHand);
    const isOverLimit = needReturnCount > 0;

    this.container.innerHTML = `
      <div class="mulligan-screen">
        <h2>Player ${playerNum + 1} - ${ms.count === 0 ? '初始手牌' : `重抽 #${ms.count + 1}`}</h2>
        <div class="mulligan-info">
          <span>重抽次數: ${ms.count}</span>
          <span>手牌上限: ${ms.maxHand}</span>
          ${isOverLimit ? `<span class="mulligan-warning">需要放回 ${needReturnCount} 張到牌組底部</span>` : ''}
        </div>
        ${!hasDebut ? `<p class="mulligan-warning">手牌中沒有 Debut 成員，必須重抽！</p>` : ''}
        <div class="mulligan-hand">
          ${hand.map((c, i) => {
            const card = getCard(c.cardId);
            const isDebutOrSpot = card && isMember(card.type) && (card.bloom === 'Debut' || card.bloom === 'Spot');
            return `<div class="mulligan-card ${isDebutOrSpot ? 'mulligan-debut' : ''}" data-index="${i}" data-instance-id="${c.instanceId}">
              <img src="${getCardImage(c.cardId)}" alt="${card?.name || ''}">
              <div class="mulligan-card-name">${card?.name || ''}</div>
              <div class="mulligan-card-meta">${card?.bloom || card?.type || ''}</div>
              ${isDebutOrSpot ? '<div class="mulligan-badge">Debut</div>' : ''}
            </div>`;
          }).join('')}
        </div>
        <div class="mulligan-actions">
          ${hasDebut && !isOverLimit ? `
            <button class="action-btn action-primary mulligan-btn" id="mulliganKeep">
              確認手牌，開始遊戲
            </button>
          ` : ''}
          ${hasDebut && isOverLimit ? `
            <p class="mulligan-select-hint">請點選 ${needReturnCount} 張牌放回牌組底部</p>
          ` : ''}
          ${!isOverLimit ? `
            <button class="action-btn mulligan-btn" id="mulliganRedraw">
              重新抽牌 (第${ms.count + 2}次)
            </button>
          ` : ''}
        </div>
      </div>
    `;

    // Selected cards to return (for hand size reduction)
    const selectedToReturn = new Set();

    if (isOverLimit && hasDebut) {
      this.container.querySelectorAll('.mulligan-card').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.dataset.index);
          if (selectedToReturn.has(idx)) {
            selectedToReturn.delete(idx);
            el.classList.remove('mulligan-selected-return');
          } else if (selectedToReturn.size < needReturnCount) {
            selectedToReturn.add(idx);
            el.classList.add('mulligan-selected-return');
          }

          // Check if enough cards selected to proceed
          if (selectedToReturn.size === needReturnCount) {
            // Show confirm button
            let confirmBtn = this.container.querySelector('#mulliganReturnConfirm');
            if (!confirmBtn) {
              const actionsDiv = this.container.querySelector('.mulligan-actions');
              const btn = document.createElement('button');
              btn.id = 'mulliganReturnConfirm';
              btn.className = 'action-btn action-primary mulligan-btn';
              btn.textContent = `確認放回 ${needReturnCount} 張`;
              actionsDiv.appendChild(btn);
              btn.addEventListener('click', () => {
                this._returnCardsFromHand(playerNum, selectedToReturn);
                this._finishMulligan(playerNum);
              });
            }
          } else {
            this.container.querySelector('#mulliganReturnConfirm')?.remove();
          }
        });
      });
    }

    // Keep hand
    document.getElementById('mulliganKeep')?.addEventListener('click', () => {
      this._finishMulligan(playerNum);
    });

    // Redraw
    document.getElementById('mulliganRedraw')?.addEventListener('click', () => {
      if (this._mulliganReshuffle(playerNum)) {
        this.showMulligan(playerNum);
      }
    });
  }

  _returnCardsFromHand(playerNum, indicesToReturn) {
    const state = this.adapter.getState();
    const player = state.players[playerNum];
    // Sort indices descending to splice safely
    const sorted = [...indicesToReturn].sort((a, b) => b - a);
    for (const idx of sorted) {
      const card = player.zones[ZONE.HAND].splice(idx, 1)[0];
      if (card) {
        player.zones[ZONE.DECK].push(card); // Goes to bottom
      }
    }
    state.log.push({ turn: 0, player: playerNum, msg: `P${playerNum + 1} 放回 ${sorted.length} 張牌到牌組底部`, ts: Date.now() });
    this.adapter.init(state);
  }

  _finishMulligan(playerNum) {
    this.mulliganState[playerNum].done = true;

    if (playerNum === 0) {
      // Show transition to P2 mulligan
      this.showTurnTransition(1, () => this.showMulligan(1));
    } else {
      // Both players done, go to center selection
      this.adapter.setLocalPlayer(0);
      this.showTurnTransition(0, () => this.showSetupPhase(0));
    }
  }

  showSetupPhase(playerNum) {
    const state = this.adapter.getState();
    const player = state.players[playerNum];
    const hand = player.zones[ZONE.HAND];

    // Find Debut/Spot members in hand
    const eligibleIndices = [];
    hand.forEach((c, i) => {
      const card = getCard(c.cardId);
      if (card && isMember(card.type) && (card.bloom === 'Debut' || card.bloom === 'Spot')) {
        eligibleIndices.push(i);
      }
    });

    this.container.innerHTML = `
      <div class="setup-screen">
        <h2>Player ${playerNum + 1} - 選擇中心成員</h2>
        <p>從手牌中選擇 1 張 Debut 或 Spot 成員放到中心位置</p>
        <div class="setup-hand">
          ${hand.map((c, i) => {
            const card = getCard(c.cardId);
            const eligible = eligibleIndices.includes(i);
            const img = getCardImage(c.cardId);
            return `
              <div class="setup-card ${eligible ? 'setup-eligible' : 'setup-ineligible'}"
                   data-index="${i}" ${eligible ? '' : 'disabled'}>
                <img src="${img}" alt="${card?.name || ''}">
                <div class="setup-card-name">${card?.name || ''}</div>
                <div class="setup-card-meta">${card?.bloom || card?.type || ''}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    this.container.querySelectorAll('.setup-eligible').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index);
        const newState = cloneState(state);
        const p = newState.players[playerNum];
        const member = p.zones[ZONE.HAND].splice(idx, 1)[0];
        member.faceDown = false;
        p.zones[ZONE.CENTER] = member;

        // Also allow placing additional Debut/Spot to backstage
        // For simplicity, auto-place remaining eligible members
        const remaining = [];
        for (let i = p.zones[ZONE.HAND].length - 1; i >= 0; i--) {
          const c = getCard(p.zones[ZONE.HAND][i].cardId);
          if (c && isMember(c.type) && (c.bloom === 'Debut' || c.bloom === 'Spot')) {
            const m = p.zones[ZONE.HAND].splice(i, 1)[0];
            m.faceDown = false;
            remaining.push(m);
          }
        }
        // Put remaining on backstage
        p.zones[ZONE.BACKSTAGE].push(...remaining);

        newState.log.push({ turn: 0, player: playerNum, msg: `P${playerNum + 1} 選擇 ${getCard(member.cardId)?.name} 為中心成員`, ts: Date.now() });

        this.adapter.init(newState);

        if (playerNum === 0) {
          this.showTurnTransition(1, () => this.showSetupPhase(1));
        } else {
          // Both players ready, start game
          const s = this.adapter.getState();
          // Randomly decide who goes first
          const fp = Math.random() < 0.5 ? 0 : 1;
          s.activePlayer = fp;
          s.firstPlayer = fp;
          s.phase = PHASE.RESET;
          s.log.push({ turn: 0, player: -1, msg: `P${fp + 1} 先攻！`, ts: Date.now() });
          this.adapter.init(s);
          this.adapter.setLocalPlayer(s.activePlayer);
          this.renderBoard();
        }
      });
    });
  }

  showTurnTransition(nextPlayer, callback) {
    this.container.innerHTML = `
      <div class="turn-transition">
        <div class="transition-content">
          <h2>Player ${nextPlayer + 1} 的回合</h2>
          <p>請交給 Player ${nextPlayer + 1}，然後點擊繼續</p>
          <button class="action-btn action-primary transition-btn">繼續</button>
        </div>
      </div>
    `;
    this.container.querySelector('.transition-btn').addEventListener('click', () => {
      this.adapter.setLocalPlayer(nextPlayer);
      callback();
    });
  }

  renderBoard() {
    const state = this.adapter.getState();
    // Hide the attack arrow on every render unless we're still in target-pick.
    // The arrow's listener references DOM nodes that are about to be replaced,
    // so cleaning up here avoids stale handlers + dangling rendering.
    try {
      if (this.interactionMode !== 'select_art_target') hideAttackArrow();
    } catch (_e) { /* defensive */ }
    // Online: localPlayer is fixed (0 or 1), set by server
    // Local: localPlayer follows activePlayer (same screen, switch perspective)
    const localPlayer = this.mode === 'online'
      ? this.adapter.getLocalPlayer()
      : state.activePlayer;
    if (this.mode === 'local') this.adapter.setLocalPlayer(localPlayer);

    this.container.innerHTML = renderGameBoard(state, localPlayer);
    this.bindBoardEvents();
    this._ensureMuteButton();

    // Session 2: detect freshly drawn hand cards (within 900ms window) and
    // fire a single 'draw' sound for the batch. Track seen instance ids so
    // multiple renders during the draw window don't re-play.
    const nowDraw = Date.now();
    if (!this._drawSeenIds) this._drawSeenIds = new Set();
    let firedDrawSfx = false;
    for (const pl of state.players) {
      for (const c of (pl.zones[ZONE.HAND] || [])) {
        if (!c?._drawnAt) continue;
        if ((nowDraw - c._drawnAt) > 900) continue;
        if (this._drawSeenIds.has(c.instanceId)) continue;
        this._drawSeenIds.add(c.instanceId);
        if (!firedDrawSfx) {
          try { playSound('draw'); } catch (_e) {}
          firedDrawSfx = true;
        }
      }
    }
    if (this._drawSeenIds.size > 200) {
      this._drawSeenIds = new Set([...this._drawSeenIds].slice(-100));
    }

    // Mark placement/bloom animations as shown so they don't replay,
    // and fire Session 2 entrance puff for fresh placements.
    for (const p of state.players) {
      const members = [p.zones['center'], p.zones['collab'], ...(p.zones['backstage'] || [])].filter(Boolean);
      for (const m of members) {
        if (m.placedThisTurn && !m._animShown) {
          // Wait one frame so the card DOM exists, then puff at it
          requestAnimationFrame(() => {
            const memberEl = this.container.querySelector(`[data-instance-id="${m.instanceId}"]`);
            this._animateEntrancePuff(memberEl);
          });
          try { playSound('place'); } catch (_e) {}
        }
        if (m.placedThisTurn) m._animShown = true;
        if (m.bloomedThisTurn) m._bloomAnimShown = true;
      }
    }

    // Show opponent's latest action as a toast (online mode or when not our turn)
    const lastLog = state.log[state.log.length - 1];
    if (lastLog && state.activePlayer !== localPlayer && (Date.now() - lastLog.ts) < 2000) {
      this._showActionToast(lastLog.msg);
    }

    // Check for dice results in recent log entries and show dice UI
    const recentLogs = state.log.slice(-3);
    for (const entry of recentLogs) {
      const diceMatch = entry.msg?.match(/骰\s*(\d)/);
      if (diceMatch && (Date.now() - entry.ts) < 2000) {
        this.showDiceRoll(parseInt(diceMatch[1]), entry.msg);
        break;
      }
    }

    // Session 1 VFX: surface fresh "[效果]" handler results as floating toasts
    // near the active player's center so the player sees what just fired
    // without scanning the log.
    const toastNow = Date.now();
    if (!this._toastSeenIds) this._toastSeenIds = new Set();
    for (const entry of recentLogs) {
      const msg = entry.msg || '';
      if (!msg.startsWith('  [效果] ')) continue;
      // Stable id from ts + msg so we toast once per logged effect
      const eid = `${entry.ts}|${msg}`;
      if (this._toastSeenIds.has(eid)) continue;
      if ((toastNow - entry.ts) > 2000) continue;
      this._toastSeenIds.add(eid);
      const text = msg.replace('  [效果] ', '').slice(0, 80);
      // Anchor: prefer active player's center card, fall back to top of screen
      const activeP = state.activePlayer;
      const ownerSel = activeP === localPlayer ? '.player-self' : '.player-opp';
      const anchor =
        this.container.querySelector(`${ownerSel} .center-slot .game-card`) ||
        this.container.querySelector(`${ownerSel} .collab-slot .game-card`) ||
        this.container;
      try { showEffectToast(text, anchor, inferTone(text)); }
      catch (_e) { /* defensive — never break render on toast failure */ }
    }
    // Trim seen-set so it doesn't grow unbounded
    if (this._toastSeenIds.size > 200) {
      this._toastSeenIds = new Set([...this._toastSeenIds].slice(-100));
    }

    // Check for attack / damage / knockdown in recent logs — trigger cinematic animations
    // Session 2: also fire matching sound effects via Web Audio synth.
    if (!this._sfxSeenIds) this._sfxSeenIds = new Set();
    for (const entry of recentLogs) {
      const sid = `${entry.ts}|${entry.msg?.slice(0, 40)}`;
      if (entry.msg?.includes('使用') && entry.msg?.match(/使用 (.+?)！/) && (Date.now() - entry.ts) < 1500) {
        const artName = entry.msg.match(/使用 (.+?)！/)?.[1];
        this._animateArtAttack(artName);
        if (!this._sfxSeenIds.has(sid)) { this._sfxSeenIds.add(sid); playSound('attack'); }
      }
      const dmgMatch = entry.msg?.match(/造成 (\d+) 傷害/);
      if (dmgMatch && (Date.now() - entry.ts) < 2000) {
        const amount = parseInt(dmgMatch[1]);
        const knockMatch = entry.msg.match(/對 (.+?) 造成/);
        const targetName = knockMatch?.[1] || '';
        this._showFloatingDamage(amount, targetName, localPlayer);
        this._animateHitShake(targetName);
        if (!this._sfxSeenIds.has(sid)) {
          this._sfxSeenIds.add(sid);
          playSound(amount >= 80 ? 'crit' : 'click');
        }
        break;
      }
      if (entry.msg?.includes('被擊倒') && (Date.now() - entry.ts) < 2000) {
        this._showKnockdownFlash();
        const koMatch = entry.msg.match(/(.+?) 被擊倒/);
        this._animateKnockdown(koMatch?.[1] || '');
        if (!this._sfxSeenIds.has(sid)) { this._sfxSeenIds.add(sid); playSound('knockdown'); }
        break;
      }
      if (entry.msg?.includes('推し技能') && (Date.now() - entry.ts) < 1500) {
        this._animateOshiBurst();
        if (!this._sfxSeenIds.has(sid)) { this._sfxSeenIds.add(sid); playSound('oshi'); }
      }
      if (entry.msg?.includes('聯動') && !entry.msg?.includes('聯動位置') && (Date.now() - entry.ts) < 1500) {
        this._animateCollab();
        if (!this._sfxSeenIds.has(sid)) { this._sfxSeenIds.add(sid); playSound('collab'); }
      }
      const bloomMatch = entry.msg?.match(/綻放為 (.+?) \(/);
      if (bloomMatch && (Date.now() - entry.ts) < 1500) {
        this._animateBloom(bloomMatch[1]);
        if (!this._sfxSeenIds.has(sid)) { this._sfxSeenIds.add(sid); playSound('bloom'); }
      }
    }
    // Trim sfx-seen to keep memory bounded
    if (this._sfxSeenIds.size > 200) {
      this._sfxSeenIds = new Set([...this._sfxSeenIds].slice(-100));
    }

    // Check for pending effect prompts after every render
    if (state.pendingEffect && state.pendingEffect.type === 'MANUAL_EFFECT') {
      // Auto-clear manual effects — no popup needed, effect text is in the log
      const s = this.adapter.getState();
      s.pendingEffect = null;
      this.adapter.init(s);
      return; // re-render will happen naturally
    } else if (state.pendingEffect && state.pendingEffect.type === 'LIFE_CHEER') {
      this.showHint(`P${state.pendingEffect.player + 1} 選擇成員接收生命吶喊卡`);
    } else if (state.pendingEffect && (
      state.pendingEffect.type === 'SEARCH_SELECT_PLACE' ||
      state.pendingEffect.type === 'SEARCH_SELECT' ||
      state.pendingEffect.type === 'SELECT_TARGET' ||
      state.pendingEffect.type === 'SELECT_OWN_MEMBER' ||
      state.pendingEffect.type === 'CHOOSE_DECK_POSITION' ||
      state.pendingEffect.type === 'CHEER_ASSIGN' ||
      state.pendingEffect.type === 'CHEER_FROM_ARCHIVE' ||
      state.pendingEffect.type === 'SELECT_FROM_ARCHIVE' ||
      state.pendingEffect.type === 'CHEER_MOVE' ||
      state.pendingEffect.type === 'ORDER_TO_BOTTOM'
    )) {
      if (state.pendingEffect.type === 'ORDER_TO_BOTTOM') {
        this._handleOrderToBottom(state.pendingEffect);
      } else {
        this._handleSearchSelectPlace(state.pendingEffect);
      }
    }
  }

  bindBoardEvents() {
    const state = this.adapter.getState();
    const p = state.activePlayer;

    // Action panel buttons
    this.container.querySelectorAll('.action-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const actionType = btn.dataset.action;
        this.handleActionButton(actionType, btn.dataset);
      });
    });

    // Log toggle button
    const logBtn = this.container.querySelector('#logToggleBtn');
    const logPopup = this.container.querySelector('#logPopup');
    if (logBtn && logPopup) {
      logBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        logPopup.hidden = !logPopup.hidden;
      });
      // Close on outside click
      document.addEventListener('click', (e) => {
        if (!logPopup.hidden && !logPopup.contains(e.target) && e.target !== logBtn) {
          logPopup.hidden = true;
        }
      }, { once: true });
    }

    // Card clicks on board (for cheer assign, targeting, etc.)
    this.container.querySelectorAll('.game-card[data-instance-id]').forEach(el => {
      el.addEventListener('click', () => {
        const instanceId = parseInt(el.dataset.instanceId);
        this.handleCardClick(instanceId);
      });
    });

    // Hand card clicks + drag
    this.container.querySelectorAll('.hand-card-wrap[data-hand-index]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.handIndex);
        this.handleHandCardClick(idx);
      });

      // Drag-and-drop: make hand cards draggable during Main phase.
      //
      // 2026-04-29: Activity/item support cards are now played by dragging
      // UP from the hand by ≥ DRAG_PLAY_THRESHOLD pixels. No special play
      // zone needed — the upward distance itself is the play gesture. If
      // the user drops onto a member/zone, attach/place still works as
      // before.
      if (state.phase === PHASE.MAIN && state.activePlayer === p) {
        el.setAttribute('draggable', 'true');
        // Per-handler tracking: drag start coords + whether the
        // distance threshold has been reached (for visual feedback).
        let _dragStartY = 0;
        let _dragHandIndex = -1;
        let _dragIsPlayable = false;  // true for activity/item support
        let _dragOverThreshold = false;
        const DRAG_PLAY_THRESHOLD = 110;  // px upward from hand-card start

        // Global pointer tracker (browsers don't put coords on `dragend`
        // reliably across vendors). We attach a `dragover` on document that
        // updates a class on the dragged card based on cursor offset.
        const _onDocDragOver = (ev) => {
          if (!_dragIsPlayable || _dragHandIndex < 0) return;
          const dy = _dragStartY - ev.clientY;
          const past = dy >= DRAG_PLAY_THRESHOLD;
          if (past !== _dragOverThreshold) {
            _dragOverThreshold = past;
            el.classList.toggle('drag-play-armed', past);
          }
        };

        el.addEventListener('dragstart', (e) => {
          const idx = parseInt(el.dataset.handIndex);
          const inst = state.players[p].zones[ZONE.HAND][idx];
          const cd = inst ? getCard(inst.cardId) : null;
          e.dataTransfer.setData('text/plain', JSON.stringify({ handIndex: idx }));
          e.dataTransfer.effectAllowed = 'move';
          el.classList.add('dragging');

          _dragStartY = e.clientY;
          _dragHandIndex = idx;
          _dragOverThreshold = false;
          _dragIsPlayable = !!(cd && isSupport(cd.type)
            && cd.type !== '支援・吉祥物'
            && cd.type !== '支援・道具'
            && cd.type !== '支援・粉絲');

          // Highlight valid drop zones (still useful for attachable supports
          // and member placement).
          this.container.querySelectorAll('.zone-backstage, .zone-center, .zone-collab')
            .forEach(z => z.classList.add('drop-hint'));

          // If activity/item support, attach the global cursor tracker so we
          // can visually indicate when the threshold is crossed.
          if (_dragIsPlayable) {
            document.addEventListener('dragover', _onDocDragOver);
          }
        });

        el.addEventListener('dragend', (e) => {
          el.classList.remove('dragging', 'drag-play-armed');
          this.container.querySelectorAll('.drop-hint, .drop-hover')
            .forEach(z => z.classList.remove('drop-hint', 'drop-hover'));
          document.removeEventListener('dragover', _onDocDragOver);

          // If this was a playable support and we ended sufficiently above
          // the start point, fire PLAY_SUPPORT. Use the LAST tracked dy
          // since `e.clientY` on dragend can be 0 in some browsers.
          if (_dragIsPlayable && _dragHandIndex >= 0) {
            // Prefer the live event's clientY if non-zero, else trust the
            // last threshold flag set by _onDocDragOver.
            const finalY = e.clientY || 0;
            const liveDy = finalY ? (_dragStartY - finalY) : 0;
            const passed = (finalY > 0)
              ? (liveDy >= DRAG_PLAY_THRESHOLD)
              : _dragOverThreshold;
            if (passed) {
              this.adapter.sendAction({ type: ACTION.PLAY_SUPPORT, handIndex: _dragHandIndex });
              this.interactionMode = null;
              this.renderBoard();
            }
          }

          _dragHandIndex = -1;
          _dragIsPlayable = false;
          _dragOverThreshold = false;
        });

        // Touch swipe-up (mobile): same threshold so the gesture parity
        // matches desktop drag-up.
        let touchStartY = 0;
        el.addEventListener('touchstart', (e) => {
          touchStartY = e.touches[0].clientY;
        }, { passive: true });
        el.addEventListener('touchend', (e) => {
          const dy = touchStartY - e.changedTouches[0].clientY;
          if (dy > DRAG_PLAY_THRESHOLD) {
            const idx = parseInt(el.dataset.handIndex);
            const inst = state.players[p].zones[ZONE.HAND][idx];
            const cd = inst ? getCard(inst.cardId) : null;
            if (cd && isSupport(cd.type)
                && cd.type !== '支援・吉祥物'
                && cd.type !== '支援・道具'
                && cd.type !== '支援・粉絲') {
              this.adapter.sendAction({ type: ACTION.PLAY_SUPPORT, handIndex: idx });
              this.interactionMode = null;
              this.renderBoard();
            }
          }
        }, { passive: true });
      }

      // Hover preview (Session 2: 0.4s delay + cursor-anchored position)
      el.addEventListener('mouseenter', (e) => {
        const instanceId = parseInt(el.dataset.instanceId);
        const hand = state.players[p].zones[ZONE.HAND];
        const inst = hand.find(c => c.instanceId === instanceId);
        if (!inst) return;
        if (this._previewTimer) clearTimeout(this._previewTimer);
        const startX = e.clientX, startY = e.clientY;
        this._previewTimer = setTimeout(() => {
          this._showCardPreview(inst.cardId, startX, startY);
        }, 400);
      });
      el.addEventListener('mouseleave', () => {
        if (this._previewTimer) { clearTimeout(this._previewTimer); this._previewTimer = null; }
        this._hideCardPreview();
      });
    });

    // Drop zones for drag-and-drop from hand
    if (state.phase === PHASE.MAIN && state.activePlayer === p) {
      this.container.querySelectorAll('.zone-backstage, .zone-center, .zone-collab').forEach(zone => {
        zone.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; zone.classList.add('drop-hover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('drop-hover'));
        zone.addEventListener('drop', (e) => {
          e.preventDefault();
          zone.classList.remove('drop-hover');
          this.container.querySelectorAll('.drop-hint').forEach(z => z.classList.remove('drop-hint'));
          try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            if (data.type === 'collab' && zone.classList.contains('zone-collab')) {
              this.adapter.sendAction({ type: ACTION.COLLAB, backstageIndex: data.backstageIndex });
              this.interactionMode = null;
              this.renderBoard();
            } else if (data.handIndex != null) {
              this._handleDrop(data.handIndex, zone, state);
            }
          } catch(err) { /* ignore invalid drag data */ }
        });
      });

      // Also allow drop on individual stage cards (for bloom targeting) — local player's field only
      this.container.querySelectorAll('.local-field .game-card[data-instance-id]').forEach(card => {
        card.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; card.classList.add('drop-hover'); });
        card.addEventListener('dragleave', () => card.classList.remove('drop-hover'));
        card.addEventListener('drop', (e) => {
          e.preventDefault(); e.stopPropagation();
          card.classList.remove('drop-hover');
          this.container.querySelectorAll('.drop-hint').forEach(z => z.classList.remove('drop-hint'));
          try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            const targetInstanceId = parseInt(card.dataset.instanceId);
            this._handleDropOnCard(data.handIndex, targetInstanceId, state);
          } catch(err) {}
        });
      });

      // Make backstage members draggable for collab
      const backstage = state.players[p].zones[ZONE.BACKSTAGE];
      this.container.querySelectorAll('.local-field .backstage-slot .game-card[data-instance-id]').forEach(el => {
        const instId = parseInt(el.dataset.instanceId);
        const bIdx = backstage.findIndex(c => c.instanceId === instId);
        if (bIdx < 0) return;
        const member = backstage[bIdx];
        // Only active members can collab (not rested)
        if (member.state === 'rest') return;
        // Can only collab if collab zone is empty and haven't used collab this turn
        if (state.players[p].zones[ZONE.COLLAB] || state.players[p].usedCollab) return;

        const wrapper = el.closest('.backstage-slot') || el;
        wrapper.setAttribute('draggable', 'true');
        wrapper.style.cursor = 'grab';
        wrapper.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', JSON.stringify({ backstageIndex: bIdx, type: 'collab' }));
          e.dataTransfer.effectAllowed = 'move';
          wrapper.classList.add('dragging');
          this.container.querySelectorAll('.zone-collab').forEach(z => z.classList.add('drop-hint'));
        });
        wrapper.addEventListener('dragend', () => {
          wrapper.classList.remove('dragging');
          this.container.querySelectorAll('.drop-hint, .drop-hover').forEach(z => z.classList.remove('drop-hint', 'drop-hover'));
        });
      });
    }

    // Board card hover preview (Session 2: same delay + cursor-anchor as hand)
    this.container.querySelectorAll('.game-card[data-card-id], .oshi-pos-card[data-card-id], .attached-support-card[data-card-id], .attached-cheer-card[data-card-id]').forEach(el => {
      el.addEventListener('mouseenter', (e) => {
        const cardId = el.dataset.cardId;
        if (!cardId) return;
        if (this._previewTimer) clearTimeout(this._previewTimer);
        const startX = e.clientX, startY = e.clientY;
        this._previewTimer = setTimeout(() => {
          this._showCardPreview(cardId, startX, startY);
        }, 400);
      });
      el.addEventListener('mouseleave', () => {
        if (this._previewTimer) { clearTimeout(this._previewTimer); this._previewTimer = null; }
        this._hideCardPreview();
      });
    });
  }

  // Session 2: cursor-anchored hover preview helpers
  _showCardPreview(cardId, x, y) {
    const preview = document.getElementById('cardPreview');
    if (!preview || !cardId) return;
    preview.innerHTML = renderCardPreview(cardId);
    preview.hidden = false;
    // Position: prefer right of cursor; flip to left if would overflow viewport
    const rect = preview.getBoundingClientRect();
    const margin = 16;
    let left = x + 24;
    let top = y - rect.height / 2;
    if (left + rect.width > window.innerWidth - margin) {
      left = x - rect.width - 24;
    }
    if (top < margin) top = margin;
    if (top + rect.height > window.innerHeight - margin) {
      top = window.innerHeight - rect.height - margin;
    }
    preview.style.left = `${Math.max(margin, left)}px`;
    preview.style.top = `${top}px`;
  }
  _hideCardPreview() {
    const preview = document.getElementById('cardPreview');
    if (preview) preview.hidden = true;
  }

  handleActionButton(actionType, dataset) {
    const state = this.adapter.getState();
    const p = state.activePlayer;

    switch (actionType) {
      case ACTION.ADVANCE_PHASE:
        this.adapter.sendAction({ type: ACTION.ADVANCE_PHASE });
        this.renderBoard();
        break;

      case ACTION.END_MAIN_PHASE:
        this.adapter.sendAction({ type: ACTION.END_MAIN_PHASE });
        this.renderBoard();
        break;

      case ACTION.END_PERFORMANCE:
        this.adapter.sendAction({ type: ACTION.END_PERFORMANCE });
        // Check if game over
        const newState = this.adapter.getState();
        if (newState.phase === PHASE.GAME_OVER) {
          this.renderBoard();
        } else {
          // Turn transition for local play
          this.showTurnTransition(newState.activePlayer, () => {
            // Auto-advance through reset and draw
            this.adapter.sendAction({ type: ACTION.ADVANCE_PHASE }); // Reset
            this.adapter.sendAction({ type: ACTION.ADVANCE_PHASE }); // Draw
            this.adapter.sendAction({ type: ACTION.ADVANCE_PHASE }); // Cheer
            this.renderBoard();
          });
        }
        break;

      case 'PLACE_MEMBER':
        this.interactionMode = 'select_hand_member';
        this.showHint('選擇手牌中的 Debut/Spot 成員');
        break;

      case 'BLOOM':
        this.interactionMode = 'select_hand_bloom';
        this.showHint('選擇手牌中要綻放的成員卡');
        break;

      case 'PLAY_SUPPORT':
        this.interactionMode = 'select_hand_support';
        this.showHint('選擇手牌中的支援卡');
        break;

      case 'COLLAB':
        this.interactionMode = 'select_collab_target';
        this.showHint('選擇後台成員進行聯動');
        break;

      case 'BATON_PASS':
        this.interactionMode = 'select_baton_target';
        this.showHint('選擇後台成員進行交棒');
        break;

      case 'USE_OSHI_SKILL':
        this.adapter.sendAction({ type: ACTION.USE_OSHI_SKILL, skillType: dataset.skill });
        this.renderBoard();
        break;

      case 'USE_ART': {
        const position = dataset.position;
        const artIndex = parseInt(dataset.art);
        const artState = this.adapter.getState();
        const artPlayer = artState.players[artState.activePlayer];
        const artMember = artPlayer.zones[position === 'center' ? 'center' : 'collab'];
        const artCard = artMember ? getCard(artMember.cardId) : null;
        const artKey = artIndex === 0 ? 'art1' : 'art2';
        const artEffect = artCard?.[artKey]?.effect;
        const artEffectText = typeof artEffect === 'object' ? (artEffect?.['zh-TW'] || '') : (artEffect || '');

        // Auto-target center if art restricts to center only, or if opponent has no collab
        const artOpp = artState.players[1 - artState.activePlayer];
        const centerOnly = artEffectText.includes('只能') && artEffectText.includes('中心成員');
        if (centerOnly || !artOpp.zones['collab']) {
          if (artOpp.zones['center']) {
            this.adapter.sendAction({ type: ACTION.USE_ART, position, artIndex, targetPosition: 'center' });
            this.renderBoard();
          }
        } else {
          this.pendingAction = { type: ACTION.USE_ART, position, artIndex };
          this.interactionMode = 'select_art_target';
          this.showHint('選擇對手的中心或聯動成員作為目標');
          // Show attack arrow from attacker → cursor
          try {
            const attackerEl =
              this.container.querySelector(`.player-self .${position}-slot .game-card`) ||
              this.container.querySelector(`.${position}-slot .game-card`);
            if (attackerEl) showAttackArrow(attackerEl);
          } catch (_e) { /* defensive */ }
        }
        break;
      }

      case 'MANUAL_ADJUST':
        this.showManualAdjustPanel();
        break;

      case 'NEW_GAME':
        this.decks = [null, null];
        this.showDeckSelect(0);
        break;
    }
  }

  handleHandCardClick(handIndex) {
    const state = this.adapter.getState();
    const card = state.players[state.activePlayer].zones[ZONE.HAND][handIndex];
    if (!card) return;
    const cardData = getCard(card.cardId);

    // Session 2 UX: if no interaction mode set yet, infer from card type.
    // Click a support card → auto-enter PLAY_SUPPORT flow; click a Debut/Spot
    // member with empty stage slots → auto-enter PLACE_MEMBER. Lets the user
    // play cards without going through the action panel button first.
    if (!this.interactionMode && state.phase === PHASE.MAIN && state.activePlayer === this.adapter.getLocalPlayer()) {
      if (cardData && isSupport(cardData.type)) {
        this.interactionMode = 'select_hand_support';
      } else if (cardData && isMember(cardData.type) &&
                 (cardData.bloom === 'Debut' || cardData.bloom === 'Spot')) {
        this.interactionMode = 'select_hand_member';
      }
    }

    if (this.interactionMode === 'select_hand_member') {
      if (cardData && isMember(cardData.type) && (cardData.bloom === 'Debut' || cardData.bloom === 'Spot')) {
        this.adapter.sendAction({ type: ACTION.PLACE_MEMBER, handIndex });
        this.interactionMode = null;
        this.renderBoard();
      }
    } else if (this.interactionMode === 'select_hand_bloom') {
      // First select the hand card, then show target selection panel
      this.pendingAction = { type: ACTION.BLOOM, handIndex };
      this.interactionMode = 'select_bloom_target';

      // Find valid targets on field (same name, lower bloom level)
      const player = state.players[state.activePlayer];
      const targets = [];
      const zones = [
        { zone: player.zones[ZONE.CENTER], label: '中央' },
        { zone: player.zones[ZONE.COLLAB], label: '聯動' },
      ];
      player.zones[ZONE.BACKSTAGE].forEach((m, i) => zones.push({ zone: m, label: `後台${i + 1}` }));

      for (const z of zones) {
        if (!z.zone) continue;
        const tc = getCard(z.zone.cardId);
        if (tc && tc.name === cardData.name) {
          targets.push({ instanceId: z.zone.instanceId, name: tc.name, bloom: tc.bloom, label: z.label });
        }
      }

      if (targets.length === 0) {
        this.showError(`場上沒有可以綻放的 ${cardData.name}`);
        this.pendingAction = null;
        this.interactionMode = null;
      } else {
        this._showTargetSelectModal(
          `選擇要綻放的 ${cardData.name}（${cardData.bloom}）`,
          targets.map(t => ({
            label: `${t.label}: ${t.name} (${t.bloom})`,
            instanceId: t.instanceId,
          })),
          (instanceId) => {
            this.adapter.sendAction({ ...this.pendingAction, targetInstanceId: instanceId });
            this.pendingAction = null;
            this.interactionMode = null;
            this.renderBoard();
          },
          () => {
            this.pendingAction = null;
            this.interactionMode = null;
          }
        );
      }
    } else if (this.interactionMode === 'select_hand_support') {
      const supportType = cardData?.type || '';
      const isAttachable = supportType === '支援・吉祥物' || supportType === '支援・道具' || supportType === '支援・粉絲';
      if (isAttachable) {
        // Need to pick target member
        this.pendingAction = { type: ACTION.PLAY_SUPPORT, handIndex };
        this.interactionMode = 'select_support_target';
        this.showHint('選擇要裝備的成員');
      } else {
        // Activity/item: use directly (no target needed)
        this.adapter.sendAction({ type: ACTION.PLAY_SUPPORT, handIndex });
        this.interactionMode = null;
        this.renderBoard();
      }
    }
  }

  handleCardClick(instanceId) {
    const state = this.adapter.getState();
    const p = state.activePlayer;

    if (state.phase === PHASE.CHEER) {
      // Cheer assign
      this.adapter.sendAction({ type: ACTION.CHEER_ASSIGN, targetInstanceId: instanceId });
      this.renderBoard();
      return;
    }

    if (this.interactionMode === 'select_bloom_target' && this.pendingAction) {
      this.adapter.sendAction({ ...this.pendingAction, targetInstanceId: instanceId });
      this.pendingAction = null;
      this.interactionMode = null;
      this.renderBoard();
      return;
    }

    if (this.interactionMode === 'select_collab_target') {
      const backstage = state.players[p].zones[ZONE.BACKSTAGE];
      const idx = backstage.findIndex(c => c.instanceId === instanceId);
      if (idx !== -1) {
        this.adapter.sendAction({ type: ACTION.COLLAB, backstageIndex: idx });
        this.interactionMode = null;
        this.renderBoard();
      }
      return;
    }

    if (this.interactionMode === 'select_baton_target') {
      const backstage = state.players[p].zones[ZONE.BACKSTAGE];
      const idx = backstage.findIndex(c => c.instanceId === instanceId);
      if (idx !== -1) {
        this.adapter.sendAction({ type: ACTION.BATON_PASS, backstageIndex: idx });
        this.interactionMode = null;
        this.renderBoard();
      }
      return;
    }

    if (this.interactionMode === 'select_support_target' && this.pendingAction) {
      // Check if clicked card is own member on stage
      const myMembers = [state.players[p].zones[ZONE.CENTER], state.players[p].zones[ZONE.COLLAB], ...state.players[p].zones[ZONE.BACKSTAGE]].filter(Boolean);
      const targetMember = myMembers.find(m => m.instanceId === instanceId);
      if (targetMember) {
        this.adapter.sendAction({ ...this.pendingAction, targetInstanceId: instanceId });
        this.pendingAction = null;
        this.interactionMode = null;
        this.renderBoard();
      }
      return;
    }

    if (this.interactionMode === 'select_art_target' && this.pendingAction) {
      // Determine target position from the opponent's field
      const opponent = state.players[1 - p];
      let targetPosition = null;
      if (opponent.zones[ZONE.CENTER]?.instanceId === instanceId) targetPosition = 'center';
      if (opponent.zones[ZONE.COLLAB]?.instanceId === instanceId) targetPosition = 'collab';

      if (targetPosition) {
        try { hideAttackArrow(); } catch (_e) {}
        this.adapter.sendAction({ ...this.pendingAction, targetPosition });
        this.pendingAction = null;
        this.interactionMode = null;
        this.renderBoard();
      }
      return;
    }

    // Handle pending life cheer (supports Buzz life -2 with multiple cheers)
    if (state.pendingEffect?.type === 'LIFE_CHEER') {
      const affectedPlayer = state.players[state.pendingEffect.player];
      const target = [
        affectedPlayer.zones[ZONE.CENTER],
        affectedPlayer.zones[ZONE.COLLAB],
        ...affectedPlayer.zones[ZONE.BACKSTAGE]
      ].find(m => m?.instanceId === instanceId);

      if (target) {
        const newState = cloneState(state);
        const np = newState.players[newState.pendingEffect.player];
        const t = [np.zones[ZONE.CENTER], np.zones[ZONE.COLLAB], ...np.zones[ZONE.BACKSTAGE]]
          .find(m => m?.instanceId === instanceId);
        if (t) {
          const idx = newState.pendingEffect.currentIndex;
          const cheers = newState.pendingEffect.cheerInstances;
          t.attachedCheer.push(cheers[idx]);
          if (idx + 1 >= cheers.length) {
            newState.pendingEffect = null;
          } else {
            newState.pendingEffect.currentIndex = idx + 1;
          }
          this.adapter.init(newState);
          this.renderBoard();
        }
      }
    }
  }

  showHint(text) {
    const hint = this.container.querySelector('.action-hint') || document.createElement('div');
    hint.className = 'action-hint-float';
    hint.textContent = text;
    if (!hint.parentElement) {
      this.container.querySelector('.game-container')?.appendChild(hint);
    }
    // Auto-remove after 3s
    setTimeout(() => hint.remove(), 3000);
  }

  showError(msg) {
    const el = document.createElement('div');
    el.className = 'game-error-toast';
    el.textContent = msg;
    this.container.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  _showTargetSelectModal(title, options, onSelect, onCancel) {
    const overlay = document.createElement('div');
    overlay.className = 'target-select-overlay';
    overlay.innerHTML = `
      <div class="target-select-modal">
        <div class="target-select-title">${title}</div>
        <div class="target-select-options">
          ${options.map((o, i) => `
            <button class="target-select-btn" data-idx="${i}">${o.label}</button>
          `).join('')}
        </div>
        <button class="target-select-cancel">取消</button>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('.target-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        overlay.remove();
        onSelect(options[idx].instanceId);
      });
    });
    overlay.querySelector('.target-select-cancel').addEventListener('click', () => {
      overlay.remove();
      onCancel?.();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); onCancel?.(); }
    });
  }

  _handleSearchSelectPlace(prompt) {
    const cards = prompt.cards || [];
    const targets = prompt.targets || [];
    const action = prompt.afterAction || prompt.type;

    // No cards and no targets — just clear and continue
    if (cards.length === 0 && targets.length === 0) {
      this._clearPendingAndShuffle(prompt.player);
      return;
    }

    // Build items to display (cards from deck, or target members)
    const items = cards.length > 0 ? cards : targets.map(id => {
      const s = this.adapter.getState();
      const allZones = [...(s.players[prompt.player]?.zones?.backstage || []),
        s.players[prompt.player]?.zones?.center, s.players[prompt.player]?.zones?.collab,
        ...(s.players[1 - prompt.player]?.zones?.backstage || []),
        s.players[1 - prompt.player]?.zones?.center, s.players[1 - prompt.player]?.zones?.collab,
      ].filter(Boolean);
      const inst = allZones.find(m => m.instanceId === id);
      const card = inst ? getCard(inst.cardId) : null;
      return { instanceId: id, cardId: inst?.cardId, name: card?.name || '', image: inst ? getCardImage(inst.cardId) : '' };
    });

    // Remove any existing overlay to prevent duplicates
    document.querySelectorAll('.target-select-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'target-select-overlay';
    overlay.innerHTML = `
      <div class="search-select-modal">
        <div class="search-select-title">${prompt.message || '選擇一張卡片'}</div>
        <div class="search-select-cards">
          ${items.map((c, i) => `
            <div class="search-select-card" data-idx="${i}">
              <img src="${c.image || getCardImage(c.cardId)}" alt="${c.name || ''}">
              <div class="search-select-name">${c.name || c.cardId || ''}</div>
            </div>
          `).join('')}
        </div>
        <button class="target-select-cancel">跳過（不選擇）</button>
      </div>
    `;
    document.body.appendChild(overlay);

    let resolved = false;
    overlay.querySelectorAll('.search-select-card').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (resolved) return;
        resolved = true;
        // Immediately disable all cards visually and functionally
        overlay.querySelectorAll('.search-select-card').forEach(c => {
          c.style.pointerEvents = 'none';
          c.style.opacity = '0.5';
        });
        el.style.opacity = '1';
        el.style.outline = '3px solid #4fc3f7';
        const idx = parseInt(el.dataset.idx);
        const selected = items[idx];
        // Short delay for visual feedback, then resolve
        setTimeout(() => {
          overlay.remove();
          this._resolveSearchSelect(prompt, selected);
        }, 150);
      });
    });

    const closeModal = () => {
      overlay.remove();
      // If there are remaining cards to order to bottom, chain to that instead of clearing
      if (prompt.remainingCards && prompt.remainingCards.length > 0) {
        const s = this.adapter.getState();
        s.pendingEffect = {
          type: 'ORDER_TO_BOTTOM',
          player: prompt.player,
          message: '選擇放回牌組下方的順序（先點=最底）',
          cards: prompt.remainingCards,
        };
        this.adapter.init(s);
        this.renderBoard();
      } else {
        this._clearPendingAndShuffle(prompt.player);
      }
    };
    overlay.querySelector('.target-select-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  }

  _resolveSearchSelect(prompt, selected) {
    if (this.mode === 'online') {
      // Send selection to server; server will resolve and send STATE_UPDATE
      this.adapter.sendEffectResponse(selected);
      return;
    }
    // Local mode: resolve directly
    const s = this.adapter.getState();
    resolveEffectChoice(s, prompt, selected);
    this.adapter.init(s);
    this.renderBoard();
  }

  // ── Drag-and-Drop handlers ──

  _handleDrop(handIndex, zoneEl, state) {
    const player = state.players[state.activePlayer];
    const card = player.zones[ZONE.HAND][handIndex];
    if (!card) return;
    const cardData = getCard(card.cardId);
    if (!cardData) return;

    const isBackstage = zoneEl.classList.contains('zone-backstage');
    const isCenter = zoneEl.classList.contains('zone-center');

    // Place Debut/Spot member
    if (isMember(cardData.type) && (cardData.bloom === 'Debut' || cardData.bloom === 'Spot')) {
      if (isBackstage || (isCenter && !player.zones[ZONE.CENTER])) {
        this.adapter.sendAction({ type: ACTION.PLACE_MEMBER, handIndex });
        this.interactionMode = null;
        this.renderBoard();
        return;
      }
    }

    // Support card dropped on zone (not on a specific member) → use as activity/item
    if (isSupport(cardData.type)) {
      const supportType = cardData.type;
      const isAttachable = supportType === '支援・吉祥物' || supportType === '支援・道具' || supportType === '支援・粉絲';
      if (!isAttachable) {
        this.adapter.sendAction({ type: ACTION.PLAY_SUPPORT, handIndex });
        this.interactionMode = null;
        this.renderBoard();
      }
      // Attachable support dropped on zone (not on member) → ignore, need to drop on member
      return;
    }
  }

  _handleDropOnCard(handIndex, targetInstanceId, state) {
    const player = state.players[state.activePlayer];
    const card = player.zones[ZONE.HAND][handIndex];
    if (!card) return;
    const cardData = getCard(card.cardId);
    if (!cardData) return;

    // Bloom: drop a higher-level member on a matching stage member
    if (isMember(cardData.type) && cardData.bloom !== 'Debut' && cardData.bloom !== 'Spot') {
      const targetCard = [player.zones[ZONE.CENTER], player.zones[ZONE.COLLAB], ...player.zones[ZONE.BACKSTAGE]]
        .filter(Boolean).find(m => m.instanceId === targetInstanceId);
      if (targetCard) {
        const tc = getCard(targetCard.cardId);
        if (tc && tc.name === cardData.name) {
          this.adapter.sendAction({ type: ACTION.BLOOM, handIndex, targetInstanceId });
          this.interactionMode = null;
          this.renderBoard();
          return;
        }
      }
    }

    // Support card dropped on a member → attach
    if (isSupport(cardData.type)) {
      const isAttachable = cardData.type === '支援・吉祥物' || cardData.type === '支援・道具' || cardData.type === '支援・粉絲';
      if (isAttachable) {
        this.adapter.sendAction({ type: ACTION.PLAY_SUPPORT, handIndex, targetInstanceId });
        this.interactionMode = null;
        this.renderBoard();
        return;
      }
    }

    // Place Debut/Spot (dropped on an empty-ish area)
    if (isMember(cardData.type) && (cardData.bloom === 'Debut' || cardData.bloom === 'Spot')) {
      this.adapter.sendAction({ type: ACTION.PLACE_MEMBER, handIndex });
      this.interactionMode = null;
      this.renderBoard();
      return;
    }
  }

  _handleOrderToBottom(prompt) {
    const cards = prompt.cards || [];
    if (cards.length === 0) {
      this._clearPendingAndShuffle(prompt.player);
      return;
    }
    // If only 1 card, auto-place it
    if (cards.length === 1) {
      try {
        const anchor = this.container.querySelector('.player-self .zone-center .game-card') || this.container;
        showEffectToast(`1 張牌已放回牌組底部`, anchor, 'neutral');
      } catch (_e) {}
      this._resolveOrderToBottom(prompt, cards.map(c => c.instanceId));
      return;
    }

    document.querySelectorAll('.target-select-overlay').forEach(el => el.remove());
    const overlay = document.createElement('div');
    overlay.className = 'target-select-overlay';
    const ordered = [];

    const renderCards = () => {
      const remaining = cards.filter(c => !ordered.includes(c.instanceId));
      const orderedCards = ordered.map(id => cards.find(c => c.instanceId === id));
      overlay.innerHTML = `
        <div class="search-select-modal order-bottom-modal">
          <div class="search-select-title">${prompt.message || '選擇放回牌組下方的順序'}</div>
          <div class="order-bottom-hint">點選卡片決定順序（先點的放最下面）</div>
          <div class="search-select-cards">
            ${remaining.map(c => `
              <div class="search-select-card order-remaining" data-id="${c.instanceId}">
                <img src="${c.image || getCardImage(c.cardId)}" alt="${c.name || ''}">
                <div class="search-select-name">${c.name || ''}</div>
              </div>
            `).join('')}
          </div>
          ${orderedCards.length > 0 ? `
            <div class="order-bottom-label">放回順序（上=最底）</div>
            <div class="order-bottom-list">
              ${orderedCards.map((c, i) => `
                <div class="order-bottom-item">${i + 1}. ${c.name || c.cardId}</div>
              `).join('')}
            </div>
          ` : ''}
          ${ordered.length > 0 ? '<button class="action-btn order-bottom-undo">取消上一個</button>' : ''}
        </div>
      `;

      overlay.querySelectorAll('.order-remaining').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          ordered.push(parseInt(el.dataset.id));
          if (ordered.length === cards.length) {
            overlay.remove();
            this._resolveOrderToBottom(prompt, ordered);
          } else {
            renderCards();
          }
        });
      });

      overlay.querySelector('.order-bottom-undo')?.addEventListener('click', (e) => {
        e.stopPropagation();
        ordered.pop();
        renderCards();
      });
    };

    document.body.appendChild(overlay);
    renderCards();
  }

  _resolveOrderToBottom(prompt, orderedIds) {
    if (this.mode === 'online') {
      this.adapter.sendEffectResponse({ orderedIds });
      return;
    }
    const s = this.adapter.getState();
    const player = s.players[prompt.player];
    // Remove these cards from deck and push to bottom in order
    for (const id of orderedIds) {
      const idx = player.zones[ZONE.DECK].findIndex(c => c.instanceId === id);
      if (idx >= 0) {
        const card = player.zones[ZONE.DECK].splice(idx, 1)[0];
        player.zones[ZONE.DECK].push(card); // push = bottom
      }
    }
    s.pendingEffect = null;
    s.log.push({ turn: s.turnNumber, player: prompt.player, msg: `${orderedIds.length} 張牌放回牌組下方`, ts: Date.now() });
    this.adapter.init(s);
    this.renderBoard();
  }

  // Removed 2026-04-29: _showPlayZone / _removePlayZone (special "drop here
  // to use support" overlay). Replaced by drag-up-distance detection in
  // bindBoardEvents — activity/item supports now activate by dragging the
  // hand card upward by ≥ 110 px. See `_dragHandIndex` / `_dragOverThreshold`.

  _showActionToast(msg) {
    if (!msg) return;
    document.querySelectorAll('.action-toast').forEach(el => el.remove());
    const toast = document.createElement('div');
    toast.className = 'action-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  _showKnockdownFlash() {
    const flash = document.createElement('div');
    flash.className = 'knockdown-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 600);
  }

  _findCardByName(name, scope) {
    if (!name) return null;
    const root = scope === 'opponent' ? this.container.querySelector('.opponent-field')
                : scope === 'local' ? this.container.querySelector('.local-field')
                : this.container;
    if (!root) return null;
    const cards = root.querySelectorAll('.game-card[data-card-id]');
    for (const el of cards) {
      const c = getCard(el.dataset.cardId);
      if (c && c.name === name) return el;
    }
    return null;
  }

  async _getFx() {
    if (!this._fx) {
      const [effects, beam] = await Promise.all([
        import('./fx/effects.js'),
        import('./fx/beam.js'),
      ]);
      this._fx = { ...effects, ...beam };
    }
    return this._fx;
  }

  // Session 2: floating audio mute toggle. Renders once into <body> so it
  // survives renderBoard re-renders. Click flips the localStorage flag.
  _ensureMuteButton() {
    if (document.querySelector('.audio-mute-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'audio-mute-btn';
    const refresh = () => {
      const muted = isMuted();
      btn.textContent = muted ? '🔇' : '🔊';
      btn.classList.toggle('muted', muted);
      btn.title = muted ? '聲音：關閉（點擊開啟）' : '聲音：開啟（點擊關閉）';
    };
    btn.addEventListener('click', () => {
      setMuted(!isMuted());
      refresh();
      if (!isMuted()) playSound('click');
    });
    refresh();
    document.body.appendChild(btn);
  }

  // Session 2: derive attacker color so per-color palette tints the VFX.
  _attackerColor() {
    const state = this.adapter.getState();
    const me = state.players[state.activePlayer];
    const ctr = me?.zones[ZONE.CENTER];
    const cb = me?.zones[ZONE.COLLAB];
    // Prefer whichever is currently animating; default to center
    const card = (ctr && getCard(ctr.cardId)) || (cb && getCard(cb.cardId));
    return card?.color || null;
  }

  _animateArtAttack(artName) {
    // Find the attacker (local player's active center or collab using an art)
    const attackers = this.container.querySelectorAll('.local-field .zone-center .game-card, .local-field .zone-collab .game-card');
    attackers.forEach(el => {
      if (!el.classList.contains('card-art-attack')) {
        el.classList.add('card-art-attack');
        setTimeout(() => el.classList.remove('card-art-attack'), 600);
      }
    });
    // Pixi: ember charge-up at attacker, tinted by attacker color
    const myColor = this._attackerColor();
    this._getFx().then(fx => {
      const palette = fx.attackPaletteFor ? fx.attackPaletteFor(myColor) : null;
      const emberColor = palette?.ember || 0xffcc66;
      for (const el of attackers) {
        const r = el.getBoundingClientRect();
        fx.ember(r.left + r.width / 2, r.top + r.height / 2, { count: 10, color: emberColor, spread: 40, rise: 50 });
      }
    }).catch(() => {});
  }

  _animateHitShake(targetName) {
    const el = this._findCardByName(targetName, 'opponent');
    if (!el) return;
    el.classList.remove('card-hit-shake');
    void el.offsetWidth; // force reflow
    el.classList.add('card-hit-shake');
    setTimeout(() => el.classList.remove('card-hit-shake'), 550);

    // Pixi: attack beam from local attacker → target, tinted per attacker color
    const myColor = this._attackerColor();
    this._getFx().then(fx => {
      const palette = fx.attackPaletteFor ? fx.attackPaletteFor(myColor) : { beam: 0xffeeaa, trail: 0xff7733, impact: 0xffeeaa };
      const attackerEl = this.container.querySelector('.local-field .zone-center .game-card, .local-field .zone-collab .game-card');
      if (attackerEl) {
        fx.attackBeam(attackerEl, el, { color: palette.beam, trailColor: palette.trail, duration: 380 });
      } else {
        // Fallback: just impact at target
        const r = el.getBoundingClientRect();
        fx.impact(r.left + r.width / 2, r.top + r.height / 2, { color: palette.impact, size: 120 });
        fx.shockwave(r.left + r.width / 2, r.top + r.height / 2, { color: palette.trail, maxRadius: 180 });
      }
    }).catch(() => {});
  }

  // Session 2: ON_PLAY entrance puff — fired when a member is freshly placed
  // (placedThisTurn flips). Uses entrancePuff at the new member's center.
  _animateEntrancePuff(memberEl) {
    if (!memberEl) return;
    this._getFx().then(fx => {
      const r = memberEl.getBoundingClientRect();
      fx.entrancePuff(r.left + r.width / 2, r.top + r.height / 2);
    }).catch(() => {});
  }

  _animateKnockdown(targetName) {
    const el = this._findCardByName(targetName, 'opponent') || this._findCardByName(targetName, 'local');
    if (!el) return;
    el.classList.add('card-knockdown-anim');
    setTimeout(() => el.classList.remove('card-knockdown-anim'), 950);

    // Pixi: debris shatter after brief delay (let hit-shake play first)
    this._getFx().then(fx => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      setTimeout(() => {
        fx.shatter(cx, cy, { count: 22, color: 0xff4444, size: 160, duration: 900 });
        fx.flash(cx, cy, { color: 0xff6666, radius: 200, duration: 300 });
      }, 300);
    }).catch(() => {});
  }

  _animateOshiBurst() {
    const oshis = this.container.querySelectorAll('.local-field .oshi-pos-card, .local-field .zone-oshi-pos');
    oshis.forEach(el => {
      el.classList.remove('card-oshi-activate');
      void el.offsetWidth;
      el.classList.add('card-oshi-activate');
      setTimeout(() => el.classList.remove('card-oshi-activate'), 950);
    });
    // Pixi: bright flash + sparkle at oshi
    this._getFx().then(fx => {
      for (const el of oshis) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        fx.flash(cx, cy, { color: 0xffe066, radius: 260, duration: 400 });
        fx.sparkle(cx, cy, { count: 24, color: 0xffd84a, spread: 120, rise: 200, duration: 1400 });
      }
    }).catch(() => {});
  }

  _animateCollab() {
    const collab = this.container.querySelector('.local-field .zone-collab .game-card');
    if (!collab) return;
    collab.classList.remove('card-collab-move');
    void collab.offsetWidth;
    collab.classList.add('card-collab-move');
    setTimeout(() => collab.classList.remove('card-collab-move'), 550);

    // Pixi: cyan sparkle swirl
    this._getFx().then(fx => {
      const r = collab.getBoundingClientRect();
      fx.sparkle(r.left + r.width / 2, r.top + r.height / 2, { count: 18, color: 0x66ddff, spread: 90, rise: 140, duration: 1100 });
    }).catch(() => {});
  }

  _animateBloom(cardName) {
    // Gold sparkle burst on the bloomed card (center, collab, or backstage)
    const el = this._findCardByName(cardName, 'local') || this._findCardByName(cardName, 'opponent');
    if (!el) return;
    this._getFx().then(fx => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      fx.flash(cx, cy, { color: 0xffffff, radius: 180, duration: 350 });
      fx.sparkle(cx, cy, { count: 20, color: 0xffd84a, spread: 80, rise: 160, duration: 1200 });
    }).catch(() => {});
  }

  _showFloatingDamage(amount, targetName, localPlayer) {
    // Show floating damage number on the opponent's field
    const oppField = this.container.querySelector('.opponent-field');
    if (!oppField) return;

    // Try to find the specific card element
    let targetEl = null;
    if (targetName) {
      oppField.querySelectorAll('.game-card[data-card-id]').forEach(el => {
        const card = getCard(el.dataset.cardId);
        if (card && card.name === targetName) targetEl = el;
      });
    }
    // Fallback to center zone
    if (!targetEl) targetEl = oppField.querySelector('.zone-center') || oppField;

    const rect = targetEl.getBoundingClientRect();
    const floater = document.createElement('div');
    floater.className = 'floating-damage';
    floater.textContent = `-${amount}`;
    floater.style.left = `${rect.left + rect.width / 2}px`;
    floater.style.top = `${rect.top + rect.height / 3}px`;
    document.body.appendChild(floater);
    setTimeout(() => floater.remove(), 1200);
  }

  _clearPendingAndShuffle(playerIdx) {
    const s = this.adapter.getState();
    // Session 2 UX: surface a toast so silent auto-resolutions (e.g. hSD01-018
    // sub-PC with no LIMITED card in top 5, or 0/1 cards remaining) give the
    // player visible feedback instead of "nothing happened".
    try {
      const lastLog = s.log[s.log.length - 1];
      const txt = lastLog?.msg || '';
      const anchor = this.container.querySelector('.player-self .center-slot .game-card')
                  || this.container.querySelector('.player-self .zone-center .game-card')
                  || this.container;
      showEffectToast('效果結算（牌組已重新洗牌）', anchor, 'neutral');
    } catch (_e) { /* defensive */ }
    if (playerIdx != null) this._shuffleDeck(s.players[playerIdx]);
    s.pendingEffect = null;
    this.adapter.init(s);
    this.renderBoard();
  }

  _shuffleDeck(player) {
    const deck = player.zones['deck'];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  showDiceRoll(value, text = '') {
    const faces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    const overlay = document.createElement('div');
    overlay.className = 'dice-overlay';
    overlay.innerHTML = `
      <div class="dice-container">
        <div class="dice-face">${faces[value] || value}</div>
        ${text ? `<div class="dice-result-text">${text}</div>` : ''}
      </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 1500);
  }

  showManualAdjustPanel() {
    const state = this.adapter.getState();
    const p = state.activePlayer;
    showManualAdjustModal(state, p, (action) => {
      this.adapter.sendAction(action);
      // Re-open modal with fresh state
      this.showManualAdjustPanel();
    });
  }

  checkPendingEffects() {
    const state = this.adapter.getState();
    if (state.pendingEffect) {
      if (state.pendingEffect.type === 'MANUAL_EFFECT') {
        // Auto-clear — no popup
        const s = this.adapter.getState();
        s.pendingEffect = null;
        this.adapter.init(s);
        this.renderBoard();
      } else if (state.pendingEffect.type === 'LIFE_CHEER') {
        // Life cheer assignment — handled by card click in handleCardClick
        this.showHint(`P${state.pendingEffect.player + 1} 選擇成員接收生命吶喊卡`);
      }
    }
  }

  onStateUpdate(newState) {
    if (newState.phase === PHASE.GAME_OVER) {
      this.renderBoard();
      return;
    }
    this.renderBoard();
    this.checkPendingEffects();
  }
}
