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

export function includePlayedMatch(previous, match) {
  if (!match) return previous;
  const { game } = match;
  const phase = game.lastRound?.resumePhase ?? game.phase;
  const end = game.trackIndex + (game.opened || phase !== 'listen' ? 1 : 0);
  const restored = restoreTrackHistory(game);
  const start = restored.historyStartIndex ?? game.historyStartIndex ?? 0;
  const skipped = new Set(restored.unheardSkips ?? game.unheardSkips);
  const urls = new Set();
  for (let i = start; i < end; i++) {
    if (!skipped.has(i)) urls.add(game.deck[i].url);
  }
  if (!urls.size) return previous;
  return [...previous, [...urls]].slice(-matchLimit);
}
