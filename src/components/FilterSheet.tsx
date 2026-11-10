import { useEffect, useState } from 'react';
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

type Key = keyof CatalogFilters;

interface Row {
  key: Key;
  title: string;
  options: Option[];
}

function rowsFor(mediaType: MediaType): Row[] {
  const rows: Row[] = [
    { key: 'sort', title: 'Сортировка', options: SORTS.map((s) => ({ value: s.id, label: s.title })) },
    { key: 'genre', title: 'Жанр', options: [{ value: '', label: 'Любой' }, ...GENRES_BY_TYPE[mediaType].map((g) => ({ value: String(g.id), label: g.title }))] },
    { key: 'year', title: 'Год выхода', options: YEAR_OPTIONS },
    {
      key: 'country',
      title: 'Страна',
      options: [{ value: '', label: 'Азия' }, { value: WORLD, label: 'Весь мир' }, ...COUNTRIES.map((c) => ({ value: c.code, label: c.title }))],
    },
    { key: 'status', title: 'Статус', options: STATUS_OPTIONS[mediaType] },
  ];
  if (mediaType === 'tv') rows.push({ key: 'category', title: 'Категория', options: CATEGORY_OPTIONS });
  rows.push({ key: 'mine', title: mediaType === 'tv' ? 'Мои сериалы' : 'Мои фильмы', options: MINE_OPTIONS });
  if (mediaType === 'tv') rows.push({ key: 'network', title: 'Телеканалы', options: NETWORK_OPTIONS });
  return rows;
}

export function countActive(f: CatalogFilters): number {
  return (Object.keys(DEFAULT_FILTERS) as Key[]).filter((k) => f[k] !== DEFAULT_FILTERS[k]).length;
}

/** Полноэкранный фильтр каталога в стиле списка настроек: строки → выбор значения. */
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

  useEffect(() => {
    if (open) {
      setDraft(value);
      setLevel(null);
    }
  }, [open, value]);

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

  const rows = rowsFor(mediaType);
  const current = level ? rows.find((r) => r.key === level) : null;
  const labelOf = (row: Row) => row.options.find((o) => o.value === draft[row.key])?.label ?? '';

  return createPortal(
    <div className="filter" role="dialog" aria-modal="true" aria-label="Фильтр">
      <header className="filter-bar">
        {current ? (
          <button className="back" onClick={() => setLevel(null)} aria-label="Назад к фильтру">
            ‹ Фильтр
          </button>
        ) : (
          <button className="filter-clear" onClick={() => setDraft(DEFAULT_FILTERS)} disabled={countActive(draft) === 0}>
            Очистить
          </button>
        )}
        <span className="filter-title">{current ? current.title : 'Фильтр'}</span>
        <button
          className="filter-ok"
          onClick={() => {
            onApply(draft);
            onClose();
          }}
          aria-label="Применить"
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </button>
      </header>

      <div className="filter-body">
        {current ? (
          <ul className="filter-list">
            {current.options.map((o) => (
              <li key={o.value}>
                <button
                  className="filter-row"
                  data-active={draft[current.key] === o.value}
                  onClick={() => {
                    setDraft({ ...draft, [current.key]: o.value });
                    setLevel(null);
                  }}
                >
                  <span>{o.label}</span>
                  {draft[current.key] === o.value && <span className="filter-check">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="filter-list">
            {rows.map((row) => {
              const isDefault = draft[row.key] === DEFAULT_FILTERS[row.key];
              return (
                <li key={row.key}>
                  <button className="filter-row" onClick={() => setLevel(row.key)}>
                    <span>{row.title}</span>
                    <span className="filter-value" data-set={!isDefault}>
                      {isDefault && row.key !== 'sort' && row.key !== 'country' ? '' : labelOf(row)}
                      <span className="chevron" aria-hidden>
                        ›
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
