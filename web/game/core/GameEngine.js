import { PHASE, ZONE, ACTION, MEMBER_STATE } from './constants.js';
import { getCard } from './CardDatabase.js';
import { cloneState, getStageCount, findInstance, removeInstance, archiveMember } from './GameState.js';
import { validateAction } from './ActionValidator.js';
import { calculateDamage, applyDamage } from './DamageCalculator.js';
import { parseCost } from './constants.js';
import { triggerEffect } from '../effects/EffectEngine.js';
import { HOOK } from '../effects/EffectRegistry.js';
import { getExtraHp, getArtDamageBoost } from './AttachedSupportEffects.js';
import { getMemberSelfExtraHp } from './MemberSelfEffects.js';

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
    case ACTION.BATON_PASS: {
      // processBatonPass can return either a mutated state or { error } if
      // the client-supplied cheerToArchive doesn't actually cover the cost.
      const result = processBatonPass(newState, action);
      if (result && result.error) return { state, error: result.error };
      return { state: result };
    }
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
  // Fire ON_TURN_START so passive effects can kick in (e.g. "at the start of your turn…")
  fireEffect(state, HOOK.ON_TURN_START, { player: p });
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
    // Fire ON_CHEER_ATTACH so yell effects on the cheer card (or on the receiving member) can trigger
    fireEffect(state, HOOK.ON_CHEER_ATTACH, {
      cardId: cheerCard.cardId,
      player: p,
      memberInst: target.card,
    });
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
  // Fire ON_PLACE so "when placed" effects can trigger (draw, search, etc.)
  fireEffect(state, HOOK.ON_PLACE, { cardId: card.cardId, player: p, memberInst: card });
  return state;
}

