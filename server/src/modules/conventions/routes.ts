import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ConventionSkillDraftRequest,
  CreateConventionsSkillRequest,
  UpdateConventionRequest,
} from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { requestContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { createConventionsService } from './compose.js';

/**
 * conventions module (Skills Lab → Conventions). Transport only.
 *   GET    /repos/:id/conventions          → last scan + pending/accepted rules
 *   POST   /repos/:id/conventions/extract  → sample → propose → verify (synchronous)
 *   POST   /repos/:id/conventions/skill-draft → merged, editable skill draft (persists nothing)
 *   POST   /repos/:id/conventions/skill   → create/version the skill + link agents (201 / 200)
 *   PATCH  /conventions/:id                → accept / reject / inline edit
 */

/** The extract call spends LLM money — far tighter than the global 120/min. */
const EXTRACT_RATE_LIMIT = { max: 5, timeWindow: '1 minute' };

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const ctx = requestContext(app.container.auth);
  const service = createConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await ctx(req);
    return service.list(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams }, config: { rateLimit: EXTRACT_RATE_LIMIT } },
    async (req) => {
      const { workspaceId } = await ctx(req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/conventions/skill-draft',
    { schema: { params: IdParams, body: ConventionSkillDraftRequest } },
    async (req) => {
      const { workspaceId } = await ctx(req);
      return service.skillDraft(workspaceId, req.params.id, req.body.convention_ids);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateConventionsSkillRequest } },
    async (req, reply) => {
      const { workspaceId } = await ctx(req);
      const result = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(result.created ? 201 : 200);
      return result;
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionRequest } },
    async (req) => {
      const { workspaceId } = await ctx(req);
      const convention = await service.update(workspaceId, req.params.id, req.body);
      if (!convention) throw new NotFoundError('Convention not found');
      return convention;
    },
  );
}
