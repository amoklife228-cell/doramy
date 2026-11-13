/**
 * Анонимный учёт заходов для админ-панели.
 *
 * Устройство получает случайный id (localStorage), приложение копит число открытий и действий
 * (добавил в библиотеку, отметил серию) и раз в несколько секунд отправляет их на сервер функцией
 * track_visit (supabase/admin.sql). Ни названий, ни email сюда не попадает; если человек вошёл
 * в аккаунт, сервер сам привяжет заход к его аккаунту по токену.
 *
 * Запрос идёт обычным fetch, без библиотеки Supabase: она тяжёлая и грузится только при входе.
 */

const URL_BASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const KEY = (import.meta.env.VITE_SUPABASE_KEY as string | undefined)?.trim() ?? '';

const DEVICE = 'doramy.deviceId';
const PENDING = 'doramy.track.pending';
const LAST_OPEN = 'doramy.track.lastOpen';
/** Возврат в приложение после такой паузы считается новым открытием. */
const NEW_OPEN_AFTER = 30 * 60 * 1000;

type Pending = { opens: number; actions: number };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // приватный режим — просто не считаем
  }
}

function deviceId(): string {
  let id = read<string | null>(DEVICE, null);
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    id =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 3) | 8).toString(16);
          });
    write(DEVICE, id);
  }
  return id;
}

function platform(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Другое';
}

function standalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Токен вошедшего пользователя из сохранённой сессии Supabase, если он ещё действует. */
function accessToken(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^sb-.+-auth-token$/.test(k)) continue;
      const s = JSON.parse(localStorage.getItem(k) ?? 'null') as { access_token?: string; expires_at?: number } | null;
      if (s?.access_token && (s.expires_at ?? 0) * 1000 > Date.now() + 60_000) return s.access_token;
    }
  } catch {
    // ignore
  }
  return null;
}

function add(patch: Partial<Pending>) {
  const p = read<Pending>(PENDING, { opens: 0, actions: 0 });
  write(PENDING, { opens: p.opens + (patch.opens ?? 0), actions: p.actions + (patch.actions ?? 0) });
}

let timer: number | undefined;
let sending = false;

async function flush(keepalive = false) {
  window.clearTimeout(timer);
  timer = undefined;
  if (sending || !navigator.onLine) return;
  const p = read<Pending>(PENDING, { opens: 0, actions: 0 });
  if (p.opens <= 0 && p.actions <= 0) return;
  // Забираем накопленное сразу: если запрос не пройдёт, вернём обратно.
  const batch = { opens: Math.min(p.opens, 100), actions: Math.min(p.actions, 1000) };
  write(PENDING, { opens: p.opens - batch.opens, actions: p.actions - batch.actions });
  sending = true;
  try {
    const res = await fetch(`${URL_BASE}/rest/v1/rpc/track_visit`, {
      method: 'POST',
      keepalive,
      headers: {
        'Content-Type': 'application/json',
        apikey: KEY,
        Authorization: `Bearer ${accessToken() ?? KEY}`,
      },
      body: JSON.stringify({
        p_device: deviceId(),
        p_opens: batch.opens,
        p_actions: batch.actions,
        p_platform: platform(),
        p_standalone: standalone(),
      }),
    });
    // 404 — на сервере ещё не выполнен admin.sql: копить бессмысленно, сбрасываем.
    if (!res.ok && res.status !== 404) add(batch);
  } catch {
    add(batch);
  } finally {
    sending = false;
  }
}

function schedule(ms: number) {
  if (timer === undefined) timer = window.setTimeout(() => void flush(), ms);
}

function noteOpen() {
  const last = read<number>(LAST_OPEN, 0);
  write(LAST_OPEN, Date.now());
  if (Date.now() - last < NEW_OPEN_AFTER) return;
  add({ opens: 1 });
}

/** Человек что-то сделал: добавил в библиотеку, отметил серию, поменял статус. */
export function noteAction() {
  if (!URL_BASE || !KEY) return;
  add({ actions: 1 });
  schedule(20_000);
}

export function installTracking() {
  if (!URL_BASE || !KEY || typeof window === 'undefined') return;
  noteOpen();
  // Через несколько секунд после запуска, чтобы не мешать первой загрузке.
  schedule(4000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      noteOpen();
      schedule(2000);
    } else {
      write(LAST_OPEN, Date.now());
      void flush(true);
    }
  });
}
