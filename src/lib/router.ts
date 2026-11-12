import { useEffect, useState } from 'react';
import type { DiscoverSort, LibraryKind, MediaType } from './types';

export type Tab = 'catalog' | 'library' | 'feed' | 'profile';
export type Overlay = 'settings' | 'notes' | 'history' | 'calendar' | 'wrapped';

export interface Route {
  tab: Tab;
  /** Раздел библиотеки из адреса `#/library/<kind>`, если указан. */
  libraryKind: LibraryKind | null;
  /** `#/library/favorites` — показать только избранное. */
  libraryFavorites: boolean;
  detail: { mediaType: MediaType; id: number } | null;
  overlay: Overlay | null;
  /** `#/collection/<tv|movie>/<id>` — полный список подборки с главной каталога. */
  collection: { mediaType: MediaType; id: string } | null;
  /** `#/genre/<dorama|series|movie>/<slug>[/<sort>]` — каталог жанра по картинке с главной. */
  genre: { kind: LibraryKind; slug: string; sort: DiscoverSort } | null;
  /** `#/person/<id>` — страница актёра. */
  person: { id: number } | null;
}

const SORT_IDS: DiscoverSort[] = ['popular', 'topRated', 'newest'];

const TABS: Tab[] = ['catalog', 'library', 'feed', 'profile'];
const KINDS: LibraryKind[] = ['dorama', 'series', 'movie'];
// 'wrapped' — «Итоги года»; `#/wrapped/<год>` выбирает год (экран читает его из адреса сам).
const OVERLAYS: Overlay[] = ['settings', 'notes', 'history', 'calendar', 'wrapped'];

let lastTab: Tab = 'catalog';

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const base: Route = {
    tab: lastTab,
    libraryKind: null,
    libraryFavorites: false,
    detail: null,
    overlay: null,
    collection: null,
    genre: null,
    person: null,
  };

  const person = path.match(/^\/person\/(\d+)/);
  if (person) return { ...base, person: { id: Number(person[1]) } };

  const detail = path.match(/^\/(tv|movie|drama)\/(\d+)/);
  if (detail) {
    const mediaType: MediaType = detail[1] === 'movie' ? 'movie' : 'tv';
    return { ...base, detail: { mediaType, id: Number(detail[2]) } };
  }

  const collection = path.match(/^\/collection\/(tv|movie)\/([a-z0-9]+)/);
  if (collection) {
    lastTab = 'catalog';
    return { ...base, tab: 'catalog', collection: { mediaType: collection[1] as MediaType, id: collection[2] } };
  }

  const genre = path.match(/^\/genre\/(dorama|series|movie)\/([a-z]+)(?:\/([a-zA-Z]+))?/);
  if (genre) {
    lastTab = 'catalog';
    const sort = SORT_IDS.includes(genre[3] as DiscoverSort) ? (genre[3] as DiscoverSort) : 'popular';
    return { ...base, tab: 'catalog', genre: { kind: genre[1] as LibraryKind, slug: genre[2], sort } };
  }

  const [seg, sub] = path.replace(/^\//, '').split('/');
  if (OVERLAYS.includes(seg as Overlay)) return { ...base, overlay: seg as Overlay };

  const tab = TABS.includes(seg as Tab) ? (seg as Tab) : 'catalog';
  lastTab = tab;
  const libraryKind = tab === 'library' && KINDS.includes(sub as LibraryKind) ? (sub as LibraryKind) : null;
  const libraryFavorites = tab === 'library' && sub === 'favorites';
  return { tab, libraryKind, libraryFavorites, detail: null, overlay: null, collection: null, genre: null, person: null };
}

export function openCollection(mediaType: MediaType, id: string) {
  navigate(`/collection/${mediaType}/${id}`);
}

function genrePath(kind: LibraryKind, slug: string, sort: DiscoverSort) {
  return `/genre/${kind}/${slug}${sort === 'popular' ? '' : `/${sort}`}`;
}

export function openGenre(kind: LibraryKind, slug: string, sort: DiscoverSort = 'popular') {
  navigate(genrePath(kind, slug, sort));
}

/** Смена раздела или сортировки на странице жанра: без новой записи в истории, «Назад» ведёт в каталог. */
export function replaceGenre(kind: LibraryKind, slug: string, sort: DiscoverSort) {
  location.replace(`#${genrePath(kind, slug, sort)}`);
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

export function openPerson(id: number) {
  navigate(`/person/${id}`);
}

export function openSettings() {
  navigate('/settings');
}

export function goBack() {
  if (history.length > 1) history.back();
  else navigate(`/${lastTab}`);
}
