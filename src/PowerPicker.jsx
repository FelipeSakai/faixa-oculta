import React, { useRef, useState } from 'react';
import { Check, LockKeyhole, X, Zap } from 'lucide-react';
import { powerBlockReason, powers, usablePowerIds } from './game.js';

const menuPowerIds = Object.keys(powers).filter(id => id !== 'skipTrack');
const blockedDetails = {
  ownTurn: 'Só na vez da própria equipe.',
  opponentTurn: 'Só na vez de uma equipe rival.',
  alreadyAttacked: 'A equipe da vez já recebeu um ataque.',
  trackOpened: 'Use antes de o DJ abrir a faixa.',
  ownPowerUsed: 'A equipe já usou Vale o dobro ou Duas tentativas nesta rodada.',
  lastTrack: 'Esta é a última faixa da partida.',
};

function defaultOwner(owners, turn) {
  const ready = owners.filter(owner => owner.usable.length);
  if (ready.length === 1) return ready[0];
  if (ready.length > 1) return null;
  return owners.find(owner => owner.index === turn) ?? owners[0];
}

export function PowerUse({ game, turn, players, onUse }) {
  const dialog = useRef(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selected, setSelected] = useState(null);
  const owners = game.teams.map((team, index) => ({
    index,
    held: menuPowerIds.filter(id => team.powers[id] > 0),
    usable: usablePowerIds(game, index).filter(id => menuPowerIds.includes(id)),
  })).filter(owner => owner.held.length);
  const source = owners.find(owner => owner.index === selectedTeam) ?? defaultOwner(owners, turn);
  const choices = source?.usable ?? [];
  const power = choices.length === 1 ? choices[0] : selected;
  const canApply = choices.includes(power);
  const showApply = source ? choices.length > 0 : owners.length > 0;
  const inventory = source ? [...choices, ...source.held.filter(id => !choices.includes(id))] : [];

  function open() {
    setSelectedTeam(null);
    setSelected(null);
    dialog.current.showModal();
  }

  function apply() {
    if (!canApply) return;
    dialog.current.close();
    onUse({ type: 'usePower', sourceTeam: source.index, targetTeam: turn, power });
  }

  return (
    <div className="power-activation">
      <button type="button" className="bonus-button power-trigger" aria-haspopup="dialog" onClick={open}>
        <Zap size={16} aria-hidden="true" /> Usar poder
      </button>
      <dialog ref={dialog} className="rules-dialog power-use-dialog" aria-labelledby="usar-poder-title"
        aria-describedby={owners.length ? 'alvo-poder' : 'sem-poder'}>
        <div className="rules-content">
          <div className="dialog-head">
            <h2 id="usar-poder-title">Usar poder</h2>
            <button type="button" className="icon-button" aria-label="Cancelar uso do poder" onClick={() => dialog.current.close()}><X size={20} /></button>
          </div>
          {owners.length === 0 ? (
            <p className="power-empty" id="sem-poder">
              <strong>Nenhum poder para escolher.</strong>
              Acerte o título em até 3 s de áudio para ganhar um poder se a partida continuar.
            </p>
          ) : (
            <>
              <p className="power-target" id="alvo-poder">Alvo nesta rodada <strong data-team-color={turn % 6}>{players[turn]}</strong></p>
              <fieldset className="power-source">
                <legend>Quem usa o poder?</legend>
                <div className="source-teams" data-many={owners.length > 6}>
                  {owners.map(({ index, usable }) => (
                    <label className="source-team" key={index} data-team-color={index % 6}>
                      <input type="radio" name="equipe-do-poder" value={index} checked={source?.index === index}
                        aria-label={players[index]} aria-describedby={usable.length ? undefined : 'em-espera-' + index}
                        onChange={() => { setSelectedTeam(index); setSelected(null); }} />
                      <span className="source-mark" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
                      <span>{players[index]}{usable.length === 0 && <small id={'em-espera-' + index}>Em espera</small>}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {source && (
                <fieldset className="power-options">
                  <legend>{choices.length ? 'Qual poder usar?' : 'Poderes guardados'}</legend>
                  {inventory.map(id => {
                    const reason = powerBlockReason(game, source.index, id);
                    const Row = reason ? 'div' : 'label';
                    const quantity = game.teams[source.index].powers[id];
                    return (
                      <Row key={id} className="power-option" data-locked={Boolean(reason)}>
                        {reason ? <LockKeyhole size={15} aria-hidden="true" /> : (
                          <input type="radio" name="poder-guardado" value={id} checked={power === id}
                            aria-labelledby={`power-name-${id}`} aria-describedby={`power-detail-${id} power-stock-${id}`}
                            onChange={() => setSelected(id)} />
                        )}
                        <span>
                          <strong id={`power-name-${id}`}>{powers[id].name}</strong>
                          <small id={`power-detail-${id}`}>{reason ? blockedDetails[reason] : powers[id].description}</small>
                        </span>
                        <span className="power-stock" id={`power-stock-${id}`}>
                          <span aria-hidden="true">×{quantity}</span><span className="sr-only">{quantity} em estoque</span>
                        </span>
                      </Row>
                    );
                  })}
                </fieldset>
              )}
              {showApply && (
                <button type="button" className="button button-primary full-width" disabled={!canApply} onClick={apply}>
                  Aplicar poder <Check size={18} aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
