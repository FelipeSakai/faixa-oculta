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
    if (id === 'skipTrack') return lastTrack ? 'lastTrack' : null;
    if (game.retry || game.doubled) return 'ownPowerUsed';
    if (id === 'doublePoints' && game.opened) return 'trackOpened';
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
    unheardSkips: [],
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

function pointValues(track, doubled) {
  const titlePoints = doubled ? 4 : 2;
  const personalOrigins = personalOriginIds(track.origins);
  const originPoints = personalOrigins.length ? titlePoints / 2 : 0;
  return { titlePoints, personalOrigins, originPoints };
}

function swapPayment(game, team, allowFree) {
  if (game.phase !== 'listen' || game.trackIndex >= game.deck.length - 1) return null;
  if (allowFree && game.opened && !team.swapUsed) return 'free';
  return game.powersEnabled && team.powers?.skipTrack > 0 ? 'skipTrack' : null;
}

export function getRound(game) {
  const turn = (game.round - 1) % game.teams.length;
  const team = game.teams[turn];
  const lastTrack = game.trackIndex === game.deck.length - 1;
  const listening = game.phase === 'listen';
  const { titlePoints, personalOrigins, originPoints } = pointValues(game.deck[game.trackIndex], game.doubled);
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
    remainingSkips: (team.swapUsed ? 0 : 1) + (team.powers?.skipTrack ?? 0),
    canSwap: swapPayment(game, team, true) !== null,
    canRetry: listening && game.opened && game.retry === 'ready',
    canEarnPower: game.powersEnabled && game.effect !== 'readLyrics',
  };
}

function updateTeam(teams, turn, changes) {
  return teams.map((team, index) => index === turn ? { ...team, ...changes } : team);
}

function swapTrack(game, turn, allowFree) {
  const team = game.teams[turn];
  const payment = swapPayment(game, team, allowFree);
  if (!payment) return game;
  const paid = payment === 'skipTrack';
  const changes = paid ? { powers: { ...team.powers, skipTrack: team.powers.skipTrack - 1 } } : { swapUsed: true };
  return {
    ...game,
    trackIndex: game.trackIndex + 1,
    opened: false,
    retry: game.retry ? 'ready' : null,
    powerSkipped: paid || game.powerSkipped,
    unheardSkips: game.opened ? game.unheardSkips : [...(game.unheardSkips ?? []), game.trackIndex],
    notice: paid && game.notice?.team === turn && game.notice.power === 'skipTrack' ? null : game.notice,
    teams: updateTeam(game.teams, turn, changes),
  };
}

function recordRound(game, award) {
  return {
    round: game.round,
    trackIndex: game.trackIndex,
    doubled: game.doubled,
    title: game.marks.title,
    origin: game.marks.origin,
    fast: game.marks.fast,
    team: award.team,
    points: award.points,
    power: award.power,
  };
}

function validRecord(game, last) {
  if (!Number.isSafeInteger(last.round) || last.round < 1 || !Number.isSafeInteger(last.trackIndex) ||
      last.trackIndex < last.round - 1 || last.trackIndex >= game.deck.length ||
      last.team !== (last.round - 1) % game.teams.length ||
      ![last.doubled, last.title, last.origin, last.fast].every(value => typeof value === 'boolean') ||
      !(last.power === null || powerIds.includes(last.power))) return false;
  if (last.power && (!last.fast || !availablePowerIds(game).includes(last.power))) return false;
  // Old versions could credit an origin on a general playlist. Preserve that actual amount.
  const credited = ((last.title ? 2 : 0) + (last.origin ? 1 : 0)) * (last.doubled ? 2 : 1);
  if (last.points !== credited || last.points > game.teams[last.team].score) return false;

  const sameAward = game.award?.team === last.team && game.award.points === last.points &&
    game.award.power === last.power;
  if (last.round === game.round) {
    if (game.phase === 'finished') {
      const winner = game.teams[last.team].score >= game.goal ? last.team : null;
      if (game.winner !== winner || (winner === null && last.trackIndex !== game.deck.length - 1)) return false;
    }
    return (game.phase === 'award' || game.phase === 'finished') && sameAward && last.resumePhase === undefined &&
      last.trackIndex === game.trackIndex && last.doubled === game.doubled &&
      last.title === game.marks.title && last.origin === game.marks.origin && last.fast === game.marks.fast;
  }
  if (last.round !== game.round - 1 || last.trackIndex >= game.trackIndex) return false;
  if (game.phase === 'finished') {
    return sameAward && game.winner === last.team && game.teams[last.team].score >= game.goal &&
      (last.resumePhase === 'listen' || last.resumePhase === 'reveal');
  }
  return last.resumePhase === undefined && (game.phase === 'listen' || game.phase === 'reveal') && !game.award;
}

