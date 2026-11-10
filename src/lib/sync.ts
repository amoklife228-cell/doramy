import { useEffect, useState } from 'react';
import { db, setChangeListener, type OutboxOp } from './db';
import { supabase } from './supabase';
import type { ActivityDay, MediaType, SavedDrama } from './types';

// Каждое локальное изменение библиотеки попадает в очередь отправки.
setChangeListener((key, op) => {
  if (supabase) void enqueue(key, op);
});

/* ---------- состояние для UI ---------- */

export interface SyncState {
  status: 'idle' | 'syncing' | 'error';
  lastSync: number | null;
  error: string | null;
}

let state: SyncState = { status: 'idle', lastSync: null, error: null };
const listeners = new Set<(s: SyncState) => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function useSyncState(): SyncState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

/* ---------- очередь исходящих изменений ---------- */

let pushTimer: ReturnType<typeof setTimeout> | null = null;

/** Записать изменение в очередь и отправить чуть позже (несколько правок подряд уйдут одним пакетом). */
export async function enqueue(key: string, op: OutboxOp): Promise<void> {
  // Ключи активности и записей не пересекаются: 'YYYY-MM-DD' vs 'tv:123'.
  await db.outbox.put({ key, op, ts: Date.now() });
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void syncNow(), 600);
}

/* ---------- синхронизация ---------- */

interface LibraryRow {
  user_id: string;
  key: string;
  media_type: MediaType;
  tmdb_id: number;
  data: Partial<SavedDrama>;
  deleted: boolean;
  updated_at: string;
}

interface ActivityRow {
  user_id: string;
  day: string;
  units: number;
  minutes: number;
  updated_at: string;
}

const PULL_MARK = 'doramy.sync.pulledAt.';

function pulledMark(uid: string): string {
  try {
    return localStorage.getItem(PULL_MARK + uid) ?? '';
  } catch {
    return '';
  }
}

function setPulledMark(uid: string, iso: string) {
  try {
    localStorage.setItem(PULL_MARK + uid, iso);
  } catch {
    // ignore
  }
}

let running: Promise<void> | null = null;

/** Полная синхронизация: отправить очередь, забрать изменения с сервера. Повторные вызовы ждут текущую. */
export function syncNow(): Promise<void> {
  if (!running) {
    running = run().finally(() => {
      running = null;
    });
  }
  return running;
}

async function run(): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return;

  setState({ status: 'syncing', error: null });
  try {
    // Первый вход на этом устройстве: вся локальная библиотека и активность уезжают в аккаунт.
    if (!pulledMark(uid)) {
      const local = await db.items.toArray();
      const days = await db.activity.toArray();
      await db.outbox.bulkPut([
        ...local.map((s) => ({ key: s.key, op: 'put' as const, ts: Date.now() })),
        ...days.map((d) => ({ key: d.day, op: 'activity' as const, ts: Date.now() })),
      ]);
    }
    await push(uid);
    await pull(uid);
    setState({ status: 'idle', lastSync: Date.now(), error: null });
  } catch (e) {
    setState({ status: 'error', error: (e as Error).message || 'Ошибка синхронизации' });
  }
}

