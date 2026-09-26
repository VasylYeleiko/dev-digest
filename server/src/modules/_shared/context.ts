import type { FastifyRequest } from 'fastify';
import type { AuthProvider } from '@devdigest/shared';

export interface RequestContext {
  workspaceId: string;
  userId: string;
}

export type RequestContextResolver = (req: FastifyRequest) => Promise<RequestContext>;

/**
 * Build the per-request tenancy resolver from the AuthProvider port. A module's
 * routes plugin creates it once while wiring (`requestContext(app.container.auth)`),
 * and every handler calls it first — so workspace scoping is never forgotten
 * and handlers never reach into the container. In the MVP
 * (LocalNoAuthProvider) it always yields the default workspace + system user.
 */
export function requestContext(auth: AuthProvider): RequestContextResolver {
  return async (req) => {
    const [user, workspace] = await Promise.all([
      auth.currentUser(req),
      auth.currentWorkspace(req),
    ]);
    return { workspaceId: workspace.id, userId: user.id };
  };
}
