import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requestContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { createWidgetService } from './compose.js';

const CreateWidgetBody = z.object({ name: z.string().min(1) });

/** widgets — HTTP (ring 4). Wiring once; handlers: context → one service call. */
export default async function widgetsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const ctx = requestContext(app.container.auth);
  const service = createWidgetService(app.container, app.log);

  app.get('/widgets', async (req) => service.list((await ctx(req)).workspaceId));

  app.get('/widgets/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await ctx(req);
    return service.get(workspaceId, req.params.id);
  });

  app.post('/widgets', { schema: { body: CreateWidgetBody } }, async (req, reply) => {
    const { workspaceId } = await ctx(req);
    reply.status(201);
    return service.create(workspaceId, req.body.name);
  });
}
