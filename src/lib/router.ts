import { useEffect, useState } from 'react';

export type Tab = 'catalog' | 'search' | 'library' | 'settings';

export interface Route {
  tab: Tab;
  dramaId: number | null;
}

const TABS: Tab[] = ['catalog', 'search', 'library', 'settings'];

let lastTab: Tab = 'catalog';

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const detail = path.match(/^\/drama\/(\d+)/);
  if (detail) return { tab: lastTab, dramaId: Number(detail[1]) };
  const seg = path.replace(/^\//, '').split('/')[0] as Tab;
  const tab = TABS.includes(seg) ? seg : 'catalog';
  lastTab = tab;
  return { tab, dramaId: null };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string) {
  location.hash = path;
}

export function openDrama(id: number) {
  navigate(`/drama/${id}`);
}

export function goBack() {
  if (history.length > 1) history.back();
  else navigate(`/${lastTab}`);
}
