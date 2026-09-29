/**
 * repo-intel HTTP module.
 *
 *   GET  /repos/:id/index-state  → IndexState (always works; degraded on missing data)
 *   POST /repos/:id/resync       → enqueues a RESYNC_JOB_KIND job (202 + job id):
 *                                  fetch latest from origin + incremental reindex.
 *
 * Job-handler registration lives here: this plugin runs once at app boot and
 * calls `RepoIntelService.registerIndexJobHandlers()` so INDEX/REFRESH jobs
 * enqueued by `repos/service.ts` (after clone / on refresh) have a handler
 * to run against. Mirrors the `RepoService.registerCloneJobHandler()` shape.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requestContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { createRepoIntelService } from './compose.js';
import type { IndexState } from './types.js';

export default async function repoIntelRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const ctx = requestContext(app.container.auth);
  // The JobQueue stores the handler closures, so this instance serves the
  // jobs; `container.repoIntel` (built by the same factory) serves other
  // modules' reads. Both are stateless over the same store.
  const service = createRepoIntelService(app.container);
  service.registerIndexJobHandlers();

  app.get(
    '/repos/:id/index-state',
    { schema: { params: IdParams } },
    async (req): Promise<IndexState> => {
      // The facade itself is tenant-agnostic; the HTTP entry checks the repo
      // belongs to the caller's workspace (404 otherwise).
      const { workspaceId } = await ctx(req);
      return service.getIndexStateInWorkspace(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/resync',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await ctx(req);
      // 202 even when enqueue fails so the UI can still poll /index-state
      // without an inline error path; the outcome lands in `repo_index_state`.
      const jobId = await service.requestResync(workspaceId, req.params.id);
      reply.code(202);
      return jobId
        ? { status: 'accepted', jobId }
        : { status: 'accepted', degraded: true, reason: 'no_handler' };
    },
  );
}
