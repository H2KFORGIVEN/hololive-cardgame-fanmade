import { PHASE } from '../core/constants.js';

const PHASE_STEPS = [
  { phase: PHASE.RESET, label: '重置' },
  { phase: PHASE.DRAW, label: '抽牌' },
  { phase: PHASE.CHEER, label: '應援' },
  { phase: PHASE.MAIN, label: '主要' },
  { phase: PHASE.PERFORMANCE, label: '表演' },
  { phase: PHASE.END, label: '結束' },
];

export function renderPhaseBar(state, localPlayer = null) {
  if (state.phase === PHASE.GAME_OVER) {
    let winnerText = '遊戲結束';
    if (state.winner !== null) {
      winnerText = localPlayer !== null
        ? (state.winner === localPlayer ? '你贏了！' : '你輸了...')
        : `Player ${state.winner + 1} 獲勝！`;
    }
    return `<div class="phase-bar game-over-bar"><span class="game-over-text">${winnerText}</span></div>`;
  }

  const isMyTurn = localPlayer !== null && state.activePlayer === localPlayer;
  const turnLabel = localPlayer !== null
    ? (isMyTurn ? '你的回合' : '對手的回合')
    : `P${state.activePlayer + 1}`;

  const stepsHtml = PHASE_STEPS.map(s => {
    const active = s.phase === state.phase;
    return `<span class="phase-step${active ? ' phase-active' : ''}">${s.label}</span>`;
  }).join('');

  return `
    <div class="phase-bar ${isMyTurn ? 'my-turn' : 'opp-turn'}">
      <span class="turn-info">Turn ${state.turnNumber + 1}</span>
      <span class="player-badge ${isMyTurn ? 'badge-my-turn' : 'badge-opp-turn'}">${turnLabel}</span>
      <div class="phase-steps">${stepsHtml}</div>
    </div>
  `;
}
