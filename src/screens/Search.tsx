import { useCallback, useState } from 'react';
import { DramaGrid, EmptyState, NotConfigured } from '../components/DramaGrid';
import { useConfigured, useDebounced } from '../lib/hooks';
import { search } from '../lib/tmdb';
import { usePagedList } from '../lib/usePagedList';

export function Search() {
  const configured = useConfigured();
  const [text, setText] = useState('');
  const query = useDebounced(text.trim(), 400);
  const active = configured && query.length >= 2;

  const fetcher = useCallback((page: number, signal: AbortSignal) => search(query, page, signal), [query]);
  const list = usePagedList(`${configured}|${query}`, active ? fetcher : null);

  return (
    <>
      <header className="topbar">
        <h1>Поиск</h1>
        <div className="searchbox">
          <input
            type="search"
            placeholder="Название дорамы"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoCorrect="off"
            autoCapitalize="off"
            enterKeyHint="search"
          />
          {text && (
            <button className="searchbox-clear" onClick={() => setText('')} aria-label="Очистить">
              ✕
            </button>
          )}
        </div>
      </header>

      <div className="content">
        {!configured ? (
          <NotConfigured />
        ) : query.length < 2 ? (
          <EmptyState icon="🔍" title="Найти дораму" text="Введите название на русском, английском или в оригинале." />
        ) : list.error && list.items.length === 0 ? (
          <EmptyState
            icon="📡"
            title="Ошибка"
            text={list.error}
            action={
              <button className="btn btn-primary" onClick={list.reload}>
                Повторить
              </button>
            }
          />
        ) : !list.loading && list.items.length === 0 ? (
          <EmptyState icon="🤷" title="Ничего не нашлось" text={`По запросу «${query}» нет дорам.`} />
        ) : (
          <DramaGrid items={list.items} loading={list.loading} hasMore={list.hasMore} onLoadMore={list.loadMore} />
        )}
      </div>
    </>
  );
}
