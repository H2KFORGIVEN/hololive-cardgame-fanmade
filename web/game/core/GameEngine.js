import { PHASE, ZONE, ACTION, MEMBER_STATE } from './constants.js';
import { getCard } from './CardDatabase.js';
import { cloneState, getStageCount, findInstance, removeInstance, archiveMember } from './GameState.js';
import { validateAction } from './ActionValidator.js';
import { calculateDamage, applyDamage } from './DamageCalculator.js';
import { parseCost } from './constants.js';
import { triggerEffect } from '../effects/EffectEngine.js';
import { HOOK } from '../effects/EffectRegistry.js';

export function processAction(state, action) {
  const validation = validateAction(state, action);
  if (!validation.valid) {
    return { state, error: validation.reason };
  }

  const newState = cloneState(state);

  switch (action.type) {
    case ACTION.ADVANCE_PHASE:
      return { state: advancePhase(newState) };
    case ACTION.CHEER_ASSIGN:
      return { state: processCheerAssign(newState, action) };
    case ACTION.PLACE_MEMBER:
      return { state: processPlaceMember(newState, action) };
    case ACTION.BLOOM:
      return { state: processBloom(newState, action) };
    case ACTION.PLAY_SUPPORT:
      return { state: processPlaySupport(newState, action) };
    case ACTION.USE_OSHI_SKILL:
      return { state: processOshiSkill(newState, action) };
    case ACTION.COLLAB:
      return { state: processCollab(newState, action) };
    case ACTION.BATON_PASS:
      return { state: processBatonPass(newState, action) };
    case ACTION.USE_ART:
      return { state: processUseArt(newState, action) };
    case ACTION.END_MAIN_PHASE:
      return { state: endMainPhase(newState) };
    case ACTION.END_PERFORMANCE:
      return { state: endPerformance(newState) };
    case ACTION.MANUAL_ADJUST:
      return { state: processManualAdjust(newState, action) };
    default:
      return { state: newState };
  }
}

// ── Phase Flow ──

function advancePhase(state) {
  // Chain through Setup → Reset → Draw → Cheer automatically.
  // Stops at CHEER (waits for CHEER_ASSIGN) or MAIN (waits for player input).
  let safety = 10;
  while (safety-- > 0) {
    const p = state.activePlayer;
    const isFirst = state.firstTurn[p];

    if (state.phase === PHASE.SETUP) {
      state.phase = PHASE.RESET;
      continue;
    }
    if (state.phase === PHASE.RESET) {
      if (!isFirst) {
        processResetPhase(state);
      } else {
        resetTurnFlags(state.players[p]);
      }
      state.phase = PHASE.DRAW;
      continue; // auto-advance to draw
    }
    if (state.phase === PHASE.DRAW) {
      processDrawPhase(state);
      if (state.phase === PHASE.GAME_OVER) return state;
      state.phase = PHASE.CHEER;
      continue; // auto-advance to cheer
    }
    if (state.phase === PHASE.CHEER) {
      const player = state.players[p];
      if (player.zones[ZONE.CHEER_DECK].length === 0) {
        state.phase = PHASE.MAIN;
        addLog(state, `P${p + 1} 吶喊牌組為空，跳過應援階段`);
        return state;
      }
      // Cheer deck has cards — wait for player to assign target
      return state;
    }
    // Other phases: no auto-advance
    return state;
  }
  return state;
}

// ── Reset Phase ──
// Correct order: 1) activate all previously-rested members
//                 2) move this turn's collab → backstage (REST, stays rested until next turn)
//                 3) center replacement if empty

