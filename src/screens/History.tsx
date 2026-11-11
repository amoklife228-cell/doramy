import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { IosRow, IosSection } from '../components/IosList';
import { NavBar } from '../components/NavBar';
import { db } from '../lib/db';
import { goBack } from '../lib/router';
import { formatRuntime } from '../lib/types';
import { plural } from './Profile';

/** История просмотров по дням: сколько серий и времени, свежие сверху, сгруппировано по месяцам. */
export function History() {
  // undefined, пока база не ответила: так не мелькает «История пуста».
  const activity = useLiveQuery(() => db.activity.toArray(), []);
  const days = useMemo(
    () => (activity ?? []).filter((d) => d.units > 0).sort((a, b) => (a.day < b.day ? 1 : -1)),
    [activity],
  );
  const months = useMemo(() => {
    const map = new Map<string, typeof days>();
    for (const d of days) {
      const k = d.day.slice(0, 7);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(d);
    }
    return [...map.entries()];
  }, [days]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && goBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const totalUnits = days.reduce((a, d) => a + d.units, 0);
  const totalMinutes = days.reduce((a, d) => a + d.minutes, 0);

  return (
    <div className="detail" role="dialog" aria-modal="true">
      <NavBar backLabel="Профиль" />
      <div className="content detail-content ios-page">
        <h1 className="ios-large-title">История</h1>
        {activity === undefined ? null : days.length === 0 ? (
          <div className="empty">
            <div className="empty-title">История пуста</div>
            <div className="empty-text">Отмечайте просмотренные серии кнопкой «+» в карточке, и здесь появится журнал по дням.</div>
          </div>
        ) : (
          <>
            <IosSection>
              <IosRow label="Всего" value={`${totalUnits} ${plural(totalUnits, 'эпизод', 'эпизода', 'эпизодов')} · ${formatRuntime(totalMinutes) ?? '0 мин'}`} />
            </IosSection>
            {months.map(([month, list]) => (
              <IosSection key={month} title={formatMonth(month)}>
                {list.map((d) => (
                  <IosRow
                    key={d.day}
                    label={formatDay(d.day)}
                    value={`${d.units} эп. · ${formatRuntime(d.minutes) ?? '0 мин'}`}
                  />
                ))}
              </IosSection>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return s.replace(' г.', '');
}
