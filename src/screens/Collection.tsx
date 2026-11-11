import { useCallback, useEffect } from 'react';
import { DramaGrid, EmptyState, NotConfigured } from '../components/DramaGrid';
import { NavBar } from '../components/NavBar';
import { Refreshable } from '../components/Refreshable';
import { COLLECTIONS, isCollectionId } from '../lib/collections';
import { useConfigured } from '../lib/hooks';
import { goBack } from '../lib/router';
import type { MediaType } from '../lib/types';
import { usePagedList } from '../lib/usePagedList';

/** Полный список подборки с главной каталога: «Новинки», «ТОП-500», «Премии» и т. д. */
export function Collection({ mediaType, id }: { mediaType: MediaType; id: string }) {
  const configured = useConfigured();
  const collection = isCollectionId(id) ? COLLECTIONS[id] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && goBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fetcher = useCallback(
    (page: number, signal: AbortSignal) => collection!.fetchPage(mediaType, page, signal),
    [collection, mediaType],
  );
  const list = usePagedList(`${configured}|col:${mediaType}:${id}`, configured && collection ? fetcher : null);

  return (
    <div className="detail" role="dialog" aria-modal="true">
      <NavBar backLabel="Каталог" />
      <Refreshable className="detail-content ios-page" onRefresh={() => {
        list.reload();
        return new Promise((r) => setTimeout(r, 600));
      }}>
        {!collection ? (
          <EmptyState title="Подборка не найдена" />
        ) : (
          <>
            <h1 className="ios-large-title">{collection.title[mediaType]}</h1>
            <p className="collection-sub">{collection.subtitle[mediaType]}</p>
            {!configured ? (
              <NotConfigured />
            ) : list.error && list.items.length === 0 ? (
              <EmptyState
                title="Не удалось загрузить"
                text={list.error}
                action={
                  <button className="btn btn-primary" onClick={list.reload}>
                    Повторить
                  </button>
                }
              />
            ) : !list.loading && list.items.length === 0 && (!list.hasMore || list.pagesLoaded >= 5) ? (
              <EmptyState title="Пока пусто" text="Загляните позже, подборка обновляется сама." />
            ) : (
              <DramaGrid
                items={list.items}
                loading={list.loading}
                placeholder={list.items.length === 0 && list.hasMore}
                hasMore={list.hasMore}
                onLoadMore={list.loadMore}
                error={list.error}
                onRetry={list.retry}
                ranked={collection.ranked}
                notes={collection.notes}
              />
            )}
          </>
        )}
      </Refreshable>
    </div>
  );
}
