import assert from 'node:assert/strict';
import test from 'node:test';
import { availablePowerIds, gameReducer, getRound, powerBlockReason, startGame, usablePowerIds } from '../src/game.js';
import { createMatchStore, progressKey, saveKey } from '../src/saved-match.js';
import { tracksForOrigins } from '../src/catalog.js';

const hintIds = ['mainArtist', 'titleInitials', 'chorus'];
const ownPowerIds = ['secondGuess', 'skipTrack', 'doublePoints', ...hintIds];

function drawFor(game, id) {
  const options = availablePowerIds(game);
  assert.ok(options.includes(id));
  return (options.indexOf(id) + 0.5) / options.length;
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: k => data.delete(k),
  };
}

function newMatch(players = ['Azul', 'Verde', 'Sol'], goal = 30) {
  const game = startGame({ players, goal, powersEnabled: true }, tracksForOrigins(['my-mind']));
  return { id: 'teste', players, game };
}

function matchWithPowers() {
  const match = newMatch(['Azul', 'Verde', 'Sol', 'Lua']);
  for (const team of match.game.teams) {
    for (const power of Object.keys(team.powers)) team.powers[power] = 2;
  }
  return match;
}

function legacyPendingMatch() {
  const match = newMatch();
  match.game.phase = 'choosePower';
  match.game.teams[0].score = 2;
  match.game.award = { team: 0, points: 2, power: null };
  match.game.marks = { title: true, origin: false, fast: true };
  return match;
}

function play(store, type, details = {}) {
  const { match } = store.getSnapshot();
  const game = gameReducer(match.game, { type, ...details });
  assert.equal(store.commit(match, { ...match, game }), true);
  return game;
}

test('retoma uma vitória corrigida e restaura o palpite da equipe seguinte', () => {
  const storage = memoryStorage();
  let store = createMatchStore(() => storage);
  const match = newMatch(['Azul', 'Verde'], 3);
  store.commit(null, match);
  play(store, 'reveal');
  play(store, 'mark', { mark: 'title', checked: true });
  play(store, 'score', { skipAnimation: true });
  play(store, 'reveal');
  const current = play(store, 'mark', { mark: 'origin', checked: true });
  const change = { round: 1, title: true, origin: true };
  const win = play(store, 'correctLastRound', change);
  store = createMatchStore(() => storage);
  assert.equal(win.phase, 'finished');
  assert.deepEqual(store.getSnapshot().match.game, win);
  assert.deepEqual(play(store, 'correctLastRound', { ...change, origin: false }), current);
});

test('uma correção salva com índice inválido preserva o restante da partida', () => {
  const storage = memoryStorage();
  const store = createMatchStore(() => storage);
  const match = newMatch();
  store.commit(null, match);
  play(store, 'reveal');
  play(store, 'score', { skipAnimation: true });
  const key = progressKey(match.id);
  const progress = JSON.parse(storage.getItem(key));
  progress.lastRound.trackIndex = -1;
  storage.setItem(key, JSON.stringify(progress));
  const restored = createMatchStore(() => storage);
  assert.equal(restored.getSnapshot().match.game.lastRound, null);
  assert.equal(restored.getSnapshot().match.game.round, 2);
  play(restored, 'reveal');
  assert.equal(play(restored, 'score').lastRound.round, 2);
});

test('ativa poderes em uma partida antiga e retoma sem regravar o baralho', () => {
  const storage = memoryStorage();
  const store = createMatchStore(() => storage);
  const match = newMatch();
  match.game.powersEnabled = false;
  store.commit(null, match);
  play(store, 'reveal');
  play(store, 'mark', { mark: 'title', checked: true });
  play(store, 'score', { skipAnimation: true });

  // Older split saves only have the initial setting in the deck.
  const key = progressKey(match.id);
  const progress = JSON.parse(storage.getItem(key));
  delete progress.powersEnabled;
  storage.setItem(key, JSON.stringify(progress));
  const reopened = createMatchStore(() => storage);
  const before = reopened.getSnapshot().match.game;
  assert.equal(before.powersEnabled, false);
  assert.equal(before.round, 2);
  assert.equal(before.teams[0].score, 2);
  const keysWritten = [];
  const write = storage.setItem;
  storage.setItem = (k, value) => { keysWritten.push(k); write(k, value); };
  const enabled = play(reopened, 'enablePowers');
  assert.deepEqual(enabled, { ...before, powersEnabled: true });
  assert.deepEqual(keysWritten, [key]);
  assert.deepEqual(createMatchStore(() => storage).getSnapshot().match.game, enabled);
});

test('retoma baralho, troca, dobro, revelação e marcas de três equipes', () => {
  const storage = memoryStorage();
  const store = createMatchStore(() => storage);
  const initial = newMatch();
  initial.game.teams[0].powers.doublePoints = 1;
  store.commit(null, initial);
  play(store, 'usePower', { power: 'doublePoints', sourceTeam: 0, targetTeam: 0 });
  play(store, 'openTrack');
  play(store, 'swap');
  play(store, 'openTrack');
  play(store, 'reveal');
  play(store, 'mark', { mark: 'title', checked: true });
  play(store, 'mark', { mark: 'fast', checked: true });
  const recovered = createMatchStore(() => storage).getSnapshot().match;
  assert.deepEqual(recovered, store.getSnapshot().match);
  assert.equal(recovered.game.trackIndex, 1);
  assert.equal(recovered.game.deck[1].url, initial.game.deck[1].url);
  assert.equal(recovered.game.teams[0].swapUsed, true);
  assert.equal(getRound(recovered.game).points, 4);
});

