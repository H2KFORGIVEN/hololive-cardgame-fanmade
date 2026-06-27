import { processAction } from '../core/GameEngine.js';

// Local hot-seat adapter: both players on same screen
export class LocalAdapter {
  constructor() {
    this._state = null;
    this._onStateUpdate = null;
    this._onError = null;
    this._localPlayer = 0;
  }

  init(initialState) {
    this._state = initialState;
  }

  sendAction(action) {
    const result = processAction(this._state, action);
    if (result.error) {
      this._onError?.(result.error);
      return;
    }
    this._state = result.state;
    this._onStateUpdate?.(this._state);
  }

  onStateUpdate(callback) {
    this._onStateUpdate = callback;
  }

  onError(callback) {
    this._onError = callback;
  }

  getState() {
    return this._state;
  }

  getLocalPlayer() {
    return this._localPlayer;
  }

  setLocalPlayer(p) {
    this._localPlayer = p;
  }
}
