import assert from 'node:assert/strict';
import test from 'node:test';
import { allOriginIds, trackCount, tracksForOrigins } from '../src/catalog.js';
import { startGame } from '../src/game.js';
import { playlistPreferenceKey, previousPlaylistSelection, readPlaylistPreference, writePlaylistPreference } from '../src/playlist-preference.js';
import myMind from '../src/data/my-mind-70-30.json' with { type: 'json' };

test('my mind coloca no sorteio 70 famosas e 30 variadas sem repetir músicas', () => {
  const hits = myMind.tracks.filter(track => track.selection_group === 'famosas');
  const variety = myMind.tracks.filter(track => track.selection_group === 'variadas');
  assert.equal(hits.length, 70);
  assert.equal(variety.length, 30);
  assert.ok(hits.every(track => track.global_streams_at_selection > 870_000_000));
  assert.equal(new Set(variety.map(track => track.artist.split(',')[0])).size, 30);
  const deck = startGame({ players: ['Felipe'], goal: 10, originIds: ['my-mind'] }).deck;
  assert.equal(deck.length, 100);
  assert.equal(new Set(deck.map(t => t.artist.toLowerCase() + '|' + t.title.toLowerCase())).size, 100);
  assert.deepEqual(new Set(deck.map(t => t.url)), new Set(myMind.tracks.map(t => t.spotify_url)));
});

test('cada combinação sorteia a união das listas, com uma cópia por faixa e apenas as origens válidas', () => {
  const all = tracksForOrigins();
  assert.equal(all.length, trackCount);
  for (let mask = 1; mask < 2 ** allOriginIds.length; mask++) {
    const originIds = allOriginIds.filter((_, i) => mask & (1 << i));
    const game = startGame({ players: ['A', 'B'], goal: 10, originIds });
    const expected = all.filter(track => track.origins.some(id => originIds.includes(id)));
    const byUrl = new Map(game.deck.map(track => [track.url, track.origins]));
    assert.equal(game.deck.length, expected.length);
    assert.equal(byUrl.size, expected.length);
    for (const t of expected) assert.deepEqual(byUrl.get(t.url), t.origins.filter(id => originIds.includes(id)));
  }
  const withoutJunior = tracksForOrigins(allOriginIds.filter(id => id !== 'junior-5'));
  assert.deepEqual(withoutJunior.find(t => t.title === '505').origins, ['my-mind']);
  assert.deepEqual(tracksForOrigins().find(t => t.title === '505').origins, ['my-mind', 'junior-5']);
});

test('a seleção vazia não gera uma partida sem faixa', () => {
  assert.deepEqual(tracksForOrigins([]), []);
  assert.throws(() => startGame({ players: ['Você'], goal: 15, originIds: [] }), /playlist/);
});

test('lembra a seleção aplicada e permite incluir Júnior de novo', () => {
  const data = new Map();
  const storage = () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) });
  assert.equal(readPlaylistPreference(storage), null);
  const withoutJunior = allOriginIds.filter(id => id !== 'junior-5');
  writePlaylistPreference(withoutJunior, storage);
  assert.deepEqual(readPlaylistPreference(storage), withoutJunior);
  writePlaylistPreference(allOriginIds, storage);
  assert.deepEqual(readPlaylistPreference(storage), allOriginIds);
  assert.deepEqual([...data.keys()], [playlistPreferenceKey]);
});

test('aproveita partidas anteriores e mantém apenas playlists disponíveis', () => {
  const withTeam = tracksForOrigins(['junior-5', 'classicos-br']);
  assert.deepEqual(previousPlaylistSelection(withTeam), ['junior-5', 'classicos-br']);
  assert.deepEqual(previousPlaylistSelection(), allOriginIds);
  assert.deepEqual(previousPlaylistSelection([{ origins: ['removida'] }]), allOriginIds);
  const stored = value => () => ({ getItem: () => value });
  assert.deepEqual(readPlaylistPreference(stored('["removida","my-mind","my-mind"]')), ['my-mind']);
  for (const raw of ['["removida"]', '[]', '{', 'null']) assert.equal(readPlaylistPreference(stored(raw)), null);
  const blocked = () => { throw Error('Armazenamento bloqueado'); };
  assert.equal(readPlaylistPreference(blocked), null);
  assert.doesNotThrow(() => writePlaylistPreference(['my-mind'], blocked));
});
