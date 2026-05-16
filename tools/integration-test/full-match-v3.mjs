// Round-3 full-match: e2e equipment + REGISTRY effects fire correctly during processAction.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/showmaker/hololive-card-meta/';
globalThis.fetch = async u => {
  let f = u;
  if (f.startsWith('../game/effects/')) f = path.join(ROOT, 'web/game/effects/', f.slice(16));
  else if (f.startsWith('../data/')) f = path.join(ROOT, 'web/data/', f.slice(8));
  else if (f.startsWith('../')) f = path.join(ROOT, 'web/', f.slice(3));
  return { ok: true, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) };
};
const CardDB = await import(path.join(ROOT, 'web/game/core/CardDatabase.js'));
await CardDB.loadCardsFromFile(path.join(ROOT, 'web/data/cards.json'));
const old = console.log; console.log = () => {};
const { initEffects } = await import(path.join(ROOT, 'web/game/effects/registerAll.js'));
await initEffects();
console.log = old;

const { processAction } = await import(path.join(ROOT, 'web/game/core/GameEngine.js'));
const { ACTION, PHASE, ZONE, MEMBER_STATE, parseCost } = await import(path.join(ROOT, 'web/game/core/constants.js'));
const { createCardInstance } = await import(path.join(ROOT, 'web/game/core/GameState.js'));

let p = 0, f = 0;
const ok = (cond, label) => { if (cond) p++; else f++; console.log(`  ${cond ? '✓' : '✗'} ${label}`); };

function newPlayer() {
  return {
    zones: { [ZONE.CENTER]: null, [ZONE.COLLAB]: null, [ZONE.BACKSTAGE]: [], [ZONE.DECK]: [], [ZONE.HAND]: [], [ZONE.ARCHIVE]: [], [ZONE.HOLO_POWER]: [], [ZONE.CHEER_DECK]: [], [ZONE.LIFE]: [createCardInstance('hY01-001'), createCardInstance('hY01-001'), createCardInstance('hY01-001')] },
    oshi: { cardId: 'hBP01-001', usedSp: false },
    performedArts: { center: false, collab: false },
    usedCollab: false, usedBaton: false, usedLimited: false,
    oshiSkillUsedThisTurn: false,
    _limitedSupportsThisTurn: 0, _activitiesPlayedThisTurn: 0, _namesUsedArtThisTurn: [],
  };
}
function placeCard(p, zone, cardId, opts = {}) {
  const inst = createCardInstance(cardId);
  inst.attachedCheer = opts.cheer || [];
  inst.attachedSupport = (opts.supports || []).map(id => ({ cardId: id, instanceId: 'sup-' + id }));
  inst.damage = opts.damage || 0; inst.bloomStack = []; inst.state = MEMBER_STATE.ACTIVE;
  if (zone === ZONE.BACKSTAGE) p.zones[zone].push(inst); else p.zones[zone] = inst;
  return inst;
}

console.log('═══ E2E: equipment art-boost effective during real attack ═══');
{
  // hBP06-099 ゆび (art +10, universal) attached to attacker; verify damage application
  const state = {
    activePlayer: 0, turnNumber: 5, phase: PHASE.PERFORMANCE, winner: null,
    players: [newPlayer(), newPlayer()], log: [], firstTurn: [false, false], firstPlayer: 0,
  };
  const cards = JSON.parse(fs.readFileSync(ROOT + 'web/data/cards.json', 'utf8'));
  const attacker1st = cards.find(c => c.id === 'hBP01-011');  // 1st かなた art1=20
  ok(attacker1st != null, 'hBP01-011 exists');
  // hBP01-011 art1 cost: 1 white. Provide a white cheer.
  const cheer = [createCardInstance('hY01-001')];
  placeCard(state.players[0], ZONE.CENTER, 'hBP01-011', { cheer, supports: ['hBP06-099'] });
  const target = placeCard(state.players[1], ZONE.CENTER, 'hBP01-051');  // 250 HP red 1st Buzz
  const r = processAction(state, { type: ACTION.USE_ART, position: 'center', artIndex: 0, targetPosition: 'center' });
  ok(!r.error, `attack with ゆび: no error (${r.error || 'OK'})`);
  const newTarget = r.state.players[1].zones[ZONE.CENTER];
  ok(newTarget?.damage === 30, `target damage = 30 (20 base + 10 ゆび), got ${newTarget?.damage}`);
}