function processResetPhase(state) {
  const p = state.activePlayer;
  const player = state.players[p];

  // Step 1: Activate all resting members (these are from previous turn's actions)
  const stageZones = [ZONE.CENTER, ZONE.BACKSTAGE];
  for (const z of stageZones) {
    const zone = player.zones[z];
    if (Array.isArray(zone)) {
      zone.forEach(m => { if (m) m.state = MEMBER_STATE.ACTIVE; });
    } else if (zone) {
      zone.state = MEMBER_STATE.ACTIVE;
    }
  }

  // Step 2: Move collab member to backstage in REST state
  // (This member stays rested — gets activated in NEXT turn's reset)
  const collab = player.zones[ZONE.COLLAB];
  if (collab) {
    collab.state = MEMBER_STATE.REST;
    player.zones[ZONE.BACKSTAGE].push(collab);
    player.zones[ZONE.COLLAB] = null;
    addLog(state, `P${p + 1} 聯動成員 ${getCard(collab.cardId)?.name || ''} 回到後台（休息）`);
  }

  // Step 3: If no center member, move from backstage
  // Center/Collab members are always active — if a rest member is moved here, activate it
  if (!player.zones[ZONE.CENTER] && player.zones[ZONE.BACKSTAGE].length > 0) {
    let idx = player.zones[ZONE.BACKSTAGE].findIndex(m => m.state === MEMBER_STATE.ACTIVE);
    if (idx === -1) idx = 0;
    const member = player.zones[ZONE.BACKSTAGE].splice(idx, 1)[0];
    member.state = MEMBER_STATE.ACTIVE;
    player.zones[ZONE.CENTER] = member;
    addLog(state, `P${p + 1} ${getCard(member.cardId)?.name || ''} 移動到中心位置`);
  }

  resetTurnFlags(player);
  addLog(state, `P${p + 1} 重置階段完成`);
}

function resetTurnFlags(player) {
  player.usedCollab = false;
  player.usedBaton = false;
  player.usedLimited = false;
  player.performedArts = { center: false, collab: false };
  player.oshiSkillUsedThisTurn = false;

  // Clear per-turn flags on all stage members
  const allZones = [ZONE.CENTER, ZONE.COLLAB, ZONE.BACKSTAGE];
  for (const z of allZones) {
    const zone = player.zones[z];
    if (Array.isArray(zone)) {
      zone.forEach(m => { if (m) { m.placedThisTurn = false; m.bloomedThisTurn = false; } });
    } else if (zone) {
      zone.placedThisTurn = false;
      zone.bloomedThisTurn = false;
    }
  }
}

// ── Draw Phase ──

function processDrawPhase(state) {
  const p = state.activePlayer;
  const player = state.players[p];
  if (player.zones[ZONE.DECK].length === 0) {
    state.winner = 1 - p;
    state.phase = PHASE.GAME_OVER;
    addLog(state, `P${p + 1} 無法抽牌，判負！`);
    return;
  }
  const drawn = player.zones[ZONE.DECK].shift();
  drawn.faceDown = false;
  drawn._drawnAt = Date.now();
  player.zones[ZONE.HAND].push(drawn);
  addLog(state, `P${p + 1} 抽了 1 張牌`);
}

// ── Main Phase Actions ──

function processCheerAssign(state, action) {
  const p = state.activePlayer;
  const player = state.players[p];
  const cheerCard = player.zones[ZONE.CHEER_DECK].shift();
  if (!cheerCard) return state;

  cheerCard.faceDown = false;
  const target = findInstance(player, action.targetInstanceId);
  if (target) {
    target.card.attachedCheer.push(cheerCard);
    addLog(state, `P${p + 1} 發送吶喊給 ${getCard(target.card.cardId)?.name || ''}`);
  }

  state.phase = PHASE.MAIN;
  return state;
}

function processPlaceMember(state, action) {
  const p = state.activePlayer;
  const player = state.players[p];
  const card = player.zones[ZONE.HAND].splice(action.handIndex, 1)[0];
  if (!card) return state;

  card.placedThisTurn = true;
  card.faceDown = false;
  player.zones[ZONE.BACKSTAGE].push(card);
  addLog(state, `P${p + 1} 放置 ${getCard(card.cardId)?.name || ''} 到後台`);
  return state;
}

function processBloom(state, action) {
  const p = state.activePlayer;
  const player = state.players[p];
  const bloomCard = player.zones[ZONE.HAND].splice(action.handIndex, 1)[0];
  if (!bloomCard) return state;

  const target = findInstance(player, action.targetInstanceId);
  if (!target) return state;

  // Store previous card in bloom stack
  target.card.bloomStack.push(target.card.cardId);
  const oldCardId = target.card.cardId;
  target.card.cardId = bloomCard.cardId;
  target.card.bloomedThisTurn = true;
  // Carries over: damage, cheer, supports, state (active/rest)

  addLog(state, `P${p + 1} ${getCard(oldCardId)?.name || ''} 綻放為 ${getCard(bloomCard.cardId)?.name || ''} (${getCard(bloomCard.cardId)?.bloom || ''})`);

  fireEffect(state, HOOK.ON_BLOOM, { cardId: bloomCard.cardId, player: p, memberInst: target.card });
  return state;
}

