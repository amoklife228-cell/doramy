import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Ambient } from '../components/Ambient';
import { ShareLink } from '../components/DetailExtras';
import { DramaGrid, EmptyState, NotConfigured } from '../components/DramaGrid';
import { NavBar } from '../components/NavBar';
import { Poster } from '../components/Poster';
import { PosterViewer } from '../components/PosterViewer';
import { Refreshable } from '../components/Refreshable';
import { db } from '../lib/db';
import { useConfigured } from '../lib/hooks';
import { useDesktop } from '../lib/media';
import { cachedPerson, fetchPerson, localizeCredits, type Person as PersonData, type PersonCredit } from '../lib/people';
import { goBack, openDrama } from '../lib/router';
import { remember } from '../lib/tmdb';
import { itemKey, STATUS_BY_ID, yearOf, type Drama } from '../lib/types';
import './Person.css';

type Kind = 'all' | 'tv' | 'movie';
const PAGE = 30;

/**
 * Страница актёра: фото, возраст, биография, самые известные работы и вся фильмография
 * с фильтром «Все / Сериалы / Фильмы». Открывается из «В ролях» и из поиска.
 */
export function Person({ id }: { id: number }) {
  const configured = useConfigured();
  const desktop = useDesktop();
  const root = useRef<HTMLDivElement>(null);

  const [person, setPerson] = useState<PersonData | null | undefined>(() => cachedPerson(id));
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [titles, setTitles] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    if (!configured) return;
    const controller = new AbortController();
    setError(null);
    fetchPerson(id, controller.signal)
      .then((p) => {
        setPerson(p);
        // Русские названия: сначала известные работы и свежие, остальное — как есть.
        const priority = [...topWorks(p.credits), ...sortCredits(p.credits.filter((c) => !c.isShow))];
        return localizeCredits(uniqueCredits(priority), controller.signal, 40).then(setTitles);
      })
      .catch((e: Error) => {
        if (e.name === 'AbortError') return;
        setError(e.message || 'Не удалось загрузить');
      });
    return () => controller.abort();
  }, [id, configured, reloadKey]);

  // Escape — один шаг назад: закрывает страницу или открытую с неё карточку. Под страницей и над ней
  // может лежать по карточке, у каждой свой обработчик на window, поэтому перехватываем раньше всех
  // (фаза захвата) и не пускаем дальше. Просмотр фото и шторки закрываются своими обработчиками.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !root.current?.isConnected) return;
      if (document.querySelector('.pv-root, .bs-root, .fs-backdrop')) return;
      e.stopImmediatePropagation();
      goBack();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Имя в шапке появляется, когда большое имя уехало вверх.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const scroller = root.current?.querySelector<HTMLElement>(':scope > .content');
    if (!scroller) return;
    const onScroll = () => setScrolled(scroller.scrollTop > (desktop ? 300 : 230));
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [desktop]);

  const library = useLiveQuery(() => db.items.toArray(), []);
  const marks = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of library ?? []) m.set(s.key, STATUS_BY_ID.get(s.status)?.title ?? 'В библиотеке');
    return m;
  }, [library]);

  const withTitles = useMemo(() => {
    if (!person) return [];
    return person.credits.map((c) => {
      const t = titles.get(itemKey(c.drama.mediaType, c.drama.id));
      return t && t !== c.drama.title ? { ...c, drama: { ...c.drama, title: t } } : c;
    });
  }, [person, titles]);

  // Для «Поделиться» и свечения на компьютере.
  const known = useMemo(() => topWorks(withTitles), [withTitles]);
  const glow = known.find((c) => c.drama.backdropPath)?.drama.backdropPath ?? null;

  return (
    <div
      ref={root}
      className="detail person-page"
      role="dialog"
      aria-modal="true"
      aria-label={person?.name ?? 'Актёр'}
    >
      {desktop && <Ambient path={glow} tint="#e5202e" />}
      <NavBar
        title={<span className="person-nav-title" data-show={scrolled}>{person?.name}</span>}
        right={
          person ? (
            <ShareLink
              title={person.name}
              text={`${person.name}${known[0] ? `, ${known[0].drama.title}` : ''}. Фильмография в «Дорамах»:`}
              path={`/person/${id}`}
            />
          ) : null
        }
      />
      <Refreshable
        className="detail-content ios-page person-content"
        onRefresh={() => {
          setReloadKey((n) => n + 1);
          return new Promise((r) => setTimeout(r, 600));
        }}
      >
        {!configured ? (
          <NotConfigured />
        ) : person ? (
          <PersonBody person={person} credits={withTitles} known={known} marks={marks} />
        ) : error ? (
          <EmptyState
            title="Не удалось загрузить"
            text={error}
            action={
              <button className="btn btn-primary" onClick={() => setReloadKey((n) => n + 1)}>
                Повторить
              </button>
            }
          />
        ) : (
          <PersonSkeleton />
        )}
      </Refreshable>
    </div>
  );
}

