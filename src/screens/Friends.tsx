import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  addFriend,
  FriendsError,
  loadFeed,
  loadFriendProfile,
  loadFriends,
  loadMyProfile,
  loadRequests,
  removeFriend,
  respondRequest,
  searchFriends,
  setSharing,
  setUsername,
  type FeedRow,
  type FriendLibraryRow,
  type FriendProfile,
  type FriendRow,
  type MyProfile,
  type RequestRow,
  type SearchResult,
} from '../lib/friends';
import { tmdbImg } from '../lib/img';
import { timeAgo } from '../lib/news';
import { goBack, navigate, openDrama } from '../lib/router';
import { STATUSES } from '../lib/types';
import { IosSwitch } from '../components/IosList';
import { NavBar } from '../components/NavBar';
import { plural } from './Profile';
import './Admin.css';
import './Friends.css';

type Tab = 'feed' | 'people';
const STATUS_TITLE = new Map(STATUSES.map((s) => [s.id, s.title]));
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Вкладка и открытый друг переживают переход в карточку и обратно.
let keptTab: Tab = 'feed';
let keptUser: string | null = null;

export function Friends({ session }: { session: Session | null | undefined }) {
  const [phase, setPhase] = useState<'checking' | 'login' | 'not_installed' | 'username' | 'ready' | 'error'>('checking');
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [error, setError] = useState('');
  const [tab, setTabState] = useState<Tab>(keptTab);
  const [userId, setUserState] = useState<string | null>(keptUser);
  const [reloadKey, setReloadKey] = useState(0);
  const setTab = (t: Tab) => setTabState((keptTab = t));
  const setUserId = (id: string | null) => setUserState((keptUser = id));
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (userId ? setUserId(null) : goBack());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [userId]);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) return setPhase('login');
    let alive = true;
    setPhase('checking');
    loadMyProfile().then(
      (p) => {
        if (!alive) return;
        setProfile(p);
        setPhase(p ? 'ready' : 'username');
      },
      (e) => {
        if (!alive) return;
        if (e instanceof FriendsError && e.kind === 'not_installed') return setPhase('not_installed');
        setError(errText(e));
        setPhase('error');
      },
    );
    return () => {
      alive = false;
    };
  }, [session, reloadKey]);

  let body: React.ReactNode;
  if (phase === 'checking') body = <div className="adm-loading">Загрузка…</div>;
  else if (phase === 'login')
    body = (
      <div className="empty">
        <div className="empty-title">Нужен вход</div>
        <div>Друзья работают с аккаунтом. Войдите в настройках.</div>
        <button type="button" className="btn empty-action" onClick={() => navigate('/settings')}>
          Открыть настройки
        </button>
      </div>
    );
  else if (phase === 'not_installed') body = <Setup onRetry={reload} />;
  else if (phase === 'error')
    body = (
      <div className="empty">
        <div className="empty-title">Не удалось загрузить</div>
        <div>{error}</div>
        <button type="button" className="btn empty-action" onClick={reload}>
          Повторить
        </button>
      </div>
    );
  else if (phase === 'username') body = <UsernameForm onDone={reload} />;
  else if (userId) body = <FriendView id={userId} reloadKey={reloadKey} />;
  else
    body = (
      <>
        <div className="adm-seg" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'feed'} className={tab === 'feed' ? 'active' : ''} onClick={() => setTab('feed')}>
            Лента
          </button>
          <button type="button" role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>
            Друзья
          </button>
        </div>
        {tab === 'feed' ? (
          <Feed reloadKey={reloadKey} onOpen={setUserId} />
        ) : (
          <People profile={profile} reloadKey={reloadKey} onOpen={setUserId} onChanged={reload} onProfile={setProfile} />
        )}
      </>
    );

  return (
    <div className="detail" role="dialog" aria-modal="true">
      <NavBar
        backLabel={userId ? 'Друзья' : 'Назад'}
        onBack={userId ? () => setUserId(null) : goBack}
        title={userId ? 'Профиль друга' : undefined}
      />
      <div className="content detail-content ios-page adm">
        {!userId && <h1 className="ios-large-title">Друзья</h1>}
        {body}
      </div>
    </div>
  );
}

function Setup({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="adm-setup">
      <p>Друзья ещё не включены на сервере.</p>
      <ol>
        <li>
          В Supabase откройте <b>SQL Editor</b>, вставьте содержимое файла <code>supabase/friends.sql</code> и нажмите <b>Run</b>.
        </li>
        <li>Вернитесь и нажмите «Проверить снова».</li>
      </ol>
      <div className="adm-setup-actions">
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Проверить снова
        </button>
      </div>
    </div>
  );
}

function UsernameForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await setUsername(name);
      if (r === 'ok') return onDone();
      setMsg(r === 'taken' ? 'Этот ник уже занят.' : 'Ник: 3–20 символов, латиница, цифры и _.');
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="frn-username">
      <p>Придумайте себе ник — по нему вас найдут друзья. Email никому не виден.</p>
      <div className="frn-at">
        <span>@</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
          placeholder="ник"
          maxLength={20}
          onKeyDown={(e) => e.key === 'Enter' && name.length >= 3 && void submit()}
        />
      </div>
      {msg && <div className="frn-msg">{msg}</div>}
      <button type="button" className="btn btn-primary btn-wide" disabled={busy || name.length < 3} onClick={() => void submit()}>
        Сохранить
      </button>
    </div>
  );
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  useEffect(() => {
    let alive = true;
    setError(null);
    run().then(
      (d) => alive && setData(d),
      (e) => alive && setError(errText(e)),
    );
    return () => {
      alive = false;
    };
  }, [run]);
  return { data, error };
}

function Thumb({ path }: { path: string | null }) {
  return path ? <img className="adm-thumb" src={tmdbImg('w92', path)} alt="" loading="lazy" /> : <span className="adm-thumb" />;
}

function statusLine(r: { status: string | null; rating?: number | null; favorite?: boolean | null }) {
  const parts = [STATUS_TITLE.get((r.status ?? '') as never) ?? r.status ?? ''];
  if (r.rating) parts.push(`★ ${r.rating}`);
  if (r.favorite) parts.push('♥');
  return parts.filter(Boolean).join(' · ');
}

function Avatar({ name, big }: { name: string; big?: boolean }) {
  return <span className={big ? 'adm-avatar big' : 'adm-avatar'}>{name.slice(0, 1).toUpperCase()}</span>;
}

function Feed({ reloadKey, onOpen }: { reloadKey: number; onOpen: (id: string) => void }) {
  const { data, error } = useLoad(() => loadFeed(60), [reloadKey]);
  if (!data) return <div className="adm-loading">{error ? `Ошибка: ${error}` : 'Загрузка…'}</div>;
  if (data.length === 0)
    return <div className="adm-loading">Пока пусто. Добавьте друзей на вкладке «Друзья» — тут появится, что они смотрят.</div>;
  return (
    <div className="adm-list">
      {data.map((r: FeedRow, i) => (
        <div key={`${r.user_id}:${r.tmdb_id}:${i}`} className="adm-feed">
          <Thumb path={r.poster} />
          <div className="adm-feed-main">
            <button type="button" className="adm-link" onClick={() => onOpen(r.user_id)}>
              @{r.username}
            </button>
            <button type="button" className="adm-title-link" onClick={() => openDrama(r.media_type, r.tmdb_id)}>
              {r.title ?? `#${r.tmdb_id}`}
            </button>
            <span className="adm-feed-sub">{statusLine(r)}</span>
          </div>
          <span className="adm-user-seen">{timeAgo(r.updated_at)}</span>
        </div>
      ))}
    </div>
  );
}