test('sorteia ao pontuar e mantém a mesma recompensa ao reabrir a partida', () => {
  const storage = memoryStorage();
  let store = createMatchStore(() => storage);
  store.commit(null, newMatch());
  play(store, 'reveal');
  play(store, 'mark', { mark: 'title', checked: true });
  play(store, 'mark', { mark: 'fast', checked: true });
  const awarded = play(store, 'score', { draw: 0 });
  assert.equal(awarded.phase, 'award');
  assert.deepEqual(awarded.award, { team: 0, points: 2, power: 'tenSeconds' });
  assert.equal(awarded.teams[0].powers.tenSeconds, 1);
  store = createMatchStore(() => storage);
  assert.deepEqual(store.getSnapshot().match.game, awarded);
  for (const type of ['score', 'drawReward', 'choosePower']) {
    assert.equal(gameReducer(awarded, { type, draw: 0.9 }), awarded);
  }
  play(store, 'advance');
  const game = play(store, 'advance');
  assert.equal(game.round, 2);
  assert.equal(getRound(game).turn, 1);
  assert.deepEqual(game.teams.map(t => t.score), [2, 0, 0]);
  assert.equal(game.teams[0].powers.tenSeconds, 1);
  assert.equal(game.teams[0].powers.readLyrics, 0);
  play(store, 'usePower', { sourceTeam: 0, targetTeam: 1, power: 'tenSeconds' });
  store = createMatchStore(() => storage);
  assert.equal(store.getSnapshot().match.game.effect, 'tenSeconds');
  assert.equal(store.getSnapshot().match.game.effectSource, 0);
  assert.equal(store.getSnapshot().match.game.teams[0].powers.tenSeconds, 0);
  play(store, 'reveal');
  play(store, 'score');
  assert.equal(createMatchStore(() => storage).getSnapshot().match.game.effect, null);
});

test('solo preserva a segunda tentativa e o placar final', () => {
  const storage = memoryStorage();
  const store = createMatchStore(() => storage);
  store.commit(null, newMatch(['Você'], 3));
  play(store, 'reveal');
  play(store, 'mark', { mark: 'title', checked: true });
  play(store, 'mark', { mark: 'fast', checked: true });
  const awarded = play(store, 'score', { draw: 0, skipAnimation: true });
  assert.equal(awarded.phase, 'award');
  assert.equal(awarded.round, 1);
  assert.deepEqual(createMatchStore(() => storage).getSnapshot().match.game, awarded);
  const next = play(store, 'advance');
  assert.equal(next.phase, 'listen');
  assert.deepEqual(next.notice, { team: 0, power: 'secondGuess' });
  assert.deepEqual(usablePowerIds(store.getSnapshot().match.game, 0), ['secondGuess']);
  play(store, 'usePower', { sourceTeam: 0, targetTeam: 0, power: 'secondGuess' });
  play(store, 'openTrack');
  play(store, 'retry');
  const resumed = createMatchStore(() => storage);
  assert.equal(resumed.getSnapshot().match.game.retry, 'used');
  play(resumed, 'reveal');
  play(resumed, 'mark', { mark: 'origin', checked: true });
  play(resumed, 'score', { skipAnimation: true });
  const { game } = createMatchStore(() => storage).getSnapshot().match;
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 0);
  assert.equal(game.teams[0].score, 3);
});

test('as opções de recompensa obedecem ao formato e aos poderes habilitados', () => {
  const game = newMatch().game;
  assert.deepEqual(availablePowerIds(game), ['tenSeconds', 'oneGuesser', 'readLyrics', 'instrumental', ...ownPowerIds]);
  assert.deepEqual(availablePowerIds(newMatch(['Você']).game), ownPowerIds);
  assert.deepEqual(availablePowerIds({ ...game, powersEnabled: false }), []);
});

test('o sorteio de recompensa divide igualmente os intervalos entre os poderes permitidos', () => {
  for (const players of [['Solo'], ['Azul', 'Lua']]) {
    const { game } = newMatch(players);
    const eligible = { ...game, phase: 'reveal', marks: { title: true, origin: false, fast: true } };
    const options = availablePowerIds(eligible);
    for (let i = 0; i < options.length * 10; i++) {
      const draw = (i + 0.5) / (options.length * 10);
      const expected = options[Math.floor(i / 10)];
      const after = gameReducer(eligible, { type: 'score', draw });
      assert.equal(after.award.power, expected);
      assert.equal(after.teams[0].powers[expected], 1);
      assert.equal(after.teams[0].score, 2);
    }
  }
});

test('a equipe da vez pode usar uma das três dicas antes ou depois de abrir, junto com outros poderes', () => {
  const { game } = matchWithPowers();
  const use = { type: 'usePower', sourceTeam: 0, targetTeam: 0 };
  const attack = { ...use, power: 'tenSeconds', sourceTeam: 1 };
  for (const power of hintIds) {
    const action = { ...use, power };
    assert.equal(powerBlockReason(game, 1, power), 'ownTurn');
    assert.equal(gameReducer(game, { ...action, sourceTeam: 1 }), game);
    assert.equal(gameReducer(game, { ...action, targetTeam: 1 }), game);
    for (const phase of ['reveal', 'choosePower', 'award', 'finished']) {
      const other = { ...game, phase };
      assert.equal(gameReducer(other, action), other);
    }
    for (const afterOpening of [false, true]) {
      const before = afterOpening
        ? [attack, { ...use, power: 'secondGuess' }, { type: 'openTrack' }].reduce(gameReducer, game)
        : game;
      const after = gameReducer(before, action);
      assert.deepEqual(after.hint, { power, trackIndex: before.trackIndex });
      assert.equal(after.opened, afterOpening);
      assert.deepEqual(after.teams[0].powers, { ...before.teams[0].powers, [power]: 1 });
      assert.deepEqual(after.teams.slice(1), before.teams.slice(1));
      for (const id of hintIds) {
        assert.equal(powerBlockReason(after, 0, id), 'hintUsed');
        assert.equal(gameReducer(after, { ...use, power: id }), after);
      }
      if (afterOpening) {
        assert.equal(after.effect, attack.power);
        assert.equal(after.retry, 'ready');
      } else {
        const combined = [attack, { ...use, power: 'doublePoints' }].reduce(gameReducer, after);
        assert.equal(combined.effect, attack.power);
        assert.equal(combined.doubled, true);
        assert.deepEqual(combined.hint, after.hint);
      }
    }
  }
});

