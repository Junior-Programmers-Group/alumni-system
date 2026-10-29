# NDDU Alumni Management System

React, Express, and Supabase application for alumni profiles, verification,
community content, opportunities, events, gallery submissions, chat, and
role-scoped administration.

## Local development

1. Copy `client/.env.example` to `client/.env.local` and `server/.env.example`
   to `server/.env`.
2. Apply `supabase/schema.sql` in the Supabase SQL editor.
3. Run `npm install`, followed by `npm run dev`.
4. Open `http://localhost:5173`; administration is at `/admin`.

Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client or commit environment
files. Run `npm --workspace server test`, `npm --workspace client run build`,
and `npm audit --omit=dev` before deployment.

Production and recovery procedures are documented in `OPERATIONS.md`.

## Docker deployment

The root `Dockerfile` builds the React/Vite frontend and runs it with the
Express API in one production container. Supabase remains an external service;
initialize its schema before starting the app.

### 1. Configure environment

Copy `.env.example` to `.env` and fill in your Supabase project values:

```sh
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env`. The server requires
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`. The two `VITE_SUPABASE_*` variables are public
frontend build settings and should match the corresponding server values.
`VITE_TURNSTILE_SITE_KEY` is only needed when Turnstile is configured. Never
put the Supabase service-role key in a `VITE_` variable or expose it to the
browser.

To share deployment settings with the person configuring the domain, provide
the template below with the public values filled in. Keep the service-role key
private and enter its actual value directly in the hosting provider's server
secret settings:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
# Set privately in the hosting provider; do not send or commit this value.
SUPABASE_SERVICE_ROLE_KEY=

VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
VITE_TURNSTILE_SITE_KEY=

CLIENT_ORIGIN=https://YOUR_DOMAIN
PORT=4000
SUPABASE_QUERY_TIMEOUT_MS=5000
GIPHY_API_KEY=
PUBLIC_API_RATE_LIMIT_PER_MINUTE=3000
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
RATE_LIMIT_KEY_PREFIX=
```

Replace `YOUR_DOMAIN` with the public site origin, for example
`https://alumni.example.edu`. Leave optional integrations blank if unused.

Vite embeds `VITE_*` settings into the static frontend at image build time.
Provide them when building the image, not just when starting the container.
The other settings, including the server-only service-role key, are read when
the container starts.

### 2. Build the image

```sh
docker build --build-arg VITE_SUPABASE_URL="YOUR_SUPABASE_URL" --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="YOUR_PUBLISHABLE_KEY" --build-arg VITE_TURNSTILE_SITE_KEY="YOUR_TURNSTILE_SITE_KEY" -t nddu-alumni:latest .
```

Omit the Turnstile build argument if that integration is not used. The
`VITE_*` values are public browser configuration, but they become part of the
image layers; do not pass server secrets as build arguments.

### 3. Start the container

```sh
docker run --name nddu-alumni --env-file .env -p 4000:4000 nddu-alumni:latest
```

Open `http://localhost:4000`. Stop it with `docker stop nddu-alumni`; remove
the stopped container with `docker rm nddu-alumni`.

For production, set `CLIENT_ORIGIN` to the exact public site origin (including
the scheme, such as `https://alumni.example.edu`) and provide secrets through
the hosting platform's environment/secret manager. Rebuild the image whenever
the frontend `VITE_*` values change. Apply `supabase/schema.sql` to the
configured Supabase project before using the application.