function processPlaySupport(state, action) {
  const p = state.activePlayer;
  const player = state.players[p];
  const supportInstance = player.zones[ZONE.HAND].splice(action.handIndex, 1)[0];
  if (!supportInstance) return state;

  const card = getCard(supportInstance.cardId);
  const effectText = typeof card?.supportEffect === 'object'
    ? (card.supportEffect['zh-TW'] || card.supportEffect['ja'] || '')
    : (card?.supportEffect || '');

  if (effectText.includes('LIMITED')) {
    player.usedLimited = true;
  }

  const cardName = card?.name || '';
  const type = card?.type || '';

  // Attachment types: mascot (1 per member), tool (1 per member), fan (unlimited)
  const attachTypes = ['支援・吉祥物', '支援・道具', '支援・粉絲'];
  if (attachTypes.includes(type) && action.targetInstanceId) {
    const target = findInstance(player, action.targetInstanceId);
    if (target) {
      // Check tool/mascot limit: 1 per member
      if (type === '支援・道具' || type === '支援・吉祥物') {
        const existing = target.card.attachedSupport.find(s => getCard(s.cardId)?.type === type);
        if (existing) {
          // Replace: archive old one
          const idx = target.card.attachedSupport.indexOf(existing);
          target.card.attachedSupport.splice(idx, 1);
          player.zones[ZONE.ARCHIVE].push(existing);
        }
      }
      target.card.attachedSupport.push(supportInstance);
      addLog(state, `P${p + 1} 將 ${cardName} 附加給 ${getCard(target.card.cardId)?.name || ''}`);
    }
  } else {
    player.zones[ZONE.ARCHIVE].push(supportInstance);
    addLog(state, `P${p + 1} 使用支援卡 ${cardName}`);
  }

  fireEffect(state, HOOK.ON_PLAY, { cardId: supportInstance.cardId, player: p });
  return state;
}


function processOshiSkill(state, action) {
  const p = state.activePlayer;
  const player = state.players[p];
  const oshiCard = getCard(player.oshi.cardId);
  if (!oshiCard) return state;

  const skillType = action.skillType;
  const skill = skillType === 'sp' ? oshiCard.spSkill : oshiCard.oshiSkill;
  const cost = Math.abs(skill?.holoPower || 0);

  // Pay holo power: flip face-up and send to archive
  for (let i = 0; i < cost; i++) {
    const card = player.zones[ZONE.HOLO_POWER].shift();
    if (card) {
      card.faceDown = false;
      player.zones[ZONE.ARCHIVE].push(card);
    }
  }

  if (skillType === 'sp') {
    player.oshi.usedSp = true;
    addLog(state, `P${p + 1} 使用 SP 技能：${skill?.name || ''}`);
  } else {
    player.oshiSkillUsedThisTurn = true;
    addLog(state, `P${p + 1} 使用推し技能：${skill?.name || ''}`);
  }

  fireEffect(state, HOOK.ON_OSHI_SKILL, { cardId: player.oshi.cardId, player: p, skillType });
  return state;
}

function processCollab(state, action) {
  const p = state.activePlayer;
  const player = state.players[p];

  // Move backstage member to collab position FIRST
  const member = player.zones[ZONE.BACKSTAGE].splice(action.backstageIndex, 1)[0];
  player.zones[ZONE.COLLAB] = member;
  player.usedCollab = true;

  addLog(state, `P${p + 1} ${getCard(member.cardId)?.name || ''} 聯動！`);

  // THEN move 1 card from deck top to holo power (face down)
  if (player.zones[ZONE.DECK].length > 0) {
    const powerCard = player.zones[ZONE.DECK].shift();
    powerCard.faceDown = true;
    player.zones[ZONE.HOLO_POWER].push(powerCard);
    addLog(state, `  牌組 → holo 能量區 (${player.zones[ZONE.HOLO_POWER].length})`);
  }

  fireEffect(state, HOOK.ON_COLLAB, { cardId: member.cardId, player: p, memberInst: member });
  return state;
}

