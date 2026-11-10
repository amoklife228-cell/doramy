import { useEffect, useState } from 'react';
import type { LibraryKind, MediaType } from './types';

export type Tab = 'catalog' | 'library' | 'profile';
export type Overlay = 'settings' | 'notes' | 'history';

export interface Route {
  tab: Tab;
  /** Раздел библиотеки из адреса `#/library/<kind>`, если указан. */
  libraryKind: LibraryKind | null;
  /** `#/library/favorites` — показать только избранное. */
  libraryFavorites: boolean;
  detail: { mediaType: MediaType; id: number } | null;
  overlay: Overlay | null;
}

const TABS: Tab[] = ['catalog', 'library', 'profile'];
const KINDS: LibraryKind[] = ['dorama', 'series', 'movie'];
const OVERLAYS: Overlay[] = ['settings', 'notes', 'history'];

let lastTab: Tab = 'catalog';

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const base: Route = { tab: lastTab, libraryKind: null, libraryFavorites: false, detail: null, overlay: null };

  const detail = path.match(/^\/(tv|movie|drama)\/(\d+)/);
  if (detail) {
    const mediaType: MediaType = detail[1] === 'movie' ? 'movie' : 'tv';
    return { ...base, detail: { mediaType, id: Number(detail[2]) } };
  }

  const [seg, sub] = path.replace(/^\//, '').split('/');
  if (OVERLAYS.includes(seg as Overlay)) return { ...base, overlay: seg as Overlay };

  const tab = TABS.includes(seg as Tab) ? (seg as Tab) : 'catalog';
  lastTab = tab;
  const libraryKind = tab === 'library' && KINDS.includes(sub as LibraryKind) ? (sub as LibraryKind) : null;
  const libraryFavorites = tab === 'library' && sub === 'favorites';
  return { tab, libraryKind, libraryFavorites, detail: null, overlay: null };
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

export function openSettings() {
  navigate('/settings');
}

export function goBack() {
  if (history.length > 1) history.back();
  else navigate(`/${lastTab}`);
}
