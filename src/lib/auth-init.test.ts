import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * El build de Astro prerenderiza `/sin-conexion`, una página pública, y para
 * hacerlo carga el middleware, que importa este módulo. Mientras la
 * instancia de better-auth se construía al importar, compilar exigía el
 * secreto de sesión y la cadena de base de datos — secretos de ejecución
 * pedidos en tiempo de compilación. Estas pruebas fijan que la construcción
 * ocurre al usarla, no al importarla.
 */
interface AuthConfig { baseURL: string; trustedOrigins: string[] }

const mocks = vi.hoisted(() => ({
  // La firma se declara para poder inspeccionar la configuración con la
  // que se construyó, que es lo que estas pruebas comprueban.
  betterAuth: vi.fn((_config: { baseURL: string; trustedOrigins: string[] }) => ({ api: {}, handler: vi.fn(), $Infer: {} })),
}));

vi.mock('better-auth', () => ({ betterAuth: mocks.betterAuth }));
vi.mock('better-auth/adapters/drizzle', () => ({ drizzleAdapter: vi.fn(() => ({})) }));
vi.mock('../db', () => ({ db: {} }));

afterEach(() => { vi.unstubAllEnvs(); });

describe('Inicialización diferida de la autenticación', () => {
  it('importar el módulo no construye la instancia', async () => {
    vi.resetModules();
    mocks.betterAuth.mockClear();
    await import('./auth');
    expect(mocks.betterAuth).not.toHaveBeenCalled();
  });

  it('se construye en el primer uso y se reutiliza después', async () => {
    vi.resetModules();
    mocks.betterAuth.mockClear();
    const { getAuth } = await import('./auth');
    const first = getAuth();
    const second = getAuth();
    expect(mocks.betterAuth).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('lee el entorno al construir, no al importar', async () => {
    // En Vercel el entorno de compilación y el de ejecución no son el
    // mismo: leer las variables al importar congelaba los valores del build.
    vi.resetModules();
    mocks.betterAuth.mockClear();
    const { getAuth } = await import('./auth');
    vi.stubEnv('BETTER_AUTH_URL', 'https://alma.example.cl');
    getAuth();
    expect(mocks.betterAuth.mock.calls[0]?.[0]).toMatchObject({ baseURL: 'https://alma.example.cl' });
  });

  it('confía en los orígenes declarados además de la URL base', async () => {
    vi.resetModules();
    mocks.betterAuth.mockClear();
    const { getAuth } = await import('./auth');
    vi.stubEnv('BETTER_AUTH_URL', 'https://alma.example.cl');
    vi.stubEnv('BETTER_AUTH_TRUSTED_ORIGINS', 'https://preview.example.cl, https://otro.example.cl');
    getAuth();
    const config = mocks.betterAuth.mock.calls[0]?.[0] as AuthConfig;
    expect(config.trustedOrigins).toContain('https://alma.example.cl');
    expect(config.trustedOrigins).toContain('https://preview.example.cl');
    expect(config.trustedOrigins).toContain('https://otro.example.cl');
  });
});
