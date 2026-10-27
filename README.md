# Claude Code Cloud

Web app: sign in with Pollinations, get a cloud dev environment running Claude Code inside an E2B sandbox, pay only for sandbox runtime and model usage through your own Pollen balance.

## Stack
- Next.js (App Router) on Vercel
- Supabase (Postgres) for conversation history only
- E2B via Pollinations proxy
- Pollinations for OAuth (BYOP), model calls, billing

## Env vars
See `.env.example`.

- `POLLINATIONS_CLIENT_ID` (pk_ key)
- `POLLINATIONS_REDIRECT_URI`
- `KEY_ENCRYPTION_SECRET` (>=32 chars)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `E2B_API_URL` (default https://gen.pollinations.ai/alpha/e2b)
- `E2B_SANDBOX_URL` (default https://gen.pollinations.ai/alpha/e2b/sandbox)
- `E2B_TEMPLATE_ID`
- `NEXT_PUBLIC_APP_URL`
- `NODE_ENV`

## Scripts
- `npm run dev` - dev server
- `npm run build` - production build
- `npm test` - vitest

## Supabase
Migrations in `supabase/migrations`. Apply with `supabase db push` after linking project.

## E2B template
See `e2b-template/`.
