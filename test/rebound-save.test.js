import assert from 'node:assert/strict';
import test from 'node:test';
import { tracksForOrigins } from '../src/catalog.js';
import { gameReducer, getLastRound, startGame } from '../src/game.js';
import { createMatchStore, progressKey, saveKey } from '../src/saved-match.js';

const players = ['Azul', 'Verde', 'Roxa'];
const deck = tracksForOrigins(['my-mind']).slice(0, 5);
const id = 'teste-rebote';
const key = progressKey(id);
const deckKey = 'faixa-oculta.baralho.' + id;
const start = (goal = 10) => startGame({ players, goal, powersEnabled: true }, deck);
const use = (power, sourceTeam, targetTeam) => ({ type: 'usePower', power, sourceTeam, targetTeam });
const mark = name => ({ type: 'mark', mark: name, checked: true });
const score = { type: 'score', skipAnimation: true };
const apply = (game, ...actions) => actions.reduce(gameReducer, game);

// Encode each historical layout directly so the current writer cannot repair the test fixture.
function diskWith(game, version = 2) {
  const values = new Map();
  const disk = {
    getItem: k => values.get(k) ?? null,
    setItem: (k, value) => values.set(k, value),
    removeItem: k => values.delete(k),
  };
  if (version === 1) disk.setItem(saveKey, JSON.stringify({ version, match: { id, players, game } }));
  else {
    const { deck, goal, ...progress } = game;
    disk.setItem(saveKey, JSON.stringify({ version, id }));
    disk.setItem(deckKey, JSON.stringify({ id, players, deck, goal, powersEnabled: game.powersEnabled }));
    disk.setItem(key, JSON.stringify(progress));
  }
  return disk;
}

function saveAndReload(disk, ...actions) {
  const store = createMatchStore(() => disk);
  const before = store.getSnapshot().match;
  const game = apply(before.game, ...actions);
  assert.ok(store.commit(before, { ...before, game }));
  const { match, issue } = createMatchStore(() => disk).getSnapshot();
  assert.equal(issue, null);
  assert.deepEqual(match.game, game);
  return match.game;
}

test('v1 e v2 anteriores ao rebote restauram estoque zero sem aumentar o progresso em disco', () => {
  for (const version of [1, 2]) {
    const game = start();
    delete game.reboundTeam;
    game.marks = { title: false, origin: false, fast: false };
    for (const team of game.teams) delete team.powers.rebound;
    game.teams[1].score = 4;
    const disk = diskWith(game, version);
    const resumed = createMatchStore(() => disk).getSnapshot().match.game;
    assert.equal(resumed.reboundTeam, null);
    assert.equal(resumed.marks.rebound, false);
    assert.deepEqual(resumed.teams.map(t => t.powers.rebound), [0, 0, 0]);
    assert.deepEqual(resumed.teams.map(t => t.score), [0, 4, 0]);
    const next = saveAndReload(disk, { type: 'reveal' }, score);
    assert.equal(next.round, 2);
    assert.doesNotMatch(disk.getItem(key), /"rebound(?:Team|Points)?"/);
    assert.deepEqual(JSON.parse(disk.getItem(saveKey)), { version: 2, id });
  }
});

test('retoma o rebote armado, a marcação e o resultado sem aplicar novamente pontos ou gasto', () => {
  const first = start();
  first.teams[2].powers.rebound = 2;
  first.teams[1].powers.tenSeconds = 1;
  const disk = diskWith(first);
  const setup = disk.getItem(deckKey);
  const armed = saveAndReload(disk, use('tenSeconds', 1, 0), { type: 'openTrack' }, use('rebound', 2, 0));
  assert.equal(armed.reboundTeam, 2);
  assert.equal(armed.teams[2].powers.rebound, 1);
  assert.equal(armed.effect, 'tenSeconds');
  assert.equal(armed.effectSource, 1);
  assert.equal(gameReducer(armed, use('rebound', 2, 0)), armed);
  const marked = saveAndReload(disk, { type: 'reveal' }, mark('origin'), mark('rebound'));
  assert.equal(marked.marks.rebound, true);
  assert.deepEqual(marked.teams.map(t => t.score), [0, 0, 0]);
  const awarded = saveAndReload(disk, { type: 'score' });
  assert.equal(awarded.phase, 'award');
  assert.deepEqual(awarded.award, { team: 0, points: 1, power: null, reboundTeam: 2, reboundPoints: 1 });
  assert.deepEqual(awarded.teams.map(t => t.score), [1, 0, 1]);
  assert.equal(gameReducer(awarded, score), awarded);
  const next = saveAndReload(disk, { type: 'advance' });
  assert.equal(next.reboundTeam, null);
  assert.equal(next.marks.rebound, false);
  assert.equal(getLastRound(next).rebound, true);
  assert.equal(getLastRound(next).reboundTeam, 2);
  assert.equal(next.teams[2].powers.rebound, 1);
  assert.equal(disk.getItem(deckKey), setup);
});

