import { navigate, type Tab } from '../lib/router';

const TABS: { id: Tab; title: string; icon: string }[] = [
  { id: 'catalog', title: 'Каталог', icon: '🎬' },
  { id: 'library', title: 'Библиотека', icon: '📚' },
  { id: 'settings', title: 'Настройки', icon: '⚙️' },
];

export function TabBar({ active, hidden }: { active: Tab; hidden: boolean }) {
  return (
    <nav className="tabbar" data-hidden={hidden}>
      {TABS.map((t) => (
        <button
          key={t.id}
          className="tab"
          data-active={active === t.id}
          onClick={() => navigate(`/${t.id}`)}
          aria-current={active === t.id ? 'page' : undefined}
        >
          <span className="tab-icon" aria-hidden>
            {t.icon}
          </span>
          <span className="tab-title">{t.title}</span>
        </button>
      ))}
    </nav>
  );
}
