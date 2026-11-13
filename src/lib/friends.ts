import { getSupabase } from './supabase';

export interface MyProfile {
  username: string;
  share_activity: boolean;
}

export type Relation = 'none' | 'friends' | 'out' | 'in';

export interface SearchResult {
  user_id: string;
  username: string;
  rel: Relation;
}

export interface FriendRow {
  user_id: string;
  username: string;
  shares: boolean;
  titles: number;
  watching: number;
  last_seen: string | null;
}

export interface RequestRow {
  user_id: string;
  username: string;
  created_at: string;
}

export interface FeedRow {
  user_id: string;
  username: string;
  media_type: 'tv' | 'movie';
  tmdb_id: number;
  title: string | null;
  poster: string | null;
  status: string | null;
  rating: number | null;
  favorite: boolean | null;
  updated_at: string;
}

export interface FriendLibraryRow {
  key: string;
  media_type: 'tv' | 'movie';
  tmdb_id: number;
  title: string | null;
  poster: string | null;
  status: string | null;
  episodes: number | null;
  episode_count: number | null;
  rating: number | null;
  favorite: boolean | null;
  updated_at: string;
}

export interface FriendProfile {
  hidden?: boolean;
  username?: string;
  library?: FriendLibraryRow[];
}

export class FriendsError extends Error {
  constructor(
    public kind: 'not_installed' | 'forbidden' | 'network',
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = await getSupabase().catch(() => null);
  if (!supabase) throw new FriendsError('network', 'Нет соединения с сервером.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const code = (error as { code?: string }).code ?? '';
    if (code === 'PGRST202' || code === '42883' || /could not find the function/i.test(error.message)) {
      throw new FriendsError('not_installed', 'На сервере не выполнен friends.sql.');
    }
    if (code === '42501') throw new FriendsError('forbidden', 'Нет доступа.');
    throw new FriendsError('network', error.message);
  }
  return data as T;
}

/** Мой профиль; null — ника ещё нет; undefined-бросок not_installed если friends.sql не выполнен. */
export const loadMyProfile = () => call<MyProfile | null>('profile_me');
export const setUsername = (name: string) => call<'ok' | 'taken' | 'invalid'>('profile_set_username', { p_name: name });
export const setSharing = (on: boolean) => call<null>('profile_set_sharing', { p_on: on });
export const searchFriends = (q: string) => call<SearchResult[]>('friend_search', { p_q: q });
export const addFriend = (username: string) =>
  call<'sent' | 'friends' | 'self' | 'not_found' | 'exists'>('friend_add', { p_username: username });
export const respondRequest = (from: string, accept: boolean) => call<null>('friend_respond', { p_from: from, p_accept: accept });
export const removeFriend = (other: string) => call<null>('friend_remove', { p_other: other });
export const loadRequests = () => call<RequestRow[]>('friend_requests');
export const loadFriends = () => call<FriendRow[]>('friend_list');
export const loadFeed = (limit = 60) => call<FeedRow[]>('friend_feed', { p_limit: limit });
export const loadFriendProfile = (id: string) => call<FriendProfile>('friend_profile', { p_user: id });
