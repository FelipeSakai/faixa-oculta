import { allOriginIds } from './catalog.js';

export const playlistPreferenceKey = 'faixa-oculta.playlists.v1';

export function readPlaylistPreference(storage = () => window.localStorage) {
  try {
    const stored = JSON.parse(storage().getItem(playlistPreferenceKey));
    if (!Array.isArray(stored)) return null;
    const available = allOriginIds.filter(id => stored.includes(id));
    return available.length ? available : null;
  } catch {
    return null;
  }
}

export function writePlaylistPreference(ids, storage = () => window.localStorage) {
  try {
    storage().setItem(playlistPreferenceKey, JSON.stringify(ids));
  } catch { /* The current tab still keeps the selection in React state. */ }
}

export function previousPlaylistSelection(deck) {
  if (!deck) return allOriginIds;
  const used = new Set(deck.flatMap(track => track.origins));
  const available = allOriginIds.filter(id => used.has(id));
  return available.length ? available : allOriginIds;
}
