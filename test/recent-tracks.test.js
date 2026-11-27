import assert from 'node:assert/strict';
import test from 'node:test';
import { shuffleTracks, tracksForOrigins } from '../src/catalog.js';
import { gameReducer, startGame } from '../src/game.js';
import { createMatchStore, saveKey } from '../src/saved-match.js';

const selection = ['my-mind'];
const catalog = tracksForOrigins(selection);
const keepOrder = () => 0.999999;
const urls = tracks => tracks.map(track => track.url);
const players = ['Azul', 'Verde'];
function match(id, deck) {
  return { id, players, game: startGame({ players, goal: 30, powersEnabled: true }, deck) };
}
function storage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
}
function replace(store, next) {
  assert.ok(store.commit(store.getSnapshot().match, next));
}
function play(store, ...actions) {
  for (const action of actions) {
    const current = store.getSnapshot().match;
    replace(store, { ...current, game: gameReducer(current.game, action) });
  }
}

test('uma partida retomada ou abandonada conta apenas as faixas abertas ou reveladas', () => {
  const disk = storage();
  const writes = [];
  const write = disk.setItem;
  disk.setItem = (key, value) => { writes.push(key); write(key, value); };
  let store = createMatchStore(() => disk);
  const first = match('A', catalog.slice(0, 8));
  for (const team of first.game.teams) team.powers.skipTrack = 1;
  replace(store, first);
  const setupKey = writes.find(key => key.includes('baralho'));
  const fixed = disk.getItem(setupKey);
  play(store,
    { type: 'usePower', sourceTeam: 0, targetTeam: 0, power: 'skipTrack' }, // Index 0 stayed hidden.
    { type: 'openTrack' }, { type: 'swap' },                               // Index 1 was opened.
    { type: 'reveal' }, { type: 'score' },                                  // Index 2 was revealed.
    { type: 'openTrack' }, { type: 'usePower', sourceTeam: 1, targetTeam: 1, power: 'skipTrack' }
  );
  const heard = urls(catalog.slice(1, 4));
  assert.equal(store.getSnapshot().match.game.trackIndex, 4);
  assert.equal(disk.getItem(setupKey), fixed);
  assert.ok(writes.slice(3).every(key => key.includes('progresso')));
  store = createMatchStore(() => disk);
  const nextDeck = store.createDeck(selection, store.getSnapshot().match, keepOrder);
  assert.deepEqual(urls(nextDeck.slice(-3)), heard);
  assert.equal(nextDeck.length, catalog.length);
  assert.deepEqual(new Set(urls(nextDeck)), new Set(urls(catalog)));
  replace(store, match('B', nextDeck));
  const reloaded = createMatchStore(() => disk);
  assert.deepEqual(urls(reloaded.createDeck(selection, undefined, keepOrder)), urls(nextDeck));
});

test('as três partidas recentes adiam faixas na ordem de menor para maior recência', () => {
  const disk = storage();
  let store = createMatchStore(() => disk);
  for (let i = 0; i < 4; i++) {
    replace(store, match('partida-' + i, [catalog[i]]));
    play(store, { type: 'reveal' }, { type: 'score' });
    assert.equal(store.getSnapshot().match.game.phase, 'finished');
    store = createMatchStore(() => disk);
  }
  const deck = store.createDeck(selection, undefined, keepOrder);
  assert.equal(deck[0].url, catalog[0].url);
  assert.deepEqual(urls(deck.slice(-3)), urls(catalog.slice(1, 4)));
  assert.equal(deck.length, catalog.length);
});

test('cada faixa usa sua aparição mais recente e empates continuam embaralhados', () => {
  const [a, b, c, d] = urls(catalog);
  const groups = [[a, b, c], [b, d], [c]];
  const first = shuffleTracks(keepOrder, selection, groups);
  const second = shuffleTracks(() => 0.5, selection, groups);
  for (const deck of [first, second]) {
    const tail = urls(deck.slice(-4));
    assert.equal(tail[0], a);
    assert.deepEqual(new Set(tail.slice(1, 3)), new Set([b, d]));
    assert.equal(tail[3], c);
    assert.deepEqual(new Set(urls(deck)), new Set(urls(catalog)));
  }
  assert.notDeepEqual(urls(first.slice(0, -4)), urls(second.slice(0, -4)));
  const allHeard = shuffleTracks(keepOrder, selection, [urls(catalog.slice(0, 20)), urls(catalog.slice(20))]);
  assert.deepEqual(new Set(urls(allHeard.slice(0, 20))), new Set(urls(catalog.slice(0, 20))));
  assert.equal(allHeard.length, catalog.length);
});

test('uma música compartilhada tem um único histórico, sempre com as origens da seleção atual', () => {
  const disk = storage();
  const store = createMatchStore(() => disk);
  const shared = catalog.find(track => track.title === '505');
  replace(store, match('A', [shared]));
  play(store, { type: 'openTrack' });
  const next = store.createDeck(['junior-5'], undefined, keepOrder);
  assert.equal(next.at(-1).url, shared.url);
  assert.deepEqual(next.at(-1).origins, ['junior-5']);
  assert.deepEqual(new Set(urls(next)), new Set(urls(tracksForOrigins(['junior-5']))));
  assert.equal(new Set(urls(next)).size, next.length);
  assert.deepEqual(store.createDeck([]), []);
});

