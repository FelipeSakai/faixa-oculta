import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check,
  CircleHelp, Disc3, Headphones, Play, Plus, RotateCcw, Search, Shuffle,
  Timer, UserRound, UsersRound, X, Zap,
} from 'lucide-react';
import '@fontsource/archivo-black/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import { BlurReveal } from './BlurReveal.jsx';
import { Scoreboard } from './Scoreboard.jsx';
import { originPeople, personalOriginIds } from './catalog.js';
import { playlistPreferenceKey, previousPlaylistSelection, readPlaylistPreference, writePlaylistPreference } from './playlist-preference.js';
import { PlaylistPicker } from './PlaylistPicker.jsx';
import PowerPractice from './PowerPractice.jsx';
import { PowerUse } from './PowerPicker.jsx';
import { gameReducer, getLastRound, getRound, powers, startGame } from './game.js';
import { createMatchStore, progressKey, saveKey } from './saved-match.js';
import cover from './record-cover.jpg';
import './style.css';

const goalPresets = [15, 30, 50, 100];
const maxGoal = Number.MAX_SAFE_INTEGER - 6;
const peopleList = new Intl.ListFormat('pt-BR', { type: 'disjunction' });
const waveHeights = [12, 24, 16, 36, 45, 21, 30, 49, 26, 17, 37, 52, 31, 18, 38, 23, 44, 53, 26, 14, 30, 42, 26, 48, 34, 19, 31, 16, 23, 12];
const scoringDelay = 760;
const practiceHash = '#teste-poderes';
const easeOut = [0.22, 1, 0.36, 1];

function Screen({ children, id, direction }) {
  const reduced = useReducedMotion();

  return (
    <motion.main
      id="conteudo"
      tabIndex={-1}
      className={id}
      initial={reduced ? false : { opacity: 0, x: direction * 18 }}
      animate={{ opacity: 1, x: 0 }}
      variants={{ exit: travel => reduced ? { opacity: 1 } : { opacity: 0, x: travel * -12 } }}
      exit="exit"
      transition={{ duration: reduced ? 0 : 0.29, ease: easeOut }}
    >
      {children}
    </motion.main>
  );
}

function Brand({ home, onClick }) {
  return (
    <button className="brand" aria-label="Faixa Oculta, início" aria-current={home ? 'page' : undefined} onClick={onClick}>
      <span className="brand-icon"><Disc3 size={23} strokeWidth={1.85} /></span>
      <span>FAIXA <span className="brand-last">OCULTA</span></span>
    </button>
  );
}

