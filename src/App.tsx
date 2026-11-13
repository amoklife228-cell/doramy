import { lazy, memo, Suspense, useState } from 'react';
import { historyIndex } from './lib/historyIndex';
import { ScreenActiveContext } from './lib/libraryStore';
import { advance, initialNav, layers } from './lib/overlayStack';
import { useRoute, type Tab } from './lib/router';
import { useSession } from './lib/supabase';
import { useSyncLifecycle } from './lib/sync';
import { itemKey } from './lib/types';
import { TabBar } from './components/TabBar';
import { Catalog as CatalogScreen } from './screens/Catalog';
import { Library as LibraryScreen } from './screens/Library';
import { Feed as FeedScreen } from './screens/Feed';
import { Profile as ProfileScreen } from './screens/Profile';

// Каждый переход (открыть карточку, «Назад») перерисовывает App. Вкладки от этого не зависят
// и с memo не пересчитываются заново — на телефоне это была заметная часть задержки.
const Catalog = memo(CatalogScreen);
const Library = memo(LibraryScreen);
const Feed = memo(FeedScreen);
const Profile = memo(ProfileScreen);

// Оверлеи открываются не сразу, поэтому грузятся отдельными чанками (вкладки остаются в основном).
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })));
const Notes = lazy(() => import('./screens/Notes').then((m) => ({ default: m.Notes })));
const History = lazy(() => import('./screens/History').then((m) => ({ default: m.History })));
const Calendar = lazy(() => import('./screens/Calendar').then((m) => ({ default: m.Calendar })));
const Wrapped = lazy(() => import('./screens/Wrapped').then((m) => ({ default: m.Wrapped })));
const Detail = lazy(() => import('./screens/Detail').then((m) => ({ default: m.Detail })));
const Collection = lazy(() => import('./screens/Collection').then((m) => ({ default: m.Collection })));
const Genre = lazy(() => import('./screens/Genre').then((m) => ({ default: m.Genre })));
const Friends = lazy(() => import('./screens/Friends').then((m) => ({ default: m.Friends })));
const Admin = lazy(() => import('./screens/Admin').then((m) => ({ default: m.Admin })));
const Person = lazy(() => import('./screens/Person').then((m) => ({ default: m.Person })));

/** Пока чанк оверлея грузится — пустой чёрный экран того же слоя, без белой вспышки. */
const overlayFallback = <div className="detail" />;

export default function App() {
  const route = useRoute();
  const session = useSession();
  useSyncLifecycle(!!session);

  // Подборка, жанр или страница актёра остаются под открытой с них карточкой: «Назад» вернёт к тому же
  // месту списка, без перезагрузки (см. lib/overlayStack). Считается прямо при отрисовке, без лишнего кадра.
  const idx = historyIndex();
  const [nav, setNav] = useState(() => initialNav(route, idx));
  let current = nav;
  if (nav.route !== route) {
    current = advance(nav, route, idx);
    setNav(current);
  }
  const { collection, genre, person, detailBelow, detailTop } = layers(current);

  const overlayOpen =
    route.detail !== null || route.overlay !== null || collection !== null || genre !== null || person !== null;

  const screen = (tab: Tab, node: React.ReactNode) => (
    <section className="screen" data-active={route.tab === tab} aria-hidden={route.tab !== tab}>
      <ScreenActiveContext.Provider value={route.tab === tab}>{node}</ScreenActiveContext.Provider>
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
      {route.overlay === 'calendar' && (
        <Suspense fallback={overlayFallback}>
          <Calendar />
        </Suspense>
      )}
      {route.overlay === 'wrapped' && (
        <Suspense fallback={overlayFallback}>
          <Wrapped />
        </Suspense>
      )}
      {route.overlay === 'friends' && (
        <Suspense fallback={overlayFallback}>
          <Friends session={session} />
        </Suspense>
      )}
      {route.overlay === 'admin' && (
        <Suspense fallback={overlayFallback}>
          <Admin session={session} />
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
      {detailBelow && (
        <Suspense fallback={overlayFallback}>
          <Detail
            key={itemKey(detailBelow.mediaType, detailBelow.id)}
            mediaType={detailBelow.mediaType}
            id={detailBelow.id}
          />
        </Suspense>
      )}
      {person && (
        <Suspense fallback={overlayFallback}>
          <Person key={person.id} id={person.id} />
        </Suspense>
      )}
      {detailTop && (
        <Suspense fallback={overlayFallback}>
          <Detail
            key={itemKey(detailTop.mediaType, detailTop.id)}
            mediaType={detailTop.mediaType}
            id={detailTop.id}
          />
        </Suspense>
      )}
      <TabBar active={route.tab} hidden={overlayOpen} />
    </div>
  );
}