function processBatonPass(state, action) {
  const p = state.activePlayer;
  const player = state.players[p];
  const center = player.zones[ZONE.CENTER];
  const centerCard = getCard(center.cardId);

  // Pay baton cost — smart auto-select matching colors
  const batonCost = parseCost(centerCard?.batonImage);
  const cheerToRemove = action.cheerToArchive || [];
  if (cheerToRemove.length > 0) {
    // Player manually selected which cheer to discard
    for (const instanceId of cheerToRemove) {
      const idx = center.attachedCheer.findIndex(c => c.instanceId === instanceId);
      if (idx !== -1) {
        player.zones[ZONE.ARCHIVE].push(center.attachedCheer.splice(idx, 1)[0]);
      }
    }
  } else {
    // Auto-select: fulfill colored requirements first, then colorless
    const used = new Set();
    const colorMap = { white: '白', green: '綠', red: '紅', blue: '藍', purple: '紫', yellow: '黃' };
    for (const [colorKey, count] of Object.entries(batonCost)) {
      if (colorKey === 'total' || colorKey === 'colorless') continue;
      const gameColor = colorMap[colorKey];
      if (!gameColor) continue;
      let assigned = 0;
      for (let i = 0; i < center.attachedCheer.length && assigned < count; i++) {
        if (!used.has(i) && getCard(center.attachedCheer[i].cardId)?.color === gameColor) {
          used.add(i); assigned++;
        }
      }
    }
    const colorlessNeeded = batonCost.colorless || 0;
    let assigned = 0;
    for (let i = 0; i < center.attachedCheer.length && assigned < colorlessNeeded; i++) {
      if (!used.has(i)) { used.add(i); assigned++; }
    }
    // Remove selected cheer (reverse order to preserve indices)
    const indices = [...used].sort((a, b) => b - a);
    for (const i of indices) {
      player.zones[ZONE.ARCHIVE].push(center.attachedCheer.splice(i, 1)[0]);
    }
  }

  // Swap center with backstage member — both retain their current state
  const backstageMember = player.zones[ZONE.BACKSTAGE].splice(action.backstageIndex, 1)[0];
  player.zones[ZONE.CENTER] = backstageMember;
  player.zones[ZONE.BACKSTAGE].push(center);
  player.usedBaton = true;

  addLog(state, `P${p + 1} 交棒：${getCard(center.cardId)?.name || ''} ↔ ${getCard(backstageMember.cardId)?.name || ''}`);
  return state;
}

// ── Performance Phase ──

function processUseArt(state, action) {
  const p = state.activePlayer;
  const player = state.players[p];
  const opponent = state.players[1 - p];

  const position = action.position; // 'center' or 'collab'
  const memberZone = position === 'center' ? ZONE.CENTER : ZONE.COLLAB;
  const attacker = player.zones[memberZone];
  if (!attacker) return state;

  const targetZone = action.targetPosition === 'center' ? ZONE.CENTER : ZONE.COLLAB;
  const target = opponent.zones[targetZone];
  if (!target) return state;

  // Trigger ON_ART_DECLARE (before damage calc — dice rolls, boost effects)
  const artKey = action.artIndex === 0 ? 'art1' : 'art2';
  fireEffect(state, HOOK.ON_ART_DECLARE, { cardId: attacker.cardId, player: p, memberInst: attacker, artKey });

  // Calculate damage
  const dmgResult = calculateDamage(attacker, action.artIndex, target);

  // Add any turn boosts from effects
  let bonusDmg = 0;
  if (state._turnBoosts) {
    for (const boost of state._turnBoosts) {
      if (boost.type === 'DAMAGE_BOOST') bonusDmg += boost.amount;
    }
    state._turnBoosts = [];
  }
  const totalDmg = dmgResult.total + bonusDmg;

  addLog(state, `P${p + 1} ${getCard(attacker.cardId)?.name || ''} 使用 ${dmgResult.artName}！`);
  if (dmgResult.special > 0) addLog(state, `  特攻加成 +${dmgResult.special}！`);
  if (bonusDmg > 0) addLog(state, `  效果加成 +${bonusDmg}！`);

  // Apply damage to target
  const result = applyDamage(target, totalDmg);
  addLog(state, `  對 ${getCard(target.cardId)?.name || ''} 造成 ${totalDmg} 傷害 (${result.currentDamage}/${result.maxHp})`);

  // Mark art as used for this position
  player.performedArts[position] = true;

  // Trigger ON_ART_RESOLVE (after damage applied)
  fireEffect(state, HOOK.ON_ART_RESOLVE, { cardId: attacker.cardId, player: p, memberInst: attacker, target, artKey });

  // Check knockdown
  if (result.knockedDown) {
    processKnockdown(state, p, target, opponent);
  }

  return state;
}

