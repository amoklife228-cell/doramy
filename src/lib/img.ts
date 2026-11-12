/**
 * Адреса картинок TMDB.
 *
 * Сервер картинок TMDB (image.tmdb.org, сеть BunnyCDN) у части провайдеров бывает недоступен:
 * соединение не устанавливается и висит, постеры не появляются, приложение кажется зависшим.
 * Поэтому при запуске проверяем его маленьким запросом. Если ответа нет за PROBE_MS, те же
 * картинки берём через открытый прокси wsrv.nl: он сам забирает их у TMDB и отдаёт в WebP.
 * Через прокси идут только публичные адреса картинок, никаких данных пользователя.
 */

const DIRECT = 'https://image.tmdb.org/t/p/';
const PROXY = 'https://wsrv.nl/?url=image.tmdb.org/t/p/';
const STORAGE = 'doramy.imgMode';
const PROBE_MS = 4000;
const REPROBE_MS = 10 * 60 * 1000;

export type ImageMode = 'direct' | 'proxy';

function loadMode(): ImageMode {
  try {
    return localStorage.getItem(STORAGE) === 'proxy' ? 'proxy' : 'direct';
  } catch {
    return 'direct';
  }
}

function saveMode(m: ImageMode) {
  try {
    localStorage.setItem(STORAGE, m);
  } catch {
    // приватный режим — проверим заново в следующий раз
  }
}

let mode: ImageMode = loadMode();
const listeners = new Set<() => void>();

export function imageMode(): ImageMode {
  return mode;
}

export function subscribeImageMode(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Картинка TMDB нужного размера: w92…w1280, h632, original. path начинается с «/». */
export function tmdbImg(size: string, path: string): string {
  return mode === 'proxy' ? `${PROXY}${size}${path}&output=webp` : `${DIRECT}${size}${path}`;
}

/**
 * Отвечает ли image.tmdb.org. Любой HTTP-ответ (даже 404) — сервер доступен; ошибка сети
 * или тишина дольше PROBE_MS — нет. Параметр probe не даёт service worker ответить из кэша.
 */
async function directReachable(): Promise<'ok' | 'timeout' | 'error'> {
  const c = new AbortController();
  const t = window.setTimeout(() => c.abort(), PROBE_MS);
  try {
    await fetch(`${DIRECT}w92/wwemzKWzjKYJFfCeiB57q3r4Bcm.png?probe=${Date.now()}`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: c.signal,
    });
    return 'ok';
  } catch {
    return c.signal.aborted ? 'timeout' : 'error';
  } finally {
    window.clearTimeout(t);
  }
}

let lastProbe = 0;
let probing = false;

async function probe() {
  if (probing || !navigator.onLine) return;
  probing = true;
  lastProbe = Date.now();
  try {
    let r = await directReachable();
    // Мгновенная ошибка бывает и от случайного сбоя сети — проверяем ещё раз.
    // Тишина 4 секунды — признак именно недоступного сервера, тут повтор только задержит.
    if (r === 'error') r = await directReachable();
    const next: ImageMode = r === 'ok' ? 'direct' : 'proxy';
    if (next === mode) return;
    saveMode(next);
    // На прокси переключаемся сразу: напрямую картинки сейчас висят. Обратно — со следующего
    // запуска, чтобы не грузить всё заново, пока прокси и так работает.
    if (next === 'proxy') {
      mode = next;
      for (const l of [...listeners]) l();
    }
  } finally {
    probing = false;
  }
}

/** Проверка при запуске и при возвращении в приложение (сеть могла смениться: Wi-Fi ↔ мобильная). */
export function installImageProbe(): void {
  if (typeof window === 'undefined') return;
  void probe();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastProbe > REPROBE_MS) void probe();
  });
  window.addEventListener('online', () => void probe());
}
