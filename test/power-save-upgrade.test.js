import assert from 'node:assert/strict';
import test from 'node:test';
import { tracksForOrigins } from '../src/catalog.js';
import { availablePowerIds, gameReducer, startGame } from '../src/game.js';
import { createMatchStore, progressKey, saveKey } from '../src/saved-match.js';

const players = ['Azul', 'Verde'];
const deck = tracksForOrigins(['classicos-br']).slice(0, 5);
const hintIds = ['mainArtist', 'titleInitials', 'chorus'];

function storageWith(game, version) {
  const data = new Map();
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
  const match = { id: 'teste-legado', players, game };
  if (version === 1) storage.setItem(saveKey, JSON.stringify({ version, match }));
  else createMatchStore(() => storage).commit(null, match);
  return storage;
}

function start() {
  return startGame({ players, goal: 15, powersEnabled: true }, deck);
}

function legacyGame() {
  const game = start();
  delete game.hint;
  game.teams.forEach((team, index) => {
    for (const id of hintIds) delete team.powers[id];
    delete team.powers.doublePoints;
    team.doubleUsed = index === 1;
  });
  return game;
}

for (const version of [1, 2]) {
  test('retoma sorteio pendente v' + version + ' sem reaplicar os pontos ou perder o estoque antigo', () => {
    const game = legacyGame();
    delete game.powerSkipped;
    for (const team of game.teams) delete team.powers.skipTrack;
    // A previous release credited one origin point even on a general playlist.
    game.teams[0].score = 3;
    game.teams[1].powers.secondGuess = 1;
    game.phase = 'choosePower';
    game.marks = { title: true, origin: true, fast: true };
    game.award = { team: 0, points: 3, power: null };
    const disk = storageWith(game, version);
    const store = createMatchStore(() => disk);
    const pending = store.getSnapshot().match;
    assert.equal(pending.game.powerSkipped, false);
    assert.equal(pending.game.hint, null);
    assert.ok(pending.game.teams.every(t => hintIds.every(id => t.powers[id] === 0)));
    assert.deepEqual(pending.game.teams.map(t => t.powers.skipTrack), [0, 0]);
    assert.deepEqual(pending.game.teams.map(t => t.powers.doublePoints), [1, 0]);
    assert.equal(pending.game.phase, 'choosePower');

    const options = availablePowerIds(pending.game);
    const draw = (options.indexOf('skipTrack') + 0.5) / options.length;
    const awarded = gameReducer(pending.game, { type: 'drawReward', draw, skipAnimation: true });
    assert.equal(awarded.phase, 'award');
    assert.equal(awarded.teams[0].score, 3);
    assert.equal(awarded.award.points, 3);
    assert.equal(awarded.award.power, 'skipTrack');
    assert.equal(awarded.teams[0].powers.skipTrack, 1);
    assert.equal(awarded.teams[1].powers.secondGuess, 1);
    assert.ok(store.commit(pending, { ...pending, game: awarded }));
    const reopened = createMatchStore(() => disk).getSnapshot().match.game;
    assert.deepEqual(reopened, awarded);
    assert.equal(gameReducer(reopened, { type: 'drawReward', draw: 0 }), reopened);
    assert.equal(gameReducer(reopened, { type: 'advance' }).round, pending.game.round + 1);
  });

  test('preserva rodada dobrada e converte cada bônus uma única vez na v' + version, () => {
    const legacy = legacyGame();
    Object.assign(legacy, { round: 2, trackIndex: 2, doubled: true, opened: true });
    legacy.teams[0].score = 3;
    legacy.teams[1].score = 4;
    legacy.teams[1].swapUsed = true;
    legacy.teams[1].powers.secondGuess = 2;
    const disk = storageWith(legacy, version);
    const store = createMatchStore(() => disk);
    const match = store.getSnapshot().match;
    const game = match.game;
    assert.deepEqual([game.round, game.trackIndex, game.opened, game.doubled], [2, 2, true, true]);
    assert.deepEqual(game.deck, deck);
    assert.deepEqual(game.teams.map(t => t.score), [3, 4]);
    assert.deepEqual(game.teams.map(t => t.powers.doublePoints), [1, 0]);
    assert.ok(game.teams.every(t => !Object.hasOwn(t, 'doubleUsed')));
    assert.equal(game.teams[1].powers.secondGuess, 2);
    assert.equal(game.teams[1].swapUsed, true);

    const next = [
      { type: 'reveal' },
      { type: 'mark', mark: 'title', checked: true },
      { type: 'mark', mark: 'origin', checked: true },
      { type: 'score', skipAnimation: true },
    ].reduce(gameReducer, game);
    assert.deepEqual(next.teams.map(t => t.score), [3, 8]);
    assert.equal(next.round, 3);
    assert.equal(next.doubled, false);
    assert.ok(store.commit(match, { ...match, game: next }));
    const restored = createMatchStore(() => disk);
    const current = restored.getSnapshot().match;
    const spent = gameReducer(current.game, { type: 'usePower', sourceTeam: 0, targetTeam: 0, power: 'doublePoints' });
    assert.equal(spent.teams[0].powers.doublePoints, 0);
    assert.equal(spent.doubled, true);
    const writes = [];
    const write = disk.setItem;
    disk.setItem = (key, value) => { writes.push(key); write(key, value); };
    assert.ok(restored.commit(current, { ...current, game: spent }));
    assert.deepEqual(writes, [progressKey(current.id)]);
    assert.deepEqual(createMatchStore(() => disk).getSnapshot().match.game, spent);
  });
}