test('a dica continua gasta após pulos, recarga e correção de vitória e só é liberada na próxima rodada', () => {
  const disk = memoryStorage();
  let store = createMatchStore(() => disk);
  const match = matchWithPowers();
  match.game.goal = 3;
  store.commit(null, match);
  play(store, 'reveal');
  play(store, 'mark', { mark: 'title', checked: true });
  play(store, 'score', { skipAnimation: true });
  const hint = { power: 'titleInitials', trackIndex: 1 };
  const hinted = play(store, 'usePower', { sourceTeam: 1, targetTeam: 1, power: hint.power });
  assert.deepEqual(hinted.hint, hint);
  store = createMatchStore(() => disk);
  assert.deepEqual(store.getSnapshot().match.game, hinted);

  play(store, 'swap');
  play(store, 'openTrack');
  const swapped = play(store, 'swap');
  assert.equal(swapped.trackIndex, 3);
  assert.deepEqual(swapped.hint, hint);
  const correction = { round: 1, title: true, origin: true };
  assert.equal(play(store, 'correctLastRound', correction).phase, 'finished');
  store = createMatchStore(() => disk);
  assert.deepEqual(play(store, 'correctLastRound', { ...correction, origin: false }), swapped);
  assert.equal(powerBlockReason(swapped, 1, 'mainArtist'), 'hintUsed');
  assert.equal(swapped.teams[1].powers[hint.power], 1);
  play(store, 'reveal');
  const next = play(store, 'score');
  assert.equal(next.round, 3);
  assert.equal(next.hint, null);
  assert.ok(hintIds.every(id => usablePowerIds(next, 2).includes(id)));
});

test('a equipe escolhe qual ataque gastar e guarda os outros para outra rodada', () => {
  const { game } = matchWithPowers();
  const stock = game.teams[3].powers;
  Object.assign(stock, { tenSeconds: 50, oneGuesser: 0, readLyrics: 0, instrumental: 1 });
  const attack = { type: 'usePower', sourceTeam: 3, targetTeam: 0, power: 'instrumental' };
  const after = gameReducer(game, attack);
  assert.equal(after.effect, 'instrumental');
  assert.equal(after.effectSource, 3);
  assert.deepEqual(after.teams[3].powers, { ...stock, instrumental: 0 });
  assert.deepEqual(after.teams.slice(0, 3), game.teams.slice(0, 3));
  assert.equal(gameReducer(after, { ...attack, power: 'tenSeconds' }), after);
  const next = gameReducer(gameReducer(after, { type: 'reveal' }), { type: 'score' });
  assert.equal(gameReducer(next, { ...attack, targetTeam: 1 }), next);
  const second = gameReducer(next, { ...attack, targetTeam: 1, power: 'tenSeconds' });
  assert.equal(second.effect, 'tenSeconds');
  assert.deepEqual(second.teams[3].powers, { ...stock, instrumental: 0, tenSeconds: 49 });
});

test('sorteios com várias opções exigem um valor no intervalo [0, 1) antes de pontuar', () => {
  const { game } = matchWithPowers();
  const reveal = { ...game, phase: 'reveal', marks: { title: true, origin: false, fast: true } };
  const legacy = legacyPendingMatch().game;
  for (const draw of [undefined, null, '0.4', -0.1, 1, NaN, Infinity]) {
    assert.equal(gameReducer(reveal, { type: 'score', draw }), reveal);
    assert.equal(gameReducer(legacy, { type: 'drawReward', draw }), legacy);
  }
});

test('Vale o dobro começa sem cópias e pode ser ganho e guardado no solo e em equipes', () => {
  for (const players of [['Solo'], ['Azul', 'Verde']]) {
    const { game } = newMatch(players);
    const use = { type: 'usePower', sourceTeam: 0, targetTeam: 0, power: 'doublePoints' };
    assert.ok(game.teams.every(team => team.powers.doublePoints === 0 && !Object.hasOwn(team, 'doubleUsed')));
    assert.equal(gameReducer(game, { type: 'double' }), game);
    assert.equal(gameReducer(game, use), game);
    const reveal = { ...game, phase: 'reveal', marks: { title: true, origin: false, fast: true } };
    const earned = gameReducer(reveal, { type: 'score', draw: drawFor(game, 'doublePoints') });
    assert.equal(earned.phase, 'award');
    assert.equal(earned.award.power, 'doublePoints');
    assert.equal(earned.teams[0].powers.doublePoints, 1);
    assert.equal(earned.doubled, false);
    assert.equal(earned.teams[0].score, 2);
  }
});

test('Vale o dobro só pode ser ativado antes da faixa e ocupa o poder próprio da rodada', () => {
  const { game } = matchWithPowers();
  const use = { type: 'usePower', sourceTeam: 0, targetTeam: 0, power: 'doublePoints' };
  const opened = gameReducer(game, { type: 'openTrack' });
  assert.equal(powerBlockReason(opened, 0, 'doublePoints'), 'trackOpened');
  assert.equal(gameReducer(opened, use), opened);
  assert.equal(gameReducer(game, { ...use, sourceTeam: 2 }), game);
  assert.equal(gameReducer(game, { ...use, targetTeam: 2 }), game);
  const doubled = gameReducer(game, use);
  assert.equal(doubled.teams[0].powers.doublePoints, 1);
  assert.equal(doubled.doubled, true);
  for (const power of ['doublePoints', 'secondGuess']) {
    assert.equal(powerBlockReason(doubled, 0, power), 'ownPowerUsed');
    assert.equal(gameReducer(doubled, { ...use, power }), doubled);
    const usedFirst = gameReducer(game, { ...use, power });
    assert.equal(powerBlockReason(usedFirst, 0, 'doublePoints'), 'ownPowerUsed');
    assert.equal(gameReducer(usedFirst, use), usedFirst);
  }
});

test('duas cópias de Vale o dobro valem em turnos distintos e a troca grátis mantém o multiplicador', () => {
  const { game } = matchWithPowers();
  const use = { type: 'usePower', power: 'doublePoints', sourceTeam: 0, targetTeam: 0 };
  let current = gameReducer(game, use);
  current = gameReducer(current, { type: 'usePower', sourceTeam: 3, targetTeam: 0, power: 'tenSeconds' });
  current = gameReducer(current, { type: 'openTrack' });
  current = gameReducer(current, { type: 'swap' });
  assert.equal(current.teams[0].swapUsed, true);
  assert.equal(current.effect, 'tenSeconds');
  assert.equal(current.doubled, true);
  current = gameReducer(current, { type: 'reveal' });
  current = gameReducer(current, { type: 'mark', mark: 'title', checked: true });
  current = gameReducer(current, { type: 'mark', mark: 'origin', checked: true });
  assert.deepEqual([getRound(current).titlePoints, getRound(current).originPoints], [4, 2]);
  current = gameReducer(current, { type: 'score', skipAnimation: true });
  assert.equal(current.teams[0].score, 6);
  assert.equal(current.teams[0].powers.doublePoints, 1);
  assert.equal(current.doubled, false);
  assert.deepEqual([getRound(current).titlePoints, getRound(current).originPoints], [2, 1]);
  for (let other = 1; other < current.teams.length; other++) {
    current = gameReducer(current, { type: 'reveal' });
    current = gameReducer(current, { type: 'score' });
  }
  const again = gameReducer(current, use);
  assert.equal(again.round, 5);
  assert.equal(again.doubled, true);
  assert.equal(again.teams[0].powers.doublePoints, 0);
  assert.deepEqual(again.teams.slice(1).map(team => team.powers.doublePoints), [2, 2, 2]);
});

