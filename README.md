# VENT — The AI Shrine

A daily survival OS for the human psyche. Nigerian in root, world in reach.

> There is no cure for the human mind. So we chase perfection forever.

## Stack

| Layer    | Choice                               |
| -------- | ------------------------------------ |
| Frontend | Next.js 14 (App Router) + TypeScript |
| Styling  | Tailwind — 4 colors, no exceptions   |
| DB       | Supabase (Postgres) with RLS on      |
| Auth     | Supabase Auth (email + password)     |
| AI       | Anthropic API                        |
| Payments | Paystack                             |
| Hosting  | Vercel, auto-deploy from `main`      |

## Design system — Brutalist Trust

Exactly four colors exist. The Tailwind palette is **wiped and replaced**, so an
off-palette color is a build-time impossibility rather than a code-review
question.

| Token   | Hex       | Use                                                   |
| ------- | --------- | ----------------------------------------------------- |
| `ink`   | `#000000` | Background, text, totem                               |
| `paper` | `#FFFFFF` | Cards, surfaces                                       |
| `ash`   | `#AAAAAA` | Borders, secondary text, disabled                     |
| `gold`  | `#FFD700` | **Reserved.** Surgical question, totem eye, seal only |

Inter for body, Playfair Display for `h1`. No gradients, no glow, no blur —
depth is a hard offset block. Mobile-first, verified at 360px.

## Local development

```bash
npm ci
cp .env.example .env.local     # fill in keys
npm run dev -- -p 3001         # http://localhost:3001
```

The app builds and boots with **no** environment variables. Missing keys
degrade to a visible "not configured" state instead of a 500 — so the shell can
deploy before any accounts exist.

## Database

Apply `supabase/migrations/0001_init.sql` in the Supabase SQL editor.

Every table has RLS enabled and no policy grants cross-user access — a user can
only ever reach rows where `user_id = auth.uid()`. `handle_new_user()` seeds a
profile and subscription row on signup.

Regenerate types after schema changes:

```bash
npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts
```

## Deploy

Vercel auto-deploys on push. Required environment variables (Production +
Preview) are listed in `.env.example`. Set Supabase Auth → URL Configuration →
Redirect URLs to `https://<your-domain>/auth/callback`.

## Health check

`GET /api/health` reports which integrations are wired and whether the database
actually answers. Returns 503 when Supabase is configured but unreachable.
