import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrMeta, PrDetail, PrReviewComment } from '@devdigest/shared';
import { PrCommentInput } from '@devdigest/shared';
import { requestContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { createPullService } from './compose.js';

/**
 * F1 — pulls module. PR import via the GitHub port (list + per-PR detail).
 *   GET  /repos/:id/pulls    → list PRs for a repo (open + recently merged/closed,
 *                              synced from GitHub, persisted). `status` is the
 *                              derived review status for open PRs.
 *   GET  /pulls/:id          → full PR detail (diff/files, commits, body, linked issue)
 *   GET  /pulls/:id/comments → inline review comments (live from GitHub)
 *   POST /pulls/:id/comments → post one inline review comment to GitHub
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const ctx = requestContext(app.container.auth);
  const service = createPullService(app.container, app.log);

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await ctx(req);
    return service.listForRepo(workspaceId, req.params.id);
  });

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
    const { workspaceId } = await ctx(req);
    return service.detail(workspaceId, req.params.id);
  });

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams } },
    async (req): Promise<PrReviewComment[]> => {
      const { workspaceId } = await ctx(req);
      return service.listComments(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req): Promise<PrReviewComment> => {
      const { workspaceId } = await ctx(req);
      return service.createComment(workspaceId, req.params.id, req.body);
    },
  );
}
