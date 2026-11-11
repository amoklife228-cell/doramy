import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { NavBar } from '../components/NavBar';
import { Poster } from '../components/Poster';
import { db } from '../lib/db';
import { goBack, openDrama } from '../lib/router';
import { STATUS_BY_ID } from '../lib/types';

/** Все записи с заметками, свежие сверху. */
export function Notes() {
  // undefined, пока база не ответила: так не мелькает «Заметок пока нет».
  const items = useLiveQuery(() => db.items.toArray(), []);
  const withNotes = (items ?? []).filter((s) => s.notes.trim().length > 0).sort((a, b) => b.updatedAt - a.updatedAt);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && goBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="detail" role="dialog" aria-modal="true">
      <NavBar backLabel="Профиль" />
      <div className="content detail-content ios-page">
        <h1 className="ios-large-title">Заметки</h1>
        {items === undefined ? null : withNotes.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Заметок пока нет</div>
            <div className="empty-text">Откройте карточку сериала или фильма в библиотеке и напишите заметку в поле «Заметки».</div>
          </div>
        ) : (
          <ul className="rows">
            {withNotes.map((s) => (
              <li key={s.key} className="row">
                <button className="row-main" onClick={() => openDrama(s.mediaType, s.tmdbId)}>
                  <Poster path={s.posterPath} alt={s.title} size="w185" className="row-poster" />
                  <div className="row-body">
                    <div className="row-title">{s.title}</div>
                    <div className="row-sub">{STATUS_BY_ID.get(s.status)?.title}</div>
                    <p className="note-text">{s.notes}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
