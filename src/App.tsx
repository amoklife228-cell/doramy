import { useRoute, type Tab } from './lib/router';
import { itemKey } from './lib/types';
import { TabBar } from './components/TabBar';
import { Catalog } from './screens/Catalog';
import { Library } from './screens/Library';
import { Settings } from './screens/Settings';
import { Detail } from './screens/Detail';

export default function App() {
  const route = useRoute();

  const screen = (tab: Tab, node: React.ReactNode) => (
    <section className="screen" data-active={route.tab === tab} aria-hidden={route.tab !== tab}>
      {node}
    </section>
  );

  return (
    <div className="app">
      {screen('catalog', <Catalog />)}
      {screen('library', <Library />)}
      {screen('settings', <Settings />)}
      {route.detail && (
        <Detail
          key={itemKey(route.detail.mediaType, route.detail.id)}
          mediaType={route.detail.mediaType}
          id={route.detail.id}
        />
      )}
      <TabBar active={route.tab} hidden={route.detail !== null} />
    </div>
  );
}
