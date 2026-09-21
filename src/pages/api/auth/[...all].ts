import type { APIRoute } from 'astro';
import { getAuth } from '../../../lib/auth';

export const ALL: APIRoute = async (ctx) => {
  return getAuth().handler(ctx.request);
};
