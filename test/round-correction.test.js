import assert from 'node:assert/strict';
import test from 'node:test';
import { tracksForOrigins } from '../src/catalog.js';
import { gameReducer, getLastRound, startGame } from '../src/game.js';

const personal = tracksForOrigins(['my-mind']).slice(0, 5);
const general = tracksForOrigins(['classicos-br'])[0];
const players = ['Azul', 'Amarela', 'Verde'];
const start = (goal = 10, deck = personal) => startGame({ players, goal, powersEnabled: true }, deck);
const apply = (game, ...actions) => actions.reduce(gameReducer, game);
const mark = (mark, checked = true) => ({ type: 'mark', mark, checked });
const correct = (game, title, origin, round = getLastRound(game).round) =>
  gameReducer(game, { type: 'correctLastRound', round, title, origin });
const use = (sourceTeam, targetTeam, power) => ({ type: 'usePower', sourceTeam, targetTeam, power });
const scoreNow = { type: 'score', skipAnimation: true };

test('corrigir a última rodada usa a faixa efetiva e a diferença dos pontos, inclusive com dobro', () => {
  const initial = start(10, [general, ...personal]);
  initial.teams[0].powers.doublePoints = 1;
  assert.equal(getLastRound(initial), null);
  const next = apply(initial, use(0, 0, 'doublePoints'), { type: 'openTrack' }, { type: 'swap' },
    { type: 'reveal' }, mark('origin'), scoreNow);
  const last = getLastRound(next);
  assert.deepEqual([last.round, last.team, last.trackIndex, last.title, last.origin], [1, 0, 1, false, true]);
  assert.deepEqual([last.titlePoints, last.originPoints, last.points], [4, 2, 2]);
  const full = correct(next, true, true);
  assert.equal(full.teams[0].score, 6);
  assert.equal(correct(full, true, true), full);
  const partial = correct(full, true, false);
  assert.equal(partial.teams[0].score, 4);
  assert.equal(partial.teams[0].powers.doublePoints, 0);
  assert.equal(partial.deck, initial.deck);
  assert.equal(partial.round, 2);
  assert.equal(correct(partial, false, false, 9), partial);
  assert.equal(correct(partial, 'sim', false), partial);
  const third = apply(partial, { type: 'reveal' }, scoreNow);
  assert.equal(getLastRound(third).round, 2);
  assert.equal(correct(third, false, false, 1), third);
});

test('a correção de uma faixa geral dispensa o bônus e mantém o prêmio mesmo depois de gasto', () => {
  const initial = start(10, [general, ...personal]);
  const reward = apply(initial, { type: 'reveal' }, mark('title'), mark('fast'), { type: 'score', draw: 0 });
  assert.equal(getLastRound(reward).originPoints, 0);
  assert.equal(correct(reward, true, true), reward);
  const revised = correct(reward, false, false);
  assert.equal(revised.phase, 'award');
  assert.deepEqual(revised.award, { team: 0, power: 'tenSeconds', points: 0 });
  assert.equal(revised.marks.fast, true);
  assert.equal(getLastRound(revised).fast, true);
  assert.equal(revised.teams[0].powers.tenSeconds, 1);
  const current = apply(revised, { type: 'advance' }, use(0, 1, 'tenSeconds'), { type: 'openTrack' },
    { type: 'reveal' }, mark('title'));
  const changedAgain = correct(current, true, false);
  assert.equal(changedAgain.teams[0].score, 2);
  assert.equal(changedAgain.teams[0].powers.tenSeconds, 0);
  assert.equal(changedAgain.phase, 'reveal');
  assert.equal(changedAgain.effect, 'tenSeconds');
  assert.equal(changedAgain.effectSource, 0);
  assert.equal(changedAgain.marks, current.marks);
  assert.equal(changedAgain.opened, true);
});

