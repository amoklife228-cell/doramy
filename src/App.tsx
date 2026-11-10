import { useRoute, type Tab } from './lib/router';
import { TabBar } from './components/TabBar';
import { Catalog } from './screens/Catalog';
import { Search } from './screens/Search';
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
      {screen('search', <Search />)}
      {screen('library', <Library />)}
      {screen('settings', <Settings />)}
      {route.dramaId !== null && <Detail key={route.dramaId} id={route.dramaId} />}
      <TabBar active={route.tab} hidden={route.dramaId !== null} />
    </div>
  );
}
