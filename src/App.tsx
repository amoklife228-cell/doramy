import { lazy, Suspense, useEffect, useState } from 'react';
import { useRoute, type Route, type Tab } from './lib/router';
import { useSession } from './lib/supabase';
import { useSyncLifecycle } from './lib/sync';
import { itemKey } from './lib/types';
import { TabBar } from './components/TabBar';
import { Catalog } from './screens/Catalog';
import { Library } from './screens/Library';
import { Feed } from './screens/Feed';
import { Profile } from './screens/Profile';

// Оверлеи открываются не сразу, поэтому грузятся отдельными чанками (вкладки остаются в основном).
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })));
const Notes = lazy(() => import('./screens/Notes').then((m) => ({ default: m.Notes })));
const History = lazy(() => import('./screens/History').then((m) => ({ default: m.History })));
const Detail = lazy(() => import('./screens/Detail').then((m) => ({ default: m.Detail })));
const Collection = lazy(() => import('./screens/Collection').then((m) => ({ default: m.Collection })));
const Genre = lazy(() => import('./screens/Genre').then((m) => ({ default: m.Genre })));

/** Пока чанк оверлея грузится — пустой чёрный экран того же слоя, без белой вспышки. */
const overlayFallback = <div className="detail" />;

export default function App() {
  const route = useRoute();
  const session = useSession();
  useSyncLifecycle(!!session);

  // Подборка или жанр остаются под открытой карточкой: «Назад» вернёт к тому же месту списка, без перезагрузки.
  const [kept, setKept] = useState<Pick<Route, 'collection' | 'genre'> | null>(null);
  useEffect(() => {
    if (route.collection || route.genre) setKept({ collection: route.collection, genre: route.genre });
    else if (!route.detail) setKept(null);
  }, [route]);
  const collection = route.collection ?? (route.detail ? (kept?.collection ?? null) : null);
  const genre = route.genre ?? (route.detail ? (kept?.genre ?? null) : null);

  const overlayOpen = route.detail !== null || route.overlay !== null || collection !== null || genre !== null;

  const screen = (tab: Tab, node: React.ReactNode) => (
    <section className="screen" data-active={route.tab === tab} aria-hidden={route.tab !== tab}>
      {node}
    </section>
  );

  return (
    <div className="app">
      {screen('catalog', <Catalog />)}
      {screen('library', <Library kindFromRoute={route.libraryKind} favoritesFromRoute={route.libraryFavorites} />)}
      {screen('feed', <Feed active={route.tab === 'feed'} />)}
      {screen('profile', <Profile session={session} />)}
      {route.overlay === 'settings' && (
        <Suspense fallback={overlayFallback}>
          <Settings session={session} />
        </Suspense>
      )}
      {route.overlay === 'notes' && (
        <Suspense fallback={overlayFallback}>
          <Notes />
        </Suspense>
      )}
      {route.overlay === 'history' && (
        <Suspense fallback={overlayFallback}>
          <History />
        </Suspense>
      )}
      {collection && (
        <Suspense fallback={overlayFallback}>
          <Collection
            key={`${collection.mediaType}:${collection.id}`}
            mediaType={collection.mediaType}
            id={collection.id}
          />
        </Suspense>
      )}
      {genre && (
        <Suspense fallback={overlayFallback}>
          <Genre key={genre.slug} kind={genre.kind} slug={genre.slug} sort={genre.sort} />
        </Suspense>
      )}
      {route.detail && (
        <Suspense fallback={overlayFallback}>
          <Detail
            key={itemKey(route.detail.mediaType, route.detail.id)}
            mediaType={route.detail.mediaType}
            id={route.detail.id}
          />
        </Suspense>
      )}
      <TabBar active={route.tab} hidden={overlayOpen} />
    </div>
  );
}
