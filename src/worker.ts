import app from '@cloud/index';
import type { Env } from '@cloud/env';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
