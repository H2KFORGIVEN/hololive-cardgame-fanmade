import { PHASE } from '../core/constants.js';

const PHASE_STEPS = [
  { phase: PHASE.RESET, label: '重置', icon: '♻️' },
  { phase: PHASE.DRAW, label: '抽牌', icon: '🃏' },
  { phase: PHASE.CHEER, label: '應援', icon: '📣' },
  { phase: PHASE.MAIN, label: '主要', icon: '🎴' },
  { phase: PHASE.PERFORMANCE, label: '表演', icon: '⚡' },
  { phase: PHASE.END, label: '結束', icon: '🌙' },
];

export function renderPhaseBar(state, localPlayer = null) {
  if (state.phase === PHASE.GAME_OVER) {
    let winnerText = '遊戲結束';
    if (state.winner !== null) {
      winnerText = localPlayer !== null
        ? (state.winner === localPlayer ? '🏆 你贏了！' : '💀 你輸了...')
        : `🏆 Player ${state.winner + 1} 獲勝！`;
    }
    return `<div class="phase-bar game-over-bar"><span class="game-over-text">${winnerText}</span></div>`;
  }

  const isMyTurn = localPlayer !== null && state.activePlayer === localPlayer;
  const turnLabel = localPlayer !== null
    ? (isMyTurn ? '你的回合' : '對手的回合')
    : `P${state.activePlayer + 1}`;

  const stepsHtml = PHASE_STEPS.map((s, i) => {
    const active = s.phase === state.phase;
    const passed = PHASE_STEPS.findIndex(x => x.phase === state.phase) > i;
    const cls = active ? 'phase-active' : passed ? 'phase-passed' : '';
    return `<span class="phase-step ${cls}" title="${s.label}"><span class="phase-icon">${s.icon}</span><span class="phase-label">${s.label}</span></span>`;
  }).join('<span class="phase-sep">›</span>');

  return `
    <div class="phase-bar ${isMyTurn ? 'my-turn' : 'opp-turn'}">
      <div class="phase-bar-left">
        <span class="turn-number">TURN ${state.turnNumber + 1}</span>
        <span class="player-badge ${isMyTurn ? 'badge-my-turn' : 'badge-opp-turn'}">
          <span class="badge-dot"></span>${turnLabel}
        </span>
      </div>
      <div class="phase-bar-right">
        <div class="phase-steps">${stepsHtml}</div>
      </div>
    </div>
  `;
}
