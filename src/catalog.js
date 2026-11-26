import myMind from './data/my-mind-70-30.json' with { type: 'json' };
import topBrazil from './data/top-brasil-2026-11-24.json' with { type: 'json' };
import topBrazilExtras from './data/top-brasil-extras-2026-11-24.json' with { type: 'json' };
import mostPlayed from './data/mais-ouvidas-de-sempre.json' with { type: 'json' };
import junior from './data/junior-playlist-5.json' with { type: 'json' };
import matchola from './data/matchola-flashback.json' with { type: 'json' };
import yaschan from './data/yaschan-antidepressiva.json' with { type: 'json' };
import bela from './data/bela-2028.json' with { type: 'json' };
import classics from './data/classicos-br.json' with { type: 'json' };
import internationalClassics from './data/classicos-internacionais.json' with { type: 'json' };

const collections = [
  { id: 'my-mind', label: myMind.playlist.name, person: myMind.playlist.owner, tracks: myMind.tracks },
  { id: 'top-brasil', label: 'Hits Brasil', tracks: [...topBrazil.tracks, ...topBrazilExtras.tracks] },
  { id: 'mais-ouvidas', label: 'Mais ouvidas de sempre', person: mostPlayed.playlist.listener, tracks: mostPlayed.tracks },
  { id: 'junior-5', label: junior.playlist.name, person: junior.playlist.owner, tracks: junior.tracks },
  { id: 'matchola', label: matchola.playlist.name, person: matchola.playlist.owner, tracks: matchola.tracks },
  { id: 'yaschan', label: yaschan.playlist.name, person: yaschan.playlist.owner, tracks: yaschan.tracks },
  { id: 'bela', label: bela.playlist.name, person: bela.playlist.owner, tracks: bela.tracks },
  { id: 'classicos-br', label: classics.name, tracks: classics.tracks },
  { id: 'classicos-internacionais', label: internationalClassics.name, tracks: internationalClassics.tracks },
];

export const originLabels = Object.fromEntries(collections.map(({ id, label, person }) =>
  [id, person ? label + ' · ' + person : label]
));
export const allOriginIds = [
  ...collections.filter(collection => collection.person),
  ...collections.filter(collection => !collection.person),
].map(collection => collection.id);

export function orderedOriginIds(ids) {
  const used = new Set(ids);
  const known = allOriginIds.filter(id => used.has(id));
  const unknown = [...used].filter(id => !Object.hasOwn(originLabels, id));
  return known.concat(unknown);
}

const tracksByUrl = new Map();
for (const collection of collections) {
  for (const track of collection.tracks) {
    const existing = tracksByUrl.get(track.spotify_url);
    if (existing) {
      if (!existing.origins.includes(collection.id)) existing.origins.push(collection.id);
    } else {
      tracksByUrl.set(track.spotify_url, {
        title: track.title,
        artist: track.artist,
        url: track.spotify_url,
        origins: [collection.id],
      });
    }
  }
}

export const trackCount = tracksByUrl.size;

export function tracksForOrigins(ids = allOriginIds) {
  const selected = new Set(ids);
  const tracks = [];
  for (const track of tracksByUrl.values()) {
    const origins = track.origins.filter(id => selected.has(id));
    if (origins.length) tracks.push(origins.length === track.origins.length ? track : { ...track, origins });
  }
  return tracks;
}

export function shuffleTracks(random = Math.random, originIds = allOriginIds) {
  const shuffled = tracksForOrigins(originIds);
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

