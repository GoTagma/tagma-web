export type Env = {
  ASSETS: Fetcher;
  PUBLIC_SITE_URL: string;
  // Enable these once bindings are created in wrangler.jsonc:
  // DB: D1Database;
  // SESSIONS: KVNamespace;
  // AUTH_SECRET: string;
  // STRIPE_SECRET_KEY: string;
  // STRIPE_WEBHOOK_SECRET: string;
};
