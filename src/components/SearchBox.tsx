import { useEffect, useId, useRef, useState } from 'react';
import { type PersonHit, searchPeople } from '../lib/people';
import { openDrama, openPerson } from '../lib/router';
import { clearRecent, loadRecent, removeRecent, saveRecent, suggest, type Suggestion } from '../lib/searchSuggest';
import { posterUrl, profileUrl, remember } from '../lib/tmdb';
import { countryLabel, itemKey, WORLD, yearOf } from '../lib/types';
import './SearchBox.css';

const DEBOUNCE = 250;

/**
 * Поле поиска каталога с подсказками: при вводе (от 2 букв) — до 6 сериалов и фильмов и актёры,
 * в пустом поле — недавние запросы. Enter или «Найти» показывают полную сетку результатов, как раньше.
 * Подсказки закрываются по Escape, при уходе фокуса и при прокрутке результатов.
 */
export function SearchBox({
  value,
  onChange,
  placeholder,
  country,
  enabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** Фильтр страны каталога: '' — Азия, WORLD — весь мир. */
  country: string;
  enabled: boolean;
}) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [items, setItems] = useState<{ query: string; list: Suggestion[] } | null>(null);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = value.trim();
  const typing = q.length >= 2;

  // Подсказки с задержкой: не на каждую букву. Старые остаются на экране, пока идут новые.
  useEffect(() => {
    if (!enabled || !typing || !focused) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      suggest(q, country, controller.signal)
        .then((list) => setItems({ query: q, list }))
        .catch(() => undefined);
    }, DEBOUNCE);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, country, enabled, typing, focused]);

  useEffect(() => setActive(-1), [q, focused]);

  const suggestions = typing && items ? items.list : [];
  const mode: 'suggest' | 'recent' | null =
    !focused || dismissed ? null : typing ? (suggestions.length ? 'suggest' : null) : q === '' && recent.length ? 'recent' : null;
  const rowCount = mode === 'suggest' ? suggestions.length + 1 : mode === 'recent' ? recent.length : 0;

  // Прокрутка результатов пальцем или колесом прячет подсказки (и клавиатуру).
  useEffect(() => {
    if (!mode) return;
    const scroller = root.current?.closest('.screen')?.querySelector<HTMLElement>('.content');
    if (!scroller) return;
    const hide = () => {
      setDismissed(true);
      input.current?.blur();
    };
    scroller.addEventListener('touchmove', hide, { passive: true });
    scroller.addEventListener('wheel', hide, { passive: true });
    return () => {
      scroller.removeEventListener('touchmove', hide);
      scroller.removeEventListener('wheel', hide);
    };
  }, [mode]);

  const close = (blur = true) => {
    setDismissed(true);
    if (blur) input.current?.blur();
  };

  const submit = () => {
    if (q.length >= 2) setRecent(saveRecent(q));
    close();
  };

  const pick = (s: Suggestion) => {
    setRecent(saveRecent(q));
    close();
    if (s.kind === 'drama') {
      remember([s.drama]);
      openDrama(s.drama.mediaType, s.drama.id);
    } else {
      openPerson(s.person.id);
    }
  };

  const pickRecent = (r: string) => {
    onChange(r);
    setRecent(saveRecent(r));
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!rowCount) return;
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      // -1 — ни одна строка не выбрана (курсор в поле); по кругу через него.
      setActive((i) => {
        const next = i + dir;
        return next >= rowCount ? -1 : next < -1 ? rowCount - 1 : next;
      });
      return;
    }
    if (e.key === 'Escape') {
      if (mode) {
        e.preventDefault();
        e.stopPropagation();
        setDismissed(true);
      } else {
        input.current?.blur();
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (mode === 'suggest' && active >= 0 && active < suggestions.length) pick(suggestions[active]);
      else if (mode === 'recent' && active >= 0) pickRecent(recent[active]);
      else submit();
    }
  };

  const optionId = (i: number) => `${listId}-o${i}`;

  return (
    <div className="searchbox searchbox-icon sbx" ref={root} data-open={mode !== null}>
      <svg className="search-icon" viewBox="0 0 24 24" aria-hidden>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" />
      </svg>
      <input
        ref={input}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setDismissed(false);
        }}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setFocused(true);
          setDismissed(false);
          setRecent(loadRecent());
        }}
        onBlur={() => {
          // Нажатие на подсказку не отнимает фокус (mousedown отменён), но на всякий случай — с паузой.
          blurTimer.current = setTimeout(() => setFocused(false), 120);
        }}
        onKeyDown={onKeyDown}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={mode !== null}
        aria-controls={listId}
        aria-activedescendant={mode && active >= 0 ? optionId(active) : undefined}
      />
      {value && (
        <button className="searchbox-clear" onClick={() => onChange('')} aria-label="Очистить">
          ✕
        </button>
      )}

      {mode && (
        <div className="sbx-pop" onMouseDown={(e) => e.preventDefault()}>
          {mode === 'recent' && (
            <div className="sbx-head">
              <span>Недавние запросы</span>
              <button type="button" className="sbx-clear-all" onClick={() => setRecent(clearRecent())} aria-label="Очистить историю поиска">
                Очистить
              </button>
            </div>
          )}
          <ul className="sbx-list" id={listId} role="listbox" aria-label={mode === 'recent' ? 'Недавние запросы' : 'Подсказки'}>
            {mode === 'recent'
              ? recent.map((r, i) => (
                  <li key={r} id={optionId(i)} role="option" aria-selected={active === i} className="sbx-row sbx-recent" data-active={active === i}>
                    <button type="button" className="sbx-main" onClick={() => pickRecent(r)}>
                      <ClockIcon />
                      <span className="sbx-recent-text">{r}</span>
                    </button>
                    <button
                      type="button"
                      className="sbx-remove"
                      onClick={() => setRecent(removeRecent(r))}
                      aria-label={`Удалить «${r}» из истории`}
                    >
                      ✕
                    </button>
                  </li>
                ))
              : suggestions.map((s, i) => (
                  <li
                    key={s.kind === 'drama' ? itemKey(s.drama.mediaType, s.drama.id) : `p:${s.person.id}`}
                    id={optionId(i)}
                    role="option"
                    aria-selected={active === i}
                    className="sbx-row"
                    data-active={active === i}
                    onMouseEnter={() => setActive(i)}
                  >
                    <button type="button" className="sbx-main" onClick={() => pick(s)}>
                      {s.kind === 'drama' ? <DramaRow s={s} /> : <PersonRow p={s.person} />}
                    </button>
                  </li>
                ))}
            {mode === 'suggest' && (
              <li
                id={optionId(suggestions.length)}
                role="option"
                aria-selected={active === suggestions.length}
                className="sbx-row sbx-all"
                data-active={active === suggestions.length}
                onMouseEnter={() => setActive(suggestions.length)}
              >
                <button type="button" className="sbx-main" onClick={submit}>
                  <span className="sbx-all-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <circle cx="11" cy="11" r="6.5" />
                      <path d="M16 16l4.5 4.5" />
                    </svg>
                  </span>
                  <span className="sbx-all-text">
                    Все результаты по запросу «{q}»
                  </span>
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function DramaRow({ s }: { s: Extract<Suggestion, { kind: 'drama' }> }) {
  const d = s.drama;
  const src = posterUrl(d.posterPath, 'w185');
  const meta = [yearOf(d.firstAirDate), countryLabel(d.originCountries)].filter(Boolean).join(' · ');
  return (
    <>
      <span className="sbx-thumb">{src && <img src={src} alt="" loading="lazy" decoding="async" draggable={false} />}</span>
      <span className="sbx-text">
        <span className="sbx-title">{d.title}</span>
        <span className="sbx-sub">
          {meta && <span>{meta}</span>}
          <span className="sbx-type">{d.mediaType === 'movie' ? 'Фильм' : 'Сериал'}</span>
        </span>
      </span>
      {d.voteAverage > 0 && <span className="sbx-rating">★ {d.voteAverage.toFixed(1)}</span>}
    </>
  );
}

function PersonRow({ p }: { p: PersonHit }) {
  const src = profileUrl(p.profilePath);
  return (
    <>
      <span className="sbx-thumb sbx-face">{src && <img src={src} alt="" loading="lazy" decoding="async" draggable={false} />}</span>
      <span className="sbx-text">
        <span className="sbx-title">{p.name}</span>
        <span className="sbx-sub">
          <span className="sbx-type">{p.gender === 1 ? 'Актриса' : 'Актёр'}</span>
          {p.knownFor && <span>{p.knownFor}</span>}
        </span>
      </span>
    </>
  );
}

function ClockIcon() {
  return (
    <svg className="sbx-clock" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** Ряд «Актёры» над результатами поиска: круглые фото, нажатие открывает страницу актёра. */
export function PeopleRow({
  query,
  country,
  enabled,
  onCount,
}: {
  query: string;
  country: string;
  enabled: boolean;
  /** Сколько актёров показано: каталог меняет текст «Ничего не нашлось». */
  onCount?: (n: number) => void;
}) {
  const [hits, setHits] = useState<{ query: string; list: PersonHit[] } | null>(null);
  useEffect(() => {
    if (!enabled || query.length < 2) return;
    const controller = new AbortController();
    searchPeople(query, controller.signal)
      .then((list) => setHits({ query, list }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [query, enabled]);

  const list = hits && hits.query === query ? hits.list : [];
  useEffect(() => {
    onCount?.(list.length);
    return () => onCount?.(0);
    // onCount — сеттер состояния каталога, стабилен
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);
  if (list.length === 0) return null;
  const sorted = country === WORLD ? list : [...list].sort((a, b) => Number(b.asian) - Number(a.asian));
  return (
    <section className="people-block" aria-label="Актёры">
      <h2>Актёры</h2>
      <div className="people-row">
        {sorted.map((p) => {
          const src = profileUrl(p.profilePath);
          return (
            <button
              key={p.id}
              type="button"
              className="people-item"
              onClick={() => {
                saveRecent(query);
                openPerson(p.id);
              }}
            >
              {src ? (
                <img className="people-photo" src={src} alt="" loading="lazy" decoding="async" draggable={false} />
              ) : (
                <span className="people-photo people-photo-empty" aria-hidden="true">
                  {p.name.slice(0, 1)}
                </span>
              )}
              <span className="people-name">{p.name}</span>
              {p.knownFor && <span className="people-known">{p.knownFor}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
