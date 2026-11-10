import { navigate, type Tab } from '../lib/router';

const TABS: { id: Tab; title: string; icon: React.ReactNode }[] = [
  {
    id: 'catalog',
    title: 'Каталог',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 4v16M16 4v16" />
      </svg>
    ),
  },
  {
    id: 'library',
    title: 'Библиотека',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 4h4v16H4zM10 4h4v16h-4zM16.5 5.2l3.8-1 4 15.5-3.8 1z" />
      </svg>
    ),
  },
  {
    id: 'profile',
    title: 'Профиль',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="8.5" r="4" />
        <path d="M4.5 20.5c1.2-4 4.1-6 7.5-6s6.3 2 7.5 6" />
      </svg>
    ),
  },
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
          <span className="tab-icon">{t.icon}</span>
          <span className="tab-title">{t.title}</span>
        </button>
      ))}
    </nav>
  );
}
