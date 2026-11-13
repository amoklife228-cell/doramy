/**
 * Push-уведомления (о новых сериях и напоминания вернуться).
 *
 * На устройстве: спрашиваем разрешение, подписываемся через service worker и сохраняем подписку в
 * Supabase (таблица push_subscriptions, см. supabase/push.sql). Саму отправку делает по расписанию
 * GitHub Actions (scripts/send-push.mjs) — браузер, когда приложение закрыто, уведомление не шлёт.
 *
 * Работает только у вошедших в аккаунт: без него сервер не знает, что человек смотрит. На iPhone —
 * только если приложение добавлено на экран «Домой» (Safari из вкладки push не поддерживает).
 */
import { useEffect, useState } from 'react';
import { getSupabase } from './supabase';

const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC as string | undefined)?.trim() ?? '';

export interface PushPrefs {
  episodes: boolean;
  reminders: boolean;
}

export const DEFAULT_PREFS: PushPrefs = { episodes: true, reminders: true };

export interface NotifyState {
  /** Поддерживает ли устройство web-push вообще. */
  supported: boolean;
  /** iOS из вкладки Safari (не с экрана «Домой») push не умеет. */
  needsInstall: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  prefs: PushPrefs;
  busy: boolean;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!VAPID_PUBLIC
  );
}

function urlB64ToUint8(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function savePrefsFor(sub: PushSubscription, prefs: PushPrefs): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Нет соединения с сервером.');
  const json = sub.toJSON();
  const keys = json.keys ?? {};
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: json.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      episodes: prefs.episodes,
      reminders: prefs.reminders,
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw new Error(error.message);
}

/** Включить уведомления: разрешение + подписка + запись на сервер. */
export async function enablePush(prefs: PushPrefs = DEFAULT_PREFS): Promise<void> {
  if (!pushSupported()) throw new Error('Устройство не поддерживает уведомления.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Разрешение на уведомления не выдано.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8(VAPID_PUBLIC) as BufferSource,
    });
  }
  await savePrefsFor(sub, prefs);
}

/** Выключить: убрать подписку с устройства и с сервера. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {
    // всё равно уберём с сервера
  }
  const supabase = await getSupabase();
  if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

/** Поменять, что именно присылать, не переспрашивая разрешение. */
export async function updatePrefs(prefs: PushPrefs): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) throw new Error('Уведомления выключены.');
  await savePrefsFor(sub, prefs);
}

async function readState(loggedIn: boolean): Promise<NotifyState> {
  const supported = pushSupported();
  const base: NotifyState = {
    supported,
    needsInstall: isIos() && !isStandalone(),
    permission: supported ? Notification.permission : 'denied',
    subscribed: false,
    prefs: DEFAULT_PREFS,
    busy: false,
  };
  if (!supported) return base;
  const sub = await currentSubscription();
  base.subscribed = !!sub && Notification.permission === 'granted';
  if (sub && loggedIn) {
    try {
      const supabase = await getSupabase();
      const { data } = (await supabase?.from('push_subscriptions').select('episodes, reminders').eq('endpoint', sub.endpoint).maybeSingle()) ?? {};
      if (data) base.prefs = { episodes: data.episodes, reminders: data.reminders };
    } catch {
      // оставим значения по умолчанию
    }
  }
  return base;
}

/** Состояние уведомлений для экрана настроек. `loggedIn` — есть ли аккаунт (иначе push недоступен). */
export function useNotifyState(loggedIn: boolean): {
  state: NotifyState;
  reload: () => void;
  run: (fn: () => Promise<void>) => Promise<void>;
} {
  const [state, setState] = useState<NotifyState>(() => ({
    supported: pushSupported(),
    needsInstall: pushSupported() && isIos() && !isStandalone(),
    permission: pushSupported() ? Notification.permission : 'denied',
    subscribed: false,
    prefs: DEFAULT_PREFS,
    busy: true,
  }));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    readState(loggedIn).then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [loggedIn, tick]);

  const run = async (fn: () => Promise<void>) => {
    setState((s) => ({ ...s, busy: true }));
    try {
      await fn();
    } finally {
      setTick((t) => t + 1);
    }
  };

  return { state, reload: () => setTick((t) => t + 1), run };
}
