import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { Trophy } from 'lucide-react';

const numberFormat = new Intl.NumberFormat('pt-BR');
const sparks = [[-28, -8], [-21, -22], [-8, -25], [10, -24], [23, -16], [28, 1]];

// A compact adaptation of React Bits' Count Up for scoring changes.
function ScoreNumber({ value }) {
  const reduced = useReducedMotion();
  const count = useMotionValue(value);
  const integer = useTransform(count, current => numberFormat.format(Math.round(current)));

  useEffect(() => {
    if (reduced) {
      count.jump(value);
      return;
    }
    const change = animate(count, value, { duration: 0.47, ease: [0.2, 0.78, 0.25, 1] });
    return () => change.stop();
  }, [count, reduced, value]);

  return (
    <span className="score-value">
      {reduced ? <span aria-hidden="true">{numberFormat.format(value)}</span> : <motion.span aria-hidden="true">{integer}</motion.span>}
      <span className="sr-only">{numberFormat.format(value)} {value === 1 ? 'ponto' : 'pontos'}</span>
    </span>
  );
}

function ScoreAward({ points }) {
  return (
    <span className="score-award" aria-hidden="true">
      +{points}
      {sparks.map(([x, y], index) => (
        <i key={index} style={{ '--spark-x': x + 'px', '--spark-y': y + 'px' }} />
      ))}
    </span>
  );
}

export function Scoreboard({ players, scores, active, winner, goal, award, children }) {
  const listRef = useRef(null);
  const many = players.length > 2;
  const highlighted = winner ?? active;
  const awardedTeam = award?.team;

  useLayoutEffect(() => {
    if (!many || highlighted === null) return;
    const list = listRef.current;
    const row = list.children[highlighted];

    function showTeam() {
      const left = row.offsetLeft - 2;
      const top = row.offsetTop - 24;
      const outOfViewHorizontally = left < list.scrollLeft || row.offsetLeft + row.offsetWidth > list.scrollLeft + list.clientWidth - 2;
      const outOfViewVertically = top < list.scrollTop || row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight - 5;
      if (outOfViewHorizontally) list.scrollLeft = left;
      if (outOfViewVertically) list.scrollTop = top;
    }
    showTeam();
    window.addEventListener('resize', showTeam);
    return () => window.removeEventListener('resize', showTeam);
  }, [awardedTeam, highlighted, many]);

  return (
    <aside className="scoreboard" aria-label="Placar">
      <div className="score-top">
        <h2><Trophy size={16} /> Placar</h2>
        {children}
        <span>Meta de {numberFormat.format(goal)} {goal === 1 ? 'pt' : 'pts'}</span>
      </div>
      <div
        className="score-rows"
        ref={listRef}
        data-solo={players.length === 1}
        data-many={many}
        tabIndex={many ? 0 : undefined}
        role={many ? 'region' : undefined}
        aria-label={many ? 'Pontuação por equipe' : undefined}
      >
        {players.map((name, index) => (
          <div className="score-row" data-team-color={index % 6} data-active={active === index} data-winner={winner === index} key={index}>
            <span className="score-identity"><i aria-hidden="true" /><strong title={name}>{name}</strong></span>
            {players.length > 1 && active === index && <span className="score-turn">Na vez</span>}
            {players.length > 1 && winner === index && <span className="score-turn">Venceu</span>}
            <ScoreNumber value={scores[index]} />
            {award?.team === index && <ScoreAward points={award.points} />}
          </div>
        ))}
      </div>
      <span className="sr-only" role="status">
        {active !== null && players.length > 1 ? 'Vez de ' + players[active] + '. ' : ''}
        {players.map((name, index) => name + ', ' + scores[index] + (scores[index] === 1 ? ' ponto' : ' pontos')).join('. ')}
      </span>
    </aside>
  );
}
