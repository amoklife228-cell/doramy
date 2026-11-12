import type { Route } from './router';
import type { MediaType } from './types';

/**
 * Какие списки остаются смонтированными под верхним экраном, чтобы «Назад» вернул к тому же месту:
 * - подборка или жанр — под открытой с них карточкой (и под страницей актёра, открытой из неё);
 * - страница актёра — под открытой с неё карточкой;
 * - карточка, с которой открыли актёра, — под его страницей (и под карточками, открытыми с неё).
 * Номер записи в истории (idx) отличает переход вперёд от возврата назад.
 * Карточек в стопке может быть две, и у каждой свой Escape на window: пока смонтирована страница
 * актёра, Escape перехватывает она (screens/Person.tsx) и делает ровно один шаг назад.
 */
export interface Kept {
  collection: Route['collection'];
  genre: Route['genre'];
  person: { id: number; idx: number } | null;
  personFrom: { mediaType: MediaType; id: number; idx: number } | null;
}

export interface NavState {
  route: Route;
  idx: number;
  kept: Kept;
}

const EMPTY: Kept = { collection: null, genre: null, person: null, personFrom: null };

export function initialNav(route: Route, idx: number): NavState {
  return advance({ route, idx, kept: EMPTY }, route, idx);
}

export function advance(prev: NavState, route: Route, idx: number): NavState {
  const forward = idx > prev.idx;
  let { collection, genre, person, personFrom } = prev.kept;
  if (route.collection || route.genre) {
    collection = route.collection;
    genre = route.genre;
    person = null;
    personFrom = null;
  } else if (route.person) {
    if (forward) personFrom = prev.route.detail && prev.route !== route ? { ...prev.route.detail, idx: prev.idx } : null;
    else if (personFrom && personFrom.idx >= idx) personFrom = null;
    person = { id: route.person.id, idx };
  } else if (route.detail) {
    // Ушли назад дальше страницы актёра — она (и карточка под ней) больше не нужна.
    // Иначе карточка открыта со страницы актёра: стопка остаётся как есть.
    if (!person || person.idx >= idx) {
      person = null;
      personFrom = null;
    }
  } else {
    collection = null;
    genre = null;
    person = null;
    personFrom = null;
  }
  return { route, idx, kept: { collection, genre, person, personFrom } };
}

/** Что рисовать: слои снизу вверх — подборка/жанр, карточка под актёром, актёр, карточка над актёром. */
export function layers(nav: NavState) {
  const { route, idx, kept } = nav;
  const inStack = route.detail !== null || route.person !== null;
  const collection = route.collection ?? (inStack ? kept.collection : null);
  const genre = route.genre ?? (inStack ? kept.genre : null);
  const person = route.person ?? (route.detail && kept.person && kept.person.idx < idx ? { id: kept.person.id } : null);
  const detailOnTop = route.detail !== null && person !== null && route.person === null;
  const detailBelow = route.person || detailOnTop ? kept.personFrom : route.detail;
  const detailTop = detailOnTop ? route.detail : null;
  return { collection, genre, person, detailBelow, detailTop };
}
