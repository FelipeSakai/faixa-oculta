import { personalOriginIds, shuffleTracks } from './catalog.js';

export const powers = {
  tenSeconds: {
    name: 'Só 10 segundos',
    opponent: true,
    effect: 'DJ, pause a faixa aos 10 s.',
    description: 'O DJ pausa a faixa aos 10 s.',
  },
  oneGuesser: {
    name: 'Só um responde',
    opponent: true,
    effect: 'Só a pessoa escolhida pode dar o palpite.',
    description: 'Escolha quem vai responder.',
  },
  readLyrics: {
    name: 'Só a letra',
    opponent: true,
    effect: 'DJ, leia um trecho em voz falada e deixe o título de fora.',
    description: 'O DJ lê a letra em voz alta.',
  },
  instrumental: {
    name: 'Sem vocal',
    opponent: true,
    effect: 'DJ, toque uma versão instrumental ou de karaokê.',
    description: 'O DJ toca só o instrumental.',
  },
  secondGuess: {
    name: 'Duas tentativas',
    opponent: false,
    description: 'Tente de novo antes de revelar.',
  },
  skipTrack: {
    name: 'Pular música',
    opponent: false,
    description: 'Passe para outra faixa na mesma rodada.',
  },
  doublePoints: {
    name: 'Vale o dobro',
    opponent: false,
    description: 'Antes de abrir a faixa, dobre os pontos da música e o bônus de playlist pessoal, quando houver.',
  },
};

const powerIds = Object.keys(powers);
const soloPowerIds = powerIds.filter(id => !powers[id].opponent);
const emptyMarks = { title: false, origin: false, fast: false };

export function availablePowerIds(game) {
  if (!game.powersEnabled) return [];
  return game.teams.length === 1 ? soloPowerIds : powerIds;
}

export function powerBlockReason(game, sourceTeam, id) {
  const { turn, lastTrack } = getRound(game);
  if (powers[id].opponent) {
    if (sourceTeam === turn) return 'opponentTurn';
    if (game.effect) return 'alreadyAttacked';
    if (game.opened) return 'trackOpened';
  } else {
    if (sourceTeam !== turn) return 'ownTurn';
    if (game.retry || game.powerSkipped || game.doubled) return 'ownPowerUsed';
    if (id === 'doublePoints' && game.opened) return 'trackOpened';
    if (id === 'skipTrack' && lastTrack) return 'lastTrack';
  }
  return null;
}

export function usablePowerIds(game, sourceTeam) {
  if (game.phase !== 'listen' || !game.powersEnabled || !Number.isInteger(sourceTeam) ||
      sourceTeam < 0 || sourceTeam >= game.teams.length) return [];
  const stock = game.teams[sourceTeam].powers;
  return powerIds.filter(id => stock[id] > 0 && !powerBlockReason(game, sourceTeam, id));
}

function drawPower(ids, draw) {
  if (ids.length === 1) return ids[0];
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) return null;
  return ids[Math.floor(draw * ids.length)] ?? null;
}

export function startGame({ players, goal, powersEnabled, originIds }, deck = shuffleTracks(Math.random, originIds)) {
  if (!deck.length) throw new RangeError('Selecione ao menos uma playlist com faixas.');
  return {
    goal,
    deck,
    powersEnabled: Boolean(powersEnabled),
    teams: players.map(() => ({
      score: 0,
      swapUsed: false,
      powers: Object.fromEntries(powerIds.map(id => [id, 0])),
    })),
    round: 1,
    trackIndex: 0,
    phase: 'listen',
    opened: false,
    doubled: false,
    marks: emptyMarks,
    effect: null,
    effectSource: null,
    nextEffect: null,
    retry: null,
    powerSkipped: false,
    award: null,
    notice: null,
    winner: null,
  };
}

export function getRound(game) {
  const turn = (game.round - 1) % game.teams.length;
  const team = game.teams[turn];
  const lastTrack = game.trackIndex === game.deck.length - 1;
  const listening = game.phase === 'listen';
  const titlePoints = game.doubled ? 4 : 2;
  const personalOrigins = personalOriginIds(game.deck[game.trackIndex].origins);
  const originPoints = personalOrigins.length ? titlePoints / 2 : 0;
  const points = (game.marks.title ? titlePoints : 0) + (game.marks.origin ? originPoints : 0);

  return {
    turn,
    team,
    lastTrack,
    titlePoints,
    personalOrigins,
    originPoints,
    points,
    endsAfterRound: team.score + points >= game.goal || lastTrack,
    canSwap: listening && !team.swapUsed && game.opened && !lastTrack,
    canRetry: listening && game.opened && game.retry === 'ready',
    canEarnPower: game.powersEnabled && game.effect !== 'readLyrics',
  };
}