function processKnockdown(state, attackerPlayer, target, opponent) {
  const targetCard = getCard(target.cardId);
  const isBuzz = targetCard?.bloom === '1st Buzz';
  const lifeCost = isBuzz ? 2 : 1;

  addLog(state, `  ${targetCard?.name || ''} 被擊倒！${isBuzz ? '(Buzz 生命 -2)' : ''}`);

  // Archive the knocked-down member and all attached cards
  archiveMember(opponent, target.instanceId);

  // Life loss
  const lifeCheerToAssign = [];
  for (let i = 0; i < lifeCost; i++) {
    if (opponent.zones[ZONE.LIFE].length > 0) {
      const lifeCard = opponent.zones[ZONE.LIFE].shift();
      lifeCard.faceDown = false;
      lifeCheerToAssign.push(lifeCard);
    }
  }

  const opponentIdx = 1 - attackerPlayer;
  addLog(state, `  P${opponentIdx + 1} 生命值 -${lifeCost}（剩餘 ${opponent.zones[ZONE.LIFE].length}）`);

  // Check win: life = 0
  if (opponent.zones[ZONE.LIFE].length === 0) {
    state.winner = attackerPlayer;
    state.phase = PHASE.GAME_OVER;
    addLog(state, `P${attackerPlayer + 1} 獲勝！對手生命值歸零！`);
    return;
  }

  // Check win: stage empty
  if (getStageCount(opponent) === 0) {
    state.winner = attackerPlayer;
    state.phase = PHASE.GAME_OVER;
    addLog(state, `P${attackerPlayer + 1} 獲勝！對手舞台無成員！`);
    return;
  }

  // Queue life cheer assignment for the opponent to choose
  if (lifeCheerToAssign.length > 0) {
    state.pendingEffect = {
      type: 'LIFE_CHEER',
      player: opponentIdx,
      cheerInstances: lifeCheerToAssign,
      currentIndex: 0,
    };
  }
}

// ── End Phase ──

function endMainPhase(state) {
  const p = state.activePlayer;

  // Only first player skips performance on their first turn
  // Second player CAN enter performance and use arts on their first turn
  if (state.firstTurn[p] && p === state.firstPlayer) {
    addLog(state, `P${p + 1} 先攻第一回合跳過表演階段`);
    state.phase = PHASE.PERFORMANCE;
    return endPerformance(state);
  }
  state.phase = PHASE.PERFORMANCE;
  addLog(state, `P${p + 1} 進入表演階段`);
  return state;
}

function endPerformance(state) {
  state.phase = PHASE.END;
  return processEndPhase(state);
}

