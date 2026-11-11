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

/*
 * Две отметки времени:
 * - data.updatedAt — когда запись изменил пользователь; по ней решается, чья версия новее (last write wins);
 * - updated_at (колонка) — когда строку записали на сервер; по ней устройства забирают изменения.
 * Раньше это было одно поле, и правка, сделанная офлайн и отправленная позже, не доходила до других устройств.
 */

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

const LIB_MARK = 'doramy.sync.pulledAt.';
const ACT_MARK = 'doramy.sync.activityPulledAt.';
/** Чей аккаунт сейчас лежит в локальной базе. Пусто — данные гостя (без входа). */
const OWNER = 'doramy.sync.owner';
/** Запас при заборе: часы устройств расходятся, повторно забранные строки безвредны. */
const OVERLAP_MS = 10 * 60 * 1000;
const PAGE = 1000;

function getLS(k: string): string {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
}

function setLS(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // ignore
  }
}

/** Время правки, записанное в строке сервера (у старых строк его нет — берём время записи). */
function remoteEditTs(row: LibraryRow): number {
  const ts = row.data?.updatedAt;
  return typeof ts === 'number' ? ts : Date.parse(row.updated_at);
}

let running: Promise<void> | null = null;
/** Растёт при выходе из аккаунта: синхронизация, начатая до выхода, не должна ничего записать после него. */
let epoch = 0;

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
  const myEpoch = epoch;
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid || myEpoch !== epoch) return;

  setState({ status: 'syncing', error: null });
  try {
    const owner = getLS(OWNER);
    if (owner && owner !== uid) {
      // В базе остались данные другого аккаунта (сессия истекла без выхода). Они уже лежат в его аккаунте,
      // в этот аккаунт их переносить нельзя.
      await clearLocal();
    }
    if (!getLS(LIB_MARK + uid)) {
      // Первый вход на этом устройстве: сначала забираем аккаунт, потом отправляем свои записи.
      // Отправка сравнивает время правки с серверным, так что старые копии не затрут новые.
      await pull(uid, myEpoch);
      const local = await db.items.toArray();
      const days = await db.activity.toArray();
      await db.outbox.bulkPut([
        ...local.map((s) => ({ key: s.key, op: 'put' as const, ts: Date.now() })),
        ...days.filter((d) => unsynced(d)).map((d) => ({ key: d.day, op: 'activity' as const, ts: Date.now() })),
      ]);
    }
    setLS(OWNER, uid);
    await push(uid, myEpoch);
    await pull(uid, myEpoch);
    if (myEpoch === epoch) setState({ status: 'idle', lastSync: Date.now(), error: null });
  } catch (e) {
    if (myEpoch === epoch) setState({ status: 'error', error: (e as Error).message || 'Ошибка синхронизации' });
  }
}

function unsynced(d: ActivityDay): boolean {
  return d.units !== (d.syncedUnits ?? 0) || d.minutes !== (d.syncedMinutes ?? 0);
}

async function push(uid: string, myEpoch: number): Promise<void> {
  if (!supabase) return;
  const pending = await db.outbox.toArray();
  if (pending.length === 0) return;
  const now = new Date().toISOString();

  const itemOps = pending.filter((p) => p.op !== 'activity');
  const dayOps = pending.filter((p) => p.op === 'activity');

  /* --- библиотека: отправляем только то, что новее серверной версии --- */
  if (itemOps.length) {
    const keys = itemOps.map((p) => p.key);
    const server = new Map<string, number>();
    for (let i = 0; i < keys.length; i += 200) {
      const { data, error } = await supabase
        .from('library')
        .select('key, data, updated_at')
        .eq('user_id', uid)
        .in('key', keys.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as LibraryRow[]) server.set(r.key, remoteEditTs(r));
    }

    const rows: LibraryRow[] = [];
    for (const op of itemOps) {
      const item = await db.items.get(op.key);
      const editTs = item ? item.updatedAt : op.ts;
      const serverTs = server.get(op.key);
      // На сервере версия новее: не затираем, она придёт при заборе.
      if (serverTs !== undefined && serverTs > editTs) continue;
      if (op.op === 'put' && item) {
        rows.push({
          user_id: uid,
          key: item.key,
          media_type: item.mediaType,
          tmdb_id: item.tmdbId,
          data: item,
          deleted: false,
          updated_at: now,
        });
      } else if (!item) {
        const [media_type, id] = op.key.split(':');
        rows.push({
          user_id: uid,
          key: op.key,
          media_type: media_type as MediaType,
          tmdb_id: Number(id),
          data: { updatedAt: op.ts },
          deleted: true,
          updated_at: now,
        });
      }
    }
    if (rows.length) {
      const { error } = await supabase.from('library').upsert(rows, { onConflict: 'user_id,key' });
      if (error) throw new Error(error.message);
    }
  }

  /* --- активность: отправляем прирост, а не итог, чтобы два устройства не затирали друг друга --- */
  for (const op of dayOps) {
    if (myEpoch !== epoch) return;
    const local = await db.activity.get(op.key);
    if (!local || !unsynced(local)) continue;
    const dUnits = local.units - (local.syncedUnits ?? 0);
    const dMinutes = local.minutes - (local.syncedMinutes ?? 0);
    const { data, error } = await supabase
      .from('activity')
      .select('units, minutes')
      .eq('user_id', uid)
      .eq('day', local.day)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const units = Math.max(0, (data?.units ?? 0) + dUnits);
    const minutes = Math.max(0, (data?.minutes ?? 0) + dMinutes);
    const up = await supabase
      .from('activity')
      .upsert({ user_id: uid, day: local.day, units, minutes, updated_at: now }, { onConflict: 'user_id,day' });
    if (up.error) throw new Error(up.error.message);
    // Пока шёл запрос, могли досмотреть ещё серию: сохраняем и её как неотправленный прирост.
    await db.transaction('rw', db.activity, async () => {
      const cur = (await db.activity.get(local.day)) ?? local;
      const extraU = cur.units - local.units;
      const extraM = cur.minutes - local.minutes;
      await db.activity.put({
        ...cur,
        units: units + extraU,
        minutes: minutes + extraM,
        syncedUnits: units,
        syncedMinutes: minutes,
      });
    });
  }

  // Убираем только то, что отправили; новые правки, появившиеся во время запроса, остаются.
  const newer = await db.outbox.toArray();
  for (const p of pending) {
    const n = newer.find((x) => x.key === p.key);
    if (!n || n.ts <= p.ts) await db.outbox.delete(p.key);
  }
}