test('a mesma música com outro ID do Spotify vai para o fim mesmo quando muda a playlist', () => {
  const titles = ['Like a Stone', 'Crack com Mussilon'];
  const firstList = 'mais-ouvidas';
  const secondList = 'leo-willy-sakai';
  for (const [from, to] of [[firstList, secondList], [secondList, firstList]]) {
    const disk = storage();
    const store = createMatchStore(() => disk);
    const earlier = tracksForOrigins([from]).filter(t => titles.includes(t.title));
    const eligible = tracksForOrigins([to]);
    const alternatives = eligible.filter(t => titles.includes(t.title));
    assert.equal(earlier.length, 2);
    assert.equal(alternatives.length, 2);
    assert.ok(earlier.every(t => !urls(alternatives).includes(t.url)));
    replace(store, match('A', earlier));
    play(store, { type: 'reveal' }, { type: 'score' }, { type: 'openTrack' });
    const next = store.createDeck([to], undefined, keepOrder);
    assert.deepEqual(new Set(urls(next.slice(-2))), new Set(urls(alternatives)));
    assert.deepEqual(new Set(urls(next)), new Set(urls(eligible)));
    assert.ok(next.every(t => t.origins.length === 1 && t.origins[0] === to));
    assert.deepEqual(store.getSnapshot().match.game.deck, earlier);
  }
});

test('uma vitória por correção só inclui a faixa do turno seguinte se ela já foi vista', () => {
  for (const revealed of [false, true]) {
    const disk = storage();
    const store = createMatchStore(() => disk);
    const first = match('A', catalog.slice(0, 4));
    first.game.goal = 2;
    replace(store, first);
    play(store, { type: 'reveal' }, { type: 'score' });
    if (revealed) play(store, { type: 'reveal' });
    play(store, { type: 'correctLastRound', round: 1, title: true, origin: false });
    assert.equal(store.getSnapshot().match.game.phase, 'finished');
    replace(store, match('B', catalog.slice(4, 7)));
    const history = JSON.parse(disk.getItem('faixa-oculta.baralho.B')).recentMatches;
    assert.deepEqual(history, [urls(catalog.slice(0, revealed ? 2 : 1))]);
  }
});

test('histórico em memória sobrevive à falta de armazenamento e volta a ser salvo quando disponível', () => {
  let blocked = true;
  const disk = storage();
  const store = createMatchStore(() => { if (blocked) throw Error('bloqueado'); return disk; });
  replace(store, match('A', [catalog[0]]));
  play(store, { type: 'openTrack' });
  replace(store, match('B', [catalog[1]]));
  play(store, { type: 'reveal' });
  assert.deepEqual(urls(store.createDeck(selection, undefined, keepOrder).slice(-2)), urls(catalog.slice(0, 2)));
  blocked = false;
  play(store, { type: 'score' });
  const reloaded = createMatchStore(() => disk);
  assert.deepEqual(urls(reloaded.createDeck(selection, undefined, keepOrder).slice(-2)), urls(catalog.slice(0, 2)));
});

test('uma substituição interrompida mantém o histórico anterior no disco e o retry grava o novo só uma vez', () => {
  const disk = storage();
  const store = createMatchStore(() => disk);
  replace(store, match('A', [catalog[0]]));
  play(store, { type: 'openTrack' });
  const write = disk.setItem;
  disk.setItem = (key, value) => { if (key === saveKey) throw Error('sem espaço'); write(key, value); };
  replace(store, match('B', [catalog[1]]));
  assert.equal(store.getSnapshot().issue, 'unavailable');
  assert.equal(createMatchStore(() => disk).getSnapshot().match.id, 'A');
  disk.setItem = write;
  play(store, { type: 'openTrack' });
  const setup = JSON.parse(disk.getItem('faixa-oculta.baralho.B'));
  assert.deepEqual(setup.recentMatches, [[catalog[0].url]]);
  assert.deepEqual(urls(createMatchStore(() => disk).createDeck(selection, undefined, keepOrder).slice(-2)), urls(catalog.slice(0, 2)));
});

test('o primeiro sorteio após um save antigo usa só o trecho que o progresso permite identificar', () => {
  for (const uncertain of [true, false]) {
    const disk = storage();
    const old = match('antiga', catalog.slice(0, 5));
    delete old.game.unheardSkips;
    Object.assign(old.game, { round: 2, trackIndex: uncertain ? 2 : 1, opened: true });
    disk.setItem(saveKey, JSON.stringify({ version: 1, match: old }));
    const store = createMatchStore(() => disk);
    const expected = uncertain ? [catalog[2].url] : urls(catalog.slice(0, 2));
    replace(store, match('nova', catalog.slice(5, 8)));
    assert.deepEqual(JSON.parse(disk.getItem('faixa-oculta.baralho.nova')).recentMatches, [expected]);
  }
});
