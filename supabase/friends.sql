-- Друзья: ники, заявки в друзья и просмотр активности друзей.
-- Выполнить один раз в Supabase: SQL Editor -> New query -> вставить весь файл -> Run.
-- Повторный запуск безопасен. Активность по умолчанию видят только принятые друзья.

-- Профиль: публичный ник (@имя). Email тут не хранится и наружу не отдаётся.
create table if not exists public.profiles (
  user_id        uuid        primary key references auth.users (id) on delete cascade,
  username       text        not null,
  share_activity boolean     not null default true,   -- показывать друзьям, что смотрю
  created_at     timestamptz not null default now()
);
-- Ник уникален без учёта регистра (храним уже в нижнем регистре, но на всякий случай).
create unique index if not exists profiles_username_key on public.profiles (lower(username));
alter table public.profiles enable row level security;

-- Заявки и дружба. Одна строка = одно направление заявки; accepted = дружат.
-- Создаётся до политики profiles ниже, которая на неё ссылается.
create table if not exists public.friendships (
  from_user  uuid        not null references auth.users (id) on delete cascade,
  to_user    uuid        not null references auth.users (id) on delete cascade,
  status     text        not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (from_user, to_user),
  check (from_user <> to_user)
);
create index if not exists friendships_to on public.friendships (to_user, status);
alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;  -- только через функции ниже

-- Видно свой профиль и профили принятых друзей (поиск чужих — через функцию ниже).
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (
  user_id = auth.uid()
  or exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.from_user = auth.uid() and f.to_user = profiles.user_id)
        or (f.to_user = auth.uid() and f.from_user = profiles.user_id))
  )
);
grant select on public.profiles to authenticated;

-- Дружат ли двое (в любом направлении).
create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((from_user = a and to_user = b) or (from_user = b and to_user = a))
  );
$$;
revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;

-- Мой профиль (ник) или null.
create or replace function public.profile_me() returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select case when p.user_id is null then null else jsonb_build_object(
    'username', p.username, 'share_activity', p.share_activity
  ) end
  from (select auth.uid() uid) me
  left join public.profiles p on p.user_id = me.uid;
$$;

-- Задать/сменить ник. Возвращает 'ok' | 'taken' | 'invalid'.
create or replace function public.profile_set_username(p_name text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare clean text := lower(trim(coalesce(p_name, '')));
begin
  if clean !~ '^[a-z0-9_]{3,20}$' then return 'invalid'; end if;
  if exists (select 1 from public.profiles where lower(username) = clean and user_id <> auth.uid()) then
    return 'taken';
  end if;
  insert into public.profiles (user_id, username) values (auth.uid(), clean)
  on conflict (user_id) do update set username = clean;
  return 'ok';
end;
$$;

-- Включить/выключить показ активности друзьям.
create or replace function public.profile_set_sharing(p_on boolean) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  update public.profiles set share_activity = coalesce(p_on, true) where user_id = auth.uid();
end;
$$;

-- Отношение между мной и другим: 'none' | 'friends' | 'out' (я отправил) | 'in' (мне отправили).
create or replace function public.rel_to(other uuid) returns text
language sql stable security definer set search_path = public, auth as $$
  select coalesce((
    select case
      when status = 'accepted' then 'friends'
      when from_user = auth.uid() then 'out'
      else 'in'
    end
    from public.friendships
    where (from_user = auth.uid() and to_user = other) or (from_user = other and to_user = auth.uid())
    limit 1
  ), 'none');
$$;
revoke all on function public.rel_to(uuid) from public, anon, authenticated;

-- Поиск людей по нику (для добавления). До 15 совпадений, кроме себя.
create or replace function public.friend_search(p_q text) returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', p.user_id, 'username', p.username, 'rel', public.rel_to(p.user_id)
  ) order by p.username), '[]'::jsonb)
  from public.profiles p
  where p.user_id <> auth.uid()
    and lower(p.username) like lower(trim(coalesce(p_q, ''))) || '%'
    and length(trim(coalesce(p_q, ''))) >= 1
  limit 15;
$$;

