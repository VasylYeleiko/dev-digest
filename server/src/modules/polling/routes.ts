import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requestContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { createPollingService } from './compose.js';

/**
 * F1 — polling module. MANUAL refresh that ONLY syncs the PR list.
 *
 *   POST /repos/:id/poll  → sync PR list from GitHub, bump last_polled_at
 */
export default async function pollingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const ctx = requestContext(app.container.auth);
  const service = createPollingService(app.container);

  app.post('/repos/:id/poll', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await ctx(req);
    return service.poll(workspaceId, req.params.id);
  });
}
