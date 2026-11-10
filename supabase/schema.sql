-- Библиотека пользователей. Одна строка = одна запись (сериал или фильм) одного пользователя.
create table if not exists public.library (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  key        text        not null,            -- `${media_type}:${tmdb_id}`
  media_type text        not null check (media_type in ('tv', 'movie')),
  tmdb_id    integer     not null,
  data       jsonb       not null default '{}'::jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists library_user_updated on public.library (user_id, updated_at);

alter table public.library enable row level security;

drop policy if exists "own rows" on public.library;
create policy "own rows" on public.library
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Активность по дням: сколько серий (фильм = 1) и минут посмотрено.
create table if not exists public.activity (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  day        date        not null,
  units      integer     not null default 0,
  minutes    integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists activity_user_updated on public.activity (user_id, updated_at);

alter table public.activity enable row level security;

drop policy if exists "own activity" on public.activity;
create policy "own activity" on public.activity
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
