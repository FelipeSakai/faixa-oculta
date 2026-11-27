const matchLimit = 3;
const trackUrl = /^https:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]{22}$/;

export function readRecentMatches(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-matchLimit).filter(Array.isArray).map(urls =>
    [...new Set(urls.filter(url => typeof url === 'string' && trackUrl.test(url)))]
  );
}

export function restoreTrackHistory(game) {
  const start = game.historyStartIndex ?? 0;
  const validStart = Number.isSafeInteger(start) && start >= 0 && start <= game.trackIndex;
  if (validStart && Array.isArray(game.unheardSkips) &&
      game.unheardSkips.every(i => Number.isSafeInteger(i) && i >= 0 && i < game.trackIndex)) return {};
  // Older saves counted skips but did not identify which tracks a power skipped unheard.
  const freeSwaps = game.teams.filter(team => team.swapUsed).length;
  const hadPowerSkip = game.trackIndex > game.round - 1 + freeSwaps;
  return hadPowerSkip || !validStart ? { unheardSkips: [], historyStartIndex: game.trackIndex } : { unheardSkips: [] };
}

function playedEnd(game) {
  const phase = game.lastRound?.resumePhase ?? game.phase;
  return game.trackIndex + (game.opened || phase !== 'listen' ? 1 : 0);
}

function clearedAt(game) {
  const index = game?.historyClearedAt;
  return Number.isSafeInteger(index) && index >= 0 && index <= game.trackIndex + 1 ? index : null;
}

export function clearTrackHistory(game) {
  return { ...game, historyClearedAt: playedEnd(game), unheardSkips: [] };
}

function* playedUrls(game, cutoff) {
  const end = playedEnd(game);
  const restored = restoreTrackHistory(game);
  const start = Math.max(cutoff ?? 0, restored.historyStartIndex ?? game.historyStartIndex ?? 0);
  const skipped = new Set(restored.unheardSkips ?? game.unheardSkips);
  for (let i = start; i < end; i++) {
    if (!skipped.has(i)) yield game.deck[i].url;
  }
}

export function hasPlayedTracks(previous, match) {
  const cutoff = clearedAt(match?.game);
  if (cutoff === null && previous.some(urls => urls.length)) return true;
  return Boolean(match && !playedUrls(match.game, cutoff).next().done);
}

export function includePlayedMatch(previous, match) {
  if (!match) return previous;
  const cutoff = clearedAt(match.game);
  // The immutable deck may carry older match groups. A reset in its progress supersedes them.
  if (cutoff !== null) previous = [];
  const urls = new Set(playedUrls(match.game, cutoff));
  if (!urls.size) return previous;
  return [...previous, [...urls]].slice(-matchLimit);
}
