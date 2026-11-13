import { getSupabase } from './supabase';

/** Ответы функций из supabase/admin.sql. */
export interface AdminDay {
  day: string;
  devices: number;
  opens: number;
  actions: number;
  units: number;
}

export interface AdminOverview {
  today: string;
  users: number;
  users_new_7: number;
  devices_today: number;
  devices_7: number;
  devices_30: number;
  devices_all: number;
  new_devices_7: number;
  installed_30: number;
  opens_today: number;
  units_7: number;
  titles: number;
  platforms: Record<string, number>;
  days: AdminDay[];
}

export interface AdminUser {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  last_seen: string | null;
  titles: number;
  watching: number;
  completed: number;
  units: number;
  minutes: number;
  devices: number;
  is_admin: boolean;
}

export interface AdminLibraryRow {
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
  review: string | null;
  updated_at: string;
}

export interface AdminUserDetail {
  library: AdminLibraryRow[];
  activity: { day: string; units: number; minutes: number }[];
}

export interface AdminFeedRow {
  user_id: string;
  email: string | null;
  media_type: 'tv' | 'movie';
  tmdb_id: number;
  title: string | null;
  poster: string | null;
  status: string | null;
  episodes: number | null;
  episode_count: number | null;
  deleted: boolean;
  updated_at: string;
}

/** Почему панель не открылась: не вошёл, не админ, на сервере нет функций, сеть. */
export class AdminError extends Error {
  constructor(
    public kind: 'forbidden' | 'not_installed' | 'network',
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = await getSupabase().catch(() => null);
  if (!supabase) throw new AdminError('network', 'Нет соединения с сервером.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const code = (error as { code?: string }).code ?? '';
    if (code === '42501' || /forbidden|permission/i.test(error.message)) {
      throw new AdminError('forbidden', 'Нет прав администратора.');
    }
    if (code === 'PGRST202' || code === '42883' || /could not find the function/i.test(error.message)) {
      throw new AdminError('not_installed', 'На сервере не выполнен admin.sql.');
    }
    throw new AdminError('network', error.message);
  }
  return data as T;
}

/** true/false; null — функции на сервере ещё нет. */
export async function checkAdmin(): Promise<boolean | null> {
  try {
    return await call<boolean>('is_admin');
  } catch (e) {
    if (e instanceof AdminError && e.kind === 'not_installed') return null;
    throw e;
  }
}

export const loadOverview = (days = 30) => call<AdminOverview>('admin_overview', { p_days: days });
export const loadUsers = () => call<AdminUser[]>('admin_users');
export const loadUser = (id: string) => call<AdminUserDetail>('admin_user', { p_user: id });
export const loadFeed = (limit = 80) => call<AdminFeedRow[]>('admin_feed', { p_limit: limit });