async function push(uid: string): Promise<void> {
  if (!supabase) return;
  const pending = await db.outbox.toArray();
  if (pending.length === 0) return;

  const rows: LibraryRow[] = [];
  const days: ActivityRow[] = [];
  for (const op of pending) {
    if (op.op === 'activity') {
      const d = await db.activity.get(op.key);
      if (d) {
        days.push({ user_id: uid, day: d.day, units: d.units, minutes: d.minutes, updated_at: new Date(d.updatedAt).toISOString() });
      }
      continue;
    }
    const item = await db.items.get(op.key);
    if (op.op === 'put' && item) {
      rows.push({
        user_id: uid,
        key: item.key,
        media_type: item.mediaType,
        tmdb_id: item.tmdbId,
        data: item,
        deleted: false,
        updated_at: new Date(item.updatedAt).toISOString(),
      });
    } else {
      const [media_type, id] = op.key.split(':');
      rows.push({
        user_id: uid,
        key: op.key,
        media_type: media_type as MediaType,
        tmdb_id: Number(id),
        data: {},
        deleted: true,
        updated_at: new Date(op.ts).toISOString(),
      });
    }
  }

  if (rows.length) {
    const { error } = await supabase.from('library').upsert(rows, { onConflict: 'user_id,key' });
    if (error) throw new Error(error.message);
  }
  if (days.length) {
    const { error } = await supabase.from('activity').upsert(days, { onConflict: 'user_id,day' });
    if (error) throw new Error(error.message);
  }

  // Убираем только то, что отправили; новые правки, появившиеся во время запроса, остаются.
  const newer = await db.outbox.toArray();
  for (const p of pending) {
    const n = newer.find((x) => x.key === p.key);
    if (!n || n.ts <= p.ts) await db.outbox.delete(p.key);
  }
}

async function pull(uid: string): Promise<void> {
  if (!supabase) return;
  const since = pulledMark(uid) || '1970-01-01T00:00:00Z';
  const pendingKeys = new Set((await db.outbox.toArray()).map((o) => o.key));
  let mark = since;

  const lib = await supabase
    .from('library')
    .select('*')
    .eq('user_id', uid)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
    .limit(1000);
  if (lib.error) throw new Error(lib.error.message);

  const act = await supabase
    .from('activity')
    .select('*')
    .eq('user_id', uid)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
    .limit(2000);
  if (act.error) throw new Error(act.error.message);

  const rows = (lib.data ?? []) as LibraryRow[];
  const days = (act.data ?? []) as ActivityRow[];

  await db.transaction('rw', db.items, db.activity, async () => {
    for (const row of rows) {
      const remoteTs = Date.parse(row.updated_at);
      const local = await db.items.get(row.key);
      // Локальная правка ещё не отправлена и новее — не затираем её серверной.
      if (pendingKeys.has(row.key) && local && local.updatedAt > remoteTs) continue;
      if (row.deleted) {
        if (local && local.updatedAt <= remoteTs) await db.items.delete(row.key);
      } else if (!local || local.updatedAt < remoteTs) {
        await db.items.put({
          ...(row.data as SavedDrama),
          key: row.key,
          mediaType: row.media_type,
          tmdbId: row.tmdb_id,
          updatedAt: remoteTs,
        });
      }
      if (row.updated_at > mark) mark = row.updated_at;
    }
    for (const d of days) {
      const remoteTs = Date.parse(d.updated_at);
      const local = await db.activity.get(d.day);
      if (pendingKeys.has(d.day) && local && local.updatedAt > remoteTs) continue;
      if (!local || local.updatedAt < remoteTs) {
        const row: ActivityDay = { day: d.day, units: d.units, minutes: d.minutes, updatedAt: remoteTs };
        await db.activity.put(row);
      }
      if (d.updated_at > mark) mark = d.updated_at;
    }
  });
  setPulledMark(uid, mark);
}

/** После выхода: локальная копия и метка синхронизации очищаются, данные остаются в аккаунте. */
export async function clearLocalAfterSignOut(uid: string): Promise<void> {
  await db.transaction('rw', db.items, db.outbox, db.activity, async () => {
    await db.items.clear();
    await db.outbox.clear();
    await db.activity.clear();
  });
  try {
    localStorage.removeItem(PULL_MARK + uid);
  } catch {
    // ignore
  }
}

/** Запускать синхронизацию при входе, возвращении на вкладку и раз в пару минут. */
export function useSyncLifecycle(loggedIn: boolean) {
  useEffect(() => {
    if (!loggedIn || !supabase) return;
    void syncNow();
    const onVisible = () => document.visibilityState === 'visible' && void syncNow();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    const timer = setInterval(() => document.visibilityState === 'visible' && void syncNow(), 120_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      clearInterval(timer);
    };
  }, [loggedIn]);
}
