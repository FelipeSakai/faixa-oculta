import assert from 'node:assert/strict';
import test from 'node:test';
import { tracksForOrigins } from '../src/catalog.js';
import { availablePowerIds, gameReducer, getLastRound, getRound, powerBlockReason, startGame } from '../src/game.js';

const players = ['Azul', 'Verde', 'Laranja'];
const deck = tracksForOrigins(['my-mind']).slice(0, 6);
const start = (goal = 10, tracks = deck) => startGame({ players, goal, powersEnabled: true }, tracks);
const apply = (game, ...actions) => actions.reduce(gameReducer, game);
const use = (power, sourceTeam = 2, targetTeam = 0) => ({ type: 'usePower', sourceTeam, targetTeam, power });
const mark = (mark, checked = true) => ({ type: 'mark', mark, checked });
const correct = (title, origin, rebound) => ({ type: 'correctLastRound', round: 1, title, origin, rebound });
const open = { type: 'openTrack' };
const reveal = { type: 'reveal' };
const score = { type: 'score', skipAnimation: true };

test('Rebote é sorteado só em equipe e só uma rival com estoque pode usá-lo após abrir a faixa', () => {
  const game = start();
  const solo = startGame({ players: ['Solo'], goal: 10, powersEnabled: true }, deck);
  assert.equal(availablePowerIds(solo).includes('rebound'), false);
  assert.equal(availablePowerIds(game).at(-1), 'rebound');
  const reward = apply(game, reveal, mark('title'), mark('fast'), { type: 'score', draw: 0.999 });
  assert.equal(reward.award.power, 'rebound');
  assert.equal(reward.teams[0].powers.rebound, 1);
  const next = gameReducer(reward, { type: 'advance' });
  const action = use('rebound', 0, 1);
  assert.equal(powerBlockReason(next, 0, 'rebound'), 'trackNotOpened');
  assert.equal(gameReducer(next, action), next);
  const opened = gameReducer(next, open);
  assert.equal(powerBlockReason(opened, 1, 'rebound'), 'opponentTurn');
  for (const attempt of [use('rebound', 1, 1), use('rebound', 2, 1), use('rebound', 0, 0)]) {
    assert.equal(gameReducer(opened, attempt), opened);
  }
  const taken = gameReducer(opened, action);
  assert.equal(taken.reboundTeam, 0);
  assert.equal(taken.teams[0].powers.rebound, 0);
  const answer = gameReducer(taken, reveal);
  assert.equal(gameReducer(answer, action), answer);
  assert.equal(gameReducer(apply(next, open, reveal), action).reboundTeam, null);
});

test('confirmar os palpites mantém ataque e dica já ativos e fecha as trocas, poderes e tentativas', () => {
  const game = start();
  for (const team of game.teams) {
    for (const power of Object.keys(team.powers)) team.powers[power] = 2;
  }
  const opened = apply(game, use('readLyrics', 1), use('mainArtist', 0), use('secondGuess', 0), open);
  const taken = gameReducer(opened, use('rebound'));
  assert.equal(taken.effect, 'readLyrics');
  assert.deepEqual(taken.hint, opened.hint);
  assert.equal(taken.retry, 'ready');
  assert.equal(taken.teams[2].powers.rebound, 1);
  assert.equal(getRound(taken).canSwap, false);
  assert.equal(getRound(taken).canRetry, false);
  assert.equal(powerBlockReason(taken, 1, 'rebound'), 'reboundTaken');
  assert.equal(powerBlockReason(taken, 0, 'skipTrack'), 'reboundLocked');
  for (const action of [use('rebound', 1), use('rebound'), use('skipTrack', 0), use('chorus', 0),
    use('instrumental', 1), { type: 'swap' }, { type: 'retry' }, mark('rebound')]) {
    assert.equal(gameReducer(taken, action), taken);
  }
  assert.equal(gameReducer(taken, open), taken);
  assert.equal(gameReducer(taken, reveal).phase, 'reveal');
});

test('a origem pode pontuar com o rebote rival, mas o dobro só se aplica à equipe da vez', () => {
  const game = start();
  game.teams[0].powers.doublePoints = 1;
  game.teams[2].powers.rebound = 1;
  const plain = apply(game, reveal);
  assert.equal(gameReducer(plain, mark('rebound')), plain);
  const answer = apply(game, use('doublePoints', 0), open, use('rebound'), reveal);
  const rebound = apply(answer, mark('origin'), mark('rebound'));
  assert.equal(getRound(rebound).points, 2);
  assert.equal(getRound(rebound).reboundPoints, 1);
  const title = gameReducer(rebound, mark('title'));
  assert.equal(title.marks.rebound, false);
  assert.equal(gameReducer(title, mark('rebound')), title);
  assert.equal(gameReducer(title, mark('title', false)).marks.rebound, false);
  const next = gameReducer(rebound, score);
  assert.deepEqual(next.teams.map(t => t.score), [2, 0, 1]);
  assert.deepEqual([next.reboundTeam, next.marks.rebound], [null, false]);
  assert.equal(getLastRound(next).rebound, true);
  assert.equal(getLastRound(next).reboundTeam, 2);
  const onlyRival = apply(answer, mark('rebound'), { type: 'score' });
  assert.equal(onlyRival.phase, 'award');
  assert.deepEqual(onlyRival.award, { team: 0, points: 0, power: null, reboundTeam: 2, reboundPoints: 1 });
  assert.equal(gameReducer(onlyRival, score), onlyRival);
});

