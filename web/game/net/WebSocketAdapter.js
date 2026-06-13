// WebSocketAdapter: Network adapter for online multiplayer
// Same interface as LocalAdapter, but sends actions to server via WebSocket

export class WebSocketAdapter {
  constructor() {
    this._ws = null;
    this._state = null;
    this._localPlayer = 0;
    this._onStateUpdate = null;
    this._onError = null;
    this._onMessage = null;  // raw message handler for lobby/mulligan/setup
    this._connected = false;
    this._roomCode = null;
  }

  // ── Adapter interface (same as LocalAdapter) ──

  init(initialState) {
    this._state = initialState;
  }

  getState() {
    return this._state;
  }

  sendAction(action) {
    this._send({ type: 'GAME_ACTION', action });
  }

  onStateUpdate(callback) {
    this._onStateUpdate = callback;
  }

  onError(callback) {
    this._onError = callback;
  }

  getLocalPlayer() {
    return this._localPlayer;
  }

  setLocalPlayer(p) {
    this._localPlayer = p;
  }

  // ── Network methods ──

  connect(wsUrl) {
    return new Promise((resolve, reject) => {
      this._ws = new WebSocket(wsUrl);

      this._ws.onopen = () => {
        this._connected = true;
        resolve();
      };

      this._ws.onerror = (err) => {
        this._connected = false;
        reject(err);
      };

      this._ws.onclose = () => {
        this._connected = false;
        this._onMessage?.({ type: 'CONNECTION_CLOSED' });
      };

      this._ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleMessage(msg);
        } catch (e) {
          console.error('Invalid message from server:', e);
        }
      };
    });
  }

  joinRoom(roomCode) {
    this._send({ type: 'JOIN_ROOM', roomCode: roomCode || null });
  }

  selectDeck(deckConfig) {
    this._send({ type: 'SELECT_DECK', deckConfig });
  }

  sendMulliganDecision(decision) {
    // decision: { keep: bool, returnIndices?: number[] }
    this._send({ type: 'MULLIGAN_DECISION', ...decision });
  }

  sendSetupCenter(handIndex) {
    this._send({ type: 'SETUP_CENTER', handIndex });
  }

  sendEffectResponse(selection) {
    this._send({ type: 'EFFECT_RESPONSE', selection });
  }

  setMessageHandler(handler) {
    this._onMessage = handler;
  }

  disconnect() {
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
  }

  get connected() {
    return this._connected;
  }

  get roomCode() {
    return this._roomCode;
  }

  // ── Internal ──

  _send(data) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(data));
    }
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'ROOM_CREATED':
        this._roomCode = msg.roomCode;
        this._localPlayer = msg.playerIndex;
        break;

      case 'ROOM_JOINED':
        this._roomCode = msg.roomCode;
        this._localPlayer = msg.playerIndex;
        break;

      case 'STATE_UPDATE':
        this._state = msg.state;
        this._onStateUpdate?.(msg.state);
        break;

      case 'ERROR':
        this._onError?.(msg.message);
        break;
    }

    // Forward all messages to the raw handler (for lobby/mulligan/setup UI)
    this._onMessage?.(msg);
  }
}
