import { getLastRound, getRound, powers } from './game.js';
import { shuffleTracks } from './catalog.js';
import { clearTrackHistory, hasPlayedTracks, includePlayedMatch, readRecentMatches, restoreTrackHistory } from './recent-tracks.js';

// Keep the original pointer so upgrades find the active game and stale tabs see changes.
export const saveKey = 'faixa-oculta.partida.v1';
export const progressKey = id => 'faixa-oculta.progresso.' + id;
const deckKey = id => 'faixa-oculta.baralho.' + id;
const validTrackUrl = /^https:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]{22}$/;
const count = value => Number.isSafeInteger(value) && value >= 0;
const flag = value => typeof value === 'boolean';
const label = value => typeof value === 'string' && value.trim().length > 0;
const hasPower = id => typeof id === 'string' && Object.hasOwn(powers, id);
const attack = id => id === null || (hasPower(id) && powers[id].opponent);
const inRange = (value, length) => count(value) && value < length;

function validSetup({ id, players, goal, powersEnabled, deck }) {
  return label(id) && Array.isArray(players) && players.length > 0 && players.every(label) &&
    count(goal) && goal > 0 && flag(powersEnabled) && Array.isArray(deck) && deck.length > 0 &&
    deck.every(t => t && label(t.title) && label(t.artist) && typeof t.url === 'string' && validTrackUrl.test(t.url) &&
      Array.isArray(t.origins) && t.origins.length && t.origins.every(label));
}

function validTeam(team) {
  if (!team || !count(team.score) || !flag(team.swapUsed) || !team.powers ||
      (Object.hasOwn(team, 'doubleUsed') && !flag(team.doubleUsed))) return false;
  return Object.keys(powers).every(id => {
    if (Object.hasOwn(team.powers, id)) return count(team.powers[id]);
    return id === 'skipTrack' || (id === 'doublePoints' && flag(team.doubleUsed));
  });
}

function restoreTeam(team) {
  if (!Object.hasOwn(team, 'doubleUsed') && Object.hasOwn(team.powers, 'skipTrack')) return team;
  const { doubleUsed, ...current } = team;
  return {
    ...current,
    powers: {
      ...current.powers,
      skipTrack: current.powers.skipTrack ?? 0,
      doublePoints: current.powers.doublePoints ?? (doubleUsed ? 0 : 1),
    },
  };
}

function validProgress(match) {
  const g = match.game;
  if (!flag(g.powersEnabled) || !inRange(g.trackIndex, g.deck.length) || !Array.isArray(g.teams) || g.teams.length !== match.players.length ||
      !g.teams.every(validTeam)) return false;
  if (!count(g.round) || g.round < 1 || g.round > g.trackIndex + 1 ||
      !['listen', 'reveal', 'choosePower', 'award', 'finished'].includes(g.phase) ||
      !flag(g.opened) || !flag(g.doubled) || !g.marks ||
      (g.powerSkipped !== undefined && !flag(g.powerSkipped)) ||
      (g.powerSkipped && (!g.powersEnabled || g.trackIndex < g.round)) ||
      ![g.marks.title, g.marks.origin, g.marks.fast].every(flag) ||
      !attack(g.effect) || !attack(g.nextEffect ?? null) || ![null, 'ready', 'used'].includes(g.retry)) return false;
  const teamIndex = i => inRange(i, g.teams.length);
  const { turn, team, points, originPoints, lastTrack, canEarnPower } = getRound(g);
  if ((g.effect || g.nextEffect) && (!g.powersEnabled || g.teams.length < 2)) return false;
  if (g.effect) {
    // In older games only the previous team could have set the active effect.
    if (g.effectSource === undefined ? g.round === 1 : !teamIndex(g.effectSource) || g.effectSource === turn) return false;
  } else if (g.effectSource != null) return false;
  if (g.notice !== null && !(g.notice && teamIndex(g.notice.team) && hasPower(g.notice.power))) return false;
  if (g.winner !== null && !(g.phase === 'finished' && teamIndex(g.winner))) return false;
  if (g.phase === 'choosePower') {
    // This legacy phase was saved after crediting origin points, including on general playlists.
    const credited = !originPoints && g.marks.origin ? points + (g.doubled ? 2 : 1) : points;
    return canEarnPower && g.marks.title && g.marks.fast && !lastTrack && team.score < g.goal &&
      team.score >= credited && g.award?.team === turn && g.award.points === credited && g.award.power === null;
  }
  if (g.phase === 'award' || g.phase === 'finished') {
    return g.award && teamIndex(g.award.team) && count(g.award.points) &&
      (g.award.power === null || hasPower(g.award.power));
  }
  return g.award === null;
}