function processBloom(state, action) {
  const p = state.activePlayer;
  const player = state.players[p];
  const bloomCard = player.zones[ZONE.HAND].splice(action.handIndex, 1)[0];
  if (!bloomCard) return state;

  const target = findInstance(player, action.targetInstanceId);
  if (!target) return state;

  // Store a snapshot of the pre-bloom card in the stack so archive / revert paths
  // can retrieve the underneath cards as proper instances (not bare strings).
  const oldCardId = target.card.cardId;
  target.card.bloomStack.push({ cardId: oldCardId, instanceId: target.card.instanceId });
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

  // Fire effectG (passive while on stage) for "after-SP" reactive effects.
  // E.g. hBP07-045 ハコス・ベールズ Buzz: after self uses SP skill, +1 holopower.
  // The handler reads ctx.triggerEvent + ctx.player to decide if it applies.
  if (skillType === 'sp') {
    const stageMembers = [
      player.zones[ZONE.CENTER],
      player.zones[ZONE.COLLAB],
      ...(player.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean);
    for (const m of stageMembers) {
      fireEffect(state, HOOK.ON_PASSIVE_GLOBAL, {
        cardId: m.cardId, player: p, memberInst: m, triggerEvent: 'sp_skill_used',
      });
    }
  }

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

  // Broadcast: fire ON_COLLAB to other own-side stage members so observer
  // handlers like "[Limited center] when own member collabs → ..." can react.
  // The collabing member's own ON_COLLAB already fired above as the legacy
  // single-fire. Broadcast carries triggerEvent='member_collabed' so handlers
  // can distinguish "I just collabed" vs "an ally just collabed".
  const ownStage = [
    player.zones[ZONE.CENTER], player.zones[ZONE.COLLAB],
    ...(player.zones[ZONE.BACKSTAGE] || []),
  ].filter(Boolean);
  for (const m of ownStage) {
    if (m.instanceId === member.instanceId) continue;
    fireEffect(state, HOOK.ON_COLLAB, {
      cardId: m.cardId,
      player: p,
      memberInst: m,
      triggerEvent: 'member_collabed',
      collabingMember: member,
    });
  }
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
    // SECURITY: client-supplied cheer selection must actually satisfy batonCost.
    // Without this a malicious online client could send cheerToArchive: [] or a
    // wrong-color list to pay baton for free.
    const selectedCheer = cheerToRemove
      .map(id => center.attachedCheer.find(c => c.instanceId === id))
      .filter(Boolean);
    if (selectedCheer.length !== cheerToRemove.length) {
      return { error: 'BATON_PASS: 選擇的吶喊卡 instanceId 找不到' };
    }
    // Verify the selection covers the colored + colorless cost.
    const colorMap = { white: '白', green: '綠', red: '紅', blue: '藍', purple: '紫', yellow: '黃' };
    const pool = selectedCheer.map(c => getCard(c.cardId)?.color || '');
    const used = new Array(pool.length).fill(false);
    for (const [colorKey, count] of Object.entries(batonCost)) {
      if (colorKey === 'total' || colorKey === 'colorless') continue;
      const gameColor = colorMap[colorKey];
      if (!gameColor) continue;
      let got = 0;
      for (let i = 0; i < pool.length && got < count; i++) {
        if (!used[i] && pool[i] === gameColor) { used[i] = true; got++; }
      }
      if (got < count) {
        return { error: `BATON_PASS: 交棒色${gameColor}需 ${count} 張，只提供 ${got} 張` };
      }
    }
    const colorlessNeeded = batonCost.colorless || 0;
    let colorlessGot = 0;
    for (let i = 0; i < pool.length && colorlessGot < colorlessNeeded; i++) {
      if (!used[i]) { used[i] = true; colorlessGot++; }
    }
    if (colorlessGot < colorlessNeeded) {
      return { error: `BATON_PASS: 交棒無色需 ${colorlessNeeded} 張，只提供 ${colorlessGot} 張` };
    }
    // Passed — actually move the cheer
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

  // Swap center ↔ backstage. Official rule: outgoing center becomes REST on backstage.
  if (!Number.isInteger(action.backstageIndex) ||
      action.backstageIndex < 0 ||
      action.backstageIndex >= player.zones[ZONE.BACKSTAGE].length) {
    return { error: `BATON_PASS: backstageIndex 超出範圍 (${action.backstageIndex})` };
  }
  const backstageMember = player.zones[ZONE.BACKSTAGE].splice(action.backstageIndex, 1)[0];
  center.state = MEMBER_STATE.REST;
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

  // Fire passive global effects — "while on stage" modifiers from every member on both sides.
  // Each handler may push DAMAGE_BOOST entries into _turnBoosts for this attack only.
  firePassiveModifiers(state, {
    attacker, target, artKey,
    attackerPlayer: p, defenderPlayer: 1 - p,
  });

  // Calculate damage
  const dmgResult = calculateDamage(attacker, action.artIndex, target);

  // Add any turn boosts / reductions from effects.
  // Conditional boosts (e.g. boost.colorRequired = '綠' for "1 green member's
  // art +20" from hBD24 oshi cards) consume only when the attacker matches;
  // unmatched ones are kept in _turnBoosts for later attacks in the same turn.
  let bonusDmg = 0;
  let reduction = 0;
  let cancelled = false;
  let cancelReason = '';
  const attackerColor = getCard(attacker.cardId)?.color;
  if (state._turnBoosts) {
    const remaining = [];
    for (const boost of state._turnBoosts) {
      // Color filter: keep boost in queue if it requires a specific color
      // and this attacker doesn't match.
      if (boost.colorRequired && attackerColor !== boost.colorRequired) {
        remaining.push(boost);
        continue;
      }
      if (boost.type === 'DAMAGE_BOOST') bonusDmg += (boost.amount || 0);
      else if (boost.type === 'DAMAGE_REDUCTION') reduction += (boost.amount || 0);
      else if (boost.type === 'DAMAGE_CANCEL') {
        cancelled = true;
        if (boost.reason) cancelReason = boost.reason;
      }
    }
    state._turnBoosts = remaining;
  }
  // Equipment-based art damage boost (e.g. hBP06-099 ゆび: +10) — pulled
  // from the AttachedSupportEffects registry, same path as HP+30 / cost−1.
  // Applied in addition to handler-pushed _turnBoosts, since that's how
  // equipment effects model "while equipped" on this member.
  const equipBoost = getArtDamageBoost(attacker);
  bonusDmg += equipBoost;
  const totalDmg = cancelled ? 0 : Math.max(0, dmgResult.total + bonusDmg - reduction);

  addLog(state, `P${p + 1} ${getCard(attacker.cardId)?.name || ''} 使用 ${dmgResult.artName}！`);
  if (dmgResult.special > 0) addLog(state, `  特攻加成 +${dmgResult.special}！`);
  if (equipBoost > 0) addLog(state, `  道具加成 +${equipBoost}！`);
  if (bonusDmg - equipBoost > 0) addLog(state, `  效果加成 +${bonusDmg - equipBoost}！`);
  if (reduction > 0) addLog(state, `  傷害減免 -${reduction}！`);
  if (cancelled) addLog(state, `  傷害無效化${cancelReason ? ` (${cancelReason})` : ''}！`);

  // Apply damage to target
  const result = applyDamage(target, totalDmg);
  const { currentDamage = 0, maxHp = 0 } = result;
  addLog(state, `  對 ${getCard(target.cardId)?.name || ''} 造成 ${totalDmg} 傷害 (${currentDamage}/${maxHp})`);

  // Mark art as used for this position
  player.performedArts[position] = true;

  // Mark this target as the "in-flight art knockdown" so the sweep below
  // doesn't archive it inside ON_DAMAGE_DEALT / ON_DAMAGE_TAKEN hooks before
  // processKnockdown gets a chance to run ON_KNOCKDOWN handlers (e.g.
  // hSD09-007's life-loss reduction). The sweep skips this instanceId only.
  state._artTargetInFlight = target.instanceId;
  // Trigger damage hooks and ON_ART_RESOLVE (after damage applied)
  fireEffect(state, HOOK.ON_DAMAGE_DEALT, { cardId: attacker.cardId, player: p, memberInst: attacker, target, amount: totalDmg });
  fireEffect(state, HOOK.ON_DAMAGE_TAKEN, { cardId: target.cardId, player: 1 - p, memberInst: target, attacker, amount: totalDmg });
  fireEffect(state, HOOK.ON_ART_RESOLVE, { cardId: attacker.cardId, player: p, memberInst: attacker, target, artKey });

  // Broadcast: fire ON_ART_RESOLVE with triggerEvent='member_used_art' to
  // OTHER attacker-side stage members so passive observers (e.g. "when an
  // ally uses an art" — hBP05-066, hBP06-066) can react. The attacker
  // already received the legacy single-fire above so we skip it here.
  // Defender-side broadcast not currently needed by any registered handler.
  const attackerStage = [
    state.players[p].zones[ZONE.CENTER],
    state.players[p].zones[ZONE.COLLAB],
    ...(state.players[p].zones[ZONE.BACKSTAGE] || []),
  ].filter(Boolean);
  for (const m of attackerStage) {
    if (m.instanceId === attacker.instanceId) continue;
    fireEffect(state, HOOK.ON_ART_RESOLVE, {
      cardId: m.cardId,
      player: p,
      memberInst: m,
      triggerEvent: 'member_used_art',
      attacker,
      target,
      artKey,
    });
  }

  state._artTargetInFlight = null;

  // Check knockdown — runs AFTER hooks so handler-side state changes (e.g.
  // a healing effect via ON_DAMAGE_TAKEN) can be observed before the
  // member is finally processed.
  if (result.knockedDown) {
    processKnockdown(state, p, target, opponent);
  }

  return state;
}

function processKnockdown(state, attackerPlayer, target, opponent) {
  const targetCard = getCard(target.cardId);
  const isBuzz = targetCard?.bloom === '1st Buzz';
  const baseLifeCost = isBuzz ? 2 : 1;

  addLog(state, `  ${targetCard?.name || ''} 被擊倒！${isBuzz ? '(Buzz 生命 -2)' : ''}`);

  // Snapshot the killed member's pre-archive context so post-archive
  // broadcast handlers can read where it was, what was attached, and how
  // big its bloom stack was (for "return member + stack to hand" effects).
  let knockedOutZone = null;
  if (opponent.zones[ZONE.CENTER]?.instanceId === target.instanceId) knockedOutZone = 'center';
  else if (opponent.zones[ZONE.COLLAB]?.instanceId === target.instanceId) knockedOutZone = 'collab';
  else if ((opponent.zones[ZONE.BACKSTAGE] || []).some(m => m.instanceId === target.instanceId)) knockedOutZone = 'backstage';

  const knockedOutStackIds = (target.bloomStack || []).map(e =>
    typeof e === 'string' ? e : e?.cardId
  ).filter(Boolean);
  const knockedOutSupportCardIds = (target.attachedSupport || []).map(s => s.cardId);

  // Fire ON_KNOCKDOWN BEFORE archiving so handlers can react. Handlers can:
  //   • set ctx.cancelKnockdown = true     → skip archive + life loss
  //   • set ctx.lifeLossDelta = -N / +N    → adjust life cost (clamped to 0)
  // (e.g. hSD09-007 不知火フレア: opp turn + own life < opp life → -1)
  const knockdownCtx = {
    cardId: target.cardId,
    player: 1 - attackerPlayer,
    memberInst: target,
    attackerPlayer,
    cancelKnockdown: false,
    lifeLossDelta: 0,
    knockedOutZone,
    knockedOutStackIds,
    knockedOutSupportCardIds,
  };
  fireEffect(state, HOOK.ON_KNOCKDOWN, knockdownCtx);

  if (knockdownCtx.cancelKnockdown) {
    // Handler already moved the member elsewhere (e.g. to hand) — skip
    // archiving and life loss. Reset damage on the instance if still on stage.
    addLog(state, `  擊倒被效果取消 (${targetCard?.name || ''})`);
    return;
  }

  // Archive the knocked-down member and all attached cards (+ bloom stack)
  archiveMember(opponent, target.instanceId);

  // Broadcast: fire ON_KNOCKDOWN with triggerEvent='member_knocked' to all
  // OTHER stage members on both sides BEFORE life loss is applied — so
  // observer handlers can also adjust ctx.lifeLossDelta (e.g. hBP07-044
  // 尾丸ポルカ: own Buzz with fan knocked + oshi is ポルカ → −1 life).
  // We accumulate deltas from all firings into a single broadcastDelta.
  const opponentIdx = 1 - attackerPlayer;
  let broadcastDelta = 0;
  for (let idx = 0; idx < 2; idx++) {
    const pl = state.players[idx];
    if (!pl) continue;
    const stageMembers = [
      pl.zones[ZONE.CENTER], pl.zones[ZONE.COLLAB],
      ...(pl.zones[ZONE.BACKSTAGE] || []),
    ].filter(Boolean);
    for (const m of stageMembers) {
      if (m.instanceId === target.instanceId) continue; // killed member already archived
      const broadcastCtx = {
        cardId: m.cardId,
        player: idx,
        memberInst: m,
        triggerEvent: 'member_knocked',
        knockedOutCardId: target.cardId,
        knockedOutInstanceId: target.instanceId,
        knockedOutPlayer: opponentIdx,
        attackerPlayer,
        knockedOutZone,
        knockedOutStackIds,
        knockedOutSupportCardIds,
        lifeLossDelta: 0,
      };
      fireEffect(state, HOOK.ON_KNOCKDOWN, broadcastCtx);
      broadcastDelta += (broadcastCtx.lifeLossDelta || 0);
    }
  }

  // Life loss (handler-adjusted from BOTH single-fire AND broadcast, clamped to 0)
  const totalDelta = (knockdownCtx.lifeLossDelta || 0) + broadcastDelta;
  const lifeCost = Math.max(0, baseLifeCost + totalDelta);
  if (lifeCost !== baseLifeCost) {
    addLog(state, `  生命損失調整 ${baseLifeCost} → ${lifeCost}`);
  }
  const lifeCheerToAssign = [];
  for (let i = 0; i < lifeCost; i++) {
    if (opponent.zones[ZONE.LIFE].length > 0) {
      const lifeCard = opponent.zones[ZONE.LIFE].shift();
      lifeCard.faceDown = false;
      lifeCheerToAssign.push(lifeCard);
    }
  }

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

  // Queue life cheer assignment for the opponent to choose.
  // (Note: broadcast already ran earlier — before life loss — so observer
  // handlers can influence lifeLossDelta and run their own state mutations
  // pre-life. See the broadcast loop above.)
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

  // Fire effectG for "performance phase start" trigger — e.g. hBP07-056
  // クロニー 2nd: "let another クロニー bloom from this card's stack"
  const stage = [
    state.players[p].zones[ZONE.CENTER],
    state.players[p].zones[ZONE.COLLAB],
    ...(state.players[p].zones[ZONE.BACKSTAGE] || []),
  ].filter(Boolean);
  for (const m of stage) {
    fireEffect(state, HOOK.ON_PASSIVE_GLOBAL, {
      cardId: m.cardId, player: p, memberInst: m, triggerEvent: 'performance_start',
    });
  }

  return state;
}

function endPerformance(state) {
  state.phase = PHASE.END;
  return processEndPhase(state);
}

function processEndPhase(state) {
  const p = state.activePlayer;
  const player = state.players[p];

  // 1. "Until end of turn" effects expire — clear any queued turn boosts/modifiers
  state._turnBoosts = [];
  state._turnModifiers = [];

  // Fire ON_TURN_END hook so passive handlers can react (cleanup, draws, etc.)
  fireEffect(state, HOOK.ON_TURN_END, { player: p });

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

  // Extra-turn check (e.g. クロニー SP "take another turn after this round").
  // The skill handler set state.extraTurnQueued to its player index.
  if (state.extraTurnQueued === p) {
    state.extraTurnQueued = null;
    state.turnNumber++;
    state.phase = PHASE.RESET;
    addLog(state, `--- P${p + 1} 額外回合開始（クロニー SP）---`);
    return state;
  }

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

// Fire ON_PASSIVE_GLOBAL for every member currently on either side's stage, plus any
// attached support that has passive effect text. Used at damage-calc time so "while on
// stage" modifiers affect the current attack. Handlers push DAMAGE_BOOST into _turnBoosts.
function firePassiveModifiers(state, artContext) {
  for (let idx = 0; idx < 2; idx++) {
    const pl = state.players[idx];
    const stageMembers = [pl.zones[ZONE.CENTER], pl.zones[ZONE.COLLAB], ...(pl.zones[ZONE.BACKSTAGE] || [])].filter(Boolean);
    for (const m of stageMembers) {
      // Fire global passive for each stage member
      fireEffect(state, HOOK.ON_PASSIVE_GLOBAL, {
        cardId: m.cardId, player: idx, memberInst: m, ...artContext,
      });
      // Fire passive from attached support (tool/mascot) — their effects often act as board-wide modifiers
      if (Array.isArray(m.attachedSupport)) {
        for (const sup of m.attachedSupport) {
          fireEffect(state, HOOK.ON_PASSIVE_GLOBAL, {
            cardId: sup.cardId, player: idx, memberInst: m, attachedSupport: sup, ...artContext,
          });
        }
      }
    }
  }
}

// Fire an effect hook, queue prompt if needed
function fireEffect(state, hookType, context) {
  try {
    const result = triggerEffect(state, hookType, context);
    if (result.prompt) {
      // Queue prompts instead of clobbering. The active prompt lives in
      // state.pendingEffect; pending queue drains in arrival order once
      // each is resolved via EFFECT_RESPONSE.
      if (state.pendingEffect) {
        if (!state.pendingEffectQueue) state.pendingEffectQueue = [];
        state.pendingEffectQueue.push(result.prompt);
      } else {
        state.pendingEffect = result.prompt;
      }
    }
    if (result.log) {
      addLog(state, `  [效果] ${result.log}`);
    }
    // Store turn-scoped modifiers (boosts/reductions/cancel all consumed in processUseArt)
    if (result.effect && (
      result.effect.type === 'DAMAGE_BOOST' ||
      result.effect.type === 'DAMAGE_REDUCTION' ||
      result.effect.type === 'DAMAGE_CANCEL'
    )) {
      if (!state._turnBoosts) state._turnBoosts = [];
      state._turnBoosts.push(result.effect);
    }
  } catch (e) {
    // Effect errors should not crash the game
    console.warn('Effect error:', e);
  }
  // After every effect, sweep stage members whose damage now exceeds HP and
  // archive them. Effect-driven (special) damage doesn't go through the
  // art-attack knockdown path that costs life — per game rules, special
  // damage explicitly does not reduce the opponent's life value, even when
  // it knocks out a member. Ignored when the EffectResolver itself is
  // drained mid-prompt — those calls don't carry pending damage.
  sweepEffectKnockouts(state);
}

// Archive any stage member whose damage now exceeds their effective HP
// (base HP + equipment buffs). This handles non-art knockouts (effects with
// "deal N special damage to X"). NO life loss — that only happens when
// processKnockdown fires from the art-attack path. Stage-empty win check
// runs at the end so multiple knockouts in one effect don't crash the loop.
//
// Exported so EffectResolver can call it after a player-picked damage
// resolution (e.g. SELECT_TARGET → OPP_MEMBER_DAMAGE).
export function sweepEffectKnockouts(state) {
  // Don't sweep mid-game-over.
  if (state.winner != null || state.phase === PHASE.GAME_OVER) return;
  for (let idx = 0; idx < 2; idx++) {
    const pl = state.players[idx];
    if (!pl) continue;
    const stage = [pl.zones[ZONE.CENTER], pl.zones[ZONE.COLLAB], ...(pl.zones[ZONE.BACKSTAGE] || [])].filter(Boolean);
    for (const m of stage) {
      // Skip the member that's currently the art-attack target — its
      // knockdown is handled by processKnockdown so ON_KNOCKDOWN handlers
      // can observe the member still on stage (e.g. for life-loss reduction
      // and cancelKnockdown decisions).
      if (state._artTargetInFlight && m.instanceId === state._artTargetInFlight) continue;
      const card = getCard(m.cardId);
      if (!card?.hp) continue;
      const effectiveHp = card.hp + getExtraHp(m) + getMemberSelfExtraHp(m);
      if (m.damage >= effectiveHp) {
        addLog(state, `  ${card.name} 因效果傷害被擊倒（不扣生命）`);
        archiveMember(pl, m.instanceId);
      }
    }
  }
  // Stage-empty win check (any side that lost their entire stage to effect dmg).
  for (let idx = 0; idx < 2; idx++) {
    const pl = state.players[idx];
    if (!pl) continue;
    if (getStageCount(pl) === 0 && state.phase !== PHASE.SETUP && state.phase !== PHASE.MULLIGAN) {
      state.winner = 1 - idx;
      state.phase = PHASE.GAME_OVER;
      addLog(state, `P${(2-idx)} 獲勝！對手舞台無成員！`);
      return;
    }
  }
}

// Called when the current pending effect resolves — advances to the next
// queued prompt if any. Call sites are wherever state.pendingEffect = null.
export function advancePendingEffect(state) {
  state.pendingEffect = null;
  if (state.pendingEffectQueue && state.pendingEffectQueue.length > 0) {
    state.pendingEffect = state.pendingEffectQueue.shift();
  }
}