function updateTeam(teams, turn, changes) {
  return teams.map((team, index) => index === turn ? { ...team, ...changes } : team);
}

function advance(game) {
  const { turn, team, lastTrack } = getRound(game);
  if (team.score >= game.goal || lastTrack) {
    return { ...game, phase: 'finished', winner: team.score >= game.goal ? turn : null };
  }

  return {
    ...game,
    phase: 'listen',
    round: game.round + 1,
    trackIndex: game.trackIndex + 1,
    opened: false,
    doubled: false,
    marks: emptyMarks,
    effect: game.nextEffect ?? null,
    effectSource: game.nextEffect ? turn : null,
    nextEffect: null,
    retry: null,
    powerSkipped: false,
    notice: game.award.power ? { team: turn, power: game.award.power } : null,
    award: null,
  };
}

export function gameReducer(game, action) {
  const { turn, team, canSwap, canRetry, canEarnPower, endsAfterRound, points, originPoints } = getRound(game);

  switch (action.type) {
    case 'enablePowers':
      return game.phase === 'listen' && !game.powersEnabled ? { ...game, powersEnabled: true } : game;
    case 'openTrack':
      return game.phase === 'listen' && !game.opened ? { ...game, opened: true } : game;
    case 'swap':
      if (!canSwap) return game;
      return {
        ...game,
        trackIndex: game.trackIndex + 1,
        opened: false,
        retry: game.retry ? 'ready' : null,
        teams: updateTeam(game.teams, turn, { swapUsed: true }),
      };
    case 'usePower': {
      const { sourceTeam, targetTeam, power } = action;
      if (targetTeam !== turn || !usablePowerIds(game, sourceTeam).includes(power)) return game;
      const stock = game.teams[sourceTeam].powers;
      let changes;
      if (powers[power].opponent) changes = { effect: power, effectSource: sourceTeam };
      else if (power === 'skipTrack') changes = { trackIndex: game.trackIndex + 1, opened: false, powerSkipped: true };
      else if (power === 'doublePoints') changes = { doubled: true };
      else changes = { retry: 'ready' };
      return {
        ...game,
        ...changes,
        notice: game.notice?.team === sourceTeam && game.notice.power === power ? null : game.notice,
        teams: updateTeam(game.teams, sourceTeam, { powers: { ...stock, [power]: stock[power] - 1 } }),
      };
    }
    case 'retry':
      return canRetry ? { ...game, retry: 'used' } : game;
    case 'reveal':
      return game.phase === 'listen' ? { ...game, phase: 'reveal' } : game;
    case 'mark': {
      const { mark, checked } = action;
      if (game.phase !== 'reveal') return game;
      if (mark === 'origin' && !originPoints) return game;
      if (mark === 'fast' && (!canEarnPower || !game.marks.title)) return game;
      return {
        ...game,
        marks: {
          ...game.marks,
          [mark]: checked,
          fast: mark === 'fast' ? checked : game.marks.fast && !(mark === 'title' && !checked),
        },
      };
    }
    case 'score':
    case 'drawReward': {
      // Old saves may already contain the points for a reward that still needs to be drawn.
      const pending = action.type === 'drawReward';
      if (game.phase !== (pending ? 'choosePower' : 'reveal')) return game;
      const earnsPower = pending || (canEarnPower && game.marks.title && game.marks.fast && !endsAfterRound);
      const power = earnsPower ? drawPower(availablePowerIds(game), action.draw) : null;
      if (earnsPower && !power) return game;
      const teamChanges = { score: pending ? team.score : team.score + points };
      if (power) teamChanges.powers = { ...team.powers, [power]: team.powers[power] + 1 };
      const scored = {
        ...game,
        phase: 'award',
        teams: updateTeam(game.teams, turn, teamChanges),
        award: { team: turn, points: pending ? game.award.points : points, power },
      };
      if (power) return scored;
      return scored.award.points === 0 || action.skipAnimation ? advance(scored) : scored;
    }
    case 'advance':
      return game.phase === 'award' ? advance(game) : game;
    default:
      return game;
  }
}