function decode(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

export function createMatchStore(storage = () => window.localStorage) {
  let raw = null;
  let lastProgress = null;
  let savedSetup = null;
  let recentMatches = [];
  let snapshot = { match: null, issue: null };
  const listeners = new Set();

  function publish(match, issue = null) {
    if (snapshot.match === match && snapshot.issue === issue) return;
    snapshot = { match, issue };
    for (const notify of listeners) notify();
  }

  function removeInactive(id) {
    try {
      storage().removeItem(progressKey(id));
      storage().removeItem(deckKey(id));
    } catch { /* The active game has its own keys. */ }
  }

  function refresh() {
    let stored;
    let setup = null;
    let match = null;
    let progressRaw = null;
    try {
      const disk = storage();
      stored = disk.getItem(saveKey);
      if (stored === raw && !savedSetup && snapshot.issue !== 'invalid') return true;
      const record = stored === raw && savedSetup ? { version: 2, id: savedSetup.id } : decode(stored);
      if (record?.version === 1 && record.match?.game) {
        const legacy = record.match;
        if (validSetup({ ...legacy.game, id: legacy.id, players: legacy.players })) match = legacy;
      } else if (record?.version === 2 && label(record.id)) {
        progressRaw = disk.getItem(progressKey(record.id));
        if (stored === raw && savedSetup && progressRaw === lastProgress) return true;
        setup = savedSetup?.id === record.id ? savedSetup : decode(disk.getItem(deckKey(record.id)));
        if (setup && setup.id === record.id && (setup === savedSetup || validSetup(setup))) {
          const { id, players, deck, goal, powersEnabled } = setup;
          const progress = decode(progressRaw);
          match = { id, players, game: {
            powersEnabled, ...progress, deck, goal,
          } };
        }
      }
    } catch {
      publish(snapshot.match, 'unavailable');
      return false;
    }
    raw = stored;
    lastProgress = progressRaw;
    if (match && validProgress(match)) {
      const game = match.game;
      const previousTeam = (game.round - 2 + game.teams.length) % game.teams.length;
      const clearOrigin = !game.award && game.marks.origin && !getRound(game).originPoints;
      match = { ...match, game: {
        ...game, teams: game.teams.map(restoreTeam),
        ...(game.lastRound && !getLastRound(game) ? { lastRound: null } : {}),
        ...restoreTrackHistory(game),
        marks: clearOrigin ? { ...game.marks, origin: false } : game.marks,
        powerSkipped: game.powerSkipped ?? false,
        effectSource: game.effect ? (game.effectSource ?? previousTeam) : null,
        nextEffect: game.nextEffect ?? null,
      } };
      savedSetup = setup;
      recentMatches = readRecentMatches(setup?.recentMatches);
      publish(match);
    } else {
      savedSetup = null;
      recentMatches = [];
      publish(null, stored === null ? null : 'invalid');
    }
    return true;
  }

  function commit(expected, next) {
    // A suspended tab can wake up after another tab has already scored this round.
    const readable = refresh();
    if (snapshot.match !== expected) return false;
    if (expected && expected.id !== next.id) recentMatches = includePlayedMatch(recentMatches, expected);
    if (!readable) {
      publish(next, 'unavailable');
      return true;
    }
    const needsSetup = savedSetup?.id !== next.id;
    if (!needsSetup && next === expected && !snapshot.issue) return true;
    const { deck, goal, ...progress } = next.game;
    const encoded = JSON.stringify(progress);
    const pointer = needsSetup ? JSON.stringify({ version: 2, id: next.id }) : raw;
    const previousSetup = savedSetup;
    const setup = needsSetup ? { id: next.id, players: next.players, deck, goal,
      powersEnabled: progress.powersEnabled, recentMatches } : savedSetup;
    let wroteSetup = false;
    try {
      // Publish the pointer last. A failed migration leaves the original save readable.
      if (needsSetup) {
        storage().setItem(deckKey(next.id), JSON.stringify(setup));
        wroteSetup = true;
      }
      storage().setItem(progressKey(next.id), encoded);
      if (needsSetup) storage().setItem(saveKey, pointer);
    } catch {
      if (wroteSetup) {
        try {
          if (storage().getItem(saveKey) === raw) removeInactive(next.id);
        } catch { /* The active pointer still references the prior save. */ }
      }
      publish(next, 'unavailable');
      return true;
    }
    raw = pointer;
    lastProgress = encoded;
    savedSetup = setup;
    if (needsSetup && previousSetup) removeInactive(previousSetup.id);
    publish(next);
    return true;
  }

  function clearRecentTracks(expected) {
    if (!expected) {
      refresh();
      return expected === snapshot.match;
    }
    const next = hasPlayedTracks(recentMatches, expected)
      ? { ...expected, game: clearTrackHistory(expected.game) }
      : expected;
    return commit(expected, next);
  }

  refresh();
  return {
    commit, refresh, clearRecentTracks,
    hasRecentTracks: () => hasPlayedTracks(recentMatches, snapshot.match),
    createDeck: (originIds, expected = snapshot.match, random = Math.random) =>
      shuffleTracks(random, originIds, includePlayedMatch(recentMatches, expected)),
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