test('um poder único no estoque também exige escolha explícita e elegível', () => {
  const { game } = newMatch();
  game.teams[2].powers.oneGuesser = 1;
  const activate = { type: 'usePower', sourceTeam: 2, targetTeam: 0 };
  for (const action of [activate, { ...activate, draw: 0 }, { ...activate, power: 'tenSeconds' }]) {
    assert.equal(gameReducer(game, action), game);
  }
  const used = gameReducer(game, { ...activate, power: 'oneGuesser' });
  assert.equal(used.effect, 'oneGuesser');
  assert.equal(used.teams[2].powers.oneGuesser, 0);
});

test('o saldo de pulos soma a troca grátis e os poderes da equipe da vez, inclusive após retomar', () => {
  const disk = memoryStorage();
  let store = createMatchStore(() => disk);
  const match = newMatch(['Azul', 'Verde']);
  const oldGame = structuredClone(match.game);
  delete oldGame.teams[0].powers.skipTrack;
  assert.equal(getRound(oldGame).remainingSkips, 1);
  store.commit(null, match);
  play(store, 'reveal');
  play(store, 'mark', { mark: 'title', checked: true });
  play(store, 'mark', { mark: 'fast', checked: true });
  const rewarded = play(store, 'score', { draw: drawFor(match.game, 'skipTrack') });
  assert.equal(rewarded.award.power, 'skipTrack');
  assert.equal(getRound(rewarded).remainingSkips, 2);

  assert.equal(getRound(play(store, 'advance')).remainingSkips, 1);
  play(store, 'openTrack');
  assert.equal(getRound(play(store, 'swap')).remainingSkips, 0);
  play(store, 'reveal');
  assert.equal(getRound(play(store, 'score')).remainingSkips, 2);
  const skipped = play(store, 'usePower', { power: 'skipTrack', sourceTeam: 0, targetTeam: 0 });
  assert.equal(getRound(skipped).canSwap, false);
  assert.equal(getRound(skipped).remainingSkips, 1);
  store = createMatchStore(() => disk);
  assert.equal(getRound(store.getSnapshot().match.game).remainingSkips, 1);
  assert.equal(getRound(play(store, 'openTrack')).canSwap, true);
  assert.equal(getRound(play(store, 'swap')).remainingSkips, 0);
});

test('pular faixa preserva a vez, o ataque e a troca grátis em qualquer ordem', () => {
  for (const freeSwapFirst of [true, false]) {
    const match = matchWithPowers();
    const storage = memoryStorage();
    let store = createMatchStore(() => storage);
    store.commit(null, match);
    play(store, 'usePower', { sourceTeam: 3, targetTeam: 0, power: 'tenSeconds' });
    if (freeSwapFirst) {
      play(store, 'openTrack');
      play(store, 'swap');
      play(store, 'openTrack');
    }
    const before = store.getSnapshot().match.game;
    const skip = { sourceTeam: 0, targetTeam: 0, power: 'skipTrack' };
    const skipped = play(store, 'usePower', skip);
    assert.equal(skipped.trackIndex, before.trackIndex + 1);
    assert.equal(skipped.opened, false);
    assert.equal(skipped.round, before.round);
    assert.equal(skipped.phase, 'listen');
    assert.equal(skipped.powerSkipped, true);
    assert.equal(skipped.teams[0].swapUsed, freeSwapFirst);
    assert.equal(skipped.teams[0].powers.skipTrack, 1);
    assert.deepEqual(skipped.teams.map(t => t.score), before.teams.map(t => t.score));
    assert.equal(skipped.teams[0].powers.secondGuess, 2);
    assert.equal(skipped.effect, 'tenSeconds');
    assert.equal(skipped.effectSource, 3);
    assert.equal(skipped.doubled, false);
    assert.deepEqual(skipped.deck, before.deck);
    store = createMatchStore(() => storage);
    assert.deepEqual(store.getSnapshot().match.game, skipped);
    assert.deepEqual(usablePowerIds(skipped, 0), ownPowerIds);
    if (!freeSwapFirst) {
      play(store, 'openTrack');
      const swapped = play(store, 'swap');
      assert.equal(swapped.trackIndex, skipped.trackIndex + 1);
      assert.equal(swapped.powerSkipped, true);
      assert.equal(swapped.teams[0].powers.skipTrack, 1);
    }
    const again = play(store, 'usePower', skip);
    assert.equal(again.teams[0].powers.skipTrack, 0);
    assert.equal(again.teams[0].swapUsed, true);
    assert.equal(gameReducer(again, { type: 'usePower', ...skip }), again);
    play(store, 'reveal');
    const next = play(store, 'score');
    assert.equal(next.powerSkipped, false);
    assert.equal(next.round, 2);
  }
});