function processEndPhase(state) {
  const p = state.activePlayer;
  const player = state.players[p];

  // 1. "Until end of turn" effects expire
  // (Handled by clearing turnModifiers if we add them later)

  // 2. Clear first turn flag
  state.firstTurn[p] = false;

  // 3. If center is empty, move from backstage to fill center
  // Rule: prefer active member; if only rest members exist, take a rest one
  // Center members are always active — moved member is set to active
  if (!player.zones[ZONE.CENTER]) {
    if (player.zones[ZONE.BACKSTAGE].length > 0) {
      let idx = player.zones[ZONE.BACKSTAGE].findIndex(m => m.state === MEMBER_STATE.ACTIVE);
      if (idx === -1) idx = 0; // Only rest members available
      const member = player.zones[ZONE.BACKSTAGE].splice(idx, 1)[0];
      member.state = MEMBER_STATE.ACTIVE;
      player.zones[ZONE.CENTER] = member;
      addLog(state, `P${p + 1} ${getCard(member.cardId)?.name || ''} 移動到中心位置`);
    } else if (player.zones[ZONE.COLLAB]) {
      // Edge case fallback
      const collab = player.zones[ZONE.COLLAB];
      collab.state = MEMBER_STATE.ACTIVE;
      player.zones[ZONE.CENTER] = collab;
      player.zones[ZONE.COLLAB] = null;
      addLog(state, `P${p + 1} 聯動成員移動到中心位置`);
    }
  }

  // 4. Check lose: stage empty
  if (getStageCount(player) === 0) {
    state.winner = 1 - p;
    state.phase = PHASE.GAME_OVER;
    addLog(state, `P${p + 1} 舞台無成員，判負！`);
    return state;
  }

  addLog(state, `--- P${p + 1} 回合結束 ---`);

  // Switch to opponent
  state.activePlayer = 1 - p;
  state.turnNumber++;
  state.phase = PHASE.RESET;

  return state;
}

// ── Manual Adjust ──

function processManualAdjust(state, action) {
  const player = state.players[action.player ?? state.activePlayer];
  const adj = action.adjustment;

  switch (adj.type) {
    case 'ADD_DAMAGE': {
      const inst = findInstance(player, adj.instanceId);
      if (inst) {
        inst.card.damage += adj.amount;
        addLog(state, `[手動] ${getCard(inst.card.cardId)?.name || ''} 傷害 +${adj.amount}`);
      }
      break;
    }
    case 'REMOVE_DAMAGE': {
      const inst = findInstance(player, adj.instanceId);
      if (inst) {
        inst.card.damage = Math.max(0, inst.card.damage - adj.amount);
        addLog(state, `[手動] ${getCard(inst.card.cardId)?.name || ''} 傷害 -${adj.amount}`);
      }
      break;
    }
    case 'TOGGLE_STATE': {
      const inst = findInstance(player, adj.instanceId);
      if (inst) {
        inst.card.state = inst.card.state === MEMBER_STATE.ACTIVE ? MEMBER_STATE.REST : MEMBER_STATE.ACTIVE;
        addLog(state, `[手動] ${getCard(inst.card.cardId)?.name || ''} 切換為 ${inst.card.state}`);
      }
      break;
    }
    case 'DRAW_CARD': {
      if (player.zones[ZONE.DECK].length > 0) {
        const card = player.zones[ZONE.DECK].shift();
        card.faceDown = false;
        card._drawnAt = Date.now();
        player.zones[ZONE.HAND].push(card);
        addLog(state, `[手動] 抽 1 張牌`);
      }
      break;
    }
    case 'MOVE_CHEER': {
      const from = findInstance(player, adj.fromInstanceId);
      const to = findInstance(player, adj.toInstanceId);
      if (from && to && adj.cheerInstanceId) {
        const idx = from.card.attachedCheer.findIndex(c => c.instanceId === adj.cheerInstanceId);
        if (idx !== -1) {
          const cheer = from.card.attachedCheer.splice(idx, 1)[0];
          to.card.attachedCheer.push(cheer);
          addLog(state, `[手動] 移動吶喊卡`);
        }
      }
      break;
    }
  }

  return state;
}

// ── Helpers ──

function addLog(state, msg) {
  state.log.push({ turn: state.turnNumber, player: state.activePlayer, msg, ts: Date.now() });
}

// Fire an effect hook, queue prompt if needed
function fireEffect(state, hookType, context) {
  try {
    const result = triggerEffect(state, hookType, context);
    if (result.prompt) {
      state.pendingEffect = result.prompt;
    }
    if (result.log) {
      addLog(state, `  [效果] ${result.log}`);
    }
    if (result.effect?.type === 'DAMAGE_BOOST') {
      // Store as turn modifier for damage calculation
      if (!state._turnBoosts) state._turnBoosts = [];
      state._turnBoosts.push(result.effect);
    }
  } catch (e) {
    // Effect errors should not crash the game
    console.warn('Effect error:', e);
  }
}
