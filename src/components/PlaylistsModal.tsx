import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { accountPlaylists } from '../lib/account-client';
import { PLAYLIST_NAME_MAX, type PlaylistSummary } from '../lib/account-data';
import { Icon } from './icons';

type Props = {
  onAdd: (items: Array<{ videoId: string; title: string }>) => void;
  onStatus: (message: string) => void;
  onClose: () => void;
};

type Mode = { kind: 'rename'; id: string; name: string } | { kind: 'delete'; id: string } | null;

export function PlaylistsModal({ onAdd, onStatus, onClose }: Props) {
  const [rows, setRows] = useState<PlaylistSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void accountPlaylists.list().then((result) => {
      if (!alive.current) return;
      if (result.ok) setRows(result.playlists);
      else setFailed(true);
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (mode) setMode(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      alive.current = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [mode, onClose]);

  async function add(row: PlaylistSummary) {
    setBusy(row.id);
    const result = await accountPlaylists.read(row.id);
    if (!alive.current) return;
    setBusy(null);
    if (!result.ok) {
      onStatus('No se pudo abrir la playlist');
      return;
    }
    onClose();
    onAdd(result.tracks);
  }

  async function rename(row: PlaylistSummary, name: string) {
    const clean = name.replace(/\s+/g, ' ').trim();
    if (!clean || clean === row.name) {
      setMode(null);
      return;
    }
    setBusy(row.id);
    const result = await accountPlaylists.rename(row.id, clean);
    if (!alive.current) return;
    setBusy(null);
    if (!result.ok) {
      onStatus('No se pudo renombrar');
      return;
    }
    setRows((current) => current?.map((item) => (item.id === row.id ? { ...item, name: clean } : item)) ?? current);
    setMode(null);
  }

  async function remove(row: PlaylistSummary) {
    setBusy(row.id);
    const result = await accountPlaylists.remove(row.id);
    if (!alive.current) return;
    setBusy(null);
    if (!result.ok && result.reason !== 'not_found') {
      onStatus('No se pudo borrar');
      return;
    }
    setRows((current) => current?.filter((item) => item.id !== row.id) ?? current);
    setMode(null);
  }

  return createPortal(
    <div className="sheet-overlay">
      <button type="button" className="sheet-backdrop" aria-label="Cerrar" onClick={onClose} />
      <div className="sheet pl-sheet" role="dialog" aria-modal="true" aria-label="Mis playlists" data-testid="my-playlists">
        <div className="sheet-head">
          <h2 className="pl-title">Mis playlists</h2>
          <button type="button" className="icon-button" aria-label="Cerrar" title="Cerrar" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {rows === null && !failed ? <div className="queue-loading" aria-busy="true" /> : null}
        {failed ? <p className="hint">No se pudieron cargar.</p> : null}
        {rows && rows.length === 0 ? <p className="hint" data-testid="my-playlists-empty">Sin playlists guardadas.</p> : null}
        <ul className="pl-saved">
          {rows?.map((row) => {
            const editing = mode?.kind === 'rename' && mode.id === row.id ? mode : null;
            const deleting = mode?.kind === 'delete' && mode.id === row.id;
            const working = busy === row.id;
            return (
              <li key={row.id} className="pl-saved-row" data-testid="saved-playlist">
                {editing ? (
                  <input
                    type="text"
                    className="pl-saved-input"
                    value={editing.name}
                    maxLength={PLAYLIST_NAME_MAX}
                    autoFocus
                    aria-label="Nombre de la playlist"
                    data-testid="saved-playlist-name"
                    onChange={(event) => setMode({ kind: 'rename', id: row.id, name: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void rename(row, editing.name);
                    }}
                  />
                ) : (
                  <span className="pl-saved-name">
                    <span className="pl-saved-title">{row.name}</span>
                    <span className="pl-saved-count">{row.count}</span>
                  </span>
                )}
                {editing ? (
                  <>
                    <button type="button" className="icon-button tone-play" aria-label="Guardar nombre" title="Guardar nombre" data-testid="saved-playlist-ok" disabled={working} onClick={() => void rename(row, editing.name)}>
                      <Icon name="check" size={20} />
                    </button>
                    <button type="button" className="icon-button" aria-label="Cancelar" title="Cancelar" onClick={() => setMode(null)}>
                      <Icon name="x" size={20} />
                    </button>
                  </>
                ) : deleting ? (
                  <>
                    <span className="pl-saved-ask">¿Borrar?</span>
                    <button type="button" className="icon-button tone-danger" aria-label="Borrar" title="Borrar" data-testid="saved-playlist-delete-yes" disabled={working} onClick={() => void remove(row)}>
                      <Icon name="check" size={20} />
                    </button>
                    <button type="button" className="icon-button" aria-label="Cancelar" title="Cancelar" data-testid="saved-playlist-delete-no" onClick={() => setMode(null)}>
                      <Icon name="x" size={20} />
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="icon-button tone-add" aria-label="Agregar a la cola" title="Agregar a la cola" data-testid="saved-playlist-add" disabled={working} onClick={() => void add(row)}>
                      <Icon name="plus" size={20} />
                    </button>
                    <button type="button" className="icon-button tone-speed" aria-label="Renombrar" title="Renombrar" data-testid="saved-playlist-rename" disabled={working} onClick={() => setMode({ kind: 'rename', id: row.id, name: row.name })}>
                      <Icon name="pencil" size={18} />
                    </button>
                    <button type="button" className="icon-button tone-danger" aria-label="Borrar" title="Borrar" data-testid="saved-playlist-delete" disabled={working} onClick={() => setMode({ kind: 'delete', id: row.id })}>
                      <Icon name="trash" size={18} />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