test('Trocar faixa gasta a grátis primeiro com a faixa aberta e depois os dois pulos da equipe', () => {
  const disk = memoryStorage();
  let store = createMatchStore(() => disk);
  const match = newMatch(['Azul', 'Verde']);
  const personal = tracksForOrigins(['my-mind']);
  const general = tracksForOrigins(['classicos-br']);
  match.game.deck = [personal[0], general[0], personal[1], general[1], personal[2], general[2]];
  match.game.teams[0].powers.skipTrack = 2;
  match.game.teams[1].powers.skipTrack = 1;
  store.commit(null, match);

  const opened = play(store, 'openTrack');
  assert.equal(getRound(opened).remainingSkips, 3);
  assert.equal(getRound(opened).canSwap, true);
  const free = play(store, 'swap');
  assert.equal(free.teams[0].swapUsed, true);
  assert.equal(free.teams[0].powers.skipTrack, 2);
  assert.equal(getRound(free).remainingSkips, 2);
  assert.equal(getRound(free).originPoints, 0);
  assert.equal(free.opened, false);
  assert.equal(getRound(free).canSwap, true);
  const hidden = play(store, 'swap');
  assert.deepEqual(hidden.unheardSkips, [1]);
  assert.equal(getRound(hidden).remainingSkips, 1);
  assert.equal(getRound(hidden).originPoints, 1);

  store = createMatchStore(() => disk);
  assert.deepEqual(store.getSnapshot().match.game, hidden);
  play(store, 'openTrack');
  const paid = play(store, 'swap');
  assert.equal(paid.trackIndex, 3);
  assert.equal(paid.round, 1);
  assert.equal(paid.opened, false);
  assert.equal(getRound(paid).originPoints, 0);
  assert.deepEqual(paid.unheardSkips, [1]);
  assert.equal(getRound(paid).remainingSkips, 0);
  assert.equal(getRound(paid).canSwap, false);
  assert.equal(gameReducer(paid, { type: 'swap' }), paid);
  const noStock = play(store, 'openTrack');
  assert.equal(gameReducer(noStock, { type: 'swap' }), noStock);
  assert.deepEqual(paid.teams[1], match.game.teams[1]);
  play(store, 'reveal');
  const next = play(store, 'score');
  assert.equal(getRound(next).turn, 1);
  assert.equal(getRound(next).remainingSkips, 2);
  const other = play(store, 'swap');
  assert.equal(other.teams[1].powers.skipTrack, 0);
  assert.equal(other.teams[1].swapUsed, false);
  assert.deepEqual(other.teams[0], paid.teams[0]);
  assert.deepEqual(createMatchStore(() => disk).getSnapshot().match.game, other);
});

test('escolher Pular música explicitamente gasta só o poder mesmo com a troca grátis liberada', () => {
  const { game } = newMatch();
  game.teams[0].powers.skipTrack = 1;
  const opened = gameReducer(game, { type: 'openTrack' });
  const skip = { type: 'usePower', power: 'skipTrack', sourceTeam: 0, targetTeam: 0 };
  assert.equal(getRound(opened).canSwap, true);
  const paid = gameReducer(opened, skip);
  assert.equal(paid.teams[0].swapUsed, false);
  assert.equal(paid.teams[0].powers.skipTrack, 0);
  assert.deepEqual(paid.unheardSkips, []);
  assert.equal(gameReducer(paid, skip), paid);
  assert.equal(getRound(paid).canSwap, false);
  const reopened = gameReducer(paid, { type: 'openTrack' });
  assert.equal(getRound(reopened).canSwap, true);
  assert.equal(gameReducer(reopened, skip), reopened);
  assert.equal(getRound(gameReducer(reopened, { type: 'swap' })).remainingSkips, 0);
});

test('pulos pagos coexistem com dobro ou duas tentativas, antes e depois de ativar o poder', () => {
  for (const power of ['doublePoints', 'secondGuess']) {
    for (const skipFirst of [true, false]) {
      const disk = memoryStorage();
      const store = createMatchStore(() => disk);
      const match = matchWithPowers();
      store.commit(null, match);
      const own = { power, sourceTeam: 0, targetTeam: 0 };
      if (skipFirst) play(store, 'swap');
      const activated = play(store, 'usePower', own);
      assert.equal(activated.teams[0].powers[power], 1);
      const skipped = play(store, 'swap');
      assert.equal(skipped.trackIndex, skipFirst ? 2 : 1);
      assert.equal(skipped.teams[0].powers.skipTrack, skipFirst ? 0 : 1);
      assert.equal(skipped.teams[0].swapUsed, false);
      assert.equal(skipped.doubled, power === 'doublePoints');
      assert.equal(skipped.retry, power === 'secondGuess' ? 'ready' : null);
      assert.equal(gameReducer(skipped, { type: 'usePower', ...own }), skipped);
      assert.deepEqual(createMatchStore(() => disk).getSnapshot().match.game, skipped);
      if (power === 'doublePoints') {
        play(store, 'reveal');
        assert.equal(getRound(play(store, 'mark', { mark: 'title', checked: true })).points, 4);
      } else {
        play(store, 'openTrack');
        assert.equal(play(store, 'retry').retry, 'used');
        if (!skipFirst) {
          const paid = play(store, 'usePower', { ...own, power: 'skipTrack' });
          assert.equal(paid.teams[0].powers.skipTrack, 0);
          assert.equal(paid.teams[0].swapUsed, false);
          assert.equal(paid.retry, 'ready');
          assert.equal(getRound(play(store, 'openTrack')).canRetry, true);
        }
      }
    }
  }
});

test('nenhum pulo avança a última faixa ou funciona depois de revelar', () => {
  const { game } = matchWithPowers();
  for (const opened of [false, true]) {
    const current = { ...game, opened };
    const blocked = ['reveal', 'choosePower', 'award', 'finished'].map(phase => ({ ...current, phase }));
    blocked.push({ ...current, trackIndex: game.deck.length - 1 });
    for (const state of blocked) {
      assert.equal(getRound(state).canSwap, false);
      assert.equal(gameReducer(state, { type: 'swap' }), state);
      assert.equal(gameReducer(state, { type: 'usePower', power: 'skipTrack', sourceTeam: 0, targetTeam: 0 }), state);
    }
  }
});

test('solo pode sortear e usar Pular faixa, e o poder fica inelegível na última música', () => {
  const { game } = newMatch(['Solo']);
  const reveal = { ...game, phase: 'reveal', marks: { title: true, origin: false, fast: true } };
  const awarded = gameReducer(reveal, { type: 'score', skipAnimation: true, draw: drawFor(game, 'skipTrack') });
  assert.equal(awarded.award.power, 'skipTrack');
  assert.deepEqual(usablePowerIds(awarded, 0), []);
  const next = gameReducer(awarded, { type: 'advance' });
  assert.deepEqual(usablePowerIds(next, 0), ['skipTrack']);
  const use = { type: 'usePower', sourceTeam: 0, targetTeam: 0, power: 'skipTrack' };
  assert.equal(gameReducer(next, use).trackIndex, next.trackIndex + 1);
  const last = { ...next, trackIndex: next.deck.length - 1 };
  assert.deepEqual(usablePowerIds(last, 0), []);
  assert.equal(gameReducer(last, use), last);
  last.teams[0].powers.secondGuess = 1;
  assert.deepEqual(usablePowerIds(last, 0), ['secondGuess']);
  assert.equal(gameReducer(last, use), last);
  const retry = gameReducer(last, { ...use, power: 'secondGuess' });
  assert.equal(retry.retry, 'ready');
  assert.equal(retry.teams[0].powers.skipTrack, 1);
});

