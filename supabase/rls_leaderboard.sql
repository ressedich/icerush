-- Топ «Короли»: аноним и игроки могут читать строки для таблицы лидеров.
-- Выполни в Supabase → SQL Editor после основного rls.sql.

drop policy if exists "profiles_select_leaderboard" on public.profiles;
create policy "profiles_select_leaderboard"
on public.profiles
for select
to anon, authenticated
using (true);

-- Политики «свой профиль» и эта суммируются через OR: видны и свои данные, и чужие для рейтинга.

create index if not exists profiles_stars_elo_idx on public.profiles (stars desc, elo desc);