function Rules({ dialogRef, deck }) {
  const choices = useMemo(() => {
    if (!deck) return '';
    const ids = personalOriginIds(deck.flatMap(track => track.origins));
    return peopleList.format(ids.map(id => originPeople[id]));
  }, [deck]);
  return (
    <dialog
      ref={dialogRef}
      className="rules-dialog"
      aria-labelledby="rules-title"
      onClick={event => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="rules-content">
        <div className="dialog-head">
          <h2 id="rules-title">Como jogar</h2>
          <button className="icon-button" aria-label="Fechar regras" onClick={() => dialogRef.current.close()} autoFocus><X size={21} /></button>
        </div>
        <ol className="rules-list">
          <li><strong>O DJ toca a faixa no Spotify.</strong><span>Só o DJ vê a faixa.</span></li>
          <li><strong>Palpite em voz alta.</strong><span>Diga o título. Se reconhecer uma playlist pessoal, você também pode dizer de quem é.{choices && ' Nesta partida, vale tentar ' + choices + '.'}</span></li>
          <li><strong>Revele e marque os pontos.</strong><span>O título vale 2 pontos. Acertar de quem é a playlist vale mais 1, mesmo se errar o título. Quem bate a meta vence.</span></li>
          <li><strong>Trocar faixa.</strong><span>Cada equipe tem uma troca grátis por partida. Depois de abrir a faixa, o botão usa a grátis primeiro. Você também pode gastar pulos ganhos ali, até em sequência.</span></li>
          <li><strong>Ganhe um poder surpresa.</strong><span>Marque o acerto do título em até 3 s e toque em Sortear poder. Leia o que a equipe ganhou e toque em Próxima rodada.</span></li>
          <li><strong>Escolha qual poder usar.</strong><span>Toque em Usar poder, escolha a equipe e o poder que ela vai gastar. Para atacar uma rival, use antes de abrir a pista. Cabe um ataque por rodada.</span></li>
          <li><strong>Poderes da sua equipe.</strong><span>Escolha entre Vale o dobro e Duas tentativas a cada rodada. Ative o dobro antes de abrir a faixa ou use Duas tentativas para fazer outro palpite.</span></li>
        </ol>
        <button className="button button-primary full-width" onClick={() => dialogRef.current.close()}>Entendi <ArrowRight size={20} /></button>
      </div>
    </dialog>
  );
}

function Home({ match, onResume, onStart, direction }) {
  const primaryAction = useRef(null);
  useEffect(() => {
    if (direction < 0) primaryAction.current?.focus({ preventScroll: true });
  }, [direction]);
  const game = match?.game;
  const finished = game?.phase === 'finished';
  const turn = game ? getRound(game).turn : 0;
  const soloScore = game?.teams[0].score;
  const progress = game && (finished ? 'Placar final' : 'Rodada ' + game.round) + ' · ' +
    (match.players.length === 1 ? soloScore + (soloScore === 1 ? ' ponto' : ' pontos') : finished ? match.players.length + ' equipes' : match.players[turn]);
  return (
    <Screen id="home" direction={direction}>
      <section className="hero shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <BlurReveal id="hero-title" className="hero-title" lines={['Qual é a', 'faixa?']} />
          <p>{progress || 'Ouça no Spotify e adivinhe a música.'}</p>
          <div className="home-actions">
            <button ref={primaryAction} className="button button-primary hero-cta" onClick={match ? onResume : onStart}>
              <Play size={19} fill="currentColor" />
              {match ? finished ? 'Ver resultado' : 'Continuar partida' : 'Jogar agora'}
              <ArrowRight className="cta-end" size={18} />
            </button>
            {match && <button className="back-button" onClick={onStart}>Nova partida</button>}
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <img src={cover} width="820" height="820" fetchPriority="high" alt="" />
          <span className="corner corner-top" />
          <span className="corner corner-bottom" />
          <span className="art-signal"><i /><i /><i /><i /></span>
        </div>
      </section>
    </Screen>
  );
}

function ScreenHeading({ title, children }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return <h1 className="screen-title" tabIndex={-1} ref={ref}>{title}{children}</h1>;
}

function Setup({ onBack, onStart, direction, preferredPlaylists, previousDeck, onApplyPlaylists, hasRecentTracks, onClearHistory }) {
  const [format, setFormat] = useState('solo');
  const [historyCleared, setHistoryCleared] = useState(false);
  const showCleared = historyCleared && !hasRecentTracks;
  const originIds = useMemo(() => preferredPlaylists ?? previousPlaylistSelection(previousDeck), [preferredPlaylists, previousDeck]);
  const [powersEnabled, setPowersEnabled] = useState(true);
  const [goal, setGoal] = useState(String(goalPresets[0]));
  const [teams, setTeams] = useState([{ id: 0, name: '' }, { id: 1, name: '' }]);
  const nextTeamId = useRef(2);
  const roster = useRef(null);
  const addTeamButton = useRef(null);
  const scrollToNewTeam = useRef(false);

  useEffect(() => {
    if (!scrollToNewTeam.current) return;
    scrollToNewTeam.current = false;
    const list = roster.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [teams.length]);

  function addTeam() {
    const id = nextTeamId.current++;
    scrollToNewTeam.current = true;
    setTeams(current => [...current, { id, name: '' }]);
  }

  function removeTeam(id) {
    addTeamButton.current?.focus({ preventScroll: true });
    setTeams(current => current.length > 2 ? current.filter(team => team.id !== id) : current);
  }

  function start(event) {
    event.preventDefault();
    const target = Number(goal);
    if (!Number.isSafeInteger(target) || target < 1 || target > maxGoal) return;
    const players = format === 'solo'
      ? ['Você']
      : teams.map(({ name }, index) => name.trim() || 'Equipe ' + (index + 1));
    onStart({ players, goal: target, powersEnabled, originIds });
  }

  return (
    <Screen id="setup" direction={direction}>
      <div className="shell stage-shell">
        <button className="back-button" onClick={onBack} aria-label="Início"><ArrowLeft size={18} /> <span>Início</span></button>
        <div className="setup-layout">
          <div className="setup-intro">
            <ScreenHeading title="Preparar partida" />
            <div className="playlist-controls">
              <PlaylistPicker selected={originIds} onApply={onApplyPlaylists} />
              <button type="button" className="clear-history" disabled={!hasRecentTracks} data-cleared={showCleared}
                title="Liberar as músicas já jogadas para o próximo sorteio"
                onClick={() => setHistoryCleared(onClearHistory())}>
                {showCleared ? <Check size={15} aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}
                {showCleared ? 'Histórico limpo' : 'Limpar histórico'}
              </button>
              <span className="sr-only" role="status">{showCleared && 'Histórico limpo. Todas as músicas selecionadas podem sair no próximo sorteio.'}</span>
            </div>
            <div className="setup-cover" aria-hidden="true"><img src={cover} alt="" /></div>
          </div>

          <form className="setup-form" onSubmit={start}>
            <fieldset>
              <legend>Formato</legend>
              <div className="format-picker">
                <label className="choice">
                  <input type="radio" name="formato" value="solo" checked={format === 'solo'} onChange={() => setFormat('solo')} />
                  <span><UserRound size={24} /><strong>Solo</strong></span>
                </label>
                <label className="choice">
                  <input type="radio" name="formato" value="equipes" checked={format === 'equipes'} onChange={() => setFormat('equipes')} />
                  <span><UsersRound size={24} /><strong>Equipes</strong></span>
                </label>
              </div>
            </fieldset>

            <div className="team-controls">
              <label className="powers-toggle" title="Acertos do título em até 3 segundos rendem poderes">
                <input type="checkbox" checked={powersEnabled} onChange={event => setPowersEnabled(event.target.checked)} />
                <span className="switch-track" aria-hidden="true" />
                <span>Poderes</span>
              </label>
              {format === 'equipes' && (
                <div className="team-add-group">
                  <span className="team-count" aria-hidden="true">{teams.length}</span>
                  <span className="sr-only" aria-live="polite">{teams.length} equipes</span>
                  <button ref={addTeamButton} type="button" className="team-add" aria-label="Adicionar equipe" onClick={addTeam}>
                    <Plus size={17} />
                    <span className="team-add-full">Adicionar equipe</span>
                    <span className="team-add-short">Equipe</span>
                  </button>
                </div>
              )}
            </div>
            <div className={'team-reveal' + (format === 'equipes' ? ' team-reveal-open' : '')}>
              <div>
                {format === 'equipes' && (
                  <div className="team-inputs" ref={roster}>
                    {teams.map((team, index) => {
                      const label = 'Equipe ' + (index + 1);
                      return (
                        <div className="team-field" key={team.id}>
                          <label className="sr-only" htmlFor={'team-' + team.id}>{label}</label>
                          <input
                            id={'team-' + team.id}
                            value={team.name}
                            onChange={event => {
                              const name = event.target.value;
                              setTeams(current => current.map(item => item.id === team.id ? { ...item, name } : item));
                            }}
                            placeholder={label}
                            maxLength={24}
                          />
                          {teams.length > 2 && (
                            <button
                              type="button"
                              className="team-remove"
                              aria-label={'Remover ' + (team.name.trim() || label)}
                              onClick={() => removeTeam(team.id)}
                            ><X size={16} /></button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <fieldset className="goal-field">
              <legend>Meta de pontos</legend>
              <div className="goal-picker">
                {goalPresets.map(value => (
                  <button
                    type="button"
                    className="goal-preset"
                    key={value}
                    aria-label={value + ' pontos'}
                    aria-pressed={Number(goal) === value}
                    onClick={() => setGoal(String(value))}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <label className="custom-goal">
                Pontos para vencer
                <input
                  type="number"
                  name="meta"
                  inputMode="numeric"
                  min={1}
                  max={maxGoal}
                  step={1}
                  required
                  value={goal}
                  onChange={event => setGoal(event.target.value)}
                />
              </label>
            </fieldset>
            <button className="button button-primary full-width" type="submit">Iniciar partida <ArrowRight size={20} /></button>
          </form>
        </div>
      </div>
    </Screen>
  );
}

function getTrackAction(track, effect) {
  if (effect === 'instrumental') {
    const query = new URLSearchParams({ search_query: track.title + ' ' + track.artist + ' instrumental karaoke' });
    return { url: 'https://www.youtube.com/results?' + query, label: 'Buscar instrumental', Icon: Search };
  }
  if (effect === 'readLyrics') {
    return { url: track.url, label: 'Consultar faixa', accessibleLabel: 'Consultar faixa no Spotify', Icon: BookOpen };
  }
  return { url: track.url, label: 'Abrir no Spotify', Icon: Play };
}

function TrackPlayer({ game, round, players, dispatch, practice = false }) {
  const trackLink = useRef(null);
  const revealButton = useRef(null);
  const retryButton = useRef(null);
  const track = game.deck[game.trackIndex];
  const { url, label: trackLabel, accessibleLabel, Icon: TrackIcon } = getTrackAction(track, game.effect);
  const { team, turn, canSwap, canRetry, remainingSkips } = round;
  const target = players[(turn + 1) % players.length];

  useLayoutEffect(() => {
    if (canRetry) {
      retryButton.current?.focus({ preventScroll: true });
    } else if (practice && !game.opened && (game.effect || game.retry || game.powerSkipped || game.doubled)) {
      trackLink.current?.focus({ preventScroll: true });
    }
  }, [canRetry, practice, game.opened, game.effect, game.retry, game.powerSkipped, game.doubled]);

  return (
    <section className="player" aria-label="Faixa da rodada">
      <div className="player-visual" aria-hidden="true">
        <div className="player-record"><span /></div>
        <div className="player-wave">
          {waveHeights.map((height, index) => (
            <i key={index} style={{ '--wave-height': height + 'px', '--wave-delay': index * -0.057 + 's' }} />
          ))}
        </div>
      </div>
      <div className="player-controls">
        <div className="bonus-options" role="group" aria-label="Ações da rodada">
          <button type="button" className="bonus-button swap-button" onClick={() => dispatch({ type: 'swap' })}
            disabled={!canSwap} aria-label="Trocar faixa" aria-describedby="saldo-pulos"
            title={round.lastTrack ? 'Última faixa da partida' : !canSwap && !team.swapUsed ? 'Abra a faixa para usar a troca grátis' : undefined}>
            <Shuffle size={16} aria-hidden="true" />
            Trocar faixa <span aria-hidden="true">{remainingSkips}</span>
            <span id="saldo-pulos" className="sr-only" role="status">{remainingSkips === 1 ? '1 pulo restante' : remainingSkips + ' pulos restantes'}</span>
          </button>
          {game.powersEnabled ? <PowerUse key={game.round} game={game} turn={turn} players={players} onUse={action => {
            dispatch(action);
            trackLink.current?.focus({ preventScroll: true });
          }} /> : <button type="button" className="bonus-button" onClick={() => dispatch({ type: 'enablePowers' })}>
            <Zap size={16} aria-hidden="true" /> Ativar poderes
          </button>}
        </div>
        {(game.effect || game.nextEffect || game.notice || game.retry || game.powerSkipped || game.doubled) && (
          <div className="round-notices" role="status">
            {game.effect && <div className="applied-power">
              <strong><Zap size={15} aria-hidden="true" />
                {Number.isInteger(game.effectSource) ? players[game.effectSource] + ' usou ' : ''}{powers[game.effect].name} em {players[turn]}
              </strong>
              <span>{powers[game.effect].effect}</span>
            </div>}
            {game.nextEffect && (
              <span>
                <Zap size={14} aria-hidden="true" />
                {powers[game.nextEffect].name} já está reservado para {target}.
              </span>
            )}
            {game.retry && <span><RotateCcw size={14} aria-hidden="true" /> {game.retry === 'ready' ? 'Duas tentativas ativas.' : 'Segundo palpite liberado.'}</span>}
            {game.doubled && <span><Zap size={14} aria-hidden="true" /> Pontos em dobro nesta rodada.</span>}
            {game.powerSkipped && <span><Shuffle size={14} aria-hidden="true" /> Música pulada. A vez continua com {players[turn]}.</span>}
            {game.notice && <span><Zap size={14} aria-hidden="true" /> {players.length === 1 ? 'Você ganhou' : players[game.notice.team] + ' ganhou'}: {powers[game.notice.power].name}</span>}
          </div>
        )}
        {practice ? (
          (game.effect || game.retry || game.powerSkipped || game.doubled || team.powers.skipTrack > 0) && <button ref={trackLink} className="button button-primary full-width" disabled={game.opened}
            onClick={() => dispatch({ type: 'openTrack' })}>
            {game.opened ? 'Pista simulada' : game.effect === 'readLyrics' ? 'Simular leitura' : game.effect === 'instrumental' ? 'Simular instrumental' : 'Simular faixa'}
            {game.opened ? <Check size={19} /> : <Play size={19} />}
          </button>
        ) : <a ref={trackLink} className="button button-primary full-width track-link" aria-label={accessibleLabel} href={url} target="_blank" rel="noopener noreferrer"
          onClick={() => dispatch({ type: 'openTrack' })}
          onAuxClick={event => { if (event.button === 1) dispatch({ type: 'openTrack' }); }}>
          <span><TrackIcon size={19} fill={TrackIcon === Play ? 'currentColor' : 'none'} /> {trackLabel}</span><ArrowUpRight size={20} />
        </a>}
        <div className="round-actions" data-retry={canRetry}>
          {canRetry && (
            <button ref={retryButton} className="bonus-button retry-action" onClick={() => {
              dispatch({ type: 'retry' });
              revealButton.current?.focus({ preventScroll: true });
            }}><RotateCcw size={15} aria-hidden="true" /> 2º palpite</button>
          )}
          {!practice && <button ref={revealButton} className="button button-neutral full-width" aria-label="Revelar resposta" onClick={() => dispatch({ type: 'reveal' })}>
            {canRetry ? 'Revelar' : 'Revelar resposta'} <ArrowRight size={19} />
          </button>}
        </div>
      </div>
    </section>
  );
}

function MarkChoice({ title, label = title, points, checked, disabled, onChange }) {
  return (
    <label className="mark-choice">
      <input type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
      <span className="mark-icon" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
      <span>{title}</span>
      <strong>+{points}</strong>
    </label>
  );
}

function RoundCorrection({ record, track, teamName, dispatch }) {
  const dialog = useRef(null);
  const [draft, setDraft] = useState({ title: record.title, origin: record.origin });
  // Dismiss a draft if another tab scores or corrects that round.
  useLayoutEffect(() => { dialog.current?.close(); }, [record.round, record.points]);

  return (
    <>
      <button type="button" className="correction-trigger" aria-haspopup="dialog"
        onClick={() => {
          setDraft({ title: record.title, origin: record.origin });
          dialog.current.showModal();
        }}>
        <RotateCcw size={14} aria-hidden="true" /> Corrigir última rodada
      </button>
      <dialog className="rules-dialog correction-dialog" ref={dialog} aria-labelledby="correction-title">
        <form onSubmit={event => {
          event.preventDefault();
          dialog.current.close();
          dispatch({ type: 'correctLastRound', round: record.round, ...draft });
        }}>
          <h2 id="correction-title">Corrigir rodada {record.round}</h2>
          <div className="correction-track">
            <span>{teamName}</span>
            <strong>{track.title}</strong>
            <span>{track.artist}</span>
          </div>
          <div className="score-options">
            <MarkChoice title="Música" label="Acertou a música" points={record.titlePoints} checked={draft.title}
              onChange={title => setDraft(current => ({ ...current, title }))} />
            {record.originPoints > 0 && (
              <MarkChoice title="Acertou de quem é?" points={record.originPoints} checked={draft.origin}
                onChange={origin => setDraft(current => ({ ...current, origin }))} />
            )}
          </div>
          {record.originPoints > 0 && <p className="correction-detail">Bônus de {peopleList.format(record.personalOrigins.map(id => originPeople[id]))}</p>}
          {record.power && <p className="correction-detail">Poder sorteado · <strong>{powers[record.power].name}</strong></p>}
          <div className="replace-actions">
            <button type="button" className="button button-neutral" onClick={() => dialog.current.close()}>Cancelar</button>
            <button type="submit" className="button button-primary">Salvar correção</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function RewardPanel({ award, players, headingRef, onContinue }) {
  const power = powers[award.power];
  return (
    <section className="round-panel power-award" aria-labelledby="reward-title">
      <p id="reward-team" className="choice-context">{players[award.team]} ganhou um poder</p>
      <h2 id="reward-title" ref={headingRef} tabIndex={-1} aria-describedby="reward-team reward-description">{power.name}</h2>
      <p id="reward-description" className="choice-context">{power.description}</p>
      <button type="button" className="button button-primary full-width" onClick={onContinue}>
        Próxima rodada <ArrowRight size={20} aria-hidden="true" />
      </button>
    </section>
  );
}

function Game({ match, dispatch, onBack, onSetup, direction }) {
  const { game, players } = match;
  const reduced = useReducedMotion();
  const roundHeading = useRef(null);
  const phaseHeading = useRef(null);
  const { round, deck, trackIndex, phase, marks, winner, award } = game;
  const track = deck[trackIndex];
  const roundOptions = getRound(game);
  const lastRound = getLastRound(game);
  const finishedRound = lastRound?.round ?? round;
  const { turn, titlePoints, originPoints, personalOrigins, endsAfterRound, canEarnPower } = roundOptions;
  const scores = game.teams.map(team => team.score);
  const awarding = phase === 'award';
  const points = awarding ? award.points : roundOptions.points;
  const rewardPower = awarding && award.power;

  // A match saved by the previous version can still have a reward pending.
  useEffect(() => {
    if (phase === 'choosePower') dispatch({ type: 'drawReward', draw: Math.random() });
  }, [phase, dispatch]);

  useEffect(() => {
    if (!awarding || rewardPower) return;
    const timer = window.setTimeout(() => dispatch({ type: 'advance' }), scoringDelay);
    return () => window.clearTimeout(timer);
  }, [awarding, rewardPower, dispatch]);

  useEffect(() => {
    if ((phase === 'award' && !rewardPower) || phase === 'choosePower') return;
    const heading = phase === 'listen' ? roundHeading.current : phaseHeading.current;
    heading?.focus({ preventScroll: true });
    if (phase === 'listen') window.scrollTo(0, 0);
    else heading?.scrollIntoView({ block: 'nearest' });
  }, [phase, round, rewardPower]);

  return (
    <Screen id="game" direction={direction}>
      <div className="shell stage-shell">
        <div className="game-header">
          <button className="round-back" onClick={onBack} aria-label="Voltar ao início" title="Voltar ao início"><ArrowLeft size={20} /></button>
          <h1 className="screen-title" ref={roundHeading} tabIndex={-1}>{phase === 'finished' ? 'Fim de jogo' : 'Rodada ' + round}</h1>
          {phase !== 'finished' && <span className="round-meta" aria-label={'Faixa ' + (trackIndex + 1) + ' de ' + deck.length}>{trackIndex + 1} / {deck.length}</span>}
        </div>
        <div className="game-layout">
          <Scoreboard players={players} scores={scores} active={phase === 'finished' ? null : turn} winner={winner} goal={game.goal}
            award={awarding || phase === 'choosePower' ? award : null}>
            {lastRound && phase !== 'choosePower' && (!awarding || rewardPower) && (
              <RoundCorrection record={lastRound} track={deck[lastRound.trackIndex]} teamName={players[lastRound.team]} dispatch={dispatch} />
            )}
          </Scoreboard>
          {phase === 'listen' && <TrackPlayer game={game} round={roundOptions} players={players} dispatch={dispatch} />}
          {phase === 'choosePower' && <p role="status">Sorteando o poder da equipe…</p>}
          {rewardPower && <RewardPanel award={award} players={players} headingRef={phaseHeading}
            onContinue={() => dispatch({ type: 'advance' })} />}
          {(phase === 'reveal' || (awarding && !award.power)) && (
            <section className="round-panel" aria-labelledby="answer-title">
              <div className="answer">
                <span className="answer-icon"><Headphones size={22} /></span>
                <div>
                  <h2 ref={phaseHeading} id="answer-title" tabIndex={-1}>{track.title}</h2>
                  <span className="answer-artist" title={track.artist}>{track.artist}</span>
                  {personalOrigins.length > 0 && (
                    <span className="answer-origin">
                      {personalOrigins.length === 1 ? 'Playlist de ' : 'Para o bônus, vale '}
                      {peopleList.format(personalOrigins.map(id => originPeople[id]))}
                    </span>
                  )}
                </div>
              </div>
              <div className="marks-heading">
                <strong>{game.doubled ? 'Acertos em dobro' : 'Acertos'}</strong>
                <span className="round-points" data-positive={points > 0} aria-live="polite">
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.span key={points} initial={reduced ? false : { opacity: 0, scale: .75, y: 5 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: reduced ? 0 : .2, ease: easeOut }}>
                      {points > 0 ? '+' : ''}{points} {points === 1 ? 'pt' : 'pts'}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </div>
              <div className="score-options">
                <MarkChoice title="Música" label="Acertou a música" points={titlePoints} checked={marks.title} disabled={awarding} onChange={checked => dispatch({ type: 'mark', mark: 'title', checked })} />
                {originPoints > 0 && (
                  <MarkChoice title="Acertou de quem é?" points={originPoints} checked={marks.origin} disabled={awarding} onChange={checked => dispatch({ type: 'mark', mark: 'origin', checked })} />
                )}
              </div>
              {canEarnPower && marks.title && (!endsAfterRound || awarding) && (
                <label className="mark-choice fast-guess">
                  <input type="checkbox" checked={marks.fast} disabled={awarding} aria-label="Acertou com até 3 segundos de áudio"
                    onChange={event => dispatch({ type: 'mark', mark: 'fast', checked: event.target.checked })} />
                  <span className="mark-icon" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
                  <span><Timer size={15} aria-hidden="true" /> Até 3 s de áudio</span>
                  <strong>{award?.power ? powers[award.power].name : 'Poder'}</strong>
                </label>
              )}
              <button className="button button-primary full-width" disabled={awarding} onClick={() => dispatch({
                type: 'score',
                draw: Math.random(),
                skipAnimation: reduced,
              })}>
                {awarding ? 'Pontos marcados' : endsAfterRound ? 'Ver resultado' : marks.fast ? 'Sortear poder' : 'Próxima rodada'}
                {awarding ? <Check size={20} /> : <ArrowRight size={20} />}
              </button>
            </section>
          )}
          {phase === 'finished' && (
            <section className="round-panel" aria-labelledby="result-title">
              <div className="win-mark"><Check size={32} /></div>
              <h2 ref={phaseHeading} id="result-title" tabIndex={-1}>{winner === null ? 'A seleção acabou' : players.length === 1 ? 'Você venceu!' : players[winner] + ' venceu!'}</h2>
              {winner === null ? (
                <p>{finishedRound} {finishedRound === 1 ? 'rodada jogada' : 'rodadas jogadas'}.</p>
              ) : (
                <p>{scores[winner]} {scores[winner] === 1 ? 'ponto' : 'pontos'} em {finishedRound} {finishedRound === 1 ? 'rodada' : 'rodadas'}.</p>
              )}
              <button className="button button-primary full-width" onClick={onSetup}>Preparar outra partida <ArrowRight size={20} /></button>
            </section>
          )}
        </div>
      </div>
    </Screen>
  );
}

function App() {
  const [store] = useState(() => createMatchStore());
  const [preferredPlaylists, setPreferredPlaylists] = useState(readPlaylistPreference);
  const { match, issue } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [page, setScreen] = useState(() => window.location.hash === practiceHash ? 'practice' : 'home');
  const [activeId, setActiveId] = useState(null);
  const screen = page === 'game' && (!match || activeId !== match.id) ? 'home' : page;
  // A points-only animation can be skipped on resume. An earned power needs acknowledgement.
  const homeMatch = screen === 'home' && match?.game.phase === 'award' && !match.game.award.power
    ? { ...match, game: gameReducer(match.game, { type: 'advance' }) }
    : match;
  const [direction, setDirection] = useState(1);
  const dialogRef = useRef(null);
  const replaceDialog = useRef(null);
  const pendingStart = useRef(null);

  useEffect(() => {
    const onStorage = event => {
      if (event.key === null || event.key === playlistPreferenceKey) setPreferredPlaylists(readPlaylistPreference());
      if (event.key === null || event.key === saveKey || event.key === progressKey(store.getSnapshot().match?.id)) store.refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', store.refresh);
    store.refresh();
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', store.refresh);
    };
  }, [store]);

  const navigate = useCallback((destination, motionDirection) => {
    if (destination !== 'practice' && window.location.hash === practiceHash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setDirection(motionDirection);
    setScreen(destination);
  }, []);

  useEffect(() => {
    const onHashChange = event => {
      if (window.location.hash === practiceHash) navigate('practice', 1);
      else if (new URL(event.oldURL).hash === practiceHash) navigate('home', -1);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [navigate]);

  const dispatch = useCallback(action => {
    if (!match) return;
    const game = gameReducer(match.game, action);
    if (game !== match.game) store.commit(match, { ...match, game });
  }, [store, match]);

  function resume(id) {
    setActiveId(id);
    navigate('game', 1);
  }

  function applyPlaylists(ids) {
    setPreferredPlaylists(ids);
    writePlaylistPreference(ids);
  }

  function resumeSaved() {
    if (store.commit(match, homeMatch)) resume(match.id);
  }

  function begin(settings, expected) {
    const id = globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36);
    const deck = store.createDeck(settings.originIds, expected);
    const next = { id, players: settings.players, game: startGame(settings, deck) };
    if (store.commit(expected, next)) resume(id);
    else navigate('home', -1);
  }

  function requestStart(settings) {
    if (!match || match.game.phase === 'finished') {
      begin(settings, match);
      return;
    }
    pendingStart.current = { settings, expected: match };
    replaceDialog.current.showModal();
  }

  return (
    <MotionConfig reducedMotion="user">
      <a className="skip-link" href="#conteudo" onClick={event => {
        event.preventDefault();
        document.getElementById('conteudo')?.focus();
      }}>Pular para o conteúdo</a>
      <header className="site-header">
        <div className="shell header-inner">
          <Brand home={screen === 'home'} onClick={() => {
            if (screen === 'home') window.scrollTo({ top: 0, behavior: 'auto' });
            else navigate('home', -1);
          }} />
          <button className="help-button" onClick={() => dialogRef.current?.showModal()}><CircleHelp size={18} /> Como jogar</button>
        </div>
      </header>
      {issue && <p className="shell save-warning" role="status">{issue === 'invalid'
        ? 'A partida salva não pôde ser lida. Você pode iniciar outra.'
        : 'Salvamento indisponível neste navegador. Mantenha a aba aberta para preservar a partida.'}</p>}
      <AnimatePresence mode="wait" custom={direction} onExitComplete={() => window.scrollTo(0, 0)}>
        {screen === 'home' && (
          <Home key="home" match={homeMatch} direction={direction} onResume={resumeSaved} onStart={() => navigate('setup', 1)} />
        )}
        {screen === 'setup' && (
          <Setup key="setup" direction={direction} onBack={() => navigate('home', -1)} onStart={requestStart}
            preferredPlaylists={preferredPlaylists} previousDeck={match?.game.deck} onApplyPlaylists={applyPlaylists}
            hasRecentTracks={store.hasRecentTracks()} onClearHistory={() => store.clearRecentTracks(match)} />
        )}
        {screen === 'game' && (
          <Game key={match.id} match={match} dispatch={dispatch} direction={direction} onBack={() => navigate('home', -1)} onSetup={() => navigate('setup', 1)} />
        )}
        {screen === 'practice' && (
          <PowerPractice key="practice" direction={direction} onExit={() => navigate('home', -1)}
            Screen={Screen} TrackPlayer={TrackPlayer} RewardPanel={RewardPanel} />
        )}
      </AnimatePresence>
      <Rules dialogRef={dialogRef} deck={screen === 'game' ? match.game.deck : null} />
      <dialog ref={replaceDialog} className="rules-dialog replace-dialog" aria-labelledby="replace-title"
        aria-describedby="replace-description" onClose={() => { pendingStart.current = null; }}>
        <h2 id="replace-title">Substituir partida?</h2>
        <p id="replace-description">Ao iniciar a nova partida, você perde o placar e a rodada da anterior.</p>
        <div className="replace-actions">
          <button className="button button-neutral" autoFocus onClick={() => replaceDialog.current.close()}>Cancelar</button>
          <button className="button button-primary" onClick={() => {
            const pending = pendingStart.current;
            replaceDialog.current.close();
            if (pending) begin(pending.settings, pending.expected);
          }}>Substituir e jogar</button>
        </div>
      </dialog>
    </MotionConfig>
  );
}

createRoot(document.getElementById('root')).render(<App />);
