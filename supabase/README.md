## Supabase setup (Email OTP accounts)

### 1) Create project
- Create a Supabase project.
- In **Authentication → Providers → Email** enable Email login with OTP.

### 2) Get keys
You need:
- `SUPABASE_URL` (Project URL)
- `SUPABASE_ANON_KEY` (anon public key)

### 3) Create DB schema
Run SQL in Supabase SQL Editor:
- `supabase/schema.sql`
- `supabase/rls.sql`

### 4) (Optional) SMTP
To improve email deliverability, configure SMTP in Supabase Auth settings.

### 5) Backend (Render WS) env vars
For the WS server to verify tokens and write results to DB, set env vars on Render:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never put in frontend)