function sinceFor(mark: string): string {
  if (!mark) return '1970-01-01T00:00:00Z';
  return new Date(Date.parse(mark) - OVERLAP_MS).toISOString();
}

async function pull(uid: string, myEpoch: number): Promise<void> {
  if (!supabase) return;
  const libMark = getLS(LIB_MARK + uid);
  // Старые версии хранили одну метку на обе таблицы.
  const actMark = getLS(ACT_MARK + uid) || libMark;

  const rows: LibraryRow[] = [];
  let since = sinceFor(libMark);
  for (;;) {
    const { data, error } = await supabase
      .from('library')
      .select('*')
      .eq('user_id', uid)
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .limit(PAGE);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as LibraryRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
    since = page[page.length - 1].updated_at;
  }

  const days: ActivityRow[] = [];
  since = sinceFor(actMark);
  for (;;) {
    const { data, error } = await supabase
      .from('activity')
      .select('*')
      .eq('user_id', uid)
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .limit(PAGE);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as ActivityRow[];
    days.push(...page);
    if (page.length < PAGE) break;
    since = page[page.length - 1].updated_at;
  }

  if (myEpoch !== epoch) return;
  const pendingKeys = new Set((await db.outbox.toArray()).map((o) => o.key));
  let newLibMark = libMark;
  let newActMark = actMark;

  await db.transaction('rw', db.items, db.activity, async () => {
    for (const row of rows) {
      if (row.updated_at > newLibMark) newLibMark = row.updated_at;
      // Есть неотправленная локальная правка (в том числе удаление) — она уйдёт следующей отправкой.
      if (pendingKeys.has(row.key)) continue;
      const remoteTs = remoteEditTs(row);
      const local = await db.items.get(row.key);
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
    }
    for (const d of days) {
      if (d.updated_at > newActMark) newActMark = d.updated_at;
      const local = await db.activity.get(d.day);
      // Серверный итог + свой неотправленный прирост.
      const dUnits = local ? local.units - (local.syncedUnits ?? 0) : 0;
      const dMinutes = local ? local.minutes - (local.syncedMinutes ?? 0) : 0;
      await db.activity.put({
        day: d.day,
        units: Math.max(0, d.units + dUnits),
        minutes: Math.max(0, d.minutes + dMinutes),
        updatedAt: Date.parse(d.updated_at),
        syncedUnits: d.units,
        syncedMinutes: d.minutes,
      });
    }
  });

  if (myEpoch !== epoch) return;
  setLS(LIB_MARK + uid, newLibMark || new Date(0).toISOString());
  if (newActMark) setLS(ACT_MARK + uid, newActMark);
}

async function clearLocal(): Promise<void> {
  await db.transaction('rw', db.items, db.outbox, db.activity, async () => {
    await db.items.clear();
    await db.outbox.clear();
    await db.activity.clear();
  });
  setLS(OWNER, null);
}

/**
 * Выход: сначала дослать неотправленное, потом выйти на сервере и только после успеха
 * очистить локальную копию (данные остаются в аккаунте).
 */
export async function signOutAndClear(uid: string, signOut: () => Promise<void>): Promise<void> {
  await syncNow();
  if ((await db.outbox.count()) > 0) {
    throw new Error('Не все изменения отправлены. Проверьте интернет и попробуйте ещё раз.');
  }
  await signOut();
  epoch += 1;
  await clearLocal();
  setLS(LIB_MARK + uid, null);
  setLS(ACT_MARK + uid, null);
  setState({ status: 'idle', lastSync: null, error: null });
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
