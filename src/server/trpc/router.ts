import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Rejects unless the resolved session is valid -- checked once here, not
 * opted into per procedure (the `origin-guard.ts` lesson, design D-A). The
 * mandatory-rotation gate (D3-F: reject every `adminProcedure` action except
 * `admin.rotarContrasena`/`admin.cerrarSesion` while `debe_rotar_contrasena`
 * is true) is Phase 4's addition on top of this same middleware.
 */
export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.sesion.estado !== 'valido') {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next();
});