function lastRecord(game) {
  if (game.lastRound !== undefined) {
    return game.lastRound && validRecord(game, game.lastRound) ? game.lastRound : null;
  }
  // Older saves still have the complete result until the following turn starts.
  if ((game.phase === 'award' || game.phase === 'finished') && game.award) {
    const last = recordRound(game, game.award);
    return validRecord(game, last) ? last : null;
  }
  return null;
}

export function getLastRound(game) {
  const last = lastRecord(game);
  if (!last) return null;
  const values = pointValues(game.deck[last.trackIndex], last.doubled);
  return { ...last, ...values, origin: Boolean(values.originPoints && last.origin) };
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

function correctLastRound(game, action) {
  const last = getLastRound(game);
  const { round, title, origin } = action;
  if (!last || round !== last.round || typeof title !== 'boolean' || typeof origin !== 'boolean' ||
      (origin && !last.originPoints) || (title === last.title && origin === last.origin)) return game;

  const points = (title ? last.titlePoints : 0) + (origin ? last.originPoints : 0);
  const score = game.teams[last.team].score - last.points + points;
  const teams = updateTeam(game.teams, last.team, { score });
  const { resumePhase, ...previous } = game.lastRound ?? recordRound(game, game.award);
  const lastRound = { ...previous, title, origin, points };
  const award = { team: last.team, points, power: last.power };
  const winner = score >= game.goal ? last.team : null;
  const finished = winner !== null || last.trackIndex === game.deck.length - 1;

  if (game.round === round) {
    const corrected = { ...game, teams, lastRound, award, winner, marks: { ...game.marks, title, origin } };
    if (finished) return { ...corrected, phase: 'finished' };
    return game.phase === 'finished' ? advance(corrected) : corrected;
  }

  // Leave the following turn exactly where it was, including any stock already spent.
  // Only its phase is suspended while a corrected victory is on screen.
  if (finished) {
    return {
      ...game, teams, phase: 'finished', winner, award,
      lastRound: { ...lastRound, resumePhase: resumePhase ?? game.phase },
    };
  }
  if (resumePhase) return { ...game, teams, lastRound, phase: resumePhase, winner: null, award: null };
  return { ...game, teams, lastRound };
}

export function gameReducer(game, action) {
  const { turn, team, canRetry, canEarnPower, endsAfterRound, points, originPoints } = getRound(game);

  switch (action.type) {
    case 'correctLastRound':
      return correctLastRound(game, action);
    case 'enablePowers':
      return game.phase === 'listen' && !game.powersEnabled ? { ...game, powersEnabled: true } : game;
    case 'openTrack':
      return game.phase === 'listen' && !game.opened ? { ...game, opened: true } : game;
    case 'swap':
      return swapTrack(game, turn, true);
    case 'usePower': {
      const { sourceTeam, targetTeam, power } = action;
      if (targetTeam !== turn) return game;
      if (power === 'skipTrack') return sourceTeam === turn ? swapTrack(game, turn, false) : game;
      if (!usablePowerIds(game, sourceTeam).includes(power)) return game;
      const stock = game.teams[sourceTeam].powers;
      let changes;
      if (powers[power].opponent) changes = { effect: power, effectSource: sourceTeam };
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
      const award = { team: turn, points: pending ? game.award.points : points, power };
      const scored = {
        ...game,
        phase: 'award',
        teams: updateTeam(game.teams, turn, teamChanges),
        award,
        lastRound: recordRound(game, award),
      };
      if (power) return scored;
      return scored.award.points === 0 || action.skipAnimation ? advance(scored) : scored;
    }
    case 'advance':
      return game.phase === 'award' ? advance({ ...game, lastRound: lastRecord(game) }) : game;
    default:
      return game;
  }
}