test('a rival pode vencer, cede a prioridade em empate de meta e mantém o crédito correto nas correções', () => {
  const game = start(5);
  game.teams[0].score = 4;
  game.teams[2].score = 4;
  game.teams[2].powers.rebound = 1;
  const answer = apply(game, open, use('rebound'), reveal, mark('rebound'));
  assert.equal(getRound(answer).endsAfterRound, true);
  const rival = gameReducer(answer, score);
  assert.deepEqual([rival.phase, rival.winner], ['finished', 2]);
  assert.equal(getLastRound(rival).reboundTeam, 2);
  const tied = gameReducer(rival, correct(false, true));
  assert.deepEqual([tied.winner, ...tied.teams.map(t => t.score)], [0, 5, 0, 5]);
  const simultaneous = gameReducer(apply(answer, mark('origin')), score);
  assert.equal(simultaneous.winner, 0);
  assert.deepEqual(simultaneous.teams, tied.teams);
  const title = gameReducer(tied, correct(true, false));
  assert.deepEqual([title.winner, title.teams[0].score, title.teams[2].score], [0, 6, 4]);
  assert.equal(title.award.reboundPoints, 0);
  assert.equal(getLastRound(title).rebound, false);
  const back = gameReducer(title, correct(false, false, true));
  assert.deepEqual(back, rival);
  assert.equal(gameReducer(back, correct(false, false, true)), back);
  const next = gameReducer(back, correct(false, false, false));
  assert.deepEqual([next.phase, next.round, next.winner, next.teams[2].powers.rebound], ['listen', 2, null, 0]);
});

test('vitória revista suspende a próxima rodada e a reabre com os próprios palpites intactos', () => {
  const game = start(2);
  game.teams[0].powers.rebound = 1;
  game.teams[2].powers.rebound = 1;
  game.teams[2].score = 1;
  const next = apply(game, open, use('rebound'), reveal, score);
  assert.deepEqual([getLastRound(next).reboundTeam, getLastRound(next).rebound], [2, false]);
  const current = apply(next, open, use('rebound', 0, 1), reveal, mark('rebound'));
  const won = gameReducer(current, correct(false, false, true));
  assert.deepEqual([won.phase, won.winner, won.award.reboundTeam, won.reboundTeam], ['finished', 2, 2, 0]);
  assert.equal(getLastRound(won).rebound, true);
  assert.equal(won.award.reboundPoints, 1);
  const resumed = gameReducer(won, correct(false, false, false));
  assert.deepEqual(resumed, current);
  assert.equal(gameReducer(resumed, score).teams[0].score, 1);
});

test('corrigir um prêmio mantém o sorteio e o gasto, e o fim do baralho continua definitivo', () => {
  const game = start();
  game.teams[2].powers.rebound = 1;
  const reward = apply(game, open, use('rebound'), reveal, mark('title'), mark('fast'), { type: 'score', draw: 0.999 });
  const rival = gameReducer(reward, correct(false, false, true));
  assert.equal(rival.phase, 'award');
  assert.equal(rival.award.power, 'rebound');
  assert.equal(getLastRound(rival).rebound, true);
  assert.deepEqual(rival.teams.map(t => t.powers.rebound), [1, 0, 0]);
  assert.deepEqual(gameReducer(rival, correct(true, false)), reward);
  assert.equal(getLastRound({ ...rival, award: { ...rival.award, reboundPoints: 0 } }), null);
  assert.equal(getLastRound({ ...rival, lastRound: { ...rival.lastRound, reboundTeam: 0 } }), null);
  const last = start(1, deck.slice(0, 1));
  last.teams[2].powers.rebound = 1;
  const final = apply(last, open, use('rebound'), reveal, mark('rebound'), score);
  const noWinner = gameReducer(final, correct(false, false, false));
  assert.equal(noWinner.phase, 'finished');
  assert.equal(noWinner.winner, null);
  assert.equal(getLastRound(noWinner).rebound, false);
  assert.deepEqual(gameReducer(noWinner, correct(false, false, true)), final);
});