test('uma vitória corrigida suspende e reabre a rodada seguinte sem alterar ações nem estoque', () => {
  const initial = start(3);
  initial.teams[1].powers.skipTrack = 1;
  const next = apply(initial, { type: 'reveal' }, mark('title'), scoreNow);
  const playing = apply(next, use(1, 1, 'skipTrack'), { type: 'openTrack' });
  for (const current of [playing, apply(playing, { type: 'reveal' }, mark('origin'))]) {
    const won = correct(current, true, true);
    assert.deepEqual([won.phase, won.winner, getLastRound(won).round], ['finished', 0, 1]);
    assert.equal(won.lastRound.resumePhase, current.phase);
    assert.equal(won.award.points, 3);
    assert.equal(won.teams[0].score, 3);
    assert.equal(won.teams[1].powers.skipTrack, 0);
    const resumed = correct(won, true, false);
    assert.deepEqual(resumed, current);
    assert.deepEqual(correct(resumed, true, true), won);
  }
});

test('corrigir o resultado final reabre a próxima vez se houver faixa e respeita fim do baralho', () => {
  const final = apply(start(2), { type: 'reveal' }, mark('title'), mark('fast'), scoreNow);
  assert.equal(final.winner, 0);
  const next = correct(final, false, true);
  assert.equal(next.phase, 'listen');
  assert.equal(next.winner, null);
  assert.equal(next.round, 2);
  assert.equal(next.teams[0].score, 1);
  assert.equal(getLastRound(next).power, null);
  assert.ok(Object.values(next.teams[0].powers).every(n => n === 0));
  const exhausted = apply(start(2, [personal[0]]), { type: 'reveal' }, scoreNow);
  assert.equal(exhausted.winner, null);
  const won = correct(exhausted, true, false);
  assert.equal(won.winner, 0);
  const ended = correct(won, false, true);
  assert.equal(ended.phase, 'finished');
  assert.equal(ended.winner, null);
  assert.equal(ended.trackIndex, 0);
});

test('ao editar o painel de prêmio uma vitória mantém o poder e pode ser reaberta', () => {
  const reward = apply(start(3), { type: 'reveal' }, mark('title'), mark('fast'), { type: 'score', draw: 0 });
  const won = correct(reward, true, true);
  assert.equal(won.winner, 0);
  assert.equal(won.phase, 'finished');
  assert.equal(won.teams[0].powers.tenSeconds, 1);
  assert.equal(won.award.power, 'tenSeconds');
  const next = correct(won, true, false);
  assert.equal(next.round, 2);
  assert.equal(next.phase, 'listen');
  assert.equal(next.teams[0].powers.tenSeconds, 1);
  assert.equal(next.notice.power, 'tenSeconds');
});

test('na gravação antiga só reconstrói a rodada quando a marcação ainda existe', () => {
  const awarded = apply(start(), { type: 'reveal' }, mark('title'), { type: 'score' });
  const { lastRound, ...legacy } = awarded;
  assert.deepEqual(getLastRound(legacy), getLastRound(awarded));
  assert.equal(getLastRound({ ...legacy, lastRound: null }), null);
  for (const invalidAward of [
    { ...legacy.award, team: 2 },
    { ...legacy.award, points: 6 },
    { ...legacy.award, power: 'tenSeconds' },
  ]) assert.equal(getLastRound({ ...legacy, award: invalidAward }), null);
  assert.equal(getLastRound({ ...legacy, teams: start().teams }), null);
  const next = gameReducer(legacy, { type: 'advance' });
  assert.deepEqual(next.lastRound, lastRound);
  const { lastRound: unused, ...older } = next;
  assert.equal(getLastRound(older), null);
  assert.equal(correct(older, true, false, 1), older);
});

test('um histórico inválido limita a correção sem criar uma rodada substituta', () => {
  const first = apply(start(), { type: 'reveal' }, mark('title'), scoreNow);
  const last = first.lastRound;
  for (const changes of [
    { round: 8 }, { trackIndex: -1 }, { team: 2 }, { fast: 'sim' }, { doubled: null }, { points: 6 },
    { resumePhase: 'award' }, { power: 'inexistente' },
  ]) {
    const game = { ...first, lastRound: { ...last, ...changes } };
    assert.equal(getLastRound(game), null);
    assert.equal(correct(game, false, false, last.round), game);
  }
});