-- Отправить заявку по нику (если тот уже звал меня — сразу дружба). 'sent'|'friends'|'self'|'not_found'|'exists'.
create or replace function public.friend_add(p_username text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare other uuid; clean text := lower(trim(coalesce(p_username, '')));
begin
  select user_id into other from public.profiles where lower(username) = clean;
  if other is null then return 'not_found'; end if;
  if other = auth.uid() then return 'self'; end if;
  -- встречная заявка -> принимаем
  if exists (select 1 from public.friendships where from_user = other and to_user = auth.uid() and status = 'pending') then
    update public.friendships set status = 'accepted' where from_user = other and to_user = auth.uid();
    return 'friends';
  end if;
  if exists (select 1 from public.friendships
             where (from_user = auth.uid() and to_user = other) or (from_user = other and to_user = auth.uid())) then
    return 'exists';
  end if;
  insert into public.friendships (from_user, to_user, status) values (auth.uid(), other, 'pending');
  return 'sent';
end;
$$;

-- Ответить на входящую заявку.
create or replace function public.friend_respond(p_from uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if p_accept then
    update public.friendships set status = 'accepted' where from_user = p_from and to_user = auth.uid() and status = 'pending';
  else
    delete from public.friendships where from_user = p_from and to_user = auth.uid() and status = 'pending';
  end if;
end;
$$;

-- Убрать из друзей или отменить свою заявку.
create or replace function public.friend_remove(p_other uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  delete from public.friendships
  where (from_user = auth.uid() and to_user = p_other) or (from_user = p_other and to_user = auth.uid());
end;
$$;

-- Входящие заявки (кто хочет добавить меня).
create or replace function public.friend_requests() returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', f.from_user, 'username', p.username, 'created_at', f.created_at
  ) order by f.created_at desc), '[]'::jsonb)
  from public.friendships f
  join public.profiles p on p.user_id = f.from_user
  where f.to_user = auth.uid() and f.status = 'pending';
$$;

-- Список друзей с краткой статистикой.
create or replace function public.friend_list() returns jsonb
language sql stable security definer set search_path = public, auth as $$
  with fr as (
    select case when from_user = auth.uid() then to_user else from_user end as uid
    from public.friendships
    where status = 'accepted' and (from_user = auth.uid() or to_user = auth.uid())
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', p.user_id,
    'username', p.username,
    'shares', p.share_activity,
    'titles', (select count(*) from public.library l where l.user_id = p.user_id and not l.deleted),
    'watching', (select count(*) from public.library l where l.user_id = p.user_id and not l.deleted and l.data->>'status' = 'watching'),
    'last_seen', greatest(
      (select max(l.updated_at) from public.library l where l.user_id = p.user_id),
      (select max(a.day)::timestamptz from public.activity a where a.user_id = p.user_id)
    )
  ) order by p.username) , '[]'::jsonb)
  from fr join public.profiles p on p.user_id = fr.uid;
$$;

-- Лента друзей: последние изменения в их библиотеках (у кого показ включён).
create or replace function public.friend_feed(p_limit integer default 60) returns jsonb
language sql stable security definer set search_path = public, auth as $$
  with fr as (
    select case when from_user = auth.uid() then to_user else from_user end as uid
    from public.friendships
    where status = 'accepted' and (from_user = auth.uid() or to_user = auth.uid())
  )
  select coalesce(jsonb_agg(x order by t desc), '[]'::jsonb) from (
    select l.updated_at as t, jsonb_build_object(
      'user_id', l.user_id,
      'username', p.username,
      'media_type', l.media_type,
      'tmdb_id', l.tmdb_id,
      'title', l.data->>'title',
      'poster', l.data->>'posterPath',
      'status', l.data->>'status',
      'rating', l.data->'userRating',
      'favorite', l.data->'isFavorite',
      'updated_at', l.updated_at
    ) as x
    from public.library l
    join public.profiles p on p.user_id = l.user_id
    where l.user_id in (select uid from fr) and p.share_activity and not l.deleted
    order by l.updated_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 200)
  ) s;
$$;

-- Профиль друга: его библиотека (только если он друг и показ включён).
create or replace function public.friend_profile(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb;
begin
  if not public.are_friends(auth.uid(), p_user) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where user_id = p_user and share_activity) then
    return jsonb_build_object('hidden', true);
  end if;
  select jsonb_build_object(
    'username', (select username from public.profiles where user_id = p_user),
    'library', (select coalesce(jsonb_agg(jsonb_build_object(
        'key', l.key, 'media_type', l.media_type, 'tmdb_id', l.tmdb_id,
        'title', l.data->>'title', 'poster', l.data->>'posterPath', 'status', l.data->>'status',
        'episodes', l.data->'episodesWatched', 'episode_count', l.data->'episodeCount',
        'rating', l.data->'userRating', 'favorite', l.data->'isFavorite', 'updated_at', l.updated_at
      ) order by l.updated_at desc), '[]'::jsonb)
      from public.library l where l.user_id = p_user and not l.deleted)
  ) into r;
  return r;
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'profile_me()', 'profile_set_username(text)', 'profile_set_sharing(boolean)',
    'friend_search(text)', 'friend_add(text)', 'friend_respond(uuid, boolean)',
    'friend_remove(uuid)', 'friend_requests()', 'friend_list()', 'friend_feed(integer)', 'friend_profile(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon;', fn);
    execute format('grant execute on function public.%s to authenticated;', fn);
  end loop;
end $$;
