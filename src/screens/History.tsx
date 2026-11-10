import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { goBack } from '../lib/router';
import { formatRuntime } from '../lib/types';
import { plural } from './Profile';

/** История просмотров по дням: сколько серий и времени, свежие сверху. */
export function History() {
  const activity = useLiveQuery(() => db.activity.toArray(), []) ?? [];
  const days = useMemo(() => activity.filter((d) => d.units > 0).sort((a, b) => (a.day < b.day ? 1 : -1)), [activity]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && goBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const totalUnits = days.reduce((a, d) => a + d.units, 0);
  const totalMinutes = days.reduce((a, d) => a + d.minutes, 0);

  return (
    <div className="detail" role="dialog" aria-modal="true">
      <header className="detail-bar">
        <button className="back" onClick={goBack} aria-label="Назад">
          ‹ Назад
        </button>
        <span className="detail-kind">История просмотров</span>
      </header>
      <div className="content detail-content">
        {days.length === 0 ? (
          <div className="empty">
            <div className="empty-title">История пуста</div>
            <div className="empty-text">Отмечайте просмотренные серии кнопкой «+» в карточке, и здесь появится журнал по дням.</div>
          </div>
        ) : (
          <>
            <p className="muted">
              Всего: {totalUnits} {plural(totalUnits, 'эпизод', 'эпизода', 'эпизодов')}, {formatRuntime(totalMinutes) ?? '0 мин'}
            </p>
            <ul className="history">
              {days.map((d) => (
                <li key={d.day} className="history-row">
                  <span className="history-day">{formatDay(d.day)}</span>
                  <span className="history-val">
                    {d.units} {plural(d.units, 'эпизод', 'эпизода', 'эпизодов')}
                    <span className="muted"> · {formatRuntime(d.minutes) ?? '0 мин'}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}