test('uma recompensa pendente da versão anterior é sorteada sem somar os pontos de novo', () => {
  const storage = memoryStorage();
  const match = legacyPendingMatch();
  delete match.game.powerSkipped;
  for (const team of match.game.teams) delete team.powers.skipTrack;
  storage.setItem(saveKey, JSON.stringify({ version: 1, match }));
  let store = createMatchStore(() => storage);
  const pending = store.getSnapshot().match.game;
  assert.equal(gameReducer(pending, { type: 'score', draw: 0 }), pending);
  assert.equal(gameReducer(pending, { type: 'choosePower', power: 'tenSeconds' }), pending);
  const drawn = play(store, 'drawReward', { draw: drawFor(pending, 'skipTrack') });
  assert.equal(drawn.phase, 'award');
  assert.deepEqual(drawn.award, { team: 0, points: 2, power: 'skipTrack' });
  assert.equal(drawn.teams[0].score, 2);
  assert.equal(drawn.teams[0].powers.skipTrack, 1);
  store = createMatchStore(() => storage);
  assert.deepEqual(store.getSnapshot().match.game, drawn);
  assert.equal(gameReducer(drawn, { type: 'drawReward', draw: 0 }), drawn);
  const next = play(store, 'advance');
  assert.deepEqual(next.notice, { team: 0, power: 'skipTrack' });
});

test('cada equipe escolhe em qual turno adversário gastar o ataque, inclusive na última faixa', () => {
  const { game } = matchWithPowers();
  const attacks = ['tenSeconds', 'oneGuesser', 'readLyrics', 'instrumental'];
  for (let round = 1; round <= 8; round++) {
    const current = { ...game, round, trackIndex: round === 8 ? game.deck.length - 1 : round - 1 };
    const targetTeam = (round - 1) % 4;
    for (let sourceTeam = 0; sourceTeam < 4; sourceTeam++) {
      const ownPowers = round === 8 ? ownPowerIds.filter(id => id !== 'skipTrack') : ownPowerIds;
      assert.deepEqual(usablePowerIds(current, sourceTeam), sourceTeam === targetTeam ? ownPowers : attacks);
      if (sourceTeam === targetTeam) continue;
      for (const power of attacks) {
        const after = gameReducer(current, { type: 'usePower', sourceTeam, targetTeam, power });
        assert.equal(after.round, round);
        assert.equal(after.trackIndex, current.trackIndex);
        assert.equal(after.phase, 'listen');
        assert.equal(after.effect, power);
        assert.equal(after.effectSource, sourceTeam);
        assert.equal(after.nextEffect, null);
        assert.deepEqual(after.teams.map(t => t.powers[power]), game.teams.map((_, i) => i === sourceTeam ? 1 : 2));
        for (let other = 0; other < 4; other++) {
          if (other !== targetTeam) assert.equal(gameReducer(after, { type: 'usePower', power, sourceTeam: other, targetTeam }), after);
        }
      }
    }
  }
});

test('a equipe 4 ataca a 2 e a segunda tentativa da 2 funciona nos dois sentidos de ativação', () => {
  for (const retryFirst of [true, false]) {
    const storage = memoryStorage();
    let store = createMatchStore(() => storage);
    store.commit(null, matchWithPowers());
    play(store, 'reveal');
    play(store, 'score');
    const attack = { power: 'instrumental', sourceTeam: 3, targetTeam: 1 };
    const retry = { power: 'secondGuess', sourceTeam: 1, targetTeam: 1 };
    play(store, 'usePower', retryFirst ? retry : attack);
    if (!retryFirst) play(store, 'openTrack');
    const armed = play(store, 'usePower', retryFirst ? attack : retry);
    assert.equal(armed.effect, 'instrumental');
    assert.equal(armed.effectSource, 3);
    assert.equal(armed.retry, 'ready');
    assert.equal(armed.teams[1].powers.secondGuess, 1);
    assert.equal(armed.teams[3].powers.instrumental, 1);
    store = createMatchStore(() => storage);
    assert.deepEqual(store.getSnapshot().match.game, armed);
    assert.equal(gameReducer(armed, { type: 'usePower', ...retry }), armed);
    assert.equal(gameReducer(armed, { type: 'usePower', ...attack }), armed);
    play(store, 'openTrack');
    play(store, 'retry');
    const swapped = play(store, 'swap');
    assert.equal(swapped.retry, 'ready');
    assert.equal(swapped.effect, 'instrumental');
    assert.equal(swapped.effectSource, 3);
    const reopened = play(store, 'openTrack');
    assert.equal(gameReducer(reopened, { type: 'retry' }).retry, 'used');
    assert.equal(gameReducer(reopened, { type: 'usePower', ...retry }), reopened);
    play(store, 'reveal');
    const next = play(store, 'score');
    assert.equal(next.effectSource, null);
    assert.equal(next.effect, null);
    assert.equal(next.retry, null);
    assert.equal(getRound(next).turn, 2);
  }
});

