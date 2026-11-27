import React, { useLayoutEffect, useReducer, useRef } from 'react';
import { ArrowLeft, RotateCcw, Timer } from 'lucide-react';
import { tracksForOrigins } from './catalog.js';
import { gameReducer, getRound, powers, startGame } from './game.js';

const players = ['Equipe 1', 'Equipe 2', 'Equipe 3', 'Equipe 4'];
const teamTwo = 1;
const teamFour = 3;

function practiceGame() {
  const deck = tracksForOrigins(['classicos-br']).slice(0, 9);
  return startGame({ players, goal: 15, powersEnabled: true }, deck);
}

function advanceToTeam(game, targetTeam) {
  const turns = (targetTeam - getRound(game).turn + players.length) % players.length;
  for (let i = 0; i < turns; i++) {
    game = gameReducer(game, { type: 'reveal' });
    game = gameReducer(game, { type: 'score', skipAnimation: true });
  }
  return game;
}

function startPractice() {
  const game = advanceToTeam(practiceGame(), teamTwo);
  const attacks = Object.keys(powers).filter(id => powers[id].opponent);
  const stocks = [[], ['skipTrack', 'doublePoints'], ['tenSeconds'], attacks];
  const teams = game.teams.map((team, index) => ({
    ...team,
    powers: { ...team.powers, ...Object.fromEntries(stocks[index].map(id => [id, 1])) },
  }));
  return { ...game, teams };
}

function practiceReward(draw) {
  const game = advanceToTeam(practiceGame(), teamFour);
  return [
    { type: 'openTrack' },
    { type: 'reveal' },
    { type: 'mark', mark: 'title', checked: true },
    { type: 'mark', mark: 'fast', checked: true },
    { type: 'score', draw },
  ].reduce(gameReducer, game);
}

function practiceReducer(game, action) {
  switch (action.type) {
    case 'restart':
      return startPractice();
    case 'practiceReward':
      return practiceReward(action.draw);
    case 'advance': {
      const next = gameReducer(game, action);
      if (!game.award?.power || next === game) return next;
      const turn = powers[game.award.power].opponent ? teamTwo : teamFour;
      // Skip quiet practice turns so the player can try the power they just saw.
      return { ...advanceToTeam(next, turn), notice: next.notice };
    }
    default:
      return gameReducer(game, action);
  }
}

function practiceHint(game, turn) {
  if (game.doubled) return game.opened ? 'Teste concluído. O título vale 4 pontos nesta rodada.' : 'Simule a faixa com os pontos em dobro.';
  if (game.retry === 'used') return 'Teste concluído. Os dois palpites valem na mesma rodada.';
  if (game.retry === 'ready') return game.opened ? 'Simule um erro e peça o segundo palpite.' : 'Simule a faixa para tentar o primeiro palpite.';
  if (game.effect) return game.opened ? 'Teste concluído. O ataque valeu nesta rodada.' : 'Simule a faixa com a regra indicada para o DJ.';
  if (game.powerSkipped) return game.opened ? 'Teste concluído. A equipe ouviu a nova faixa.' : 'Simule a nova faixa. A vez continua com a mesma equipe.';
  if (game.notice) return turn === teamFour ? 'Teste o poder sorteado na vez da Equipe 4.' : 'Use o poder sorteado da Equipe 4 contra a Equipe 2.';
  if (game.opened) return 'Use o poder da Equipe 2 para pular esta faixa.';
  return 'Em Usar poder, teste um poder da Equipe 2 ou um ataque da Equipe 4.';
}

export default function PowerPractice({ direction, onExit, Screen, TrackPlayer, RewardPanel }) {
  const [game, dispatch] = useReducer(practiceReducer, null, startPractice);
  const heading = useRef(null);
  const round = getRound(game);
  const awarding = game.phase === 'award' && Boolean(game.award?.power);
  const canRestart = game.round !== 2 || Boolean(game.effect || game.retry || game.powerSkipped || game.doubled || game.opened);

  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [game.phase, game.round]);

  return (
    <Screen id="practice" direction={direction}>
      <div className="shell stage-shell practice-shell">
        <nav className="practice-nav" aria-label="Controles do teste">
          <button type="button" className="back-button" onClick={onExit}>
            <ArrowLeft size={17} aria-hidden="true" /> Sair do teste
          </button>
          {!awarding && (canRestart ? (
            <button type="button" className="back-button" onClick={() => {
              dispatch({ type: 'restart' });
              heading.current?.focus({ preventScroll: true });
            }}><RotateCcw size={16} aria-hidden="true" /> Testar outro poder</button>
          ) : (
            <button type="button" className="back-button" onClick={() => dispatch({ type: 'practiceReward', draw: Math.random() })}>
              <Timer size={16} aria-hidden="true" /> Treinar acerto em 3 s
            </button>
          ))}
        </nav>
        {awarding ? <>
          <h1 className="sr-only">Treino de poderes</h1>
          <RewardPanel award={game.award} players={players} headingRef={heading} onContinue={() => dispatch({ type: 'advance' })} />
        </> : <>
          <div className="practice-heading">
            <h1 className="screen-title" ref={heading} tabIndex={-1} aria-describedby="practice-hint">
              Vez da {players[round.turn]}
            </h1>
            <p id="practice-hint" role="status">{practiceHint(game, round.turn)}</p>
          </div>
          <TrackPlayer game={game} round={round} players={players} dispatch={dispatch} practice={true} />
        </>}
      </div>
    </Screen>
  );
}