test('o placar final restaurado reconhece a rival vencedora e a prioridade da equipe da vez no empate', () => {
  for (const bothAtGoal of [false, true]) {
    const game = start(1);
    game.teams[2].powers.rebound = 1;
    const judging = apply(game, { type: 'openTrack' }, use('rebound', 2, 0), { type: 'reveal' }, mark('rebound'));
    const result = saveAndReload(diskWith(judging), ...(bothAtGoal ? [mark('origin')] : []), score);
    assert.equal(result.phase, 'finished');
    assert.equal(result.winner, bothAtGoal ? 0 : 2);
    assert.equal(result.award.reboundPoints, 1);
    assert.equal(getLastRound(result).reboundTeam, 2);
  }
});

test('um registro inválido de rebote desabilita a correção e conserva a partida e os pontos', () => {
  const game = start();
  game.teams[2].powers.rebound = 1;
  const next = apply(game, { type: 'openTrack' }, use('rebound', 2, 0), { type: 'reveal' }, mark('rebound'), score);
  const damaged = { ...next, lastRound: { ...next.lastRound, reboundTeam: 0 } };
  const restored = createMatchStore(() => diskWith(damaged)).getSnapshot();
  assert.equal(restored.issue, null);
  assert.deepEqual(restored.match.game, { ...next, lastRound: null });
  assert.equal(getLastRound(restored.match.game), null);
});

test('vitória retroativa por rebote conserva a rodada suspensa da próxima equipe e seu próprio rebote', () => {
  for (const phase of ['listen', 'reveal']) {
    const first = start(3);
    first.teams[2].score = 2;
    first.teams[2].powers.rebound = 1;
    first.teams[0].powers.rebound = 1;
    const disk = diskWith(first);
    saveAndReload(disk, { type: 'openTrack' }, use('rebound', 2, 0), { type: 'reveal' }, score);
    const actions = [{ type: 'openTrack' }, use('rebound', 0, 1)];
    if (phase === 'reveal') actions.push({ type: 'reveal' }, mark('rebound'));
    const next = saveAndReload(disk, ...actions);
    assert.equal(next.round, 2);
    assert.equal(next.reboundTeam, 0);
    const correction = { type: 'correctLastRound', round: 1, title: false, origin: false, rebound: true };
    const won = saveAndReload(disk, correction);
    assert.equal(won.phase, 'finished');
    assert.equal(won.winner, 2);
    assert.equal(won.award.reboundTeam, 2);
    assert.equal(won.reboundTeam, 0);
    assert.equal(getLastRound(won).resumePhase, phase);
    assert.deepEqual(won.teams.map(t => t.score), [0, 0, 3]);
    const back = saveAndReload(disk, { ...correction, rebound: false });
    assert.deepEqual(back, next);
  }
});

test('rejeita adversários, marcações, estoque, efeitos e créditos de rebote inválidos', () => {
  const game = start();
  game.teams[2].powers.rebound = 1;
  const armed = apply(game, { type: 'openTrack' }, use('rebound', 2, 0));
  const scoring = apply(armed, { type: 'reveal' }, mark('rebound'), { type: 'score' });
  const invalid = [
    ...[-1, 3, 0, '2', 1.5].map(reboundTeam => ({ ...armed, reboundTeam })),
    { ...armed, opened: false }, { ...armed, powersEnabled: false },
    { ...armed, marks: { ...armed.marks, rebound: true } },
    { ...armed, phase: 'reveal', marks: { ...armed.marks, rebound: 1 } },
    { ...armed, phase: 'reveal', marks: { ...armed.marks, title: true, rebound: true } },
    { ...game, phase: 'reveal', marks: { ...game.marks, rebound: true } },
    { ...armed, effect: 'rebound', effectSource: 2 }, { ...armed, nextEffect: 'rebound' },
    ...[{ reboundTeam: 0 }, { reboundTeam: 1 }, { reboundTeam: '2' }, { reboundPoints: 0 },
      { reboundPoints: 2 }, { reboundPoints: true }].map(changes =>
      ({ ...scoring, award: { ...scoring.award, ...changes } })),
  ];
  const badStock = structuredClone(game);
  badStock.teams[0].powers.rebound = -1;
  invalid.push(badStock);
  for (const version of [1, 2]) {
    for (const state of invalid) {
      assert.equal(createMatchStore(() => diskWith(state, version)).getSnapshot().issue, 'invalid');
    }
  }
});
