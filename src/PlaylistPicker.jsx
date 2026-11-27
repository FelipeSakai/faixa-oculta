import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, ListMusic, X } from 'lucide-react';
import { allOriginIds, originLabels, tracksForOrigins } from './catalog.js';

export function PlaylistPicker({ selected, onApply }) {
  const dialog = useRef(null);
  const [draft, setDraft] = useState(selected);
  const total = useMemo(() => tracksForOrigins(selected).length, [selected]);
  const draftTotal = useMemo(() => tracksForOrigins(draft).length, [draft]);

  function toggle(id) {
    setDraft(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  return (
    <>
      <button className="playlist-trigger" type="button" aria-haspopup="dialog" aria-controls="playlist-picker"
        aria-label={selected.length + (selected.length === 1 ? ' playlist' : ' playlists') + ' · ' + total + ' faixas'}
        onClick={() => { setDraft(selected); dialog.current.showModal(); }}>
        <ListMusic size={18} aria-hidden="true" />
        <span className="playlist-summary">
          <strong>{selected.length} {selected.length === 1 ? 'playlist' : 'playlists'}</strong>
          <span><span className="playlist-divider"> · </span>{total} faixas</span>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <dialog id="playlist-picker" ref={dialog} className="rules-dialog playlist-dialog" aria-labelledby="playlists-title">
        <div className="rules-content">
          <div className="dialog-head">
            <h2 id="playlists-title">Escolher playlists</h2>
            <button className="icon-button" type="button" aria-label="Cancelar seleção" onClick={() => dialog.current.close()}>
              <X size={20} />
            </button>
          </div>
          <fieldset className="playlist-options">
            <legend className="sr-only">Playlists da partida</legend>
            {allOriginIds.map(id => (
              <label key={id}>
                <input type="checkbox" checked={draft.includes(id)} onChange={() => toggle(id)} />
                <span>{originLabels[id]}</span>
              </label>
            ))}
          </fieldset>
          <p className="playlist-total" role="status">{draftTotal ? draftTotal + ' faixas no sorteio' : 'Escolha pelo menos uma playlist.'}</p>
          <button className="button button-primary full-width" type="button" disabled={!draftTotal}
            onClick={() => { onApply(draft); dialog.current.close(); }}>Aplicar seleção</button>
        </div>
      </dialog>
    </>
  );
}