test('rejeita alvo fora da vez, equipe inválida, ataque após a pista e poder indisponível', () => {
  const { game } = matchWithPowers();
  const attack = { type: 'usePower', power: 'readLyrics', sourceTeam: 3, targetTeam: 0 };
  for (const changes of [
    { sourceTeam: -1 }, { sourceTeam: 4 }, { sourceTeam: 0.5 }, { sourceTeam: '3' }, { sourceTeam: undefined },
    { targetTeam: -1 }, { targetTeam: 4 }, { targetTeam: 0.5 }, { targetTeam: '0' }, { targetTeam: undefined },
    { targetTeam: 2 }, { sourceTeam: 0 }, { power: 'secondGuess' }, { power: 'skipTrack' },
    { power: null }, { power: 1 }, { power: '__proto__' }, { power: 'inexistente' }, { power: undefined, draw: 0.5 },
  ]) assert.equal(gameReducer(game, { ...attack, ...changes }), game);
  for (const changes of [
    { powersEnabled: false }, { phase: 'reveal' }, { phase: 'award' }, { phase: 'choosePower' }, { phase: 'finished' },
  ]) {
    const current = { ...game, ...changes };
    assert.deepEqual(usablePowerIds(current, 3), []);
    assert.deepEqual(usablePowerIds(current, 0), []);
    assert.equal(gameReducer(current, attack), current);
  }
  const opened = gameReducer(game, { type: 'openTrack' });
  assert.deepEqual(usablePowerIds(opened, 3), []);
  assert.deepEqual(usablePowerIds(opened, 0), ['secondGuess', 'skipTrack', ...hintIds]);
  assert.equal(gameReducer(opened, attack), opened);
  for (const id of usablePowerIds(game, 3)) game.teams[3].powers[id] = 0;
  assert.deepEqual(usablePowerIds(game, 3), []);
  assert.equal(gameReducer(game, attack), game);
});

test('retoma ataques antigos já gastos, atribui sua origem e aplica cada um uma vez', () => {
  const match = matchWithPowers();
  match.game.round = 5;
  match.game.trackIndex = 4;
  match.game.effect = 'oneGuesser';
  match.game.nextEffect = 'readLyrics';
  match.game.teams[3].powers.oneGuesser = 0;
  match.game.teams[0].powers.readLyrics = 0;
  delete match.game.effectSource;
  const storage = memoryStorage();
  storage.setItem(saveKey, JSON.stringify({ version: 1, match }));
  const store = createMatchStore(() => storage);
  const original = store.getSnapshot().match.game;
  assert.equal(original.effectSource, 3);
  assert.equal(original.nextEffect, 'readLyrics');
  play(store, 'reveal');
  const active = play(store, 'score');
  assert.equal(getRound(active).turn, 1);
  assert.equal(active.effect, 'readLyrics');
  assert.equal(active.effectSource, 0);
  assert.equal(active.nextEffect, null);
  assert.equal(active.teams[0].powers.readLyrics, 0);
  const recovered = createMatchStore(() => storage);
  assert.deepEqual(recovered.getSnapshot().match.game, active);
  play(recovered, 'reveal');
  const expired = play(recovered, 'score');
  assert.equal(expired.effect, null);
  assert.equal(expired.effectSource, null);
});

test('rejeita a autoria inválida de um efeito salvo e aceita ausência de campos legados', () => {
  const match = matchWithPowers();
  const storage = memoryStorage();
  const save = changes => {
    storage.setItem(saveKey, JSON.stringify({ version: 1, match: { ...match, game: { ...match.game, ...changes } } }));
    return createMatchStore(() => storage).getSnapshot();
  };
  for (const effectSource of [0, -1, 4, 0.5, '3', null]) {
    assert.equal(save({ effect: 'tenSeconds', effectSource }).issue, 'invalid');
  }
  assert.equal(save({ effectSource: 1 }).issue, 'invalid');
  assert.equal(save({ effect: 'tenSeconds', effectSource: 3 }).match.game.effectSource, 3);
  const old = save({ nextEffect: undefined, effectSource: undefined }).match.game;
  assert.equal(old.nextEffect, null);
  assert.equal(old.effectSource, null);
});

test('só um acerto rápido de título em rodada elegível sorteia recompensa', () => {
  const game = newMatch().game;
  const marks = { title: true, origin: false, fast: true };
  for (const [changes, expectedPhase] of [
    [{ marks: { ...marks, fast: false } }, 'listen'],
    [{ marks: { title: false, origin: true, fast: false } }, 'listen'],
    [{ powersEnabled: false }, 'listen'],
    [{ effect: 'readLyrics' }, 'listen'],
    [{ goal: 2 }, 'finished'],
    [{ trackIndex: game.deck.length - 1 }, 'finished'],
  ]) {
    const after = gameReducer({ ...game, phase: 'reveal', marks, ...changes }, { type: 'score', skipAnimation: true });
    assert.equal(after.phase, expectedPhase);
    assert.ok(Object.values(after.teams[0].powers).every(quantity => quantity === 0));
    assert.equal(after.notice, null);
  }
});

test('a recompensa vai para a equipe da vez e a próxima equipe recebe o turno', () => {
  const game = newMatch().game;
  const awarded = gameReducer({
    ...game, round: 2, trackIndex: 1, phase: 'reveal', marks: { title: true, origin: true, fast: true },
  }, { type: 'score', draw: drawFor(game, 'instrumental'), skipAnimation: true });
  assert.equal(awarded.phase, 'award');
  assert.equal(getRound(awarded).turn, 1);
  const next = gameReducer(awarded, { type: 'advance' });
  assert.deepEqual(next.teams.map(team => team.score), [0, 3, 0]);
  assert.deepEqual(next.teams.map(team => team.powers.instrumental), [0, 1, 0]);
  assert.deepEqual(next.notice, { team: 1, power: 'instrumental' });
  assert.equal(getRound(next).turn, 2);
});

test('recusa uma escolha pendente inconsistente sem modificar a gravação', () => {
  const storage = memoryStorage();
  const match = legacyPendingMatch();
  const pending = match.game;
  for (const changes of [
    { award: null }, { award: { ...pending.award, power: 'tenSeconds' } },
    { award: { ...pending.award, team: 1 } }, { award: { ...pending.award, points: 0 } },
    { powersEnabled: false }, { marks: { ...pending.marks, fast: false } }, { goal: 2 },
  ]) {
    const raw = JSON.stringify({ version: 1, match: { ...match, game: { ...pending, ...changes } } });
    storage.setItem(saveKey, raw);
    assert.equal(createMatchStore(() => storage).getSnapshot().issue, 'invalid');
    assert.equal(storage.getItem(saveKey), raw);
  }
});

test('aba desatualizada não substitui uma gravação mais recente', () => {
  const storage = memoryStorage();
  const first = createMatchStore(() => storage);
  first.commit(null, newMatch());
  const second = createMatchStore(() => storage);
  const stale = second.getSnapshot().match;
  play(first, 'openTrack');
  assert.equal(second.commit(stale, newMatch()), false);
  assert.deepEqual(first.getSnapshot().match, second.getSnapshot().match);
});

