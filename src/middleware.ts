import { defineMiddleware } from 'astro:middleware';
import { auth } from './lib/auth';
import { rateLimit } from './lib/rateLimit';
import { jsonError } from './lib/http';

// '/api/cron' se autentica por su cuenta con CRON_SECRET (Bearer), no por sesión.
// '/api/payments/webhook' se autentica con la firma HMAC de Mercado Pago
// (x-signature) — MP lo llama server-to-server, sin nuestra cookie de sesión.
const publicRoutes = ['/', '/login', '/api/auth', '/api/cron', '/api/payments/webhook'];

function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );
}

function addSecurityHeaders(response: Response): Response {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Nota: 'unsafe-inline' en script-src es necesario para los scripts inline de
  // hidratación de Astro y el script de tema. Las demás directivas se endurecen.
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Rate limit write endpoints: 60 requests per minute per IP
  const writeMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  if (pathname.startsWith('/api/') && writeMethods.includes(context.request.method)) {
    const ip = context.request.headers.get('x-forwarded-for')
      ?? context.request.headers.get('cf-connecting-ip')
      ?? 'unknown';
    if (!(await rateLimit(`write:${ip}`, 60, 60 * 1000))) {
      return jsonError(429, 'Demasiadas solicitudes. Espera un momento.', { 'Retry-After': '60' });
    }
  }

  // Rate limit auth endpoints (sign-in, sign-up): 10 requests per minute per IP
  if (pathname.startsWith('/api/auth/sign-in') || pathname.startsWith('/api/auth/sign-up')) {
    const ip = context.request.headers.get('x-forwarded-for')
      ?? context.request.headers.get('cf-connecting-ip')
      ?? 'unknown';
    const key = `auth:${ip}`;
    if (!(await rateLimit(key, 10, 60 * 1000))) {
      return jsonError(429, 'Demasiados intentos. Intenta en un minuto.', { 'Retry-After': '60' });
    }
  }

  // Allow public routes
  if (isPublicRoute(pathname)) {
    try {
      const session = await auth.api.getSession({
        headers: context.request.headers,
      });
      if (session) {
        context.locals.user = session.user as any;
        context.locals.session = session.session as any;
      }
    } catch {
      // Ignore auth errors on public routes
    }
    return addSecurityHeaders(await next());
  }

  // Protected routes: require authentication
  try {
    const session = await auth.api.getSession({
      headers: context.request.headers,
    });

    if (!session) {
      if (pathname.startsWith('/api/')) {
        return jsonError(401, 'No autorizado');
      }
      return context.redirect('/login');
    }

    // Bloquear cuentas desactivadas (solo cuando es explícitamente false).
    if ((session.user as any).isActive === false) {
      if (pathname.startsWith('/api/')) {
        return jsonError(403, 'Cuenta desactivada');
      }
      return context.redirect('/login?inactiva=1');
    }

    context.locals.user = session.user as any;
    context.locals.session = session.session as any;
  } catch {
    if (pathname.startsWith('/api/')) {
      return jsonError(500, 'Error de autenticacion');
    }
    return context.redirect('/login');
  }

  return addSecurityHeaders(await next());
});