console.log('\n═══ E2E: passive observer reduces damage on Anya center ═══');
{
  const state = {
    activePlayer: 0, turnNumber: 5, phase: PHASE.PERFORMANCE, winner: null,
    players: [newPlayer(), newPlayer()], log: [], firstTurn: [false, false], firstPlayer: 0,
  };
  // Attacker (P0) art with cheer (1 white for hBP01-011)
  const cheer = [createCardInstance('hY01-001')];
  placeCard(state.players[0], ZONE.CENTER, 'hBP01-011', { cheer });
  // P1 has Anya (hBP04-074) in center → -10 incoming dmg
  placeCard(state.players[1], ZONE.CENTER, 'hBP04-074');
  const r = processAction(state, { type: ACTION.USE_ART, position: 'center', artIndex: 0, targetPosition: 'center' });
  ok(!r.error, 'attack succeeds');
  const newTarget = r.state.players[1].zones[ZONE.CENTER];
  // Base 20, no special attack bonus (hBP01-011 has no specialAttackImage),
  // Anya passive observer reduces by 10 → final 10.
  ok(newTarget?.damage === 10, `Anya center damage = 10 (20 base - 10 passive), got ${newTarget?.damage}`);
}

console.log('\n═══ E2E: hBP06-099 ゆび on 1st Buzz still gives +10 ═══');
{
  const state = {
    activePlayer: 0, turnNumber: 5, phase: PHASE.PERFORMANCE, winner: null,
    players: [newPlayer(), newPlayer()], log: [], firstTurn: [false, false], firstPlayer: 0,
  };
  const cards = JSON.parse(fs.readFileSync(ROOT + 'web/data/cards.json', 'utf8'));
  // 1st Buzz attacker
  const buzz = cards.find(c => c.bloom === '1st Buzz' && c.type === '成員' && c.art1?.damage);
  if (!buzz) { console.log('  ⚠ skip: no 1st Buzz with art1'); }
  else {
    const cost = parseCost(buzz.art1.image || []);
    const cheer = [];
    for (const [c, n] of Object.entries(cost)) {
      if (c === 'total' || c === 'colorless') continue;
      const map = { white:'hY01-001', green:'hY02-001', red:'hY03-001', blue:'hY04-001', purple:'hY05-001', yellow:'hY06-001' };
      for (let i = 0; i < n; i++) cheer.push(createCardInstance(map[c] || 'hY01-001'));
    }
    for (let i = 0; i < (cost.colorless || 0); i++) cheer.push(createCardInstance('hY01-001'));
    placeCard(state.players[0], ZONE.CENTER, buzz.id, { cheer, supports: ['hBP06-099'] });
    placeCard(state.players[1], ZONE.CENTER, 'hBP01-051');
    const r = processAction(state, { type: ACTION.USE_ART, position: 'center', artIndex: 0, targetPosition: 'center' });
    ok(!r.error, `Buzz attack: ${r.error || 'OK'}`);
    const baseDmg = parseInt((buzz.art1.damage+'').match(/\d+/)?.[0] || '0', 10);
    const target = r.state.players[1].zones[ZONE.CENTER];
    // Allow special-attack color bonus, but base + 10 ゆび should be at least baseDmg + 10
    ok(target?.damage >= baseDmg + 10, `Buzz dmg ≥ ${baseDmg}+10, got ${target?.damage}`);
  }
}

console.log(`\n══ Full match v3: ${p}/${p+f} passed ══`);
process.exit(f > 0 ? 1 : 0);
