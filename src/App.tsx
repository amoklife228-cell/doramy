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

/** Пока чанк оверлея грузится — пустой чёрный экран того же слоя, без белой вспышки. */
const overlayFallback = <div className="detail" />;

export default function App() {
  const route = useRoute();
  const session = useSession();
  useSyncLifecycle(!!session);

  // Подборка остаётся под открытой карточкой: «Назад» вернёт к тому же месту списка, без перезагрузки.
  const [keptCollection, setKeptCollection] = useState<Route['collection']>(null);
  useEffect(() => {
    if (route.collection) setKeptCollection(route.collection);
    else if (!route.detail) setKeptCollection(null);
  }, [route]);
  const collection = route.collection ?? (route.detail ? keptCollection : null);

  const overlayOpen = route.detail !== null || route.overlay !== null || collection !== null;

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
