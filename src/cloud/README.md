# @tagma/cloud

Private backend code for `tagma-web`. Lives at `tagma-web/src/cloud/` as a
regular directory in the `tagma-web` repo, and participates in dependency
resolution as a bun workspace member (`@tagma/cloud`). It is bundled into the
`tagma-web` Cloudflare Worker and deployed together with the site.

## Directory layout

```
src/cloud/
├── src/
│   ├── index.ts        # Hono app, basePath('/api')
│   └── env.ts          # Env bindings type for the Worker
├── migrations/         # D1 schema migrations (add after creating D1)
├── package.json        # @tagma/cloud
├── tsconfig.json
└── README.md
```

## Runtime architecture

```
Browser
  │
  ├── /api/*  ──► tagma-web Worker ──► src/worker.ts ──► @cloud/index (Hono)
  │                                        │
  │                                        └── D1 / KV / secrets bindings
  └── other   ──► tagma-web Worker ──► ASSETS binding (./dist static assets)
```

Production is a **single Worker** (`tagma-web`). Local dev runs **Astro dev
server on :4321** plus **wrangler dev on :8787**, with Astro's vite proxy
forwarding `/api/*` to wrangler. From the browser's perspective it looks
same-origin as production, so cookie/CORS behavior matches.

## Local development

From the `tagma-web` repo root:

```bash
git clone https://github.com/GoTagma/tagma-web.git
cd tagma-web
bun install            # installs @tagma/cloud deps too (workspace)

bun run dev            # concurrently starts astro(:4321) + wrangler(:8787)
```

Smoke test: open `http://localhost:4321/api/health` in the browser, it should
return `{"ok":true,"service":"tagma-cloud",...}`.

---

## ⚠️ Onboarding checklist (do in order)

The scaffold only implements `/api/health`. Before login/payments can actually
run, everything below **must** be done. Each item lists the exact commands,
which files to edit, and what info you need to provide.

### Phase 1: infrastructure (one-time)

- [ ] **Log in to Cloudflare**
  ```bash
  wrangler whoami      # if not logged in
  wrangler login
  ```

- [ ] **Create the D1 database**
  ```bash
  wrangler d1 create tagma
  ```
  Outputs a `database_id`. Copy it.

- [ ] **Create the KV namespace** (for sessions)
  ```bash
  wrangler kv namespace create SESSIONS
  ```
  Outputs an `id`. Copy it.

- [ ] **Fill the binding IDs into `tagma-web/wrangler.jsonc`**
  Uncomment the two blocks below and replace `REPLACE_ME` with the real IDs:
  ```jsonc
  "d1_databases": [
    { "binding": "DB", "database_name": "tagma", "database_id": "<id from above>" }
  ],
  "kv_namespaces": [
    { "binding": "SESSIONS", "id": "<id from above>" }
  ]
  ```

- [ ] **Mirror the bindings into `tagma-web/wrangler.dev.jsonc`**
  Add the same `d1_databases` + `kv_namespaces` blocks with the same IDs.
  `wrangler dev --local` will use miniflare to simulate them under
  `.wrangler/state/`, so production data is not touched.

- [ ] **Enable the Env type in `src/env.ts`**
  Uncomment these lines (keep them in sync with the bindings actually enabled
  in `wrangler.jsonc`):
  ```ts
  DB: D1Database;
  SESSIONS: KVNamespace;
  AUTH_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  ```

### Phase 2: secrets

- [ ] **Local**: put fake secrets into `tagma-web/.dev.vars`
  ```
  AUTH_SECRET=<openssl rand -hex 32>
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_WEBHOOK_SECRET=whsec_...
  ```

- [ ] **Production**:
  ```bash
  wrangler secret put AUTH_SECRET
  wrangler secret put STRIPE_SECRET_KEY
  wrangler secret put STRIPE_WEBHOOK_SECRET
  ```

### Phase 3: login (tech stack TBD)

- [ ] **Pick the auth solution**: recommended `better-auth` + D1 adapter
      (self-hosted, email/password + OAuth + magic link). Alternative: Clerk
      (hosted, easier but paid).
- [ ] Install the auth deps, add `src/auth/` routes, write migrations.
- [ ] Run the first migration:
  ```bash
  cd tagma-web
  bun run db:migrate:local     # apply locally
  bun run db:migrate:prod      # apply in production
  ```

### Phase 4: payments

- [ ] **Decide the payment scope**: subscription only / one-off purchase / both.
- [ ] Create the product + price in the Stripe dashboard.
- [ ] Install the `stripe` npm package, add `src/billing/checkout.ts` +
      `src/billing/webhook.ts`.
- [ ] In the Stripe dashboard, configure the webhook to point at
      `https://tagma.dev/api/billing/webhook`.
- [ ] Put the webhook signing secret into `STRIPE_WEBHOOK_SECRET` (both local
      and production).

### Phase 5: CI deployment

- [ ] In the `tagma-web` repo, add a GitHub Actions workflow:
  - `actions/checkout@v4`
  - `bun install` → `bun run build` → `wrangler deploy` (using the
    `CLOUDFLARE_API_TOKEN` secret)

---

## Conventions

- **All routes live under `/api/*`**. The Hono app uses `.basePath('/api')`,
  and `src/worker.ts` also uses that prefix to decide whether to hand the
  request to cloud.
- **Do not fetch `ASSETS` from cloud code** — that is the worker entrypoint's
  job. Cloud only handles the API.
- **The Env type is the single source of truth**: whenever you add a
  binding/secret, update the type in `src/env.ts` first, then add the binding
  in the wrangler config. Types-first is what gives Hono handlers proper type
  hints.
- **Secrets never go in the repo**: use `.dev.vars` locally (gitignored) and
  `wrangler secret put` in production. The `vars` block in `wrangler.jsonc` is
  for public config only.
