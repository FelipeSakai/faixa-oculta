import assert from 'node:assert/strict';
import test from 'node:test';
import { personalOriginIds, tracksForOrigins } from '../src/catalog.js';
import { gameReducer, getRound, startGame } from '../src/game.js';

const settings = { players: ['Azul', 'Verde'], goal: 15, powersEnabled: true };
const markOrigin = { type: 'mark', mark: 'origin', checked: true };
const markTitle = { type: 'mark', mark: 'title', checked: true };

test('só as playlists pessoais selecionadas da faixa habilitam o ponto de origem', () => {
  // This recording appears in Hits Brasil and in the playlists of Leleco and Valota.
  const url = 'https://open.spotify.com/track/5oI9blwsXC8AkTWw6wASY8';
  for (const people of [[], ['mais-ouvidas'], ['valota'], ['mais-ouvidas', 'valota']]) {
    const selected = ['top-brasil', ...people];
    const track = tracksForOrigins(selected).find(t => t.url === url);
    assert.deepEqual(new Set(personalOriginIds(track.origins)), new Set(people));
    const game = startGame(settings, [track]);
    const reveal = gameReducer(game, { type: 'reveal' });
    const marked = gameReducer(reveal, markOrigin);
    // Knowing either person can score once even if the team missed the song title.
    const expected = people.length ? 1 : 0;
    assert.deepEqual(new Set(getRound(marked).personalOrigins), new Set(people));
    assert.equal(getRound(marked).originPoints, expected);
    assert.deepEqual(marked.marks, { title: false, origin: Boolean(expected), fast: false, rebound: false });
    assert.equal(gameReducer(marked, { type: 'score', skipAnimation: true }).teams[0].score, expected);
    const onlyTitle = gameReducer(reveal, markTitle);
    assert.equal(gameReducer(onlyTitle, { type: 'score', skipAnimation: true }).teams[0].score, 2);
  }
});

test('Hits Brasil e os dois catálogos de clássicos permitem só pontos pelo título, inclusive com dobro', () => {
  for (const id of ['top-brasil', 'classicos-br', 'classicos-internacionais']) {
    const game = startGame(settings, tracksForOrigins([id]).slice(0, 2));
    game.teams[0].powers.doublePoints = 1;
    const doubled = gameReducer(game, { type: 'usePower', sourceTeam: 0, targetTeam: 0, power: 'doublePoints' });
    for (const current of [game, doubled]) {
      const reveal = gameReducer(current, { type: 'reveal' });
      const marked = gameReducer(reveal, markOrigin);
      assert.equal(marked.marks.origin, false);
      const titled = gameReducer(marked, markTitle);
      // Unscored legacy saves may contain a previously checked origin box.
      const oldMarks = { ...titled, marks: { ...titled.marks, origin: true } };
      assert.equal(getRound(oldMarks).originPoints, 0);
      const next = gameReducer(oldMarks, { type: 'score', skipAnimation: true });
      assert.equal(next.teams[0].score, current.doubled ? 4 : 2);
    }
  }
});
