// TutorialAdapter: wraps LocalAdapter, gates sendAction against current tutorial step.
// Matches LocalAdapter's interface so GameController can use it transparently.

import { LocalAdapter } from '../net/LocalAdapter.js';
import { processAction } from '../core/GameEngine.js';
import { PHASE, ACTION } from '../core/constants.js';
import { matchAction, LESSONS, getLesson } from './TutorialScript.js';

export class TutorialAdapter {
  constructor() {
    this._inner = new LocalAdapter();
    this._onStateUpdate = null;
    this._onError = null;
    this._lessonIndex = 0;
    this._stepIndex = 0;
    this._errorCount = 0;
    this._onStepAdvance = null;
    this._onLessonComplete = null;
    this._onActionBlocked = null;
    this._allowAnyAction = false; // temporary bypass for opponent auto-turn
  }

  // ── LocalAdapter-compatible interface ──

  init(initialState) {
    this._inner.init(initialState);
  }

  onStateUpdate(callback) {
    this._onStateUpdate = callback;
    this._inner.onStateUpdate((state) => {
      this._onStateUpdate?.(state);
      // After each successful action, check if it's opponent's turn → auto-advance
      this._maybeAutoAdvanceOpponent();
    });
  }

  onError(callback) {
    this._onError = callback;
    this._inner.onError(callback);
  }

  getState() {
    return this._inner.getState();
  }

  getLocalPlayer() {
    return 0; // tutorial always player 0
  }

  setLocalPlayer(p) {
    this._inner.setLocalPlayer(p);
  }

  sendAction(action) {
    if (this._allowAnyAction) {
      return this._inner.sendAction(action);
    }

    const step = this.getCurrentStep();
    if (!step) {
      // No active step (between lessons) → allow through
      return this._inner.sendAction(action);
    }

    const state = this._inner.getState();
    const match = matchAction(step.expectedAction, action, state);
    if (!match) {
      this._errorCount++;
      this._onActionBlocked?.({
        hint: step.hint,
        errorCount: this._errorCount,
        step,
      });
      this._onError?.(step.hint || '這一步不是教學要做的動作');
      return;
    }

    // Matched: execute the action
    this._errorCount = 0;
    this._inner.sendAction(action);

    // Advance to next step
    this._advanceStep();
  }

  // ── Tutorial-specific API ──

  setScriptCallbacks({ onStepAdvance, onLessonComplete, onActionBlocked }) {
    this._onStepAdvance = onStepAdvance;
    this._onLessonComplete = onLessonComplete;
    this._onActionBlocked = onActionBlocked;
  }

  getCurrentLesson() {
    return LESSONS[this._lessonIndex] || null;
  }

  getCurrentStep() {
    const lesson = this.getCurrentLesson();
    return lesson?.steps?.[this._stepIndex] || null;
  }

  getLessonIndex() { return this._lessonIndex; }
  getStepIndex() { return this._stepIndex; }
  getTotalLessons() { return LESSONS.length; }

  setLessonIndex(idx) {
    this._lessonIndex = idx;
    this._stepIndex = 0;
    this._errorCount = 0;
  }

  _advanceStep() {
    const lesson = this.getCurrentLesson();
    if (!lesson) return;

    const step = lesson.steps[this._stepIndex];
    this._onStepAdvance?.({ lesson, step, justCompletedStepIndex: this._stepIndex });

    this._stepIndex++;
    if (this._stepIndex >= lesson.steps.length) {
      // Lesson complete
      this._onLessonComplete?.({ lesson, index: this._lessonIndex });
    }
  }

  // Advance opponent's turn automatically (minimal opponent AI).
  // If activePlayer is not the local player, run a small script to skip their turn.
  _maybeAutoAdvanceOpponent() {
    const state = this._inner.getState();
    if (!state) return;
    if (state.activePlayer === 0) return; // our turn, do nothing
    if (state.phase === PHASE.GAME_OVER) return;

    // Guard re-entrancy
    if (this._opponentAdvancing) return;
    this._opponentAdvancing = true;

    setTimeout(() => {
      try {
        this._runOpponentTurn();
      } finally {
        this._opponentAdvancing = false;
      }
    }, 600);
  }

  _runOpponentTurn() {
    this._allowAnyAction = true;
    try {
      let safety = 20;
      while (safety-- > 0) {
        const state = this._inner.getState();
        if (!state || state.activePlayer === 0 || state.phase === PHASE.GAME_OVER) break;

        if (state.phase === PHASE.MAIN) {
          this._inner.sendAction({ type: ACTION.END_MAIN_PHASE });
          continue;
        }
        if (state.phase === PHASE.PERFORMANCE) {
          this._inner.sendAction({ type: ACTION.END_PERFORMANCE });
          continue;
        }
        // RESET / DRAW / CHEER / END: advance
        this._inner.sendAction({ type: ACTION.ADVANCE_PHASE });
      }
    } finally {
      this._allowAnyAction = false;
    }
  }
}
