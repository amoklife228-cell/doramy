import { useEffect, useState } from 'react';
import type { MediaType } from './types';

export type Tab = 'catalog' | 'library' | 'settings';

export interface Route {
  tab: Tab;
  detail: { mediaType: MediaType; id: number } | null;
}

const TABS: Tab[] = ['catalog', 'library', 'settings'];

let lastTab: Tab = 'catalog';

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const detail = path.match(/^\/(tv|movie|drama)\/(\d+)/);
  if (detail) {
    const mediaType: MediaType = detail[1] === 'movie' ? 'movie' : 'tv';
    return { tab: lastTab, detail: { mediaType, id: Number(detail[2]) } };
  }
  const seg = path.replace(/^\//, '').split('/')[0] as Tab;
  const tab = TABS.includes(seg) ? seg : 'catalog';
  lastTab = tab;
  return { tab, detail: null };
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

export function openDrama(mediaType: MediaType, id: number) {
  navigate(`/${mediaType}/${id}`);
}

export function goBack() {
  if (history.length > 1) history.back();
  else navigate(`/${lastTab}`);
}
