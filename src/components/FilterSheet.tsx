import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CATEGORY_OPTIONS,
  COUNTRIES,
  DEFAULT_FILTERS,
  GENRES_BY_TYPE,
  MINE_OPTIONS,
  NETWORK_OPTIONS,
  SORTS,
  STATUS_OPTIONS,
  WORLD,
  YEAR_OPTIONS,
  type CatalogFilters,
  type MediaType,
  type Option,
} from '../lib/types';
import { IosRow, IosSection } from './IosList';
import { BackButton } from './NavBar';
import './FilterSheet.css';

type Key = keyof CatalogFilters;

interface Row {
  key: Key;
  title: string;
  options: Option[];
}

/** Строки фильтра, сгруппированные по секциям как в «Настройках». */
function groupsFor(mediaType: MediaType): Row[][] {
  const tv = mediaType === 'tv';
  const sort: Row = { key: 'sort', title: 'Сортировка', options: SORTS.map((s) => ({ value: s.id, label: s.title })) };
  const genre: Row = {
    key: 'genre',
    title: 'Жанр',
    options: [{ value: '', label: 'Любой' }, ...GENRES_BY_TYPE[mediaType].map((g) => ({ value: String(g.id), label: g.title }))],
  };
  const year: Row = { key: 'year', title: 'Год выхода', options: YEAR_OPTIONS };
  const country: Row = {
    key: 'country',
    title: 'Страна',
    options: [{ value: '', label: 'Азия' }, { value: WORLD, label: 'Весь мир' }, ...COUNTRIES.map((c) => ({ value: c.code, label: c.title }))],
  };
  const status: Row = { key: 'status', title: 'Статус', options: STATUS_OPTIONS[mediaType] };
  const mine: Row = { key: 'mine', title: tv ? 'Мои сериалы' : 'Мои фильмы', options: MINE_OPTIONS };

  const release: Row[] = [status];
  if (tv) {
    release.push({ key: 'category', title: 'Категория', options: CATEGORY_OPTIONS });
    release.push({ key: 'network', title: 'Телеканалы', options: NETWORK_OPTIONS });
  }
  return [[sort], [genre, year, country], release, [mine]];
}

export function countActive(f: CatalogFilters): number {
  return (Object.keys(DEFAULT_FILTERS) as Key[]).filter((k) => f[k] !== DEFAULT_FILTERS[k]).length;
}

function Checkmark() {
  return (
    <svg className="fs-check" viewBox="0 0 16 13" fill="none" aria-hidden="true">
      <path d="M1.5 7l4.5 4.5L14.5 1.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Фильтр каталога: шторка iOS со сгруппированным списком, строка → список значений. */
export function FilterSheet({
  open,
  mediaType,
  value,
  onApply,
  onClose,
}: {
  open: boolean;
  mediaType: MediaType;
  value: CatalogFilters;
  onApply: (f: CatalogFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CatalogFilters>(value);
  const [level, setLevel] = useState<Key | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setLevel(null);
    }
  }, [open, value]);

  // Фокус в диалог при открытии — для VoiceOver и клавиатуры.
  useEffect(() => {
    if (open) sheetRef.current?.focus();
  }, [open]);

  // Каждый уровень начинается с начала списка.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    setScrolled(false);
  }, [level]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (level) setLevel(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, level, onClose]);

  if (!open) return null;

  const groups = groupsFor(mediaType);
  const current = level ? groups.flat().find((r) => r.key === level) ?? null : null;
  const labelOf = (row: Row) => row.options.find((o) => o.value === draft[row.key])?.label ?? '';
  const apply = () => {
    onApply(draft);
    onClose();
  };

  return createPortal(
    <div className="fs-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        className="fs-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={current ? current.title : 'Фильтр'}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fs-bar" data-scrolled={scrolled}>
          <div className="fs-side">
            {current ? (
              <BackButton label="Фильтр" onClick={() => setLevel(null)} />
            ) : (
              <button
                type="button"
                className="fs-action"
                onClick={() => setDraft(DEFAULT_FILTERS)}
                disabled={countActive(draft) === 0}
              >
                Сбросить
              </button>
            )}
          </div>
          <h2 className="fs-title">{current ? current.title : 'Фильтр'}</h2>
          <div className="fs-side fs-side-right">
            <button type="button" className="fs-action fs-action-done" onClick={apply}>
              Готово
            </button>
          </div>
        </header>

        <div ref={bodyRef} className="fs-body" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}>
          {current ? (
            <div className="fs-level" key={current.key}>
              <IosSection>
                {current.options.map((o) => {
                  const selected = draft[current.key] === o.value;
                  return (
                    <IosRow
                      key={o.value}
                      label={o.label}
                      className={selected ? 'fs-option is-selected' : 'fs-option'}
                      onClick={() => {
                        setDraft({ ...draft, [current.key]: o.value });
                        setLevel(null);
                      }}
                    >
                      {selected && (
                        <>
                          <Checkmark />
                          <span className="fs-sr">выбрано</span>
                        </>
                      )}
                    </IosRow>
                  );
                })}
              </IosSection>
            </div>
          ) : (
            <div className="fs-level" key="root">
              {groups.map((rows) => (
                <IosSection key={rows[0].key}>
                  {rows.map((row) => (
                    <IosRow key={row.key} label={row.title} value={labelOf(row)} chevron onClick={() => setLevel(row.key)} />
                  ))}
                </IosSection>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
