import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CreateSkillRequest, UpdateSkillRequest } from '@devdigest/shared';
import { requestContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { createSkillsService } from './compose.js';

/** `/skills/:id/versions/:version` — id is a uuid, version a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

/**
 * `POST /skills/import` body — client base64-encodes the file (avoids a
 * multipart plugin). Not a shared contract: it's this route's own request
 * shape, distinct from the `SkillImportPreview` it returns.
 */
const ImportSkillBody = z.object({
  filename: z.string().min(1),
  content_base64: z.string().min(1),
});

/**
 * skills module.
 *   GET    /skills                → list (workspace-scoped)
 *   GET    /skills/:id            → one skill
 *   POST   /skills                → create
 *   PUT    /skills/:id            → update; a body change bumps the version
 *   DELETE /skills/:id            → delete
 *   GET    /skills/:id/versions   → body-version history (newest first)
 *   GET    /skills/:id/versions/:version → one body snapshot
 *   GET    /skills/:id/stats      → Stats-tab data
 *   POST   /skills/import         → parse `.md`/`.zip` → preview; persists nothing
 */
export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const ctx = requestContext(app.container.auth);
  const service = createSkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await ctx(req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await ctx(req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillRequest } }, async (req, reply) => {
    const { workspaceId } = await ctx(req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillRequest } },
    async (req) => {
      const { workspaceId } = await ctx(req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await ctx(req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await ctx(req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.get(
    '/skills/:id/versions/:version',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await ctx(req);
      const version = await service.getVersion(workspaceId, req.params.id, req.params.version);
      if (!version) throw new NotFoundError('Skill version not found');
      return version;
    },
  );

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await ctx(req);
    const stats = await service.stats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });

  app.post('/skills/import', { schema: { body: ImportSkillBody } }, async (req) => {
    await ctx(req);
    return service.importPreview(req.body.filename, req.body.content_base64);
  });
}
