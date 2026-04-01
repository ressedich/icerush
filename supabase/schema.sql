-- Ice Rush: profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'Игрок',
  elo int not null default 0,
  stars int not null default 0,
  matches int not null default 0,
  wins int not null default 0,
  owned_skins jsonb not null default '["default"]'::jsonb,
  equipped_skin text not null default 'default',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_elo_idx on public.profiles (elo desc);

-- auto-updated timestamp
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