test('rejeita dados inválidos, versão desconhecida e destino externo inválido', () => {
  const storage = memoryStorage();
  const match = newMatch();
  match.game.deck = [{ ...match.game.deck[0], url: 'https://example.org/faixa' }];
  for (const raw of ['{', '{"version":9}', JSON.stringify({ version: 1, match })]) {
    storage.setItem(saveKey, raw);
    const store = createMatchStore(() => storage);
    assert.deepEqual(store.getSnapshot(), { match: null, issue: 'invalid' });
    assert.equal(storage.getItem(saveKey), raw);
    assert.ok(store.commit(null, newMatch()));
    assert.equal(createMatchStore(() => storage).getSnapshot().issue, null);
  }
});

test('bloqueio e falta de espaço preservam a sessão aberta e permitem nova gravação', () => {
  const storage = memoryStorage();
  let blocked = true;
  const store = createMatchStore(() => { if (blocked) throw Error(); return storage; });
  assert.equal(store.getSnapshot().issue, 'unavailable');
  store.commit(null, newMatch());
  blocked = false;
  const write = storage.setItem;
  storage.setItem = () => { throw Error(); };
  play(store, 'openTrack');
  assert.equal(store.getSnapshot().issue, 'unavailable');
  storage.setItem = write;
  play(store, 'reveal');
  assert.equal(store.getSnapshot().issue, null);
  assert.deepEqual(createMatchStore(() => storage).getSnapshot().match, store.getSnapshot().match);
});

test('converte uma partida v1 na retomada, grava o baralho uma vez e retoma o mesmo progresso', () => {
  const storage = memoryStorage();
  const match = newMatch();
  match.game.teams[0].powers.doublePoints = 1;
  for (const action of [
    { type: 'usePower', power: 'doublePoints', sourceTeam: 0, targetTeam: 0 },
    { type: 'openTrack' }, { type: 'swap' }, { type: 'reveal' },
    { type: 'mark', mark: 'title', checked: true }, { type: 'mark', mark: 'fast', checked: true },
    { type: 'score', draw: 0 },
  ]) match.game = gameReducer(match.game, action);
  storage.setItem(saveKey, JSON.stringify({ version: 1, match }));
  const writes = [];
  const set = storage.setItem;
  storage.setItem = (key, value) => { writes.push({ key, value }); set(key, value); };

  const store = createMatchStore(() => storage);
  const recovered = store.getSnapshot().match;
  assert.deepEqual(recovered, match);
  assert.equal(store.commit(recovered, recovered), true);
  assert.equal(writes.length, 3);
  const [{ key: deckKey, value: fixed }, progress, pointer] = writes;
  assert.deepEqual(JSON.parse(fixed).deck, match.game.deck);
  assert.equal(progress.key, progressKey(match.id));
  assert.deepEqual(JSON.parse(pointer.value), { version: 2, id: match.id });
  assert.equal(pointer.key, saveKey);
  assert.deepEqual(createMatchStore(() => storage).getSnapshot().match, match);
  const next = play(store, 'advance');
  assert.equal(next.teams[0].score, 4);
  assert.equal(next.teams[0].powers.tenSeconds, 1);
  assert.equal(next.round, 2);
  const reopened = createMatchStore(() => storage);
  play(reopened, 'reveal');
  assert.equal(storage.getItem(deckKey), fixed);
  assert.ok(writes.slice(3).every(w => w.key === progress.key && !w.value.includes('spotify.com') && Buffer.byteLength(w.value) < 1024));
  assert.equal(writes.length, 5);
  assert.equal(reopened.getSnapshot().match.game.trackIndex, 2);
});

test('migração e substituição interrompidas mantêm o salvamento anterior recuperável', () => {
  const storage = memoryStorage();
  const old = newMatch();
  const legacy = JSON.stringify({ version: 1, match: old });
  storage.setItem(saveKey, legacy);
  const store = createMatchStore(() => storage);
  const set = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === saveKey) throw new Error('Sem espaço');
    set(key, value);
  };
  const original = store.getSnapshot().match;
  store.commit(original, original);
  assert.equal(store.getSnapshot().issue, 'unavailable');
  assert.equal(storage.getItem(saveKey), legacy);
  assert.deepEqual(createMatchStore(() => storage).getSnapshot().match, old);
  storage.setItem = set;
  store.commit(original, original);
  const activeRaw = storage.getItem(saveKey);
  const later = { ...newMatch(['Outra']), id: 'outra' };
  storage.setItem = (key, value) => { if (key === saveKey) throw Error(); set(key, value); };
  store.commit(original, later);
  assert.equal(storage.getItem(saveKey), activeRaw);
  assert.deepEqual(createMatchStore(() => storage).getSnapshot().match, old);
  storage.setItem = set;
  assert.ok(store.commit(later, later));
  assert.deepEqual(createMatchStore(() => storage).getSnapshot().match, later);
  assert.equal(storage.getItem('faixa-oculta.baralho.' + old.id), null);
});

test('partida com playlists escolhidas preserva as origens válidas ao reabrir', () => {
  const storage = memoryStorage();
  const players = ['Você'];
  const game = startGame({ players, goal: 15, originIds: ['junior-5'] });
  const store = createMatchStore(() => storage);
  store.commit(null, { id: 'so-junior', players, game });
  const match = createMatchStore(() => storage).getSnapshot().match;
  assert.deepEqual(match.game.deck, game.deck);
  assert.equal(match.game.deck.length, tracksForOrigins(['junior-5']).length);
  assert.ok(match.game.deck.length);
  assert.ok(match.game.deck.every(t => t.origins.length === 1 && t.origins[0] === 'junior-5'));
});

test('uma ação concorrente da aba anterior não reativa a partida substituída', () => {
  const storage = memoryStorage();
  const oldTab = createMatchStore(() => storage);
  const old = newMatch();
  oldTab.commit(null, old);
  const newTab = createMatchStore(() => storage);
  const replacement = { ...newMatch(), id: 'nova-partida' };
  const set = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === progressKey(old.id)) {
      storage.setItem = set;
      newTab.commit(newTab.getSnapshot().match, replacement);
    }
    set(key, value);
  };
  play(oldTab, 'reveal');
  assert.deepEqual(createMatchStore(() => storage).getSnapshot().match, replacement);
  oldTab.refresh();
  assert.deepEqual(oldTab.getSnapshot().match, replacement);
});
