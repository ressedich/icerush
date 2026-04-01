# Supabase (Ice Rush)

## 1. Проект

Создай проект на [supabase.com](https://supabase.com). В **Settings → API** возьми:

- **Project URL** → `window.__ICE_RUSH_SUPABASE_URL` в `index.html`
- **anon public** key → `window.__ICE_RUSH_SUPABASE_ANON_KEY` в `index.html`

## 2. Таблица и RLS

В **SQL Editor** по очереди выполни:

1. `supabase/schema.sql`
2. `supabase/rls.sql`

## 3. Вход по email

В текущей версии игры вход **только через Google**. Провайдер **Email** в Supabase можно оставить выключенным.

## 4. Вход через Google

1. **Authentication → Providers → Google** — включи, вставь **Client ID** и **Secret** из [Google Cloud Console](https://console.cloud.google.com/) (OAuth client type **Web**).
2. В Google Console в **Authorized redirect URIs** добавь ровно то, что показывает Supabase (вида  
   `https://XXXX.supabase.co/auth/v1/callback`).
3. В Supabase: **Authentication → URL Configuration** → в **Redirect URLs** добавь URL(ы), где открывается игра, например:
   - `https://твой-сайт.netlify.app`
   - `https://твой-сайт.netlify.app/`
   - для локалки: `http://localhost:8080` (и порт, если другой)

После этого кнопка **«Войти через Google»** в игре откроет окно Google и вернёт на твою страницу с сессией.

## 5. Сервер WebSocket (Render)

Переменные окружения:

- `SUPABASE_URL` — тот же Project URL
- `SUPABASE_SERVICE_ROLE_KEY` — **service_role** из Settings → API (**только на сервер**, не в фронт)

Удали, если остались: `DATABASE_URL`, `JWT_SECRET`, `RESEND_*`, `GOOGLE_*` от старого стека, `OAUTH_FRONTEND_URL`.

## 6. Neon

Отдельная база Neon для этой версии **не нужна** — всё в Postgres внутри Supabase.