test('restaura o saldo de dicas de cada equipe e rejeita a dica com valor ou faixa incompatível', () => {
  const game = start();
  game.teams[0].powers.mainArtist = 2;
  game.teams[1].powers.chorus = 3;
  const hinted = gameReducer(game, { type: 'usePower', sourceTeam: 0, targetTeam: 0, power: 'mainArtist' });
  for (const version of [1, 2]) {
    const restored = createMatchStore(() => storageWith(hinted, version)).getSnapshot().match.game;
    assert.deepEqual(restored, hinted);
    const invalidHints = [false, 'chorus', {}, { power: 'instrumental', trackIndex: 0 },
      { power: '__proto__', trackIndex: 0 }, { power: 'chorus', trackIndex: -1 },
      { power: 'chorus', trackIndex: 0.5 }, { power: 'chorus', trackIndex: 1 }];
    for (const hint of invalidHints) {
      assert.equal(createMatchStore(() => storageWith({ ...hinted, hint }, version)).getSnapshot().issue, 'invalid');
    }
    const stale = { ...hinted, round: 2, trackIndex: 1 };
    const disabled = { ...hinted, powersEnabled: false };
    for (const invalid of [stale, disabled]) {
      assert.equal(createMatchStore(() => storageWith(invalid, version)).getSnapshot().issue, 'invalid');
    }
    for (const id of hintIds) {
      const invalid = structuredClone(hinted);
      invalid.teams[0].powers[id] = -1;
      assert.equal(createMatchStore(() => storageWith(invalid, version)).getSnapshot().issue, 'invalid');
    }
  }
});

test('retoma uma recompensa antiga de seis pontos dobrados em uma faixa geral já pontuada', () => {
  const game = start();
  game.phase = 'award';
  game.doubled = true;
  game.marks = { title: true, origin: true, fast: true };
  game.teams[0].score = 6;
  game.teams[0].powers.secondGuess = 1;
  game.award = { team: 0, points: 6, power: 'secondGuess' };
  const disk = storageWith(game, 1);
  const store = createMatchStore(() => disk);
  const restored = store.getSnapshot().match.game;
  assert.equal(restored.teams[0].score, 6);
  assert.deepEqual(restored.award, game.award);
  const next = gameReducer(restored, { type: 'advance' });
  assert.equal(next.round, 2);
  assert.equal(next.teams[0].score, 6);
  assert.equal(next.teams[0].powers.secondGuess, 1);
});

test('uma origem geral marcada antes de confirmar a rodada sai da pontuação ao retomar', () => {
  const game = start();
  game.phase = 'reveal';
  game.teams[0].score = 5;
  game.marks = { title: true, origin: true, fast: false };
  const disk = storageWith(game, 2);
  const restored = createMatchStore(() => disk).getSnapshot().match.game;
  assert.deepEqual(restored.marks, { title: true, origin: false, fast: false, rebound: false });
  assert.equal(restored.teams[0].score, 5);
  const next = gameReducer(restored, { type: 'score', skipAnimation: true });
  assert.equal(next.teams[0].score, 7);
});

test('estoque de dobro salvo tem precedência e campos ausentes ou inválidos são rejeitados', () => {
  const mixed = legacyGame();
  mixed.teams[0].powers.doublePoints = 0;
  mixed.teams[1].powers.doublePoints = 2;
  const restored = createMatchStore(() => storageWith(mixed, 1)).getSnapshot().match.game;
  assert.deepEqual(restored.teams.map(t => t.powers.doublePoints), [0, 2]);
  assert.ok(restored.teams.every(t => !Object.hasOwn(t, 'doubleUsed')));
  for (const value of [null, -1, 0.5, '1']) {
    const game = legacyGame();
    game.teams[0].powers.doublePoints = value;
    assert.equal(createMatchStore(() => storageWith(game, 1)).getSnapshot().issue, 'invalid');
  }
  for (const value of [undefined, null, 0, 'false']) {
    const game = legacyGame();
    game.teams[0].doubleUsed = value;
    assert.equal(createMatchStore(() => storageWith(game, 2)).getSnapshot().issue, 'invalid');
  }
});

test('retoma a mesma faixa depois de usar o pulo e rejeita novos campos inválidos', () => {
  const game = start();
  game.teams[0].powers.skipTrack = 1;
  const skipped = gameReducer(game, { type: 'usePower', sourceTeam: 0, targetTeam: 0, power: 'skipTrack' });
  assert.equal(skipped.powerSkipped, true);
  assert.equal(skipped.trackIndex, 1);
  const disk = storageWith(skipped, 2);
  assert.deepEqual(createMatchStore(() => disk).getSnapshot().match.game, skipped);

  for (const invalid of [null, -1, 0.5, '1']) {
    const fixture = structuredClone(skipped);
    fixture.teams[0].powers.skipTrack = invalid;
    assert.equal(createMatchStore(() => storageWith(fixture, 1)).getSnapshot().issue, 'invalid');
  }
  for (const invalid of [null, 1, 'false']) {
    const fixture = { ...skipped, powerSkipped: invalid };
    assert.equal(createMatchStore(() => storageWith(fixture, 1)).getSnapshot().issue, 'invalid');
  }
});