function People({
  profile,
  reloadKey,
  onOpen,
  onChanged,
  onProfile,
}: {
  profile: MyProfile | null;
  reloadKey: number;
  onOpen: (id: string) => void;
  onChanged: () => void;
  onProfile: (p: MyProfile) => void;
}) {
  const requests = useLoad(() => loadRequests(), [reloadKey]);
  const friends = useLoad(() => loadFriends(), [reloadKey]);
  const [shares, setShares] = useState(profile?.share_activity ?? true);

  const toggleShare = async (on: boolean) => {
    setShares(on);
    try {
      await setSharing(on);
      if (profile) onProfile({ ...profile, share_activity: on });
    } catch {
      setShares(!on);
    }
  };

  return (
    <>
      <AddFriend onChanged={onChanged} />

      {(requests.data?.length ?? 0) > 0 && (
        <section className="adm-card">
          <h2 className="adm-card-title">Заявки в друзья</h2>
          <div className="adm-list flat">
            {requests.data!.map((r: RequestRow) => (
              <div key={r.user_id} className="adm-user">
                <Avatar name={r.username} />
                <span className="adm-user-main">
                  <span className="adm-user-email">@{r.username}</span>
                  <span className="adm-user-sub">хочет добавить вас</span>
                </span>
                <span className="frn-req-actions">
                  <button type="button" className="frn-accept" onClick={() => void respondRequest(r.user_id, true).then(onChanged)}>
                    Принять
                  </button>
                  <button type="button" className="frn-decline" onClick={() => void respondRequest(r.user_id, false).then(onChanged)} aria-label="Отклонить">
                    ✕
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="adm-card">
        <h2 className="adm-card-title">
          Мои друзья
          {friends.data ? <span className="adm-card-meta">{friends.data.length}</span> : null}
        </h2>
        {!friends.data && <div className="adm-loading">{friends.error ? `Ошибка: ${friends.error}` : 'Загрузка…'}</div>}
        {friends.data?.length === 0 && <div className="adm-loading">Пока никого. Найдите друзей по нику выше.</div>}
        <div className="adm-list flat">
          {friends.data?.map((f: FriendRow) => (
            <div key={f.user_id} className="adm-user">
              <button type="button" className="frn-friend-tap" onClick={() => onOpen(f.user_id)}>
                <Avatar name={f.username} />
                <span className="adm-user-main">
                  <span className="adm-user-email">@{f.username}</span>
                  <span className="adm-user-sub">
                    {f.shares ? `${f.titles} ${plural(f.titles, 'тайтл', 'тайтла', 'тайтлов')} · смотрит ${f.watching}` : 'активность скрыта'}
                  </span>
                </span>
                <span className="adm-user-seen">{f.last_seen ? timeAgo(f.last_seen) : ''}</span>
              </button>
              <button type="button" className="frn-remove" onClick={() => void removeFriend(f.user_id).then(onChanged)} aria-label="Убрать из друзей">
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="adm-card">
        <h2 className="adm-card-title">Моя страница</h2>
        <div className="frn-me">
          <Avatar name={profile?.username ?? '?'} />
          <span className="adm-user-email">@{profile?.username}</span>
        </div>
        <div className="frn-share">
          <span>
            <span className="adm-user-email">Показывать мою активность</span>
            <span className="adm-user-sub">Друзья видят, что вы смотрите и ваши оценки</span>
          </span>
          <IosSwitch label="Показывать мою активность" checked={shares} onChange={(v) => void toggleShare(v)} />
        </div>
      </section>
    </>
  );
}

function AddFriend({ onChanged }: { onChanged: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) {
      setResults([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      searchFriends(term).then(
        (r) => alive && setResults(r),
        () => alive && setResults([]),
      );
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const add = async (username: string) => {
    setMsg(null);
    try {
      const r = await addFriend(username);
      if (r === 'sent') setMsg(`Заявка отправлена @${username}.`);
      else if (r === 'friends') setMsg(`Теперь вы друзья с @${username}.`);
      else if (r === 'exists') setMsg('Заявка уже есть.');
      else setMsg('Не получилось.');
      onChanged();
      setResults((rs) => rs.map((x) => (x.username === username ? { ...x, rel: r === 'friends' ? 'friends' : 'out' } : x)));
    } catch (e) {
      setMsg(errText(e));
    }
  };

  const relLabel = (rel: string) =>
    rel === 'friends' ? 'в друзьях' : rel === 'out' ? 'заявка отправлена' : rel === 'in' ? 'ждёт ответа' : null;

  return (
    <section className="adm-card">
      <h2 className="adm-card-title">Найти друга</h2>
      <input className="adm-search" type="search" placeholder="Ник друга, например darina" value={q} onChange={(e) => setQ(e.target.value)} />
      {msg && <div className="frn-msg">{msg}</div>}
      <div className="adm-list flat">
        {results.map((r) => (
          <div key={r.user_id} className="adm-user">
            <Avatar name={r.username} />
            <span className="adm-user-main">
              <span className="adm-user-email">@{r.username}</span>
              {relLabel(r.rel) && <span className="adm-user-sub">{relLabel(r.rel)}</span>}
            </span>
            {r.rel === 'none' && (
              <button type="button" className="frn-add" onClick={() => void add(r.username)}>
                Добавить
              </button>
            )}
            {r.rel === 'in' && (
              <button type="button" className="frn-add" onClick={() => void add(r.username)}>
                Принять
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function FriendView({ id, reloadKey }: { id: string; reloadKey: number }) {
  const { data, error } = useLoad(() => loadFriendProfile(id), [id, reloadKey]);
  if (!data) return <div className="adm-loading">{error ? `Ошибка: ${error}` : 'Загрузка…'}</div>;
  const d: FriendProfile = data;
  if (d.hidden) return <div className="adm-loading">@{d.username ?? ''} скрыл(а) свою активность.</div>;
  const lib = d.library ?? [];
  const counts = new Map<string, number>();
  for (const r of lib) counts.set(r.status ?? '', (counts.get(r.status ?? '') ?? 0) + 1);
  return (
    <>
      <div className="adm-profile">
        <Avatar name={d.username ?? '?'} big />
        <div>
          <div className="adm-profile-email">@{d.username}</div>
          <div className="adm-user-sub">
            {lib.length} {plural(lib.length, 'тайтл', 'тайтла', 'тайтлов')}
          </div>
        </div>
      </div>
      <section className="adm-card">
        <h2 className="adm-card-title">
          Смотрит и посмотрел(а)
          <span className="adm-card-meta">
            {STATUSES.filter((s) => counts.get(s.id))
              .map((s) => `${s.short} ${counts.get(s.id)}`)
              .join(' · ')}
          </span>
        </h2>
        {lib.length === 0 && <div className="adm-loading">Библиотека пуста.</div>}
        <div className="adm-list flat">
          {lib.map((r: FriendLibraryRow) => (
            <button key={r.key} type="button" className="adm-feed" onClick={() => openDrama(r.media_type, r.tmdb_id)}>
              <Thumb path={r.poster} />
              <span className="adm-feed-main">
                <span className="adm-feed-title">{r.title ?? `#${r.tmdb_id}`}</span>
                <span className="adm-feed-sub">{statusLine(r)}</span>
              </span>
              <span className="adm-user-seen">{timeAgo(r.updated_at)}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
