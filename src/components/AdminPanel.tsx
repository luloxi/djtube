import { useEffect, useState } from 'react';
import { isAccessStatus, isOwnerEmail, sortByLastSeen, type AccessAction, type AccessStatus } from '../lib/access';
import { signOutAndLeave } from '../lib/auth-client';

type Person = {
  email: string;
  name: string | null;
  avatar: string | null;
  status: AccessStatus;
  firstSeen: string;
  lastSeen: string;
  visitCount: number;
  owner: boolean;
};

const STATUS_LABEL: Record<AccessStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  revoked: 'Revocado',
  blocked: 'Bloqueado',
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function parsePeople(data: unknown): Person[] {
  if (!data || typeof data !== 'object') return [];
  const rows = (data as { people?: unknown }).people;
  if (!Array.isArray(rows)) return [];
  const people: Person[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    if (typeof item.email !== 'string') continue;
    people.push({
      email: item.email,
      name: typeof item.name === 'string' ? item.name : null,
      avatar: typeof item.avatar === 'string' ? item.avatar : null,
      status: isAccessStatus(item.status) ? item.status : 'pending',
      firstSeen: typeof item.firstSeen === 'string' ? item.firstSeen : '',
      lastSeen: typeof item.lastSeen === 'string' ? item.lastSeen : '',
      visitCount: typeof item.visitCount === 'number' ? item.visitCount : 0,
      owner: item.owner === true || isOwnerEmail(item.email),
    });
  }
  return sortByLastSeen(people);
}

export function AdminPanel({ onClose }: { onClose?: () => void } = {}) {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [note, setNote] = useState('Cargando…');
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancel = false;
    const timer = window.setTimeout(() => {
      const q = query.trim();
      fetch(`/api/admin/people?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
        .then(async (response) => {
          const data = (await response.json().catch(() => null)) as unknown;
          if (cancel) return;
          if (!response.ok) {
            setPeople([]);
            setNote('No pude leer la lista.');
            return;
          }
          const next = parsePeople(data);
          setPeople(next);
          setNote(next.length ? '' : q ? 'Nadie coincide.' : 'Nadie entró todavía.');
        })
        .catch(() => {
          if (!cancel) setNote('No pude leer la lista.');
        });
    }, 200);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [query, reload]);

  async function act(email: string, action: AccessAction) {
    setBusy(email);
    try {
      const response = await fetch('/api/admin/people', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, action }),
      });
      if (!response.ok) setNote('No pude guardar el cambio.');
      else setReload((n) => n + 1);
    } catch {
      setNote('No pude guardar el cambio.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className={onClose ? 'admin admin-sheet' : 'admin'} data-testid="admin-panel">
      <header className="top">
        <div>
          <h1>Accesos</h1>
        </div>
        <div className="top-actions">
          {onClose ? (
            <button type="button" className="icon-button" aria-label="Cerrar" title="Cerrar" onClick={onClose}>
              Cerrar
            </button>
          ) : (
            <a className="text-link" href="/">
              Mezclar
            </a>
          )}
          {onClose ? null : (
            <button type="button" onClick={() => void signOutAndLeave()}>
              Salir
            </button>
          )}
        </div>
      </header>
      <form className="stack admin-search" onSubmit={(event) => event.preventDefault()}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre o email"
          aria-label="Buscar por nombre o email"
        />
      </form>
      {note ? <p className="hint">{note}</p> : null}
      <div className="people">
        {people.map((person) => {
          const rowBusy = busy === person.email;
          return (
            <article key={person.email} className="person">
              {person.avatar ? (
                <img src={person.avatar} alt="" width={40} height={40} />
              ) : (
                <span className="avatar-fallback" aria-hidden="true">
                  {(person.name || person.email).slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="person-id">
                <p>{person.name || person.email}</p>
                <span>{person.email}</span>
                <span>
                  {STATUS_LABEL[person.status]}
                  {person.owner ? ' · dueño' : ''} · {person.visitCount === 1 ? '1 visita' : `${person.visitCount} visitas`}
                </span>
                <span>
                  Visto {formatWhen(person.lastSeen)} · desde {formatWhen(person.firstSeen)}
                </span>
              </div>
              <div className="person-actions">
                <button type="button" disabled={rowBusy || person.status === 'approved'} onClick={() => void act(person.email, 'approve')}>
                  Aprobar
                </button>
                <button
                  type="button"
                  disabled={rowBusy || person.owner || person.status !== 'approved'}
                  title={person.owner ? 'El dueño siempre entra' : undefined}
                  onClick={() => void act(person.email, 'revoke')}
                >
                  Revocar
                </button>
                <button
                  type="button"
                  disabled={rowBusy || person.owner || person.status === 'blocked'}
                  title={person.owner ? 'El dueño siempre entra' : undefined}
                  onClick={() => void act(person.email, 'block')}
                >
                  Bloquear
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
