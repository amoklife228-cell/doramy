import { useEffect, useState } from 'react';
import { useRoute, type Route, type Tab } from './lib/router';
import { useSession } from './lib/supabase';
import { useSyncLifecycle } from './lib/sync';
import { itemKey } from './lib/types';
import { TabBar } from './components/TabBar';
import { Catalog } from './screens/Catalog';
import { Library } from './screens/Library';
import { Feed } from './screens/Feed';
import { Profile } from './screens/Profile';
import { Settings } from './screens/Settings';
import { Notes } from './screens/Notes';
import { History } from './screens/History';
import { Detail } from './screens/Detail';
import { Collection } from './screens/Collection';

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
      {route.overlay === 'settings' && <Settings session={session} />}
      {route.overlay === 'notes' && <Notes />}
      {route.overlay === 'history' && <History />}
      {collection && (
        <Collection
          key={`${collection.mediaType}:${collection.id}`}
          mediaType={collection.mediaType}
          id={collection.id}
        />
      )}
      {route.detail && (
        <Detail
          key={itemKey(route.detail.mediaType, route.detail.id)}
          mediaType={route.detail.mediaType}
          id={route.detail.id}
        />
      )}
      <TabBar active={route.tab} hidden={overlayOpen} />
    </div>
  );
}