function PersonBody({
  person,
  credits,
  known,
  marks,
}: {
  person: PersonData;
  credits: PersonCredit[];
  known: PersonCredit[];
  marks: Map<string, string>;
}) {
  const [viewer, setViewer] = useState<string | null>(null);
  const roles = credits.filter((c) => !c.isShow);
  const tvCount = roles.filter((c) => c.drama.mediaType === 'tv').length;
  const movieCount = roles.length - tvCount;
  const rated = known.filter((c) => c.drama.voteAverage > 0 && c.drama.voteCount >= 20);
  const avg = rated.length ? rated.reduce((a, c) => a + c.drama.voteAverage, 0) / rated.length : 0;
  const photo = person.profilePath ? `https://image.tmdb.org/t/p/h632${person.profilePath}` : null;
  const life = lifeLine(person);
  const place = person.placeOfBirth ? translatePlace(person.placeOfBirth) : null;
  const photos = person.photos.filter((p) => p !== person.profilePath).slice(0, 12);

  return (
    <>
      <header className="person-hero">
        <button
          type="button"
          className="person-photo-btn"
          onClick={() => person.profilePath && setViewer(person.profilePath)}
          disabled={!person.profilePath}
          aria-label="Открыть фото"
        >
          {photo ? (
            <img className="person-photo" src={photo} alt={person.name} decoding="async" draggable={false} />
          ) : (
            <span className="person-photo person-photo-empty" aria-hidden="true">
              {initials(person.name)}
            </span>
          )}
        </button>
        <div className="person-head">
          <span className="person-role">{roleLabel(person)}</span>
          <h1 className="person-name">{person.name}</h1>
          {person.altNames.length > 0 && <p className="person-alt">{person.altNames.join(' · ')}</p>}
          {(life || place) && (
            <p className="person-meta">
              {life && <span>{life}</span>}
              {place && <span>{place}</span>}
            </p>
          )}
          {roles.length > 0 && (
            <dl className="person-stats">
              {tvCount > 0 && (
                <div className="person-stat">
                  <dt>{tvCount}</dt>
                  <dd>{plural(tvCount, 'сериал', 'сериала', 'сериалов')}</dd>
                </div>
              )}
              {movieCount > 0 && (
                <div className="person-stat">
                  <dt>{movieCount}</dt>
                  <dd>{plural(movieCount, 'фильм', 'фильма', 'фильмов')}</dd>
                </div>
              )}
              {avg > 0 && (
                <div className="person-stat">
                  <dt>
                    <span className="person-star">★</span> {avg.toFixed(1)}
                  </dt>
                  <dd>рейтинг работ</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </header>

      {person.biography && <Biography text={person.biography} english={person.biographyLang === 'en'} />}

      {known.length > 0 && (
        <section className="block person-block">
          <h2>Известность</h2>
          <div className="strip person-known">
            {known.map((c) => (
              <WorkTile key={itemKey(c.drama.mediaType, c.drama.id)} credit={c} mark={marks.get(itemKey(c.drama.mediaType, c.drama.id))} />
            ))}
          </div>
        </section>
      )}

      {photos.length > 0 && (
        <section className="block person-block">
          <h2>Фото</h2>
          <div className="strip person-photos">
            {photos.map((p) => (
              <button key={p} type="button" className="person-photos-item" onClick={() => setViewer(p)} aria-label="Открыть фото">
                <img src={`https://image.tmdb.org/t/p/w185${p}`} alt="" loading="lazy" decoding="async" draggable={false} />
              </button>
            ))}
          </div>
        </section>
      )}

      <Filmography credits={credits} marks={marks} />

      {viewer && <PosterViewer path={viewer} title={person.name} onClose={() => setViewer(null)} />}
    </>
  );
}

function Biography({ text, english }: { text: string; english: boolean }) {
  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const paragraphs = text.split(/\n\s*\n|\r\n\r\n/).map((p) => p.trim()).filter(Boolean);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const check = () => setOverflow(el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [text, open]);

  return (
    <section className="block person-block person-bio-block">
      <h2>Биография</h2>
      {english && <p className="person-bio-note">Биография на английском</p>}
      <div ref={ref} className="person-bio" data-open={open} lang={english ? 'en' : 'ru'}>
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {(overflow || open) && (
        <button type="button" className="person-more" onClick={() => setOpen(!open)}>
          {open ? 'Свернуть' : 'Ещё'}
        </button>
      )}
    </section>
  );
}

function WorkTile({ credit, mark }: { credit: PersonCredit; mark?: string }) {
  const d = credit.drama;
  return (
    <button
      className="strip-item"
      onClick={() => {
        remember([d]);
        openDrama(d.mediaType, d.id);
      }}
    >
      <span className="strip-poster-wrap">
        <Poster path={d.posterPath} alt={d.title} size="w342" className="strip-poster" />
        {d.voteAverage > 0 && <span className="badge">★ {d.voteAverage.toFixed(1)}</span>}
        {mark && <span className="card-mark">{mark}</span>}
      </span>
      <span className="strip-title">{d.title}</span>
      <span className="strip-year">{[yearOf(d.firstAirDate), d.mediaType === 'movie' ? 'Фильм' : 'Сериал'].filter(Boolean).join(' · ')}</span>
    </button>
  );
}

function Filmography({ credits, marks }: { credits: PersonCredit[]; marks: Map<string, string> }) {
  const [kind, setKind] = useState<Kind>('all');
  const [shows, setShows] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const showCount = credits.filter((c) => c.isShow).length;
  const pool = shows ? credits : credits.filter((c) => !c.isShow);
  const counts = {
    all: pool.length,
    tv: pool.filter((c) => c.drama.mediaType === 'tv').length,
    movie: pool.filter((c) => c.drama.mediaType === 'movie').length,
  };
  const list = sortCredits(kind === 'all' ? pool : pool.filter((c) => c.drama.mediaType === kind));
  const soon = list.filter((c) => c.upcoming);
  const released = list.filter((c) => !c.upcoming);
  const shown = released.slice(0, limit);

  // Заметка под карточкой — роль; без неё у сериала — число серий.
  const notes = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of credits) {
      const note = c.character || (c.episodeCount ? `${c.episodeCount} ${plural(c.episodeCount, 'серия', 'серии', 'серий')}` : '');
      if (note) m.set(itemKey(c.drama.mediaType, c.drama.id), note);
    }
    return m;
  }, [credits]);

  const toDramas = (l: PersonCredit[]): Drama[] => l.map((c) => c.drama);
  const tabs: { id: Kind; title: string }[] = [
    { id: 'all', title: 'Все' },
    { id: 'tv', title: 'Сериалы' },
    { id: 'movie', title: 'Фильмы' },
  ];

  if (credits.length === 0) return null;

  return (
    <section className="block person-block person-films">
      <div className="person-films-head">
        <h2>Фильмография</h2>
        {showCount > 0 && (
          <button
            type="button"
            className="chip person-shows"
            data-active={shows}
            aria-pressed={shows}
            onClick={() => {
              setShows(!shows);
              setLimit(PAGE);
            }}
          >
            Показать шоу <span className="chip-count">{showCount}</span>
          </button>
        )}
      </div>
      <div className="segmented segmented-wide person-kinds" role="tablist" aria-label="Тип">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={kind === t.id}
            data-active={kind === t.id}
            disabled={t.id !== 'all' && counts[t.id] === 0}
            onClick={() => {
              setKind(t.id);
              setLimit(PAGE);
            }}
          >
            {t.title}
            <span className="person-kind-count">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="muted small person-films-empty">Здесь пока пусто.</p>
      ) : (
        <>
          {soon.length > 0 && (
            <>
              <h3 className="person-year-head">Скоро</h3>
              <DramaGrid items={toDramas(soon)} loading={false} hasMore={false} onLoadMore={noop} notes={notes} marks={marks} />
            </>
          )}
          {released.length > 0 && (
            <>
              {soon.length > 0 && <h3 className="person-year-head">Вышло</h3>}
              <DramaGrid
                items={toDramas(shown)}
                loading={false}
                hasMore={shown.length < released.length}
                onLoadMore={() => setLimit((n) => n + PAGE)}
                notes={notes}
                marks={marks}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}

function PersonSkeleton() {
  return (
    <div className="person-skeleton" aria-busy="true">
      <header className="person-hero">
        <span className="person-photo-btn">
          <span className="person-photo skeleton" />
        </span>
        <div className="person-head">
          <div className="skeleton skeleton-line" style={{ width: 90, height: 14 }} />
          <div className="skeleton skeleton-line" style={{ width: 220, height: 30, marginTop: 10 }} />
          <div className="skeleton skeleton-line" style={{ width: 180, marginTop: 10 }} />
        </div>
      </header>
      <div className="block">
        <div className="skeleton skeleton-line" style={{ width: '100%' }} />
        <div className="skeleton skeleton-line" style={{ width: '92%' }} />
        <div className="skeleton skeleton-line" style={{ width: '70%' }} />
      </div>
    </div>
  );
}

/* ---------- вспомогательное ---------- */

function noop() {}

/** Самые известные: 10 работ с наибольшим числом оценок, без шоу и без постера — в конец. */
function topWorks(credits: PersonCredit[]): PersonCredit[] {
  return credits
    .filter((c) => !c.isShow && c.drama.voteCount > 0 && c.drama.posterPath)
    .slice()
    .sort((a, b) => b.drama.voteCount - a.drama.voteCount)
    .slice(0, 10);
}

/** Сначала «Скоро» (без даты — в самом начале), дальше от новых к старым. */
function sortCredits(credits: PersonCredit[]): PersonCredit[] {
  return credits.slice().sort((a, b) => {
    if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1;
    const da = a.drama.firstAirDate ?? '';
    const dbb = b.drama.firstAirDate ?? '';
    if (a.upcoming) {
      if (!da || !dbb) return da ? 1 : dbb ? -1 : 0;
      return da.localeCompare(dbb);
    }
    return dbb.localeCompare(da) || b.drama.voteCount - a.drama.voteCount;
  });
}

function uniqueCredits(list: PersonCredit[]): PersonCredit[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const k = itemKey(c.drama.mediaType, c.drama.id);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const DEPARTMENTS: Record<string, [string, string]> = {
  Directing: ['Режиссёр', 'Режиссёр'],
  Writing: ['Сценарист', 'Сценаристка'],
  Production: ['Продюсер', 'Продюсер'],
  Sound: ['Композитор', 'Композитор'],
  Camera: ['Оператор', 'Оператор'],
};

function roleLabel(p: PersonData): string {
  const female = p.gender === 1;
  if (p.department && p.department !== 'Acting' && DEPARTMENTS[p.department]) {
    return DEPARTMENTS[p.department][female ? 1 : 0];
  }
  return female ? 'Актриса' : 'Актёр';
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function parseDate(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function formatDate(s: string): string | null {
  const p = parseDate(s);
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : null;
}

function yearsBetween(from: string, to: Date): number | null {
  const a = parseDate(from);
  if (!a) return null;
  let age = to.getFullYear() - a.y;
  if (to.getMonth() + 1 < a.m || (to.getMonth() + 1 === a.m && to.getDate() < a.d)) age--;
  return age >= 0 && age < 130 ? age : null;
}

/** «32 года, 16 мая 1993» или «2 марта 1975 – 27 декабря 2023, 48 лет». */
function lifeLine(p: PersonData): string | null {
  if (!p.birthday) return null;
  const born = formatDate(p.birthday);
  if (!born) return null;
  if (p.deathday) {
    const died = formatDate(p.deathday);
    const d = parseDate(p.deathday);
    const age = d ? yearsBetween(p.birthday, new Date(d.y, d.m - 1, d.d)) : null;
    return `${born} – ${died ?? p.deathday}${age !== null ? `, ${age} ${plural(age, 'год', 'года', 'лет')}` : ''}`;
  }
  const age = yearsBetween(p.birthday, new Date());
  return age !== null ? `${age} ${plural(age, 'год', 'года', 'лет')}, ${born}` : born;
}

/** Место рождения TMDB даёт по-английски («Seoul, South Korea»): переводим привычные названия. */
const PLACES: Record<string, string> = {
  'South Korea': 'Южная Корея',
  'Republic of Korea': 'Южная Корея',
  Korea: 'Корея',
  'North Korea': 'КНДР',
  Japan: 'Япония',
  China: 'Китай',
  "People's Republic of China": 'Китай',
  Taiwan: 'Тайвань',
  Thailand: 'Таиланд',
  'Hong Kong': 'Гонконг',
  'British Hong Kong': 'Гонконг',
  Macau: 'Макао',
  Philippines: 'Филиппины',
  Vietnam: 'Вьетнам',
  Malaysia: 'Малайзия',
  Singapore: 'Сингапур',
  Indonesia: 'Индонезия',
  USA: 'США',
  'United States': 'США',
  'United States of America': 'США',
  US: 'США',
  UK: 'Великобритания',
  'United Kingdom': 'Великобритания',
  England: 'Англия',
  Canada: 'Канада',
  Australia: 'Австралия',
  'New Zealand': 'Новая Зеландия',
  France: 'Франция',
  Germany: 'Германия',
  Russia: 'Россия',
  Seoul: 'Сеул',
  Busan: 'Пусан',
  Pusan: 'Пусан',
  Incheon: 'Инчхон',
  Daegu: 'Тэгу',
  Daejeon: 'Тэджон',
  Gwangju: 'Кванджу',
  Ulsan: 'Ульсан',
  Suwon: 'Сувон',
  Jeju: 'Чеджу',
  'Jeju Island': 'остров Чеджу',
  'Jeju-do': 'Чеджу',
  'Gyeonggi-do': 'Кёнгидо',
  'Gyeonggi Province': 'Кёнгидо',
  'Gangwon-do': 'Канвондо',
  'Gangwon Province': 'Канвондо',
  'North Chungcheong': 'Чхунчхон-Пукто',
  'South Chungcheong': 'Чхунчхон-Намдо',
  'North Gyeongsang': 'Кёнсан-Пукто',
  'South Gyeongsang': 'Кёнсан-Намдо',
  'North Jeolla': 'Чолла-Пукто',
  'South Jeolla': 'Чолла-Намдо',
  Tokyo: 'Токио',
  Osaka: 'Осака',
  Kyoto: 'Киото',
  Yokohama: 'Иокогама',
  Nagoya: 'Нагоя',
  Sapporo: 'Саппоро',
  Fukuoka: 'Фукуока',
  Kobe: 'Кобе',
  Hokkaido: 'Хоккайдо',
  Okinawa: 'Окинава',
  Beijing: 'Пекин',
  Shanghai: 'Шанхай',
  Guangzhou: 'Гуанчжоу',
  Shenzhen: 'Шэньчжэнь',
  Chengdu: 'Чэнду',
  Chongqing: 'Чунцин',
  Hangzhou: 'Ханчжоу',
  Wuhan: 'Ухань',
  "Xi'an": 'Сиань',
  Nanjing: 'Нанкин',
  Tianjin: 'Тяньцзинь',
  Taipei: 'Тайбэй',
  Kaohsiung: 'Гаосюн',
  Bangkok: 'Бангкок',
  'Chiang Mai': 'Чиангмай',
  'Los Angeles': 'Лос-Анджелес',
  'New York': 'Нью-Йорк',
  London: 'Лондон',
  Paris: 'Париж',
};

function translatePlace(place: string): string {
  return place
    .split(',')
    .map((part) => {
      const t = part.trim();
      return PLACES[t] ?? PLACES[t.replace(/ (City|Metropolitan City|Special City)$/i, '')] ?? t;
    })
    .filter(Boolean)
    .join(', ');
}
